import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRequestContext, errorResponse, logRuntime, withTimeout } from '../_shared/runtime.ts';

type AdminClient = ReturnType<typeof createClient>;

interface CompanyIntegrationRow {
  company_id: string;
  provider: string;
  instance_id: string | null;
  token: string | null;
  client_token: string | null;
  phone_number: string | null;
  connected: boolean | null;
}

interface WhatsappChargeRow {
  id: string;
  empresa_id: string | null;
  company_id: string | null;
  registro_id: string | null;
  telefone: string | null;
  provider: string | null;
  provider_message_id: string | null;
  status: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string | null;
  webhook_status: string | null;
  provider_tracking_status: string | null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeStatus(value: string | null | undefined) {
  const status = normalizeText(value).toUpperCase();

  if (status === 'SENT') return 'sent';
  if (status === 'RECEIVED') return 'delivered';
  if (status === 'READ') return 'read';
  if (status === 'READ_BY_ME') return 'read';
  if (status === 'PLAYED') return 'read';
  if (status === 'FAILED') return 'failed';
  if (status === 'DELIVERED') return 'delivered';
  if (status === 'QUEUED') return 'queued';

  return normalizeText(value) || 'queued';
}

function isUnsupportedStatusLookupResponse(data: Record<string, unknown>) {
  const errorCode = String(data?.error || '').trim().toUpperCase();
  const message = String(data?.message || '').trim().toLowerCase();
  return errorCode === 'NOT_FOUND' && message.includes('unable to find matching target resource method');
}

function normalizePhone(raw: string | null | undefined) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

async function getAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase admin nao configurado.');
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

async function safeInsertAudit(
  supabaseAdmin: AdminClient,
  payload: Record<string, unknown>,
) {
  try {
    await supabaseAdmin.from('audit_logs').insert(payload);
  } catch (error) {
    console.warn('[sync-whatsapp-status] audit warning', error instanceof Error ? error.message : error);
  }
}

async function getCompanyIntegration(
  supabaseAdmin: AdminClient,
  companyId: string,
) {
  const { data, error } = await supabaseAdmin
    .from('company_integrations')
    .select('company_id, provider, instance_id, token, client_token, phone_number, connected')
    .eq('company_id', companyId)
    .eq('provider', 'zapi')
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data || null) as CompanyIntegrationRow | null;
}

async function getPlatformIntegration(supabaseAdmin: AdminClient) {
  const { data, error } = await supabaseAdmin
    .from('platform_integrations')
    .select('provider, instance_id, token, client_token, phone_number, connected')
    .eq('provider', 'zapi')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data || null) as Partial<CompanyIntegrationRow> | null;
}

function resolveZapiConfig(integration: CompanyIntegrationRow | null, companyId: string) {
  const instanceId = String(integration?.instance_id || '').trim();
  const token = String(integration?.token || '').trim();
  const clientToken = String(integration?.client_token || '').trim();

  if (!instanceId || !token || !clientToken) {
    throw new Error(`Empresa ${companyId} sem integracao Z-API configurada.`);
  }

  return {
    instanceId,
    token,
    clientToken,
  };
}

async function resolveGlobalFirstZapiConfig(
  supabaseAdmin: AdminClient,
  companyId: string,
) {
  const platform = await getPlatformIntegration(supabaseAdmin);
  const platformInstanceId = String(platform?.instance_id || '').trim();
  const platformToken = String(platform?.token || '').trim();
  const platformClientToken = String(platform?.client_token || '').trim();

  if (platformInstanceId && platformToken && platformClientToken) {
    return {
      instanceId: platformInstanceId,
      token: platformToken,
      clientToken: platformClientToken,
    };
  }

  const integration = await getCompanyIntegration(supabaseAdmin, companyId);
  return resolveZapiConfig(integration, companyId);
}

