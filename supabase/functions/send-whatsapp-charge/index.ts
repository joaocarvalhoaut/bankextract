// ─────────────────────────────────────────────────────────────────────────────
// DEPRECIADA — NÃO USAR PARA NOVOS DESENVOLVIMENTOS
//
// Pipeline oficial de envio: billing-automation (action: send_real)
// Esta edge function está mantida apenas para:
//   • compatibilidade com integrações externas legadas (webhooks, cron externos)
//   • rollback de emergência
//
// O frontend não deve invocar esta função diretamente.
// Remover após confirmação de 30 dias sem tráfego nos logs do Supabase.
//
// Idempotência e concorrência:
//   • automation_dispatches: registra uma única operação efetiva por chave
//     (company_id + customer_id + due_date + template). Envios duplicados
//     dentro da janela de idempotência são rejeitados e não geram cobrança.
//   • logs_cobranca: o registro duplicado é inserido com status "ignorado"
//     para auditoria, permitindo rastrear tentativas sem afetar o contador
//     de cobranças enviadas.
//   • Dois usuários da mesma empresa que dispararem o envio simultaneamente
//     para o mesmo título receberão resultado divergente: o primeiro sucede,
//     o segundo retorna ok=false com duplicate=true.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  corsHeaders,
  createRequestContext,
  errorResponse,
  logRuntime,
  requireAuthenticatedUser,
  successResponse,
  withRetry,
  withTimeout,
  sha256Hex,
} from '../_shared/runtime.ts';

type AdminClient = ReturnType<typeof createClient>;

interface ChargeInput {
  registro_id: string;
  telefone?: string | null;
  mensagem?: string | null;
  customer_id?: string | null;
  numero_boleto?: string | null;
  documento?: string | null;
  due_date?: string | null;
  amount?: number | null;
  template?: string | null;
}

interface FinancialRow {
  id: string;
  company_id: string;
  nome: string | null;
  cliente_nome: string | null;
  cliente_numero: string | null;
  telefone: string | null;
  documento: string | null;
  numero_boleto: string | null;
  numero_nf: string | null;
  valor: number | null;
  data_vencimento: string | null;
  drive_file_id: string | null;
  boleto_url: string | null;
  boleto_match_confidence: number | null;
  boleto_match_strategy: string | null;
}

interface ChargeResult {
  registro_id: string;
  ok: boolean;
  mocked: boolean;
  charge_id: string;
  customer_id: string | null;
  request_id: string;
  retry_count: number;
  zapi_status: string;
  pdf_found: boolean;
  pdf_sent: boolean;
  drive_file_id?: string | null;
  provider_message_id?: string | null;
  warning?: string | null;
  duplicate?: boolean;
  error?: string;
}

type ZapiConfig =
  | { mode: 'mock'; source: 'mock' }
  | { mode: 'real'; source: 'company' | 'global'; instanceId: string; token: string; clientToken: string };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizePhone(raw: string | null | undefined) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) {
    return digits.length >= 12 && digits.length <= 13 ? digits : '';
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return '';
}

function validatePhone(phone: string) {
  return /^55\d{10,11}$/.test(phone);
}

function extractDriveFileId(url: string | null | undefined) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

function getProviderMessageId(payload: Record<string, unknown> | null | undefined) {
  return String(
    payload?.messageId ||
    payload?.message_id ||
    payload?.id ||
    payload?.zaapId ||
    ((payload?.response as Record<string, unknown> | undefined)?.messageId) ||
    '',
  ).trim() || null;
}

function getGoogleClientEmail() {
  return String(Deno.env.get('GOOGLE_CLIENT_EMAIL') || '').trim();
}

function getGooglePrivateKey() {
  return String(Deno.env.get('GOOGLE_PRIVATE_KEY') || '').replace(/\\n/g, '\n').trim();
}

