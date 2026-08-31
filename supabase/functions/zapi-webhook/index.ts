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

function normalizeBrazilPhone(raw: unknown) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function extractWebhookPhone(body: Record<string, unknown>, idsEntry: unknown) {
  const idsRecord = typeof idsEntry === 'object' && idsEntry !== null ? idsEntry as Record<string, unknown> : {};
  return normalizeBrazilPhone(firstNonEmpty([
    body.phone,
    body.to,
    body.from,
    body.mobile,
    body.phoneNumber,
    body.chatId,
    body.chatLid,
    idsRecord.phone,
    idsRecord.to,
    idsRecord.from,
  ]));
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

async function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    || Deno.env.get('SERVICE_ROLE_KEY')
    || '';
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

async function loadAcceptedWebhookTokens() {
  const accepted = new Set<string>();
  const webhookSecret = String(Deno.env.get('ZAPI_WEBHOOK_SECRET') || '').trim();
  if (webhookSecret) accepted.add(webhookSecret);
  const envClientToken = String(Deno.env.get('ZAPI_CLIENT_TOKEN') || '').trim();
  if (envClientToken) accepted.add(envClientToken);

  const supabaseAdmin = await getSupabaseAdmin();
  if (!supabaseAdmin) return accepted;

  const [{ data: platformData }, { data: companyRows }] = await Promise.all([
    supabaseAdmin
      .from('platform_integrations')
      .select('client_token')
      .eq('provider', 'zapi')
      .maybeSingle(),
    supabaseAdmin
      .from('company_integrations')
      .select('client_token')
      .eq('provider', 'zapi')
      .limit(50),
  ]);

  const platformToken = String(platformData?.client_token || '').trim();
  if (platformToken) accepted.add(platformToken);

  for (const row of companyRows || []) {
    const token = String(row?.client_token || '').trim();
    if (token) accepted.add(token);
  }

  return accepted;
}

Deno.serve(async (req) => {
  try {
    const headerToken = req.headers.get('x-api-token')
      || req.headers.get('x-token')
      || req.headers.get('client-token')
      || req.headers.get('client_token')
      || '';
    const url = new URL(req.url);
    const queryToken = url.searchParams.get('token') || '';
    const receivedToken = String(headerToken || queryToken || '').trim();

    const acceptedTokens = await loadAcceptedWebhookTokens();
    if (acceptedTokens.size > 0 && (!receivedToken || !acceptedTokens.has(receivedToken))) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
    }

    const rawBody = await req.text();

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ ok: true, received: true });
    }

    const idsEntry = Array.isArray(body?.ids) ? body.ids[0] : null;
    const providerMessageId = firstNonEmpty([
      body.provider_message_id,
      body.messageId,
      body.message_id,
      body.id,
      typeof idsEntry === 'object' && idsEntry !== null ? (idsEntry as Record<string, unknown>).id : null,
      typeof idsEntry === 'object' && idsEntry !== null ? (idsEntry as Record<string, unknown>).messageId : null,
      typeof idsEntry === 'string' ? idsEntry : null,
    ]);
    const normalizedPhone = extractWebhookPhone(body, idsEntry);
    const status = normalizeStatus(body.status);

    if (!providerMessageId) {
      return jsonResponse({ ok: true, received: true });
    }

    const supabaseAdmin = await getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonResponse({ ok: true, received: true });
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status,
      provider_tracking_status: 'resolved',
      webhook_status: 'recebido',
      zapi_message_id: providerMessageId,
    };

    if (status === 'sent') {
      patch.sent_at = now;
    } else if (status === 'delivered') {
      patch.delivered_at = now;
    } else if (status === 'read') {
      patch.delivered_at = now;
      patch.read_at = now;
    } else if (status === 'failed') {
      patch.failed_at = now;
      patch.failure_reason = String(body?.type || body?.status || 'Falha retornada pela Z-API.');
      patch.erro = String(body?.type || body?.status || 'Falha retornada pela Z-API.');
    }

    const { data: updatedRows } = await supabaseAdmin
      .from('cobrancas_whatsapp')
      .update(patch)
      .select('id')
      .eq('provider_message_id', providerMessageId);

    if ((!updatedRows || updatedRows.length === 0) && normalizedPhone) {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: pendingRows } = await supabaseAdmin
        .from('cobrancas_whatsapp')
        .select('id')
        .eq('provider', 'zapi')
        .eq('telefone', normalizedPhone)
        .eq('status', 'sent_pending_provider_id')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(2);

      if ((pendingRows || []).length === 1) {
        await supabaseAdmin
          .from('cobrancas_whatsapp')
          .update({
            ...patch,
            provider_message_id: providerMessageId,
            zapi_message_id: providerMessageId,
            provider_tracking_status: 'resolved',
            webhook_status: 'recebido',
          })
          .eq('id', pendingRows![0].id);
      }
    }

    return jsonResponse({ ok: true, received: true });
  } catch {
    return jsonResponse({ ok: true, received: false });
  }
});
