/**
 * BankExtract Pro — Edge Function: send-whatsapp-charge
 *
 * Recebe um chargeId (id de cobrancas_whatsapp com status 'preparado'),
 * envia via Z-API (ou mock), e atualiza o status no banco.
 *
 * MODO MOCK  — ative com: ENABLE_MOCK_WHATSAPP = true
 *   Status final: 'mock_enviado'. Nao chama Z-API.
 *
 * MODO REAL  — ENABLE_MOCK_WHATSAPP ausente ou != 'true'
 *   Requer: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN.
 *   Se faltar qualquer um, retorna erro 500 com mensagem clara.
 *
 * Secrets nunca sao logados nem enviados ao frontend.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface ChargeRow {
  id: string;
  empresa_id: string;
  registro_id: string | null;
  telefone: string;
  mensagem: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

// ---------------------------------------------------------------------------
// Resolucao de modo: mock explicito ou real com validacao de secrets
// ---------------------------------------------------------------------------
type ZApiConfig =
  | { mode: 'mock' }
  | { mode: 'real'; url: string; clientToken: string }
  | { mode: 'error'; message: string };

function resolveZApiConfig(): ZApiConfig {
  const enableMock = Deno.env.get('ENABLE_MOCK_WHATSAPP');
  if (enableMock === 'true') {
    return { mode: 'mock' };
  }

  const instanceId  = Deno.env.get('ZAPI_INSTANCE_ID');
  const token       = Deno.env.get('ZAPI_TOKEN');
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

  if (!instanceId || !token || !clientToken) {
    return {
      mode: 'error',
      message:
        'Z-API nao configurada. Verifique os secrets ZAPI_INSTANCE_ID, ZAPI_TOKEN e ZAPI_CLIENT_TOKEN ' +
        'no Supabase Dashboard, ou ative o modo teste com ENABLE_MOCK_WHATSAPP=true.',
    };
  }

  return {
    mode: 'real',
    url: `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
    clientToken,
  };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Metodo nao permitido.' }, 405);
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ ok: false, error: 'Nao autorizado.' }, 401);

    const supabaseUrl     = Deno.env.get('SUPABASE_URL')             ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')        ?? '';
    const serviceKey      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Cliente autenticado com JWT do usuario (respeita RLS)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Cliente admin para operacoes privilegiadas (UPDATE status, audit_log)
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ ok: false, error: 'Usuario nao autenticado.' }, 401);
    }

    // ── Body ──────────────────────────────────────────────────────────────
    const body = await req.json() as { chargeId?: string };
    const { chargeId } = body;

    if (!chargeId) {
      return jsonResponse({ ok: false, error: 'chargeId e obrigatorio.' }, 400);
    }

    // ── Busca a cobranca pelo ID ──────────────────────────────────────────
    const { data: charge, error: fetchError } = await supabaseAdmin
      .from('cobrancas_whatsapp')
      .select('id, empresa_id, registro_id, telefone, mensagem, status')
      .eq('id', chargeId)
      .maybeSingle();

    if (fetchError || !charge) {
      return jsonResponse({ ok: false, error: 'Cobranca nao encontrada.' }, 404);
    }

    const chargeRow = charge as ChargeRow;

    // Idempotencia: se ja foi processada, retorna o estado atual
    if (chargeRow.status !== 'preparado') {
      return jsonResponse({
        ok: true,
        mocked: chargeRow.status === 'mock_enviado',
        status: chargeRow.status,
        message: 'Cobranca ja processada anteriormente.',
      });
    }

    // ── Permissao: admin geral ou membro da empresa ───────────────────────
    const { data: isAdmin } = await supabaseAdmin
      .from('system_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!isAdmin) {
      const { data: membership } = await supabaseAdmin
        .from('usuarios_empresas')
        .select('company_id')
        .eq('user_id', user.id)
        .eq('company_id', chargeRow.empresa_id)
        .maybeSingle();

      if (!membership) {
        return jsonResponse({ ok: false, error: 'Sem permissao para esta empresa.' }, 403);
      }
    }

    // ── Validacao: registro pertence a empresa ────────────────────────────
    if (chargeRow.registro_id) {
      const { data: registro } = await supabaseAdmin
        .from('registros_financeiros')
        .select('id, company_id')
        .eq('id', chargeRow.registro_id)
        .maybeSingle();

      if (registro && registro.company_id !== chargeRow.empresa_id) {
        return jsonResponse({
          ok: false,
          error: 'O registro nao pertence a empresa informada.',
        }, 403);
      }
    }

    // ── Resolucao de modo (mock x real) ───────────────────────────────────
    const zapiConfig = resolveZApiConfig();

    if (zapiConfig.mode === 'error') {
      // Marca como erro no banco antes de retornar
      await supabaseAdmin
        .from('cobrancas_whatsapp')
        .update({ status: 'erro', erro: zapiConfig.message, enviado_por: user.id })
        .eq('id', chargeId);

      return jsonResponse({ ok: false, error: zapiConfig.message }, 500);
    }

    const isMock = zapiConfig.mode === 'mock';
    const phone = normalizePhone(chargeRow.telefone);

    let success = false;
    let zapiMessageId: string | null = null;
    let errorMsg: string | null = null;

    // ── Envio: mock ou real ───────────────────────────────────────────────
    if (isMock) {
      zapiMessageId = `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      success = true;
    } else {
      const cfg = zapiConfig as { mode: 'real'; url: string; clientToken: string };
      try {
        const zapiRes = await fetch(cfg.url, {
          method: 'POST',
          headers: {
            'Client-Token': cfg.clientToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone, message: chargeRow.mensagem }),
        });

        const zapiData = await zapiRes.json() as Record<string, unknown>;

        if (zapiRes.ok && zapiData?.zaapId) {
          zapiMessageId = String(zapiData.zaapId);
          success = true;
        } else {
          errorMsg = String(zapiData?.message ?? zapiData?.error ?? `HTTP ${zapiRes.status}`);
        }
      } catch (fetchErr) {
        errorMsg = fetchErr instanceof Error ? fetchErr.message : 'Erro de rede ao contatar Z-API.';
      }
    }

    // ── Atualiza status da cobranca no banco ──────────────────────────────
    const finalStatus = isMock ? 'mock_enviado' : (success ? 'enviado' : 'erro');

    await supabaseAdmin
      .from('cobrancas_whatsapp')
      .update({
        status: finalStatus,
        zapi_message_id: zapiMessageId,
        erro: errorMsg,
        enviado_por: user.id,
      })
      .eq('id', chargeId);

    // ── Audit log ─────────────────────────────────────────────────────────
    await supabaseAdmin.from('audit_logs').insert({
      company_id: chargeRow.empresa_id,
      action: isMock ? 'whatsapp_mock_sent' : 'whatsapp_charges_sent',
      entity: 'cobrancas_whatsapp',
      metadata: {
        charge_id: chargeId,
        registro_id: chargeRow.registro_id,
        status: finalStatus,
        mocked: isMock,
        enviado_por: user.id,
      },
    }).then(() => {}).catch(() => {}); // silencioso

    return jsonResponse({
      ok: success || isMock,
      mocked: isMock,
      status: finalStatus,
      charge_id: chargeId,
      ...(zapiMessageId ? { zapi_message_id: zapiMessageId } : {}),
      ...(errorMsg      ? { error: errorMsg }                 : {}),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno na Edge Function.';
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