async function getGoogleAccessToken() {
  const clientEmail = getGoogleClientEmail();
  const privateKey = getGooglePrivateKey();

  if (!clientEmail || !privateKey) {
    throw new Error('Google API nao configurada.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const pemBody = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');

  const binaryDer = Uint8Array.from(atob(pemBody), (char) => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const tokenRes = await withTimeout(
    (signal) =>
      fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: `${signingInput}.${signatureB64}`,
        }),
      }),
    12000,
    'Tempo limite excedido ao autenticar no Google Drive.',
  );

  if (!tokenRes.ok) {
    throw new Error(`Falha ao autenticar Google Drive: ${await tokenRes.text()}`);
  }

  const tokenData = await tokenRes.json().catch(() => ({}));
  return String(tokenData?.access_token || '').trim();
}

async function downloadDriveFileBase64(token: string, fileId: string) {
  const response = await withTimeout(
    (signal) =>
      fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
    15000,
    'Tempo limite excedido ao baixar PDF do Google Drive.',
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function assertCompanyAccess(supabaseAdmin: AdminClient, userId: string, companyId: string) {
  const { data: adminRow, error: adminError } = await supabaseAdmin
    .from('system_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (adminError) {
    throw new Error(adminError.message || 'Falha ao validar administrador geral.');
  }

  if (adminRow?.user_id) {
    return true;
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('usuarios_empresas')
    .select('company_id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message || 'Falha ao validar acesso da empresa.');
  }

  if (!membership?.company_id) {
    throw new Error('Sem permissao para esta empresa.');
  }

  return true;
}

async function resolveZapiConfig(supabaseAdmin: AdminClient, companyId: string): Promise<ZapiConfig> {
  if (String(Deno.env.get('ENABLE_MOCK_WHATSAPP') || '').trim() === 'true') {
    return { mode: 'mock', source: 'mock' };
  }

  const { data: platformData, error: platformError } = await supabaseAdmin
    .from('platform_integrations')
    .select('instance_id, token, client_token, connected')
    .eq('provider', 'zapi')
    .maybeSingle();

  if (platformError) {
    throw new Error(platformError.message || 'Falha ao carregar o gateway WhatsApp global.');
  }

  const platformInstanceId = String(platformData?.instance_id || '').trim();
  const platformToken = String(platformData?.token || '').trim();
  const platformClientToken = String(platformData?.client_token || '').trim();

  if (platformInstanceId && platformToken && platformClientToken) {
    return {
      mode: 'real',
      source: 'global',
      instanceId: platformInstanceId,
      token: platformToken,
      clientToken: platformClientToken,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('company_integrations')
    .select('instance_id, token, client_token, connected')
    .eq('company_id', companyId)
    .eq('provider', 'zapi')
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Falha ao carregar integracao Z-API da empresa.');
  }

  const companyInstanceId = String(data?.instance_id || '').trim();
  const companyToken = String(data?.token || '').trim();
  const companyClientToken = String(data?.client_token || '').trim();

  if (companyInstanceId && companyToken && companyClientToken) {
    return {
      mode: 'real',
      source: 'company',
      instanceId: companyInstanceId,
      token: companyToken,
      clientToken: companyClientToken,
    };
  }

  const globalInstanceId = String(Deno.env.get('ZAPI_INSTANCE_ID') || '').trim();
  const globalToken = String(Deno.env.get('ZAPI_TOKEN') || '').trim();
  const globalClientToken = String(Deno.env.get('ZAPI_CLIENT_TOKEN') || '').trim();

  if (globalInstanceId && globalToken && globalClientToken) {
    return {
      mode: 'real',
      source: 'global',
      instanceId: globalInstanceId,
      token: globalToken,
      clientToken: globalClientToken,
    };
  }

  throw new Error('Z-API nao configurada para esta empresa e nenhum fallback global esta disponivel.');
}

async function sendZapiText(
  ctx: ReturnType<typeof createRequestContext>,
  config: Extract<ZapiConfig, { mode: 'real' }>,
  phone: string,
  message: string,
) {
  let attemptCounter = 0;
  return await withRetry(
    ctx,
    async (attempt) => {
      attemptCounter = attempt;
      const response = await withTimeout(
        (signal) =>
          fetch(
            `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/send-text`,
            {
              method: 'POST',
              signal,
              headers: {
                'Client-Token': config.clientToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ phone, message }),
            },
          ),
        15000,
        'Tempo limite excedido ao enviar mensagem pela Z-API.',
      );

      const data = await response.json().catch(() => ({}));
      const providerMessageId = getProviderMessageId(data);

      if (!response.ok || !providerMessageId) {
        throw new Error(
          response.ok
            ? 'Z-API respondeu sem identificador de mensagem.'
            : `Z-API erro ${response.status}: ${JSON.stringify(data)}`,
        );
      }

      return {
        data,
        providerMessageId,
        attemptCounter,
        zapiStatus: String(response.status),
      };
    },
    { attempts: 2, baseDelayMs: 700 },
  );
}

async function sendZapiDocument(
  ctx: ReturnType<typeof createRequestContext>,
  config: Extract<ZapiConfig, { mode: 'real' }>,
  phone: string,
  caption: string,
  fileName: string,
  base64: string,
) {
  const documentEndpoint =
    String(Deno.env.get('ZAPI_DOCUMENT_ENDPOINT') || '').trim() ||
    `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/send-document/pdf`;

  let attemptCounter = 0;
  return await withRetry(
    ctx,
    async (attempt) => {
      attemptCounter = attempt;
      const response = await withTimeout(
        (signal) =>
          fetch(documentEndpoint, {
            method: 'POST',
            signal,
            headers: {
              'Client-Token': config.clientToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phone,
              fileName,
              caption,
              document: `data:application/pdf;base64,${base64}`,
            }),
          }),
        20000,
        'Tempo limite excedido ao enviar PDF pela Z-API.',
      );

      const data = await response.json().catch(() => ({}));
      const providerMessageId = getProviderMessageId(data);

      if (!response.ok || !providerMessageId) {
        throw new Error(
          response.ok
            ? 'Z-API respondeu sem identificador ao enviar PDF.'
            : `Z-API erro ${response.status}: ${JSON.stringify(data)}`,
        );
      }

      return {
        data,
        providerMessageId,
        attemptCounter,
        zapiStatus: String(response.status),
      };
    },
    { attempts: 2, baseDelayMs: 700 },
  );
}

async function safeInsertAudit(
  supabaseAdmin: AdminClient,
  payload: Record<string, unknown>,
) {
  try {
    await supabaseAdmin.from('audit_logs').insert(payload);
  } catch (error) {
    console.warn('[send-whatsapp-charge] audit warning', error instanceof Error ? error.message : error);
  }
}

async function insertWhatsappTracking(
  supabaseAdmin: AdminClient,
  payload: Record<string, unknown>,
) {
  const status = String(payload.status || '').trim().toLowerCase();
  const providerMessageId = String(payload.provider_message_id || payload.zapi_message_id || '').trim();
  const providerTrackingStatus = String(payload.provider_tracking_status || '').trim()
    || (providerMessageId ? 'resolved' : 'pending_webhook');
  const webhookStatus = String(payload.webhook_status || '').trim()
    || (
      ['delivered', 'read'].includes(status)
        ? 'recebido'
        : providerTrackingStatus === 'fallback_indisponivel'
          ? 'fallback_indisponivel'
          : 'aguardando_evento'
    );

  const { error } = await supabaseAdmin.from('cobrancas_whatsapp').insert({
    ...payload,
    provider_tracking_status: providerTrackingStatus,
    webhook_status: webhookStatus,
  });
  if (error) throw new Error(error.message || 'Falha ao registrar tracking WhatsApp.');
}

async function safeInsertWhatsappTracking(
  supabaseAdmin: AdminClient,
  payload: Record<string, unknown>,
) {
  try {
    await insertWhatsappTracking(supabaseAdmin, payload);
  } catch (error) {
    console.warn('[send-whatsapp-charge] tracking warning', error instanceof Error ? error.message : error);
  }
}

async function findRecentCharge(
  supabaseAdmin: AdminClient,
  companyId: string,
  registroId: string,
) {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('cobrancas_whatsapp')
    .select('id, status, provider_message_id, created_at')
    .eq('empresa_id', companyId)
    .eq('registro_id', registroId)
    .in('status', ['queued', 'sent', 'sent_pending_provider_id', 'delivered', 'read', 'enviado'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Falha ao verificar duplicidade recente.');
  }

  return data || null;
}

async function reserveDispatch(
  supabaseAdmin: AdminClient,
  companyId: string,
  charge: ChargeInput,
  record: FinancialRow | null,
  message: string,
  dispatchType: string,
) {
  try {
    const operationHash = await sha256Hex([
      companyId,
      String(record?.cliente_numero || charge.customer_id || charge.registro_id || ''),
      String(record?.data_vencimento || charge.due_date || ''),
      Number(record?.valor ?? charge.amount ?? 0).toFixed(2),
      String(charge.template || message || ''),
      dispatchType,
    ].join('|'));

    const payloadHash = await sha256Hex(JSON.stringify({
      registro_id: charge.registro_id,
      documento: record?.documento || charge.documento || '',
      numero_boleto: record?.numero_boleto || charge.numero_boleto || '',
      telefone: charge.telefone || record?.telefone || '',
    }));

    // Block only if: (a) actively processing (concurrent guard), OR
    // (b) completed within the last 5 minutes. Failed or older records allow retry.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existing } = await supabaseAdmin
      .from('automation_dispatches')
      .select('id, status, created_at')
      .eq('company_id', companyId)
      .eq('operation_hash', operationHash)
      .eq('dispatch_type', dispatchType)
      .or(`status.eq.processing,and(status.eq.completed,created_at.gte.${fiveMinutesAgo})`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return { duplicate: true, operationHash, dispatchId: existing.id };
    }

    const { data, error } = await supabaseAdmin
      .from('automation_dispatches')
      .insert({
        company_id: companyId,
        operation_hash: operationHash,
        dispatch_type: dispatchType,
        status: 'processing',
        payload_hash: payloadHash,
        metadata: {
          registro_id: charge.registro_id,
          documento: record?.documento || charge.documento || null,
          numero_boleto: record?.numero_boleto || charge.numero_boleto || null,
        },
      })
      .select('id')
      .single();

    if (error) {
      if (String(error.message || '').includes('duplicate') || String((error as { code?: string })?.code || '') === '23505') {
        return { duplicate: true, operationHash, dispatchId: null };
      }
      throw error;
    }

    return { duplicate: false, operationHash, dispatchId: data?.id || null };
  } catch (error) {
    console.warn('[send-whatsapp-charge] idempotency reserve warning', error instanceof Error ? error.message : error);
    return { duplicate: false, operationHash: '', dispatchId: null };
  }
}

async function finalizeDispatch(
  supabaseAdmin: AdminClient,
  companyId: string,
  dispatchType: string,
  operationHash: string,
  status: 'completed' | 'failed' | 'duplicate',
  metadata: Record<string, unknown> = {},
  externalReference: string | null = null,
) {
  if (!operationHash) return;
  try {
    await supabaseAdmin
      .from('automation_dispatches')
      .update({
        status,
        external_reference: externalReference,
        completed_at: new Date().toISOString(),
        metadata,
      })
      .eq('company_id', companyId)
      .eq('operation_hash', operationHash)
      .eq('dispatch_type', dispatchType);
  } catch (error) {
    console.warn('[send-whatsapp-charge] idempotency finalize warning', error instanceof Error ? error.message : error);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const runtime = createRequestContext(req, {
    module: 'send-whatsapp-charge',
    action: 'batch_send',
  });

  if (req.method !== 'POST') {
    return errorResponse(runtime, new Error('Metodo nao permitido.'), {
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
    });
  }

  try {
    const body = await req.json().catch(() => null) as { empresa_id?: string; charges?: ChargeInput[] } | null;
    const companyId = String(body?.empresa_id || '').trim();
    runtime.companyId = companyId;

    if (!companyId) {
      return errorResponse(runtime, new Error('empresa_id e obrigatorio.'), {
        status: 400,
        code: 'INVALID_COMPANY',
      });
    }

    if (!Array.isArray(body?.charges) || !body?.charges?.length) {
      return errorResponse(runtime, new Error('charges e obrigatorio e nao pode estar vazio.'), {
        status: 400,
        code: 'INVALID_CHARGES',
      });
    }

    const authUser = await requireAuthenticatedUser(req);
    runtime.userId = authUser.id;

    const supabaseAdmin = createClient(
      String(Deno.env.get('SUPABASE_URL') || '').trim(),
      String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim(),
    );

    await assertCompanyAccess(supabaseAdmin, authUser.id, companyId);

    const recordsById = new Map<string, FinancialRow>();
    const recordIds = body.charges
      .map((item) => String(item?.registro_id || '').trim())
      .filter(Boolean);

    if (recordIds.length) {
      const { data: records, error: recordsError } = await supabaseAdmin
        .from('registros_financeiros')
        .select('id, company_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, drive_file_id, boleto_url, boleto_match_confidence, boleto_match_strategy')
        .eq('company_id', companyId)
        .in('id', recordIds);

      if (recordsError) {
        throw new Error(recordsError.message || 'Falha ao carregar registros financeiros.');
      }

      for (const row of (records || []) as FinancialRow[]) {
        recordsById.set(row.id, row);
      }
    }

    const zapiConfig = await resolveZapiConfig(supabaseAdmin, companyId);
    const googleToken = getGoogleClientEmail() && getGooglePrivateKey()
      ? await getGoogleAccessToken().catch((error) => {
        logRuntime(runtime, {
          action: 'google_token_warning',
          status: 'warning',
          metadata: { company_id: companyId },
          error,
        });
        return '';
      })
      : '';

    await logRuntime(runtime, {
      action: 'batch_received',
      status: 'received',
      metadata: {
        company_id: companyId,
        charges_count: body.charges.length,
        mocked: zapiConfig.mode === 'mock',
      },
    });

    const results: ChargeResult[] = [];

    for (const charge of body.charges) {
      const chargeStartedAt = Date.now();
      const chargeId = String(charge?.registro_id || '').trim();
      const record = chargeId ? recordsById.get(chargeId) || null : null;
      const customerId = String(record?.cliente_numero || charge?.customer_id || '').trim() || null;
      const requestId = runtime.requestId;
      const message = String(charge?.mensagem || '').trim();
      const normalizedPhone = normalizePhone(charge?.telefone || record?.telefone || '');
      const dispatchType = zapiConfig.mode === 'mock' ? 'whatsapp_manual_mock' : 'whatsapp_manual_real';
      let retryCount = 0;
      let zapiStatus = 'not_sent';
      let providerMessageId: string | null = null;
      let warning: string | null = null;
      let pdfFound = false;
      let pdfSent = false;
      let driveFileId = String(record?.drive_file_id || '').trim() || extractDriveFileId(record?.boleto_url);
      const matchingScore = Number(record?.boleto_match_confidence || 0) || null;
      const matchedBy = String(record?.boleto_match_strategy || '').trim() || null;

      const fail = async (errorMessage: string, extra: Record<string, unknown> = {}) => {
        const result: ChargeResult = {
          registro_id: chargeId,
          ok: false,
          mocked: zapiConfig.mode === 'mock',
          charge_id: chargeId,
          customer_id: customerId,
          request_id: requestId,
          retry_count: retryCount,
          zapi_status: zapiStatus,
          pdf_found: pdfFound,
          pdf_sent: pdfSent,
          drive_file_id: driveFileId || null,
          warning,
          error: errorMessage,
          duplicate: Boolean(extra.duplicate),
        };

        results.push(result);
        await safeInsertWhatsappTracking(supabaseAdmin, {
          empresa_id: companyId,
          company_id: companyId,
          registro_id: chargeId || null,
          telefone: normalizedPhone || String(charge?.telefone || record?.telefone || ''),
          mensagem: message || '(mensagem vazia)',
          provider: 'zapi',
          provider_message_id: null,
          status: 'failed',
          sent_at: null,
          delivered_at: null,
          read_at: null,
          failed_at: new Date().toISOString(),
          failure_reason: errorMessage,
          simulated: zapiConfig.mode === 'mock',
          force_resend: false,
          zapi_message_id: null,
          erro: errorMessage,
          enviado_por: authUser.id,
        });

        await safeInsertAudit(supabaseAdmin, {
          company_id: companyId,
          user_id: authUser.id,
          action: 'whatsapp_failed',
          entity: 'send_whatsapp_charge',
          entity_id: chargeId || null,
          severity: 'error',
          metadata: {
            request_id: requestId,
            charge_id: chargeId,
            customer_id: customerId,
            duration_ms: Date.now() - chargeStartedAt,
            retry_count: retryCount,
            zapi_status: zapiStatus,
            pdf_found: pdfFound,
            pdf_sent: pdfSent,
            drive_file_id: driveFileId || null,
            matching_score: matchingScore,
            matched_by: matchedBy,
            company_id: companyId,
            warning,
            ...extra,
          },
          description: errorMessage,
          title: 'Falha no envio de cobranca WhatsApp',
        });

        await logRuntime(runtime, {
          action: 'charge_failed',
          status: 'error',
          companyId,
          userId: authUser.id,
          metadata: {
            charge_id: chargeId,
            customer_id: customerId,
            duration_ms: Date.now() - chargeStartedAt,
            retry_count: retryCount,
            zapi_status: zapiStatus,
            pdf_found: pdfFound,
            pdf_sent: pdfSent,
            drive_file_id: driveFileId || null,
            matching_score: matchingScore,
            matched_by: matchedBy,
            warning,
            ...extra,
          },
          error: new Error(errorMessage),
        });
      };

      try {
        if (!chargeId) {
          await fail('registro_id obrigatorio para envio.');
          continue;
        }

        if (!message) {
          await fail('Mensagem vazia para a cobranca.');
          continue;
        }

        if (!normalizedPhone || !validatePhone(normalizedPhone)) {
          zapiStatus = 'invalid_phone';
          await fail('Telefone invalido ou ausente para envio.');
          continue;
        }

        const dispatch = await reserveDispatch(supabaseAdmin, companyId, charge, record, message, dispatchType);
        if (dispatch.duplicate) {
          zapiStatus = 'duplicate';
          await finalizeDispatch(supabaseAdmin, companyId, dispatchType, dispatch.operationHash, 'duplicate', {
            charge_id: chargeId,
            customer_id: customerId,
          });
          await fail('Esta cobranca ja foi processada recentemente.', {
            duplicate: true,
            operation_hash: dispatch.operationHash,
          });
          continue;
        }

        if (record?.id) {
          const recentCharge = await findRecentCharge(supabaseAdmin, companyId, record.id);
          if (recentCharge?.id) {
            zapiStatus = 'duplicate_recent';
            await finalizeDispatch(supabaseAdmin, companyId, dispatchType, dispatch.operationHash, 'duplicate', {
              charge_id: chargeId,
              customer_id: customerId,
              recent_id: recentCharge.id,
            });
            await fail('Esta cobranca ja foi enviada recentemente. Aguarde antes de reenviar.', {
              duplicate: true,
              recent_id: recentCharge.id,
            });
            continue;
          }
        }

        if (driveFileId) {
          pdfFound = true;
        }

        if (zapiConfig.mode === 'mock') {
          providerMessageId = `MOCK-${requestId.slice(0, 8)}-${chargeId.slice(0, 8)}`;
          zapiStatus = 'mocked';
          await safeInsertWhatsappTracking(supabaseAdmin, {
            empresa_id: companyId,
            company_id: companyId,
            registro_id: chargeId,
            telefone: normalizedPhone,
            mensagem: message,
            provider: 'zapi',
            provider_message_id: providerMessageId,
            status: 'simulated',
            sent_at: new Date().toISOString(),
            delivered_at: null,
            read_at: null,
            failed_at: null,
            failure_reason: null,
            simulated: true,
            force_resend: false,
            zapi_message_id: providerMessageId,
            erro: null,
            enviado_por: authUser.id,
          });

          await finalizeDispatch(supabaseAdmin, companyId, dispatchType, dispatch.operationHash, 'completed', {
            mocked: true,
            charge_id: chargeId,
            customer_id: customerId,
          }, providerMessageId);

          results.push({
            registro_id: chargeId,
            ok: true,
            mocked: true,
            charge_id: chargeId,
            customer_id: customerId,
            request_id: requestId,
            retry_count: 0,
            zapi_status: zapiStatus,
            pdf_found: pdfFound,
            pdf_sent: false,
            drive_file_id: driveFileId || null,
            provider_message_id: providerMessageId,
          });

          await safeInsertAudit(supabaseAdmin, {
            company_id: companyId,
            user_id: authUser.id,
            action: 'whatsapp_simulated',
            entity: 'send_whatsapp_charge',
            entity_id: chargeId,
            severity: 'info',
            metadata: {
              request_id: requestId,
              charge_id: chargeId,
              customer_id: customerId,
              duration_ms: Date.now() - chargeStartedAt,
              retry_count: 0,
              zapi_status: zapiStatus,
              pdf_found: pdfFound,
              pdf_sent: false,
              drive_file_id: driveFileId || null,
              matching_score: matchingScore,
              matched_by: matchedBy,
              company_id: companyId,
            },
            title: 'Cobranca registrada em modo mock',
            description: 'Fluxo em modo mock, sem envio real para Z-API.',
          });

          continue;
        }

        let sendPayload: {
          providerMessageId: string;
          retryCount: number;
          zapiStatus: string;
          pdfSent: boolean;
        };

        if (driveFileId && googleToken) {
          try {
            const base64 = await downloadDriveFileBase64(googleToken, driveFileId);
            const documentResult = await sendZapiDocument(
              runtime,
              zapiConfig,
              normalizedPhone,
              message,
              `${String(record?.numero_boleto || record?.documento || chargeId).trim() || chargeId}.pdf`,
              base64,
            );
            retryCount = Math.max(0, Number(documentResult.attemptCounter || 1) - 1);
            zapiStatus = documentResult.zapiStatus;
            sendPayload = {
              providerMessageId: String(documentResult.providerMessageId),
              retryCount,
              zapiStatus,
              pdfSent: true,
            };
          } catch (attachmentError) {
            warning = attachmentError instanceof Error
              ? `PDF nao enviado, fallback para texto: ${attachmentError.message}`
              : 'PDF nao enviado, fallback para texto.';
            logRuntime(runtime, {
              action: 'attachment_fallback',
              status: 'warning',
              companyId,
              userId: authUser.id,
              metadata: {
                charge_id: chargeId,
                customer_id: customerId,
                drive_file_id: driveFileId,
              },
              error: attachmentError,
            });
            const textResult = await sendZapiText(runtime, zapiConfig, normalizedPhone, message);
            retryCount = Math.max(0, Number(textResult.attemptCounter || 1) - 1);
            zapiStatus = textResult.zapiStatus;
            sendPayload = {
              providerMessageId: String(textResult.providerMessageId),
              retryCount,
              zapiStatus,
              pdfSent: false,
            };
          }
        } else {
          if (driveFileId && !googleToken) {
            warning = 'PDF vinculado encontrado, mas Google Drive nao esta disponivel nesta execucao.';
          }
          const textResult = await sendZapiText(runtime, zapiConfig, normalizedPhone, message);
          retryCount = Math.max(0, Number(textResult.attemptCounter || 1) - 1);
          zapiStatus = textResult.zapiStatus;
          sendPayload = {
            providerMessageId: String(textResult.providerMessageId),
            retryCount,
            zapiStatus,
            pdfSent: false,
          };
        }

        providerMessageId = sendPayload.providerMessageId;
        pdfSent = sendPayload.pdfSent;

        await safeInsertWhatsappTracking(supabaseAdmin, {
          empresa_id: companyId,
          company_id: companyId,
          registro_id: chargeId,
          telefone: normalizedPhone,
          mensagem: message,
          provider: 'zapi',
          provider_message_id: providerMessageId,
          status: 'sent',
          sent_at: new Date().toISOString(),
          delivered_at: null,
          read_at: null,
          failed_at: null,
          failure_reason: null,
          simulated: false,
          force_resend: false,
          zapi_message_id: providerMessageId,
          erro: null,
          enviado_por: authUser.id,
        });

        await finalizeDispatch(supabaseAdmin, companyId, dispatchType, dispatch.operationHash, 'completed', {
          charge_id: chargeId,
          customer_id: customerId,
          retry_count: retryCount,
            zapi_status: zapiStatus,
            pdf_found: pdfFound,
            pdf_sent: pdfSent,
            drive_file_id: driveFileId || null,
            matching_score: matchingScore,
            matched_by: matchedBy,
            warning,
          }, providerMessageId);

        results.push({
          registro_id: chargeId,
          ok: true,
          mocked: false,
          charge_id: chargeId,
          customer_id: customerId,
          request_id: requestId,
          retry_count: retryCount,
          zapi_status: zapiStatus,
          pdf_found: pdfFound,
          pdf_sent: pdfSent,
          drive_file_id: driveFileId || null,
          provider_message_id: providerMessageId,
          warning,
        });

        await safeInsertAudit(supabaseAdmin, {
          company_id: companyId,
          user_id: authUser.id,
          action: 'whatsapp_sent',
          entity: 'send_whatsapp_charge',
          entity_id: chargeId,
          severity: 'success',
          metadata: {
            request_id: requestId,
            charge_id: chargeId,
            customer_id: customerId,
            duration_ms: Date.now() - chargeStartedAt,
            retry_count: retryCount,
            zapi_status: zapiStatus,
            pdf_found: pdfFound,
            pdf_sent: pdfSent,
            drive_file_id: driveFileId || null,
            matching_score: matchingScore,
            matched_by: matchedBy,
            company_id: companyId,
            provider_message_id: providerMessageId,
            warning,
          },
          title: 'Cobranca enviada por WhatsApp',
          description: pdfSent
            ? 'Cobranca enviada com anexo PDF do boleto.'
            : 'Cobranca enviada por mensagem de texto.',
        });

        await logRuntime(runtime, {
          action: 'charge_sent',
          status: 'success',
          companyId,
          userId: authUser.id,
          metadata: {
            charge_id: chargeId,
            customer_id: customerId,
            duration_ms: Date.now() - chargeStartedAt,
            retry_count: retryCount,
            zapi_status: zapiStatus,
            pdf_found: pdfFound,
            pdf_sent: pdfSent,
            drive_file_id: driveFileId || null,
            matching_score: matchingScore,
            matched_by: matchedBy,
            provider_message_id: providerMessageId,
            warning,
          },
        });
      } catch (chargeError) {
        await fail(chargeError instanceof Error ? chargeError.message : 'Falha ao processar cobranca.');
      }
    }

    const summary = {
      sent: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      total: results.length,
    };
    const duplicateOnlySingle =
      body.charges.length === 1 &&
      summary.sent === 0 &&
      summary.failed === 1 &&
      results[0]?.duplicate === true;

    await safeInsertAudit(supabaseAdmin, {
      company_id: companyId,
      user_id: authUser.id,
      action: zapiConfig.mode === 'mock' ? 'whatsapp_mock_sent' : 'whatsapp_charges_sent',
      entity: 'send_whatsapp_charge',
      severity: summary.failed > 0 ? 'warning' : 'success',
      metadata: {
        request_id: runtime.requestId,
        company_id: companyId,
        total: summary.total,
        sent: summary.sent,
        failed: summary.failed,
        mocked: zapiConfig.mode === 'mock',
        charge_ids: results.map((item) => item.charge_id),
      },
      title: 'Lote WhatsApp processado',
      description: `${summary.sent} envio(s) com sucesso e ${summary.failed} falha(s).`,
    });

    await logRuntime(runtime, {
      action: 'batch_completed',
      status: duplicateOnlySingle ? 'warning' : (summary.failed > 0 ? 'warning' : 'success'),
      companyId,
      userId: authUser.id,
      metadata: {
        total: summary.total,
        sent: summary.sent,
        failed: summary.failed,
        mocked: zapiConfig.mode === 'mock',
      },
    });

    if (duplicateOnlySingle) {
      return errorResponse(runtime, new Error('Esta cobranca ja foi processada recentemente.'), {
        status: 409,
        code: 'DUPLICATE_CHARGE',
        metadata: {
          company_id: companyId,
          charge_id: results[0]?.charge_id || null,
        },
      });
    }

    return successResponse(runtime, {
      mocked: zapiConfig.mode === 'mock',
      results,
      summary,
    });
  } catch (error) {
    return errorResponse(runtime, error, {
      status: 500,
      code: 'SEND_WHATSAPP_CHARGE_FATAL',
      metadata: {
        company_id: runtime.companyId,
      },
    });
  }
});
