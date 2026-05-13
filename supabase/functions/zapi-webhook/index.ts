import { createClient } from 'jsr:@supabase/supabase-js@2';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function firstNonEmpty(values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizeStatus(value: unknown) {
  const status = String(value || '').trim().toUpperCase();

  if (status === 'SENT') return 'sent';
  if (status === 'RECEIVED') return 'delivered';
  if (status === 'READ') return 'read';
  if (status === 'READ_BY_ME') return 'read';
  if (status === 'PLAYED') return 'read';
  if (status === 'FAILED') return 'failed';

  return status ? status.toLowerCase() : 'queued';
}

Deno.serve(async (req) => {
  try {
    // ── Validação de secret (se configurado) ─────────────────────────────────
    // Configura ZAPI_WEBHOOK_SECRET no painel de secrets do Supabase.
    // A Z-API envia o token no header x-api-token ou como query param ?token=.
    const webhookSecret = Deno.env.get('ZAPI_WEBHOOK_SECRET') || '';
    if (webhookSecret) {
      const headerToken = req.headers.get('x-api-token') || req.headers.get('x-token') || '';
      const url = new URL(req.url);
      const queryToken = url.searchParams.get('token') || '';
      const receivedToken = headerToken || queryToken;
      if (receivedToken !== webhookSecret) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      }
    }

    const rawBody = await req.text();

    let body: Record<string, unknown> = {};

    try {
      body = JSON.parse(rawBody);
    } catch {
      // Invalid JSON — acknowledge silently to avoid Z-API retries
      return jsonResponse({ ok: true, received: true });
    }

    const idsEntry = Array.isArray(body?.ids) ? body.ids[0] : null;
    const providerMessageId =
      firstNonEmpty([
        body.provider_message_id,
        body.messageId,
        body.message_id,
        body.id,
        typeof idsEntry === 'object' && idsEntry !== null ? (idsEntry as Record<string, unknown>).id : null,
        typeof idsEntry === 'object' && idsEntry !== null ? (idsEntry as Record<string, unknown>).messageId : null,
        typeof idsEntry === 'string' ? idsEntry : null,
      ]);

    const status = normalizeStatus(body.status);

    if (!providerMessageId) {
      return jsonResponse({ ok: true, received: true });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({ ok: true, received: true });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status };

    if (status === 'sent') {
      patch.sent_at = now;
    } else if (status === 'delivered') {
      patch.delivered_at = now;
    } else if (status === 'read') {
      patch.read_at = now;
    } else if (status === 'failed') {
      patch.failed_at = now;
      patch.failure_reason = String(body?.type || body?.status || 'Falha retornada pela Z-API.');
      patch.erro = String(body?.type || body?.status || 'Falha retornada pela Z-API.');
    }

    // Idempotente: update por provider_message_id. Chamadas duplicadas
    // apenas re-aplicam o mesmo status no mesmo registro — sem side effects.
    await supabaseAdmin
      .from('cobrancas_whatsapp')
      .update(patch)
      .eq('provider_message_id', providerMessageId);

    return jsonResponse({ ok: true, received: true });
  } catch {
    // Não expõe detalhes do erro para o caller
    return jsonResponse({ ok: true, received: false });
  }
});