function buildStatusCandidates(instanceId: string, token: string, providerMessageId: string) {
  const endpointOverride = String(Deno.env.get('ZAPI_MESSAGE_STATUS_ENDPOINT') || '').trim();

  if (endpointOverride) {
    return [
      {
        method: 'POST',
        url: endpointOverride
          .replaceAll('{instanceId}', instanceId)
          .replaceAll('{token}', token)
          .replaceAll('{messageId}', providerMessageId),
        body: { messageId: providerMessageId },
      },
    ];
  }

  return [
    {
      method: 'POST',
      url: `https://api.z-api.io/instances/${instanceId}/token/${token}/message-status`,
      body: { messageId: providerMessageId },
    },
    {
      method: 'POST',
      url: `https://api.z-api.io/instances/${instanceId}/token/${token}/message-status`,
      body: { id: providerMessageId },
    },
    {
      method: 'GET',
      url: `https://api.z-api.io/instances/${instanceId}/token/${token}/message-status/${providerMessageId}`,
      body: null,
    },
  ];
}

async function fetchMessageStatusFromZapi(config: {
  instanceId: string;
  token: string;
  clientToken: string;
}, charge: WhatsappChargeRow) {
  const providerMessageId = String(charge.provider_message_id || '').trim();
  const phone = normalizePhone(charge.telefone);
  const candidates = buildStatusCandidates(config.instanceId, config.token, providerMessageId);

  let lastError = 'Nenhuma resposta valida da Z-API.';

  for (const candidate of candidates) {
    try {
      const response = await withTimeout(
        (signal) =>
          fetch(candidate.url, {
            method: candidate.method,
            signal,
            headers: {
              'Client-Token': config.clientToken,
              'Content-Type': 'application/json',
            },
            body: candidate.body
              ? JSON.stringify({
                  ...candidate.body,
                  ...(phone ? { phone } : {}),
                })
              : undefined,
          }),
        12000,
        'Tempo limite excedido ao consultar status na Z-API.',
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        lastError = `Z-API erro ${response.status}: ${JSON.stringify(data)}`;
        continue;
      }

      if (isUnsupportedStatusLookupResponse(data as Record<string, unknown>)) {
        lastError = 'STATUS_LOOKUP_UNSUPPORTED';
        continue;
      }

      return data as Record<string, unknown>;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}

function resolveStatusFromResponse(data: Record<string, unknown>) {
  const rawStatus = String(
    data?.status ||
    data?.messageStatus ||
    data?.deliveryStatus ||
    data?.state ||
    '',
  ).trim();

  if (!rawStatus) return null;
  return normalizeStatus(rawStatus);
}

async function fetchPendingCharges(supabaseAdmin: AdminClient) {
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('cobrancas_whatsapp')
    .select('id, empresa_id, company_id, registro_id, telefone, provider, provider_message_id, status, sent_at, delivered_at, read_at, failed_at, failure_reason, created_at, webhook_status, provider_tracking_status')
    .eq('provider', 'zapi')
    .in('status', ['sent', 'sent_pending_provider_id', 'queued', 'delivered'])
    .not('provider_message_id', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return (data || []) as WhatsappChargeRow[];
}

function buildUpdatePayload(
  current: WhatsappChargeRow,
  nextStatus: string,
  raw: Record<string, unknown>,
) {
  const now = new Date().toISOString();
  const failureReason = String(raw?.failure_reason || raw?.reason || raw?.error || raw?.message || '').trim();

  const payload: Record<string, unknown> = {
    status: nextStatus,
    provider_tracking_status: nextStatus === 'failed' ? 'fallback_indisponivel' : 'resolved',
    webhook_status: ['delivered', 'read'].includes(nextStatus) ? 'recebido' : 'aguardando_evento',
    failure_reason: nextStatus === 'failed' ? (failureReason || current.failure_reason || 'Falha retornada pela Z-API.') : null,
  };

  if (nextStatus === 'sent') {
    payload.sent_at = current.sent_at || now;
  }

  if (nextStatus === 'delivered') {
    payload.sent_at = current.sent_at || now;
    payload.delivered_at = current.delivered_at || now;
  }

  if (nextStatus === 'read') {
    payload.sent_at = current.sent_at || now;
    payload.delivered_at = current.delivered_at || current.sent_at || now;
    payload.read_at = current.read_at || now;
  }

  if (nextStatus === 'failed') {
    payload.failed_at = current.failed_at || now;
  }

  return payload;
}

async function syncStatuses() {
  console.log('[SYNC STATUS START]');

  const supabaseAdmin = await getAdminClient();
  const charges = await fetchPendingCharges(supabaseAdmin);
  let updated = 0;
  let checked = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const charge of charges) {
    checked += 1;
    const companyId = String(charge.company_id || charge.empresa_id || '').trim();

    try {
      if (!companyId) {
        throw new Error('company_id ausente na cobranca.');
      }

      const config = await resolveGlobalFirstZapiConfig(supabaseAdmin, companyId);

      console.log('[SYNC STATUS CHECK]', {
        charge_id: charge.id,
        company_id: companyId,
        provider_message_id: charge.provider_message_id,
        current_status: charge.status,
      });

      const zapiResponse = await fetchMessageStatusFromZapi(config, charge);
      const nextStatus = resolveStatusFromResponse(zapiResponse);
      if (!nextStatus) {
        errors.push({ id: charge.id, error: 'STATUS_NOT_RESOLVED' });
        console.warn('[SYNC STATUS SKIP]', {
          charge_id: charge.id,
          provider_message_id: charge.provider_message_id,
          reason: 'STATUS_NOT_RESOLVED',
        });
        continue;
      }
      const patch = buildUpdatePayload(charge, nextStatus, zapiResponse);

      const { error } = await supabaseAdmin
        .from('cobrancas_whatsapp')
        .update(patch)
        .eq('id', charge.id);

      if (error) throw new Error(error.message);

      updated += 1;

      console.log('[SYNC STATUS UPDATE]', {
        charge_id: charge.id,
        provider_message_id: charge.provider_message_id,
        previous_status: charge.status,
        next_status: nextStatus,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'STATUS_LOOKUP_UNSUPPORTED' && charge.webhook_status !== 'fallback_indisponivel') {
        const restoredStatus = charge.status === 'queued' && charge.sent_at && !charge.delivered_at && !charge.read_at && !charge.failed_at
          ? 'sent'
          : charge.status;
        await supabaseAdmin
          .from('cobrancas_whatsapp')
          .update({
            status: restoredStatus,
            provider_tracking_status: 'fallback_indisponivel',
            webhook_status: 'fallback_indisponivel',
          })
          .eq('id', charge.id);

        await safeInsertAudit(supabaseAdmin, {
          company_id: companyId || null,
          user_id: null,
          entity: 'cobrancas_whatsapp',
          action: 'whatsapp_status_lookup_unsupported',
          metadata: {
            charge_id: charge.id,
            provider_message_id: charge.provider_message_id,
            previous_status: charge.status,
            restored_status: restoredStatus,
            webhook_status: 'fallback_indisponivel',
          },
        });
      }
      errors.push({ id: charge.id, error: message });
      console.error('[SYNC STATUS ERROR]', {
        charge_id: charge.id,
        provider_message_id: charge.provider_message_id,
        error: message,
      });
    }
  }

  return {
    success: true,
    checked,
    updated,
    errors,
    limited_to: 50,
  };
}

Deno.serve(async (req) => {
  const runtime = createRequestContext(req, { module: 'sync-whatsapp-status', action: 'sync_status' });
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const isGet = req.method === 'GET';
    const body = isGet ? {} : await req.json().catch(() => ({}));
    const action = String((body as Record<string, unknown>)?.action || 'sync_status').trim();
    runtime.action = action || 'sync_status';

    if (!['sync_status', 'sync'].includes(action)) {
      return jsonResponse({
        ok: false,
        success: false,
        error: 'Acao invalida. Use action="sync_status".',
      }, 400);
    }

    logRuntime(runtime, { metadata: { method: req.method } });
    const result = await syncStatuses();

    return jsonResponse({
      ok: true,
      action: 'sync_status',
      ...result,
    });
  } catch (error) {
    return errorResponse(runtime, error, {
      status: 500,
      code: 'SYNC_WHATSAPP_STATUS_FAILED',
    });
  }
});
