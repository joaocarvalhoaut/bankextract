import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeWebhookStatus(value: unknown) {
  const normalized = normalizeText(value);
  if (['read', 'lida', 'seen', 'viewed'].includes(normalized)) return 'read';
  if (['delivered', 'entregue', 'delivery'].includes(normalized)) return 'delivered';
  if (['sent', 'enviado', 'send'].includes(normalized)) return 'sent';
  if (['failed', 'erro', 'error', 'falhou'].includes(normalized)) return 'failed';
  if (['queued', 'fila', 'queue'].includes(normalized)) return 'queued';
  return normalized || 'queued';
}

function firstNonEmpty(values: unknown[]) {
  for (const value of values) {
    const current = String(value || '').trim();
    if (current) return current;
  }
  return '';
}

function resolveMessageId(payload: Record<string, unknown>) {
  return firstNonEmpty([
    payload.provider_message_id,
    payload.messageId,
    payload.message_id,
    payload.zaapId,
    payload.zaap_id,
    payload.id,
    (payload.data as Record<string, unknown> | undefined)?.provider_message_id,
    (payload.data as Record<string, unknown> | undefined)?.messageId,
    (payload.data as Record<string, unknown> | undefined)?.message_id,
    (payload.data as Record<string, unknown> | undefined)?.zaapId,
    (payload.data as Record<string, unknown> | undefined)?.zaap_id,
    (payload.data as Record<string, unknown> | undefined)?.id,
  ]);
}

function resolveStatus(payload: Record<string, unknown>) {
  return normalizeWebhookStatus(
    payload.status ||
      payload.event ||
      payload.type ||
      (payload.data as Record<string, unknown> | undefined)?.status ||
      (payload.data as Record<string, unknown> | undefined)?.event ||
      (payload.data as Record<string, unknown> | undefined)?.type,
  );
}

function resolveFailureReason(payload: Record<string, unknown>) {
  return firstNonEmpty([
    payload.failure_reason,
    payload.reason,
    payload.error,
    payload.message,
    (payload.data as Record<string, unknown> | undefined)?.failure_reason,
    (payload.data as Record<string, unknown> | undefined)?.reason,
    (payload.data as Record<string, unknown> | undefined)?.error,
    (payload.data as Record<string, unknown> | undefined)?.message,
  ]);
}

function resolveEventTimestamp(payload: Record<string, unknown>) {
  const raw = firstNonEmpty([
    payload.event_at,
    payload.timestamp,
    payload.created_at,
    (payload.data as Record<string, unknown> | undefined)?.event_at,
    (payload.data as Record<string, unknown> | undefined)?.timestamp,
    (payload.data as Record<string, unknown> | undefined)?.created_at,
  ]);

  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Metodo nao permitido.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({ ok: false, error: 'Supabase admin nao configurado.' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const providerMessageId = resolveMessageId(payload);
    const status = resolveStatus(payload);
    const failureReason = resolveFailureReason(payload);
    const eventAt = resolveEventTimestamp(payload);

    console.log('[ZAPI WEBHOOK]', {
      provider_message_id: providerMessageId,
      status,
      event_at: eventAt,
      payload,
    });

    if (!providerMessageId) {
      return jsonResponse({ ok: false, error: 'provider_message_id ausente.' }, 400);
    }

    let lookup = await supabaseAdmin
      .from('cobrancas_whatsapp')
      .select('id, provider_message_id, zapi_message_id, status, sent_at, delivered_at, read_at, failed_at')
      .eq('provider_message_id', providerMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookup.error) {
      return jsonResponse({ ok: false, error: lookup.error.message }, 500);
    }

    if (!lookup.data) {
      lookup = await supabaseAdmin
        .from('cobrancas_whatsapp')
        .select('id, provider_message_id, zapi_message_id, status, sent_at, delivered_at, read_at, failed_at')
        .eq('zapi_message_id', providerMessageId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lookup.error) {
        return jsonResponse({ ok: false, error: lookup.error.message }, 500);
      }
    }

    if (!lookup.data?.id) {
      return jsonResponse({ ok: false, error: 'Mensagem nao encontrada.' }, 404);
    }

    const patch: Record<string, unknown> = {
      status,
      provider_message_id: providerMessageId,
      zapi_message_id: providerMessageId,
    };

    if (status === 'sent' || status === 'queued') {
      patch.sent_at = lookup.data.sent_at || eventAt;
    }

    if (status === 'delivered') {
      patch.delivered_at = eventAt;
      patch.sent_at = lookup.data.sent_at || eventAt;
    }

    if (status === 'read') {
      patch.read_at = eventAt;
      patch.delivered_at = lookup.data.delivered_at || eventAt;
      patch.sent_at = lookup.data.sent_at || eventAt;
    }

    if (status === 'failed') {
      patch.failed_at = eventAt;
      patch.failure_reason = failureReason || 'Falha retornada pelo provedor.';
      patch.erro = failureReason || 'Falha retornada pelo provedor.';
    }

    const { error: updateError } = await supabaseAdmin
      .from('cobrancas_whatsapp')
      .update(patch)
      .eq('id', lookup.data.id);

    if (updateError) {
      return jsonResponse({ ok: false, error: updateError.message }, 500);
    }

    return jsonResponse({
      ok: true,
      success: true,
      provider_message_id: providerMessageId,
      status,
      updated: true,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao processar webhook da Z-API.',
      },
      500,
    );
  }
});
