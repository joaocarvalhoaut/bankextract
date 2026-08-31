/**
 * whatsapp-status-scheduler
 *
 * Função leve chamada por pg_cron ou scheduler externo.
 * Valida o cron secret e delega a reconciliação de status para a
 * edge function sync-whatsapp-status usando service role, sem exigir JWT
 * no agendador externo.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const cronSecret = req.headers.get('x-cron-secret') || '';
  const expectedSecret = Deno.env.get('BILLING_CRON_SECRET') || Deno.env.get('CRON_SECRET') || '';
  const gatewayAdminSecret = Deno.env.get('GATEWAY_ADMIN_SECRET') || '';

  const secretOk = Boolean(
    cronSecret
    && (
      (expectedSecret && cronSecret === expectedSecret)
      || (gatewayAdminSecret && cronSecret === gatewayAdminSecret)
    ),
  );

  if (!secretOk) {
    console.warn('[whatsapp-status-scheduler] acesso negado: cron secret invalido', { request_id: requestId });
    return jsonResponse({
      ok: false,
      code: 'UNAUTHORIZED_CRON',
      error: 'Cron secret invalido.',
      request_id: requestId,
    }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[whatsapp-status-scheduler] env ausente', { request_id: requestId });
    return jsonResponse({
      ok: false,
      code: 'MISSING_ENV',
      error: 'SUPABASE_URL/SERVICE_ROLE_KEY ausentes.',
      request_id: requestId,
    }, 500);
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-whatsapp-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        action: 'sync_status',
        source: 'whatsapp-status-scheduler',
      }),
    });

    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { ok: false, raw_text: text };
    }

    console.log('[whatsapp-status-scheduler] tick concluido', {
      request_id: requestId,
      http_status: response.status,
      ok: data?.ok === true,
      updated: data?.updated ?? null,
      checked: data?.checked ?? null,
    });

    return jsonResponse({
      ok: response.ok && data?.ok === true,
      request_id: requestId,
      delegated_status: response.status,
      result: data,
    }, response.ok ? 200 : response.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[whatsapp-status-scheduler] erro no tick', {
      request_id: requestId,
      error: message,
    });
    return jsonResponse({
      ok: false,
      request_id: requestId,
      code: 'SCHEDULER_FAILED',
      error: message,
    }, 500);
  }
});
