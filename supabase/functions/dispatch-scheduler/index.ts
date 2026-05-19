/**
 * dispatch-scheduler — ETAPA 8
 *
 * Função leve acionada por pg_cron (ou outro agendador externo) a cada minuto.
 * Valida o cron-secret e delega o processamento real ao action
 * `run_scheduler_tick` do billing-automation.
 *
 * Segurança: requer header `x-cron-secret` igual a BILLING_CRON_SECRET.
 * verify_jwt = false (não precisa de usuário Supabase — autenticado via segredo).
 */

import { corsHeaders } from '../_shared/runtime.ts';

const SCHEDULER_VERSION = 'etapa8-v1';
// Tempo limite para a chamada ao billing-automation (ms)
const TICK_TIMEOUT_MS = 90_000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const tickStart = Date.now();
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

  // ── 1. Validação do cron secret ─────────────────────────────────────────────
  const cronSecret = req.headers.get('x-cron-secret') || '';
  const expectedSecret = Deno.env.get('BILLING_CRON_SECRET') || '';

  if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
    console.warn('[dispatch-scheduler] acesso negado: cron secret invalido', { request_id: requestId });
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 2. Encaminha para billing-automation run_scheduler_tick ─────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[dispatch-scheduler] env vars ausentes', { request_id: requestId });
    return new Response(JSON.stringify({ ok: false, error: 'Variaveis de ambiente ausentes.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TICK_TIMEOUT_MS);

    let tickData: Record<string, unknown> = {};
    let tickOk = false;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/billing-automation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': cronSecret,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'x-request-id': requestId,
        },
        body: JSON.stringify({ action: 'run_scheduler_tick' }),
        signal: controller.signal,
      });

      tickData = await response.json();
      tickOk = response.ok && (tickData?.ok === true || tickData?.success === true);
    } finally {
      clearTimeout(timeoutId);
    }

    const durationMs = Date.now() - tickStart;

    console.log('[dispatch-scheduler] tick concluido', {
      request_id: requestId,
      ok: tickOk,
      duration_ms: durationMs,
      jobs_processed: tickData?.jobs_processed ?? 0,
      batches_run: tickData?.batches_run ?? 0,
      stale_recovered: tickData?.stale_recovered ?? 0,
    });

    return new Response(
      JSON.stringify({
        ok: tickOk,
        scheduler_version: SCHEDULER_VERSION,
        request_id: requestId,
        duration_ms: durationMs,
        ...tickData,
      }),
      {
        status: tickOk ? 200 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const durationMs = Date.now() - tickStart;
    const message = error instanceof Error ? error.message : String(error);

    console.error('[dispatch-scheduler] erro no tick', {
      request_id: requestId,
      error: message,
      duration_ms: durationMs,
    });

    return new Response(
      JSON.stringify({
        ok: false,
        scheduler_version: SCHEDULER_VERSION,
        request_id: requestId,
        error: message,
        duration_ms: durationMs,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
