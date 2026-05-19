import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRequestContext, errorResponse, logRuntime, withTimeout } from '../_shared/runtime.ts';

type AdminClient = ReturnType<typeof createClient>;

interface BillingConfigRow {
  empresa_id: string;
  ativo: boolean;
  hora_execucao: string | null;
  hora_envio?: string | null;
  mensagem_template: string | null;
  template_preventiva: string | null;
  template_vencimento: string | null;
  template_atraso: string | null;
  regua_atraso: unknown;
  intervalo_dias?: number | null;
  cobrar_apos_dias_vencido?: number | null;
  limite_cobrancas_por_titulo?: number | null;
  preventiva_dias_antes?: number | null;
  enviar_no_vencimento?: boolean | null;
  permitir_envio_sem_boleto?: boolean | null;
}

interface SheetsConfigRow {
  empresa_id: string;
  spreadsheet_id: string | null;
  sheet_name: string | null;
  source_spreadsheet_id: string | null;
  source_sheet_name: string | null;
  drive_root_folder_id: string | null;
  last_source_sync_at: string | null;
  last_source_sync_status: string | null;
  last_source_sync_error: string | null;
}

interface CompanyIntegrationRow {
  company_id: string;
  provider: string;
  instance_id: string | null;
  token: string | null;
  client_token: string | null;
  phone_number: string | null;
  connected: boolean | null;
}

interface FinancialRow {
  id: string;
  company_id: string;
  nome: string;
  cliente_nome: string | null;
  cliente_numero: string | null;
  telefone: string | null;
  documento: string | null;
  numero_boleto: string | null;
  numero_nf: string | null;
  valor: number;
  data_vencimento: string;
  status: string;
  drive_file_id: string | null;
  linha_digitavel?: string | null;
  codigo_barras?: string | null;
  boleto_url?: string | null;
  boleto_pdf_nome?: string | null;
  boleto_match_confidence?: number | null;
  boleto_extraido_em?: string | null;
  boleto_status?: string | null;
  boleto_match_strategy?: string | null;
  boleto_erro?: string | null;
  preventiva_enviada: boolean | null;
  data_envio_preventiva: string | null;
  cobranca_vencimento_enviada: boolean | null;
  data_envio_vencimento: string | null;
  ultima_cobranca: string | null;
  tentativas_cobranca: number | null;
}

interface DriveCandidate {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  modifiedTime?: string;
}

interface ExtractedBoletoData {
  pdf_nome: string;
  drive_file_id: string;
  boleto_url: string | null;
  texto_extraido: string;
  linha_digitavel: string | null;
  codigo_barras: string | null;
  numero_boleto: string | null;
  documento: string | null;
  numero_nf: string | null;
  nosso_numero: string | null;
  valor: number | null;
  vencimento: string | null;
  nome_cliente: string | null;
  match_strategy: string;
  ocr_used?: boolean;
  ocr_source?: string | null;
}

interface MatchCandidate {
  record: FinancialRow;
  score: number;
  reasons: string[];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPEN_STATUSES = new Set(['em_aberto', 'aberto', 'pendente', 'vencido']);
const CLOSED_STATUSES = new Set(['pago', 'liquidado', 'cancelado', 'negociado', 'negociacao', 'suspenso']);
const DEFAULT_RULES = [1, 3, 5, 10, 15, 30];
const DEFAULT_EXECUTION_TIME = '08:00';
const DEFAULT_PREVENTIVA_DAYS = 1;
const DEFAULT_SEND_ON_DUE_DATE = true;
const DEFAULT_ALLOW_WITHOUT_BOLETO = false;
const DEFAULT_LIMIT_PER_TITLE = 6;
const BOLETO_STATUS_VALUES = new Set(['pendente', 'encontrado', 'nao_encontrado', 'baixa_confianca', 'conflito', 'erro']);
function normalizeFinancialStatus(value: string | null | undefined) {
  const status = normalizeText(value);
  if (status === 'pago') return 'liquidado';
  if (status === 'negociado') return 'negociacao';
  if (status === 'em_aberto') return 'pendente';
  if (status === 'cancelado') return 'cancelado';
  if (status === 'liquidado') return 'liquidado';
  if (status === 'aberto') return 'aberto';
  if (status === 'vencido') return 'vencido';
  if (status === 'negociacao') return 'negociacao';
  return 'pendente';
}

const DEFAULT_PREVENTIVA_TEMPLATE = `Olá, {cliente_nome},

Aqui é Lucas, do setor de cobrança da Orthomax.

Passando para lembrar que o boleto referente ao documento {documento} vence amanhã ({vencimento}), no valor de R$ {valor}.

Segue o boleto anexo para facilitar o pagamento.

Caso já tenha efetuado o pagamento, desconsidere esta mensagem.

Atenciosamente,
Setor de Cobrança Orthomax`;

const DEFAULT_VENCIMENTO_TEMPLATE = `Olá, {cliente_nome},

Aqui é Lucas, do setor de cobrança da Orthomax.

Passando para lembrar que hoje é o vencimento do documento {documento}, no valor de R$ {valor}.

Segue novamente o boleto anexo.

Caso já tenha realizado o pagamento, desconsidere esta mensagem.

Atenciosamente,
Setor de Cobrança Orthomax`;

const DEFAULT_ATRASO_TEMPLATE = `Olá, {cliente_nome},

Aqui é Lucas, do setor de cobrança da Orthomax.

Estou entrando em contato para confirmar o pagamento do documento abaixo:

Documento: {documento}
Vencimento: {vencimento}
Valor: R$ {valor}

Este boleto está com {dias_atraso} dia(s) de atraso.

Informamos que após 5 dias do vencimento poderá haver protesto e encargos adicionais.

Segue boleto anexo.

Caso já tenha efetuado o pagamento, desconsidere esta mensagem.

Atenciosamente,
Setor de Cobrança Orthomax`;

const DEFAULT_UNIVERSAL_TEMPLATE = `Olá!

Identificamos um título em aberto em nosso sistema referente ao documento {DOCUMENTO}, com vencimento em {VENCIMENTO}, no valor de {VALOR}.

Pedimos, por gentileza, que verifique a pendência.

Caso o pagamento já tenha sido realizado, desconsidere esta mensagem.

Se precisar de qualquer informação adicional, estamos à disposição.

Atenciosamente.`;

const DEFAULT_TEMPLATE_SAMPLE = {
  nome: 'Cliente Exemplo',
  cliente_nome: 'Cliente Exemplo',
  numero_boleto: '3001-2',
  documento: '3001-2',
  vencimento: '2026-05-10',
  valor: 1299.9,
  telefone: '77999990000',
  dias_atraso: 3,
  empresa: 'Empresa Exemplo',
  linha_digitavel: '34191.79001 01043.510047 91020.150008 8 92820000129990',
  codigo_barras: '34198928200001299901790010104351004791020150',
  link_boleto: 'https://drive.google.com/file/d/exemplo/view',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getNumeroBoletoEfetivo(registro: Partial<FinancialRow> & Record<string, unknown>) {
  return String(registro?.documento || registro?.numero_nf || '').trim();
}

function getClienteEfetivo(registro: Partial<FinancialRow> & Record<string, unknown>) {
  return String(registro?.cliente_nome || '').trim();
}

function temBoletoEncontrado(registro: Partial<FinancialRow> & Record<string, unknown>) {
  const numero = getNumeroBoletoEfetivo(registro) || String(registro?.numero_boleto || '').trim();
  return Boolean(numero && numero !== '-');
}

function logCobrancaMapping(registro: Partial<FinancialRow> & Record<string, unknown>) {
  const numeroBoletoEfetivo = getNumeroBoletoEfetivo(registro);
  const clienteEfetivo = getClienteEfetivo(registro);
  return { numeroBoletoEfetivo, clienteEfetivo };
}

function normalizeDriveName(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .toUpperCase();
}

function normalizeBoletoNumber(value: string | null | undefined) {
  return String(value || '')
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\s/_-]+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .trim();
}

function normalizeName(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b(LTDA|ME|EPP|EIRELI|SA|S\/A)\b/g, ' ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDigits(value: string | null | undefined) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeDocumentoToken(value: string | null | undefined) {
  return normalizeText(String(value || '').replace(/[^a-zA-Z0-9]/g, ''));
}

function normalizeLinhaDigitavel(value: string | null | undefined) {
  const digits = normalizeDigits(value);
  if (digits.length === 47) {
    return `${digits.slice(0, 5)}.${digits.slice(5, 10)} ${digits.slice(10, 15)}.${digits.slice(15, 21)} ${digits.slice(21, 26)}.${digits.slice(26, 32)} ${digits.slice(32, 33)} ${digits.slice(33)}`;
  }
  if (digits.length === 48) {
    return `${digits.slice(0, 11)} ${digits.slice(11, 22)} ${digits.slice(22, 33)} ${digits.slice(33)}`;
  }
  return digits || null;
}

function extractLinhaDigitavel(text: string) {
  const match = text.match(/((?:\d[\s.\-]*){47,48})/);
  if (!match) return null;
  const digits = normalizeDigits(match[1]);
  if (digits.length !== 47 && digits.length !== 48) return null;
  return normalizeLinhaDigitavel(digits);
}

function extractCodigoBarras(text: string) {
  const match = text.match(/\b\d{44}\b/);
  return match ? match[0] : null;
}

function extractCurrencyValue(text: string) {
  const currencyMatch = text.match(/R\$\s*([\d.]+,\d{2})/i) || text.match(/\b(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\b/);
  if (!currencyMatch) return null;
  const normalized = currencyMatch[1].replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function extractDate(text: string) {
  const match = text.match(/\b(\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})\b/);
  if (!match) return null;
  return toIsoDateString(match[1]);
}

function extractNames(text: string) {
  const patterns = [
    /(?:Sacado|Pagador|Cliente)\s*[:\-]\s*([A-ZÀ-Ý0-9][^\n\r]{3,80})/i,
    /(?:Benefici[aá]rio|Cedente)\s*[:\-]\s*([A-ZÀ-Ý0-9][^\n\r]{3,80})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractDocumento(text: string) {
  const patterns = [
    { key: 'documento', regex: /(?:Documento|Doc\.?)\s*[:\-]?\s*([A-Z0-9\-/.]{3,40})/i },
    { key: 'numero_nf', regex: /(?:NF|Nota Fiscal|N[úu]mero NF)\s*[:\-]?\s*([A-Z0-9\-/.]{3,40})/i },
    { key: 'nosso_numero', regex: /(?:Nosso N[úu]mero|Nosso Numero|Refer[êe]ncia)\s*[:\-]?\s*([A-Z0-9\-/.]{3,60})/i },
  ];

  const result: Record<string, string | null> = {
    documento: null,
    numero_nf: null,
    nosso_numero: null,
  };

  for (const item of patterns) {
    const match = text.match(item.regex);
    if (match?.[1]) {
      result[item.key] = match[1].trim();
    }
  }

  return result;
}

function extractBoletoNumberFromName(name: string) {
  const normalized = normalizeBoletoNumber(name);
  if (normalized) return normalized;
  const base = String(name || '').replace(/\.pdf$/i, '');
  const tokens = base.split(/[_\s]+/).map((item) => item.trim()).filter(Boolean);
  for (const token of tokens.reverse()) {
    if (/^\d{2,}[-/A-Z0-9]*$/i.test(token)) {
      return normalizeBoletoNumber(token);
    }
  }
  return null;
}

function extractReadableTextFromBytes(bytes: Uint8Array) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const latin1 = new TextDecoder('latin1').decode(bytes);
  const merged = `${utf8}\n${latin1}`
    .replace(/\\r/g, '\n')
    .replace(/[^\x20-\x7EÀ-ÿ\n]/g, ' ')
    .replace(/\s{2,}/g, ' ');

  return merged;
}

function compareNumbers(a: number | null | undefined, b: number | null | undefined, tolerance = 0.01) {
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return false;
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function compareIsoDates(a: string | null | undefined, b: string | null | undefined) {
  const left = toIsoDateString(String(a || ''));
  const right = toIsoDateString(String(b || ''));
  return Boolean(left && right && left === right);
}

function nameSimilarityScore(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const union = new Set([...Array.from(leftTokens), ...Array.from(rightTokens)]).size;
  return union ? intersection / union : 0;
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

function normalizeWhatsappTrackingStatus(status: string | null | undefined) {
  const normalized = normalizeText(status);
  if (['read', 'lida'].includes(normalized)) return 'read';
  if (['delivered', 'entregue'].includes(normalized)) return 'delivered';
  if (['sent', 'enviado'].includes(normalized)) return 'sent';
  if (['queued', 'fila'].includes(normalized)) return 'queued';
  if (['failed', 'erro', 'falhou'].includes(normalized)) return 'failed';
  if (['simulated', 'mock_enviado'].includes(normalized)) return 'simulated';
  if (normalized === 'cancelado') return 'cancelado';
  return 'queued';
}

function normalizeBrazilPhone(raw: string | null | undefined) {
  return normalizePhone(raw);
}

function maskSecret(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= 8) return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

async function getCompanyZapiIntegration(
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

function getTestZapiConfig() {
  const instanceId = Deno.env.get('TEST_ZAPI_INSTANCE_ID') || '';
  const token = Deno.env.get('TEST_ZAPI_TOKEN') || '';
  const clientToken = Deno.env.get('TEST_ZAPI_CLIENT_TOKEN') || '';

  if (!instanceId || !token || !clientToken) {
    return null;
  }

  return {
    source: 'test',
    instanceId,
    token,
    clientToken,
    phoneNumber: '',
  };
}

async function resolveCompanyZapiConfig(
  supabaseAdmin: AdminClient,
  companyId: string,
  options: { allowTestMode?: boolean } = {},
) {
  const integration = await getCompanyZapiIntegration(supabaseAdmin, companyId);
  const allowTestMode = options.allowTestMode === true;
  const testConfig = allowTestMode ? getTestZapiConfig() : null;

  console.log('[ZAPI COMPANY CONFIG]', {
    company_id: companyId,
    provider: 'zapi',
    connected: Boolean(integration?.connected),
    has_instance_id: Boolean(String(integration?.instance_id || '').trim()),
    has_token: Boolean(String(integration?.token || '').trim()),
    has_client_token: Boolean(String(integration?.client_token || '').trim()),
    source: integration?.connected ? 'company' : (testConfig ? 'test' : 'missing'),
    instance_id: maskSecret(integration?.instance_id),
  });

  if (
    integration?.connected &&
    String(integration?.instance_id || '').trim() &&
    String(integration?.token || '').trim() &&
    String(integration?.client_token || '').trim()
  ) {
    return {
      source: 'company',
      instanceId: String(integration.instance_id || '').trim(),
      token: String(integration.token || '').trim(),
      clientToken: String(integration.client_token || '').trim(),
      phoneNumber: String(integration.phone_number || '').trim(),
    };
  }

  if (testConfig) {
    return testConfig;
  }

  throw new Error('Empresa sem integracao Z-API configurada.');
}

async function validateZapiConnection(config: {
  instanceId: string;
  token: string;
  clientToken: string;
}) {
  const url = `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/status`;

  const response = await withTimeout(
    (signal) => fetch(url, {
      method: 'GET',
      signal,
      headers: {
        'Client-Token': String(config.clientToken || '').trim(),
        'Content-Type': 'application/json',
      },
    }),
    8000,
    'Tempo limite excedido ao validar conexao Z-API.',
  );

  const data = await response.json().catch(() => ({}));
  console.log('[ZAPI COMPANY REQUEST]', {
    url: url.replace(/\/token\/[^/]+\//, '/token/****/'),
    ok: response.ok,
    status: response.status,
  });
  console.log('[ZAPI COMPANY RESPONSE]', {
    ok: response.ok,
    status: response.status,
    connected: data?.connected,
    hasPhone: Boolean(
      String(data?.phone || data?.mobile || data?.connectedPhone || data?.phoneNumber || '').trim(),
    ),
  });

  if (!response.ok) {
    const zapiMsg = String(data?.message || data?.error || '').trim();
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Client Token invalido ou expirado (HTTP ${response.status}). Atualize o Client Token em Integracoes.`,
      );
    }
    if (response.status === 404) {
      throw new Error(
        `Instancia Z-API nao encontrada (HTTP 404). Verifique o Instance ID.`,
      );
    }
    throw new Error(
      zapiMsg
        ? `Z-API erro (HTTP ${response.status}): ${zapiMsg}`
        : `Z-API validacao erro ${response.status}.`,
    );
  }

  return data as Record<string, unknown>;
}

function resolveInlineZapiConfig(config: Record<string, unknown> | null | undefined) {
  const instanceId = String(config?.instance_id || '').trim();
  const token = String(config?.token || '').trim();
  const clientToken = String(config?.client_token || '').trim();

  if (!instanceId || !token || !clientToken) {
    throw new Error('Instance ID, Token e Client Token sao obrigatorios.');
  }

  return {
    source: 'inline',
    instanceId,
    token,
    clientToken,
    phoneNumber: '',
  };
}

async function resolveRequestedZapiConfig(
  supabaseAdmin: AdminClient,
  companyId: string,
  config: Record<string, unknown> | null | undefined,
  options: { allowTestMode?: boolean } = {},
) {
  const hasInlineConfig = Boolean(
    String(config?.instance_id || '').trim() &&
    String(config?.token || '').trim() &&
    String(config?.client_token || '').trim(),
  );

  if (hasInlineConfig) {
    const inlineConfig = resolveInlineZapiConfig(config);
    console.log('[ZAPI COMPANY CONFIG]', {
      company_id: companyId,
      provider: 'zapi',
      connected: false,
      has_instance_id: true,
      has_token: true,
      has_client_token: true,
      source: 'inline',
      instance_id: maskSecret(inlineConfig.instanceId),
    });
    return inlineConfig;
  }

  return resolveCompanyZapiConfig(supabaseAdmin, companyId, options);
}

function extractZapiPhoneNumber(data: Record<string, unknown> | null | undefined) {
  return String(
    data?.phone ||
    data?.mobile ||
    data?.connectedPhone ||
    data?.phoneNumber ||
    '',
  ).trim();
}

function isZapiConnected(data: Record<string, unknown> | null | undefined) {
  const directFlag = data?.connected;
  if (typeof directFlag === 'boolean') return directFlag;

  const value = normalizeText(
    String(
      data?.status ||
      data?.state ||
      data?.instanceStatus ||
      data?.session ||
      '',
    ),
  );

  return ['connected', 'conectado', 'online', 'open', 'ready'].some((item) => value.includes(item));
}

// ── Z-API pairing gate ────────────────────────────────────────────────────────
// Called before every send path (simulate + real). Throws if the WhatsApp
// session is not actually paired — prevents false-positive sends when
// company_integrations.connected=true but QR Code was never scanned.
async function assertZapiPaired(
  supabaseAdmin: AdminClient,
  companyId: string,
  options: { allowTestMode?: boolean } = {},
): Promise<void> {
  let config: { instanceId: string; token: string; clientToken: string };
  try {
    config = await resolveCompanyZapiConfig(supabaseAdmin, companyId, options);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Z-API nao configurada para esta empresa: ${msg}`);
  }

  let liveStatus: Record<string, unknown> | null = null;
  try {
    liveStatus = await validateZapiConnection(config);
  } catch {
    // If live check itself fails (network, invalid credentials), block the send.
    const auditErr: Error & { code?: string } = new Error(
      'Nao foi possivel validar a conexao Z-API. Verifique as credenciais em Integracoes.',
    );
    auditErr.code = 'zapi_not_paired';
    await supabaseAdmin.from('automation_audit_logs').insert({
      company_id: companyId,
      action: 'send_blocked',
      blocked_reason: 'zapi_validation_failed',
      zapi_status: 'unreachable',
    }).then(() => {}).catch(() => {});
    throw auditErr;
  }

  const liveConnected = isZapiConnected(liveStatus);
  const livePhone = extractZapiPhoneNumber(liveStatus);

  if (!liveConnected || !livePhone) {
    const reason = !liveConnected
      ? 'WhatsApp nao conectado na instancia Z-API. Acesse Integracoes, gere o QR Code e escaneie com o WhatsApp.'
      : 'Numero WhatsApp nao vinculado na instancia Z-API. Acesse Integracoes e escaneie o QR Code para parear o dispositivo.';

    await supabaseAdmin.from('automation_audit_logs').insert({
      company_id: companyId,
      action: 'send_blocked',
      blocked_reason: 'zapi_not_paired',
      zapi_status: liveConnected ? 'connected_no_phone' : 'disconnected',
      request_payload: { live_connected: liveConnected, live_phone: Boolean(livePhone) },
    }).then(() => {}).catch(() => {});

    const pairingErr: Error & { code?: string } = new Error(reason);
    pairingErr.code = 'zapi_not_paired';
    throw pairingErr;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function extractQrImageCandidate(data: Record<string, unknown> | null | undefined): string {
  const candidates = [
    data?.base64,
    data?.image,
    data?.qrCode,   // camelCase (some Z-API versions)
    data?.qrcode,   // lowercase (other Z-API versions / qr-code endpoint JSON response)
    data?.qr_code,  // snake_case
    data?.value,
    data?.url,
    data?.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }

    if (candidate && typeof candidate === 'object') {
      const nested = extractQrImageCandidate(candidate as Record<string, unknown>);
      if (nested) return nested;
    }
  }

  return '';
}

async function getZapiQrCodeData(
  config: { instanceId: string; token: string; clientToken: string },
) {
  const instanceId = String(config.instanceId || '').trim();
  const token = String(config.token || '').trim();
  const clientToken = String(config.clientToken || '').trim();
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/qr-code/image`;

  console.log('[ZAPI QR REQUEST]', {
    instanceId: maskSecret(instanceId),
    hasToken: Boolean(token),
    hasClientToken: Boolean(clientToken),
  });

  const response = await withTimeout(
    (signal) => fetch(url, {
      method: 'GET',
      signal,
      headers: {
        'Client-Token': clientToken,
      },
    }),
    12000,
    'Tempo limite excedido ao carregar QR Code da Z-API. Verifique a instancia e tente novamente.',
  );

  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const zapiMsg = String(errorData?.message || errorData?.error || errorData?.reason || '').trim();
    const httpStatus = response.status;
    console.log('[ZAPI QR RESPONSE]', { status: httpStatus, ok: false });

    if (httpStatus === 401 || httpStatus === 403) {
      throw new Error(
        `Client Token invalido ou expirado (HTTP ${httpStatus}). Acesse a Z-API, gere um novo Client Token e atualize em Integracoes.`,
      );
    }
    if (httpStatus === 404) {
      throw new Error(
        `Instancia Z-API nao encontrada (HTTP 404). Verifique se o Instance ID esta correto.`,
      );
    }
    if (httpStatus === 429) {
      throw new Error('Rate limit da Z-API atingido. Aguarde alguns segundos e tente novamente.');
    }
    throw new Error(
      zapiMsg
        ? `Z-API erro (HTTP ${httpStatus}): ${zapiMsg}`
        : `Z-API indisponivel (HTTP ${httpStatus}). Tente novamente em instantes.`,
    );
  }

  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => ({}));
    console.log('[ZAPI QR RESPONSE]', {
      status: response.status,
      ok: response.ok,
      data,
    });
    if (data?.connected === true) {
      return {
        connected: true,
        imageDataUrl: null,
        raw: data,
      };
    }
    const image = extractQrImageCandidate(data);
    if (!image) {
      throw new Error('Nao foi possivel gerar o QR Code. Confira se a instancia, token e client token estao corretos.');
    }

    if (image.startsWith('data:image/')) {
      return { imageDataUrl: image, raw: data };
    }

    if (/^https?:\/\//i.test(image)) {
      return { imageDataUrl: image, raw: data };
    }

    return {
      imageDataUrl: `data:image/png;base64,${image}`,
      raw: data,
    };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const imageDataUrl = `data:${contentType || 'image/png'};base64,${bytesToBase64(bytes)}`;
  console.log('[ZAPI QR RESPONSE]', {
    status: response.status,
    ok: response.ok,
    data: { bytes: bytes.length, contentType },
  });

  return {
    imageDataUrl,
    connected: false,
    raw: { bytes: bytes.length },
  };
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDate(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function formatDateBR(value: string | null | undefined) {
  const date = parseDate(value);
  if (!date) return String(value || '');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function currentTimeInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('hour')}:${get('minute')}`;
}

function isoDaysDiff(target: string, baseIso: string) {
  const base = parseDate(baseIso);
  const date = parseDate(target);
  if (!base || !date) return null;
  return Math.floor((date.getTime() - base.getTime()) / 86400000);
}

function extractRuleDays(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_RULES;
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0);
}

function resolveTemplate(config: BillingConfigRow | null, type: 'preventiva' | 'vencimento' | 'atraso') {
  const generic = config?.mensagem_template || '';
  if (type === 'preventiva') return config?.template_preventiva || generic || DEFAULT_UNIVERSAL_TEMPLATE;
  if (type === 'vencimento') return config?.template_vencimento || generic || DEFAULT_UNIVERSAL_TEMPLATE;
  return config?.template_atraso || generic || DEFAULT_UNIVERSAL_TEMPLATE;
}

function fillTemplate(
  template: string,
  record: Partial<FinancialRow> & Record<string, unknown>,
  diasAtraso: number,
  companyName = '',
) {
  const { numeroBoletoEfetivo, clienteEfetivo } = logCobrancaMapping(record);
  const nome = clienteEfetivo || String(record.nome || 'Cliente');
  const documento = String(record.documento || numeroBoletoEfetivo || '-');
  const vencimento = String(record.data_vencimento || record.vencimento || '');
  const valor = Number(record.valor || 0);
  const telefone = String(record.telefone || '');
  const numeroBoleto = String(numeroBoletoEfetivo || '');
  const linhaDigitavel = String(record.linha_digitavel || '').trim() || 'nao localizado';
  const codigoBarras = String(record.codigo_barras || '').trim() || 'nao localizado';
  const linkBoleto = String(record.boleto_url || record.link_boleto || '').trim() || 'nao localizado';

  return template
    .replaceAll('{cliente_nome}', nome)
    .replaceAll('{nome}', nome)
    .replaceAll('{cliente}', nome)
    .replaceAll('{CLIENTE}', nome)
    .replaceAll('{documento}', documento)
    .replaceAll('{DOCUMENTO}', documento)
    .replaceAll('{vencimento}', formatDateBR(vencimento))
    .replaceAll('{VENCIMENTO}', formatDateBR(vencimento))
    .replaceAll('{valor}', formatCurrency(valor))
    .replaceAll('{VALOR}', formatCurrency(valor))
    .replaceAll('{dias_atraso}', String(diasAtraso))
    .replaceAll('{numero_boleto}', numeroBoleto || '-')
    .replaceAll('{numero_nf}', String(record.numero_nf || '-'))
    .replaceAll('{telefone}', telefone)
    .replaceAll('{linha_digitavel}', linhaDigitavel)
    .replaceAll('{codigo_barras}', codigoBarras)
    .replaceAll('{link_boleto}', linkBoleto)
    .replaceAll('{empresa}', companyName || String(record.empresa || ''))
    .replaceAll('{EMPRESA}', companyName || String(record.empresa || ''));
}

async function getCompanySnapshot(supabaseAdmin: AdminClient, companyId: string) {
  if (!companyId) {
    return {
      nome: '',
      cnpj: '',
    };
  }

  const { data } = await supabaseAdmin
    .from('empresas')
    .select('nome, cnpj')
    .eq('id', companyId)
    .maybeSingle();

  return {
    nome: String(data?.nome || ''),
    cnpj: String(data?.cnpj || ''),
  };
}

async function getCompanyName(supabaseAdmin: AdminClient, companyId: string) {
  const snapshot = await getCompanySnapshot(supabaseAdmin, companyId);
  return snapshot.nome;
}

async function sha256Hex(value: string) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function getGoogleAccessToken() {
  const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || '';
  const privateKey = (Deno.env.get('GOOGLE_PRIVATE_KEY') || '').replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error('Google API não configurada. Defina GOOGLE_CLIENT_EMAIL e GOOGLE_PRIVATE_KEY.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
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
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
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
    'Tempo limite excedido ao autenticar Google API.',
  );

  if (!tokenRes.ok) {
    throw new Error(`Falha ao autenticar Google API: ${await tokenRes.text()}`);
  }

  const tokenData = await tokenRes.json();
  return String(tokenData.access_token || '');
}

function requireEnvSecret(name: string) {
  const value = Deno.env.get(name) || '';
  if (!value) {
    throw new Error(`Secret ${name} não configurado`);
  }
  return value;
}

function requireCompanyId(companyId: string | null) {
  if (!companyId) {
    throw new Error('company_id é obrigatório');
  }
  return companyId;
}

function requireDriveFolderId(folderId: string | null | undefined) {
  const value = String(folderId || '').trim();
  if (!value) {
    throw new Error('drive_root_folder_id não configurado para esta empresa');
  }
  return value;
}

async function googleJson<T>(url: string, token: string): Promise<T> {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await withTimeout(
      (signal) => fetch(url, { signal, headers: { Authorization: `Bearer ${token}` } }),
      12000,
      'Tempo limite excedido ao consultar Google Drive API.',
    );

    if (response.status === 429 || response.status === 503) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : attempt * 2;
      console.log(JSON.stringify({ event: 'google_api_rate_limit', status: response.status, attempt, retry_after_sec: retryAfterSec }));
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
        continue;
      }
      throw new Error(`Google API rate limit: status ${response.status} após ${attempt} tentativas.`);
    }

    if (!response.ok) {
      const body = await response.text();
      // Include HTTP status so callers can distinguish 403 (permission) from 404 (not found)
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    return await response.json() as T;
  }

  throw new Error('googleJson: excedido número máximo de tentativas.');
}

async function getDriveFileMetadata(token: string, fileId: string) {
  return await googleJson<DriveCandidate>(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,parents,webViewLink,webContentLink&supportsAllDrives=true`,
    token,
  );
}

async function ensureConfiguredFolderId(
  folderId: string | null | undefined,
  companyId: string,
) {
  if (folderId) return folderId;
  throw new Error(`Nenhuma pasta do Google Drive configurada para a empresa ${companyId}.`);
}

async function getDriveFolderInfo(token: string, folderId: string) {
  const folder = await getDriveFileMetadata(token, folderId);
  if (folder.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('O ID informado não pertence a uma pasta do Google Drive.');
  }
  return folder;
}

async function countPdfFilesInFolder(token: string, folderId: string) {
  const query = encodeURIComponent(`'${folderId}' in parents and mimeType='application/pdf' and trashed=false`);
  const data = await googleJson<{ files?: DriveCandidate[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    token,
  );
  return data.files?.length || 0;
}

async function listPdfFilesInFolder(token: string, folderId: string, limit = 50) {
  const files: DriveCandidate[] = [];
  let pageToken = '';

  while (files.length < limit) {
    const query = encodeURIComponent(`'${folderId}' in parents and mimeType='application/pdf' and trashed=false`);
    const suffix = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const data = await googleJson<{ files?: DriveCandidate[]; nextPageToken?: string }>(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,parents,webViewLink,webContentLink,modifiedTime),nextPageToken&pageSize=${Math.min(100, limit - files.length)}${suffix}&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      token,
    );

    files.push(...(data.files || []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return files.slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Recursive Drive scanning — lists subfolders and PDFs across nested levels
// ─────────────────────────────────────────────────────────────────────────────

async function listSubfolders(token: string, parentId: string): Promise<Array<{ id: string; name: string }>> {
  const query = encodeURIComponent(
    `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  // corpora=allDrives covers My Drive + all Shared Drives the service account can access.
  // supportsAllDrives + includeItemsFromAllDrives are required for Shared Drive content.
  const data = await googleJson<{ files?: Array<{ id: string; name: string }> }>(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=100&corpora=allDrives&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    token,
  );
  return data.files || [];
}

// Paginated version — needed when a container (e.g. CLIENTES) has >100 subfolders.
// Without pagination, folders after the first 100 are invisible to targeted lookup.
// Drive returns folders alphabetically; "MENEZES" starts at letter 13, so if there are
// 100+ clients starting A–L, it would be on page 2 and get missed entirely.
async function listSubfoldersAll(
  token: string,
  parentId: string,
  maxResults = 500,
): Promise<Array<{ id: string; name: string }>> {
  const all: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;
  do {
    const q = encodeURIComponent(
      `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    );
    const ptParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const data = await googleJson<{ files?: Array<{ id: string; name: string }>; nextPageToken?: string }>(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name),nextPageToken&pageSize=100&corpora=allDrives&supportsAllDrives=true&includeItemsFromAllDrives=true${ptParam}`,
      token,
    );
    all.push(...(data.files || []));
    pageToken = data.nextPageToken;
    if (all.length >= maxResults) break;
  } while (pageToken);
  return all;
}

interface FolderTraversalError {
  folder_id: string;
  folder_name: string;
  depth: number;
  error: string;
  http_status: number | null;
}

interface VisitedFolder {
  id: string;
  name: string;
  depth: number;
  path: string; // e.g. "root / CLIENTES / MENEZES E BATISTA / 4239"
}

// BFS with full diagnostic support:
//   - priorityTokens: children whose normalised name contains a token are pushed to the
//     FRONT of the queue → ensures token-relevant branches are explored first even when
//     the cap is hit (fixes the "60 folder cap exhausted at depth 2" scenario).
//   - parentMap: used to reconstruct the full path for each visited folder.
//   - Returns visitedFolders (with paths), bfsCapHit flag, queueAtCap snapshot.
async function collectFolderIdsDetailed(
  token: string,
  rootId: string,
  maxDepth: number,
  maxFolders = 200,
  priorityTokens: string[] = [],
): Promise<{
  ids: string[];
  nameMap: Map<string, string>;
  visitedFolders: VisitedFolder[];
  bfsCapHit: boolean;
  queueAtCap: Array<{ id: string; name: string; depth: number; path: string }>;
  errors: FolderTraversalError[];
}> {
  const normStr = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const priorityNorms = priorityTokens.map(normStr).filter(Boolean);

  const visited = new Set<string>([rootId]);
  const nameMap = new Map<string, string>();
  const parentMap = new Map<string, string>(); // child_id → parent_id
  nameMap.set(rootId, 'root');
  parentMap.set(rootId, '');

  type QueueItem = { id: string; name: string; depth: number };
  const queue: QueueItem[] = [{ id: rootId, name: 'root', depth: 0 }];
  const visitedFolders: VisitedFolder[] = [];
  const errors: FolderTraversalError[] = [];

  // Build path string from parentMap
  const getPath = (id: string): string => {
    const parts: string[] = [];
    let cur = id;
    let guard = 0;
    while (cur && guard++ < 10) {
      parts.unshift(nameMap.get(cur) || cur);
      const p = parentMap.get(cur);
      if (!p) break;
      cur = p;
    }
    return parts.join(' / ');
  };

  // Track root as first visited folder
  visitedFolders.push({ id: rootId, name: 'root', depth: 0, path: 'root' });

  while (queue.length > 0 && visited.size < maxFolders) {
    const item = queue.shift()!;
    if (item.depth >= maxDepth) continue;

    let children: Array<{ id: string; name: string }> = [];
    try {
      children = await listSubfolders(token, item.id);
      console.log(JSON.stringify({
        event: 'bfs_visit',
        folder_id: item.id,
        folder_name: item.name,
        depth: item.depth,
        path: getPath(item.id),
        children_found: children.length,
        child_names: children.map((c) => c.name),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const httpStatus = msg.match(/^HTTP (\d+):/)?.[1] ? Number(msg.match(/^HTTP (\d+):/)?.[1]) : null;
      const traversalErr: FolderTraversalError = {
        folder_id: item.id, folder_name: item.name, depth: item.depth, error: msg, http_status: httpStatus,
      };
      errors.push(traversalErr);
      console.log(JSON.stringify({ event: 'bfs_error', ...traversalErr }));
      continue;
    }

    // ── Token-guided prioritization ──────────────────────────────────────────
    // Children whose normalised name contains a query token go to the FRONT of the
    // queue so they are explored before unrelated siblings, even if the cap is hit.
    const priority: QueueItem[] = [];
    const normal: QueueItem[] = [];
    for (const child of children) {
      if (!visited.has(child.id) && visited.size < maxFolders) {
        visited.add(child.id);
        nameMap.set(child.id, child.name);
        parentMap.set(child.id, item.id);
        const childNorm = normStr(child.name);
        const isPriority = priorityNorms.some((t) => childNorm.includes(t));
        const entry: QueueItem = { id: child.id, name: child.name, depth: item.depth + 1 };
        const path = getPath(child.id);
        visitedFolders.push({ id: child.id, name: child.name, depth: item.depth + 1, path });
        if (isPriority) {
          priority.push(entry);
          console.log(JSON.stringify({ event: 'bfs_priority', folder_name: child.name, depth: item.depth + 1, path }));
        } else {
          normal.push(entry);
        }
      }
    }
    // Priority children inserted at front so they're processed before other breadth-siblings
    queue.unshift(...priority);
    queue.push(...normal);
  }

  const bfsCapHit = queue.length > 0;
  const queueAtCap = bfsCapHit
    ? queue.slice(0, 20).map((q) => ({ id: q.id, name: q.name, depth: q.depth, path: getPath(q.id) }))
    : [];

  if (bfsCapHit) {
    console.log(JSON.stringify({
      event: 'bfs_cap_hit',
      max_folders: maxFolders,
      folders_visited: visited.size,
      queue_remaining: queue.length,
      unvisited_sample: queueAtCap.map((q) => q.name),
    }));
  }

  console.log(JSON.stringify({
    event: 'bfs_done',
    root_id: rootId,
    folders_found: visited.size,
    traversal_errors: errors.length,
    cap_hit: bfsCapHit,
  }));

  return { ids: Array.from(visited), nameMap, visitedFolders, bfsCapHit, queueAtCap, errors };
}

// Simplified wrapper kept for backward-compat with callers that only need IDs.
async function collectFolderIds(
  token: string,
  rootId: string,
  maxDepth: number,
  maxFolders = 40,
): Promise<string[]> {
  const { ids } = await collectFolderIdsDetailed(token, rootId, maxDepth, maxFolders);
  return ids;
}

// ── Weighted relevance scorer ─────────────────────────────────────────────────
// Replaces the old proportional scorer with a token-type-aware algorithm.
//
// Key rules:
//   1. If the query has number tokens → a file with ZERO number matches is REJECTED (score 0).
//   2. If the query has 2+ name tokens and only 1 matched with no number match → REJECTED.
//   3. Numbers carry 60/35 pts; names carry 25 pts each; folder-name matches carry 15 pts.
//   4. Bonus: +20 when ALL name tokens match; +20 when ALL number tokens match.
//   5. Score is capped at 100.
//
// Caller should filter results below MIN_SCORE_WITH_NUMBERS (50) or MIN_SCORE_NAMES_ONLY (20).
//
// Scoring (no 100-cap — raw score enables exact vs base separation):
//   numberTokens[0]  = exact combined number (e.g. "42392") — 100 in file / 90 in folder
//   numberTokens[1]  = base number           (e.g. "4239")  —  30 in file / 20 in folder
//   numberTokens[2+] = other numbers                        —  20 in file / 15 in folder
//   name tokens                                             —  15 in file / 10 in folder
//   all numbers matched bonus: +15
//   all names matched bonus:   +10
//
// exact_match = true when numberTokens[0] matched (file OR folder).
// Callers use this to separate exact results from base-only fallbacks.
//
// Example — "menezes e batista, 4239-2" → numberTokens=["42392","4239"]:
//   MENEZESEBATISTALTDAME_42392_4.pdf → 100+30+15+15+15+10 = 185  exact_match=true
//   MENEZESEBATISTALTDAME_42391_0.pdf →    0+30+ 0+15+15+10 =  70  exact_match=false
function scoreFileAgainstQuery(
  filename: string,
  parentFolderName: string,
  numberTokens: string[],
  nameTokens: string[],
): { score: number; matched: string[]; reasons: string[]; exact_match: boolean } {
  const normalize = (s: string) =>
    s.replace(/\.pdf$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const fnNorm = normalize(filename);
  const folderNorm = normalize(parentFolderName);

  const matched: string[] = [];
  const reasons: string[] = [];
  let score = 0;
  let exactMatch = false;

  // ── Number tokens ─────────────────────────────────────────────────────────────
  let numMatchedCount = 0;
  numberTokens.forEach((nt, idx) => {
    const tNorm = normalize(nt);
    if (!tNorm) return;
    const inFile = fnNorm.includes(tNorm);
    const inFolder = folderNorm.includes(tNorm);
    if (inFile || inFolder) {
      numMatchedCount++;
      matched.push(nt);
      let pts: number;
      if (idx === 0) {
        pts = inFile ? 100 : 90;   // exact number — massive weight
        exactMatch = true;         // mark as exact match
      } else if (idx === 1) {
        pts = inFile ? 30 : 20;    // base number — tiebreak only
      } else {
        pts = inFile ? 20 : 15;    // other numbers
      }
      score += pts;
      reasons.push(`num${inFile ? '_file' : '_folder'}:${nt}`);
    }
  });

  // HARD REJECTION: query has number tokens but NONE matched anywhere
  if (numberTokens.length > 0 && numMatchedCount === 0) {
    return { score: 0, matched: [], reasons: ['rejected:no_number_match'], exact_match: false };
  }

  // Bonus: all number tokens matched
  if (numberTokens.length > 0 && numMatchedCount === numberTokens.length) {
    score += 15;
    reasons.push('bonus:all_numbers_matched');
  }

  // ── Name tokens ───────────────────────────────────────────────────────────────
  let nameMatchedCount = 0;
  for (const nt of nameTokens) {
    const tNorm = normalize(nt);
    if (!tNorm) continue;
    const inFile = fnNorm.includes(tNorm);
    const inFolder = folderNorm.includes(tNorm);
    if (inFile || inFolder) {
      nameMatchedCount++;
      matched.push(nt);
      score += inFile ? 15 : 10;
      reasons.push(`name${inFile ? '_file' : '_folder'}:${nt}`);
    }
  }

  // HARD REJECTION: query had 2+ name tokens but only 1 matched AND no number matched
  if (nameTokens.length >= 2 && nameMatchedCount === 1 && numMatchedCount === 0) {
    return { score: 0, matched: [], reasons: ['rejected:single_name_no_number'], exact_match: false };
  }

  // Bonus: all name tokens matched
  if (nameTokens.length >= 2 && nameMatchedCount === nameTokens.length) {
    score += 10;
    reasons.push('bonus:all_names_matched');
  }

  // NOTE: score is NOT capped at 100. Exact matches reach 185+, base-only ~70.
  // The gap enables clean separation: if any exact_match exists, base-only results
  // are demoted to `base_only_candidates` in debug and hidden from primary results.

  if (score === 0 || matched.length === 0) {
    return { score: 0, matched: [], reasons: ['no_match'], exact_match: false };
  }

  return { score, matched, reasons, exact_match: exactMatch };
}

async function listPdfFilesRecursive(
  token: string,
  rootFolderId: string,
  maxDepth: number,
  limit = 200,
): Promise<DriveCandidate[]> {
  const folderIds = await collectFolderIds(token, rootFolderId, maxDepth);
  const allFiles: DriveCandidate[] = [];

  for (const folderId of folderIds) {
    if (allFiles.length >= limit) break;
    const files = await listPdfFilesInFolder(token, folderId, Math.min(100, limit - allFiles.length));
    allFiles.push(...files);
  }

  return allFiles.slice(0, limit);
}

// ── Folder-name scorer ───────────────────────────────────────────────────────
// Ranks folders against name/number tokens for the targeted lookup navigator.
// Score 100 = all tokens matched; 0 = no match.
function scoreFolderName(
  folderName: string,
  tokens: string[],
): { matched: string[]; score: number } {
  const n = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!tokens.length) return { matched: [], score: 0 };
  const fNorm = n(folderName);
  const matched = tokens.filter((t) => { const tn = n(t); return tn.length >= 2 && fNorm.includes(tn); });
  const frac = matched.length / tokens.length;
  const score = Math.min(100, Math.round(frac * 80) + (matched.length === tokens.length ? 20 : 0));
  return { matched, score };
}

// ── Targeted Drive Lookup ─────────────────────────────────────────────────────
// Navigates DIRECTLY to the client folder using name tokens, then finds the
// number-matching subfolder — skipping the BFS scan of unrelated folders.
//
// Strategy:
//   1. List root → score children against name tokens ("menezes", "batista")
//   2. No match at root level? Treat root children as containers (e.g. CLIENTES)
//      and score THEIR children. Limit to 12 containers to stay fast.
//   3. In each client folder candidate, pick subfolders matching number tokens
//      ("4239", "42392") or BOLETOS-like keywords.
//   4. Collect PDFs from client folder + matching subfolders + one deeper level.
//
// Returns null when it cannot determine a path (caller falls back to BFS).
// Uses ~10–25 API calls vs 200+ for BFS.
async function targetedDriveLookup(
  token: string,
  rootFolderId: string,
  nameTokens: string[],
  numberTokens: string[],
): Promise<{
  pdfs: Array<DriveCandidate & { _parentFolderName: string; _parentFolderId: string }>;
  visitedFolderList: VisitedFolder[];
  pathLog: string[];
  apiCalls: number;
  candidates: Array<{ name: string; score: number; path: string }>;
} | null> {
  if (nameTokens.length === 0) return null;

  const n = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  let apiCalls = 0;
  const pathLog: string[] = [];
  const visitedFolderList: VisitedFolder[] = [];

  // Need at least half the name tokens to match a client folder.
  // For 2 tokens ("menezes" + "batista") both must match to avoid "J E BATISTA & CIA LTDA".
  const MIN_CLIENT_SCORE = nameTokens.length >= 2 ? 60 : 60;

  type FolderEntry = { id: string; name: string; score: number; path: string; depth: number };
  let clientCandidates: FolderEntry[] = [];

  // ── Round A: score root's direct children (PAGINATED) ────────────────────────
  // CRITICAL: root may have 700+ client folders. listSubfolders returns only the
  // first 100 alphabetically — "MENEZES" (letter 13) would be on page 4 of 7
  // with 702 folders and would never be found. listSubfoldersAll paginates all pages.
  // 702 folders = 8 pages × 100ms each ≈ 800ms — well within the 60 s gateway limit.
  apiCalls++;
  const rootChildren = await listSubfoldersAll(token, rootFolderId, 1000).catch(() => [] as Array<{ id: string; name: string }>);
  pathLog.push(`root/ → ${rootChildren.length} subpastas (paginated): [${rootChildren.map((c) => c.name).slice(0, 10).join(', ')}…]`);
  visitedFolderList.push({ id: rootFolderId, name: 'root', depth: 0, path: 'root' });
  for (const child of rootChildren) {
    visitedFolderList.push({ id: child.id, name: child.name, depth: 1, path: child.name });
    const { score } = scoreFolderName(child.name, nameTokens);
    if (score >= MIN_CLIENT_SCORE) clientCandidates.push({ ...child, score, path: child.name, depth: 1 });
  }

  // ── Round B: no match at root → treat root children as containers ──────────
  // (e.g. CLIENTES has 50+ client subfolders that match the name tokens)
  // IMPORTANT: uses listSubfoldersAll (paginated) so containers with >100 subfolders
  // are fully scanned. Without pagination, "MENEZES" (letter 13) is invisible when
  // there are 100+ clients starting A–L.
  if (clientCandidates.length === 0) {
    for (const container of rootChildren.slice(0, 20)) {
      apiCalls++;
      // paginated — collects all pages up to 500 subfolders
      const level2 = await listSubfoldersAll(token, container.id, 500).catch(() => [] as Array<{ id: string; name: string }>);
      pathLog.push(`Round B: ${container.name}/ → ${level2.length} subpastas (paginated)`);
      for (const child of level2) {
        visitedFolderList.push({ id: child.id, name: child.name, depth: 2, path: `${container.name} / ${child.name}` });
        const { score } = scoreFolderName(child.name, nameTokens);
        if (score >= MIN_CLIENT_SCORE) {
          clientCandidates.push({ ...child, score, path: `${container.name} / ${child.name}`, depth: 2 });
        }
      }
      // Early stop once we have a perfect full-token match
      if (clientCandidates.some((c) => c.score === 100)) break;
    }
  }

  clientCandidates = clientCandidates.sort((a, b) => b.score - a.score).slice(0, 3);

  if (clientCandidates.length === 0) {
    console.log(JSON.stringify({ event: 'targeted_no_client', name_tokens: nameTokens, api_calls: apiCalls, path_log: pathLog }));
    return null;
  }

  console.log(JSON.stringify({
    event: 'targeted_client_found',
    candidates: clientCandidates.map((c) => ({ name: c.name, score: c.score, path: c.path })),
    api_calls_so_far: apiCalls,
  }));

  // ── Step 2: Collect PDFs from each client folder candidate ─────────────────
  const collected: Array<DriveCandidate & { _parentFolderName: string; _parentFolderId: string }> = [];

  for (const clientFolder of clientCandidates) {
    // PDFs directly in the client folder
    apiCalls++;
    const directPdfs = await listPdfFilesInFolder(token, clientFolder.id, 100).catch(() => []);
    pathLog.push(`${clientFolder.path}/ → ${directPdfs.length} PDFs diretos`);
    collected.push(...directPdfs.map((f) => ({ ...f, _parentFolderName: clientFolder.name, _parentFolderId: clientFolder.id })));

    // Subfolders of the client folder
    apiCalls++;
    const subfolders = await listSubfolders(token, clientFolder.id).catch(() => [] as Array<{ id: string; name: string }>);
    pathLog.push(`${clientFolder.path}/ subpastas: [${subfolders.map((s) => s.name).join(', ')}]`);
    for (const sub of subfolders) {
      visitedFolderList.push({ id: sub.id, name: sub.name, depth: clientFolder.depth + 1, path: `${clientFolder.path} / ${sub.name}` });
    }

    // Pick subfolders that match number tokens or BOLETOS-like keywords.
    // If nothing matches, scan all subfolders when there are few of them.
    const targetSubs = subfolders.filter((sub) => {
      const sn = n(sub.name);
      const numMatch = numberTokens.some((nt) => { const nn = n(nt); return nn.length >= 2 && sn.includes(nn); });
      const kwMatch = ['boleto', 'boletos', 'pdf', 'arquivos'].some((kw) => sn.includes(kw));
      return numMatch || kwMatch;
    });
    const subsToScan = targetSubs.length > 0 ? targetSubs : subfolders.length <= 6 ? subfolders : subfolders.slice(0, 6);

    console.log(JSON.stringify({
      event: 'targeted_subfolder_selection',
      client: clientFolder.name,
      all_subs: subfolders.map((s) => s.name),
      target_subs: targetSubs.map((s) => s.name),
      will_scan: subsToScan.map((s) => s.name),
    }));

    for (const sub of subsToScan.slice(0, 6)) {
      // PDFs in this subfolder (e.g. MENEZES E BATISTA / 4239)
      apiCalls++;
      const subPdfs = await listPdfFilesInFolder(token, sub.id, 100).catch(() => []);
      pathLog.push(`${clientFolder.path} / ${sub.name}/ → ${subPdfs.length} PDFs`);
      collected.push(...subPdfs.map((f) => ({ ...f, _parentFolderName: sub.name, _parentFolderId: sub.id })));

      // One deeper level (e.g. MENEZES E BATISTA / 4239 / BOLETOS)
      apiCalls++;
      const subSubs = await listSubfolders(token, sub.id).catch(() => [] as Array<{ id: string; name: string }>);
      if (subSubs.length > 0) {
        pathLog.push(`${clientFolder.path} / ${sub.name}/ subpastas: [${subSubs.map((s) => s.name).join(', ')}]`);
      }
      for (const subsub of subSubs.slice(0, 4)) {
        visitedFolderList.push({ id: subsub.id, name: subsub.name, depth: clientFolder.depth + 2, path: `${clientFolder.path} / ${sub.name} / ${subsub.name}` });
        apiCalls++;
        const subsubPdfs = await listPdfFilesInFolder(token, subsub.id, 50).catch(() => []);
        pathLog.push(`${clientFolder.path} / ${sub.name} / ${subsub.name}/ → ${subsubPdfs.length} PDFs`);
        collected.push(...subsubPdfs.map((f) => ({ ...f, _parentFolderName: subsub.name, _parentFolderId: subsub.id })));
      }
    }
  }

  console.log(JSON.stringify({ event: 'targeted_done', pdfs_collected: collected.length, api_calls: apiCalls, path_log: pathLog }));

  // Return even if collected is empty — caller inspects score to decide whether to fall back.
  return {
    pdfs: collected,
    visitedFolderList,
    pathLog,
    apiCalls,
    candidates: clientCandidates.map((c) => ({ name: c.name, score: c.score, path: c.path })),
  };
}

// Search Drive files across all folders (recursive when enabled)
async function searchDriveFilesWithConfig(
  token: string,
  rootFolderId: string,
  record: FinancialRow,
  config: { recursive?: boolean; maxDepth?: number; strategy?: string } = {},
): Promise<DriveCandidate[]> {
  const recursive = Boolean(config.recursive);
  const maxDepth = Math.min(5, Math.max(1, Number(config.maxDepth || 2)));
  const folderIds = recursive
    ? await collectFolderIds(token, rootFolderId, maxDepth)
    : [rootFolderId];

  // Try each folder in order — stop early on confident match
  for (const folderId of folderIds) {
    const results = await searchDriveFiles(token, folderId, record);
    if (results.length > 0) return results;
  }

  return [];
}

// Get folder structure (tree) for admin preview — now surfaces per-folder access errors.
async function getDriveFolderStructure(
  token: string,
  rootFolderId: string,
  maxDepth = 2,
): Promise<unknown> {
  async function buildNode(id: string, name: string, depth: number): Promise<unknown> {
    const node: Record<string, unknown> = { id, name };

    // PDF count — capture error separately so the tree still renders
    try {
      node.pdf_count = await countPdfFilesInFolder(token, id);
    } catch (err) {
      node.pdf_count = null;
      node.pdf_access_error = err instanceof Error ? err.message : String(err);
    }

    if (depth < maxDepth) {
      let children: Array<{ id: string; name: string }> = [];
      try {
        children = await listSubfolders(token, id);
        node.subfolders_error = null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        node.subfolders_error = msg;
        node.subfolders = [];
        return node;
      }
      node.subfolders_found = children.length;
      if (children.length > 0) {
        node.subfolders = await Promise.all(
          children.slice(0, 20).map((child) => buildNode(child.id, child.name, depth + 1)),
        );
      }
    }
    return node;
  }

  let rootName = rootFolderId;
  try {
    const root = await getDriveFileMetadata(token, rootFolderId);
    rootName = root.name || rootFolderId;
  } catch {
    // proceed with ID as name
  }
  return buildNode(rootFolderId, rootName, 0);
}

// ── Query tokenizer ──────────────────────────────────────────────────────────
// Splits a free-form lookup query into discriminating search tokens.
// e.g. "menezes e batista, 4239-2" → numbers:["42392","4239"]  names:["menezes","batista"]
function extractQueryTokens(query: string): {
  nameTokens: string[];
  numberTokens: string[];
  allTokens: string[];
} {
  const STOP = new Set([
    'e', 'de', 'da', 'do', 'dos', 'das', 'para', 'com', 'em', 'ou',
    'a', 'o', 'as', 'os', 'no', 'na', 'nos', 'nas', 'ao', 'aos',
    'pelo', 'pela', 'pelos', 'pelas', 'um', 'uma', 'uns', 'umas',
    'ltda', 'me', 'epp', 'eireli', 'sa',
  ]);

  const norm = String(query || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

  const numberTokens: string[] = [];
  const nameTokens: string[] = [];

  // Extract hyphenated numbers first: "4239-2" → combined "42392" + base "4239"
  const hyphenNums = norm.match(/\d+-\d+/g) || [];
  for (const hn of hyphenNums) {
    const combined = hn.replace(/-/g, '');
    if (combined.length >= 2) numberTokens.push(combined);
    const base = hn.split('-')[0];
    if (base.length >= 3) numberTokens.push(base);
  }

  // Tokenize the remainder
  const remainder = norm.replace(/\d+-\d+/g, ' ');
  const words = remainder.split(/[\s,;:\/\\.()+\-]+/).filter(Boolean);

  for (const word of words) {
    if (!word || word.length < 2 || STOP.has(word)) continue;
    const clean = word.replace(/[^a-z0-9]/g, '');
    if (!clean || clean.length < 2) continue;
    if (/^\d+$/.test(clean)) {
      numberTokens.push(clean);
    } else {
      if (!STOP.has(clean)) nameTokens.push(clean);
    }
  }

  const uniqueNums = [...new Set(numberTokens)].filter((t) => t.length >= 2);
  const uniqueNames = [...new Set(nameTokens)].filter((t) => t.length >= 2);
  return {
    numberTokens: uniqueNums,
    nameTokens: uniqueNames,
    allTokens: [...uniqueNums, ...uniqueNames],
  };
}

// ── Local filename scorer ─────────────────────────────────────────────────────
// Normalises the filename and checks how many query tokens are substrings of it.
// Score = (matched / total) * 90 — guarantees no token-only hit scores above 90.
function scoreFilenameAgainstTokens(
  filename: string,
  tokens: string[],
): { score: number; matched: string[] } {
  if (!tokens.length) return { score: 0, matched: [] };
  const norm = filename
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // strip everything non-alphanumeric for substring matching

  const matched: string[] = [];
  for (const t of tokens) {
    if (!t || t.length < 2) continue;
    const tNorm = t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (tNorm && norm.includes(tNorm)) matched.push(t);
  }

  if (!matched.length) return { score: 0, matched: [] };
  const score = Math.min(90, Math.round((matched.length / tokens.length) * 90));
  return { score, matched };
}

interface LookupResult {
  file: DriveCandidate;
  score: number;
  reasons: string[];
  exact_match: boolean;   // true when numberTokens[0] (exact combined number) matched
  _debug?: Record<string, unknown>;
}

// A result that passed MIN_SCORE via base number only (numberTokens[0] did NOT match).
// Hidden from primary results when any exact_match result exists; shown in debug only.
interface BaseOnlyCandidate {
  file_name: string;
  parent_folder: string;
  score: number;
  matched_tokens: string[];
  reasons: string[];
}

interface PdfFolderError {
  folder_id: string;
  error: string;
  http_status: number | null;
}

// A file that contained at least one query token as substring but did not reach MIN_SCORE.
// Used in the debug panel to reveal whether the target file is present but scoring wrong.
interface RejectedCandidate {
  file_name: string;
  parent_folder: string;
  normalized_file: string;  // what the scorer actually sees for filename
  normalized_folder: string; // what the scorer actually sees for folder
  score: number;
  matched_tokens: string[];
  rejected_reason: string;  // e.g. "rejected:no_number_match" or "score_below_threshold"
}

// Raw substring presence of each query token across all scanned PDFs — no scoring,
// just "does this string appear anywhere in name or folder?".
interface DiagnosticTokenMatch {
  token: string;
  normalized_token: string;
  matches_count: number;
  matches: Array<{ file_name: string; parent_folder: string }>;
}

interface ScannedPdf {
  file_name: string;
  parent_folder: string;
  folder_id: string;
}

interface LookupOutcome {
  results: LookupResult[];
  meta: {
    folders_visited: number;
    pdfs_scanned: number;
    tokens_all: string[];
    tokens_numbers: string[];
    tokens_names: string[];
    folder_errors: number;
    fallback_used: boolean;
    // Full error details for diagnostic panel
    traversal_errors: FolderTraversalError[];
    pdf_errors: PdfFolderError[];
    // Scoring diagnostic — always populated regardless of results
    rejected_candidates: RejectedCandidate[];
    base_only_candidates: BaseOnlyCandidate[];  // passed MIN_SCORE but no exact number match
    diagnostic_token_matches: DiagnosticTokenMatch[];
    // Structural diagnostic — full BFS path map + raw PDF list
    visited_folders: VisitedFolder[];
    bfs_cap_hit: boolean;
    queue_at_cap: Array<{ id: string; name: string; depth: number; path: string }>;
    scanned_pdfs: ScannedPdf[];          // first 50 PDFs with parent folder name
    all_folder_names: string[];          // just the names, for quick scan
    // Targeted lookup diagnostic
    targeted_lookup_used: boolean;       // true when Phase 0 found the results (not BFS)
    targeted_path_log: string[];         // navigation steps taken by targeted lookup
    // Phase 0 trace — always populated even when BFS ran as fallback
    targeted_phase0_ran: boolean;        // was Phase 0 attempted at all?
    targeted_phase0_null: boolean;       // targetedDriveLookup() returned null (no client found)
    targeted_phase0_pdfs_collected: number; // PDFs collected before scoring
    targeted_phase0_error: string | null;   // error caught inside inner try/catch
    targeted_phase0_path_log: string[];     // navigation steps even when falling to BFS
    targeted_phase0_candidates: Array<{ name: string; score: number; path: string }>;
  };
}

// Test boleto lookup — two-phase: (1) list ALL PDFs recursively, (2) score locally.
// Phase 4 fallback: if 0 PDFs found, tries Drive API 'name contains' per number token.
// All errors are captured with HTTP status for diagnostic display.
async function testBoletoLookup(
  token: string,
  rootFolderId: string,
  query: string,
  config: { recursive?: boolean; maxDepth?: number; maxFolders?: number } = {},
): Promise<LookupOutcome> {
  const maxDepth = Math.min(5, Math.max(4, Number(config.maxDepth || 4)));
  // maxFolders: passed from the action handler which enforces 20–130 budget.
  // Default 100 keeps us inside the ~60 s gateway timeout (100 × 2 calls × 250 ms ≈ 50 s).
  const bfsMaxFolders = Math.min(130, Math.max(20, Number(config.maxFolders ?? 100)));
  const { allTokens, numberTokens, nameTokens } = extractQueryTokens(query);

  console.log(JSON.stringify({
    event: 'lookup_start',
    folder_id: rootFolderId,
    query,
    tokens_numbers: numberTokens,
    tokens_names: nameTokens,
    max_depth: maxDepth,
    bfs_max_folders: bfsMaxFolders,
  }));

  const emptyMeta: LookupOutcome['meta'] = {
    folders_visited: 0,
    pdfs_scanned: 0,
    tokens_all: allTokens,
    tokens_numbers: numberTokens,
    tokens_names: nameTokens,
    folder_errors: 0,
    fallback_used: false,
    traversal_errors: [],
    pdf_errors: [],
    rejected_candidates: [],
    base_only_candidates: [],
    diagnostic_token_matches: [],
    visited_folders: [],
    bfs_cap_hit: false,
    queue_at_cap: [],
    scanned_pdfs: [],
    all_folder_names: [],
    targeted_lookup_used: false,
    targeted_path_log: [],
    targeted_phase0_ran: false,
    targeted_phase0_null: false,
    targeted_phase0_pdfs_collected: 0,
    targeted_phase0_error: null,
    targeted_phase0_path_log: [],
    targeted_phase0_candidates: [],
  };

  if (!allTokens.length) {
    console.log(JSON.stringify({ event: 'lookup_no_tokens', query }));
    return { results: [], meta: emptyMeta };
  }

  // Shared helpers used by both Phase 0 (targeted) and Phase 3 (scoring).
  const MIN_SCORE = numberTokens.length > 0 ? 50 : 20;
  const normStr = (s: string) =>
    s.replace(/\.pdf$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // ── Phase 0: Targeted lookup ──────────────────────────────────────────────
  // Navigate directly using name tokens → find client folder → pick number-
  // matching subfolder → collect PDFs. Uses ~10-25 API calls vs 200 for BFS.
  // Falls back to BFS only when targeted cannot find a scored match.
  // Phase 0 trace — captured regardless of outcome and carried to BFS meta when falling through.
  // This is what surfaces in `targeted_phase0_*` debug fields so we can diagnose failures.
  type Phase0Diag = {
    ran: boolean;
    null_result: boolean;
    pdfs_collected: number;
    error: string | null;
    path_log: string[];
    candidates: Array<{ name: string; score: number; path: string }>;
  };
  const phase0Diag: Phase0Diag = {
    ran: false,
    null_result: false,
    pdfs_collected: 0,
    error: null,
    path_log: [],
    candidates: [],
  };

  if (nameTokens.length > 0) {
    phase0Diag.ran = true;
    console.log(JSON.stringify({
      event: 'phase0_start',
      name_tokens: nameTokens,
      number_tokens: numberTokens,
      root_folder_id: rootFolderId,
    }));

    let targeted: Awaited<ReturnType<typeof targetedDriveLookup>> = null;
    try {
      targeted = await targetedDriveLookup(token, rootFolderId, nameTokens, numberTokens);
    } catch (targetedErr) {
      phase0Diag.error = String(targetedErr);
      console.error(JSON.stringify({
        event: 'targeted_lookup_error',
        error: String(targetedErr),
        stack: targetedErr instanceof Error ? (targetedErr.stack || null) : null,
      }));
      // fall through to BFS
    }

    if (targeted === null) {
      phase0Diag.null_result = true;
    } else {
      phase0Diag.pdfs_collected = targeted.pdfs.length;
      phase0Diag.path_log = targeted.pathLog;
      phase0Diag.candidates = targeted.candidates;
    }

    console.log(JSON.stringify({
      event: 'phase0_result',
      targeted_null: targeted === null,
      pdfs_collected: targeted?.pdfs.length ?? 0,
      candidates: targeted?.candidates ?? [],
      path_log: targeted?.pathLog ?? [],
      error: phase0Diag.error,
    }));

    if (targeted) {
      const { pdfs: tPdfs, visitedFolderList: tVisited, pathLog: tPathLog, apiCalls: tCalls } = targeted;

      // Score every collected PDF
      const tAllScored = tPdfs.map((file) => {
        const fnNorm = normStr(file.name || '');
        const folderNorm = normStr(file._parentFolderName || '');
        const { score, matched, reasons, exact_match } = scoreFileAgainstQuery(
          file.name || '', file._parentFolderName || '', numberTokens, nameTokens,
        );
        if (score > 0) {
          console.log(JSON.stringify({ event: 'targeted_score', name: file.name, folder: file._parentFolderName, score, exact_match, matched }));
        }
        return {
          file, score, reasons, exact_match, fnNorm, folderNorm,
          _debug: { matched_tokens: matched, number_tokens: numberTokens, name_tokens: nameTokens, parent_folder: file._parentFolderName },
        };
      });

      // Sort by score; exact matches always win because their scores (185+) >> base-only (70)
      const tAboveThreshold = tAllScored.filter((r) => r.score >= MIN_SCORE).sort((a, b) => b.score - a.score);
      const tExactMatches = tAboveThreshold.filter((r) => r.exact_match);
      const tBaseOnly     = tAboveThreshold.filter((r) => !r.exact_match);
      // If any exact match exists, primary results = only exact matches; base-only → debug
      const tScored       = (tExactMatches.length > 0 ? tExactMatches : tAboveThreshold).slice(0, 10);
      const tBaseOnlyCandidates: BaseOnlyCandidate[] = tExactMatches.length > 0
        ? tBaseOnly.slice(0, 20).map((r) => ({
            file_name: r.file.name || '',
            parent_folder: r.file._parentFolderName || '',
            score: r.score,
            matched_tokens: (r._debug.matched_tokens as string[]) || [],
            reasons: r.reasons,
          }))
        : [];

      if (tScored.length > 0) {
        console.log(JSON.stringify({
          event: 'targeted_success',
          results: tScored.length,
          api_calls: tCalls,
          top_file: tScored[0].file.name,
          top_score: tScored[0].score,
          strategy: 'targeted',
        }));

        // Build full diagnostic meta from targeted PDFs
        const tRejected: RejectedCandidate[] = tAllScored
          .filter((r) => r.score < MIN_SCORE && allTokens.some((t) => {
            const tn = normStr(t); return tn.length >= 2 && (r.fnNorm.includes(tn) || r.folderNorm.includes(tn));
          }))
          .sort((a, b) => b.score - a.score).slice(0, 20)
          .map((r) => ({
            file_name: r.file.name || '',
            parent_folder: r.file._parentFolderName || '',
            normalized_file: r.fnNorm,
            normalized_folder: r.folderNorm,
            score: r.score,
            matched_tokens: r._debug.matched_tokens,
            rejected_reason: r.reasons.filter((rr) => rr.startsWith('rejected:')).join(' | ') || 'score_below_threshold',
          }));

        const tDiagTokens: DiagnosticTokenMatch[] = allTokens.map((t) => {
          const tNorm = normStr(t);
          const hits = tPdfs
            .filter((f) => normStr(f.name || '').includes(tNorm) || normStr(f._parentFolderName || '').includes(tNorm))
            .slice(0, 30)
            .map((f) => ({ file_name: f.name || '', parent_folder: f._parentFolderName || '' }));
          return { token: t, normalized_token: tNorm, matches_count: hits.length, matches: hits };
        });

        const meta: LookupOutcome['meta'] = {
          folders_visited: tCalls,
          pdfs_scanned: tPdfs.length,
          tokens_all: allTokens,
          tokens_numbers: numberTokens,
          tokens_names: nameTokens,
          folder_errors: 0,
          fallback_used: false,
          traversal_errors: [],
          pdf_errors: [],
          rejected_candidates: tRejected,
          base_only_candidates: tBaseOnlyCandidates,
          diagnostic_token_matches: tDiagTokens,
          visited_folders: tVisited,
          bfs_cap_hit: false,
          queue_at_cap: [],
          scanned_pdfs: tPdfs.slice(0, 50).map((f) => ({
            file_name: f.name || '', parent_folder: f._parentFolderName || '', folder_id: f._parentFolderId || '',
          })),
          all_folder_names: [...new Set(tVisited.map((f) => f.name))],
          targeted_lookup_used: true,
          targeted_path_log: tPathLog,
          targeted_phase0_ran: true,
          targeted_phase0_null: false,
          targeted_phase0_pdfs_collected: tPdfs.length,
          targeted_phase0_error: null,
          targeted_phase0_path_log: tPathLog,
          targeted_phase0_candidates: targeted.candidates,
        };

        console.log(JSON.stringify({ event: 'lookup_done', strategy: 'targeted', folders_visited: tCalls, pdfs_scanned: tPdfs.length, results_found: tScored.length }));
        return { results: tScored, meta };
      }

      // Targeted collected PDFs but none scored above threshold → fall through to BFS.
      // Update phase0Diag so BFS meta reflects what happened even after fallthrough.
      phase0Diag.pdfs_collected = tPdfs.length;
      phase0Diag.path_log = tPathLog;
      phase0Diag.candidates = targeted.candidates;
      console.log(JSON.stringify({ event: 'targeted_no_score_match', pdfs_collected: tPdfs.length, api_calls: tCalls, path_log: tPathLog }));
    }
  }

  // ── Phase 1: BFS — collect all subfolder IDs, paths, and name map ───────────
  // maxFolders=200 prevents the depth-2 cap issue (CLIENTES with 50+ clients).
  // allTokens passed as priorityTokens so "MENEZES E BATISTA" / "4239" are
  // explored before unrelated siblings even if the cap is eventually hit.
  const {
    ids: folderIds,
    nameMap: folderNameMap,
    visitedFolders,
    bfsCapHit,
    queueAtCap,
    errors: traversalErrors,
  } = await collectFolderIdsDetailed(token, rootFolderId, maxDepth, bfsMaxFolders, allTokens);

  console.log(JSON.stringify({
    event: 'lookup_folders',
    count: folderIds.length,
    bfs_cap_hit: bfsCapHit,
    queue_remaining: queueAtCap.length,
    traversal_errors: traversalErrors.length,
    all_folder_names: visitedFolders.map((f) => f.name),
  }));

  // ── Phase 2: List every PDF — track parent folder name + id per file ──────────
  const allPdfs: Array<DriveCandidate & { _parentFolderName: string; _parentFolderId: string }> = [];
  const pdfErrors: PdfFolderError[] = [];
  const scannedPdfs: ScannedPdf[] = []; // capped at 50 for response size (sliced again in handler)

  for (const fid of folderIds) {
    if (allPdfs.length >= 400) break;
    try {
      const pdfs = await listPdfFilesInFolder(token, fid, 100);
      const folderName = folderNameMap.get(fid) || fid;
      if (pdfs.length > 0) {
        console.log(JSON.stringify({
          event: 'lookup_pdfs_in_folder',
          folder_id: fid,
          folder_name: folderName,
          count: pdfs.length,
          names: pdfs.map((p) => p.name),
        }));
      }
      for (const p of pdfs) {
        allPdfs.push({ ...p, _parentFolderName: folderName, _parentFolderId: fid });
        if (scannedPdfs.length < 50) {
          scannedPdfs.push({ file_name: p.name || '', parent_folder: folderName, folder_id: fid });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const httpStatus = msg.match(/^HTTP (\d+):/)?.[1] ? Number(msg.match(/^HTTP (\d+):/)?.[1]) : null;
      pdfErrors.push({ folder_id: fid, error: msg, http_status: httpStatus });
      console.log(JSON.stringify({ event: 'lookup_pdf_error', folder_id: fid, http_status: httpStatus, error: msg }));
    }
  }
  console.log(JSON.stringify({
    event: 'lookup_pdfs_total',
    count: allPdfs.length,
    pdf_errors: pdfErrors.length,
    traversal_errors: traversalErrors.length,
    sample_names: scannedPdfs.slice(0, 20).map((p) => `${p.parent_folder}/${p.file_name}`),
  }));

  // ── Phase 3: Weighted scoring — numbers mandatory, folder name in surface ─────
  // MIN_SCORE and normStr are defined above (shared with Phase 0).
  // MIN_SCORE: 50 when query has numbers (strict); 20 when names only (lenient).

  // Score ALL PDFs first (no filter yet) so we can inspect rejected candidates.
  const allScored = allPdfs.map((file) => {
    const fnNorm = normStr(file.name || '');
    const folderNorm = normStr(file._parentFolderName || '');
    const { score, matched, reasons, exact_match } = scoreFileAgainstQuery(
      file.name || '',
      file._parentFolderName || '',
      numberTokens,
      nameTokens,
    );
    if (score > 0) {
      console.log(JSON.stringify({
        event: 'lookup_score',
        name: file.name,
        folder: file._parentFolderName,
        score,
        exact_match,
        matched,
        reasons,
      }));
    }
    return {
      file,
      score,
      reasons,
      exact_match,
      fnNorm,
      folderNorm,
      _debug: { matched_tokens: matched, number_tokens: numberTokens, name_tokens: nameTokens, parent_folder: file._parentFolderName },
    };
  });

  // Results that passed the threshold — exact matches score 185+, base-only ~70
  const aboveThreshold = allScored.filter((r) => r.score >= MIN_SCORE).sort((a, b) => b.score - a.score);
  const exactMatches   = aboveThreshold.filter((r) => r.exact_match);
  const baseOnlyItems  = aboveThreshold.filter((r) => !r.exact_match);
  // Primary results: only exact matches when any exist; otherwise all above-threshold
  let scored = (exactMatches.length > 0 ? exactMatches : aboveThreshold).slice(0, 10);
  const bfsBaseOnlyCandidates: BaseOnlyCandidate[] = exactMatches.length > 0
    ? baseOnlyItems.slice(0, 20).map((r) => ({
        file_name: r.file.name || '',
        parent_folder: r.file._parentFolderName || '',
        score: r.score,
        matched_tokens: (r._debug.matched_tokens as string[]) || [],
        reasons: r.reasons,
      }))
    : [];

  // ── Diagnostic A: rejected candidates ────────────────────────────────────────
  // Files that were NOT returned (score < MIN_SCORE) but whose normalized filename
  // OR normalized folder name contains at least one query token as a substring.
  // This is the definitive proof of whether the target file is present but mis-scored.
  const rejectedCandidates: RejectedCandidate[] = allScored
    .filter((r) => {
      if (r.score >= MIN_SCORE) return false; // already in results
      // Does name or folder contain any query token?
      return allTokens.some((t) => {
        const tNorm = normStr(t);
        return tNorm.length >= 2 && (r.fnNorm.includes(tNorm) || r.folderNorm.includes(tNorm));
      });
    })
    .sort((a, b) => b.score - a.score) // highest partial score first
    .slice(0, 20)
    .map((r) => ({
      file_name: r.file.name || '',
      parent_folder: r.file._parentFolderName || '',
      normalized_file: r.fnNorm,
      normalized_folder: r.folderNorm,
      score: r.score,
      matched_tokens: r._debug.matched_tokens,
      rejected_reason: r.reasons.filter((rr) => rr.startsWith('rejected:')).join(' | ') || 'score_below_threshold',
    }));

  console.log(JSON.stringify({
    event: 'lookup_rejected_candidates',
    count: rejectedCandidates.length,
    top3: rejectedCandidates.slice(0, 3).map((c) => ({
      file_name: c.file_name,
      parent_folder: c.parent_folder,
      score: c.score,
      rejected_reason: c.rejected_reason,
    })),
  }));

  // ── Diagnostic B: raw token presence ─────────────────────────────────────────
  // For EACH query token, find every PDF whose normalized filename or folder contains it.
  // No scoring — pure substring presence. Answers: "is MENEZESEBATISTALTDAME in the list?"
  const diagnosticTokenMatches: DiagnosticTokenMatch[] = allTokens.map((t) => {
    const tNorm = normStr(t);
    const hits = allPdfs
      .filter((f) => normStr(f.name || '').includes(tNorm) || normStr(f._parentFolderName || '').includes(tNorm))
      .slice(0, 30)
      .map((f) => ({ file_name: f.name || '', parent_folder: f._parentFolderName || '' }));
    console.log(JSON.stringify({ event: 'lookup_diag_token', token: t, normalized: tNorm, hits: hits.length }));
    return { token: t, normalized_token: tNorm, matches_count: hits.length, matches: hits };
  });

  let fallbackUsed = false;

  // ── Phase 4 (fallback): Drive API 'name contains' per number token ────────────
  // Triggered only when Phase 3 found zero results — i.e. all PDFs failed the
  // number-token requirement OR no PDFs were found at all (permission issue).
  if (scored.length === 0 && numberTokens.length > 0) {
    console.log(JSON.stringify({
      event: 'lookup_fallback_start',
      reason: pdfErrors.length > 0 ? 'pdf_list_errors' : (traversalErrors.length > 0 ? 'traversal_errors' : 'no_score_matches'),
      traversal_errors: traversalErrors.length,
      pdf_errors: pdfErrors.length,
      tokens: numberTokens,
    }));
    fallbackUsed = true;
    // Map: file_id → { file, parentFolderName } so we can still score with folder context
    const fallbackMap = new Map<string, { file: DriveCandidate; parentFolderName: string }>();

    for (const fid of folderIds) {
      if (fallbackMap.size >= 20) break;
      const folderName = folderNameMap.get(fid) || fid;
      for (const nt of numberTokens.slice(0, 3)) {
        if (fallbackMap.size >= 20) break;
        const q = encodeURIComponent(
          `name contains '${nt.replace(/'/g, "\\'")}' and '${fid}' in parents and mimeType='application/pdf' and trashed=false`,
        );
        const data = await googleJson<{ files?: DriveCandidate[] }>(
          `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,webViewLink,webContentLink)&pageSize=10&corpora=allDrives&supportsAllDrives=true&includeItemsFromAllDrives=true`,
          token,
        ).catch((err) => {
          console.log(JSON.stringify({ event: 'lookup_fallback_error', folder_id: fid, token: nt, error: String(err) }));
          return { files: [] as DriveCandidate[] };
        });
        for (const f of data.files || []) {
          if (!fallbackMap.has(f.id)) {
            console.log(JSON.stringify({ event: 'lookup_fallback_hit', name: f.name, token: nt, folder_id: fid, folder_name: folderName }));
            fallbackMap.set(f.id, { file: f, parentFolderName: folderName });
          }
        }
      }
    }

    scored = Array.from(fallbackMap.values())
      .map(({ file, parentFolderName }) => {
        const { score, matched, reasons, exact_match } = scoreFileAgainstQuery(
          file.name || '', parentFolderName, numberTokens, nameTokens,
        );
        // Files found by explicit Drive API query already passed a 'name contains' filter,
        // so apply a floor of 30 (they are at least weakly relevant).
        return {
          file,
          score: Math.max(score, 30),
          reasons: reasons.length ? reasons.map((r) => `fallback:${r}`) : ['api_search_hit'],
          exact_match,
          _debug: { matched_tokens: matched, number_tokens: numberTokens, name_tokens: nameTokens, parent_folder: parentFolderName, fallback: true },
        };
      })
      // Still apply MIN_SCORE after the floor to prevent garbage results
      .filter((r) => r.score >= Math.min(MIN_SCORE, 30))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  const meta: LookupOutcome['meta'] = {
    folders_visited: folderIds.length,
    pdfs_scanned: allPdfs.length,
    tokens_all: allTokens,
    tokens_numbers: numberTokens,
    tokens_names: nameTokens,
    folder_errors: pdfErrors.length + traversalErrors.length,
    fallback_used: fallbackUsed,
    traversal_errors: traversalErrors,
    pdf_errors: pdfErrors,
    rejected_candidates: rejectedCandidates,
    base_only_candidates: bfsBaseOnlyCandidates,
    diagnostic_token_matches: diagnosticTokenMatches,
    visited_folders: visitedFolders,
    bfs_cap_hit: bfsCapHit,
    queue_at_cap: queueAtCap,
    scanned_pdfs: scannedPdfs,
    all_folder_names: visitedFolders.map((f) => f.name),
    targeted_lookup_used: false,
    targeted_path_log: [],
    // Phase 0 trace — populated even when BFS ran as fallback
    targeted_phase0_ran: phase0Diag.ran,
    targeted_phase0_null: phase0Diag.null_result,
    targeted_phase0_pdfs_collected: phase0Diag.pdfs_collected,
    targeted_phase0_error: phase0Diag.error,
    targeted_phase0_path_log: phase0Diag.path_log,
    targeted_phase0_candidates: phase0Diag.candidates,
  };

  console.log(JSON.stringify({
    event: 'lookup_done',
    folders_visited: meta.folders_visited,
    pdfs_scanned: meta.pdfs_scanned,
    folder_errors: meta.folder_errors,
    fallback_used: meta.fallback_used,
    results_found: scored.length,
  }));

  return { results: scored, meta };
}


async function searchDriveFiles(token: string, folderId: string, record: FinancialRow) {
  if (record.drive_file_id) {
    const file = await getDriveFileMetadata(token, record.drive_file_id).catch(() => null);
    if (file?.id && file.parents?.includes(folderId)) {
      return [file];
    }
  }

  const { numeroBoletoEfetivo, clienteEfetivo } = logCobrancaMapping(record);
  const boleto = String(numeroBoletoEfetivo || '').trim();
  const normalizedName = normalizeDriveName(clienteEfetivo || record.nome || '');
  const candidates = [
    boleto ? `${boleto}.pdf` : '',
    boleto && normalizedName ? `${normalizedName}_${boleto}.pdf` : '',
  ].filter(Boolean);

  const results: DriveCandidate[] = [];

  for (const candidateName of candidates) {
    const escapedName = candidateName.replace(/'/g, "\\'");
    const queryParts = [`name='${escapedName}'`, 'trashed=false'];
    queryParts.push(`'${folderId}' in parents`);
    const query = encodeURIComponent(queryParts.join(' and '));
    const data = await googleJson<{ files?: DriveCandidate[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType)&pageSize=5`,
      token,
    );
    if (data.files?.length) {
      return data.files;
    }
  }

  const fuzzySearches = [
    boleto ? [`fullText contains '${boleto.replace(/'/g, "\\'")}'`] : [],
    normalizedName ? [`fullText contains '${normalizedName.replace(/'/g, "\\'")}'`] : [],
  ].filter((parts) => parts.length);

  for (const queryParts of fuzzySearches) {
    queryParts.push(`'${folderId}' in parents`);
    queryParts.push("mimeType='application/pdf'");
    queryParts.push('trashed=false');
    const data = await googleJson<{ files?: DriveCandidate[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(queryParts.join(' and '))}&fields=files(id,name,mimeType)&pageSize=10`,
      token,
    );
    if (data.files?.length) {
      results.push(...data.files);
      break;
    }
  }

  return results;
}

// ── ETAPA 1: Scored live search — returns candidates with confidence scores ──
// Used at send-time to gate PDF attachment behind a minimum score of 80.
// Tiers: prelinked(95) > exact_filename(90) > combined_name_boleto(85)
//        > fulltext_boleto(65) > fulltext_name(50)
interface ScoredDriveFile {
  file: DriveCandidate;
  score: number;
  strategy: string;
}

async function searchDriveFilesScored(
  token: string,
  folderId: string,
  record: FinancialRow,
): Promise<ScoredDriveFile[]> {
  const results: ScoredDriveFile[] = [];

  // Tier 1: pre-linked file_id (highest confidence)
  if (record.drive_file_id) {
    const linked = await getDriveFileMetadata(token, record.drive_file_id).catch(() => null);
    if (linked?.id && linked.mimeType === 'application/pdf') {
      return [{ file: linked, score: 95, strategy: 'prelinked_file_id' }];
    }
  }

  const { numeroBoletoEfetivo, clienteEfetivo } = logCobrancaMapping(record);
  const boleto = String(numeroBoletoEfetivo || '').trim();
  const normalizedName = normalizeDriveName(clienteEfetivo || record.nome || '');

  // Tier 2: exact filename match
  const exactCandidates: Array<[string, number, string]> = [];
  if (boleto) exactCandidates.push([`${boleto}.pdf`, 90, 'exact_filename_boleto']);
  if (boleto && normalizedName) exactCandidates.push([`${normalizedName}_${boleto}.pdf`, 85, 'combined_name_boleto']);

  for (const [name, score, strategy] of exactCandidates) {
    const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and mimeType='application/pdf' and trashed=false`);
    const data = await googleJson<{ files?: DriveCandidate[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,parents,webViewLink,webContentLink)&pageSize=5`,
      token,
    ).catch(() => ({ files: [] as DriveCandidate[] }));
    for (const f of data.files || []) {
      if (!results.find((r) => r.file.id === f.id)) results.push({ file: f, score, strategy });
    }
  }

  // Return early if we already have a confident exact match
  if (results.some((r) => r.score >= 80)) {
    return results.sort((a, b) => b.score - a.score);
  }

  // Tier 3: fullText search on boleto number
  if (boleto) {
    const q = encodeURIComponent(`fullText contains '${boleto.replace(/'/g, "\\'")}' and '${folderId}' in parents and mimeType='application/pdf' and trashed=false`);
    const data = await googleJson<{ files?: DriveCandidate[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,parents,webViewLink,webContentLink)&pageSize=10`,
      token,
    ).catch(() => ({ files: [] as DriveCandidate[] }));
    for (const f of data.files || []) {
      if (!results.find((r) => r.file.id === f.id)) results.push({ file: f, score: 65, strategy: 'fulltext_boleto' });
    }
  }

  // Tier 4: fullText search on client name (weakest signal)
  if (normalizedName && results.length < 3) {
    const q = encodeURIComponent(`fullText contains '${normalizedName.replace(/'/g, "\\'")}' and '${folderId}' in parents and mimeType='application/pdf' and trashed=false`);
    const data = await googleJson<{ files?: DriveCandidate[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,parents,webViewLink,webContentLink)&pageSize=10`,
      token,
    ).catch(() => ({ files: [] as DriveCandidate[] }));
    for (const f of data.files || []) {
      if (!results.find((r) => r.file.id === f.id)) results.push({ file: f, score: 50, strategy: 'fulltext_name' });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

async function downloadDriveFileBase64(token: string, fileId: string) {
  const response = await withTimeout(
    (signal) =>
      fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      }),
    30000,
    'Tempo limite excedido ao baixar arquivo PDF do Google Drive (base64).',
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return bytesToBase64(bytes);
}

async function downloadDriveFileBytes(token: string, fileId: string) {
  const response = await withTimeout(
    (signal) =>
      fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      }),
    30000,
    'Tempo limite excedido ao baixar arquivo PDF do Google Drive (bytes).',
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return new Uint8Array(await response.arrayBuffer());
}

// ── downloadDrivePdfFile ──────────────────────────────────────────────────────
// Structured PDF download with mimeType/size validation and one retry.
// Returns a rich result so callers can log and branch without try/catch.
const PDF_MAX_SIZE_BYTES_DEFAULT = 15 * 1024 * 1024; // 15 MB

interface DrivePdfDownloadResult {
  ok: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
  base64: string | null;
  error?: string;
  errorCode?: 'not_found' | 'forbidden' | 'too_large' | 'not_pdf' | 'quota_exceeded' | 'timeout' | 'unknown';
}

async function downloadDrivePdfFile(
  token: string,
  fileId: string,
  maxSizeBytes = PDF_MAX_SIZE_BYTES_DEFAULT,
): Promise<DrivePdfDownloadResult> {
  // Step 1 — fetch file metadata (mimeType + size) before downloading
  let mimeType: string | null = null;
  let sizeBytes: number | null = null;
  try {
    const metaResp = await withTimeout(
      (signal) => fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,mimeType,size&supportsAllDrives=true`,
        { signal, headers: { Authorization: `Bearer ${token}` } },
      ),
      15000,
      'Timeout ao obter metadados do PDF no Drive.',
    );
    if (metaResp.status === 404) {
      return { ok: false, mimeType: null, sizeBytes: null, base64: null, error: 'Arquivo não encontrado no Drive.', errorCode: 'not_found' };
    }
    if (metaResp.status === 403) {
      return { ok: false, mimeType: null, sizeBytes: null, base64: null, error: 'Sem permissão para acessar o arquivo no Drive.', errorCode: 'forbidden' };
    }
    if (!metaResp.ok) {
      const body = await metaResp.text().catch(() => '');
      if (body.includes('quotaExceeded') || body.includes('userRateLimitExceeded')) {
        return { ok: false, mimeType: null, sizeBytes: null, base64: null, error: 'Quota do Drive excedida.', errorCode: 'quota_exceeded' };
      }
      return { ok: false, mimeType: null, sizeBytes: null, base64: null, error: `Erro ao obter metadados: HTTP ${metaResp.status} — ${body.slice(0, 200)}` };
    }
    const meta = await metaResp.json().catch(() => ({})) as { mimeType?: string; size?: string };
    mimeType = meta.mimeType || null;
    sizeBytes = meta.size ? Number(meta.size) : null;
  } catch (metaErr) {
    const msg = metaErr instanceof Error ? metaErr.message : String(metaErr);
    return { ok: false, mimeType: null, sizeBytes: null, base64: null, error: msg, errorCode: msg.includes('imeout') ? 'timeout' : 'unknown' };
  }

  // Step 2 — validate mimeType
  if (mimeType && mimeType !== 'application/pdf') {
    return { ok: false, mimeType, sizeBytes, base64: null, error: `Arquivo não é PDF (mimeType: ${mimeType}).`, errorCode: 'not_pdf' };
  }

  // Step 3 — validate size (guard before download)
  if (sizeBytes !== null && sizeBytes > maxSizeBytes) {
    const sizeMb = (sizeBytes / 1024 / 1024).toFixed(1);
    const maxMb = (maxSizeBytes / 1024 / 1024).toFixed(0);
    return { ok: false, mimeType, sizeBytes, base64: null, error: `PDF muito grande: ${sizeMb} MB (máximo: ${maxMb} MB).`, errorCode: 'too_large' };
  }

  // Step 4 — download with one retry
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const dlResp = await withTimeout(
        (signal) => fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          { signal, headers: { Authorization: `Bearer ${token}` } },
        ),
        30000,
        'Timeout ao baixar PDF do Drive.',
      );
      if (dlResp.status === 404) {
        return { ok: false, mimeType, sizeBytes, base64: null, error: 'Arquivo removido ou movido no Drive.', errorCode: 'not_found' };
      }
      if (dlResp.status === 403) {
        const body = await dlResp.text().catch(() => '');
        if (body.includes('quotaExceeded') || body.includes('userRateLimitExceeded')) {
          return { ok: false, mimeType, sizeBytes, base64: null, error: 'Quota do Drive excedida (download).', errorCode: 'quota_exceeded' };
        }
        return { ok: false, mimeType, sizeBytes, base64: null, error: 'Sem permissão para baixar o arquivo.', errorCode: 'forbidden' };
      }
      if (!dlResp.ok) {
        lastErr = `HTTP ${dlResp.status}`;
        continue; // retry
      }
      const bytes = new Uint8Array(await dlResp.arrayBuffer());
      return { ok: true, mimeType: mimeType || 'application/pdf', sizeBytes: bytes.length, base64: bytesToBase64(bytes) };
    } catch (dlErr) {
      lastErr = dlErr instanceof Error ? dlErr.message : String(dlErr);
      if (attempt < 1) continue; // retry once
      return { ok: false, mimeType, sizeBytes, base64: null, error: lastErr, errorCode: lastErr.includes('imeout') ? 'timeout' : 'unknown' };
    }
  }
  return { ok: false, mimeType, sizeBytes, base64: null, error: lastErr || 'Falha ao baixar PDF após tentativas.' };
}

async function readSheetRows(token: string, spreadsheetId: string, sheetName: string) {
  const safeRange = encodeURIComponent(`${sheetName}!A:Z`);
  const data = await googleJson<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${safeRange}`,
    token,
  );
  return data.values || [];
}

function mapSheetRows(values: string[][]) {
  if (!values.length) return [];
  const headers = values[0].map((header) => normalizeText(header));

  const read = (row: string[], aliases: string[]) => {
    const index = headers.findIndex((header) => aliases.includes(header));
    return index >= 0 ? row[index] || '' : '';
  };

  return values.slice(1).map((row) => ({
    cliente_nome: read(row, ['cliente_nome', 'cliente', 'nome']),
    telefone: read(row, ['telefone', 'celular']),
    cliente_numero: read(row, ['cliente_numero', 'codigo_cliente', 'cliente_num']),
    documento: read(row, ['documento', 'numero_documento']),
    numero_boleto: read(row, ['numero_boleto', 'boleto']),
    numero_nf: read(row, ['numero_nf', 'nf', 'nota_fiscal']),
    valor: read(row, ['valor', 'valor_titulo']),
    vencimento: read(row, ['vencimento', 'data_vencimento']),
    status: read(row, ['status']),
  })).filter((row) => row.documento || row.numero_boleto || row.cliente_numero);
}

function toIsoDateString(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
}

async function syncSheetForCompany(supabaseAdmin: AdminClient, companyId: string, token: string) {
  try {
    const { data: config } = await supabaseAdmin
      .from('google_sheets_config')
      .select('empresa_id, spreadsheet_id, sheet_name, source_spreadsheet_id, source_sheet_name')
      .eq('empresa_id', companyId)
      .maybeSingle();

    const spreadsheetId = config?.source_spreadsheet_id || config?.spreadsheet_id;
    const sheetName = config?.source_sheet_name || config?.sheet_name;

    if (!spreadsheetId || !sheetName) {
      throw new Error('Configure a planilha financeira em google_sheets_config antes de sincronizar.');
    }

    const rawRows = await readSheetRows(token, spreadsheetId, sheetName);
    const mappedRows = mapSheetRows(rawRows);

    const existingRows = await supabaseAdmin
      .from('registros_financeiros')
      .select('id, company_id, cliente_numero, documento, numero_boleto')
      .eq('company_id', companyId);

    const existingMap = new Map(
      (existingRows.data || []).map((row) => [
        `${row.company_id}:${row.cliente_numero || ''}:${row.documento || ''}`,
        row.id,
      ]),
    );

    let imported = 0;
    let updated = 0;

    for (const row of mappedRows) {
      const dataVencimento = toIsoDateString(row.vencimento);
      if (!dataVencimento) continue;

      const key = `${companyId}:${row.cliente_numero || ''}:${row.documento || ''}`;
      const payload = {
        company_id: companyId,
        nome: row.cliente_nome || 'Cliente',
        cliente_nome: row.cliente_nome || 'Cliente',
        cliente_numero: row.cliente_numero || null,
        telefone: row.telefone || '',
        documento: row.documento || null,
        numero_boleto: row.numero_boleto || null,
        numero_nf: row.numero_nf || null,
        valor: Number(String(row.valor || '0').replace(/\./g, '').replace(',', '.')) || 0,
        data_vencimento: dataVencimento,
        status: normalizeFinancialStatus(row.status),
      };

      const existingId = existingMap.get(key);
      if (existingId) {
        const { error } = await supabaseAdmin
          .from('registros_financeiros')
          .update(payload)
          .eq('id', existingId)
          .eq('company_id', companyId);
        if (error) throw new Error(error.message);
        updated += 1;
      } else {
        const { error } = await supabaseAdmin.from('registros_financeiros').insert(payload);
        if (error) throw new Error(error.message);
        imported += 1;
      }
    }

    await supabaseAdmin
      .from('google_sheets_config')
      .update({
        last_source_sync_at: new Date().toISOString(),
        last_source_sync_status: 'success',
        last_source_sync_error: null,
      })
      .eq('empresa_id', companyId);

    return { imported, updated, total_rows: mappedRows.length };
  } catch (error) {
    await supabaseAdmin
      .from('google_sheets_config')
      .update({
        last_source_sync_at: new Date().toISOString(),
        last_source_sync_status: 'error',
        last_source_sync_error: error instanceof Error ? error.message : 'Falha ao sincronizar planilha.',
      })
      .eq('empresa_id', companyId);

    throw error;
  }
}

async function getSheetsDriveConfig(supabaseAdmin: AdminClient, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from('google_sheets_config')
    .select('empresa_id, spreadsheet_id, sheet_name, source_spreadsheet_id, source_sheet_name, drive_root_folder_id, drive_recursive_scan, drive_matching_strategy, drive_max_depth, drive_folder_name, last_source_sync_at, last_source_sync_status, last_source_sync_error')
    .eq('empresa_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as SheetsConfigRow | null;
}

// ── Extracts folder ID from a Google Drive URL or returns raw ID as-is ──────
function extractFolderIdFromUrl(input: string): string {
  const str = String(input || '').trim();
  // /drive/folders/FOLDER_ID or /folders/FOLDER_ID
  const m1 = str.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  // open?id=FOLDER_ID or ?id=FOLDER_ID
  const m2 = str.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  // /d/FILE_ID/ pattern (file, not folder — still extract for validation)
  const m3 = str.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m3) return m3[1];
  // Already a raw ID (no slashes/dots)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(str)) return str;
  return str;
}

async function saveDriveConfigForCompany(
  supabaseAdmin: AdminClient,
  companyId: string,
  driveRootFolderId: string,
  extraConfig: {
    drive_recursive_scan?: boolean;
    drive_matching_strategy?: string;
    drive_max_depth?: number;
    drive_folder_name?: string;
  } = {},
) {
  requireCompanyId(companyId);
  const folderId = extractFolderIdFromUrl(String(driveRootFolderId || '').trim());
  if (!folderId) {
    throw new Error('Informe o ID ou URL da pasta do Google Drive.');
  }

  const existingConfig = await getSheetsDriveConfig(supabaseAdmin, companyId);

  const payload = {
    empresa_id: companyId,
    drive_root_folder_id: folderId,
    drive_recursive_scan: extraConfig.drive_recursive_scan ?? existingConfig?.drive_recursive_scan ?? false,
    drive_matching_strategy: extraConfig.drive_matching_strategy ?? existingConfig?.drive_matching_strategy ?? 'auto',
    drive_max_depth: Math.min(5, Math.max(1, Number(extraConfig.drive_max_depth ?? existingConfig?.drive_max_depth ?? 2))),
    drive_folder_name: extraConfig.drive_folder_name ?? existingConfig?.drive_folder_name ?? null,
    spreadsheet_id: existingConfig?.spreadsheet_id ?? null,
    sheet_name: existingConfig?.sheet_name ?? null,
    source_spreadsheet_id: existingConfig?.source_spreadsheet_id ?? null,
    source_sheet_name: existingConfig?.source_sheet_name ?? null,
    ativo: true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('google_sheets_config')
    .upsert(payload, { onConflict: 'empresa_id' });

  if (error) throw new Error(error.message);

  return await getSheetsDriveConfig(supabaseAdmin, companyId);
}

async function getBillingConfigForCompany(
  supabaseAdmin: AdminClient,
  companyId: string,
) {
  requireCompanyId(companyId);
  // Regra operacional da regua: persiste em whatsapp_cobranca_config.
  // cobrancas_whatsapp no schema real local e historico de envios/status por titulo.
  const { data, error } = await supabaseAdmin
    .from('whatsapp_cobranca_config')
    .select('empresa_id, ativo, hora_execucao, hora_envio, mensagem_template, template_preventiva, template_vencimento, template_atraso, regua_atraso, intervalo_dias, cobrar_apos_dias_vencido, limite_cobrancas_por_titulo, preventiva_dias_antes, enviar_no_vencimento, permitir_envio_sem_boleto')
    .eq('empresa_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function saveBillingConfigForCompany(
  supabaseAdmin: AdminClient,
  companyId: string,
  payload: Record<string, unknown>,
) {
  requireCompanyId(companyId);
  // Mantemos a persistencia da regua em whatsapp_cobranca_config porque
  // o schema real local consolidado usa cobrancas_whatsapp como historico.
  const existing = await getBillingConfigForCompany(supabaseAdmin, companyId);
  const horario = String(payload?.hora_execucao || payload?.hora_envio || existing?.hora_execucao || existing?.hora_envio || DEFAULT_EXECUTION_TIME).trim() || DEFAULT_EXECUTION_TIME;

  const upsertPayload = {
    empresa_id: companyId,
    ativo: Boolean(payload?.ativo ?? existing?.ativo ?? false),
    hora_execucao: horario,
    hora_envio: horario,
    mensagem_template: String(payload?.mensagem_template ?? existing?.mensagem_template ?? DEFAULT_UNIVERSAL_TEMPLATE),
    template_preventiva: String(payload?.template_preventiva ?? existing?.template_preventiva ?? DEFAULT_UNIVERSAL_TEMPLATE),
    template_vencimento: String(payload?.template_vencimento ?? existing?.template_vencimento ?? DEFAULT_UNIVERSAL_TEMPLATE),
    template_atraso: String(payload?.template_atraso ?? existing?.template_atraso ?? DEFAULT_UNIVERSAL_TEMPLATE),
    regua_atraso: Array.isArray(payload?.regua_atraso) ? payload.regua_atraso : (existing?.regua_atraso ?? DEFAULT_RULES),
    intervalo_dias: Number(payload?.intervalo_dias ?? existing?.intervalo_dias ?? 5) || 5,
    cobrar_apos_dias_vencido: Number(payload?.cobrar_apos_dias_vencido ?? existing?.cobrar_apos_dias_vencido ?? 1) || 1,
    limite_cobrancas_por_titulo: Number(payload?.limite_cobrancas_por_titulo ?? existing?.limite_cobrancas_por_titulo ?? DEFAULT_LIMIT_PER_TITLE) || DEFAULT_LIMIT_PER_TITLE,
    preventiva_dias_antes: Number(payload?.preventiva_dias_antes ?? existing?.preventiva_dias_antes ?? DEFAULT_PREVENTIVA_DAYS) || DEFAULT_PREVENTIVA_DAYS,
    enviar_no_vencimento: Boolean(payload?.enviar_no_vencimento ?? existing?.enviar_no_vencimento ?? DEFAULT_SEND_ON_DUE_DATE),
    permitir_envio_sem_boleto: Boolean(payload?.permitir_envio_sem_boleto ?? existing?.permitir_envio_sem_boleto ?? DEFAULT_ALLOW_WITHOUT_BOLETO),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('whatsapp_cobranca_config')
    .upsert(upsertPayload, { onConflict: 'empresa_id' });

  if (error) throw new Error(error.message);
  return await getBillingConfigForCompany(supabaseAdmin, companyId);
}

async function testDriveConnectionForCompany(
  supabaseAdmin: AdminClient,
  companyId: string,
  token: string,
) {
  requireCompanyId(companyId);
  const config = await getSheetsDriveConfig(supabaseAdmin, companyId);
  const folderId = String(config?.drive_root_folder_id || '').trim();

  if (!folderId) {
    return {
      status: 'erro',
      folder_name: null,
      quantidade_arquivos_pdf: 0,
      mensagem_erro: 'Configure o ID da pasta do Google Drive antes de testar a conexão.',
      service_account_email: Deno.env.get('GOOGLE_CLIENT_EMAIL') || '',
      drive_root_folder_id: null,
    };
  }

  try {
    const folder = await getDriveFolderInfo(token, folderId);

    // Count PDFs recursively (depth 3, max 40 folders) so the connection
    // test reports the real count even when PDFs live in subfolders.
    const folderIds = await collectFolderIds(token, folderId, 3, 40).catch(() => [folderId]);
    let pdfCount = 0;
    for (const fid of folderIds) {
      pdfCount += await countPdfFilesInFolder(token, fid).catch(() => 0);
    }

    // Also expose subfolder count so the operator can verify traversal
    const subfolderCount = folderIds.length - 1; // exclude root

    console.log(JSON.stringify({
      event: 'test_drive_connection',
      folder_id: folderId,
      folders_traversed: folderIds.length,
      pdf_count_total: pdfCount,
    }));

    return {
      status: 'sucesso',
      folder_name: folder.name || null,
      quantidade_arquivos_pdf: pdfCount,
      subfolders_found: subfolderCount,
      mensagem_erro: null,
      service_account_email: Deno.env.get('GOOGLE_CLIENT_EMAIL') || '',
      drive_root_folder_id: folderId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao acessar a pasta do Google Drive.';
    const friendly = /File not found|insufficientFilePermissions|notFound|403|404/i.test(message)
      ? 'A pasta não está acessível. Compartilhe com a Service Account.'
      : message;
    return {
      status: 'erro',
      folder_name: null,
      quantidade_arquivos_pdf: 0,
      subfolders_found: 0,
      mensagem_erro: friendly,
      service_account_email: Deno.env.get('GOOGLE_CLIENT_EMAIL') || '',
      drive_root_folder_id: folderId,
    };
  }
}

async function syncDriveForCompany(supabaseAdmin: AdminClient, companyId: string, token: string) {
  requireCompanyId(companyId);
  const config = await getSheetsDriveConfig(supabaseAdmin, companyId);
  const folderId = requireDriveFolderId(await ensureConfiguredFolderId(config?.drive_root_folder_id, companyId));
  await getDriveFolderInfo(token, folderId).catch((error) => {
    const message = error instanceof Error ? error.message : 'Falha ao acessar pasta do Google Drive.';
    if (/File not found|insufficientFilePermissions|notFound|403|404/i.test(message)) {
      throw new Error('A pasta não está acessível. Compartilhe com a Service Account.');
    }
    throw error;
  });

  const { data: rows, error } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, user_id, representante_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, observacao, status, drive_file_id, created_at, updated_at')
    .eq('company_id', companyId)
    .is('drive_file_id', null);

  if (error) throw new Error(error.message);

  let linked = 0;
  let notFound = 0;

  for (const record of rows || []) {
    const candidates = await searchDriveFiles(token, folderId, {
      ...record,
      preventiva_enviada: false,
      data_envio_preventiva: null,
      cobranca_vencimento_enviada: false,
      data_envio_vencimento: null,
      ultima_cobranca: null,
      tentativas_cobranca: 0,
    } as FinancialRow);
    const file = candidates[0];
    if (!file?.id) {
      notFound += 1;
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from('registros_financeiros')
      .update({ drive_file_id: file.id })
      .eq('id', record.id)
      .eq('company_id', companyId);

    if (!updateError) linked += 1;
  }

  return { linked, not_found: notFound, folder_id: folderId };
}

// ── ETAPA 3: Google Vision OCR fallback for scanned / image-only PDFs ────────
// Requires ENABLE_GOOGLE_VISION_OCR=true env var and the service account having
// Cloud Vision API enabled in Google Cloud Console.
async function attemptVisionOCR(token: string, bytes: Uint8Array): Promise<{ text: string; source: string } | null> {
  const enableOcr = String(Deno.env.get('ENABLE_GOOGLE_VISION_OCR') || '').trim();
  if (enableOcr !== 'true') return null;

  try {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64Content = btoa(binary);

    const requestBody = {
      requests: [{
        inputConfig: {
          content: base64Content,
          mimeType: 'application/pdf',
        },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        pages: [1, 2, 3],
      }],
    };

    const response = await withTimeout(
      (signal) =>
        fetch('https://vision.googleapis.com/v1/files:annotate', {
          method: 'POST',
          signal,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }),
      20000,
      'Tempo limite excedido ao chamar Google Vision OCR.',
    );

    if (!response.ok) {
      console.warn('[OCR] Vision API error', response.status, await response.text().catch(() => ''));
      return null;
    }

    const data = await response.json().catch(() => null);
    const pages: Array<{ fullTextAnnotation?: { text?: string } }> = data?.responses || [];
    const combinedText = pages
      .map((p) => String(p?.fullTextAnnotation?.text || ''))
      .join('\n')
      .trim();

    if (!combinedText) return null;
    return { text: combinedText, source: 'google_vision' };
  } catch (error) {
    console.warn('[OCR] Vision fallback failed', error instanceof Error ? error.message : error);
    return null;
  }
}

// Threshold: if extracted text has fewer meaningful chars than this, try OCR
const OCR_TEXT_THRESHOLD = 40;

function buildBoletoStatus(value: string | null | undefined) {
  const normalized = normalizeText(value).replace(/[^\w]/g, '_');
  if (BOLETO_STATUS_VALUES.has(normalized)) return normalized;
  return 'pendente';
}

async function extractBoletoDataFromDriveFile(token: string, file: DriveCandidate): Promise<ExtractedBoletoData> {
  const bytes = await downloadDriveFileBytes(token, file.id);
  if (bytes.length < 100) {
    console.log(JSON.stringify({ event: 'drive_empty_pdf', file_id: file.id, file_name: file.name, bytes: bytes.length }));
    throw new Error(`PDF vazio ou ilegivel: ${file.name} (${bytes.length} bytes).`);
  }
  // Validate PDF magic bytes — rejects non-PDF and corrupted files early
  const pdfHeader = new TextDecoder('latin1').decode(bytes.slice(0, 5));
  if (!pdfHeader.startsWith('%PDF')) {
    console.log(JSON.stringify({ event: 'drive_invalid_pdf_header', file_id: file.id, file_name: file.name, header: pdfHeader.slice(0, 5) }));
    throw new Error(`Arquivo nao e um PDF valido: ${file.name} (header invalido).`);
  }
  // Validate PDF EOF marker — truncated PDFs lack %%EOF at the end
  const tailBytes = bytes.slice(Math.max(0, bytes.length - 1024));
  const tail = new TextDecoder('latin1').decode(tailBytes);
  if (!tail.includes('%%EOF')) {
    console.log(JSON.stringify({ event: 'drive_truncated_pdf', file_id: file.id, file_name: file.name, bytes: bytes.length }));
    throw new Error(`PDF truncado ou corrompido: ${file.name} (marcador %%EOF ausente).`);
  }
  let rawText = extractReadableTextFromBytes(bytes);
  let ocrUsed = false;
  let ocrSource: string | null = null;

  // ETAPA 3: OCR fallback — if native text extraction yields too little content
  const meaningfulChars = rawText.replace(/\s/g, '').length;
  if (meaningfulChars < OCR_TEXT_THRESHOLD) {
    const ocrResult = await attemptVisionOCR(token, bytes);
    if (ocrResult && ocrResult.text.replace(/\s/g, '').length > meaningfulChars) {
      rawText = ocrResult.text;
      ocrUsed = true;
      ocrSource = ocrResult.source;
      console.log(JSON.stringify({ event: 'ocr_used', file_id: file.id, file_name: file.name, source: ocrSource, chars: rawText.replace(/\s/g, '').length }));
    }
  }

  const filenameText = String(file.name || '').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
  const mergedText = `${filenameText}\n${rawText}`;
  const documento = extractDocumento(mergedText);
  const linhaDigitavel = extractLinhaDigitavel(mergedText);
  const codigoBarras = extractCodigoBarras(mergedText);

  return {
    pdf_nome: file.name || `${file.id}.pdf`,
    drive_file_id: file.id,
    boleto_url: file.webViewLink || file.webContentLink || `https://drive.google.com/file/d/${file.id}/view`,
    texto_extraido: mergedText,
    linha_digitavel: linhaDigitavel,
    codigo_barras: codigoBarras,
    numero_boleto: extractBoletoNumberFromName(file.name || '') || documento.documento || documento.nosso_numero || null,
    documento: documento.documento,
    numero_nf: documento.numero_nf,
    nosso_numero: documento.nosso_numero,
    valor: extractCurrencyValue(mergedText),
    vencimento: extractDate(mergedText),
    nome_cliente: extractNames(mergedText) || null,
    match_strategy: ocrUsed ? `ocr_${ocrSource || 'unknown'}` : 'regex_texto_pdf',
    ocr_used: ocrUsed,
    ocr_source: ocrSource,
  };
}

function scoreFinancialMatch(pdfData: ExtractedBoletoData, record: FinancialRow): MatchCandidate {
  let score = 0;
  const reasons: string[] = [];

  // Boleto tokens from PDF text only — pdf_nome intentionally excluded to avoid false positives
  const pdfBoletoTokens = [
    pdfData.numero_boleto,
    pdfData.documento,
    pdfData.numero_nf,
    pdfData.nosso_numero,
  ]
    .map((item) => normalizeBoletoNumber(item))
    .filter(Boolean);

  const recordBoletoTokens = [
    record.numero_boleto,
    record.documento,
    record.numero_nf,
  ]
    .map((item) => normalizeBoletoNumber(item))
    .filter(Boolean);

  // +50 exact boleto/document token match from PDF text
  const exactBoletoMatch = pdfBoletoTokens.length > 0 && recordBoletoTokens.length > 0 && pdfBoletoTokens.some((token) => recordBoletoTokens.includes(token));
  if (exactBoletoMatch) {
    score += 50;
    if (normalizeBoletoNumber(pdfData.numero_boleto) && recordBoletoTokens.includes(normalizeBoletoNumber(pdfData.numero_boleto))) {
      reasons.push('exact_boleto_text');
    } else {
      reasons.push('exact_document_match');
    }
  }

  // +30 nosso_numero match (strong signal — uniquely identifies the boleto in the bank system)
  const nossoNumeroNorm = normalizeBoletoNumber(pdfData.nosso_numero);
  if (nossoNumeroNorm && recordBoletoTokens.includes(nossoNumeroNorm)) {
    score += 30;
    reasons.push('nosso_numero_match');
  }

  // +25 CPF/CNPJ match — check if record.documento digits appear in extracted PDF text
  const recordDocNumeric = String(record.documento || '').replace(/\D/g, '');
  if (recordDocNumeric.length >= 11) {
    const pdfTextNumeric = String(pdfData.texto_extraido || '').replace(/\D/g, '');
    if (pdfTextNumeric.includes(recordDocNumeric)) {
      score += 25;
      reasons.push('cpf_cnpj_match');
    }
  }

  // +20 filename contains a record boleto token (separate from text extraction, lower weight)
  const filenameLower = normalizeBoletoNumber(pdfData.pdf_nome || '');
  if (filenameLower && recordBoletoTokens.some((token) => token && filenameLower.includes(token))) {
    score += 20;
    reasons.push('filename_boleto_match');
  }

  // +15 value match (within 5% tolerance)
  const valueMatch = compareNumbers(pdfData.valor, record.valor, 0.05);
  if (valueMatch) {
    score += 15;
    reasons.push('boleto_value_match');
  }

  // +10 due date match
  const dueDateMatch = compareIsoDates(pdfData.vencimento, record.data_vencimento);
  if (dueDateMatch) {
    score += 10;
    reasons.push('due_date_match');
  }

  // +5 fuzzy name similarity
  const hasLinhaDigitavel = Boolean(String(pdfData.linha_digitavel || '').trim());
  if (hasLinhaDigitavel) {
    reasons.push('linha_digitavel_detected');
  }

  const similarity = nameSimilarityScore(pdfData.nome_cliente, getClienteEfetivo(record) || record.nome);
  if (similarity >= 0.55) {
    score += 5;
    reasons.push('fuzzy_name_match');
  }

  // Score floor boosts — only when strong signals combine
  if (exactBoletoMatch) {
    score = Math.max(score, 80);
  }
  if (exactBoletoMatch && hasLinhaDigitavel) {
    score = Math.max(score, 90);
  }
  if (exactBoletoMatch && valueMatch) {
    score = Math.max(score, 90);
  }
  if (exactBoletoMatch && valueMatch && dueDateMatch) {
    score = Math.max(score, 95);
  }

  return { record, score: Math.min(100, score), reasons };
}

function shouldUpdateBoletoMatch(record: FinancialRow, nextConfidence: number) {
  const currentConfidence = Number(record.boleto_match_confidence || 0);
  const currentStatus = buildBoletoStatus(record.boleto_status);
  if (!record.drive_file_id) return true;
  if (currentStatus === 'erro' || currentStatus === 'pendente' || currentStatus === 'nao_encontrado') return true;
  return nextConfidence >= currentConfidence;
}

async function upsertBoletoMatchResult(
  supabaseAdmin: AdminClient,
  companyId: string,
  record: FinancialRow,
  pdfData: ExtractedBoletoData,
  status: string,
  confidence: number,
  strategy: string,
  errorMessage: string | null,
) {
  if (!shouldUpdateBoletoMatch(record, confidence)) {
    return false;
  }

  const payload: Record<string, unknown> = {
    drive_file_id: pdfData.drive_file_id || record.drive_file_id || null,
    numero_boleto: getNumeroBoletoEfetivo(record) || pdfData.numero_boleto || null,
    linha_digitavel: pdfData.linha_digitavel || record.linha_digitavel || null,
    codigo_barras: pdfData.codigo_barras || record.codigo_barras || null,
    boleto_url: pdfData.boleto_url || record.boleto_url || null,
    boleto_pdf_nome: pdfData.pdf_nome || null,
    boleto_match_confidence: Number(confidence.toFixed(2)),
    boleto_extraido_em: new Date().toISOString(),
    boleto_status: buildBoletoStatus(status),
    boleto_match_strategy: strategy,
    boleto_erro: errorMessage,
    boleto_ocr_used: pdfData.ocr_used ?? false,
    boleto_ocr_source: pdfData.ocr_source || null,
    pdf_validation_reason: 'ok',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('registros_financeiros')
    .update(payload)
    .eq('id', record.id)
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);
  return true;
}

async function syncBoletoDriveIntelligentForCompany(
  supabaseAdmin: AdminClient,
  companyId: string,
  token: string,
  limit = 200,
) {
  requireCompanyId(companyId);
  const syncStart = Date.now();
  const requestId = crypto.randomUUID();

  console.log(JSON.stringify({
    event: 'drive_sync_started',
    request_id: requestId,
    company_id: companyId,
    limit,
    ts: new Date().toISOString(),
  }));

  const config = await getSheetsDriveConfig(supabaseAdmin, companyId);
  const folderId = requireDriveFolderId(await ensureConfiguredFolderId(config?.drive_root_folder_id, companyId));
  await getDriveFolderInfo(token, folderId);

  const pdfFiles = await listPdfFilesInFolder(token, folderId, limit);
  const { data: rows, error } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, status, drive_file_id, linha_digitavel, codigo_barras, boleto_url, boleto_pdf_nome, boleto_match_confidence, boleto_extraido_em, boleto_status, boleto_match_strategy, boleto_erro, preventiva_enviada, data_envio_preventiva, cobranca_vencimento_enviada, data_envio_vencimento, ultima_cobranca, tentativas_cobranca')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  const records = (rows || []) as FinancialRow[];
  const summary = {
    pdfs_analisados: 0,
    vinculados: 0,
    baixa_confianca: 0,
    conflitos: 0,
    nao_encontrados: 0,
    erros: 0,
  };
  const items: Array<Record<string, unknown>> = [];

  for (const file of pdfFiles) {
    summary.pdfs_analisados += 1;
    const fileStart = Date.now();
    try {
      const pdfData = await extractBoletoDataFromDriveFile(token, file);
      const candidates = records
        .map((record) => scoreFinancialMatch(pdfData, record))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score);

      const best = candidates[0];
      const second = candidates[1];
      let status = 'nao_encontrado';
      let confidence = Number(best?.score || 0);
      let matchedRecord: FinancialRow | null = null;
      let errorMessage: string | null = null;
      let strategy = 'low_confidence';

      if (best && best.score >= 80 && second && second.score >= 80 && Math.abs(best.score - second.score) <= 5) {
        status = 'conflito';
        confidence = Number(best.score);
        matchedRecord = best.record;
        errorMessage = 'Mais de um registro financeiro apresentou score alto semelhante.';
        strategy = 'conflict_high_score';

        console.log(JSON.stringify({
          event: 'drive_match_conflict',
          request_id: requestId,
          company_id: companyId,
          file_id: file.id,
          file_name: file.name,
          financial_record_id: best.record.id,
          confidence_score: confidence,
          second_score: second.score,
          duration_ms: Date.now() - fileStart,
        }));
        await insertAutomationAuditLog(supabaseAdmin, {
          company_id: companyId,
          request_id: requestId,
          action: 'drive_sync_conflict',
          registro_id: best.record.id,
          boleto_file_id: file.id,
          boleto_score: confidence,
          boleto_strategy: strategy,
          boleto_second_score: second.score,
          blocked_reason: 'conflict_high_score',
        });
      } else if (best && best.score >= 80) {
        status = 'encontrado';
        matchedRecord = best.record;
        strategy = best.reasons[0] || 'exact_boleto_text';

        console.log(JSON.stringify({
          event: 'drive_match_found',
          request_id: requestId,
          company_id: companyId,
          file_id: file.id,
          file_name: file.name,
          financial_record_id: best.record.id,
          confidence_score: confidence,
          strategy,
          reasons: best.reasons,
          duration_ms: Date.now() - fileStart,
        }));
      } else if (best && best.score >= 50) {
        status = 'baixa_confianca';
        matchedRecord = best.record;
        strategy = `low_confidence${best.reasons[0] ? `|${best.reasons[0]}` : ''}`;

        console.log(JSON.stringify({
          event: 'drive_match_low_confidence',
          request_id: requestId,
          company_id: companyId,
          file_id: file.id,
          file_name: file.name,
          financial_record_id: best.record.id,
          confidence_score: confidence,
          reasons: best.reasons,
          duration_ms: Date.now() - fileStart,
        }));
        await insertAutomationAuditLog(supabaseAdmin, {
          company_id: companyId,
          request_id: requestId,
          action: 'drive_sync_low_confidence',
          registro_id: best.record.id,
          boleto_file_id: file.id,
          boleto_score: confidence,
          boleto_strategy: strategy,
          blocked_reason: `baixa_confianca_score_${confidence}`,
        });
      } else {
        strategy = 'no_match';

        console.log(JSON.stringify({
          event: 'drive_match_missing',
          request_id: requestId,
          company_id: companyId,
          file_id: file.id,
          file_name: file.name,
          top_score: confidence,
          duration_ms: Date.now() - fileStart,
        }));
      }

      if (matchedRecord) {
        const combinedStrategy = [strategy, pdfData.match_strategy, ...(best?.reasons || [])].filter(Boolean).join('|');
        await upsertBoletoMatchResult(supabaseAdmin, companyId, matchedRecord, pdfData, status, confidence, combinedStrategy, errorMessage);
      }

      if (status === 'encontrado') summary.vinculados += 1;
      else if (status === 'baixa_confianca') summary.baixa_confianca += 1;
      else if (status === 'conflito') summary.conflitos += 1;
      else summary.nao_encontrados += 1;

      items.push({
        pdf_nome: pdfData.pdf_nome,
        drive_file_id: pdfData.drive_file_id,
        registro_id: matchedRecord?.id || null,
        cliente: matchedRecord?.cliente_nome || matchedRecord?.nome || pdfData.nome_cliente || null,
        numero_boleto: matchedRecord?.numero_boleto || pdfData.numero_boleto || null,
        linha_digitavel: pdfData.linha_digitavel,
        valor: pdfData.valor,
        vencimento: pdfData.vencimento,
        confidence,
        status,
        strategy,
        erro: errorMessage,
      });
    } catch (error) {
      summary.erros += 1;
      const errMsg = error instanceof Error ? error.message : 'Falha ao analisar PDF do Drive.';
      console.log(JSON.stringify({
        event: 'drive_sync_failed',
        request_id: requestId,
        company_id: companyId,
        file_id: file.id,
        file_name: file.name,
        error: errMsg,
        duration_ms: Date.now() - fileStart,
      }));
      items.push({
        pdf_nome: file.name || `${file.id}.pdf`,
        drive_file_id: file.id,
        registro_id: null,
        cliente: null,
        numero_boleto: null,
        linha_digitavel: null,
        valor: null,
        vencimento: null,
        confidence: 0,
        status: 'erro',
        erro: errMsg,
      });
    }
  }

  const totalDuration = Date.now() - syncStart;
  console.log(JSON.stringify({
    event: 'drive_sync_completed',
    request_id: requestId,
    company_id: companyId,
    folder_id: folderId,
    summary,
    duration_ms: totalDuration,
  }));

  return {
    folder_id: folderId,
    summary,
    items,
  };
}

async function getBoletoSyncReportData(supabaseAdmin: AdminClient, companyId: string) {
  requireCompanyId(companyId);
  const { data: rows, error } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, nome, cliente_nome, documento, numero_nf, numero_boleto, valor, data_vencimento, linha_digitavel, codigo_barras, boleto_url, boleto_pdf_nome, boleto_match_confidence, boleto_status, boleto_match_strategy, boleto_erro, drive_file_id')
    .eq('company_id', companyId)
    .order('data_vencimento', { ascending: true });

  if (error) throw new Error(error.message);

  const records = rows || [];
  return {
    cards: {
      total_titulos: records.length,
      boletos_encontrados: records.filter((row) => buildBoletoStatus(row.boleto_status) === 'encontrado').length,
      pendentes: records.filter((row) => buildBoletoStatus(row.boleto_status) === 'pendente').length,
      baixa_confianca: records.filter((row) => buildBoletoStatus(row.boleto_status) === 'baixa_confianca').length,
      conflitos: records.filter((row) => buildBoletoStatus(row.boleto_status) === 'conflito').length,
      erros: records.filter((row) => buildBoletoStatus(row.boleto_status) === 'erro').length,
      sem_linha_digitavel: records.filter((row) => !String(row.linha_digitavel || '').trim()).length,
      com_linha_digitavel: records.filter((row) => Boolean(String(row.linha_digitavel || '').trim())).length,
    },
    items: records.map((row) => ({
      id: row.id,
      cliente: getClienteEfetivo(row) || row.nome || 'Cliente',
      documento: row.documento || '-',
      boleto: getNumeroBoletoEfetivo(row) || '-',
      linha_digitavel: row.linha_digitavel || null,
      valor: Number(row.valor || 0),
      vencimento: row.data_vencimento || null,
      confidence: Number(row.boleto_match_confidence || 0),
      status: buildBoletoStatus(row.boleto_status),
      pdf: row.boleto_pdf_nome || null,
      boleto_url: row.boleto_url || null,
      drive_file_id: row.drive_file_id || null,
      erro: row.boleto_erro || null,
    })),
  };
}

async function buildChargePayloadPreview(
  supabaseAdmin: AdminClient,
  companyId: string,
  registroId: string,
) {
  const companyName = await getCompanyName(supabaseAdmin, companyId);
  const config = await getBillingConfigForCompany(supabaseAdmin, companyId);
  const { data: record, error } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, status, drive_file_id, linha_digitavel, codigo_barras, boleto_url, boleto_pdf_nome, boleto_status')
    .eq('id', registroId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!record) throw new Error('Registro financeiro nao encontrado.');
  const { numeroBoletoEfetivo, clienteEfetivo } = logCobrancaMapping(record);

  const eligibility = explainRecordEligibility({
    ...record,
    preventiva_enviada: false,
    data_envio_preventiva: null,
    cobranca_vencimento_enviada: false,
    data_envio_vencimento: null,
    ultima_cobranca: null,
    tentativas_cobranca: 0,
  } as FinancialRow, config as BillingConfigRow | null, todayInSaoPaulo());

  const tipo = (eligibility.etapa || 'atraso') as 'preventiva' | 'vencimento' | 'atraso';
  const message = fillTemplate(resolveTemplate(config as BillingConfigRow | null, tipo), record as Partial<FinancialRow> & Record<string, unknown>, eligibility.dias_atraso || 0, companyName);

  return {
    message,
    payload: {
      company_id: record.company_id,
      registro_id: record.id,
      cliente: clienteEfetivo || record.nome || 'Cliente',
      telefone: record.telefone || '',
      documento: record.documento || numeroBoletoEfetivo || 'nao localizado',
      numero_boleto: numeroBoletoEfetivo || 'nao localizado',
      numero_nf: record.numero_nf || null,
      valor: Number(record.valor || 0),
      vencimento: record.data_vencimento || null,
      status: record.status || 'pendente',
      linha_digitavel: record.linha_digitavel || 'nao localizado',
      codigo_barras: record.codigo_barras || 'nao localizado',
      boleto_url: record.boleto_url || 'nao localizado',
      drive_file_id: record.drive_file_id || null,
      arquivo_encontrado: temBoletoEncontrado(record) || Boolean(record.drive_file_id || record.boleto_url),
      envio_real: false,
      boleto_pdf_nome: record.boleto_pdf_nome || null,
      boleto_status: temBoletoEncontrado(record) ? 'encontrado' : 'sem_boleto',
    },
  };
}

async function prepareManualChargeData(
  supabaseAdmin: AdminClient,
  companyId: string,
  registroId: string,
) {
  const preview = await buildChargePayloadPreview(supabaseAdmin, companyId, registroId);
  const { data: record, error } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento')
    .eq('id', registroId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!record) throw new Error('Registro financeiro nao encontrado.');
  const { numeroBoletoEfetivo, clienteEfetivo } = logCobrancaMapping(record);

  await insertLog(supabaseAdmin, {
    financeiro_id: record.id,
    company_id: companyId,
    data_hora: new Date().toISOString(),
    cliente_nome: clienteEfetivo || record.nome || 'Cliente',
    cliente_numero: record.cliente_numero || null,
    telefone: record.telefone || null,
    documento: record.documento || null,
    numero_boleto: numeroBoletoEfetivo || null,
    numero_nf: record.numero_nf || null,
    valor: Number(record.valor || 0),
    vencimento: record.data_vencimento || null,
    tipo_cobranca: 'manual_assistido',
    dias_atraso: 0,
    arquivo_encontrado: temBoletoEncontrado(preview.payload) || Boolean(preview.payload?.drive_file_id || preview.payload?.boleto_url !== 'nao localizado'),
    drive_file_id: preview.payload?.drive_file_id || null,
    status_envio: 'preparado_manual',
    erro: null,
    payload: preview.payload,
  });

  return {
    message: preview.message,
    payload: preview.payload,
    warning: 'Envio real nao realizado. Copie a mensagem e envie manualmente pelo WhatsApp.',
  };
}

async function sendRealChargesData(
  supabaseAdmin: AdminClient,
  companyId: string,
  userId: string | null,
  items: Array<Record<string, unknown>>,
  options: { allowTestMode?: boolean } = {},
) {
  await assertZapiPaired(supabaseAdmin, companyId, options);

  const sent: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  for (const item of items) {
    const registroId = String(item?.registro_id || item?.id || '').trim();
    const message = String(item?.message || item?.mensagem || '').trim();
    const documento = String(item?.documento || item?.numero_boleto || item?.numero_nf || '').trim();
    const phoneRaw = String(item?.phone || item?.telefone || '').trim();
    const normalizedPhone = normalizeBrazilPhone(phoneRaw);

    let record: Record<string, unknown> | null = null;
    if (registroId) {
      const { data, error } = await supabaseAdmin
        .from('registros_financeiros')
        .select('id, company_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, status, tentativas_cobranca, drive_file_id, boleto_url, boleto_match_confidence')
        .eq('id', registroId)
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        failed.push({
          ...item,
          registro_id: registroId || null,
          telefone: normalizedPhone || phoneRaw || '',
          error: error.message,
        });
        continue;
      }

      record = data;
    }

    const numeroBoletoEfetivo = getNumeroBoletoEfetivo((record || item) as Partial<FinancialRow> & Record<string, unknown>);
    const clienteEfetivo = getClienteEfetivo((record || item) as Partial<FinancialRow> & Record<string, unknown>) || String(item?.cliente || item?.cliente_nome || 'Cliente');
    const dispatchType = 'whatsapp_manual_real';
    const dispatch = await reserveAutomationDispatch(supabaseAdmin, {
      companyId,
      customerId: String(record?.cliente_numero || item?.cliente_numero || registroId || normalizedPhone || ''),
      dueDate: String(record?.data_vencimento || item?.vencimento || ''),
      amount: Number(record?.valor || item?.valor || 0),
      template: String(message || 'manual_message'),
      dispatchType,
      body: {
        registro_id: registroId,
        documento,
        telefone: normalizedPhone || phoneRaw || '',
      },
    });

    const logBase = {
      financeiro_id: String(record?.id || registroId || '').trim() || null,
      company_id: companyId,
      data_hora: new Date().toISOString(),
      cliente_nome: clienteEfetivo || 'Cliente',
      cliente_numero: String(record?.cliente_numero || '') || null,
      telefone: normalizedPhone || phoneRaw || null,
      documento: String(record?.documento || item?.documento || documento || '') || null,
      numero_boleto: numeroBoletoEfetivo || null,
      numero_nf: String(record?.numero_nf || item?.numero_nf || '') || null,
      valor: Number(record?.valor || item?.valor || 0),
      vencimento: String(record?.data_vencimento || item?.vencimento || '') || null,
      tipo_cobranca: 'manual',
      dias_atraso: 0,
      arquivo_encontrado: temBoletoEncontrado((record || item) as Partial<FinancialRow> & Record<string, unknown>),
      drive_file_id: String(record?.drive_file_id || item?.drive_file_id || '') || null,
    };

    if (dispatch.duplicate && !Boolean(item?.force_resend)) {
      await finalizeAutomationDispatch(supabaseAdmin, {
        companyId,
        dispatchType,
        operationHash: dispatch.operationHash,
        status: 'duplicate',
        metadata: { reason: 'manual_dispatch_duplicate' },
      });
      failed.push({
        ...item,
        registro_id: registroId || null,
        telefone: normalizedPhone || phoneRaw || '',
        error: 'Esta operacao ja foi processada anteriormente.',
      });
      continue;
    }

    if (!message) {
      const errorMessage = 'Mensagem vazia para envio real.';
      const failedAt = new Date().toISOString();
      await insertWhatsappCharge(supabaseAdmin, {
        empresa_id: companyId,
        company_id: companyId,
        registro_id: logBase.financeiro_id,
        telefone: normalizedPhone || phoneRaw || '',
        mensagem: '',
        provider: 'zapi',
        provider_message_id: null,
        status: 'failed',
        sent_at: null,
        delivered_at: null,
        read_at: null,
        failed_at: failedAt,
        failure_reason: errorMessage,
        simulated: false,
        force_resend: Boolean(item?.force_resend),
        zapi_message_id: null,
        erro: errorMessage,
        enviado_por: userId,
      });
      await tryInsertLog(supabaseAdmin, {
        ...logBase,
        status_envio: 'erro',
        erro: errorMessage,
        payload: {
          message: '',
          canal: 'whatsapp_real',
          envio_real: true,
          force_resend: Boolean(item?.force_resend),
          simulated: false,
          sent_at: new Date().toISOString(),
        },
      });
      failed.push({
        ...item,
        registro_id: registroId || null,
        telefone: normalizedPhone || phoneRaw || '',
        error: errorMessage,
      });
      await finalizeAutomationDispatch(supabaseAdmin, {
        companyId,
        dispatchType,
        operationHash: dispatch.operationHash,
        status: 'failed',
        metadata: { reason: 'empty_message' },
      });
      continue;
    }

    if (!validatePhone(normalizedPhone)) {
      const errorMessage = 'Telefone invalido para envio real.';
      const failedAt = new Date().toISOString();
      await insertWhatsappCharge(supabaseAdmin, {
        empresa_id: companyId,
        company_id: companyId,
        registro_id: logBase.financeiro_id,
        telefone: normalizedPhone || phoneRaw || '',
        mensagem: message,
        provider: 'zapi',
        provider_message_id: null,
        status: 'failed',
        sent_at: null,
        delivered_at: null,
        read_at: null,
        failed_at: failedAt,
        failure_reason: errorMessage,
        simulated: false,
        force_resend: Boolean(item?.force_resend),
        zapi_message_id: null,
        erro: errorMessage,
        enviado_por: userId,
      });
      await tryInsertLog(supabaseAdmin, {
        ...logBase,
        status_envio: 'erro',
        erro: errorMessage,
        payload: {
          message,
          canal: 'whatsapp_real',
          envio_real: true,
          force_resend: Boolean(item?.force_resend),
          simulated: false,
          sent_at: new Date().toISOString(),
        },
      });
      failed.push({
        ...item,
        registro_id: registroId || null,
        telefone: normalizedPhone || phoneRaw || '',
        error: errorMessage,
      });
      await finalizeAutomationDispatch(supabaseAdmin, {
        companyId,
        dispatchType,
        operationHash: dispatch.operationHash,
        status: 'failed',
        metadata: { reason: 'invalid_phone' },
      });
      continue;
    }

    try {
      // ── PDF-first: attach boleto PDF when drive_file_id is available ─────
      // Falls back to text-only if Drive is not configured, file is missing,
      // download times out, or sendZapiDocument throws.
      const driveFileId = String(record?.drive_file_id || item?.drive_file_id || '').trim();
      let pdfFileName: string | null = null;
      // eslint-disable-next-line prefer-const
      let mergedResult!: {
        normalizedPhone: string; raw: unknown; zaapId: string; messageId: string; id: string;
      };

      if (driveFileId) {
        try {
          const googleToken = await getGoogleAccessToken();
          const pdfFile = await getDriveFileMetadata(googleToken, driveFileId).catch(() => null);
          if (pdfFile?.id) {
            const pdfBase64 = await downloadDriveFileBase64(googleToken, pdfFile.id);
            pdfFileName = pdfFile.name || `${numeroBoletoEfetivo || documento || registroId}.pdf`;
            const zapiCfg = await resolveCompanyZapiConfig(supabaseAdmin, companyId, options);
            const docResult = await sendZapiDocument(zapiCfg, normalizedPhone, message, pdfFileName, pdfBase64);
            const rawData = (docResult.raw || {}) as Record<string, unknown>;
            mergedResult = {
              normalizedPhone,
              raw: docResult.raw,
              zaapId: String(rawData?.zaapId || ''),
              messageId: String(docResult.provider_id || rawData?.messageId || ''),
              id: String(rawData?.id || ''),
            };
            console.log(JSON.stringify({
              event: 'manual_pdf_sent', registro_id: registroId,
              file_id: pdfFile.id, file_name: pdfFileName,
            }));
          } else {
            // drive_file_id was stale / file deleted — fall back to text
            console.log(JSON.stringify({ event: 'manual_pdf_file_missing', registro_id: registroId, drive_file_id: driveFileId }));
            mergedResult = await sendZapiText(supabaseAdmin, companyId, { phone: normalizedPhone, message }, options);
          }
        } catch (pdfErr) {
          // Log and fall back — never let a PDF error block the text send.
          // Reset pdfFileName so pdf_enviado stays false (PDF was NOT delivered).
          pdfFileName = null;
          console.log(JSON.stringify({
            event: 'manual_pdf_fallback_to_text', registro_id: registroId,
            drive_file_id: driveFileId,
            error: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
          }));
          mergedResult = await sendZapiText(supabaseAdmin, companyId, { phone: normalizedPhone, message }, options);
        }
      } else {
        mergedResult = await sendZapiText(supabaseAdmin, companyId, { phone: normalizedPhone, message }, options);
      }
      // ── unified result from either path ──────────────────────────────────

      const sendResult = mergedResult;
      console.log('[ZAPI RAW RESPONSE]', sendResult);

      const providerMessageId =
        sendResult?.messageId ||
        sendResult?.raw?.messageId ||
        sendResult?.raw?.message_id ||
        sendResult?.id ||
        sendResult?.zaapId ||
        sendResult?.raw?.id ||
        sendResult?.raw?.zaapId ||
        sendResult?.raw?.response?.messageId ||
        null;

      const initialStatus = providerMessageId ? 'sent' : 'queued';
      const sentAt = providerMessageId
        ? new Date().toISOString()
        : null;

      await insertWhatsappCharge(supabaseAdmin, {
        empresa_id: companyId,
        company_id: companyId,
        registro_id: logBase.financeiro_id,
        telefone: sendResult.normalizedPhone,
        mensagem: message,
        provider: 'zapi',
        provider_message_id: providerMessageId,
        status: initialStatus,
        sent_at: sentAt,
        delivered_at: null,
        read_at: null,
        failed_at: null,
        failure_reason: null,
        simulated: false,
        force_resend: Boolean(item?.force_resend),
        zapi_message_id: providerMessageId,
        erro: null,
        enviado_por: userId,
      });

      await tryInsertLog(supabaseAdmin, {
        ...logBase,
        telefone: sendResult.normalizedPhone,
        status_envio: 'sucesso',
        erro: null,
        payload: {
          message,
          canal: 'whatsapp_real',
          envio_real: true,
          force_resend: Boolean(item?.force_resend),
          simulated: false,
          sent_at: sentAt,
          provider_message_id: providerMessageId,
          zapi_message_id: sendResult.messageId || null,
          zapi_zaap_id: sendResult.zaapId || null,
          zapi_id: sendResult.id || null,
          zapi_raw: sendResult.raw,
          pdf_file_name: pdfFileName || null,
          pdf_enviado: Boolean(pdfFileName),
        },
      });

      console.log('[WHATSAPP TRACKING SAVED]', {
        providerMessageId,
        initialStatus,
        sentAt,
      });
      await finalizeAutomationDispatch(supabaseAdmin, {
        companyId,
        dispatchType,
        operationHash: dispatch.operationHash,
        status: 'completed',
        externalReference: providerMessageId,
        metadata: {
          provider_message_id: providerMessageId,
          sent_at: sentAt,
        },
      });

      if (record?.id) {
        await supabaseAdmin
          .from('registros_financeiros')
          .update({
            ultima_cobranca: new Date().toISOString(),
            tentativas_cobranca: Number(record?.tentativas_cobranca || 0) + 1,
          })
          .eq('id', record.id)
          .eq('company_id', companyId);
      }

      sent.push({
        ...item,
        registro_id: registroId || null,
        telefone: sendResult.normalizedPhone,
        cliente_nome: clienteEfetivo,
        documento: logBase.documento,
        numero_boleto: numeroBoletoEfetivo || '',
        status: initialStatus,
        provider_message_id: providerMessageId,
        sent_at: sentAt,
        zapi_message_id: sendResult.messageId || null,
        zapi_zaap_id: sendResult.zaapId || null,
        zapiResponse: sendResult.raw,
        pdf_file_name: pdfFileName || null,
        pdf_enviado: Boolean(pdfFileName),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedAt = new Date().toISOString();
      await insertWhatsappCharge(supabaseAdmin, {
        empresa_id: companyId,
        company_id: companyId,
        registro_id: logBase.financeiro_id,
        telefone: normalizedPhone || phoneRaw || '',
        mensagem: message,
        provider: 'zapi',
        provider_message_id: null,
        status: 'failed',
        sent_at: null,
        delivered_at: null,
        read_at: null,
        failed_at: failedAt,
        failure_reason: errorMessage,
        simulated: false,
        force_resend: Boolean(item?.force_resend),
        zapi_message_id: null,
        erro: errorMessage,
        enviado_por: userId,
      });
      await tryInsertLog(supabaseAdmin, {
        ...logBase,
        status_envio: 'erro',
        erro: errorMessage,
        payload: {
          message,
          canal: 'whatsapp_real',
          envio_real: true,
          force_resend: Boolean(item?.force_resend),
          simulated: false,
          sent_at: new Date().toISOString(),
        },
      });
      failed.push({
        ...item,
        registro_id: registroId || null,
        telefone: normalizedPhone || phoneRaw || '',
        error: errorMessage,
      });
      await finalizeAutomationDispatch(supabaseAdmin, {
        companyId,
        dispatchType,
        operationHash: dispatch.operationHash,
        status: 'failed',
        metadata: { reason: errorMessage },
      });
    }
  }

  return { sent, failed };
}

async function sendSingleChargeData(
  supabaseAdmin: AdminClient,
  companyId: string,
  userId: string | null,
  registroId: string,
  simulate: boolean,
  customMessage: string,
  forceResend: boolean,
  options: { allowTestMode?: boolean } = {},
) {
  await assertZapiPaired(supabaseAdmin, companyId, options);

  const preview = await buildChargePayloadPreview(supabaseAdmin, companyId, registroId);
  const finalMessage = String(customMessage || preview.message || '').trim();
  const recentCharge = await findRecentSuccessfulWhatsappCharge(supabaseAdmin, companyId, registroId);

  if (recentCharge && !forceResend) {
    return {
      success: false,
      duplicate: true,
      simulated: simulate,
      zapiResponse: null,
      message: 'Esta cobrança já foi enviada recentemente. Confirme o reenvio para mandar novamente.',
      payload: {
        ...preview.payload,
        message: finalMessage,
      },
    };
  }

  const item = {
    ...preview.payload,
    id: registroId,
    registro_id: registroId,
    charge_id: registroId,
    force_resend: forceResend,
    phone: String(preview.payload?.telefone || ''),
    telefone: String(preview.payload?.telefone || ''),
    message: finalMessage,
    mensagem: finalMessage,
  };

  if (simulate) {
    const { data: record, error } = await supabaseAdmin
      .from('registros_financeiros')
      .select('id, company_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, status')
      .eq('id', registroId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!record) throw new Error('Registro financeiro nao encontrado.');

    const { numeroBoletoEfetivo, clienteEfetivo } = logCobrancaMapping(record);

    await tryInsertLog(supabaseAdmin, {
      financeiro_id: record.id,
      company_id: companyId,
      data_hora: new Date().toISOString(),
      cliente_nome: clienteEfetivo || record.nome || 'Cliente',
      cliente_numero: record.cliente_numero || null,
      telefone: String(record.telefone || '') || null,
      documento: String(record.documento || numeroBoletoEfetivo || '') || null,
      numero_boleto: numeroBoletoEfetivo || null,
      numero_nf: String(record.numero_nf || '') || null,
      valor: Number(record.valor || 0),
      vencimento: String(record.data_vencimento || '') || null,
      tipo_cobranca: 'manual',
      dias_atraso: 0,
      arquivo_encontrado: temBoletoEncontrado(record),
      drive_file_id: null,
      status_envio: 'sucesso_simulado',
      erro: null,
      payload: {
        ...preview.payload,
        message: finalMessage,
        canal: 'whatsapp_simulado',
        simulated: true,
        force_resend: forceResend,
        sent_at: new Date().toISOString(),
      },
    });

    return {
      success: true,
      simulated: true,
      zapiResponse: null,
      status: 'simulated',
      message: 'Simulacao executada, nenhuma mensagem real enviada.',
      payload: {
        ...preview.payload,
        message: finalMessage,
        force_resend: forceResend,
      },
    };
  }

  const result = await sendRealChargesData(
    supabaseAdmin,
    companyId,
    userId,
    [item],
    options,
  );

  if (result.failed.length) {
    const firstError = result.failed[0];
    throw new Error(String(firstError?.error || 'Falha ao enviar a cobranca individual.'));
  }

  return {
    success: true,
    simulated: false,
    status: String(result.sent[0]?.status || 'sent'),
    provider_message_id: result.sent[0]?.provider_message_id || null,
    sent_at: result.sent[0]?.sent_at || new Date().toISOString(),
    zapiResponse: result.sent[0] || null,
    message: 'Mensagem enviada via WhatsApp',
    payload: {
      ...preview.payload,
      message: finalMessage,
      force_resend: forceResend,
    },
  };
}

async function sendZapiDocument(
  zapiConfig: { instanceId: string; token: string; clientToken: string; source?: string },
  phone: string,
  caption: string,
  fileName: string,
  base64: string,
) {
  const instanceId = zapiConfig.instanceId || '';
  const token = zapiConfig.token || '';
  const clientToken = zapiConfig.clientToken || '';
  const documentEndpoint =
    Deno.env.get('ZAPI_DOCUMENT_ENDPOINT') ||
    (instanceId && token ? `https://api.z-api.io/instances/${instanceId}/token/${token}/send-file-base64` : '');

  if (!instanceId || !token || !clientToken || !documentEndpoint) {
    throw new Error('WhatsApp API não configurada. Defina ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN e, se necessário, ZAPI_DOCUMENT_ENDPOINT.');
  }

  const response = await withTimeout(
    (signal) =>
      fetch(documentEndpoint, {
        method: 'POST',
        signal,
        headers: {
          'Client-Token': clientToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone,
          fileName,
          mimeType: 'application/pdf',
          caption,
          base64,
        }),
      }),
    15000,
    'Tempo limite excedido ao enviar documento pela Z-API.',
  );

  const data = await response.json().catch(() => ({}));

  console.log('[ZAPI COMPANY REQUEST]', {
    source: zapiConfig.source || 'company',
    mode: 'document',
    phone,
    ok: response.ok,
    status: response.status,
  });
  console.log('[ZAPI COMPANY RESPONSE]', data);

  if (response.status === 429) {
    throw new Error(`ZAPI_RATE_LIMITED: Rate limit atingido (HTTP 429). O lote será pausado automaticamente.`);
  }
  if (!response.ok) {
    console.error('[ZAPI ERROR]', data);
    throw new Error(String(data?.message || data?.error || `HTTP ${response.status}`));
  }

  return {
    provider_id: String(data?.zaapId || data?.messageId || ''),
    raw: data,
  };
}

async function sendZapiText(
  supabaseAdmin: AdminClient,
  companyId: string,
  { phone, message }: { phone: string; message: string },
  options: { allowTestMode?: boolean } = {},
) {
  const zapiConfig = await resolveCompanyZapiConfig(supabaseAdmin, companyId, options);

  const normalizedPhone = normalizeBrazilPhone(phone);
  if (!validatePhone(normalizedPhone)) {
    throw new Error('Telefone invalido para envio real.');
  }

  const response = await withTimeout(
    (signal) =>
      fetch(
        `https://api.z-api.io/instances/${zapiConfig.instanceId}/token/${zapiConfig.token}/send-text`,
        {
          method: 'POST',
          signal,
          headers: {
            'Client-Token': zapiConfig.clientToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: normalizedPhone,
            message,
          }),
        },
      ),
    15000,
    'Tempo limite excedido ao enviar mensagem pela Z-API.',
  );

  const data = await response.json().catch(() => ({}));
  console.log('[ZAPI REQUEST]', {
    company_id: companyId,
    source: zapiConfig.source,
    phone: normalizedPhone,
    ok: response.ok,
    status: response.status,
    data,
  });
  console.log('[ZAPI COMPANY REQUEST]', {
    company_id: companyId,
    source: zapiConfig.source,
    mode: 'text',
    phone: normalizedPhone,
    ok: response.ok,
    status: response.status,
  });

  if (!response.ok) {
    console.error('[ZAPI ERROR]', {
      company_id: companyId,
      source: zapiConfig.source,
      phone: normalizedPhone,
      status: response.status,
      data,
    });
    throw new Error(`Z-API erro ${response.status}: ${JSON.stringify(data)}`);
  }

  console.log('[ZAPI RESPONSE]', data);
  console.log('[ZAPI COMPANY RESPONSE]', data);

  return {
    normalizedPhone,
    raw: data,
    zaapId: String(data?.zaapId || ''),
    messageId: String(data?.messageId || data?.id || ''),
    id: String(data?.id || ''),
  };
}

// ── ETAPA 5: Z-API Circuit Breaker ───────────────────────────────────────────
// Opens after 3 consecutive failures within 5 minutes. Auto-resets after 15 min.
async function checkZapiCircuit(supabaseAdmin: AdminClient, companyId: string): Promise<{ open: boolean; reason?: string }> {
  try {
    const { data } = await supabaseAdmin
      .from('zapi_circuit_state')
      .select('state, opened_at, failure_count, last_failure_at')
      .eq('company_id', companyId)
      .maybeSingle();
    if (!data) return { open: false };
    if (data.state !== 'open') return { open: false };
    // Auto-reset after 15 minutes
    const openedAt = data.opened_at ? new Date(data.opened_at).getTime() : 0;
    if (Date.now() - openedAt > 15 * 60 * 1000) {
      await supabaseAdmin.from('zapi_circuit_state').update({
        state: 'closed', failure_count: 0, updated_at: new Date().toISOString(),
      }).eq('company_id', companyId);
      return { open: false };
    }
    return { open: true, reason: `Z-API circuit aberto: ${data.failure_count} falhas consecutivas.` };
  } catch {
    return { open: false };
  }
}

async function recordZapiSuccess(supabaseAdmin: AdminClient, companyId: string) {
  try {
    await supabaseAdmin.from('zapi_circuit_state').upsert({
      company_id: companyId,
      state: 'closed',
      failure_count: 0,
      last_success_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' });
  } catch { /* non-critical */ }
}

async function recordZapiFailure(supabaseAdmin: AdminClient, companyId: string, error: string) {
  try {
    const { data: current } = await supabaseAdmin
      .from('zapi_circuit_state')
      .select('failure_count')
      .eq('company_id', companyId)
      .maybeSingle();
    const newCount = Number(current?.failure_count || 0) + 1;
    const circuitOpen = newCount >= 3;
    await supabaseAdmin.from('zapi_circuit_state').upsert({
      company_id: companyId,
      failure_count: newCount,
      state: circuitOpen ? 'open' : 'closed',
      opened_at: circuitOpen ? new Date().toISOString() : null,
      last_failure_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' });
    if (circuitOpen) {
      console.warn(JSON.stringify({ event: 'zapi_circuit_opened', company_id: companyId, failure_count: newCount, error }));
    }
  } catch { /* non-critical */ }
}

// ── ETAPA 6: Forensic audit log ───────────────────────────────────────────────
async function insertAutomationAuditLog(
  supabaseAdmin: AdminClient,
  payload: {
    company_id: string;
    request_id?: string | null;
    action: string;
    registro_id?: string | null;
    charge_id?: string | null;
    telefone?: string | null;
    boleto_file_id?: string | null;
    boleto_score?: number | null;
    boleto_strategy?: string | null;
    boleto_second_score?: number | null;
    template_used?: string | null;
    pdf_hash?: string | null;
    zapi_status?: string | null;
    provider_message_id?: string | null;
    request_payload?: Record<string, unknown> | null;
    response_payload?: Record<string, unknown> | null;
    duration_ms?: number | null;
    blocked_reason?: string | null;
    ocr_used?: boolean;
    ocr_source?: string | null;
    pdf_validation_reason?: string | null;
    user_id?: string | null;
  },
) {
  try {
    await supabaseAdmin.from('automation_audit_logs').insert({
      company_id: payload.company_id,
      request_id: payload.request_id || null,
      action: payload.action,
      registro_id: payload.registro_id || null,
      charge_id: payload.charge_id || null,
      telefone: payload.telefone || null,
      boleto_file_id: payload.boleto_file_id || null,
      boleto_score: payload.boleto_score ?? null,
      boleto_strategy: payload.boleto_strategy || null,
      boleto_second_score: payload.boleto_second_score ?? null,
      template_used: payload.template_used || null,
      pdf_hash: payload.pdf_hash || null,
      zapi_status: payload.zapi_status || null,
      provider_message_id: payload.provider_message_id || null,
      request_payload: payload.request_payload || null,
      response_payload: payload.response_payload || null,
      duration_ms: payload.duration_ms ?? null,
      blocked_reason: payload.blocked_reason || null,
      ocr_used: payload.ocr_used ?? false,
      ocr_source: payload.ocr_source || null,
      pdf_validation_reason: payload.pdf_validation_reason || null,
      user_id: payload.user_id || null,
    });
  } catch (error) {
    console.warn('[AUDIT_LOG] insert warning', error instanceof Error ? error.message : error);
  }
}

async function insertLog(
  supabaseAdmin: AdminClient,
  payload: Record<string, unknown>,
) {
  console.log('[LOG_COBRANCA] payload', payload);
  const { data, error } = await supabaseAdmin
    .from('logs_cobranca')
    .insert(payload)
    .select('id, status_envio, envio_hash')
    .maybeSingle();

  if (!error) return data || null;
  if (!isEnvioHashConflictMessage(error.message)) throw new Error(error.message);

  const envioHash = String(payload.envio_hash || '').trim();
  const companyId = String(payload.company_id || '').trim();
  if (!envioHash || !companyId) throw new Error(error.message);

  const { data: existingLog, error: existingLogError } = await supabaseAdmin
    .from('logs_cobranca')
    .select('id, status_envio, envio_hash')
    .eq('company_id', companyId)
    .eq('envio_hash', envioHash)
    .maybeSingle();

  if (existingLogError) throw new Error(existingLogError.message);
  if (!existingLog?.id) throw new Error(error.message);

  const incomingStatus = String(payload.status_envio || '').trim().toLowerCase();
  const existingStatus = String(existingLog.status_envio || '').trim().toLowerCase();

  if (isSuccessfulLogStatus(existingStatus) && ['erro', 'ignorado'].includes(incomingStatus)) {
    return existingLog;
  }

  const updatePayload = {
    ...payload,
    data_hora: payload.data_hora || new Date().toISOString(),
  };

  const { data: updatedLog, error: updateError } = await supabaseAdmin
    .from('logs_cobranca')
    .update(updatePayload)
    .eq('id', existingLog.id)
    .eq('company_id', companyId)
    .select('id, status_envio, envio_hash')
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  return updatedLog || existingLog;
}

async function tryInsertLog(
  supabaseAdmin: AdminClient,
  payload: Record<string, unknown>,
) {
  try {
    await insertLog(supabaseAdmin, payload);
  } catch (error) {
    console.warn('[LOG_COBRANCA] warning', error instanceof Error ? error.message : error);
  }
}

async function insertWhatsappCharge(
  supabaseAdmin: AdminClient,
  payload: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin.from('cobrancas_whatsapp').insert(payload);
  if (error) throw new Error(error.message);
}

async function findRecentSuccessfulWhatsappCharge(
  supabaseAdmin: AdminClient,
  companyId: string,
  registroId: string,
) {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('cobrancas_whatsapp')
    .select('id, empresa_id, registro_id, telefone, mensagem, status, zapi_message_id, provider_message_id, created_at')
    .eq('empresa_id', companyId)
    .eq('registro_id', registroId)
    .in('status', ['queued', 'sent', 'delivered', 'read', 'enviado'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

// Idempotência e concorrência:
// • automation_dispatches registra uma única operação efetiva por chave
//   (company_id + customer_id + due_date + template). Envios duplicados
//   dentro da janela de idempotência são rejeitados sem gerar cobrança.
// • logs_cobranca: o duplicado é inserido com status "ignorado" para
//   auditoria — permite rastrear tentativas sem inflar o contador de envios.
// • Dois usuários simultâneos para o mesmo título: o primeiro sucede,
//   o segundo retorna ok=false + duplicate=true (sem retry automático).
async function reserveAutomationDispatch(
  supabaseAdmin: AdminClient,
  payload: {
    companyId: string;
    customerId: string;
    dueDate: string;
    amount: number;
    template: string;
    dispatchType: string;
    body?: Record<string, unknown>;
    externalReference?: string | null;
  },
) {
  try {
    const operationHash = await sha256Hex([
      payload.companyId,
      payload.customerId,
      payload.dueDate,
      Number(payload.amount || 0).toFixed(2),
      payload.template,
      payload.dispatchType,
    ].join('|'));
    const payloadHash = await sha256Hex(JSON.stringify(payload.body || {}));

    // Block only if: (a) concurrent processing lock is FRESH (< 10 min), OR
    // (b) a completed dispatch happened within the last 5 minutes.
    // Stale processing rows (> 10 min) and failed records allow retry.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const tenMinutesAgo  = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: existing } = await supabaseAdmin
      .from('automation_dispatches')
      .select('id, status, created_at')
      .eq('company_id', payload.companyId)
      .eq('operation_hash', operationHash)
      .eq('dispatch_type', payload.dispatchType)
      .or(`and(status.eq.processing,created_at.gte.${tenMinutesAgo}),and(status.eq.completed,created_at.gte.${fiveMinutesAgo})`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return {
        duplicate: true,
        operationHash,
        dispatchId: existing.id,
      };
    }

    const { data, error } = await supabaseAdmin
      .from('automation_dispatches')
      .insert({
        company_id: payload.companyId,
        operation_hash: operationHash,
        dispatch_type: payload.dispatchType,
        status: 'processing',
        payload_hash: payloadHash,
        external_reference: payload.externalReference || null,
        metadata: {
          customer_id: payload.customerId,
          due_date: payload.dueDate,
          amount: payload.amount,
          template: payload.template,
        },
      })
      .select('id')
      .single();

    if (error) {
      if (String(error.message || '').includes('duplicate') || String((error as { code?: string })?.code || '') === '23505') {
        return {
          duplicate: true,
          operationHash,
          dispatchId: null,
        };
      }
      throw error;
    }

    return {
      duplicate: false,
      operationHash,
      dispatchId: data?.id || null,
    };
  } catch (error) {
    console.warn('[IDEMPOTENCY] reserve warning', error instanceof Error ? error.message : error);
    return {
      duplicate: false,
      operationHash: '',
      dispatchId: null,
    };
  }
}

async function finalizeAutomationDispatch(
  supabaseAdmin: AdminClient,
  payload: {
    companyId: string;
    dispatchType: string;
    operationHash: string;
    status: 'completed' | 'failed' | 'duplicate' | 'skipped' | 'retrying';
    externalReference?: string | null;
    retryCount?: number;
    metadata?: Record<string, unknown>;
  },
) {
  if (!payload.operationHash) return;

  try {
    const { error } = await supabaseAdmin
      .from('automation_dispatches')
      .update({
        status: payload.status,
        external_reference: payload.externalReference || null,
        completed_at: ['completed', 'duplicate', 'skipped'].includes(payload.status) ? new Date().toISOString() : null,
        retry_count: Number(payload.retryCount || 0),
        last_retry_at: payload.status === 'retrying' ? new Date().toISOString() : null,
        metadata: payload.metadata || {},
      })
      .eq('company_id', payload.companyId)
      .eq('operation_hash', payload.operationHash)
      .eq('dispatch_type', payload.dispatchType);

    if (error) throw error;
  } catch (error) {
    console.warn('[IDEMPOTENCY] finalize warning', error instanceof Error ? error.message : error);
  }
}

// ── Retry classification ──────────────────────────────────────────────────────
// Error codes returned by processChargeForRecord that warrant automatic retry.
const RETRY_MAX_ATTEMPTS = 3;
// Backoff: attempt 0→1: +5 min | 1→2: +15 min | 2→3: +1 h | then stop
const RETRY_BACKOFF_MS: number[] = [5 * 60_000, 15 * 60_000, 60 * 60_000];
const SUCCESS_LOG_STATUSES = new Set(['sucesso', 'sucesso_simulado', 'sucesso_sem_boleto', 'simulado']);

const RETRYABLE_ERROR_CODES = new Set([
  'timeout',
  'network_error',
  'zapi_rate_limited',
  'zapi_5xx',
  'drive_quota',
  'temporary_unavailable',
]);

const NON_RETRYABLE_ERROR_CODES = new Set([
  'telefone_invalido',
  'boleto_not_found',
  'boleto_not_pdf',
  'boleto_too_large',
  'forbidden',
  'duplicate_recent',
  'exact_match_false',
  'conflito_boleto',
]);

function normalizeRetryErrorCode(
  reason: string | null | undefined,
  errorMessage?: string | null,
): string {
  const code = String(reason || '').trim().toLowerCase();
  const message = String(errorMessage || '').trim().toLowerCase();

  if (code === 'zapi_rate_limited' || message.includes('rate limited') || message.includes('http 429')) {
    return 'zapi_rate_limited';
  }
  if (code === 'telefone_invalido' || code === 'invalid_phone_sem_boleto') return 'telefone_invalido';
  if (code === 'boleto_conflito' || code === 'boleto_conflito_live_search') return 'conflito_boleto';
  if (code === 'exact_match_false') return 'exact_match_false';
  if (code === 'duplicado_no_dia' || code === 'duplicado_idempotencia' || code === 'dispatch_already_exists') {
    return 'duplicate_recent';
  }
  if (code === 'boleto_nao_encontrado' || code === 'pdf_download_not_found') return 'boleto_not_found';
  if (code === 'pdf_download_not_pdf') return 'boleto_not_pdf';
  if (code === 'pdf_download_too_large') return 'boleto_too_large';
  if (code === 'pdf_download_forbidden') return 'forbidden';
  if (code === 'pdf_download_quota_exceeded') return 'drive_quota';
  if (code === 'pdf_download_timeout' || code === 'batch_timeout' || message.includes('tempo limite') || message.includes('timeout')) {
    return 'timeout';
  }
  if (
    message.includes('fetch failed')
    || message.includes('network')
    || message.includes('econnreset')
    || message.includes('socket hang up')
    || message.includes('connection reset')
  ) {
    return 'network_error';
  }
  if (/http 5\d\d/.test(message) || /z-api erro 5\d\d/.test(message)) {
    return 'zapi_5xx';
  }
  if (code === 'zapi_circuit_open' || code === 'zapi_text_sem_boleto_error' || code === 'unexpected_exception') {
    return 'temporary_unavailable';
  }

  return code || 'temporary_unavailable';
}

function classifyError(
  reason: string | null | undefined,
  errorMessage?: string | null,
): { retryable: boolean; errorCode: string } {
  const errorCode = normalizeRetryErrorCode(reason, errorMessage);
  if (NON_RETRYABLE_ERROR_CODES.has(errorCode)) return { retryable: false, errorCode };
  if (RETRYABLE_ERROR_CODES.has(errorCode)) return { retryable: true, errorCode };
  return { retryable: true, errorCode };
}

/** Compute the ISO timestamp for the next retry given the current attempt count (0-based). */
function computeNextRetryAt(currentRetryCount: number): string | null {
  if (currentRetryCount >= RETRY_BACKOFF_MS.length) return null;
  return new Date(Date.now() + RETRY_BACKOFF_MS[currentRetryCount]).toISOString();
}

/** Fields added to every error log payload so the retry handler can filter and schedule. */
function buildRetryMeta(
  reason: string | null | undefined,
  retryCount: number,
  errorMessage?: string | null,
): Record<string, unknown> {
  const { retryable, errorCode } = classifyError(reason, errorMessage);
  return {
    retryable,
    retry_count: retryCount,
    max_retries: RETRY_MAX_ATTEMPTS,
    next_retry_at: retryable ? computeNextRetryAt(retryCount) : null,
    last_error_code: errorCode,
    last_error_message: errorMessage || String(reason || '') || null,
  };
}

function readPayloadObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isSuccessfulLogStatus(status: string | null | undefined) {
  return SUCCESS_LOG_STATUSES.has(String(status || '').trim().toLowerCase());
}

function isRetryableLogCode(code: string | null | undefined) {
  return RETRYABLE_ERROR_CODES.has(normalizeRetryErrorCode(code));
}

function isEnvioHashConflictMessage(message: string | null | undefined) {
  const normalized = String(message || '').trim().toLowerCase();
  return normalized.includes('idx_logs_cobranca_envio_hash')
    || (normalized.includes('duplicate key value') && normalized.includes('envio_hash'));
}

// ── lookupBoletoFileForRecord ─────────────────────────────────────────────────
// Replaces legacy searchDriveFilesScored() in processChargeForRecord.
// Builds a query from the FinancialRow, calls testBoletoLookup (Phase 0 targeted
// + BFS fallback), and returns the best file with exact_match metadata.
interface BoletoLookupResult {
  file: DriveCandidate | null;
  score: number;
  exactMatch: boolean;
  strategy: string;
  viewUrl: string | null;
  secondScore: number | null;
  secondFile: DriveCandidate | null;
}

async function lookupBoletoFileForRecord(
  token: string,
  folderId: string,
  record: FinancialRow,
): Promise<BoletoLookupResult> {
  const empty: BoletoLookupResult = {
    file: null, score: 0, exactMatch: false,
    strategy: 'not_found', viewUrl: null, secondScore: null, secondFile: null,
  };

  // Build query: "<numero_boleto>, <nome_cliente>"
  // numero_boleto is the raw field (e.g. "4239-2"); nome / cliente_nome is the client.
  const numPart = String(record.numero_boleto || record.documento || '').trim();
  const namePart = String(record.cliente_nome || record.nome || '').trim();
  const queryParts: string[] = [];
  if (numPart) queryParts.push(numPart);
  if (namePart) queryParts.push(namePart);
  const query = queryParts.join(', ');

  if (!query) {
    return { ...empty, strategy: 'no_query' };
  }

  let outcome: LookupOutcome;
  try {
    outcome = await testBoletoLookup(token, folderId, query, { maxFolders: 100 });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'lookup_boleto_file_error',
      error: String(err),
      record_id: record.id,
      query,
    }));
    return { ...empty, strategy: 'lookup_error' };
  }

  const results = outcome.results;
  if (!results.length) {
    return { ...empty, strategy: 'not_found' };
  }

  const best = results[0];
  const second = results[1] ?? null;
  const strategy = outcome.meta.targeted_lookup_used
    ? (best.exact_match ? 'targeted_exact' : 'targeted_base')
    : (best.exact_match ? 'bfs_exact' : 'bfs_base');

  console.log(JSON.stringify({
    event: 'lookup_boleto_file_result',
    record_id: record.id,
    query,
    file_id: best.file.id,
    file_name: best.file.name,
    score: best.score,
    exact_match: best.exact_match,
    strategy,
    targeted_used: outcome.meta.targeted_lookup_used,
  }));

  return {
    file: best.file,
    score: best.score,
    exactMatch: best.exact_match,
    strategy,
    viewUrl: best.file.webViewLink || null,
    secondScore: second?.score ?? null,
    secondFile: second?.file ?? null,
  };
}

async function processChargeForRecord(
  supabaseAdmin: AdminClient,
  record: FinancialRow,
  config: BillingConfigRow | null,
  token: string,
  folderId: string,
  todayIso: string,
  force = false,
  simulate = false,
  companyName = '',
  batchCtx?: { batchId: string; batchIndex: number; batchTotal: number; retryCount?: number; previousLogId?: string | null },
) {
  const normalizedStatus = normalizeText(record.status);
  if (CLOSED_STATUSES.has(normalizedStatus)) {
    return { status: 'ignorado', reason: 'status_fechado' };
  }

  if (!OPEN_STATUSES.has(normalizedStatus)) {
    return { status: 'ignorado', reason: 'status_fora_da_regua' };
  }

  const phone = normalizePhone(record.telefone);
  if (!validatePhone(phone)) {
    return { status: 'ignorado', reason: 'telefone_invalido' };
  }

  const diff = isoDaysDiff(record.data_vencimento, todayIso);
  if (diff === null) {
    return { status: 'ignorado', reason: 'vencimento_invalido' };
  }

  const preventivaDiasAntes = Number(config?.preventiva_dias_antes ?? DEFAULT_PREVENTIVA_DAYS) || DEFAULT_PREVENTIVA_DAYS;
  const enviarNoVencimento = Boolean(config?.enviar_no_vencimento ?? DEFAULT_SEND_ON_DUE_DATE);
  const permitirEnvioSemBoleto = Boolean(config?.permitir_envio_sem_boleto ?? DEFAULT_ALLOW_WITHOUT_BOLETO);
  const limiteCobrancas = Number(config?.limite_cobrancas_por_titulo ?? DEFAULT_LIMIT_PER_TITLE) || DEFAULT_LIMIT_PER_TITLE;

  let tipo: 'preventiva' | 'vencimento' | 'atraso' | null = null;
  if (diff === preventivaDiasAntes && !record.preventiva_enviada) tipo = 'preventiva';
  if (diff === 0 && enviarNoVencimento && !record.cobranca_vencimento_enviada) tipo = 'vencimento';
  if (diff < 0) {
    const atraso = Math.abs(diff);
    const rules = extractRuleDays(config?.regua_atraso);
    if (rules.includes(atraso) && Number(record.tentativas_cobranca || 0) < limiteCobrancas) tipo = 'atraso';
  }

  if (!tipo) {
    return { status: 'ignorado', reason: 'fora_da_regua' };
  }

  const diasAtraso = diff < 0 ? Math.abs(diff) : 0;
  const { numeroBoletoEfetivo, clienteEfetivo } = logCobrancaMapping(record);
  const retryCount = batchCtx?.retryCount ?? 0;
  const hashSeed = `${record.company_id}|${record.id}|${numeroBoletoEfetivo || ''}|${tipo}|${todayIso}`;
  const hash = await sha256Hex(hashSeed);
  const template = resolveTemplate(config, tipo);
  const dispatchType = simulate ? `whatsapp_${tipo}_simulado` : `whatsapp_${tipo}_real`;
  const dispatch = await reserveAutomationDispatch(supabaseAdmin, {
    companyId: record.company_id,
    customerId: String(record.cliente_numero || record.id || ''),
    dueDate: String(record.data_vencimento || ''),
    amount: Number(record.valor || 0),
    template,
    dispatchType,
    body: {
      registro_id: record.id,
      documento: record.documento,
      numero_boleto: numeroBoletoEfetivo,
      tipo,
      simulate,
    },
  });

  if (dispatch.duplicate && !force) {
    await finalizeAutomationDispatch(supabaseAdmin, {
      companyId: record.company_id,
      dispatchType,
      operationHash: dispatch.operationHash,
      status: 'duplicate',
      metadata: { reason: 'dispatch_already_exists' },
    });
    return { status: 'ignorado', reason: 'duplicado_idempotencia' };
  }

  if (!force) {
    const { data: duplicate } = await supabaseAdmin
      .from('logs_cobranca')
      .select('id')
      .eq('company_id', record.company_id)
      .eq('envio_hash', hash)
      .maybeSingle();

    if (duplicate?.id) {
      return { status: 'ignorado', reason: 'duplicado_no_dia' };
    }
  }

  // Security guard: block sends when boleto matching found a conflict
  const boletoStatus = String(record.boleto_status || '').trim();
  if (boletoStatus === 'conflito') {
    await insertLog(supabaseAdmin, {
      financeiro_id: record.id,
      company_id: record.company_id,
      cliente_nome: clienteEfetivo || record.nome,
      cliente_numero: record.cliente_numero,
      telefone: record.telefone,
      documento: record.documento,
      numero_boleto: numeroBoletoEfetivo || null,
      numero_nf: record.numero_nf,
      valor: record.valor,
      vencimento: record.data_vencimento,
      tipo_cobranca: tipo,
      dias_atraso: diasAtraso,
      arquivo_encontrado: false,
      drive_file_id: record.drive_file_id || null,
      status_envio: 'erro',
      erro: 'boleto_conflito',
      payload: {
        company_id: record.company_id,
        record_id: record.id,
        boleto_status: boletoStatus,
        ...buildRetryMeta('boleto_conflito', retryCount, 'Registro bloqueado por conflito de boleto preexistente.'),
      },
      envio_hash: hash,
    });
    await finalizeAutomationDispatch(supabaseAdmin, {
      companyId: record.company_id,
      dispatchType,
      operationHash: dispatch.operationHash,
      status: 'failed',
      metadata: { reason: 'boleto_conflito' },
    });
    return { status: 'erro', reason: 'boleto_conflito' };
  }

  // Use pre-matched boleto from Drive sync when available and confidence is sufficient
  const preMatchedConfidence = Number(record.boleto_match_confidence || 0);
  const usePreMatched = boletoStatus === 'encontrado' && preMatchedConfidence >= 80 && Boolean(record.drive_file_id);

  let file: DriveCandidate | null = null;
  // Tracking vars for new lookup — used in all insertLog payloads below
  let boletoLookupScore = 0;
  let boletoExactMatch = false;
  let boletoViewUrl: string | null = null;
  let boletoLookupStrategy = 'not_searched';
  let lookupBlockedReason: 'exact_match_false' | null = null;

  if (usePreMatched) {
    // Verify the pre-matched file still exists in Drive (cheap metadata call, no re-search)
    file = await getDriveFileMetadata(token, record.drive_file_id!).catch(() => null);
    if (!file?.id) {
      // Pre-matched file missing or inaccessible — fall back to live search
      file = null;
    } else {
      boletoLookupStrategy = 'pre_matched';
      boletoViewUrl = file.webViewLink || null;
      boletoLookupScore = Number(record.boleto_match_confidence || 0);
    }
  }

  // ETAPA 1: Targeted Drive lookup (replaces legacy searchDriveFilesScored)
  if (!file) {
    const lookupResult = await lookupBoletoFileForRecord(token, folderId, record);
    boletoLookupScore = lookupResult.score;
    boletoExactMatch = lookupResult.exactMatch;
    boletoViewUrl = lookupResult.viewUrl;
    boletoLookupStrategy = lookupResult.strategy;

    if (lookupResult.file) {
      const bestScore = lookupResult.score;
      const bestFile = lookupResult.file;
      const secondScore = lookupResult.secondScore;
      const secondFile = lookupResult.secondFile;

      // Conflict: two candidates both >= 80 and within 5 points of each other
      if (bestScore >= 80 && secondScore !== null && secondScore >= 80 && Math.abs(bestScore - secondScore) <= 5) {
        await tryInsertLog(supabaseAdmin, {
          financeiro_id: record.id,
          company_id: record.company_id,
          cliente_nome: clienteEfetivo || record.nome,
          cliente_numero: record.cliente_numero,
          telefone: phone,
          documento: record.documento,
          numero_boleto: numeroBoletoEfetivo || null,
          numero_nf: record.numero_nf,
          valor: record.valor,
          vencimento: record.data_vencimento,
          tipo_cobranca: tipo,
          dias_atraso: diasAtraso,
          arquivo_encontrado: false,
          drive_file_id: bestFile.id,
          status_envio: 'erro',
          erro: 'boleto_conflito_live_search',
          payload: {
            winner_score: bestScore, winner_file_id: bestFile.id, winner_file_name: bestFile.name,
            second_score: secondScore, second_file_id: secondFile?.id ?? null, company_id: record.company_id,
            boleto_lookup_score: boletoLookupScore, boleto_exact_match: boletoExactMatch,
            boleto_lookup_strategy: boletoLookupStrategy,
            ...buildRetryMeta('boleto_conflito_live_search', retryCount, 'Busca ao vivo encontrou dois boletos concorrentes com alta confianca.'),
          },
          envio_hash: hash,
        });
        await insertAutomationAuditLog(supabaseAdmin, {
          company_id: record.company_id, action: 'live_search_conflict_blocked',
          registro_id: record.id, charge_id: record.id,
          boleto_file_id: bestFile.id, boleto_score: bestScore, boleto_strategy: boletoLookupStrategy,
          boleto_second_score: secondScore, blocked_reason: 'conflict_live_search',
        });
        await finalizeAutomationDispatch(supabaseAdmin, {
          companyId: record.company_id, dispatchType, operationHash: dispatch.operationHash,
          status: 'failed', metadata: { reason: 'boleto_conflito_live_search', winner_score: bestScore, second_score: secondScore },
        });
        return { status: 'erro', reason: 'boleto_conflito_live_search' };
      }
      // Low confidence: block attachment if score < 80
      if (bestScore < 80) {
        await insertAutomationAuditLog(supabaseAdmin, {
          company_id: record.company_id, action: 'live_search_low_confidence_blocked',
          registro_id: record.id, charge_id: record.id,
          boleto_file_id: bestFile.id, boleto_score: bestScore, boleto_strategy: boletoLookupStrategy,
          blocked_reason: `baixa_confianca_score_${bestScore}`,
        });
        // file stays null — will be handled by the !file check below
      } else if (!boletoExactMatch) {
        // Score is sufficient but number was only a base match (exact idx=0 token did NOT match).
        // Never attach a PDF without an exact number match — risk of wrong boleto delivery.
        await insertAutomationAuditLog(supabaseAdmin, {
          company_id: record.company_id, action: 'live_search_base_match_no_attach',
          registro_id: record.id, charge_id: record.id,
          boleto_file_id: bestFile.id, boleto_score: bestScore, boleto_strategy: boletoLookupStrategy,
          blocked_reason: 'exact_match_required_for_attachment',
        });
        console.log(JSON.stringify({
          event: 'attachment_blocked_base_match',
          company_id: record.company_id, record_id: record.id,
          file_name: bestFile.name, score: bestScore,
        }));
        lookupBlockedReason = 'exact_match_false';
        // file stays null — falls through to !permitirEnvioSemBoleto check or text-only
      } else {
        file = bestFile;
        await insertAutomationAuditLog(supabaseAdmin, {
          company_id: record.company_id, action: 'live_search_matched',
          registro_id: record.id, boleto_file_id: bestFile.id,
          boleto_score: bestScore, boleto_strategy: boletoLookupStrategy,
          boleto_second_score: secondScore ?? null,
        });
      }
    }
  }

  if (!file?.id && !permitirEnvioSemBoleto) {
    const errorReason = lookupBlockedReason || 'boleto_nao_encontrado';
    await insertLog(supabaseAdmin, {
      financeiro_id: record.id,
      company_id: record.company_id,
      cliente_nome: clienteEfetivo || record.nome,
      cliente_numero: record.cliente_numero,
      telefone: record.telefone,
      documento: record.documento,
      numero_boleto: numeroBoletoEfetivo || null,
      numero_nf: record.numero_nf,
      valor: record.valor,
      vencimento: record.data_vencimento,
      tipo_cobranca: tipo,
      dias_atraso: diasAtraso,
      arquivo_encontrado: false,
      drive_file_id: null,
      status_envio: 'erro',
      erro: errorReason,
      payload: {
        company_id: record.company_id,
        record_id: record.id,
        boleto_lookup_score: boletoLookupScore,
        boleto_exact_match: boletoExactMatch,
        boleto_view_url: boletoViewUrl,
        boleto_lookup_strategy: boletoLookupStrategy,
        ...buildRetryMeta(errorReason, retryCount, lookupBlockedReason ? 'Arquivo localizado sem exact match seguro para anexo.' : 'Nenhum boleto elegivel encontrado para envio.'),
      },
      envio_hash: hash,
    });
    await finalizeAutomationDispatch(supabaseAdmin, {
      companyId: record.company_id,
      dispatchType,
      operationHash: dispatch.operationHash,
      status: 'failed',
      metadata: { reason: errorReason },
    });
    return { status: 'erro', reason: errorReason };
  }

  const message = fillTemplate(template, record, diasAtraso, companyName);

  if (simulate) {
    // Validate attachment readiness without downloading the full PDF.
    // Fetch Drive file metadata (mimeType + size) to confirm the PDF is accessible.
    let attachmentStrategy = 'none';
    let attachmentReady = false;
    let attachmentBlockReason: string | null = null;
    let attachmentSizeMb: number | null = null;
    let simMimeType: string | null = null;
    let simSizeBytes: number | null = null;

    if (file?.id) {
      try {
        const simMetaResp = await withTimeout(
          (signal) => fetch(
            `https://www.googleapis.com/drive/v3/files/${file!.id}?fields=id,mimeType,size&supportsAllDrives=true`,
            { signal, headers: { Authorization: `Bearer ${token}` } },
          ),
          10000,
          'Timeout ao validar metadados do PDF na simulação.',
        );
        if (simMetaResp.ok) {
          const simMeta = await simMetaResp.json().catch(() => ({})) as { mimeType?: string; size?: string };
          simMimeType = simMeta.mimeType || null;
          simSizeBytes = simMeta.size ? Number(simMeta.size) : null;
          attachmentSizeMb = simSizeBytes !== null ? Math.round((simSizeBytes / 1024 / 1024) * 100) / 100 : null;

          if (simMimeType && simMimeType !== 'application/pdf') {
            attachmentBlockReason = `not_pdf:${simMimeType}`;
          } else if (simSizeBytes !== null && simSizeBytes > PDF_MAX_SIZE_BYTES_DEFAULT) {
            attachmentBlockReason = `too_large:${attachmentSizeMb}MB`;
          } else {
            attachmentReady = true;
            attachmentStrategy = boletoExactMatch ? 'exact_match_pdf' : 'pre_matched_pdf';
          }
        } else {
          attachmentBlockReason = `drive_http_${simMetaResp.status}`;
        }
      } catch (simMetaErr) {
        attachmentBlockReason = `meta_error:${simMetaErr instanceof Error ? simMetaErr.message : String(simMetaErr)}`;
      }
    } else {
      attachmentBlockReason = boletoExactMatch
        ? 'file_not_set'
        : (!boletoLookupScore ? 'not_found' : 'base_match_only');
    }

    await insertLog(supabaseAdmin, {
      financeiro_id: record.id,
      company_id: record.company_id,
      cliente_nome: clienteEfetivo || record.nome,
      cliente_numero: record.cliente_numero,
      telefone: phone,
      documento: record.documento,
      numero_boleto: numeroBoletoEfetivo || null,
      numero_nf: record.numero_nf,
      valor: record.valor,
      vencimento: record.data_vencimento,
      tipo_cobranca: tipo,
      dias_atraso: diasAtraso,
      arquivo_encontrado: Boolean(file?.id),
      drive_file_id: file?.id || null,
      status_envio: 'sucesso_simulado',
      erro: null,
      payload: {
        company_id: record.company_id,
        record_id: record.id,
        stage: tipo,
        simulate: true,
        file_name: file?.name || null,
        message_preview: message,
        boleto_lookup_score: boletoLookupScore,
        boleto_exact_match: boletoExactMatch,
        boleto_view_url: boletoViewUrl,
        boleto_lookup_strategy: boletoLookupStrategy,
        // Attachment simulation fields
        attachment_strategy: attachmentStrategy,
        attachment_ready: attachmentReady,
        attachment_block_reason: attachmentBlockReason,
        attachment_size_mb: attachmentSizeMb,
        boleto_download_mime: simMimeType,
        boleto_download_size: simSizeBytes,
        would_send_attachment: attachmentReady,
        // Batch context
        batch_id: batchCtx?.batchId ?? null,
        batch_index: batchCtx?.batchIndex ?? null,
        batch_total: batchCtx?.batchTotal ?? null,
      },
      envio_hash: hash,
    });
    await finalizeAutomationDispatch(supabaseAdmin, {
      companyId: record.company_id,
      dispatchType,
      operationHash: dispatch.operationHash,
      status: 'completed',
      metadata: {
        simulated: true,
        file_name: file?.name || null,
        attachment_ready: attachmentReady,
        attachment_block_reason: attachmentBlockReason,
      },
    });
    // Forensic audit for simulated sends — allows BoletoMatchStatus panel to show them
    await insertAutomationAuditLog(supabaseAdmin, {
      company_id: record.company_id,
      action: 'whatsapp_charge_simulated',
      registro_id: record.id,
      charge_id: record.id,
      telefone: phone,
      boleto_file_id: file?.id || null,
      boleto_score: boletoLookupScore || Number(record.boleto_match_confidence || 0) || null,
      boleto_strategy: boletoLookupStrategy || record.boleto_match_strategy || null,
      template_used: tipo,
      zapi_status: 'simulated',
      request_payload: { tipo, dias_atraso: diasAtraso, simulate: true, document: record.documento, phone },
      response_payload: {
        simulated: true,
        file_name: file?.name || null,
        message_preview: message,
        attachment_ready: attachmentReady,
        attachment_block_reason: attachmentBlockReason,
        attachment_size_mb: attachmentSizeMb,
      },
    });

    return {
      status: 'sucesso',
      tipo,
      fileId: file?.id || null,
      simulated: true,
      message,
      fileName: file?.name || `${numeroBoletoEfetivo || record.documento || record.id}.pdf`,
      attachment_strategy: attachmentStrategy,
      attachment_ready: attachmentReady,
      attachment_block_reason: attachmentBlockReason,
      attachment_size_mb: attachmentSizeMb,
      would_send_attachment: attachmentReady,
    };
  }

  if (!file?.id) {
    // permitirEnvioSemBoleto: send text-only message without PDF attachment.
    // This path is only reached for real sends (simulate block already returned above).
    if (permitirEnvioSemBoleto) {
      const zapiTextConfig = await resolveCompanyZapiConfig(supabaseAdmin, record.company_id, { allowTestMode: false });
      const normalizedPhone = normalizeBrazilPhone(phone);
      if (!validatePhone(normalizedPhone)) {
        await tryInsertLog(supabaseAdmin, {
          financeiro_id: record.id, company_id: record.company_id,
          cliente_nome: clienteEfetivo || record.nome, cliente_numero: record.cliente_numero,
          telefone: normalizedPhone, documento: record.documento,
          numero_boleto: numeroBoletoEfetivo || null, numero_nf: record.numero_nf,
          valor: record.valor, vencimento: record.data_vencimento, tipo_cobranca: tipo,
          dias_atraso: diasAtraso, arquivo_encontrado: false, drive_file_id: null,
          status_envio: 'erro', erro: 'invalid_phone_sem_boleto', envio_hash: hash,
          payload: {
            company_id: record.company_id,
            record_id: record.id,
            sem_boleto: true,
            ...buildRetryMeta('invalid_phone_sem_boleto', retryCount, 'Telefone invalido para envio sem boleto.'),
          },
        });
        await finalizeAutomationDispatch(supabaseAdmin, {
          companyId: record.company_id, dispatchType, operationHash: dispatch.operationHash,
          status: 'failed', metadata: { reason: 'invalid_phone_sem_boleto' },
        });
        return { status: 'erro', reason: 'invalid_phone_sem_boleto' };
      }
      const textResponse = await withTimeout(
        (signal) =>
          fetch(`https://api.z-api.io/instances/${zapiTextConfig.instanceId}/token/${zapiTextConfig.token}/send-text`, {
            method: 'POST', signal,
            headers: { 'Client-Token': zapiTextConfig.clientToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: normalizedPhone, message }),
          }),
        15000,
        'Timeout ao enviar texto sem boleto.',
      );
      const textData = await textResponse.json().catch(() => ({}));
      if (!textResponse.ok) {
        const textErrorMessage = `Z-API text sem boleto HTTP ${textResponse.status}: ${JSON.stringify(textData)}`;
        await tryInsertLog(supabaseAdmin, {
          financeiro_id: record.id, company_id: record.company_id,
          cliente_nome: clienteEfetivo || record.nome, cliente_numero: record.cliente_numero,
          telefone: normalizedPhone, documento: record.documento,
          numero_boleto: numeroBoletoEfetivo || null, numero_nf: record.numero_nf,
          valor: record.valor, vencimento: record.data_vencimento, tipo_cobranca: tipo,
          dias_atraso: diasAtraso, arquivo_encontrado: false, drive_file_id: null,
          status_envio: 'erro', erro: 'zapi_text_sem_boleto_error', envio_hash: hash,
          payload: {
            company_id: record.company_id,
            record_id: record.id,
            sem_boleto: true,
            zapi_status_code: textResponse.status,
            ...buildRetryMeta('zapi_text_sem_boleto_error', retryCount, textErrorMessage),
          },
        });
        await finalizeAutomationDispatch(supabaseAdmin, {
          companyId: record.company_id, dispatchType, operationHash: dispatch.operationHash,
          status: 'failed', metadata: { reason: 'zapi_text_sem_boleto_error' },
        });
        return { status: 'erro', reason: 'zapi_text_sem_boleto_error' };
      }
      const textProviderId = String(textData?.zaapId || textData?.messageId || '');
      await insertLog(supabaseAdmin, {
        financeiro_id: record.id, company_id: record.company_id,
        cliente_nome: clienteEfetivo || record.nome, cliente_numero: record.cliente_numero,
        telefone: normalizedPhone, documento: record.documento,
        numero_boleto: numeroBoletoEfetivo || null, numero_nf: record.numero_nf,
        valor: record.valor, vencimento: record.data_vencimento, tipo_cobranca: tipo,
        dias_atraso: diasAtraso, arquivo_encontrado: false, drive_file_id: null,
        status_envio: 'sucesso_sem_boleto', erro: null, envio_hash: hash,
        payload: {
          tipo,
          phone: normalizedPhone,
          message_preview: message,
          sem_boleto: true,
          retry_count: retryCount,
          max_retries: RETRY_MAX_ATTEMPTS,
          previous_log_id: batchCtx?.previousLogId ?? null,
        },
      });
      await finalizeAutomationDispatch(supabaseAdmin, {
        companyId: record.company_id, dispatchType, operationHash: dispatch.operationHash,
        status: 'completed', externalReference: textProviderId,
        metadata: { sem_boleto: true, provider_message_id: textProviderId },
      });
      return { status: 'sucesso', tipo, fileId: null, simulated: false, message, sem_boleto: true };
    }

    await finalizeAutomationDispatch(supabaseAdmin, {
      companyId: record.company_id,
      dispatchType,
      operationHash: dispatch.operationHash,
      status: 'failed',
      metadata: { reason: 'boleto_nao_encontrado' },
    });
    return { status: 'erro', reason: 'boleto_nao_encontrado' };
  }

  // ETAPA 5: Circuit breaker check before Z-API call
  const circuit = await checkZapiCircuit(supabaseAdmin, record.company_id);
  if (circuit.open) {
    await tryInsertLog(supabaseAdmin, {
      financeiro_id: record.id, company_id: record.company_id,
      cliente_nome: clienteEfetivo || record.nome, cliente_numero: record.cliente_numero,
      telefone: phone, documento: record.documento, numero_boleto: numeroBoletoEfetivo || null,
      valor: record.valor, vencimento: record.data_vencimento, tipo_cobranca: tipo,
      dias_atraso: diasAtraso, arquivo_encontrado: Boolean(file?.id), drive_file_id: file?.id || null,
      status_envio: 'erro', erro: 'zapi_circuit_open', envio_hash: hash,
      payload: {
        company_id: record.company_id,
        record_id: record.id,
        circuit_reason: circuit.reason,
        ...buildRetryMeta('zapi_circuit_open', retryCount, circuit.reason || 'Circuit breaker da Z-API aberto.'),
      },
    });
    await finalizeAutomationDispatch(supabaseAdmin, {
      companyId: record.company_id, dispatchType, operationHash: dispatch.operationHash,
      status: 'failed', metadata: { reason: 'zapi_circuit_open' },
    });
    return { status: 'erro', reason: 'zapi_circuit_open' };
  }

  const zapiConfig = await resolveCompanyZapiConfig(supabaseAdmin, record.company_id, { allowTestMode: false });

  // ── ETAPA 2: Download PDF with validation ─────────────────────────────────
  const pdfFileName = file.name || `${numeroBoletoEfetivo || record.documento || record.id}.pdf`;
  const dlResult = await downloadDrivePdfFile(token, file.id);

  console.log(JSON.stringify({
    event: dlResult.ok ? 'pdf_download_ok' : 'pdf_download_failed',
    company_id: record.company_id, record_id: record.id,
    file_id: file.id, file_name: pdfFileName,
    mime_type: dlResult.mimeType, size_bytes: dlResult.sizeBytes,
    error: dlResult.error ?? null, error_code: dlResult.errorCode ?? null,
  }));

  // If download failed for a structural reason (not_found, forbidden, too_large, not_pdf),
  // block the send and log — do NOT silently fall back to text when the PDF was found but invalid.
  if (!dlResult.ok) {
    const hardBlock = dlResult.errorCode === 'not_found'
      || dlResult.errorCode === 'forbidden'
      || dlResult.errorCode === 'too_large'
      || dlResult.errorCode === 'not_pdf';

    if (hardBlock) {
      await insertLog(supabaseAdmin, {
        financeiro_id: record.id, company_id: record.company_id,
        cliente_nome: clienteEfetivo || record.nome, cliente_numero: record.cliente_numero,
        telefone: phone, documento: record.documento,
        numero_boleto: numeroBoletoEfetivo || null, numero_nf: record.numero_nf,
        valor: record.valor, vencimento: record.data_vencimento, tipo_cobranca: tipo,
        dias_atraso: diasAtraso, arquivo_encontrado: true, drive_file_id: file.id,
        status_envio: 'erro', erro: `pdf_download_${dlResult.errorCode}`, envio_hash: hash,
        payload: {
          company_id: record.company_id, record_id: record.id,
          boleto_file_id: file.id, boleto_file_name: pdfFileName,
          boleto_download_ok: false, boleto_download_size: dlResult.sizeBytes,
          boleto_download_mime: dlResult.mimeType,
          download_error: dlResult.error, download_error_code: dlResult.errorCode,
          boleto_lookup_score: boletoLookupScore, boleto_exact_match: boletoExactMatch,
          boleto_view_url: boletoViewUrl, boleto_lookup_strategy: boletoLookupStrategy,
          ...buildRetryMeta(`pdf_download_${dlResult.errorCode}`, retryCount, dlResult.error),
        },
      });
      await finalizeAutomationDispatch(supabaseAdmin, {
        companyId: record.company_id, dispatchType, operationHash: dispatch.operationHash,
        status: 'failed', metadata: { reason: `pdf_download_${dlResult.errorCode}`, error: dlResult.error },
      });
      return { status: 'erro', reason: `pdf_download_${dlResult.errorCode}` };
    }
    // Transient errors (timeout, quota, unknown) → fall back to text-only send
  }

  let sendResult: { provider_id: string; raw: unknown };
  let pdfAttached = dlResult.ok;
  let attachmentError: string | null = null;
  const sendStartedAt = Date.now();

  if (dlResult.ok && dlResult.base64) {
    // ── ETAPA 3: Send with PDF attachment ────────────────────────────────────
    try {
      sendResult = await sendZapiDocument(zapiConfig, phone, message, pdfFileName, dlResult.base64);
      await recordZapiSuccess(supabaseAdmin, record.company_id);
      console.log(JSON.stringify({
        event: 'attachment_sent', company_id: record.company_id, record_id: record.id,
        file_id: file.id, file_name: pdfFileName, size_bytes: dlResult.sizeBytes, tipo, phone,
      }));
    } catch (sendErr) {
      attachmentError = sendErr instanceof Error ? sendErr.message : String(sendErr);
      await recordZapiFailure(supabaseAdmin, record.company_id, attachmentError);
      console.log(JSON.stringify({
        event: 'attachment_send_failed', company_id: record.company_id, record_id: record.id,
        file_id: file.id, file_name: pdfFileName, tipo, phone, error: attachmentError,
      }));

      // 429 Rate limit — stop immediately, do not fall back to text (that would also hit the limit)
      if (attachmentError.includes('ZAPI_RATE_LIMITED:') || attachmentError.includes('429')) {
        await tryInsertLog(supabaseAdmin, {
          financeiro_id: record.id, company_id: record.company_id,
          cliente_nome: clienteEfetivo || record.nome, cliente_numero: record.cliente_numero,
          telefone: phone, documento: record.documento,
          numero_boleto: numeroBoletoEfetivo || null, numero_nf: record.numero_nf,
          valor: record.valor, vencimento: record.data_vencimento, tipo_cobranca: tipo,
          dias_atraso: diasAtraso, arquivo_encontrado: true, drive_file_id: file.id,
          status_envio: 'erro', erro: 'zapi_rate_limited', envio_hash: hash,
          payload: {
            company_id: record.company_id, record_id: record.id,
            boleto_file_id: file.id, boleto_file_name: pdfFileName,
            boleto_download_ok: true, boleto_exact_match: boletoExactMatch,
            boleto_lookup_strategy: boletoLookupStrategy,
            batch_id: batchCtx?.batchId ?? null,
            batch_index: batchCtx?.batchIndex ?? null,
            batch_total: batchCtx?.batchTotal ?? null,
            ...buildRetryMeta('zapi_rate_limited', retryCount, attachmentError),
          },
        });
        await finalizeAutomationDispatch(supabaseAdmin, {
          companyId: record.company_id, dispatchType, operationHash: dispatch.operationHash,
          status: 'failed', metadata: { reason: 'zapi_rate_limited' },
        });
        return { status: 'erro', reason: 'zapi_rate_limited' };
      }

      // Fallback: Z-API rejected the PDF (too large for WA, format issue, etc.)
      // Try text-only so the customer still receives the charge message.
      pdfAttached = false;
      try {
        const textResp = await withTimeout(
          (signal) => fetch(
            `https://api.z-api.io/instances/${zapiConfig.instanceId}/token/${zapiConfig.token}/send-text`,
            {
              method: 'POST', signal,
              headers: { 'Client-Token': zapiConfig.clientToken, 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone, message }),
            },
          ),
          15000,
          'Timeout ao enviar texto fallback após falha de anexo PDF.',
        );
        const textData = await textResp.json().catch(() => ({}));
        if (!textResp.ok) {
          throw new Error(`Z-API text fallback HTTP ${textResp.status}: ${JSON.stringify(textData)}`);
        }
        sendResult = { provider_id: String(textData?.zaapId || textData?.messageId || ''), raw: textData };
        await recordZapiSuccess(supabaseAdmin, record.company_id);
        console.log(JSON.stringify({
          event: 'attachment_text_fallback_sent', company_id: record.company_id,
          record_id: record.id, tipo, phone, original_pdf_error: attachmentError,
        }));
      } catch (textFallbackErr) {
        const textErrMsg = textFallbackErr instanceof Error ? textFallbackErr.message : String(textFallbackErr);
        await recordZapiFailure(supabaseAdmin, record.company_id, textErrMsg);
        console.log(JSON.stringify({
          event: 'attachment_text_fallback_failed', company_id: record.company_id,
          record_id: record.id, tipo, phone, error: textErrMsg,
        }));
        await tryInsertLog(supabaseAdmin, {
          financeiro_id: record.id, company_id: record.company_id,
          cliente_nome: clienteEfetivo || record.nome, cliente_numero: record.cliente_numero,
          telefone: phone, documento: record.documento,
          numero_boleto: numeroBoletoEfetivo || null, numero_nf: record.numero_nf,
          valor: record.valor, vencimento: record.data_vencimento, tipo_cobranca: tipo,
          dias_atraso: diasAtraso, arquivo_encontrado: true, drive_file_id: file.id,
          status_envio: 'erro', erro: 'zapi_text_sem_boleto_error', envio_hash: hash,
          payload: {
            company_id: record.company_id,
            record_id: record.id,
            boleto_file_id: file.id,
            boleto_file_name: pdfFileName,
            boleto_lookup_score: boletoLookupScore,
            boleto_exact_match: boletoExactMatch,
            boleto_lookup_strategy: boletoLookupStrategy,
            attachment_error: attachmentError,
            fallback_text_error: textErrMsg,
            ...buildRetryMeta('zapi_text_sem_boleto_error', retryCount, textErrMsg),
          },
        });
        await finalizeAutomationDispatch(supabaseAdmin, {
          companyId: record.company_id, dispatchType, operationHash: dispatch.operationHash,
          status: 'failed', metadata: { reason: 'zapi_text_sem_boleto_error', error: textErrMsg },
        });
        return { status: 'erro', reason: 'zapi_text_sem_boleto_error' };
      }
    }
  } else {
    // Download had a transient error — send text-only directly
    pdfAttached = false;
    try {
      const textResp = await withTimeout(
        (signal) => fetch(
          `https://api.z-api.io/instances/${zapiConfig.instanceId}/token/${zapiConfig.token}/send-text`,
          {
            method: 'POST', signal,
            headers: { 'Client-Token': zapiConfig.clientToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, message }),
          },
        ),
        15000,
        'Timeout ao enviar texto (fallback por falha de download do PDF).',
      );
      const textData = await textResp.json().catch(() => ({}));
      if (!textResp.ok) {
        throw new Error(`Z-API text (dl-fallback) HTTP ${textResp.status}: ${JSON.stringify(textData)}`);
      }
      sendResult = { provider_id: String(textData?.zaapId || textData?.messageId || ''), raw: textData };
      await recordZapiSuccess(supabaseAdmin, record.company_id);
      console.log(JSON.stringify({
        event: 'download_failed_text_fallback_sent', company_id: record.company_id,
        record_id: record.id, tipo, phone, download_error: dlResult.error,
      }));
    } catch (textErr) {
      const textErrMsg = textErr instanceof Error ? textErr.message : String(textErr);
      await recordZapiFailure(supabaseAdmin, record.company_id, textErrMsg);
      await tryInsertLog(supabaseAdmin, {
        financeiro_id: record.id, company_id: record.company_id,
        cliente_nome: clienteEfetivo || record.nome, cliente_numero: record.cliente_numero,
        telefone: phone, documento: record.documento,
        numero_boleto: numeroBoletoEfetivo || null, numero_nf: record.numero_nf,
        valor: record.valor, vencimento: record.data_vencimento, tipo_cobranca: tipo,
        dias_atraso: diasAtraso, arquivo_encontrado: Boolean(file?.id), drive_file_id: file?.id || null,
        status_envio: 'erro', erro: 'zapi_text_sem_boleto_error', envio_hash: hash,
        payload: {
          company_id: record.company_id,
          record_id: record.id,
          boleto_file_id: file?.id || null,
          boleto_file_name: pdfFileName,
          boleto_download_ok: dlResult.ok,
          boleto_download_mime: dlResult.mimeType,
          boleto_download_size: dlResult.sizeBytes,
          fallback_text_error: textErrMsg,
          ...buildRetryMeta('zapi_text_sem_boleto_error', retryCount, textErrMsg),
        },
      });
      await finalizeAutomationDispatch(supabaseAdmin, {
        companyId: record.company_id, dispatchType, operationHash: dispatch.operationHash,
        status: 'failed', metadata: { reason: 'zapi_text_sem_boleto_error', error: textErrMsg },
      });
      return { status: 'erro', reason: 'zapi_text_sem_boleto_error' };
    }
  }

  const sentAt = new Date().toISOString();
  const providerMessageId = sendResult!.provider_id || null;

  await insertWhatsappCharge(supabaseAdmin, {
    empresa_id: record.company_id,
    company_id: record.company_id,
    registro_id: record.id,
    telefone: phone,
    mensagem: message,
    provider: 'zapi',
    provider_message_id: providerMessageId,
    status: 'sent',
    sent_at: sentAt,
    delivered_at: null,
    read_at: null,
    failed_at: null,
    failure_reason: null,
    simulated: false,
    force_resend: false,
    zapi_message_id: providerMessageId,
    erro: null,
  });

  const updatePayload: Record<string, unknown> = {
    drive_file_id: record.drive_file_id || file.id,
  };

  if (tipo === 'preventiva') {
    updatePayload.preventiva_enviada = true;
    updatePayload.data_envio_preventiva = new Date().toISOString();
  } else if (tipo === 'vencimento') {
    updatePayload.cobranca_vencimento_enviada = true;
    updatePayload.data_envio_vencimento = new Date().toISOString();
  } else {
    updatePayload.ultima_cobranca = new Date().toISOString();
    updatePayload.tentativas_cobranca = Number(record.tentativas_cobranca || 0) + 1;
  }

  await supabaseAdmin
    .from('registros_financeiros')
    .update(updatePayload)
    .eq('id', record.id)
    .eq('company_id', record.company_id);

  await insertLog(supabaseAdmin, {
    financeiro_id: record.id,
    company_id: record.company_id,
    cliente_nome: clienteEfetivo || record.nome,
    cliente_numero: record.cliente_numero,
    telefone: phone,
    documento: record.documento,
    numero_boleto: numeroBoletoEfetivo || null,
    numero_nf: record.numero_nf,
    valor: record.valor,
    vencimento: record.data_vencimento,
    tipo_cobranca: tipo,
    dias_atraso: diasAtraso,
    arquivo_encontrado: true,
    drive_file_id: file.id,
    status_envio: 'sucesso',
    erro: null,
    payload: {
      company_id: record.company_id,
      record_id: record.id,
      provider_message_id: providerMessageId,
      stage: tipo,
      sent_at: sentAt,
      pdf_attachment: pdfAttached,
      pdf_file_name: pdfAttached ? pdfFileName : null,
      // Drive lookup
      boleto_lookup_score: boletoLookupScore,
      boleto_exact_match: boletoExactMatch,
      boleto_view_url: boletoViewUrl,
      boleto_lookup_strategy: boletoLookupStrategy,
      // Download result
      boleto_file_id: file.id,
      boleto_file_name: pdfFileName,
      boleto_download_ok: dlResult.ok,
      boleto_download_size: dlResult.sizeBytes,
      boleto_download_mime: dlResult.mimeType,
      // Attachment result
      whatsapp_attachment_sent: pdfAttached,
      whatsapp_attachment_error: attachmentError,
      retry_count: retryCount,
      max_retries: RETRY_MAX_ATTEMPTS,
      previous_log_id: batchCtx?.previousLogId ?? null,
      // Batch context
      batch_id: batchCtx?.batchId ?? null,
      batch_index: batchCtx?.batchIndex ?? null,
      batch_total: batchCtx?.batchTotal ?? null,
    },
    envio_hash: hash,
  });
  await finalizeAutomationDispatch(supabaseAdmin, {
    companyId: record.company_id,
    dispatchType,
    operationHash: dispatch.operationHash,
    status: 'completed',
    externalReference: providerMessageId,
    metadata: {
      provider_message_id: providerMessageId,
      sent_at: sentAt,
      pdf_attachment: pdfAttached,
    },
  });

  // ETAPA 6: Forensic audit — record full send evidence
  await insertAutomationAuditLog(supabaseAdmin, {
    company_id: record.company_id,
    action: 'whatsapp_charge_sent',
    registro_id: record.id,
    charge_id: record.id,
    telefone: phone,
    boleto_file_id: file.id,
    boleto_score: boletoLookupScore || Number(record.boleto_match_confidence || 0) || null,
    boleto_strategy: boletoLookupStrategy || record.boleto_match_strategy || null,
    template_used: tipo,
    zapi_status: 'sent',
    provider_message_id: providerMessageId,
    duration_ms: Date.now() - sendStartedAt,
    request_payload: {
      tipo, dias_atraso: diasAtraso, document: record.documento, phone,
      file_id: file.id, file_name: pdfFileName,
      boleto_exact_match: boletoExactMatch,
    },
    response_payload: {
      provider_message_id: providerMessageId, sent_at: sentAt,
      pdf_attached: pdfAttached,
      download_size_bytes: dlResult.sizeBytes,
      attachment_error: attachmentError,
    },
  });

  console.log(JSON.stringify({
    event: 'attachment_sent',
    company_id: record.company_id,
    financial_record_id: record.id,
    file_id: file.id,
    file_name: file.name,
    tipo,
    provider_message_id: providerMessageId,
    phone,
    sent_at: sentAt,
  }));

  return {
    status: 'sucesso',
    tipo,
    fileId: file.id,
    fileName: pdfFileName,
    providerMessageId,
    pdfAttached,
    boletoExactMatch,
    boletoLookupStrategy,
  };
}

function explainRecordEligibility(
  record: FinancialRow,
  config: BillingConfigRow | null,
  todayIso: string,
) {
  const normalizedStatus = normalizeText(record.status);
  const phone = normalizePhone(record.telefone);
  const diff = isoDaysDiff(record.data_vencimento, todayIso);
  const rules = extractRuleDays(config?.regua_atraso);
  const preventivaDiasAntes = Number(config?.preventiva_dias_antes ?? DEFAULT_PREVENTIVA_DAYS) || DEFAULT_PREVENTIVA_DAYS;
  const enviarNoVencimento = Boolean(config?.enviar_no_vencimento ?? DEFAULT_SEND_ON_DUE_DATE);
  const limiteCobrancas = Number(config?.limite_cobrancas_por_titulo ?? DEFAULT_LIMIT_PER_TITLE) || DEFAULT_LIMIT_PER_TITLE;

  let etapa: 'preventiva' | 'vencimento' | 'atraso' | null = null;
  let motivo = '';

  if (CLOSED_STATUSES.has(normalizedStatus)) {
    motivo = 'status_fechado';
  } else if (!OPEN_STATUSES.has(normalizedStatus)) {
    motivo = 'status_fora_da_regua';
  } else if (!validatePhone(phone)) {
    motivo = 'telefone_invalido';
  } else if (diff === null) {
    motivo = 'vencimento_invalido';
  } else if (diff === preventivaDiasAntes && record.preventiva_enviada) {
    motivo = 'preventiva_ja_enviada';
  } else if (diff === 0 && enviarNoVencimento && record.cobranca_vencimento_enviada) {
    motivo = 'vencimento_ja_enviado';
  } else if (diff === preventivaDiasAntes && !record.preventiva_enviada) {
    etapa = 'preventiva';
  } else if (diff === 0 && enviarNoVencimento && !record.cobranca_vencimento_enviada) {
    etapa = 'vencimento';
  } else if (diff < 0) {
    const atraso = Math.abs(diff);
    if (Number(record.tentativas_cobranca || 0) >= limiteCobrancas) motivo = 'limite_cobrancas_atingido';
    else if (rules.includes(atraso)) etapa = 'atraso';
    else motivo = 'fora_da_regua';
  } else if (diff === 0 && !enviarNoVencimento) {
    motivo = 'vencimento_desativado';
  } else {
    motivo = 'fora_da_regua';
  }

  return {
    etapa,
    motivo_nao_elegivel: motivo || null,
    dias_para_vencer: diff,
    dias_atraso: diff !== null && diff < 0 ? Math.abs(diff) : 0,
    status_aberto: OPEN_STATUSES.has(normalizedStatus) && !CLOSED_STATUSES.has(normalizedStatus),
    telefone_valido: validatePhone(phone),
    vencimento_parseado: diff !== null,
  };
}

async function computeEnvioHashForRecord(
  record: FinancialRow,
  config: BillingConfigRow | null,
  todayIso: string,
) {
  const eligibility = explainRecordEligibility(record, config, todayIso);
  if (!eligibility.etapa) return null;
  const { numeroBoletoEfetivo } = logCobrancaMapping(record);
  return sha256Hex(`${record.company_id}|${record.id}|${numeroBoletoEfetivo || ''}|${eligibility.etapa}|${todayIso}`);
}

async function getOverview(supabaseAdmin: AdminClient, companyId: string, todayIso: string) {
  const start = `${todayIso}T00:00:00-03:00`;
  const end = `${todayIso}T23:59:59-03:00`;

  const { data: rows, error } = await supabaseAdmin
    .from('logs_cobranca')
    .select('id, financeiro_id, cliente_nome, documento, numero_boleto, telefone, tipo_cobranca, status_envio, erro, data_hora, arquivo_encontrado, created_at')
    .eq('company_id', companyId)
    .gte('data_hora', start)
    .lte('data_hora', end)
    .order('data_hora', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  const allRows = rows || [];
  const isSuccessRow = (row: { status_envio?: string | null }) => row.status_envio === 'sucesso' || row.status_envio === 'sucesso_simulado' || row.status_envio === 'simulado';
  return {
    summary: {
      enviados_hoje: allRows.filter((row) => isSuccessRow(row)).length,
      preventivos: allRows.filter((row) => row.tipo_cobranca === 'preventiva' && isSuccessRow(row)).length,
      vencimento: allRows.filter((row) => row.tipo_cobranca === 'vencimento' && isSuccessRow(row)).length,
      atraso: allRows.filter((row) => row.tipo_cobranca === 'atraso' && isSuccessRow(row)).length,
      erros: allRows.filter((row) => row.status_envio === 'erro').length,
      boletos_nao_encontrados: allRows.filter((row) => row.erro === 'boleto_nao_encontrado').length,
    },
    rows: allRows,
  };
}

function normalizeChargeStatus(value: string | null | undefined) {
  const status = normalizeText(value);
  if (status === 'pago') return 'pago';
  if (status === 'negociado' || status === 'negociacao') return 'negociado';
  if (status === 'suspenso') return 'suspenso';
  if (status === 'cancelado') return 'cancelado';
  if (status === 'liquidado') return 'liquidado';
  return 'pendente';
}

async function getBillingCenterData(
  supabaseAdmin: AdminClient,
  companyId: string,
  todayIso: string,
) {
  console.log('get_billing_center before registros_financeiros query', { company_id: companyId });
  const { data: records, error: recordsError } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, nome, cliente_nome, documento, numero_nf, numero_boleto, data_vencimento, valor, telefone, status, created_at, linha_digitavel, codigo_barras, boleto_url, boleto_pdf_nome, boleto_match_confidence, boleto_status, drive_file_id')
    .eq('company_id', companyId)
    .order('data_vencimento', { ascending: true });

  if (recordsError) throw new Error(recordsError.message);
  console.log('get_billing_center after registros_financeiros query', { total_registros: (records || []).length });
  console.log('[COBRANCA RAW]', records?.slice?.(0, 5));

  console.log('get_billing_center before logs_cobranca query', { company_id: companyId });
  const { data: logsData, error: logsError } = await supabaseAdmin
    .from('logs_cobranca')
    .select('id, financeiro_id, company_id, data_hora, tipo_cobranca, status_envio, arquivo_encontrado, erro, created_at')
    .eq('company_id', companyId)
    .order('data_hora', { ascending: false })
    .limit(500);
  const logs = logsError ? [] : (logsData || []);
  console.log('get_billing_center after logs_cobranca query', {
    total_logs: logs.length,
    logs_error: logsError?.message || null,
  });

  const latestLogByFinanceiro = new Map<string, Record<string, unknown>>();
  for (const log of logs) {
    const financeiroId = String(log.financeiro_id || '');
    if (!financeiroId || latestLogByFinanceiro.has(financeiroId)) continue;
    latestLogByFinanceiro.set(financeiroId, log as Record<string, unknown>);
  }

  const start = `${todayIso}T00:00:00-03:00`;
  const end = `${todayIso}T23:59:59-03:00`;
  const todayLogs = logs.filter((row) => String(row.data_hora || row.created_at || '') >= start && String(row.data_hora || row.created_at || '') <= end);

  const resolveStage = (record, latestLog) => {
    const normalizedStatus = normalizeText(record?.status);
    if (!normalizedStatus || CLOSED_STATUSES.has(normalizedStatus) || !OPEN_STATUSES.has(normalizedStatus)) {
      return 'fora_da_regua';
    }

    const diff = isoDaysDiff(String(record?.data_vencimento || ''), todayIso);
    if (diff === null) return 'fora_da_regua';
    if (diff === 1) return 'preventiva';
    if (diff === 0) return 'vencimento';
    if (diff < 0 && DEFAULT_RULES.includes(Math.abs(diff))) return 'atraso';
    if (latestLog?.tipo_cobranca && ['preventiva', 'vencimento', 'atraso'].includes(String(latestLog.tipo_cobranca))) {
      return String(latestLog.tipo_cobranca);
    }
    return 'fora_da_regua';
  };

  const mapped = (records || []).map((record) => {
    const { numeroBoletoEfetivo, clienteEfetivo } = logCobrancaMapping(record);
    const latestLog = latestLogByFinanceiro.get(record.id);
    const telefoneBruto = String(record?.telefone || latestLog?.telefone || '');
    const telefoneValido = validatePhone(normalizePhone(telefoneBruto));
    const boletoEncontrado = temBoletoEncontrado(record);
    const statusBoleto = boletoEncontrado ? 'encontrado' : 'sem_boleto';
    const dataVencimento = String(record?.data_vencimento || '');
    const diasParaVencer = dataVencimento ? isoDaysDiff(dataVencimento, todayIso) : null;
    const diasAtraso = diasParaVencer !== null && diasParaVencer < 0 ? Math.abs(diasParaVencer) : 0;
    const etapaRegua = resolveStage(record, latestLog);
    const confidence = boletoEncontrado
      ? Math.max(Number(record?.boleto_match_confidence || 0), 100)
      : Number(record?.boleto_match_confidence || 0);

    console.log('[COBRANCA STATUS]', {
      cliente: record.cliente_nome,
      documento: record.documento,
      numero_nf: record.numero_nf,
      numero_boleto: record.numero_boleto,
      numeroBoletoEfetivo,
      boletoEncontrado,
      status_boleto: statusBoleto
    });

    let motivoNaoElegivel = null;
    if (!record?.status) motivoNaoElegivel = 'status_vazio';
    else if (!OPEN_STATUSES.has(normalizeText(record.status)) || CLOSED_STATUSES.has(normalizeText(record.status))) motivoNaoElegivel = 'status_fora_da_regua';
    else if (!telefoneBruto.trim()) motivoNaoElegivel = 'telefone_vazio';
    else if (!telefoneValido) motivoNaoElegivel = 'telefone_invalido';
    else if (!dataVencimento) motivoNaoElegivel = 'vencimento_vazio';
    else if (diasParaVencer === null) motivoNaoElegivel = 'vencimento_invalido';
    else if (etapaRegua === 'fora_da_regua') motivoNaoElegivel = 'fora_da_regua';

    return {
      id: record.id,
      company_id: record.company_id,
      cliente_nome: clienteEfetivo || record.nome || 'Cliente',
      documento: record.documento || '',
      numero_boleto: numeroBoletoEfetivo || '-',
      numero_nf: record.numero_nf || '',
      vencimento: dataVencimento || null,
      valor: Number(record?.valor || 0),
      telefone: telefoneBruto,
      status: normalizeChargeStatus(record?.status),
      etapa_regua: etapaRegua,
      boleto_encontrado: boletoEncontrado,
      telefone_valido: telefoneValido,
      ultima_cobranca: latestLog?.data_hora || null,
      ultimo_status_envio: latestLog?.status_envio || null,
      ultimo_erro: latestLog?.erro || null,
      linha_digitavel: record?.linha_digitavel || null,
      codigo_barras: record?.codigo_barras || null,
      boleto_url: record?.boleto_url || null,
      boleto_pdf_nome: record?.boleto_pdf_nome || null,
      boleto_status: statusBoleto,
      boleto_match_confidence: confidence,
      created_at: record?.created_at || null,
      dias_para_vencer: diasParaVencer,
      dias_atraso: diasAtraso,
      motivo_nao_elegivel: motivoNaoElegivel,
    };
  });
  console.log('[COBRANCA MAPPED]', mapped?.slice?.(0, 5));

  const isOpen = (status: string) => OPEN_STATUSES.has(normalizeText(status));

  return {
    cards: {
      vencendo_amanha: mapped.filter((row) => row.etapa_regua === 'preventiva').length,
      vencem_hoje: mapped.filter((row) => row.etapa_regua === 'vencimento').length,
      em_atraso: mapped.filter((row) => row.dias_atraso > 0 && isOpen(row.status)).length,
      sem_boleto_encontrado: mapped.filter((row) => !row.boleto_encontrado).length,
      sem_telefone_valido: mapped.filter((row) => !row.telefone_valido).length,
      simulacoes_realizadas_hoje: todayLogs.filter((row) => ['sucesso_simulado', 'simulado'].includes(String(row.status_envio || ''))).length,
      erros: todayLogs.filter((row) => String(row.status_envio || '') === 'erro').length,
      total_em_aberto: mapped.filter((row) => isOpen(row.status)).length,
    },
    items: mapped,
  };
}

function resolveHistoryFilterBoolean(value: unknown) {
  if (value === true || value === 'true' || value === 'sim') return true;
  if (value === false || value === 'false' || value === 'nao' || value === 'não') return false;
  return null;
}

function buildHistoryCards(rows: Array<Record<string, unknown>>, todayIso: string) {
  const startToday = `${todayIso}T00:00:00-03:00`;
  const endToday = `${todayIso}T23:59:59-03:00`;
  const sevenDaysAgoDate = parseDate(todayIso);
  if (sevenDaysAgoDate) {
    sevenDaysAgoDate.setUTCDate(sevenDaysAgoDate.getUTCDate() - 6);
  }
  const sevenDaysAgo = sevenDaysAgoDate ? `${sevenDaysAgoDate.toISOString().slice(0, 10)}T00:00:00-03:00` : startToday;
  const successStatuses = new Set(['sucesso', 'sucesso_simulado', 'simulado']);

  return {
    simulacoes_hoje: rows.filter((row) => {
      const when = String(row.data_hora || row.created_at || '');
      return when >= startToday && when <= endToday && successStatuses.has(String(row.status_envio || ''));
    }).length,
    simulacoes_ultimos_7_dias: rows.filter((row) => {
      const when = String(row.data_hora || row.created_at || '');
      return when >= sevenDaysAgo && successStatuses.has(String(row.status_envio || ''));
    }).length,
    sucesso: rows.filter((row) => successStatuses.has(String(row.status_envio || ''))).length,
    erros: rows.filter((row) => String(row.status_envio || '') === 'erro').length,
    com_boleto: rows.filter((row) => Boolean(row.arquivo_encontrado)).length,
    sem_boleto: rows.filter((row) => !Boolean(row.arquivo_encontrado)).length,
    pendentes: rows.filter((row) => {
      const status = String(row.status_envio || '');
      return !successStatuses.has(status) && status !== 'erro';
    }).length,
    resolvidos: rows.filter((row) => successStatuses.has(String(row.status_envio || ''))).length,
  };
}

type InconsistencyKind =
  | 'sem_telefone'
  | 'telefone_invalido'
  | 'sem_boleto'
  | 'status_invalido'
  | 'vencimento_ausente'
  | 'valor_zerado'
  | 'duplicado'
  | 'suspenso';

function getInconsistencyMeta(kind: InconsistencyKind) {
  switch (kind) {
    case 'sem_telefone':
      return { label: 'Sem telefone', severity: 'alta', suggestion: 'Cadastrar telefone' };
    case 'telefone_invalido':
      return { label: 'Telefone invalido', severity: 'alta', suggestion: 'Corrigir telefone' };
    case 'sem_boleto':
      return { label: 'Sem boleto', severity: 'alta', suggestion: 'Reprocessar boleto' };
    case 'status_invalido':
      return { label: 'Status invalido', severity: 'media', suggestion: 'Corrigir status' };
    case 'vencimento_ausente':
      return { label: 'Vencimento ausente', severity: 'alta', suggestion: 'Informar vencimento' };
    case 'valor_zerado':
      return { label: 'Valor zerado', severity: 'alta', suggestion: 'Revisar valor' };
    case 'duplicado':
      return { label: 'Duplicado', severity: 'media', suggestion: 'Revisar duplicidade' };
    case 'suspenso':
      return { label: 'Suspenso', severity: 'baixa', suggestion: 'Revisar suspensao' };
    default:
      return { label: 'Inconsistencia', severity: 'media', suggestion: 'Revisar registro' };
  }
}

function buildInconsistencyCards(items: Array<Record<string, unknown>>) {
  return {
    sem_telefone: items.filter((item) => item.tipo_problema === 'sem_telefone').length,
    telefone_invalido: items.filter((item) => item.tipo_problema === 'telefone_invalido').length,
    sem_boleto: items.filter((item) => item.tipo_problema === 'sem_boleto').length,
    status_invalido: items.filter((item) => item.tipo_problema === 'status_invalido').length,
    vencimento_ausente: items.filter((item) => item.tipo_problema === 'vencimento_ausente').length,
    valor_zerado: items.filter((item) => item.tipo_problema === 'valor_zerado').length,
    duplicados: items.filter((item) => item.tipo_problema === 'duplicado').length,
    suspensos: items.filter((item) => item.tipo_problema === 'suspenso').length,
  };
}

async function getBillingInconsistenciesData(
  supabaseAdmin: AdminClient,
  companyId: string,
  filters: Record<string, unknown>,
) {
  const { data: records, error } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, nome, cliente_nome, documento, numero_nf, numero_boleto, data_vencimento, valor, telefone, status, created_at, updated_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const safeRecords = records || [];
  const validStatuses = new Set(['pendente', 'pago', 'negociado', 'suspenso', 'cancelado', 'liquidado']);

  const boletoCount = new Map<string, number>();
  const composedCount = new Map<string, number>();

  for (const record of safeRecords) {
    const { numeroBoletoEfetivo, clienteEfetivo } = logCobrancaMapping(record);
    const boletoKey = normalizeText(numeroBoletoEfetivo);
    if (boletoKey) {
      boletoCount.set(boletoKey, (boletoCount.get(boletoKey) || 0) + 1);
    }
    const composedKey = `${normalizeText(clienteEfetivo || record.nome)}|${Number(record.valor || 0)}|${String(record.data_vencimento || '')}`;
    if (normalizeText(clienteEfetivo || record.nome) && String(record.data_vencimento || '')) {
      composedCount.set(composedKey, (composedCount.get(composedKey) || 0) + 1);
    }
  }

  const items: Array<Record<string, unknown>> = [];

  for (const record of safeRecords) {
    const { numeroBoletoEfetivo, clienteEfetivo } = logCobrancaMapping(record);
    const telefoneDigits = String(record.telefone || '').replace(/\D/g, '');
    const normalizedStatus = normalizeChargeStatus(record.status);
    const boletoKey = normalizeText(numeroBoletoEfetivo);
    const composedKey = `${normalizeText(clienteEfetivo || record.nome)}|${Number(record.valor || 0)}|${String(record.data_vencimento || '')}`;
    const problems: InconsistencyKind[] = [];

    if (!String(record.telefone || '').trim()) problems.push('sem_telefone');
    else if (telefoneDigits.length < 10) problems.push('telefone_invalido');
    if (!String(numeroBoletoEfetivo || '').trim()) problems.push('sem_boleto');
    if (!validStatuses.has(normalizedStatus)) problems.push('status_invalido');
    if (!record.data_vencimento) problems.push('vencimento_ausente');
    if (record.valor === null || Number(record.valor) <= 0) problems.push('valor_zerado');
    if ((boletoKey && (boletoCount.get(boletoKey) || 0) > 1) || (!boletoKey && (composedCount.get(composedKey) || 0) > 1)) {
      problems.push('duplicado');
    }
    if (normalizedStatus === 'suspenso') problems.push('suspenso');

    for (const kind of problems) {
      const meta = getInconsistencyMeta(kind);
      items.push({
        id: `${record.id}:${kind}`,
        registro_id: record.id,
        company_id: record.company_id,
        nome: clienteEfetivo || record.nome || 'Cliente',
        numero_boleto: numeroBoletoEfetivo || '',
        data_vencimento: record.data_vencimento || null,
        valor: Number(record.valor || 0),
        telefone: record.telefone || '',
        status: normalizedStatus || 'pendente',
        created_at: record.created_at || null,
        updated_at: record.updated_at || null,
        tipo_problema: kind,
        problema_label: meta.label,
        severidade: meta.severity,
        acao_sugerida: meta.suggestion,
      });
    }
  }

  const cliente = normalizeText(filters?.cliente as string);
  const tipoProblema = String(filters?.tipo_problema || '').trim();
  const severidade = String(filters?.severidade || '').trim();
  const status = normalizeText(filters?.status as string);

  const filteredItems = items.filter((item) => {
    if (cliente && !normalizeText(String(item.nome || '')).includes(cliente)) return false;
    if (tipoProblema && item.tipo_problema !== tipoProblema) return false;
    if (severidade && item.severidade !== severidade) return false;
    if (status && normalizeText(String(item.status || '')) !== status) return false;
    return true;
  });

  return {
    cards: buildInconsistencyCards(filteredItems),
    items: filteredItems,
  };
}

async function getRealSendChecklistData(
  supabaseAdmin: AdminClient,
  companyId: string,
  todayIso: string,
) {
  const config = await getBillingConfigForCompany(supabaseAdmin, companyId);
  const planData = await getPlanCapabilitiesData(supabaseAdmin, companyId, todayIso);
  const { data: records, error: recordsError } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, nome, cliente_nome, cliente_numero, documento, numero_nf, numero_boleto, data_vencimento, valor, telefone, status, linha_digitavel, codigo_barras, boleto_url, drive_file_id, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (recordsError) throw new Error(recordsError.message);

  const { data: logs, error: logsError } = await supabaseAdmin
    .from('logs_cobranca')
    .select('id, financeiro_id, company_id, data_hora, tipo_cobranca, status_envio, arquivo_encontrado, erro, created_at')
    .eq('company_id', companyId)
    .order('data_hora', { ascending: false })
    .order('created_at', { ascending: false });
  if (logsError) throw new Error(logsError.message);

  const inconsistencies = await getBillingInconsistenciesData(supabaseAdmin, companyId, {});
  const criticalIssues = (inconsistencies.items || []).filter((item) =>
    ['sem_telefone', 'telefone_invalido', 'sem_boleto', 'vencimento_ausente', 'valor_zerado'].includes(String(item.tipo_problema || ''))
  );

  const safeRecords = records || [];
  const safeLogs = logs || [];
  const successStatuses = new Set(['sucesso', 'sucesso_simulado', 'simulado']);
  const errorStatuses = new Set(['erro', 'erro_simulacao']);
  const sevenDaysAgoDate = parseDate(todayIso);
  if (sevenDaysAgoDate) sevenDaysAgoDate.setUTCDate(sevenDaysAgoDate.getUTCDate() - 7);
  const sevenDaysAgoIso = sevenDaysAgoDate ? `${sevenDaysAgoDate.toISOString().slice(0, 10)}T00:00:00-03:00` : `${todayIso}T00:00:00-03:00`;

  const latestLogByFinanceiro = new Map<string, Record<string, unknown>>();
  for (const log of safeLogs) {
    const key = String(log.financeiro_id || '');
    if (!key || latestLogByFinanceiro.has(key)) continue;
    latestLogByFinanceiro.set(key, log as Record<string, unknown>);
  }

  const totalTitles = safeRecords.length;
  const validPhones = safeRecords.filter((row) => validatePhone(normalizePhone(row.telefone))).length;
  const boletoFound = safeRecords.filter((row) => temBoletoEncontrado(row as Partial<FinancialRow> & Record<string, unknown>)).length;
  const successfulSimulations = safeLogs.filter((row) => successStatuses.has(String(row.status_envio || ''))).length;
  const errors = safeLogs.filter((row) => errorStatuses.has(String(row.status_envio || ''))).length;
  const lastSimulation = safeLogs.find((row) => successStatuses.has(String(row.status_envio || '')));
  const recentSimulation = lastSimulation
    ? String(lastSimulation.data_hora || lastSimulation.created_at || '') >= sevenDaysAgoIso
    : false;
  const rateBase = successfulSimulations + errors;
  const errorRate = rateBase > 0 ? (errors / rateBase) * 100 : 0;
  const phonePercent = totalTitles > 0 ? (validPhones / totalTitles) * 100 : 0;
  const boletoPercent = totalTitles > 0 ? (boletoFound / totalTitles) * 100 : 0;

  const checklist = [
    {
      section: 'Configuracao',
      item: 'Cobranca automatica ativa',
      status: Boolean(config?.ativo),
      detail: config?.ativo ? 'Configuracao ativa para a empresa.' : 'Ative a cobranca automatica para esta empresa.',
      obrigatorio: true,
    },
    {
      section: 'Configuracao',
      item: 'Horario de execucao configurado',
      status: Boolean(String(config?.hora_execucao || '').trim()),
      detail: String(config?.hora_execucao || '').trim() || 'Horario nao configurado.',
      obrigatorio: true,
    },
    {
      section: 'Configuracao',
      item: 'Template preventiva configurado',
      status: Boolean(String(config?.template_preventiva || '').trim()),
      detail: String(config?.template_preventiva || '').trim() ? 'Template preventiva configurado.' : 'Template preventiva ausente.',
      obrigatorio: true,
    },
    {
      section: 'Configuracao',
      item: 'Template vencimento configurado',
      status: Boolean(String(config?.template_vencimento || '').trim()),
      detail: String(config?.template_vencimento || '').trim() ? 'Template vencimento configurado.' : 'Template vencimento ausente.',
      obrigatorio: true,
    },
    {
      section: 'Configuracao',
      item: 'Template atraso configurado',
      status: Boolean(String(config?.template_atraso || '').trim()),
      detail: String(config?.template_atraso || '').trim() ? 'Template atraso configurado.' : 'Template atraso ausente.',
      obrigatorio: true,
    },
    {
      section: 'Dados',
      item: 'Titulos monitorados maior que 0',
      status: totalTitles > 0,
      detail: `${totalTitles} titulo(s) monitorado(s).`,
      obrigatorio: true,
    },
    {
      section: 'Dados',
      item: 'Telefones validos acima de 80%',
      status: phonePercent >= 80,
      detail: `${phonePercent.toFixed(1)}% com telefone valido.`,
      obrigatorio: true,
    },
    {
      section: 'Dados',
      item: 'Boletos encontrados acima de 80%',
      status: boletoPercent >= 80,
      detail: `${boletoPercent.toFixed(1)}% com boleto encontrado.`,
      obrigatorio: true,
    },
    {
      section: 'Dados',
      item: 'Inconsistencias criticas igual a 0',
      status: criticalIssues.length === 0,
      detail: `${criticalIssues.length} inconsistencia(s) critica(s).`,
      obrigatorio: true,
    },
    {
      section: 'Operacao',
      item: 'Pelo menos 3 simulacoes com sucesso',
      status: successfulSimulations >= 3,
      detail: `${successfulSimulations} simulacao(oes) com sucesso.`,
      obrigatorio: true,
    },
    {
      section: 'Operacao',
      item: 'Taxa de erro menor que 10%',
      status: errorRate < 10,
      detail: `${errorRate.toFixed(1)}% de taxa de erro.`,
      obrigatorio: true,
    },
    {
      section: 'Operacao',
      item: 'Ultima simulacao ha menos de 7 dias',
      status: recentSimulation,
      detail: lastSimulation?.data_hora || lastSimulation?.created_at || 'Nenhuma simulacao recente.',
      obrigatorio: true,
    },
    {
      section: 'Integracao',
      item: 'Z-API configurada',
      status: false,
      detail: 'Pendente / bloqueado. Z-API ainda nao configurada neste ambiente.',
      obrigatorio: false,
      blocked: true,
    },
    {
      section: 'Integracao',
      item: 'Token valido',
      status: false,
      detail: 'Pendente / bloqueado. Validacao de token depende da Z-API.',
      obrigatorio: false,
      blocked: true,
    },
    {
      section: 'Integracao',
      item: 'Instancia conectada',
      status: false,
      detail: 'Pendente / bloqueado. Conecte e valide a Z-API antes do envio real.',
      obrigatorio: false,
      blocked: true,
    },
    {
      section: 'Comercial / Plano',
      item: 'Plano atual',
      status: true,
      detail: `Plano ${planData.plan.toUpperCase()} com status ${planData.status}.`,
      obrigatorio: false,
    },
    {
      section: 'Comercial / Plano',
      item: 'Envios reais usados',
      status: !planData.limits.used_real_sends || planData.limits.remaining_real_sends > 0,
      detail: `${planData.limits.used_real_sends}/${planData.limits.monthly_send_limit} usados. Creditos extras: ${planData.limits.extra_send_credits}.`,
      obrigatorio: false,
    },
    {
      section: 'Comercial / Plano',
      item: 'Envio manual',
      status: Boolean(planData.capabilities.manual_send),
      detail: planData.capabilities.manual_send ? 'Liberado no plano atual.' : 'Bloqueado no plano atual.',
      obrigatorio: false,
    },
    {
      section: 'Comercial / Plano',
      item: 'Envio em lote',
      status: Boolean(planData.capabilities.batch_manual_send),
      detail: planData.capabilities.batch_manual_send ? 'Liberado no plano atual.' : 'Bloqueado no plano atual.',
      obrigatorio: false,
    },
    {
      section: 'Comercial / Plano',
      item: 'Envio automatico',
      status: Boolean(planData.capabilities.automatic_send),
      detail: planData.capabilities.automatic_send ? 'Liberado no plano atual.' : 'Bloqueado - upgrade para Pro.',
      obrigatorio: false,
      blocked: !planData.capabilities.automatic_send,
    },
  ];

  const requiredItems = checklist.filter((item) => item.obrigatorio);
  const passedRequired = requiredItems.filter((item) => item.status).length;
  let statusGeral = 'nao_pronto';
  if (requiredItems.length > 0 && passedRequired === requiredItems.length) {
    statusGeral = 'pronto_para_ativar';
  } else if (
    totalTitles > 0 &&
    criticalIssues.length === 0 &&
    passedRequired >= Math.max(1, requiredItems.length - 2)
  ) {
    statusGeral = 'quase_pronto';
  }

  const recommendations = checklist
    .filter((item) => !item.status)
    .map((item) => `${item.section}: ${item.item} - ${item.detail}`);

  const sampleChargeRecord =
    safeRecords.find((row) => validatePhone(normalizePhone(row.telefone)) && (row.numero_boleto || row.documento || row.numero_nf)) ||
    safeRecords.find((row) => validatePhone(normalizePhone(row.telefone))) ||
    safeRecords.find((row) => row.numero_boleto || row.documento || row.numero_nf) ||
    safeRecords[0] ||
    null;

  const sampleCharge = sampleChargeRecord
    ? {
        id: sampleChargeRecord.id,
        nome: sampleChargeRecord.nome || sampleChargeRecord.cliente_nome || '',
        cliente_nome: sampleChargeRecord.cliente_nome || sampleChargeRecord.nome || '',
        cliente_numero: sampleChargeRecord.cliente_numero || '',
        telefone: sampleChargeRecord.telefone || '',
        documento: sampleChargeRecord.documento || sampleChargeRecord.numero_nf || sampleChargeRecord.numero_boleto || '',
        numero_boleto: sampleChargeRecord.numero_boleto || sampleChargeRecord.documento || sampleChargeRecord.numero_nf || '',
        numero_nf: sampleChargeRecord.numero_nf || '',
        valor: Number(sampleChargeRecord.valor || 0),
        data_vencimento: sampleChargeRecord.data_vencimento || '',
        status: sampleChargeRecord.status || 'pendente',
        linha_digitavel: sampleChargeRecord.linha_digitavel || null,
        codigo_barras: sampleChargeRecord.codigo_barras || null,
        boleto_url: sampleChargeRecord.boleto_url || (sampleChargeRecord.drive_file_id ? `https://drive.google.com/file/d/${sampleChargeRecord.drive_file_id}/view` : null),
        drive_file_id: sampleChargeRecord.drive_file_id || null,
      }
    : null;

  return {
    status_geral: statusGeral,
    cards: {
      status_geral: statusGeral,
      titulos_monitorados: totalTitles,
      telefones_validos: `${validPhones}/${totalTitles}`,
      boletos_encontrados: `${boletoFound}/${totalTitles}`,
      simulacoes_sucesso: successfulSimulations,
      erros: errors,
      inconsistencias_criticas: criticalIssues.length,
      zapi: 'Pendente / bloqueado',
      plano_atual: planData.plan,
      envios_reais_usados: `${planData.limits.used_real_sends}/${planData.limits.monthly_send_limit}`,
    },
    checklist,
    recommendations,
    sample_charge: sampleCharge,
    commercial: planData,
  };
}

const PLAN_LIMITS: Record<string, number> = {
  starter: 200,
  pro: 2000,
  business: 10000,
};

function normalizeSubscriptionPlan(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (normalized === 'pro') return 'pro';
  if (normalized === 'business') return 'business';
  return 'starter';
}

function normalizeSubscriptionStatus(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (normalized === 'trialing' || normalized === 'trial') return 'trialing';
  if (normalized === 'past_due') return 'past_due';
  if (normalized === 'canceled') return 'canceled';
  if (normalized === 'expired') return 'expired';
  if (normalized === 'blocked') return 'blocked';
  return 'active';
}

function getPlanCapabilitiesMap(plan: string) {
  if (plan === 'business') {
    return {
      manual_send: true,
      batch_manual_send: true,
      automatic_send: true,
      multi_company: true,
      approval_flow: true,
      advanced_reports: true,
    };
  }

  if (plan === 'pro') {
    return {
      manual_send: true,
      batch_manual_send: true,
      automatic_send: true,
      multi_company: false,
      approval_flow: false,
      advanced_reports: true,
    };
  }

  return {
    manual_send: true,
    batch_manual_send: true,
    automatic_send: false,
    multi_company: false,
    approval_flow: false,
    advanced_reports: false,
  };
}

async function getCompanyCommercialConfig(
  supabaseAdmin: AdminClient,
  companyId: string,
) {
  const { data, error } = await supabaseAdmin
    .from('empresas')
    .select('id, subscription_plan, subscription_status, monthly_send_limit, extra_send_credits, billing_cycle_start, billing_cycle_end, automatic_send_enabled')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const plan = normalizeSubscriptionPlan(data?.subscription_plan);
  const status = normalizeSubscriptionStatus(data?.subscription_status);
  const planLimit = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
  const configuredLimit = Number(data?.monthly_send_limit || 0);
  const monthlyLimit = configuredLimit > 0 ? configuredLimit : planLimit;

  return {
    id: companyId,
    plan,
    status,
    monthly_send_limit: monthlyLimit,
    extra_send_credits: Number(data?.extra_send_credits || 0),
    billing_cycle_start: String(data?.billing_cycle_start || todayInSaoPaulo()),
    billing_cycle_end: data?.billing_cycle_end ? String(data.billing_cycle_end) : null,
    automatic_send_enabled: Boolean(data?.automatic_send_enabled),
  };
}

function resolveUsageCycle(commercial: {
  billing_cycle_start: string;
  billing_cycle_end: string | null;
}) {
  const periodStart = commercial.billing_cycle_start || todayInSaoPaulo();
  const startDate = parseDate(periodStart) || parseDate(todayInSaoPaulo()) || new Date();
  const endDate = commercial.billing_cycle_end
    ? parseDate(commercial.billing_cycle_end)
    : new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, startDate.getUTCDate() - 1));

  return {
    periodStart,
    periodEnd: (endDate || startDate).toISOString().slice(0, 10),
  };
}

async function getUsageSummaryData(
  supabaseAdmin: AdminClient,
  companyId: string,
  todayIso: string,
) {
  const commercial = await getCompanyCommercialConfig(supabaseAdmin, companyId);
  const { periodStart, periodEnd } = resolveUsageCycle(commercial);

  const { data: usageRow, error: usageError } = await supabaseAdmin
    .from('usage_counters')
    .select('real_sends_count, simulated_sends_count, manual_sends_count, automatic_sends_count')
    .eq('company_id', companyId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle();

  if (usageError) throw new Error(usageError.message);

  const periodStartIso = `${periodStart}T00:00:00-03:00`;
  const periodEndIso = `${periodEnd}T23:59:59-03:00`;
  const { data: logs, error: logsError } = await supabaseAdmin
    .from('logs_cobranca')
    .select('status_envio, data_hora, created_at')
    .eq('company_id', companyId)
    .gte('data_hora', periodStartIso)
    .lte('data_hora', periodEndIso);

  if (logsError) throw new Error(logsError.message);

  const simulatedStatuses = new Set(['sucesso_simulado', 'simulado']);
  const simulationCount = (logs || []).filter((row) => simulatedStatuses.has(String(row.status_envio || ''))).length;
  const usedRealSends = Number(usageRow?.real_sends_count || 0);
  const extraCredits = Number(commercial.extra_send_credits || 0);
  const totalLimit = Number(commercial.monthly_send_limit || 0) + extraCredits;
  const remainingRealSends = Math.max(0, totalLimit - usedRealSends);
  const usagePercent = totalLimit > 0 ? Math.min(100, (usedRealSends / totalLimit) * 100) : 0;

  return {
    plan: commercial.plan,
    status: commercial.status,
    monthly_send_limit: Number(commercial.monthly_send_limit || 0),
    extra_send_credits: extraCredits,
    used_real_sends: usedRealSends,
    remaining_real_sends: remainingRealSends,
    simulated_sends_count: Number(usageRow?.simulated_sends_count || 0) || simulationCount,
    manual_sends_count: Number(usageRow?.manual_sends_count || 0),
    automatic_sends_count: Number(usageRow?.automatic_sends_count || 0),
    usage_percent: usagePercent,
    blocked_by_limit: usedRealSends >= totalLimit && totalLimit > 0,
    period_start: periodStart,
    period_end: periodEnd,
    automatic_send_enabled: commercial.automatic_send_enabled,
  };
}

async function getPlanCapabilitiesData(
  supabaseAdmin: AdminClient,
  companyId: string,
  todayIso: string,
) {
  const usage = await getUsageSummaryData(supabaseAdmin, companyId, todayIso);
  const capabilities = getPlanCapabilitiesMap(usage.plan);

  let upgradeRecommendation = null;
  if (usage.plan === 'starter') {
    upgradeRecommendation = 'Fazer upgrade para Pro';
  } else if (usage.plan === 'pro' && usage.usage_percent >= 80) {
    upgradeRecommendation = 'Avaliar upgrade para Business';
  }

  return {
    plan: usage.plan,
    status: usage.status,
    capabilities,
    limits: {
      monthly_send_limit: usage.monthly_send_limit,
      extra_send_credits: usage.extra_send_credits,
      used_real_sends: usage.used_real_sends,
      remaining_real_sends: usage.remaining_real_sends,
    },
    upgrade_recommendation: upgradeRecommendation,
  };
}

async function checkSendPermissionData(
  supabaseAdmin: AdminClient,
  companyId: string,
  sendType: string,
  quantity: number,
  todayIso: string,
) {
  const planData = await getPlanCapabilitiesData(supabaseAdmin, companyId, todayIso);
  const usage = await getUsageSummaryData(supabaseAdmin, companyId, todayIso);
  const nextQuantity = Math.max(1, Number(quantity || 1));

  if (!['active', 'trialing', 'trial'].includes(planData.status)) {
    return {
      ok: true,
      allowed: false,
      reason: 'SUBSCRIPTION_INACTIVE',
      message: 'A assinatura da empresa nao esta ativa para novos envios reais.',
      upgrade_cta: 'Regularizar assinatura',
    };
  }

  if (sendType === 'automatic' && !planData.capabilities.automatic_send) {
    return {
      ok: true,
      allowed: false,
      reason: 'PLAN_RESTRICTED',
      message: 'Seu plano atual nao libera automacao programada de envios reais.',
      upgrade_cta: 'Fazer upgrade para Pro',
    };
  }

  if (sendType === 'batch_manual' && !planData.capabilities.batch_manual_send) {
    return {
      ok: true,
      allowed: false,
      reason: 'PLAN_RESTRICTED',
      message: 'Seu plano atual nao libera envio em lote manual.',
      upgrade_cta: 'Escolher plano com envio em lote',
    };
  }

  if (sendType === 'manual' && !planData.capabilities.manual_send) {
    return {
      ok: true,
      allowed: false,
      reason: 'PLAN_RESTRICTED',
      message: 'Seu plano atual nao libera envio manual real.',
      upgrade_cta: 'Escolher plano com envio manual',
    };
  }

  if (usage.used_real_sends + nextQuantity > usage.monthly_send_limit + usage.extra_send_credits) {
    return {
      ok: true,
      allowed: false,
      reason: 'LIMIT_REACHED',
      message: 'O limite mensal de envios reais deste plano foi atingido.',
      upgrade_cta: usage.plan === 'starter' ? 'Fazer upgrade para Pro' : 'Falar com comercial',
    };
  }

  return {
    ok: true,
    allowed: true,
    reason: null,
    message: null,
    upgrade_cta: null,
  };
}

// ── Batch processor ──────────────────────────────────────────────────────────
// Processes records with concurrency control, jittered delay, rate-limit pause,
// and timeout guard. Used by both simulate and real send paths.

const BATCH_MAX_RECORDS = 50;
const BATCH_CONCURRENCY_DEFAULT = 3;
const BATCH_CONCURRENCY_MAX = 5;
const BATCH_DELAY_MIN_MS = 800;
const BATCH_DELAY_MAX_MS = 1500;
const BATCH_TIMEOUT_GUARD_MS = 52_000; // stop 52s before EF gateway (60s limit)
const BATCH_RATE_LIMIT_PAUSE_MS = 12_000; // pause after 429

interface BatchItemResult {
  record_id: string;
  cliente_nome: string;
  documento: string | null;
  numero_boleto: string | null;
  telefone: string | null;
  previous_log_id: string | null;
  retry_count: number;
  retryable: boolean;
  next_retry_at: string | null;
  status: 'enviado' | 'simulado' | 'erro' | 'ignorado';
  tipo: string | null;
  boleto_file_name: string | null;
  boleto_exact_match: boolean;
  whatsapp_attachment_sent: boolean;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number;
}

interface BatchSummary {
  total: number;
  enviados: number;
  simulados: number;
  com_anexo: number;
  texto_only: number;
  erros: number;
  ignorados: number;
  rate_limited: number;
  timed_out: number;
  duration_ms: number;
  avg_ms_per_record: number;
}

type BatchStoppedReason = 'completed' | 'soft_time_budget' | 'rate_limited' | 'hard_timeout_guard';

async function processBatch(
  supabaseAdmin: AdminClient,
  records: FinancialRow[],
  config: BillingConfigRow | null,
  token: string,
  folderId: string,
  todayIso: string,
  options: {
    simulate?: boolean;
    force?: boolean;
    companyName?: string;
    concurrency?: number;
    batchId?: string;
    startedAt?: number;
    hardDeadlineMs?: number;
    softStopAtMs?: number;
    estimatedMsPerItem?: number;
    softStopMarginMs?: number;
    retryContextByRecordId?: Record<string, { previous_log_id: string | null; retry_count: number; retryable: boolean; next_retry_at: string | null }>;
  } = {},
): Promise<{ batchId: string; items: BatchItemResult[]; summary: BatchSummary; stoppedReason: BatchStoppedReason }> {
  const batchId = options.batchId ?? crypto.randomUUID();
  const total = records.length;
  const results: (BatchItemResult | null)[] = new Array(total).fill(null);
  const batchStartAt = options.startedAt ?? Date.now();
  const hardDeadline = options.hardDeadlineMs ?? (batchStartAt + BATCH_TIMEOUT_GUARD_MS);
  const softStopAt = options.softStopAtMs ?? hardDeadline;
  const estimatedMsPerItem = Math.max(500, Number(options.estimatedMsPerItem || 2500));
  const softStopMarginMs = Math.max(250, Number(options.softStopMarginMs || 1500));
  const concurrency = Math.min(
    Math.max(1, options.concurrency ?? BATCH_CONCURRENCY_DEFAULT),
    BATCH_CONCURRENCY_MAX,
  );

  let queueIdx = 0;
  let rateLimitedUntil = 0; // epoch ms when rate-limit pause expires
  let stoppedReason: BatchStoppedReason = 'completed';

  async function worker() {
    while (true) {
      if (stoppedReason === 'rate_limited') break;
      const nowBeforePick = Date.now();
      if (nowBeforePick >= hardDeadline) {
        stoppedReason = 'hard_timeout_guard';
        break;
      }
      const remainingHardMs = hardDeadline - nowBeforePick;
      const remainingSoftMs = softStopAt - nowBeforePick;
      if (remainingHardMs < estimatedMsPerItem + softStopMarginMs) {
        stoppedReason = 'hard_timeout_guard';
        break;
      }
      if (remainingSoftMs < estimatedMsPerItem + softStopMarginMs) {
        stoppedReason = 'soft_time_budget';
        break;
      }

      const idx = queueIdx++;
      if (idx >= total) break;

      const record = records[idx];
      const retryContext = options.retryContextByRecordId?.[record.id] || null;
      const batchCtx = {
        batchId,
        batchIndex: idx,
        batchTotal: total,
        retryCount: retryContext?.retry_count ?? 0,
        previousLogId: retryContext?.previous_log_id ?? null,
      };

      // Timeout guard — mark remaining as skipped and stop
      if (Date.now() >= hardDeadline) {
        stoppedReason = 'hard_timeout_guard';
        break;
      }

      // Rate-limit pause — wait until cooldown expires
      const rateLimitWait = rateLimitedUntil - Date.now();
      if (rateLimitWait > 0) {
        await new Promise((r) => setTimeout(r, rateLimitWait));
      }

      const itemStart = Date.now();
      let outcome: Awaited<ReturnType<typeof processChargeForRecord>>;
      try {
        outcome = await processChargeForRecord(
          supabaseAdmin,
          record,
          config,
          token,
          folderId,
          todayIso,
          options.force ?? false,
          options.simulate ?? false,
          options.companyName ?? '',
          batchCtx,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await tryInsertLog(supabaseAdmin, {
          financeiro_id: record.id,
          company_id: record.company_id,
          cliente_nome: getClienteEfetivo(record) || record.nome || '',
          cliente_numero: record.cliente_numero || null,
          telefone: record.telefone || null,
          documento: record.documento || null,
          numero_boleto: getNumeroBoletoEfetivo(record) || null,
          numero_nf: record.numero_nf || null,
          valor: record.valor,
          vencimento: record.data_vencimento,
          tipo_cobranca: 'atraso',
          dias_atraso: 0,
          arquivo_encontrado: Boolean(record.drive_file_id),
          drive_file_id: record.drive_file_id || null,
          status_envio: 'erro',
          erro: 'unexpected_exception',
          envio_hash: null,
          payload: {
            company_id: record.company_id,
            record_id: record.id,
            batch_id: batchId,
            batch_index: idx,
            batch_total: total,
            previous_log_id: retryContext?.previous_log_id ?? null,
            ...buildRetryMeta('unexpected_exception', retryContext?.retry_count ?? 0, msg),
          },
        });
        results[idx] = {
          record_id: record.id,
          cliente_nome: getClienteEfetivo(record) || record.nome || '',
          documento: record.documento || null,
          numero_boleto: getNumeroBoletoEfetivo(record) || null,
          telefone: record.telefone || null,
          previous_log_id: retryContext?.previous_log_id ?? null,
          retry_count: retryContext?.retry_count ?? 0,
          retryable: retryContext?.retryable ?? false,
          next_retry_at: retryContext?.next_retry_at ?? null,
          status: 'erro',
          tipo: null,
          boleto_file_name: null,
          boleto_exact_match: false,
          whatsapp_attachment_sent: false,
          provider_message_id: null,
          error_code: 'unexpected_exception',
          error_message: msg,
          duration_ms: Date.now() - itemStart,
        };
        continue;
      }

      // Detect rate limit → pause remaining workers
      if (outcome.reason === 'zapi_rate_limited') {
        rateLimitedUntil = Date.now() + BATCH_RATE_LIMIT_PAUSE_MS;
        stoppedReason = 'rate_limited';
        console.log(JSON.stringify({
          event: 'batch_rate_limit_pause',
          batch_id: batchId,
          batch_index: idx,
          pause_ms: BATCH_RATE_LIMIT_PAUSE_MS,
        }));
      }

      const statusMap: Record<string, BatchItemResult['status']> = {
        sucesso: outcome.simulated ? 'simulado' : 'enviado',
        erro: 'erro',
        ignorado: 'ignorado',
      };

      results[idx] = {
        record_id: record.id,
        cliente_nome: getClienteEfetivo(record) || record.nome || '',
        documento: record.documento || null,
        numero_boleto: getNumeroBoletoEfetivo(record) || null,
        telefone: record.telefone || null,
        previous_log_id: retryContext?.previous_log_id ?? null,
        retry_count: retryContext?.retry_count ?? 0,
        retryable: retryContext?.retryable ?? false,
        next_retry_at: retryContext?.next_retry_at ?? null,
        status: statusMap[outcome.status] ?? 'erro',
        tipo: outcome.tipo || null,
        boleto_file_name: (outcome as Record<string, unknown>).fileName as string ?? null,
        boleto_exact_match: Boolean((outcome as Record<string, unknown>).boletoExactMatch ?? (outcome as Record<string, unknown>).boleto_exact_match),
        whatsapp_attachment_sent: Boolean(
          (outcome as Record<string, unknown>).pdfAttached
          ?? (outcome as Record<string, unknown>).attachment_ready
          ?? false,
        ),
        provider_message_id: (outcome as Record<string, unknown>).providerMessageId as string ?? null,
        error_code: outcome.reason || null,
        error_message: outcome.reason || null,
        duration_ms: Date.now() - itemStart,
      };

      // Add inter-send delay (skip for purely ignored records to not slow down the queue)
      if (outcome.status !== 'ignorado') {
        const jitter = BATCH_DELAY_MIN_MS + Math.floor(Math.random() * (BATCH_DELAY_MAX_MS - BATCH_DELAY_MIN_MS));
        await new Promise((r) => setTimeout(r, jitter));
      }
    }
  }

  // Launch N concurrent workers — each pulls from the shared queueIdx
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const durationMs = Date.now() - batchStartAt;
  const safeItems = results.filter(Boolean) as BatchItemResult[];
  const startedCount = safeItems.length;
  const enviados  = safeItems.filter((i) => i.status === 'enviado').length;
  const simulados = safeItems.filter((i) => i.status === 'simulado').length;
  const erros     = safeItems.filter((i) => i.status === 'erro').length;
  const ignorados = safeItems.filter((i) => i.status === 'ignorado').length;
  const comAnexo  = safeItems.filter((i) => i.whatsapp_attachment_sent).length;
  const textOnly  = (enviados + simulados) - comAnexo;
  const rateLimitedCount = safeItems.filter((i) => i.error_code === 'zapi_rate_limited').length;
  const timedOut  = safeItems.filter((i) => i.error_code === 'batch_timeout').length;

  const summary: BatchSummary = {
    total,
    enviados,
    simulados,
    com_anexo: comAnexo,
    texto_only: Math.max(0, textOnly),
    erros,
    ignorados,
    rate_limited: rateLimitedCount,
    timed_out: timedOut,
    duration_ms: durationMs,
    avg_ms_per_record: startedCount > 0 ? Math.round(durationMs / startedCount) : 0,
  };

  console.log(JSON.stringify({
    event: 'batch_complete',
    batch_id: batchId,
    stopped_reason: stoppedReason,
    started_count: startedCount,
    ...summary,
  }));
  return { batchId, items: safeItems, summary, stoppedReason };
}

interface RetryCandidate {
  previous_log_id: string;
  record_id: string;
  envio_hash: string | null;
  retry_count: number;
  max_retries: number;
  retryable: boolean;
  next_retry_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  tipo_cobranca: string | null;
}

function extractRetryCandidate(row: Record<string, unknown>): RetryCandidate {
  const payload = readPayloadObject(row.payload);
  const retryCount = Number(payload.retry_count ?? 0);
  const maxRetries = Number(payload.max_retries ?? RETRY_MAX_ATTEMPTS) || RETRY_MAX_ATTEMPTS;
  const lastErrorMessage = String(payload.last_error_message || row.erro || '').trim() || null;
  const classified = classifyError(String(payload.last_error_code || row.erro || ''), lastErrorMessage);

  return {
    previous_log_id: String(row.id || ''),
    record_id: String(row.financeiro_id || ''),
    envio_hash: String(row.envio_hash || '').trim() || null,
    retry_count: retryCount,
    max_retries: maxRetries,
    retryable: typeof payload.retryable === 'boolean' ? Boolean(payload.retryable) : classified.retryable,
    next_retry_at: String(payload.next_retry_at || '').trim() || null,
    last_error_code: String(payload.last_error_code || classified.errorCode || '').trim() || null,
    last_error_message: lastErrorMessage,
    tipo_cobranca: String(row.tipo_cobranca || '').trim() || null,
  };
}

async function reprocessFailuresForCompany(
  supabaseAdmin: AdminClient,
  companyId: string,
  config: BillingConfigRow | null,
  token: string,
  folderId: string,
  todayIso: string,
  companyName: string,
) {
  const nowIso = new Date().toISOString();
  const { data: failedLogs, error: failedLogsError } = await supabaseAdmin
    .from('logs_cobranca')
    .select('id, financeiro_id, company_id, tipo_cobranca, status_envio, erro, payload, envio_hash, created_at')
    .eq('company_id', companyId)
    .eq('status_envio', 'erro')
    .order('created_at', { ascending: false })
    .limit(BATCH_MAX_RECORDS * 4);

  if (failedLogsError) throw new Error(failedLogsError.message);

  const latestByKey = new Map<string, RetryCandidate>();
  for (const row of (failedLogs || []) as Array<Record<string, unknown>>) {
    const candidate = extractRetryCandidate(row);
    if (!candidate.record_id) continue;
    const key = candidate.envio_hash || `${candidate.record_id}:${candidate.tipo_cobranca || 'atraso'}`;
    if (!latestByKey.has(key)) {
      latestByKey.set(key, candidate);
    }
  }

  const rawCandidates = Array.from(latestByKey.values());
  const result = {
    batch_id: crypto.randomUUID(),
    total_candidates: rawCandidates.length,
    reprocessed: 0,
    skipped_success_exists: 0,
    skipped_not_due: 0,
    skipped_max_retries: 0,
    success: 0,
    failed: 0,
    items: [] as Array<Record<string, unknown>>,
  };

  if (!rawCandidates.length) {
    return result;
  }

  const dueCandidates: RetryCandidate[] = [];
  const retryContextByRecordId: Record<string, { previous_log_id: string | null; retry_count: number; retryable: boolean; next_retry_at: string | null }> = {};

  for (const candidate of rawCandidates) {
    if (!candidate.retryable) continue;
    if (candidate.retry_count >= candidate.max_retries) {
      result.skipped_max_retries += 1;
      result.items.push({
        previous_log_id: candidate.previous_log_id,
        record_id: candidate.record_id,
        retry_count: candidate.retry_count,
        retryable: candidate.retryable,
        next_retry_at: candidate.next_retry_at,
        status: 'skipped_max_retries',
        last_error_code: candidate.last_error_code,
      });
      continue;
    }
    if (candidate.next_retry_at && candidate.next_retry_at > nowIso) {
      result.skipped_not_due += 1;
      result.items.push({
        previous_log_id: candidate.previous_log_id,
        record_id: candidate.record_id,
        retry_count: candidate.retry_count,
        retryable: candidate.retryable,
        next_retry_at: candidate.next_retry_at,
        status: 'skipped_not_due',
        last_error_code: candidate.last_error_code,
      });
      continue;
    }
    dueCandidates.push(candidate);
    retryContextByRecordId[candidate.record_id] = {
      previous_log_id: candidate.previous_log_id,
      retry_count: candidate.retry_count + 1,
      retryable: candidate.retryable,
      next_retry_at: candidate.next_retry_at,
    };
  }

  if (!dueCandidates.length) {
    return result;
  }

  const dueHashes = dueCandidates.map((item) => item.envio_hash).filter(Boolean) as string[];
  const successHashes = new Set<string>();
  if (dueHashes.length) {
    const { data: successLogs, error: successLogsError } = await supabaseAdmin
      .from('logs_cobranca')
      .select('id, envio_hash, status_envio')
      .eq('company_id', companyId)
      .in('envio_hash', dueHashes)
      .in('status_envio', Array.from(SUCCESS_LOG_STATUSES));

    if (successLogsError) throw new Error(successLogsError.message);
    for (const row of successLogs || []) {
      if (row?.envio_hash && isSuccessfulLogStatus(row.status_envio)) {
        successHashes.add(String(row.envio_hash));
      }
    }
  }

  const finalCandidates: RetryCandidate[] = [];
  for (const candidate of dueCandidates) {
    if (candidate.envio_hash && successHashes.has(candidate.envio_hash)) {
      result.skipped_success_exists += 1;
      result.items.push({
        previous_log_id: candidate.previous_log_id,
        record_id: candidate.record_id,
        retry_count: candidate.retry_count,
        retryable: candidate.retryable,
        next_retry_at: candidate.next_retry_at,
        status: 'ignored_success_exists',
        last_error_code: candidate.last_error_code,
      });
      await tryInsertLog(supabaseAdmin, {
        financeiro_id: candidate.record_id,
        company_id: companyId,
        tipo_cobranca: candidate.tipo_cobranca || 'atraso',
        status_envio: 'ignorado',
        erro: 'ignorado_success_exists',
        envio_hash: candidate.envio_hash,
        payload: {
          previous_log_id: candidate.previous_log_id,
          duplicate_guard: 'success_exists_for_envio_hash',
          retry_count: candidate.retry_count,
          next_retry_at: candidate.next_retry_at,
          retryable: false,
          last_error_code: candidate.last_error_code,
          last_error_message: candidate.last_error_message,
        },
      });
      delete retryContextByRecordId[candidate.record_id];
      continue;
    }
    finalCandidates.push(candidate);
  }

  if (!finalCandidates.length) {
    return result;
  }

  const recordIds = Array.from(new Set(finalCandidates.map((item) => item.record_id)));
  const { data: records, error: recordsError } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, user_id, representante_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, observacao, status, drive_file_id, preventiva_enviada, data_envio_preventiva, cobranca_vencimento_enviada, data_envio_vencimento, ultima_cobranca, tentativas_cobranca, created_at, updated_at')
    .eq('company_id', companyId)
    .in('id', recordIds);

  if (recordsError) throw new Error(recordsError.message);

  const batchRecords = (records || [])
    .filter((row) => Boolean(retryContextByRecordId[row.id]))
    .slice(0, BATCH_MAX_RECORDS) as FinancialRow[];

  if (!batchRecords.length) {
    return result;
  }

  const batchResult = await processBatch(
    supabaseAdmin,
    batchRecords,
    config,
    token,
    folderId,
    todayIso,
    {
      simulate: false,
      force: true,
      companyName,
      batchId: result.batch_id,
      startedAt: Date.now(),
      retryContextByRecordId,
    },
  );

  result.reprocessed = batchResult.items.length;
  result.success = batchResult.summary.enviados;
  result.failed = batchResult.summary.erros;
  result.items.push(...batchResult.items.map((item) => ({
    previous_log_id: item.previous_log_id,
    record_id: item.record_id,
    retry_count: item.retry_count,
    retryable: item.retryable,
    next_retry_at: item.next_retry_at,
    status: item.status,
    error_code: item.error_code,
    error_message: item.error_message,
    provider_message_id: item.provider_message_id,
    boleto_file_name: item.boleto_file_name,
  })));

  return result;
}

const DISPATCH_JOB_BATCH_DEFAULT = 20;
const DISPATCH_JOB_BATCH_LIMIT = 50;
const DISPATCH_JOB_LOCK_TIMEOUT_MS = 5 * 60_000;
const DISPATCH_JOB_HARD_LIMIT_MS = 52_000;
const DISPATCH_JOB_SOFT_LIMIT_MS = 45_000;
const DISPATCH_JOB_SOFT_MARGIN_MS = 2_500;

// ── Scheduler constants ───────────────────────────────────────────────────────
const SCHEDULER_WORKER_VERSION = 'etapa9-v1';
const SCHEDULER_MAX_CONCURRENT_JOBS = 3;
const SCHEDULER_STALE_JOB_TIMEOUT_MS = 2 * 60_000; // 2 minutes without heartbeat
const SCHEDULER_LOG_RETENTION_DAYS = 7;

// ── Multi-tenant quota constants (ETAPA 9) ────────────────────────────────────
const TENANT_DEFAULT_MAX_ACTIVE_JOBS = 3;
const TENANT_DEFAULT_MAX_BATCH_SIZE = 50;
const TENANT_DEFAULT_MAX_DAILY_MESSAGES = 500;
const TENANT_DEFAULT_MAX_CONCURRENT_BATCHES = 2;
const TENANT_DEFAULT_MAX_RETRIES_PER_HOUR = 30;
const CIRCUIT_BREAKER_MIN_SAMPLES = 5;
const CIRCUIT_BREAKER_ERROR_RATE_THRESHOLD = 0.80; // 80%
const CIRCUIT_BREAKER_MAX_CONSECUTIVE_RATE_LIMITS = 3;
const CIRCUIT_BREAKER_MAX_CONSECUTIVE_FAILURES = 5;

interface SchedulerProcessedJob {
  job_id: string;
  company_id: string;
  stopped_reason: string;
  items_processed: number;
  status: string;
  error?: string;
}

interface SchedulerTickResult {
  jobs_found: number;
  jobs_processed: number;
  batches_run: number;
  stale_recovered: number;
  auto_completed: number;
  total_success: number;
  total_error: number;
  total_ignored: number;
  duration_ms: number;
  processed_jobs: SchedulerProcessedJob[];
}

interface DispatchJobRow {
  id: string;
  company_id: string;
  created_by: string | null;
  status: string;
  total_items: number;
  processed_items: number;
  success_count: number;
  error_count: number;
  ignored_count: number;
  current_batch_id: string | null;
  avg_ms_per_item: number | null;
  last_batch_duration_ms: number | null;
  recommended_batch_size: number | null;
  heartbeat_at: string | null;
  last_batch_at: string | null;
  worker_version: string | null;
  stopped_reason: string | null;
  scheduler_runs: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DispatchJobItemRow {
  id: string;
  job_id: string;
  company_id: string;
  record_id: string;
  payload: Record<string, unknown> | null;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  log_cobranca_id: string | null;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

interface TenantLimitsRow {
  id: string;
  company_id: string;
  max_active_jobs: number;
  max_batch_size: number;
  max_daily_messages: number;
  max_concurrent_batches: number;
  max_retries_per_hour: number;
  enabled: boolean;
  pause_reason: string | null;
  paused_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TenantQuotaUsage {
  active_jobs: number;
  daily_messages: number;
  concurrent_batches: number;
  retries_last_hour: number;
}

// ── Scheduler tick ────────────────────────────────────────────────────────────

async function runSchedulerTick(
  admin: AdminClient,
  googleToken: string,
  todayIso: string,
): Promise<SchedulerTickResult> {
  const tickStart = Date.now();
  const nowIso = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - SCHEDULER_STALE_JOB_TIMEOUT_MS).toISOString();

  // ── 1. Recover stale running jobs ──────────────────────────────────────────
  const { data: staleJobs } = await admin
    .from('dispatch_jobs')
    .select('id, company_id')
    .eq('status', 'running')
    .or(`heartbeat_at.is.null,heartbeat_at.lt.${staleThreshold}`)
    .limit(10);

  let staleRecovered = 0;
  for (const staleJob of (staleJobs || []) as Array<{ id: string; company_id: string }>) {
    await admin.from('dispatch_jobs').update({
      status: 'paused',
      stopped_reason: 'stale_worker',
      updated_at: nowIso,
    }).eq('id', staleJob.id);
    // Unlock any stuck items
    await admin.from('dispatch_job_items').update({
      status: 'pending',
      locked_at: null,
      locked_by: null,
      updated_at: nowIso,
    }).eq('job_id', staleJob.id).eq('status', 'processing');
    // Audit event (non-fatal)
    try {
      await admin.from('dispatch_audit_events').insert({
        company_id: staleJob.company_id,
        job_id: staleJob.id,
        event_type: 'stale_worker',
        payload: { recovered_at: nowIso },
        created_at: nowIso,
      });
    } catch { /* non-fatal */ }
    staleRecovered++;
  }

  // ── 2. Find eligible jobs (running > paused > pending) ────────────────────
  const { data: allEligible } = await admin
    .from('dispatch_jobs')
    .select('id, company_id, status, recommended_batch_size, total_items, processed_items, scheduler_runs, heartbeat_at')
    .in('status', ['running', 'paused', 'pending'])
    .order('updated_at', { ascending: true })
    .limit(SCHEDULER_MAX_CONCURRENT_JOBS * 6); // fetch more for round-robin selection

  // Load all tenant limits to skip disabled companies
  const eligibleRaw = (allEligible || []) as Array<{
    id: string; company_id: string; status: string;
    recommended_batch_size: number | null; total_items: number;
    processed_items: number; scheduler_runs: number; heartbeat_at: string | null;
  }>;

  const uniqueCompanyIds = [...new Set(eligibleRaw.map((j) => j.company_id))];
  let disabledCompanies = new Set<string>();
  if (uniqueCompanyIds.length > 0) {
    const { data: limits } = await admin
      .from('dispatch_company_limits')
      .select('company_id, enabled')
      .in('company_id', uniqueCompanyIds);
    for (const l of (limits || []) as Array<{ company_id: string; enabled: boolean }>) {
      if (!l.enabled) disabledCompanies.add(l.company_id);
    }
  }

  // Sort by priority: running=0, paused=1, pending=2
  const priorityMap: Record<string, number> = { running: 0, paused: 1, pending: 2 };
  const sorted = eligibleRaw
    .filter((j) => !disabledCompanies.has(j.company_id))
    .sort((a, b) => (priorityMap[a.status] ?? 3) - (priorityMap[b.status] ?? 3));

  // Fair round-robin: max 1 job per company per tick, up to SCHEDULER_MAX_CONCURRENT_JOBS total
  const seenCompanies = new Set<string>();
  const prioritized: typeof sorted = [];
  for (const job of sorted) {
    if (prioritized.length >= SCHEDULER_MAX_CONCURRENT_JOBS) break;
    if (seenCompanies.has(job.company_id)) continue;
    seenCompanies.add(job.company_id);
    prioritized.push(job);
  }

  // ── 3. Process each eligible job ──────────────────────────────────────────
  let batchesRun = 0;
  let autoCompleted = 0;
  let totalSuccess = 0;
  let totalError = 0;
  let totalIgnored = 0;
  const processedJobs: SchedulerProcessedJob[] = [];

  for (const job of prioritized) {
    // Update heartbeat before processing
    await admin.from('dispatch_jobs').update({
      heartbeat_at: nowIso,
      worker_version: SCHEDULER_WORKER_VERSION,
      last_batch_at: nowIso,
      scheduler_runs: (Number(job.scheduler_runs) || 0) + 1,
      updated_at: nowIso,
    }).eq('id', job.id);

    let jobError: string | undefined;
    let stoppedReason = 'completed';
    let itemsProcessed = 0;
    let jobStatus = job.status;

    try {
      const companyName = await getCompanyName(admin, job.company_id);
      const batchResult = await runDispatchJobBatchData(
        admin,
        job.company_id,
        job.id,
        googleToken,
        todayIso,
        companyName,
        {},
      );

      batchesRun++;
      stoppedReason = batchResult.stopped_reason || 'completed';
      itemsProcessed = Number(batchResult.processed_items) || 0;

      const summary = batchResult.summary as Record<string, number> | null;
      totalSuccess += Number(summary?.enviados ?? summary?.sucesso ?? 0);
      totalError += Number(summary?.erros ?? 0);
      totalIgnored += Number(summary?.ignorados ?? 0);

      const updatedJob = (batchResult.status as { job?: { status?: string } })?.job;
      jobStatus = updatedJob?.status || 'unknown';

      if (jobStatus === 'completed' || jobStatus === 'failed') {
        autoCompleted++;
      }
    } catch (err) {
      jobError = err instanceof Error ? err.message : String(err);
      jobStatus = 'error';
      stoppedReason = 'scheduler_error';
      console.error('[scheduler] erro ao processar job', { job_id: job.id, error: jobError });
    }

    // Update heartbeat after processing
    await admin.from('dispatch_jobs').update({
      heartbeat_at: new Date().toISOString(),
      stopped_reason: stoppedReason !== 'completed' ? stoppedReason : null,
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);

    processedJobs.push({
      job_id: job.id,
      company_id: job.company_id,
      stopped_reason: stoppedReason,
      items_processed: itemsProcessed,
      status: jobStatus,
      ...(jobError ? { error: jobError } : {}),
    });
  }

  const durationMs = Date.now() - tickStart;

  // ── 4. Log scheduler tick ─────────────────────────────────────────────────
  try {
    await admin.from('dispatch_scheduler_logs').insert({
      tick_at: nowIso,
      scheduler_version: SCHEDULER_WORKER_VERSION,
      jobs_found: (allEligible || []).length,
      jobs_processed: prioritized.length,
      batches_run: batchesRun,
      stale_recovered: staleRecovered,
      auto_completed: autoCompleted,
      total_success: totalSuccess,
      total_error: totalError,
      total_ignored: totalIgnored,
      duration_ms: durationMs,
      created_at: nowIso,
    });

    // Housekeeping: remove logs older than retention window
    const retentionCutoff = new Date(Date.now() - SCHEDULER_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await admin.from('dispatch_scheduler_logs').delete().lt('tick_at', retentionCutoff);
  } catch {
    // Non-fatal — logging failure should not break the tick
  }

  return {
    jobs_found: (allEligible || []).length,
    jobs_processed: prioritized.length,
    batches_run: batchesRun,
    stale_recovered: staleRecovered,
    auto_completed: autoCompleted,
    total_success: totalSuccess,
    total_error: totalError,
    total_ignored: totalIgnored,
    duration_ms: durationMs,
    processed_jobs: processedJobs,
  };
}

async function getSchedulerStatusData(admin: AdminClient) {
  const [latestLogsRes, activeJobsRes, staleJobsRes] = await Promise.all([
    admin
      .from('dispatch_scheduler_logs')
      .select('*')
      .order('tick_at', { ascending: false })
      .limit(10),
    admin
      .from('dispatch_jobs')
      .select('id, company_id, status, heartbeat_at, scheduler_runs, total_items, processed_items')
      .in('status', ['running', 'paused', 'pending'])
      .order('updated_at', { ascending: false })
      .limit(20),
    admin
      .from('dispatch_jobs')
      .select('id, company_id, heartbeat_at, stopped_reason, updated_at')
      .eq('status', 'running')
      .lt('heartbeat_at', new Date(Date.now() - SCHEDULER_STALE_JOB_TIMEOUT_MS).toISOString())
      .limit(10),
  ]);

  const latestLog = (latestLogsRes.data || [])[0] || null;
  const lastTickAt = latestLog?.tick_at || null;
  const workerOnline = lastTickAt
    ? (Date.now() - new Date(lastTickAt).getTime()) < 90_000 // online if last tick < 90s ago
    : false;

  return {
    worker_online: workerOnline,
    scheduler_version: SCHEDULER_WORKER_VERSION,
    last_tick_at: lastTickAt,
    active_jobs: (activeJobsRes.data || []).length,
    stale_jobs: (staleJobsRes.data || []).length,
    latest_logs: latestLogsRes.data || [],
    active_job_list: activeJobsRes.data || [],
  };
}

// ── End scheduler ─────────────────────────────────────────────────────────────

// ── ETAPA 9: Multi-tenant quota helpers ───────────────────────────────────────

async function getCompanyLimits(
  admin: AdminClient,
  companyId: string,
): Promise<TenantLimitsRow> {
  const { data, error } = await admin
    .from('dispatch_company_limits')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return data as TenantLimitsRow;

  // Auto-create with safe defaults
  const nowIso = new Date().toISOString();
  const { data: created, error: createError } = await admin
    .from('dispatch_company_limits')
    .insert({
      company_id: companyId,
      max_active_jobs: TENANT_DEFAULT_MAX_ACTIVE_JOBS,
      max_batch_size: TENANT_DEFAULT_MAX_BATCH_SIZE,
      max_daily_messages: TENANT_DEFAULT_MAX_DAILY_MESSAGES,
      max_concurrent_batches: TENANT_DEFAULT_MAX_CONCURRENT_BATCHES,
      max_retries_per_hour: TENANT_DEFAULT_MAX_RETRIES_PER_HOUR,
      enabled: true,
      pause_reason: null,
      paused_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single();

  if (createError) throw new Error(createError.message);
  return created as TenantLimitsRow;
}

async function getTenantQuotaUsage(
  admin: AdminClient,
  companyId: string,
  todayIso: string,
): Promise<TenantQuotaUsage> {
  const todayStart = `${todayIso}T00:00:00-03:00`;
  const todayEnd = `${todayIso}T23:59:59-03:00`;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [activeJobsRes, dailyMsgsRes, batchesRes, retriesRes] = await Promise.all([
    admin
      .from('dispatch_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['running', 'paused', 'pending']),
    admin
      .from('dispatch_job_items')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'success')
      .gte('updated_at', todayStart)
      .lte('updated_at', todayEnd),
    admin
      .from('dispatch_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'running'),
    admin
      .from('dispatch_job_items')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'error')
      .gt('attempt_count', 1)
      .gte('updated_at', oneHourAgo),
  ]);

  return {
    active_jobs: activeJobsRes.count || 0,
    daily_messages: dailyMsgsRes.count || 0,
    concurrent_batches: batchesRes.count || 0,
    retries_last_hour: retriesRes.count || 0,
  };
}

async function logDispatchAuditEvent(
  admin: AdminClient,
  companyId: string | null,
  jobId: string | null,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from('dispatch_audit_events').insert({
      company_id: companyId || null,
      job_id: jobId || null,
      event_type: eventType,
      payload,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal: audit failures must never block operations
  }
}

async function enforceCreateJobQuota(
  admin: AdminClient,
  companyId: string,
  todayIso: string,
): Promise<void> {
  const limits = await getCompanyLimits(admin, companyId);

  if (!limits.enabled) {
    await logDispatchAuditEvent(admin, companyId, null, 'tenant_disabled', {
      reason: limits.pause_reason || 'tenant disabled',
    });
    throw new Error('Dispatch desabilitado para esta empresa. Contate o suporte.');
  }

  const usage = await getTenantQuotaUsage(admin, companyId, todayIso);

  if (usage.active_jobs >= limits.max_active_jobs) {
    await logDispatchAuditEvent(admin, companyId, null, 'quota_exceeded', {
      quota: 'max_active_jobs',
      limit: limits.max_active_jobs,
      current: usage.active_jobs,
    });
    throw new Error(
      `Limite de jobs ativos atingido (${usage.active_jobs}/${limits.max_active_jobs}). Aguarde jobs existentes concluirem.`,
    );
  }

  if (usage.daily_messages >= limits.max_daily_messages) {
    await logDispatchAuditEvent(admin, companyId, null, 'quota_exceeded', {
      quota: 'max_daily_messages',
      limit: limits.max_daily_messages,
      current: usage.daily_messages,
    });
    throw new Error(
      `Limite diario de mensagens atingido (${usage.daily_messages}/${limits.max_daily_messages}). Aguarde o proximo dia.`,
    );
  }
}

async function enforceBatchQuota(
  admin: AdminClient,
  companyId: string,
  jobId: string,
  todayIso: string,
): Promise<{ limits: TenantLimitsRow; usage: TenantQuotaUsage }> {
  const limits = await getCompanyLimits(admin, companyId);

  if (!limits.enabled) {
    await logDispatchAuditEvent(admin, companyId, jobId, 'tenant_disabled', {
      reason: limits.pause_reason || 'tenant disabled',
      job_id: jobId,
    });
    await admin.from('dispatch_jobs').update({
      status: 'paused',
      stopped_reason: 'tenant_disabled',
      updated_at: new Date().toISOString(),
    }).eq('id', jobId).eq('company_id', companyId);
    throw new Error('Dispatch desabilitado para esta empresa.');
  }

  const usage = await getTenantQuotaUsage(admin, companyId, todayIso);

  if (usage.daily_messages >= limits.max_daily_messages) {
    await logDispatchAuditEvent(admin, companyId, jobId, 'quota_exceeded', {
      quota: 'max_daily_messages',
      limit: limits.max_daily_messages,
      current: usage.daily_messages,
    });
    await admin.from('dispatch_jobs').update({
      status: 'paused',
      stopped_reason: 'daily_quota_exceeded',
      updated_at: new Date().toISOString(),
    }).eq('id', jobId).eq('company_id', companyId);
    throw new Error(
      `Limite diario de mensagens atingido (${usage.daily_messages}/${limits.max_daily_messages}).`,
    );
  }

  if (usage.retries_last_hour >= limits.max_retries_per_hour) {
    await logDispatchAuditEvent(admin, companyId, jobId, 'rate_limit_pause', {
      quota: 'max_retries_per_hour',
      limit: limits.max_retries_per_hour,
      current: usage.retries_last_hour,
    });
    await admin.from('dispatch_jobs').update({
      status: 'paused',
      stopped_reason: 'rate_limit_pause',
      updated_at: new Date().toISOString(),
    }).eq('id', jobId).eq('company_id', companyId);
    throw new Error(
      `Limite de retentativas por hora atingido (${usage.retries_last_hour}/${limits.max_retries_per_hour}).`,
    );
  }

  return { limits, usage };
}

async function updateProviderHealth(
  admin: AdminClient,
  companyId: string,
  success: boolean,
  latencyMs: number,
): Promise<{ state: string; consecutive_failures: number; is_rate_limit: boolean }> {
  const nowIso = new Date().toISOString();
  const isRateLimit = !success && latencyMs < 0; // convention: latencyMs = -1 signals rate limit

  const { data: current } = await admin
    .from('dispatch_provider_health')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  const prev = current as Record<string, unknown> | null;
  const prevConsecFailures = Number(prev?.consecutive_failures || 0);
  const prevConsecRateLimits = Number(prev?.consecutive_rate_limits || 0);
  const prevSuccess24h = Number(prev?.total_success_24h || 0);
  const prevError24h = Number(prev?.total_error_24h || 0);
  const prevAvg = Number(prev?.avg_response_ms || 0);

  const consecutiveFailures = success ? 0 : prevConsecFailures + 1;
  const consecutiveRateLimits = isRateLimit
    ? prevConsecRateLimits + 1
    : success
      ? 0
      : prevConsecRateLimits;
  const total_success_24h = prevSuccess24h + (success ? 1 : 0);
  const total_error_24h = prevError24h + (success ? 0 : 1);
  const effectiveLatency = success && latencyMs > 0 ? latencyMs : null;
  const newAvg = effectiveLatency
    ? (prevAvg > 0 ? Math.round((prevAvg * 0.7) + (effectiveLatency * 0.3)) : effectiveLatency)
    : prevAvg;

  const total = total_success_24h + total_error_24h;
  const errorRate = total > 0 ? total_error_24h / total : 0;

  let state: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (
    consecutiveFailures >= CIRCUIT_BREAKER_MAX_CONSECUTIVE_FAILURES ||
    (total >= CIRCUIT_BREAKER_MIN_SAMPLES && errorRate >= CIRCUIT_BREAKER_ERROR_RATE_THRESHOLD)
  ) {
    state = 'unhealthy';
  } else if (
    consecutiveFailures >= 2 ||
    consecutiveRateLimits >= CIRCUIT_BREAKER_MAX_CONSECUTIVE_RATE_LIMITS ||
    (total >= CIRCUIT_BREAKER_MIN_SAMPLES && errorRate >= 0.5)
  ) {
    state = 'degraded';
  }

  const prevState = String(prev?.state || 'healthy');
  const upsertData: Record<string, unknown> = {
    company_id: companyId,
    last_success_at: success ? nowIso : (prev?.last_success_at || null),
    last_failure_at: success ? (prev?.last_failure_at || null) : nowIso,
    last_response_ms: effectiveLatency,
    avg_response_ms: newAvg,
    consecutive_failures: consecutiveFailures,
    consecutive_rate_limits: consecutiveRateLimits,
    total_success_24h,
    total_error_24h,
    state,
    unhealthy_since: state === 'unhealthy' && prevState !== 'unhealthy'
      ? nowIso
      : (prev?.unhealthy_since || null),
    updated_at: nowIso,
  };

  await admin
    .from('dispatch_provider_health')
    .upsert(upsertData, { onConflict: 'company_id' });

  return { state, consecutive_failures: consecutiveFailures, is_rate_limit: isRateLimit };
}

// ── End ETAPA 9 helpers ───────────────────────────────────────────────────────

function normalizeDispatchSelectionItems(body: Record<string, unknown>) {
  const rawList = Array.isArray(body?.items)
    ? body.items
    : Array.isArray(body?.selected_records)
      ? body.selected_records
      : Array.isArray(body?.record_ids)
        ? body.record_ids
        : Array.isArray(body?.records)
          ? body.records
          : [];

  return rawList
    .map((entry) => {
      if (typeof entry === 'string') {
        return { record_id: entry, payload: { record_id: entry } };
      }
      if (entry && typeof entry === 'object') {
        const recordId = String(
          (entry as Record<string, unknown>).record_id
          || (entry as Record<string, unknown>).registro_id
          || (entry as Record<string, unknown>).id
          || '',
        ).trim();
        if (!recordId) return null;
        return { record_id: recordId, payload: entry as Record<string, unknown> };
      }
      return null;
    })
    .filter(Boolean) as Array<{ record_id: string; payload: Record<string, unknown> }>;
}

function clampDispatchBatchSize(value: unknown, fallback = DISPATCH_JOB_BATCH_DEFAULT) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(DISPATCH_JOB_BATCH_LIMIT, Math.max(1, Math.floor(numeric)));
}

function computeAdaptiveBatchSize(
  requestedBatchSize: number,
  recommendedBatchSize: number,
  avgMsPerItem: number | null,
) {
  const safeAverage = Math.max(500, Number(avgMsPerItem || 2500));
  const budgetLimitedSize = Math.max(
    1,
    Math.floor((DISPATCH_JOB_SOFT_LIMIT_MS - DISPATCH_JOB_SOFT_MARGIN_MS) / safeAverage),
  );
  return Math.min(
    DISPATCH_JOB_BATCH_LIMIT,
    requestedBatchSize,
    recommendedBatchSize,
    budgetLimitedSize,
  );
}

function computeNextRecommendedBatchSize(
  currentRecommended: number,
  batchDurationMs: number,
  stoppedReason: BatchStoppedReason,
) {
  const current = clampDispatchBatchSize(currentRecommended, DISPATCH_JOB_BATCH_DEFAULT);
  if (stoppedReason === 'hard_timeout_guard') {
    return clampDispatchBatchSize(Math.floor(current * 0.5), 1);
  }
  if (batchDurationMs > 40_000 || stoppedReason === 'rate_limited') {
    return clampDispatchBatchSize(Math.floor(current * 0.7), 1);
  }
  if (batchDurationMs < 25_000 && stoppedReason === 'completed') {
    return clampDispatchBatchSize(current + 5, DISPATCH_JOB_BATCH_DEFAULT);
  }
  return current;
}

async function syncDispatchJobCounters(
  supabaseAdmin: AdminClient,
  jobId: string,
  companyId: string,
): Promise<DispatchJobRow> {
  const { data: currentJob, error: currentJobError } = await supabaseAdmin
    .from('dispatch_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .single();

  if (currentJobError) throw new Error(currentJobError.message);

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('dispatch_job_items')
    .select('status, next_attempt_at, attempt_count, max_attempts')
    .eq('job_id', jobId)
    .eq('company_id', companyId);

  if (itemsError) throw new Error(itemsError.message);

  const rows = (items || []) as Array<Record<string, unknown>>;
  const successCount = rows.filter((row) => String(row.status || '') === 'success').length;
  const errorCount = rows.filter((row) => String(row.status || '') === 'error').length;
  const ignoredCount = rows.filter((row) => String(row.status || '') === 'ignored').length;
  const processingCount = rows.filter((row) => String(row.status || '') === 'processing').length;
  const pendingCount = rows.filter((row) => String(row.status || '') === 'pending').length;
  const processedItems = successCount + errorCount + ignoredCount;
  const totalItems = rows.length;
  const nowIso = new Date().toISOString();

  let nextStatus = 'running';
  let finishedAt: string | null = null;

  if (String(currentJob.status || '') === 'cancelled') {
    nextStatus = 'cancelled';
    finishedAt = currentJob.finished_at || nowIso;
  } else if (pendingCount + processingCount > 0) {
    if (String(currentJob.status || '') === 'paused' && processingCount === 0) {
      nextStatus = 'paused';
    } else {
      nextStatus = processingCount > 0 || processedItems > 0 ? 'running' : 'pending';
    }
  } else if (errorCount > 0) {
    const retryPending = rows.some((row) => {
      if (String(row.status || '') !== 'error') return false;
      const attempts = Number(row.attempt_count || 0);
      const maxAttempts = Number(row.max_attempts || RETRY_MAX_ATTEMPTS);
      const nextAttemptAt = String(row.next_attempt_at || '').trim();
      return attempts < maxAttempts && Boolean(nextAttemptAt) && nextAttemptAt > nowIso;
    });
    nextStatus = retryPending ? 'paused' : 'failed';
    if (!retryPending) finishedAt = nowIso;
  } else {
    nextStatus = 'completed';
    finishedAt = nowIso;
  }

  const { data: updatedJob, error: updateError } = await supabaseAdmin
    .from('dispatch_jobs')
    .update({
      status: nextStatus,
      total_items: totalItems,
      processed_items: processedItems,
      success_count: successCount,
      error_count: errorCount,
      ignored_count: ignoredCount,
      finished_at: finishedAt,
      updated_at: nowIso,
    })
    .eq('id', jobId)
    .eq('company_id', companyId)
    .select('*')
    .single();

  if (updateError) throw new Error(updateError.message);
  return updatedJob as DispatchJobRow;
}

async function getDispatchJobStatusData(
  supabaseAdmin: AdminClient,
  companyId: string,
  jobId: string,
) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from('dispatch_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) throw new Error('Dispatch job nao encontrado.');

  const syncedJob = await syncDispatchJobCounters(supabaseAdmin, jobId, companyId);

  const [latestErrorsRes, latestSuccessRes, pendingItemsRes] = await Promise.all([
    supabaseAdmin
      .from('dispatch_job_items')
      .select('id, record_id, status, attempt_count, max_attempts, next_attempt_at, last_error_code, last_error_message, log_cobranca_id, updated_at')
      .eq('job_id', jobId)
      .eq('company_id', companyId)
      .eq('status', 'error')
      .order('updated_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('dispatch_job_items')
      .select('id, record_id, status, attempt_count, log_cobranca_id, updated_at')
      .eq('job_id', jobId)
      .eq('company_id', companyId)
      .eq('status', 'success')
      .order('updated_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('dispatch_job_items')
      .select('id, record_id, status, attempt_count, max_attempts, next_attempt_at, locked_at, locked_by, updated_at')
      .eq('job_id', jobId)
      .eq('company_id', companyId)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true })
      .limit(20),
  ]);

  if (latestErrorsRes.error) throw new Error(latestErrorsRes.error.message);
  if (latestSuccessRes.error) throw new Error(latestSuccessRes.error.message);
  if (pendingItemsRes.error) throw new Error(pendingItemsRes.error.message);

  const progress = syncedJob.total_items > 0
    ? Math.min(100, Math.round((syncedJob.processed_items / syncedJob.total_items) * 100))
    : 0;

  return {
    job: syncedJob,
    progress,
    latest_errors: latestErrorsRes.data || [],
    latest_successes: latestSuccessRes.data || [],
    pending_items: pendingItemsRes.data || [],
  };
}

async function createDispatchJobData(
  supabaseAdmin: AdminClient,
  companyId: string,
  createdBy: string | null,
  body: Record<string, unknown>,
) {
  // ETAPA 9: Enforce tenant quota before creating a job
  const todayIso = todayInSaoPaulo();
  await enforceCreateJobQuota(supabaseAdmin, companyId, todayIso);

  const simulate = body?.simulate === true;
  const normalizedItems = normalizeDispatchSelectionItems(body);
  const uniqueItems = Array.from(new Map(normalizedItems.map((item) => [item.record_id, item])).values());
  if (!uniqueItems.length) {
    throw new Error('Nenhum registro selecionado para criar o job.');
  }

  const recordIds = uniqueItems.map((item) => item.record_id);
  const { data: existingRecords, error: recordsError } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id')
    .eq('company_id', companyId)
    .in('id', recordIds);

  if (recordsError) throw new Error(recordsError.message);

  const validIds = new Set((existingRecords || []).map((row) => String(row.id)));
  const itemsToCreate = uniqueItems.filter((item) => validIds.has(item.record_id));
  if (!itemsToCreate.length) {
    throw new Error('Nenhum registro valido da empresa foi encontrado para criar o job.');
  }

  const nowIso = new Date().toISOString();
  const { data: job, error: jobError } = await supabaseAdmin
    .from('dispatch_jobs')
    .insert({
      company_id: companyId,
      created_by: createdBy,
      status: 'pending',
      total_items: itemsToCreate.length,
      processed_items: 0,
      success_count: 0,
      error_count: 0,
      ignored_count: 0,
      current_batch_id: null,
      avg_ms_per_item: null,
      last_batch_duration_ms: null,
      recommended_batch_size: DISPATCH_JOB_BATCH_DEFAULT,
      started_at: null,
      finished_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single();

  if (jobError) throw new Error(jobError.message);

  const { error: itemsError } = await supabaseAdmin
    .from('dispatch_job_items')
    .insert(itemsToCreate.map((item) => ({
      job_id: job.id,
      company_id: companyId,
      record_id: item.record_id,
      payload: {
        ...(item.payload || { record_id: item.record_id }),
        simulate,
      },
      status: 'pending',
      attempt_count: 0,
      max_attempts: RETRY_MAX_ATTEMPTS,
      next_attempt_at: null,
      last_error_code: null,
      last_error_message: null,
      log_cobranca_id: null,
      locked_at: null,
      locked_by: null,
      created_at: nowIso,
      updated_at: nowIso,
    })));

  if (itemsError) throw new Error(itemsError.message);

  return {
    job,
    created_items: itemsToCreate.length,
    ignored_invalid_records: uniqueItems.length - itemsToCreate.length,
  };
}

async function cancelDispatchJobData(
  supabaseAdmin: AdminClient,
  companyId: string,
  jobId: string,
) {
  const nowIso = new Date().toISOString();
  const { data: job, error: jobError } = await supabaseAdmin
    .from('dispatch_jobs')
    .update({
      status: 'cancelled',
      finished_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', jobId)
    .eq('company_id', companyId)
    .neq('status', 'completed')
    .select('*')
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) throw new Error('Dispatch job nao encontrado ou ja concluido.');

  await supabaseAdmin
    .from('dispatch_job_items')
    .update({
      locked_at: null,
      locked_by: null,
      updated_at: nowIso,
      status: 'ignored',
      last_error_code: 'job_cancelled',
      last_error_message: 'Job cancelado manualmente antes do processamento.',
    })
    .eq('job_id', jobId)
    .eq('company_id', companyId)
    .in('status', ['pending', 'processing']);

  return getDispatchJobStatusData(supabaseAdmin, companyId, jobId);
}

async function runDispatchJobBatchData(
  supabaseAdmin: AdminClient,
  companyId: string,
  jobId: string,
  googleToken: string,
  todayIso: string,
  companyName: string,
  body: Record<string, unknown> = {},
) {
  const { data: rawJob, error: jobError } = await supabaseAdmin
    .from('dispatch_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!rawJob) throw new Error('Dispatch job nao encontrado.');
  if (['cancelled', 'completed'].includes(String(rawJob.status || ''))) {
    return {
      batch_id: rawJob.current_batch_id || null,
      requested_batch_size: clampDispatchBatchSize(body.requested_batch_size, DISPATCH_JOB_BATCH_DEFAULT),
      effective_batch_size: 0,
      recommended_next_batch_size: clampDispatchBatchSize(rawJob.recommended_batch_size, DISPATCH_JOB_BATCH_DEFAULT),
      stopped_reason: String(rawJob.status || '') === 'cancelled' ? 'cancelled' : 'completed',
      picked_items: 0,
      processed_items: 0,
      status: await getDispatchJobStatusData(supabaseAdmin, companyId, jobId),
    };
  }

  // ETAPA 9: Enforce batch quota (daily messages, rate limit, tenant enabled)
  await enforceBatchQuota(supabaseAdmin, companyId, jobId, todayIso);

  const requestedBatchSize = clampDispatchBatchSize(body.requested_batch_size, DISPATCH_JOB_BATCH_DEFAULT);
  const currentRecommendedBatchSize = clampDispatchBatchSize(rawJob.recommended_batch_size, DISPATCH_JOB_BATCH_DEFAULT);
  const currentAvgMsPerItem = Number(rawJob.avg_ms_per_item || 0) > 0 ? Number(rawJob.avg_ms_per_item) : null;
  const effectiveBatchSize = computeAdaptiveBatchSize(
    requestedBatchSize,
    currentRecommendedBatchSize,
    currentAvgMsPerItem,
  );

  const config = await getBillingConfigForCompany(supabaseAdmin, companyId);
  const driveConfig = await getSheetsDriveConfig(supabaseAdmin, companyId);
  const folderId = requireDriveFolderId(driveConfig?.drive_root_folder_id);
  const workerId = crypto.randomUUID();
  const batchId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - DISPATCH_JOB_LOCK_TIMEOUT_MS).toISOString();

  await supabaseAdmin
    .from('dispatch_job_items')
    .update({
      status: 'pending',
      locked_at: null,
      locked_by: null,
      updated_at: nowIso,
    })
    .eq('job_id', jobId)
    .eq('company_id', companyId)
    .eq('status', 'processing')
    .lt('locked_at', staleIso);

  await supabaseAdmin
    .from('dispatch_jobs')
    .update({
      status: 'running',
      current_batch_id: batchId,
      started_at: rawJob.started_at || nowIso,
      finished_at: null,
      updated_at: nowIso,
    })
    .eq('id', jobId)
    .eq('company_id', companyId);

  const { data: candidates, error: candidatesError } = await supabaseAdmin
    .from('dispatch_job_items')
    .select('*')
    .eq('job_id', jobId)
    .eq('company_id', companyId)
    .in('status', ['pending', 'error'])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(Math.max(effectiveBatchSize * 3, effectiveBatchSize));

  if (candidatesError) throw new Error(candidatesError.message);

  const lockedItems: DispatchJobItemRow[] = [];
  for (const row of (candidates || []) as DispatchJobItemRow[]) {
    if (lockedItems.length >= effectiveBatchSize) break;
    if (row.attempt_count >= row.max_attempts) continue;
    if (row.status === 'error') {
      const retryable = isRetryableLogCode(row.last_error_code);
      const nextAttemptAt = String(row.next_attempt_at || '').trim();
      if (!retryable) continue;
      if (!nextAttemptAt || nextAttemptAt > nowIso) continue;
    }

    const { data: locked, error: lockError } = await supabaseAdmin
      .from('dispatch_job_items')
      .update({
        status: 'processing',
        attempt_count: Number(row.attempt_count || 0) + 1,
        locked_at: nowIso,
        locked_by: workerId,
        updated_at: nowIso,
      })
      .eq('id', row.id)
      .eq('job_id', jobId)
      .eq('company_id', companyId)
      .in('status', ['pending', 'error'])
      .or(`locked_at.is.null,locked_at.lt.${staleIso}`)
      .select('*')
      .maybeSingle();

    if (lockError) throw new Error(lockError.message);
    if (locked) lockedItems.push(locked as DispatchJobItemRow);
  }

  if (!lockedItems.length) {
    const statusData = await getDispatchJobStatusData(supabaseAdmin, companyId, jobId);
    return {
      batch_id: batchId,
      requested_batch_size: requestedBatchSize,
      effective_batch_size: effectiveBatchSize,
      recommended_next_batch_size: currentRecommendedBatchSize,
      stopped_reason: 'no_items',
      picked_items: 0,
      processed_items: 0,
      status: statusData,
    };
  }

  const duplicateIgnoredItems: Array<Record<string, unknown>> = [];
  const executableItems: DispatchJobItemRow[] = [];
  let simulateMode = false;
  let batchItems: BatchItemResult[] = [];
  let batchSummary: BatchSummary | null = null;
  let batchStoppedReason: BatchStoppedReason = 'completed';

  if (lockedItems.length) {
    const recordIds = lockedItems.map((item) => item.record_id);
    const { data: records, error: recordsError } = await supabaseAdmin
      .from('registros_financeiros')
      .select('id, company_id, user_id, representante_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, observacao, status, drive_file_id, preventiva_enviada, data_envio_preventiva, cobranca_vencimento_enviada, data_envio_vencimento, ultima_cobranca, tentativas_cobranca, created_at, updated_at')
      .eq('company_id', companyId)
      .in('id', recordIds);

    if (recordsError) throw new Error(recordsError.message);

    const recordsById = new Map(((records || []) as FinancialRow[]).map((row) => [row.id, row]));
    const candidateHashes = await Promise.all(lockedItems.map(async (item) => {
      const payload = readPayloadObject(item.payload);
      const payloadHash = String(payload.envio_hash || '').trim();
      if (payloadHash) return payloadHash;
      const record = recordsById.get(item.record_id);
      if (!record) return '';
      return await computeEnvioHashForRecord(record, config as BillingConfigRow | null, todayIso) || '';
    }));

    const successHashes = new Set<string>();
    const nonEmptyHashes = candidateHashes.filter(Boolean);
    if (nonEmptyHashes.length) {
      const { data: successLogs, error: successLogsError } = await supabaseAdmin
        .from('logs_cobranca')
        .select('envio_hash, status_envio')
        .eq('company_id', companyId)
        .in('envio_hash', nonEmptyHashes)
        .in('status_envio', Array.from(SUCCESS_LOG_STATUSES));

      if (successLogsError) throw new Error(successLogsError.message);
      for (const row of successLogs || []) {
        if (row?.envio_hash && isSuccessfulLogStatus(row.status_envio)) {
          successHashes.add(String(row.envio_hash));
        }
      }
    }

    lockedItems.forEach((item, index) => {
      const envioHash = candidateHashes[index] || '';
      const payload = readPayloadObject(item.payload);
      if (payload.simulate === true) simulateMode = true;
      if (envioHash && successHashes.has(envioHash)) {
        duplicateIgnoredItems.push({
          item_id: item.id,
          record_id: item.record_id,
          previous_log_id: item.log_cobranca_id,
          retry_count: Math.max(0, Number(item.attempt_count || 1) - 1),
          retryable: false,
          next_retry_at: null,
          status: 'ignored_duplicate_success',
          envio_hash: envioHash,
        });
      } else if (recordsById.has(item.record_id)) {
        executableItems.push({
          ...item,
          payload: {
            ...readPayloadObject(item.payload),
            envio_hash: envioHash || null,
          },
        });
      }
    });

    for (const ignored of duplicateIgnoredItems) {
      await supabaseAdmin
        .from('dispatch_job_items')
        .update({
          status: 'ignored',
          payload: {
            ...readPayloadObject(lockedItems.find((item) => item.id === ignored.item_id)?.payload),
            envio_hash: ignored.envio_hash || null,
          },
          locked_at: null,
          locked_by: null,
          last_error_code: 'ignored_duplicate_success',
          last_error_message: 'Item ignorado porque ja existe sucesso previo para o mesmo envio_hash.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', String(ignored.item_id))
        .eq('job_id', jobId)
        .eq('company_id', companyId);
    }
  }

  if (executableItems.length) {
    const recordIds = executableItems.map((item) => item.record_id);
    const { data: records, error: recordsError } = await supabaseAdmin
      .from('registros_financeiros')
      .select('id, company_id, user_id, representante_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, observacao, status, drive_file_id, preventiva_enviada, data_envio_preventiva, cobranca_vencimento_enviada, data_envio_vencimento, ultima_cobranca, tentativas_cobranca, created_at, updated_at')
      .eq('company_id', companyId)
      .in('id', recordIds);

    if (recordsError) throw new Error(recordsError.message);

    const retryContextByRecordId = Object.fromEntries(executableItems.map((item) => ([
      item.record_id,
      {
        previous_log_id: item.log_cobranca_id,
        retry_count: Math.max(0, Number(item.attempt_count || 1) - 1),
        retryable: true,
        next_retry_at: item.next_attempt_at,
      },
    ])));

    const processResult = await processBatch(
      supabaseAdmin,
      (records || []) as FinancialRow[],
      config as BillingConfigRow | null,
      googleToken,
      folderId,
      todayIso,
      {
        simulate: simulateMode,
        force: true,
        companyName,
        batchId,
        startedAt: Date.now(),
        hardDeadlineMs: Date.now() + DISPATCH_JOB_HARD_LIMIT_MS,
        softStopAtMs: Date.now() + DISPATCH_JOB_SOFT_LIMIT_MS,
        estimatedMsPerItem: currentAvgMsPerItem || 2500,
        softStopMarginMs: DISPATCH_JOB_SOFT_MARGIN_MS,
        retryContextByRecordId,
      },
    );

    batchItems = processResult.items;
    batchSummary = processResult.summary;
    batchStoppedReason = processResult.stoppedReason;
    const startedRecordIds = new Set(batchItems.map((item) => item.record_id));
    const unstartedItems = executableItems.filter((item) => !startedRecordIds.has(item.record_id));

    for (const unstarted of unstartedItems) {
      await supabaseAdmin
        .from('dispatch_job_items')
        .update({
          status: 'pending',
          attempt_count: Math.max(0, Number(unstarted.attempt_count || 1) - 1),
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', unstarted.id)
        .eq('job_id', jobId)
        .eq('company_id', companyId);
    }

    const { data: latestLogs, error: latestLogsError } = await supabaseAdmin
      .from('logs_cobranca')
      .select('id, financeiro_id, status_envio, erro, payload, envio_hash, created_at')
      .eq('company_id', companyId)
      .in('financeiro_id', recordIds)
      .order('created_at', { ascending: false });

    if (latestLogsError) throw new Error(latestLogsError.message);

    const latestLogByRecordId = new Map<string, Record<string, unknown>>();
    for (const row of (latestLogs || []) as Array<Record<string, unknown>>) {
      const recordId = String(row.financeiro_id || '');
      if (recordId && !latestLogByRecordId.has(recordId)) {
        latestLogByRecordId.set(recordId, row);
      }
    }

    for (const itemResult of batchItems) {
      const jobItem = executableItems.find((row) => row.record_id === itemResult.record_id);
      if (!jobItem) continue;
      const latestLog = latestLogByRecordId.get(itemResult.record_id) || null;
      const logPayload = readPayloadObject(latestLog?.payload);
      const resolvedErrorCode = String(logPayload.last_error_code || itemResult.error_code || latestLog?.erro || '').trim();
      const resolvedRetryable = Boolean(logPayload.retryable) || isRetryableLogCode(resolvedErrorCode);
      const itemStatus =
        itemResult.status === 'enviado' || itemResult.status === 'simulado'
          ? 'success'
          : resolvedRetryable
            ? 'error'
            : itemResult.status === 'ignorado'
              ? 'ignored'
              : 'error';

      const mergedPayload = {
        ...readPayloadObject(jobItem.payload),
        envio_hash: String(latestLog?.envio_hash || readPayloadObject(jobItem.payload).envio_hash || '').trim() || null,
        last_batch_id: batchId,
        last_status: itemResult.status,
      };

      await supabaseAdmin
        .from('dispatch_job_items')
        .update({
          payload: mergedPayload,
          status: itemStatus,
          next_attempt_at: itemStatus === 'error' ? (String(logPayload.next_retry_at || '').trim() || null) : null,
          last_error_code: itemStatus === 'error'
            ? resolvedErrorCode || null
            : null,
          last_error_message: itemStatus === 'error'
            ? String(logPayload.last_error_message || itemResult.error_message || '').trim() || null
            : null,
          log_cobranca_id: String(latestLog?.id || '').trim() || jobItem.log_cobranca_id || null,
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobItem.id)
        .eq('job_id', jobId)
        .eq('company_id', companyId);
    }
  }

  const batchDurationMs = Number(batchSummary?.duration_ms || 0);
  const observedAvgMsPerItem = Number(batchSummary?.avg_ms_per_record || 0);
  const nextAverageMsPerItem = observedAvgMsPerItem > 0
    ? (
      currentAvgMsPerItem
        ? Math.round((currentAvgMsPerItem * 0.6) + (observedAvgMsPerItem * 0.4))
        : observedAvgMsPerItem
    )
    : currentAvgMsPerItem;
  const recommendedNextBatchSize = batchSummary
    ? computeNextRecommendedBatchSize(currentRecommendedBatchSize, batchDurationMs, batchStoppedReason)
    : currentRecommendedBatchSize;

  const jobMetricsUpdate: Record<string, unknown> = {
    avg_ms_per_item: nextAverageMsPerItem,
    last_batch_duration_ms: batchDurationMs || null,
    recommended_batch_size: recommendedNextBatchSize,
    updated_at: new Date().toISOString(),
  };
  if (['soft_time_budget', 'rate_limited', 'hard_timeout_guard'].includes(batchStoppedReason)) {
    jobMetricsUpdate.status = 'paused';
  }

  await supabaseAdmin
    .from('dispatch_jobs')
    .update(jobMetricsUpdate)
    .eq('id', jobId)
    .eq('company_id', companyId);

  // ETAPA 9: Circuit breaker — update provider health and check thresholds
  if (batchSummary && batchItems.length > 0) {
    const batchSuccess = Number(batchSummary.enviados ?? (batchSummary as Record<string, unknown>).sucesso ?? 0);
    const batchErrors = Number(batchSummary.erros ?? 0);
    const batchTotal = batchSuccess + batchErrors;
    const isRateLimit = String(batchStoppedReason).includes('rate_limit');
    const latencyMs = isRateLimit ? -1 : (batchSummary.avg_ms_per_record ?? 0);

    // Update health for the majority outcome
    const overallSuccess = batchSuccess >= batchErrors;
    const health = await updateProviderHealth(
      supabaseAdmin, companyId, overallSuccess, latencyMs as number,
    );

    // Circuit breaker: pause job if provider is unhealthy
    if (
      health.state === 'unhealthy' ||
      health.consecutive_failures >= CIRCUIT_BREAKER_MAX_CONSECUTIVE_FAILURES ||
      (health.is_rate_limit && batchTotal >= CIRCUIT_BREAKER_MIN_SAMPLES)
    ) {
      await supabaseAdmin.from('dispatch_jobs').update({
        status: 'paused',
        stopped_reason: 'batch_circuit_break',
        updated_at: new Date().toISOString(),
      }).eq('id', jobId).eq('company_id', companyId);

      await logDispatchAuditEvent(supabaseAdmin, companyId, jobId, 'batch_circuit_break', {
        state: health.state,
        consecutive_failures: health.consecutive_failures,
        is_rate_limit: health.is_rate_limit,
        batch_success: batchSuccess,
        batch_errors: batchErrors,
        stopped_reason: batchStoppedReason,
      });

      batchStoppedReason = 'batch_circuit_break' as typeof batchStoppedReason;
    } else if (health.state === 'degraded') {
      await logDispatchAuditEvent(supabaseAdmin, companyId, jobId, 'provider_unhealthy', {
        state: health.state,
        consecutive_failures: health.consecutive_failures,
      });
    }
  }

  const statusData = await getDispatchJobStatusData(supabaseAdmin, companyId, jobId);

  return {
    batch_id: batchId,
    requested_batch_size: requestedBatchSize,
    effective_batch_size: effectiveBatchSize,
    recommended_next_batch_size: recommendedNextBatchSize,
    stopped_reason: batchStoppedReason || (lockedItems.length ? 'completed' : 'no_items'),
    picked_items: lockedItems.length,
    processed_items: batchItems.length + duplicateIgnoredItems.length,
    summary: batchSummary,
    duplicate_success_items: duplicateIgnoredItems,
    items: [...duplicateIgnoredItems, ...batchItems],
    status: statusData,
  };
}

async function simulateChargeBatchData(
  supabaseAdmin: AdminClient,
  companyId: string,
  todayIso: string,
  limit: number,
) {
  const config = await getBillingConfigForCompany(supabaseAdmin, companyId);
  const driveConfig = await getSheetsDriveConfig(supabaseAdmin, companyId);
  const folderId = requireDriveFolderId(driveConfig?.drive_root_folder_id);
  const token = await getGoogleAccessToken();
  await getDriveFolderInfo(token, folderId).catch((error) => {
    const message = error instanceof Error ? error.message : 'Falha ao acessar a pasta do Google Drive.';
    if (/File not found|insufficientFilePermissions|notFound|403|404/i.test(message)) {
      throw new Error('A pasta nao esta acessivel. Compartilhe com a Service Account.');
    }
    throw error;
  });

  const companyName = await getCompanyName(supabaseAdmin, companyId);
  const { data: records, error } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, user_id, representante_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, observacao, status, drive_file_id, preventiva_enviada, data_envio_preventiva, cobranca_vencimento_enviada, data_envio_vencimento, ultima_cobranca, tentativas_cobranca, created_at, updated_at')
    .eq('company_id', companyId)
    .in('status', ['pendente', 'aberto', 'vencido'])
    .order('data_vencimento', { ascending: true })
    .limit(Math.min(limit, BATCH_MAX_RECORDS));
  if (error) throw new Error(error.message);

  const { batchId, items, summary } = await processBatch(
    supabaseAdmin,
    (records || []) as FinancialRow[],
    config as BillingConfigRow | null,
    token,
    folderId,
    todayIso,
    { simulate: true, force: true, companyName },
  );

  return {
    batch_id: batchId,
    simulated: summary.simulados,
    errors: summary.erros,
    items,
    summary,
    limit,
  };
}

async function getBillingHistoryData(
  supabaseAdmin: AdminClient,
  companyId: string,
  filters: Record<string, unknown>,
  page: number,
  pageSize: number,
  todayIso: string,
) {
  const dateFrom = String(filters?.date_from || '').trim();
  const dateTo = String(filters?.date_to || '').trim();
  const cliente = String(filters?.cliente || '').trim();
  const numeroBoleto = String(filters?.numero_boleto || '').trim();
  const tipoCobranca = String(filters?.tipo_cobranca || '').trim();
  const statusEnvio = String(filters?.status_envio || '').trim();
  const arquivoEncontrado = resolveHistoryFilterBoolean(filters?.arquivo_encontrado);
  const fromIso = dateFrom ? `${dateFrom}T00:00:00-03:00` : '';
  const toIso = dateTo ? `${dateTo}T23:59:59-03:00` : '';
  const rangeFrom = Math.max(0, (page - 1) * pageSize);
  const rangeTo = rangeFrom + pageSize - 1;

  let cardsQuery = supabaseAdmin
    .from('logs_cobranca')
    .select('id, financeiro_id, company_id, data_hora, cliente_nome, telefone, documento, numero_boleto, numero_nf, valor, vencimento, tipo_cobranca, dias_atraso, arquivo_encontrado, drive_file_id, status_envio, erro, payload, created_at')
    .eq('company_id', companyId);

  if (fromIso) cardsQuery = cardsQuery.gte('data_hora', fromIso);
  if (toIso) cardsQuery = cardsQuery.lte('data_hora', toIso);
  if (cliente) cardsQuery = cardsQuery.ilike('cliente_nome', `%${cliente}%`);
  if (numeroBoleto) cardsQuery = cardsQuery.ilike('numero_boleto', `%${numeroBoleto}%`);
  if (tipoCobranca) cardsQuery = cardsQuery.eq('tipo_cobranca', tipoCobranca);
  if (statusEnvio) cardsQuery = cardsQuery.eq('status_envio', statusEnvio);
  if (arquivoEncontrado !== null) cardsQuery = cardsQuery.eq('arquivo_encontrado', arquivoEncontrado);

  const { data: cardsData, error: cardsError } = await cardsQuery
    .order('data_hora', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false });

  if (cardsError) throw new Error(cardsError.message);

  let itemsQuery = supabaseAdmin
    .from('logs_cobranca')
    .select('id, financeiro_id, company_id, data_hora, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, vencimento, tipo_cobranca, dias_atraso, arquivo_encontrado, drive_file_id, status_envio, erro, payload, created_at', { count: 'exact' })
    .eq('company_id', companyId);

  if (fromIso) itemsQuery = itemsQuery.gte('data_hora', fromIso);
  if (toIso) itemsQuery = itemsQuery.lte('data_hora', toIso);
  if (cliente) itemsQuery = itemsQuery.ilike('cliente_nome', `%${cliente}%`);
  if (numeroBoleto) itemsQuery = itemsQuery.ilike('numero_boleto', `%${numeroBoleto}%`);
  if (tipoCobranca) itemsQuery = itemsQuery.eq('tipo_cobranca', tipoCobranca);
  if (statusEnvio) itemsQuery = itemsQuery.eq('status_envio', statusEnvio);
  if (arquivoEncontrado !== null) itemsQuery = itemsQuery.eq('arquivo_encontrado', arquivoEncontrado);

  const { data: itemsData, error: itemsError, count } = await itemsQuery
    .order('data_hora', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .range(rangeFrom, rangeTo);

  if (itemsError) throw new Error(itemsError.message);

  const items = (itemsData || []).map((row) => ({
    id: row.id,
    financeiro_id: row.financeiro_id || null,
    company_id: row.company_id,
    data_hora: row.data_hora || row.created_at || null,
    cliente_nome: row.cliente_nome || 'Cliente',
    cliente_numero: row.cliente_numero || null,
    telefone: row.telefone || null,
    documento: row.documento || null,
    numero_boleto: row.documento || row.numero_nf || row.numero_boleto || null,
    numero_nf: row.numero_nf || null,
    valor: Number(row.valor || 0),
    vencimento: row.vencimento || null,
    tipo_cobranca: row.tipo_cobranca || 'atraso',
    dias_atraso: Number(row.dias_atraso || 0),
    arquivo_encontrado: Boolean(row.arquivo_encontrado),
    drive_file_id: row.drive_file_id || null,
    status_envio: row.status_envio || 'pendente',
    erro: row.erro || '',
    payload: row.payload || null,
  }));

  return {
    cards: buildHistoryCards(cardsData || [], todayIso),
    items,
    pagination: {
      page,
      page_size: pageSize,
      total: Number(count || 0),
    },
  };
}

async function assertCompanyAccess(
  admin: AdminClient,
  authClient: AdminClient,
  companyId: string | null,
  authHeader: string | null,
  cronSecret: string | null,
) {
  const expectedCronSecret = Deno.env.get('BILLING_CRON_SECRET') || '';
  if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
    return { userId: null, bypass: true };
  }

  if (!authHeader) {
    throw new Error('Nao autorizado.');
  }

  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData?.user) {
    throw new Error('Usuario nao autenticado.');
  }

  if (!companyId) {
    throw new Error('company_id e obrigatorio.');
  }

  const { data: adminRow } = await admin
    .from('system_admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (!adminRow?.user_id) {
    const { data: membership } = await admin
      .from('usuarios_empresas')
      .select('company_id')
      .eq('user_id', userData.user.id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!membership?.company_id) {
      throw new Error('Sem permissao para esta empresa.');
    }
  }

  return { userId: userData.user.id, bypass: false };
}

async function resolveTargetCompanies(admin: AdminClient, companyId: string | null, bypass: boolean) {
  if (companyId) return [companyId];
  if (!bypass) throw new Error('company_id e obrigatorio.');

  const { data, error } = await admin
    .from('whatsapp_cobranca_config')
    .select('empresa_id')
    .eq('ativo', true);

  if (error) throw new Error(error.message);
  return Array.from(new Set((data || []).map((row) => row.empresa_id).filter(Boolean)));
}

Deno.serve(async (req: Request) => {
  const runtime = createRequestContext(req, { module: 'billing-automation', action: 'overview' });
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Metodo nao permitido.' }, 405);

  let action = 'overview';
  let companyId: string | null = null;
  let manual = false;
  let simulate = false;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = requireEnvSecret('SERVICE_ROLE_KEY');
    const authHeader = req.headers.get('Authorization');
    const cronSecret = req.headers.get('x-cron-secret');

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    });

    const body = await req.json().catch(() => ({}));
    action = String(body?.action || 'overview');
    runtime.action = action;
    companyId = body?.company_id
      ? String(body.company_id)
      : (body?.companyId ? String(body.companyId) : null);
    manual = body?.manual === true;
    simulate = body?.simulate === true;
    console.log('billing-automation request', { action, company_id: companyId });
    logRuntime(runtime, {
      companyId,
      metadata: {
        manual,
        simulate,
      },
    });

    if (action === 'get_drive_config' || action === 'save_drive_config' || action === 'test_drive_connection' || action === 'test_drive_health' || action === 'sync_drive' || action === 'sync_boleto_drive_intelligent' || action === 'reprocess_boleto_drive_single' || action === 'test_boleto_lookup' || action === 'get_drive_folder_structure' || action === 'scan_folder_recursive') {
      requireCompanyId(companyId);
      requireEnvSecret('GOOGLE_CLIENT_EMAIL');
      requireEnvSecret('GOOGLE_PRIVATE_KEY');
    }

    if (action === 'get_billing_config' || action === 'save_billing_config' || action === 'get_billing_rules' || action === 'save_billing_rules' || action === 'get_billing_center' || action === 'get_billing_history' || action === 'get_billing_inconsistencies' || action === 'get_real_send_checklist' || action === 'simulate_charge_batch' || action === 'simulate_charge_item' || action === 'update_charge_status' || action === 'update_financial_phone' || action === 'preview_template' || action === 'get_plan_capabilities' || action === 'get_usage_summary' || action === 'check_send_permission' || action === 'get_boleto_sync_report' || action === 'preview_charge_payload' || action === 'prepare_manual_charge' || action === 'send_real' || action === 'send_single_charge' || action === 'validate_company_integration' || action === 'validate_connection' || action === 'get_qr_code' || action === 'get_connection_status' || action === 'test_zapi_health' || action === 'test_drive_health' || action === 'create_dispatch_job' || action === 'run_dispatch_job_batch' || action === 'get_dispatch_job_status' || action === 'cancel_dispatch_job' || action === 'get_tenant_limits' || action === 'update_tenant_limits' || action === 'pause_tenant_dispatch' || action === 'resume_tenant_dispatch' || action === 'get_tenant_quota_usage') {
      requireCompanyId(companyId);
    }
    // Scheduler actions do NOT require company_id — they work across all companies
    // and are protected by cron secret only

    const auth = await assertCompanyAccess(admin, authClient, companyId, authHeader, cronSecret);
    const todayIso = todayInSaoPaulo();
    const needsGoogleToken = [
      'get_drive_config',
      'save_drive_config',
      'test_drive_connection',
      'test_drive_health',
      'sync_drive',
      'sync_sheet',
      'test_boleto_lookup',
      'get_drive_folder_structure',
      'scan_folder_recursive',
      'sync_boleto_drive_intelligent',
      'reprocess_boleto_drive_single',
      'run',
      'run_now',
      'reprocess_failures',
      'simulate_charge_item',
      'run_dispatch_job_batch',
      'run_scheduler_tick',
    ].includes(action);
    const googleToken = needsGoogleToken ? await getGoogleAccessToken() : '';

    if (action === 'overview') {
      const overview = await getOverview(admin, companyId || '', todayIso);
      const sync = await getSheetsDriveConfig(admin, companyId || '');

      return jsonResponse({
        ok: true,
        company_id: companyId,
        ...overview,
        sync,
      });
    }

    if (action === 'get_drive_config') {
      requireCompanyId(companyId);
      const config = await getSheetsDriveConfig(admin, companyId || '');
      const connection = await testDriveConnectionForCompany(admin, companyId || '', googleToken);
      return jsonResponse({
        ok: true,
        company_id: companyId,
        drive_root_folder_id: config?.drive_root_folder_id || null,
        // Return ALL drive config fields so the UI can reflect saved state correctly
        drive_recursive_scan: config?.drive_recursive_scan ?? false,
        drive_max_depth: config?.drive_max_depth ?? 2,
        drive_matching_strategy: config?.drive_matching_strategy || 'auto',
        drive_folder_name: config?.drive_folder_name || '',
        service_account_email: Deno.env.get('GOOGLE_CLIENT_EMAIL') || '',
        folder_name: connection.folder_name,
        status: connection.status,
        quantidade_arquivos_pdf: connection.quantidade_arquivos_pdf,
        mensagem_erro: connection.mensagem_erro,
      });
    }

    if (action === 'get_billing_config' || action === 'get_billing_rules') {
      requireCompanyId(companyId);
      const config = await getBillingConfigForCompany(admin, companyId || '');
      return jsonResponse({
        ok: true,
        company_id: companyId,
        config: {
          ativo: Boolean(config?.ativo),
          hora_execucao: config?.hora_execucao || config?.hora_envio || DEFAULT_EXECUTION_TIME,
          hora_envio: config?.hora_envio || config?.hora_execucao || DEFAULT_EXECUTION_TIME,
          mensagem_template: config?.mensagem_template || DEFAULT_UNIVERSAL_TEMPLATE,
          template_preventiva: config?.template_preventiva || DEFAULT_UNIVERSAL_TEMPLATE,
          template_vencimento: config?.template_vencimento || DEFAULT_UNIVERSAL_TEMPLATE,
          template_atraso: config?.template_atraso || DEFAULT_UNIVERSAL_TEMPLATE,
          regua_atraso: Array.isArray(config?.regua_atraso) ? config?.regua_atraso : DEFAULT_RULES,
          intervalo_dias: Number(config?.intervalo_dias || 5),
          cobrar_apos_dias_vencido: Number(config?.cobrar_apos_dias_vencido || 1),
          limite_cobrancas_por_titulo: Number(config?.limite_cobrancas_por_titulo || DEFAULT_LIMIT_PER_TITLE),
          preventiva_dias_antes: Number(config?.preventiva_dias_antes || DEFAULT_PREVENTIVA_DAYS),
          enviar_no_vencimento: Boolean(config?.enviar_no_vencimento ?? DEFAULT_SEND_ON_DUE_DATE),
          permitir_envio_sem_boleto: Boolean(config?.permitir_envio_sem_boleto ?? DEFAULT_ALLOW_WITHOUT_BOLETO),
        },
      });
    }

    if (action === 'save_billing_config' || action === 'save_billing_rules') {
      requireCompanyId(companyId);
      const savedConfig = await saveBillingConfigForCompany(admin, companyId || '', body?.config || {});

      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: auth.userId,
        action: 'billing_config_saved',
        entity: 'whatsapp_cobranca_config',
        metadata: {
          ativo: Boolean(savedConfig?.ativo),
          hora_execucao: savedConfig?.hora_execucao || savedConfig?.hora_envio || DEFAULT_EXECUTION_TIME,
        },
      }).then(() => {}).catch(() => {});

      return jsonResponse({
        ok: true,
        company_id: companyId,
        message: 'Configuração da régua salva com sucesso.',
        config: {
          ativo: Boolean(savedConfig?.ativo),
          hora_execucao: savedConfig?.hora_execucao || savedConfig?.hora_envio || DEFAULT_EXECUTION_TIME,
          hora_envio: savedConfig?.hora_envio || savedConfig?.hora_execucao || DEFAULT_EXECUTION_TIME,
          mensagem_template: savedConfig?.mensagem_template || DEFAULT_UNIVERSAL_TEMPLATE,
          template_preventiva: savedConfig?.template_preventiva || DEFAULT_UNIVERSAL_TEMPLATE,
          template_vencimento: savedConfig?.template_vencimento || DEFAULT_UNIVERSAL_TEMPLATE,
          template_atraso: savedConfig?.template_atraso || DEFAULT_UNIVERSAL_TEMPLATE,
          regua_atraso: Array.isArray(savedConfig?.regua_atraso) ? savedConfig?.regua_atraso : DEFAULT_RULES,
          intervalo_dias: Number(savedConfig?.intervalo_dias || 5),
          cobrar_apos_dias_vencido: Number(savedConfig?.cobrar_apos_dias_vencido || 1),
          limite_cobrancas_por_titulo: Number(savedConfig?.limite_cobrancas_por_titulo || DEFAULT_LIMIT_PER_TITLE),
          preventiva_dias_antes: Number(savedConfig?.preventiva_dias_antes || DEFAULT_PREVENTIVA_DAYS),
          enviar_no_vencimento: Boolean(savedConfig?.enviar_no_vencimento ?? DEFAULT_SEND_ON_DUE_DATE),
          permitir_envio_sem_boleto: Boolean(savedConfig?.permitir_envio_sem_boleto ?? DEFAULT_ALLOW_WITHOUT_BOLETO),
        },
      });
    }

    if (action === 'save_drive_config') {
      requireCompanyId(companyId);
      const driveRootFolderIdRaw = String(body?.drive_root_folder_id || '').trim();
      const driveRootFolderId = extractFolderIdFromUrl(driveRootFolderIdRaw);
      const savedConfig = await saveDriveConfigForCompany(admin, companyId || '', driveRootFolderId, {
        drive_recursive_scan: body?.drive_recursive_scan === true,
        drive_matching_strategy: String(body?.drive_matching_strategy || 'auto'),
        drive_max_depth: Number(body?.drive_max_depth || 2),
      });
      const connection = await testDriveConnectionForCompany(admin, companyId || '', googleToken);
      // Cache folder name from connection test
      if (connection.folder_name) {
        await admin.from('google_sheets_config')
          .update({ drive_folder_name: connection.folder_name,
                    drive_last_test_at: new Date().toISOString(),
                    drive_last_test_status: connection.status,
                    drive_last_test_pdf_count: connection.quantidade_arquivos_pdf })
          .eq('empresa_id', companyId).then(() => {}).catch(() => {});
      }

      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: auth.userId,
        action: 'billing_drive_config_saved',
        entity: 'google_sheets_config',
        metadata: {
          drive_root_folder_id: savedConfig?.drive_root_folder_id || null,
          status: connection.status,
        },
      }).then(() => {}).catch(() => {});

      return jsonResponse({
        ok: true,
        message: 'Pasta do Google Drive salva com sucesso.',
        company_id: companyId,
        drive_root_folder_id: savedConfig?.drive_root_folder_id || null,
        service_account_email: Deno.env.get('GOOGLE_CLIENT_EMAIL') || '',
        folder_name: connection.folder_name,
        status: connection.status,
        quantidade_arquivos_pdf: connection.quantidade_arquivos_pdf,
        mensagem_erro: connection.mensagem_erro,
      });
    }

    if (action === 'test_drive_connection') {
      requireCompanyId(companyId);
      const existingConfig = await getSheetsDriveConfig(admin, companyId || '');
      requireDriveFolderId(existingConfig?.drive_root_folder_id);
      const result = await testDriveConnectionForCompany(admin, companyId || '', googleToken);
      return jsonResponse({
        ok: true,
        company_id: companyId,
        ...result,
      });
    }

    if (action === 'sync_sheet') {
      const result = await syncSheetForCompany(admin, companyId || '', googleToken);
      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: auth.userId,
        action: 'billing_sheet_sync',
        entity: 'google_sheets_config',
        metadata: result,
      }).then(() => {}).catch(() => {});
      return jsonResponse({ ok: true, message: 'Planilha sincronizada com sucesso.', result });
    }

    if (action === 'sync_drive') {
      const result = await syncDriveForCompany(admin, companyId || '', googleToken);
      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: auth.userId,
        action: 'billing_drive_sync',
        entity: 'registros_financeiros',
        metadata: result,
      }).then(() => {}).catch(() => {});
      return jsonResponse({ ok: true, message: 'Drive sincronizado com sucesso.', result });
    }

    if (action === 'sync_boleto_drive_intelligent') {
      try {
        const limit = Math.min(200, Math.max(1, Number(body?.limit || 50) || 50));
        const result = await syncBoletoDriveIntelligentForCompany(admin, companyId || '', googleToken, limit);
        await admin.from('audit_logs').insert({
          company_id: companyId,
          user_id: auth.userId,
          action: 'billing_boleto_drive_intelligent_sync',
          entity: 'registros_financeiros',
          metadata: result.summary,
        }).then(() => {}).catch(() => {});

        return jsonResponse({
          ok: true,
          success: true,
          action: 'sync_boleto_drive_intelligent',
          summary: result.summary,
          items: result.items,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'sync_boleto_drive_intelligent',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'reprocess_boleto_drive_single') {
      try {
        const registroId = String(body?.registro_id || '').trim();
        if (!registroId) {
          return jsonResponse({ ok: false, success: false, error: 'registro_id e obrigatorio.' }, 400);
        }

        const config = await getSheetsDriveConfig(admin, companyId || '');
        const folderId = requireDriveFolderId(await ensureConfiguredFolderId(config?.drive_root_folder_id, companyId || ''));

        const { data: record, error: fetchError } = await admin
          .from('registros_financeiros')
          .select('id, company_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, status, drive_file_id, linha_digitavel, codigo_barras, boleto_url, boleto_pdf_nome, boleto_match_confidence, boleto_extraido_em, boleto_status, boleto_match_strategy, boleto_erro, preventiva_enviada, data_envio_preventiva, cobranca_vencimento_enviada, data_envio_vencimento, ultima_cobranca, tentativas_cobranca')
          .eq('id', registroId)
          .eq('company_id', companyId || '')
          .maybeSingle();

        if (fetchError) throw new Error(fetchError.message);
        if (!record) {
          return jsonResponse({ ok: false, success: false, error: 'Registro nao encontrado.' }, 404);
        }

        const typedRecord = record as FinancialRow;

        // Targeted Drive search for this specific record
        const candidates = await searchDriveFiles(googleToken, folderId, typedRecord);

        let bestMatch: { pdfData: ExtractedBoletoData; score: number; status: string; reasons: string[] } | null = null;

        for (const file of candidates.slice(0, 5)) {
          try {
            const pdfData = await extractBoletoDataFromDriveFile(googleToken, file);
            const match = scoreFinancialMatch(pdfData, typedRecord);
            if (!bestMatch || match.score > bestMatch.score) {
              const matchStatus = match.score >= 80 ? 'encontrado' : match.score >= 50 ? 'baixa_confianca' : 'nao_encontrado';
              bestMatch = { pdfData, score: match.score, status: matchStatus, reasons: match.reasons };
            }
          } catch (_fileErr) {
            // Continue to next candidate
          }
        }

        if (bestMatch && bestMatch.status !== 'nao_encontrado') {
          const strategy = [bestMatch.status, bestMatch.pdfData.match_strategy, ...bestMatch.reasons].filter(Boolean).join('|');
          await upsertBoletoMatchResult(admin, companyId || '', typedRecord, bestMatch.pdfData, bestMatch.status, bestMatch.score, strategy, null);
        } else {
          // Mark as not found, clearing any stale drive_file_id
          await admin
            .from('registros_financeiros')
            .update({
              boleto_status: 'nao_encontrado',
              boleto_match_confidence: 0,
              boleto_match_strategy: 'reprocess_targeted_search',
              boleto_erro: 'Nenhum PDF com score suficiente encontrado no Drive para este registro.',
              boleto_extraido_em: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', registroId)
            .eq('company_id', companyId || '');
        }

        return jsonResponse({
          ok: true,
          success: true,
          action: 'reprocess_boleto_drive_single',
          registro_id: registroId,
          result: bestMatch
            ? { status: bestMatch.status, confidence: bestMatch.score, reasons: bestMatch.reasons }
            : { status: 'nao_encontrado', confidence: 0, reasons: [] },
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'reprocess_boleto_drive_single',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'get_boleto_sync_report') {
      try {
        const report = await getBoletoSyncReportData(admin, companyId || '');
        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_boleto_sync_report',
          cards: report.cards,
          items: report.items,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_boleto_sync_report',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'preview_charge_payload') {
      try {
        const registroId = String(body?.registro_id || '').trim();
        if (!registroId) {
          return jsonResponse({
            ok: false,
            success: false,
            action: 'preview_charge_payload',
            error: 'registro_id e obrigatorio.',
          }, 200);
        }

        const preview = await buildChargePayloadPreview(admin, companyId || '', registroId);
        return jsonResponse({
          ok: true,
          success: true,
          action: 'preview_charge_payload',
          message: preview.message,
          payload: preview.payload,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'preview_charge_payload',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'prepare_manual_charge') {
      try {
        const registroId = String(body?.registro_id || '').trim();
        if (!registroId) {
          return jsonResponse({
            ok: false,
            success: false,
            action: 'prepare_manual_charge',
            error: 'registro_id e obrigatorio.',
          }, 200);
        }

        const prepared = await prepareManualChargeData(admin, companyId || '', registroId);
        return jsonResponse({
          ok: true,
          success: true,
          action: 'prepare_manual_charge',
          message: 'Envio manual assistido preparado com sucesso.',
          payload: prepared.payload,
          warning: prepared.warning,
          manual_message: prepared.message,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'prepare_manual_charge',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'validate_company_integration' || action === 'validate_connection') {
      try {
        const zapiConfig = await resolveRequestedZapiConfig(
          admin,
          companyId || '',
          (body?.config || {}) as Record<string, unknown>,
          { allowTestMode: auth.bypass === true },
        );
        const validation = await validateZapiConnection({
          instanceId: zapiConfig.instanceId,
          token: zapiConfig.token,
          clientToken: zapiConfig.clientToken,
        });
        const connected = isZapiConnected(validation);

        return jsonResponse({
          ok: true,
          success: true,
          action,
          message: connected
            ? 'Integracao Z-API validada com sucesso.'
            : 'Credenciais validas. Gere o QR Code e conclua a conexao no WhatsApp.',
          connected,
          phone_number: extractZapiPhoneNumber(validation),
          data: validation,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action,
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'get_qr_code') {
      try {
        const zapiConfig = await resolveRequestedZapiConfig(
          admin,
          companyId || '',
          (body?.config || {}) as Record<string, unknown>,
          { allowTestMode: auth.bypass === true },
        );

        // ── Pre-check via /status (fast, never hangs) ────────────────────────
        // Z-API's /qr-code/image endpoint hangs indefinitely when the instance
        // is already connected — it waits for a new QR that never materialises.
        // Calling /status first lets us return immediately in the connected case
        // without ever touching /qr-code/image.
        let preCheckData: Record<string, unknown> | null = null;
        try {
          preCheckData = await validateZapiConnection({
            instanceId: zapiConfig.instanceId,
            token: zapiConfig.token,
            clientToken: zapiConfig.clientToken,
          });
        } catch {
          // Status check failed — proceed to QR endpoint anyway
          preCheckData = null;
        }

        // Only treat as fully connected when the instance has a paired phone number.
        // isZapiConnected() alone can return true for API-valid-but-not-paired
        // instances (credentials OK but QR never scanned). Without a phone number
        // the WhatsApp session is not actually paired, so we must NOT block QR generation.
        const preCheckPhone = preCheckData ? extractZapiPhoneNumber(preCheckData) : '';
        if (preCheckData && isZapiConnected(preCheckData) && preCheckPhone) {
          console.log('[ZAPI QR PRE-CHECK] already connected — skipping /qr-code/image');
          return jsonResponse({
            ok: true,
            success: true,
            action: 'get_qr_code',
            connected: true,
            status: 'connected',
            message: 'WhatsApp ja conectado',
            phone_number: preCheckPhone,
            qrCode: null,
            image_data_url: null,
            data: preCheckData,
          }, 200);
        }

        // ── Instance is disconnected — safe to call /qr-code/image ───────────
        const qrCode = await getZapiQrCodeData({
          instanceId: zapiConfig.instanceId,
          token: zapiConfig.token,
          clientToken: zapiConfig.clientToken,
        });

        // When Z-API says "connected" at the QR endpoint it does not always
        // echo the phone number back.  Try to get it from (a) the QR raw
        // response, then (b) the pre-check /status data we already have.
        const qrPhone = qrCode.connected === true
          ? (extractZapiPhoneNumber(qrCode.raw as Record<string, unknown>) ||
             extractZapiPhoneNumber(preCheckData) ||
             '')
          : null;

        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_qr_code',
          connected: qrCode.connected === true,
          status: qrCode.connected === true ? 'connected' : 'awaiting_qr',
          message: qrCode.connected === true ? 'WhatsApp ja conectado' : 'QR Code carregado com sucesso.',
          qrCode: qrCode.connected === true ? null : qrCode.imageDataUrl,
          image_data_url: qrCode.connected === true ? null : qrCode.imageDataUrl,
          phone_number: qrPhone,
          data: qrCode.raw,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_qr_code',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'get_connection_status') {
      try {
        const zapiConfig = await resolveRequestedZapiConfig(
          admin,
          companyId || '',
          (body?.config || {}) as Record<string, unknown>,
          { allowTestMode: auth.bypass === true },
        );
        const validation = await validateZapiConnection({
          instanceId: zapiConfig.instanceId,
          token: zapiConfig.token,
          clientToken: zapiConfig.clientToken,
        });
        const connected = isZapiConnected(validation);

        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_connection_status',
          connected,
          phone_number: extractZapiPhoneNumber(validation),
          status_label: connected ? 'Conectado' : 'Aguardando leitura do QR Code',
          data: validation,
          message: connected
            ? 'WhatsApp conectado com sucesso.'
            : 'Instancia aguardando leitura do QR Code.',
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_connection_status',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'send_real') {
      try {
        const items = Array.isArray(body?.items) ? body.items : [];
        if (!items.length) {
          return jsonResponse({
            ok: false,
            success: false,
            action: 'send_real',
            error: 'items e obrigatorio para envio real.',
          }, 200);
        }

        const result = await sendRealChargesData(
          admin,
          companyId || '',
          auth.userId,
          items as Array<Record<string, unknown>>,
          { allowTestMode: auth.bypass === true }
        );
        return jsonResponse({
          ok: true,
          success: true,
          action: 'send_real',
          sent: result.sent,
          failed: result.failed,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'send_real',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'send_single_charge') {
      try {
        const registroId = String(body?.registro_id || body?.charge_id || '').trim();
        const simulate = body?.simulate === true;
        const customMessage = String(body?.custom_message || body?.message || '').trim();
        const forceResend = body?.force_resend === true;

        if (!registroId) {
          return jsonResponse({
            ok: false,
            success: false,
            action: 'send_single_charge',
            error: 'registro_id e obrigatorio para envio individual.',
          }, 200);
        }

        const result = await sendSingleChargeData(
          admin,
          companyId || '',
          auth.userId,
          registroId,
          simulate,
          customMessage,
          forceResend,
          { allowTestMode: auth.bypass === true },
        );

        if (result.duplicate) {
          return jsonResponse({
            ok: false,
            success: false,
            action: 'send_single_charge',
            duplicate: true,
            simulated: result.simulated,
            zapiResponse: null,
            message: result.message,
            payload: result.payload,
          }, 200);
        }

        return jsonResponse({
          ok: true,
          success: true,
          action: 'send_single_charge',
          simulated: result.simulated,
          zapiResponse: result.zapiResponse,
          message: result.message,
          payload: result.payload,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'send_single_charge',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'create_dispatch_job') {
      try {
        const created = await createDispatchJobData(admin, companyId || '', auth.userId, body || {});
        return jsonResponse({
          ok: true,
          success: true,
          action: 'create_dispatch_job',
          company_id: companyId,
          job_id: created.job.id,
          created_items: created.created_items,
          ignored_invalid_records: created.ignored_invalid_records,
          job: created.job,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'create_dispatch_job',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'run_dispatch_job_batch') {
      try {
        const jobId = String(body?.job_id || body?.id || '').trim();
        if (!jobId) {
          return jsonResponse({ ok: false, success: false, action: 'run_dispatch_job_batch', error: 'job_id e obrigatorio.' }, 200);
        }
        const companyName = await getCompanyName(admin, companyId || '');
        const runResult = await runDispatchJobBatchData(
          admin,
          companyId || '',
          jobId,
          googleToken,
          todayIso,
          companyName,
          body || {},
        );
        return jsonResponse({
          ok: true,
          success: true,
          action: 'run_dispatch_job_batch',
          company_id: companyId,
          job_id: jobId,
          ...runResult,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'run_dispatch_job_batch',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'get_dispatch_job_status') {
      try {
        const jobId = String(body?.job_id || body?.id || '').trim();
        if (!jobId) {
          return jsonResponse({ ok: false, success: false, action: 'get_dispatch_job_status', error: 'job_id e obrigatorio.' }, 200);
        }
        const statusData = await getDispatchJobStatusData(admin, companyId || '', jobId);
        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_dispatch_job_status',
          company_id: companyId,
          job_id: jobId,
          ...statusData,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_dispatch_job_status',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'cancel_dispatch_job') {
      try {
        const jobId = String(body?.job_id || body?.id || '').trim();
        if (!jobId) {
          return jsonResponse({ ok: false, success: false, action: 'cancel_dispatch_job', error: 'job_id e obrigatorio.' }, 200);
        }
        const cancelled = await cancelDispatchJobData(admin, companyId || '', jobId);
        return jsonResponse({
          ok: true,
          success: true,
          action: 'cancel_dispatch_job',
          company_id: companyId,
          job_id: jobId,
          ...cancelled,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'cancel_dispatch_job',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    // ── ETAPA 8: Scheduler actions ─────────────────────────────────────────────
    // These require cron-secret bypass (auth.bypass === true).
    // They operate across ALL companies without a specific company_id.

    if (action === 'run_scheduler_tick') {
      if (!auth.bypass) {
        return jsonResponse({ ok: false, success: false, action: 'run_scheduler_tick', error: 'Acesso negado. Somente scheduler autorizado.' }, 403);
      }
      try {
        const tickResult = await runSchedulerTick(admin, googleToken, todayIso);
        return jsonResponse({
          ok: true,
          success: true,
          action: 'run_scheduler_tick',
          scheduler_version: SCHEDULER_WORKER_VERSION,
          ...tickResult,
        }, 200);
      } catch (error) {
        console.error('[run_scheduler_tick] erro fatal', error);
        return jsonResponse({
          ok: false,
          success: false,
          action: 'run_scheduler_tick',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'get_scheduler_status') {
      try {
        // Allow authenticated users OR cron bypass to view scheduler status
        const statusData = await getSchedulerStatusData(admin);
        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_scheduler_status',
          ...statusData,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_scheduler_status',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    // ── ETAPA 9: Tenant limits / quota actions ─────────────────────────────────

    if (action === 'get_tenant_limits') {
      try {
        const [limits, usage] = await Promise.all([
          getCompanyLimits(admin, companyId || ''),
          getTenantQuotaUsage(admin, companyId || '', todayIso),
        ]);
        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_tenant_limits',
          company_id: companyId,
          limits,
          usage,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_tenant_limits',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'get_tenant_quota_usage') {
      try {
        const usage = await getTenantQuotaUsage(admin, companyId || '', todayIso);
        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_tenant_quota_usage',
          company_id: companyId,
          usage,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_tenant_quota_usage',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'update_tenant_limits') {
      // Admin-only: requires system_admins membership (checked via RLS + auth)
      try {
        const allowedFields = [
          'max_active_jobs',
          'max_batch_size',
          'max_daily_messages',
          'max_concurrent_batches',
          'max_retries_per_hour',
        ];
        const updates: Record<string, unknown> = {};
        for (const field of allowedFields) {
          if (body?.[field] !== undefined) {
            const val = Number(body[field]);
            if (!isNaN(val) && val > 0) updates[field] = val;
          }
        }
        if (!Object.keys(updates).length) {
          return jsonResponse({
            ok: false,
            success: false,
            action: 'update_tenant_limits',
            error: 'Nenhum campo valido para atualizar.',
          }, 200);
        }
        updates.updated_at = new Date().toISOString();

        // Ensure limits row exists first
        const limits = await getCompanyLimits(admin, companyId || '');
        const { error: updateError } = await admin
          .from('dispatch_company_limits')
          .update(updates)
          .eq('id', limits.id);

        if (updateError) throw new Error(updateError.message);

        const updated = await getCompanyLimits(admin, companyId || '');
        return jsonResponse({
          ok: true,
          success: true,
          action: 'update_tenant_limits',
          company_id: companyId,
          limits: updated,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'update_tenant_limits',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'pause_tenant_dispatch') {
      try {
        const reason = String(body?.reason || 'Suspenso manualmente.').trim();
        const nowIso = new Date().toISOString();
        const limits = await getCompanyLimits(admin, companyId || '');
        const { error: updateError } = await admin
          .from('dispatch_company_limits')
          .update({ enabled: false, pause_reason: reason, paused_at: nowIso, updated_at: nowIso })
          .eq('id', limits.id);
        if (updateError) throw new Error(updateError.message);

        // Pause any running jobs for this company
        await admin.from('dispatch_jobs').update({
          status: 'paused',
          stopped_reason: 'tenant_disabled',
          updated_at: nowIso,
        }).eq('company_id', companyId || '').eq('status', 'running');

        await logDispatchAuditEvent(admin, companyId || null, null, 'tenant_paused', {
          reason,
          paused_at: nowIso,
          paused_by: auth.userId,
        });

        return jsonResponse({
          ok: true,
          success: true,
          action: 'pause_tenant_dispatch',
          company_id: companyId,
          reason,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'pause_tenant_dispatch',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'resume_tenant_dispatch') {
      try {
        const nowIso = new Date().toISOString();
        const limits = await getCompanyLimits(admin, companyId || '');
        const { error: updateError } = await admin
          .from('dispatch_company_limits')
          .update({ enabled: true, pause_reason: null, paused_at: null, updated_at: nowIso })
          .eq('id', limits.id);
        if (updateError) throw new Error(updateError.message);

        await logDispatchAuditEvent(admin, companyId || null, null, 'tenant_resumed', {
          resumed_at: nowIso,
          resumed_by: auth.userId,
        });

        return jsonResponse({
          ok: true,
          success: true,
          action: 'resume_tenant_dispatch',
          company_id: companyId,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'resume_tenant_dispatch',
          error: String(error instanceof Error ? error.message : error),
        }, 200);
      }
    }

    if (action === 'get_billing_center') {
      console.log('get_billing_center iniciou action');
      try {
        console.log('get_billing_center body validado', { company_id: companyId });
        console.log('get_billing_center antes do select registros_financeiros');
        const center = await getBillingCenterData(admin, companyId || '', todayIso);
        console.log('get_billing_center depois do select registros_financeiros', { total_items: Array.isArray(center?.items) ? center.items.length : 0 });
        console.log('get_billing_center antes do select logs_cobranca');
        console.log('get_billing_center depois do select logs_cobranca', { total_logs_relacionados: Array.isArray(center?.items) ? center.items.filter((item) => item.ultima_cobranca).length : 0 });
        console.log('get_billing_center antes de montar cards');
        const response = {
          ok: true,
          success: true,
          cards: center?.cards || {
            vencendo_amanha: 0,
            vencem_hoje: 0,
            em_atraso: 0,
            sem_boleto_encontrado: 0,
            sem_telefone_valido: 0,
            simulacoes_realizadas_hoje: 0,
            erros: 0,
            total_em_aberto: 0,
          },
          items: Array.isArray(center?.items) ? center.items : [],
        };
        console.log('get_billing_center antes do return final', { total_items: response.items.length });
        return jsonResponse(response, 200);
      } catch (error) {
        console.error('get_billing_center error', error);
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_billing_center',
          error: String(error?.message || error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'get_billing_history') {
      try {
        const filters = body?.filters && typeof body.filters === 'object' ? body.filters : {};
        const page = Math.max(1, Number(body?.page || 1) || 1);
        const pageSize = Math.min(200, Math.max(1, Number(body?.page_size || 50) || 50));
        const history = await getBillingHistoryData(admin, companyId || '', filters as Record<string, unknown>, page, pageSize, todayIso);

        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_billing_history',
          cards: history.cards,
          items: history.items,
          pagination: history.pagination,
        }, 200);
      } catch (error) {
        console.error('get_billing_history error', error);
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_billing_history',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'get_billing_inconsistencies') {
      try {
        const filters = body?.filters && typeof body.filters === 'object' ? body.filters : {};
        const inconsistencies = await getBillingInconsistenciesData(admin, companyId || '', filters as Record<string, unknown>);

        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_billing_inconsistencies',
          cards: inconsistencies.cards,
          items: inconsistencies.items,
        }, 200);
      } catch (error) {
        console.error('get_billing_inconsistencies error', error);
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_billing_inconsistencies',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'get_real_send_checklist') {
      try {
        const checklist = await getRealSendChecklistData(admin, companyId || '', todayIso);
        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_real_send_checklist',
          status_geral: checklist.status_geral,
          cards: checklist.cards,
          checklist: checklist.checklist,
          recommendations: checklist.recommendations,
          sample_charge: checklist.sample_charge,
        }, 200);
      } catch (error) {
        console.error('get_real_send_checklist error', error);
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_real_send_checklist',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'get_plan_capabilities') {
      try {
        const planData = await getPlanCapabilitiesData(admin, companyId || '', todayIso);
        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_plan_capabilities',
          company_id: companyId,
          ...planData,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_plan_capabilities',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'get_usage_summary') {
      try {
        const usage = await getUsageSummaryData(admin, companyId || '', todayIso);
        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_usage_summary',
          company_id: companyId,
          ...usage,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_usage_summary',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'check_send_permission') {
      try {
        const sendType = String(body?.send_type || 'manual');
        const quantity = Number(body?.quantity || 1) || 1;
        const permission = await checkSendPermissionData(admin, companyId || '', sendType, quantity, todayIso);
        return jsonResponse({
          success: true,
          action: 'check_send_permission',
          company_id: companyId,
          ...permission,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'check_send_permission',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'simulate_charge_batch') {
      try {
        const limit = Math.min(BATCH_MAX_RECORDS, Math.max(1, Number(body?.limit || 10) || 10));
        const result = await simulateChargeBatchData(admin, companyId || '', todayIso, limit);
        await admin.from('audit_logs').insert({
          company_id: companyId,
          user_id: auth.userId,
          action: 'billing_simulate_batch',
          entity: 'logs_cobranca',
          metadata: { batch_id: result.batch_id, ...result.summary },
        }).then(() => {}).catch(() => {});

        return jsonResponse({
          ok: true,
          success: true,
          action: 'simulate_charge_batch',
          batch_id: result.batch_id,
          simulated: result.simulated,
          errors: result.errors,
          items: result.items,
          summary: result.summary,
          limit: result.limit,
        }, 200);
      } catch (error) {
        console.error('simulate_charge_batch error', error);
        return jsonResponse({
          ok: false,
          success: false,
          action: 'simulate_charge_batch',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        }, 200);
      }
    }

    if (action === 'preview_template') {
      const companyName = await getCompanyName(admin, companyId || '');
      const sample = {
        ...DEFAULT_TEMPLATE_SAMPLE,
        ...body?.sample,
        empresa: body?.sample?.empresa || companyName || DEFAULT_TEMPLATE_SAMPLE.empresa,
      };
      const message = fillTemplate(String(body?.template || DEFAULT_UNIVERSAL_TEMPLATE), sample, Number(sample.dias_atraso || 0), String(sample.empresa || companyName || ''));
      return jsonResponse({
        ok: true,
        company_id: companyId,
        message,
        sample,
      });
    }

    if (action === 'update_charge_status') {
      const registroId = String(body?.registro_id || '').trim();
      const nextStatus = normalizeChargeStatus(body?.status);
      if (!registroId) {
        return jsonResponse({ ok: false, error: 'registro_id e obrigatorio.' }, 400);
      }

      const allowedStatuses = new Set(['pago', 'negociado', 'suspenso', 'pendente']);
      if (!allowedStatuses.has(nextStatus)) {
        return jsonResponse({ ok: false, error: 'status invalido para cobranca.' }, 400);
      }

      const dbStatusMap: Record<string, string> = {
        pago: 'liquidado',
        negociado: 'negociacao',
        suspenso: 'suspenso',
        pendente: 'pendente',
      };

      const { error: updateError } = await admin
        .from('registros_financeiros')
        .update({ status: dbStatusMap[nextStatus] || 'pendente', updated_at: new Date().toISOString() })
        .eq('id', registroId)
        .eq('company_id', companyId || '');

      if (updateError) throw new Error(updateError.message);

      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: auth.userId,
        action: 'billing_charge_status_updated',
        entity: 'registros_financeiros',
        entity_id: registroId,
        metadata: { status: nextStatus },
      }).then(() => {}).catch(() => {});

      return jsonResponse({
        ok: true,
        success: true,
        company_id: companyId,
        registro_id: registroId,
        status: nextStatus,
        message: 'Status do titulo atualizado com sucesso.',
      });
    }

    if (action === 'update_financial_phone') {
      const registroId = String(body?.registro_id || '').trim();
      if (!registroId) {
        return jsonResponse({ ok: false, success: false, error: 'registro_id e obrigatorio.' }, 400);
      }

      const telefone = String(body?.telefone || '').replace(/\D/g, '');
      const { error: updateError } = await admin
        .from('registros_financeiros')
        .update({ telefone: telefone || null, updated_at: new Date().toISOString() })
        .eq('id', registroId)
        .eq('company_id', companyId || '');

      if (updateError) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'update_financial_phone',
          error: updateError.message,
        }, 200);
      }

      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: auth.userId,
        action: 'billing_phone_updated',
        entity: 'registros_financeiros',
        entity_id: registroId,
        metadata: { telefone: telefone || null },
      }).then(() => {}).catch(() => {});

      return jsonResponse({
        ok: true,
        success: true,
        action: 'update_financial_phone',
        company_id: companyId,
        registro_id: registroId,
        telefone: telefone || null,
        message: 'Telefone atualizado com sucesso.',
      }, 200);
    }

    if (action === 'simulate_charge_item') {
      const registroId = String(body?.registro_id || '').trim();
      if (!registroId) {
        return jsonResponse({ ok: false, error: 'registro_id e obrigatorio.' }, 400);
      }

      const companyName = await getCompanyName(admin, companyId || '');
      const config = await getBillingConfigForCompany(admin, companyId || '');
      const driveConfig = await getSheetsDriveConfig(admin, companyId || '');
      const folderId = requireDriveFolderId(driveConfig?.drive_root_folder_id);
      await getDriveFolderInfo(googleToken, folderId).catch((error) => {
        const message = error instanceof Error ? error.message : 'Falha ao acessar pasta do Google Drive.';
        if (/File not found|insufficientFilePermissions|notFound|403|404/i.test(message)) {
          throw new Error('A pasta nao esta acessivel. Compartilhe com a Service Account.');
        }
        throw error;
      });

      const { data: record, error: recordError } = await admin
        .from('registros_financeiros')
        .select('id, company_id, user_id, representante_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, observacao, status, drive_file_id, preventiva_enviada, data_envio_preventiva, cobranca_vencimento_enviada, data_envio_vencimento, ultima_cobranca, tentativas_cobranca, created_at, updated_at')
        .eq('id', registroId)
        .eq('company_id', companyId || '')
        .maybeSingle();

      if (recordError) throw new Error(recordError.message);
      if (!record) {
        return jsonResponse({ ok: false, error: 'Registro financeiro nao encontrado.' }, 404);
      }

      const eligibility = explainRecordEligibility(record as FinancialRow, config as BillingConfigRow | null, todayIso);
      const simulated = await processChargeForRecord(
        admin,
        record as FinancialRow,
        config as BillingConfigRow | null,
        googleToken,
        folderId,
        todayIso,
        true,
        true,
        companyName,
      );

      return jsonResponse({
        ok: true,
        company_id: companyId,
        registro_id: registroId,
        etapa_regua: eligibility.etapa || 'fora_da_regua',
        mensagem_gerada: simulated.message || fillTemplate(resolveTemplate(config as BillingConfigRow | null, (eligibility.etapa || 'atraso') as 'preventiva' | 'vencimento' | 'atraso'), record as FinancialRow, eligibility.dias_atraso || 0, companyName),
        arquivo_encontrado: Boolean(simulated.fileId),
        drive_file_id: simulated.fileId || null,
        file_name: simulated.fileName || null,
        status: simulated.status,
        reason: simulated.reason || null,
      });
    }

    if (action === 'send_preview') {
      const payload = body?.payload || {};
      const phone = normalizePhone(payload.phone || payload.telefone);
      if (!validatePhone(phone)) {
        return jsonResponse({ ok: false, error: 'Telefone invalido.' }, 400);
      }
      if (body?.mode === 'text') {
        return jsonResponse({ ok: true, message: 'Preview validado. Use a régua ou o envio manual com mídia no backend.' });
      }
      return jsonResponse({ ok: true, message: 'Preview de mídia validado. O envio real acontece no backend da régua.' });
    }

    if (action === 'run' || action === 'run_now' || action === 'reprocess_failures') {
      const companies = await resolveTargetCompanies(admin, companyId, auth.bypass);
      const nowTime = currentTimeInSaoPaulo();
      const normalizedRunAction = action === 'run_now' ? 'run' : action;
      const isManualRun = normalizedRunAction === 'run' && manual === true && !cronSecret;
      let sent = 0;
      let sentSimulated = 0;
      let ignored = 0;
      let errors = 0;
      let boletosEncontrados = 0;
      let mensagensGeradas = 0;
      let arquivosAnexados = 0;
      const companyResults: Array<{ company_id: string; sent: number; ignored: number; errors: number }> = [];
      const debugByCompany: Array<Record<string, unknown>> = [];
      const retryBatches: Array<Record<string, unknown>> = [];

      for (const targetCompanyId of companies) {
        const companyName = await getCompanyName(admin, targetCompanyId);
        if (normalizedRunAction === 'run') {
          await syncSheetForCompany(admin, targetCompanyId, googleToken).catch(() => null);
          await syncDriveForCompany(admin, targetCompanyId, googleToken).catch(() => null);
        }

        const { data: config } = await admin
          .from('whatsapp_cobranca_config')
          .select('empresa_id, ativo, hora_execucao, mensagem_template, template_preventiva, template_vencimento, template_atraso, regua_atraso, limite_cobrancas_por_titulo, preventiva_dias_antes, enviar_no_vencimento, permitir_envio_sem_boleto')
          .eq('empresa_id', targetCompanyId)
          .maybeSingle();

        if (!config?.ativo && normalizedRunAction === 'run') {
          companyResults.push({ company_id: targetCompanyId, sent: 0, ignored: 0, errors: 0 });
          debugByCompany.push({
            company_id: targetCompanyId,
            manual: isManualRun,
            hora_atual: nowTime,
            hora_configurada: null,
            total_registros_encontrados: 0,
            total_status_aberto: 0,
            total_com_telefone: 0,
            total_com_vencimento: 0,
            total_preventiva: 0,
            total_vencimento: 0,
            total_atraso: 0,
            primeiros_registros: [],
            motivo_execucao: 'config_inativa',
          });
          continue;
        }

        const driveConfig = await getSheetsDriveConfig(admin, targetCompanyId);
        const folderId = String(driveConfig?.drive_root_folder_id || '').trim();
        if (!folderId) {
          companyResults.push({ company_id: targetCompanyId, sent: 0, ignored: 0, errors: 1 });
          debugByCompany.push({
            company_id: targetCompanyId,
            manual: isManualRun,
            hora_atual: nowTime,
            hora_configurada: config?.hora_execucao || DEFAULT_EXECUTION_TIME,
            total_registros_encontrados: 0,
            total_status_aberto: 0,
            total_com_telefone: 0,
            total_com_vencimento: 0,
            total_preventiva: 0,
            total_vencimento: 0,
            total_atraso: 0,
            primeiros_registros: [],
            motivo_execucao: 'sem_drive_root_folder_id',
          });
          await admin.from('audit_logs').insert({
            company_id: targetCompanyId,
            user_id: auth.userId,
            action: 'billing_automation_skipped_no_drive_folder',
            entity: 'google_sheets_config',
            metadata: { company_id: targetCompanyId },
          }).then(() => {}).catch(() => {});
          errors += 1;
          continue;
        }
        try {
          await getDriveFolderInfo(googleToken, folderId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Falha ao acessar a pasta do Google Drive.';
          companyResults.push({ company_id: targetCompanyId, sent: 0, ignored: 0, errors: 1 });
          debugByCompany.push({
            company_id: targetCompanyId,
            manual: isManualRun,
            hora_atual: nowTime,
            hora_configurada: config?.hora_execucao || DEFAULT_EXECUTION_TIME,
            total_registros_encontrados: 0,
            total_status_aberto: 0,
            total_com_telefone: 0,
            total_com_vencimento: 0,
            total_preventiva: 0,
            total_vencimento: 0,
            total_atraso: 0,
            primeiros_registros: [],
            motivo_execucao: 'drive_access_error',
          });
          await admin.from('audit_logs').insert({
            company_id: targetCompanyId,
            user_id: auth.userId,
            action: 'billing_automation_skipped_drive_access_error',
            entity: 'google_sheets_config',
            metadata: {
              company_id: targetCompanyId,
              error: /File not found|insufficientFilePermissions|notFound|403|404/i.test(message)
                ? 'A pasta não está acessível. Compartilhe com a Service Account.'
                : message,
            },
          }).then(() => {}).catch(() => {});
          errors += 1;
          continue;
        }

        const scheduledTime = config?.hora_execucao || DEFAULT_EXECUTION_TIME;
        if (normalizedRunAction === 'run' && !isManualRun && nowTime.slice(0, 2) !== scheduledTime.slice(0, 2)) {
          companyResults.push({ company_id: targetCompanyId, sent: 0, ignored: 0, errors: 0 });
          debugByCompany.push({
            company_id: targetCompanyId,
            manual: isManualRun,
            hora_atual: nowTime,
            hora_configurada: scheduledTime,
            total_registros_encontrados: 0,
            total_status_aberto: 0,
            total_com_telefone: 0,
            total_com_vencimento: 0,
            total_preventiva: 0,
            total_vencimento: 0,
            total_atraso: 0,
            primeiros_registros: [],
            motivo_execucao: 'hora_fora_da_janela',
          });
          continue;
        }

        const { data: records, error } = await admin
          .from('registros_financeiros')
          .select('id, company_id, user_id, representante_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, observacao, status, drive_file_id, preventiva_enviada, data_envio_preventiva, cobranca_vencimento_enviada, data_envio_vencimento, ultima_cobranca, tentativas_cobranca, created_at, updated_at')
          .eq('company_id', targetCompanyId)
          .order('data_vencimento', { ascending: true });

        if (error) throw new Error(error.message);

        let companySent = 0;
        let companySentSimulated = 0;
        let companyIgnored = 0;
        let companyErrors = 0;
        const explainedRecords = (records || []).map((record) => {
          const eligibility = explainRecordEligibility(record as FinancialRow, config as BillingConfigRow | null, todayIso);
          return {
            id: record.id,
            cliente_nome: getClienteEfetivo(record as Partial<FinancialRow> & Record<string, unknown>) || null,
            nome: record.nome || null,
            numero_boleto: getNumeroBoletoEfetivo(record as Partial<FinancialRow> & Record<string, unknown>) || null,
            vencimento: record.data_vencimento || null,
            data_vencimento: record.data_vencimento || null,
            status: record.status || null,
            telefone: record.telefone || null,
            dias_para_vencer: eligibility.dias_para_vencer,
            dias_atraso: eligibility.dias_atraso,
            motivo_nao_elegivel: eligibility.motivo_nao_elegivel,
            etapa: eligibility.etapa,
            status_aberto: eligibility.status_aberto,
            telefone_valido: eligibility.telefone_valido,
            vencimento_parseado: eligibility.vencimento_parseado,
          };
        });

        debugByCompany.push({
          company_id: targetCompanyId,
          manual: isManualRun,
          hora_atual: nowTime,
          hora_configurada: scheduledTime,
          total_registros_encontrados: (records || []).length,
          total_status_aberto: explainedRecords.filter((row) => row.status_aberto).length,
          total_com_telefone: explainedRecords.filter((row) => row.telefone_valido).length,
          total_com_vencimento: explainedRecords.filter((row) => row.vencimento_parseado).length,
          total_preventiva: explainedRecords.filter((row) => row.etapa === 'preventiva').length,
          total_vencimento: explainedRecords.filter((row) => row.etapa === 'vencimento').length,
          total_atraso: explainedRecords.filter((row) => row.etapa === 'atraso').length,
          primeiros_registros: explainedRecords.slice(0, 10),
        });

        if (normalizedRunAction === 'reprocess_failures') {
          const retryResult = await reprocessFailuresForCompany(
            admin,
            targetCompanyId,
            config as BillingConfigRow | null,
            googleToken,
            folderId,
            todayIso,
            companyName,
          );

          companySent = Number(retryResult.success || 0);
          companyIgnored = Number(retryResult.skipped_success_exists || 0) + Number(retryResult.skipped_not_due || 0) + Number(retryResult.skipped_max_retries || 0);
          companyErrors = Number(retryResult.failed || 0);

          sent += companySent;
          ignored += companyIgnored;
          errors += companyErrors;
          retryBatches.push({ company_id: targetCompanyId, ...retryResult });
          companyResults.push({ company_id: targetCompanyId, sent: companySent, ignored: companyIgnored, errors: companyErrors });

          await admin.from('audit_logs').insert({
            company_id: targetCompanyId,
            user_id: auth.userId,
            action: 'billing_automation_reprocess',
            entity: 'logs_cobranca',
            metadata: {
              company_id: targetCompanyId,
              ...retryResult,
            },
          }).then(() => {}).catch(() => {});
        } else {
          // Cap at BATCH_MAX_RECORDS per call — if there are more, the cron will process them
          // in subsequent runs (idempotency ensures no duplicates on the same day).
          const recordsToProcess = (records || []).slice(0, BATCH_MAX_RECORDS);
          const batchResult = await processBatch(
            admin,
            recordsToProcess as FinancialRow[],
            config as BillingConfigRow | null,
            googleToken,
            folderId,
            todayIso,
            {
              simulate,
              force: false,
              companyName,
              startedAt: Date.now(),
            },
          );

          const { summary: batchSummary } = batchResult;
          companySent = batchSummary.enviados + batchSummary.simulados;
          companySentSimulated = batchSummary.simulados;
          companyIgnored = batchSummary.ignorados;
          companyErrors = batchSummary.erros;
          boletosEncontrados += batchResult.items.filter((i) => i.boleto_file_name).length;
          mensagensGeradas += batchSummary.enviados + batchSummary.simulados;
          arquivosAnexados += batchSummary.com_anexo;
          sentSimulated += batchSummary.simulados;

          sent += companySent;
          ignored += companyIgnored;
          errors += companyErrors;
          companyResults.push({ company_id: targetCompanyId, sent: companySent, ignored: companyIgnored, errors: companyErrors });

          await admin.from('audit_logs').insert({
            company_id: targetCompanyId,
            user_id: auth.userId,
            action: 'billing_automation_run',
            entity: 'logs_cobranca',
            metadata: {
              batch_id: batchResult.batchId,
              sent: companySent,
              sent_simulated: companySentSimulated,
              ignored: companyIgnored,
              errors: companyErrors,
              company_id: targetCompanyId,
              simulate,
              ...batchSummary,
            },
          }).then(() => {}).catch(() => {});
        }
      }

      const overview = companyId ? await getOverview(admin, companyId, todayIso) : null;
      const reprocessResult = normalizedRunAction === 'reprocess_failures'
        ? {
            batch_id: retryBatches[0]?.batch_id || null,
            total_candidates: retryBatches.reduce((sum, item) => sum + Number(item.total_candidates || 0), 0),
            reprocessed: retryBatches.reduce((sum, item) => sum + Number(item.reprocessed || 0), 0),
            skipped_success_exists: retryBatches.reduce((sum, item) => sum + Number(item.skipped_success_exists || 0), 0),
            skipped_not_due: retryBatches.reduce((sum, item) => sum + Number(item.skipped_not_due || 0), 0),
            skipped_max_retries: retryBatches.reduce((sum, item) => sum + Number(item.skipped_max_retries || 0), 0),
            success: retryBatches.reduce((sum, item) => sum + Number(item.success || 0), 0),
            failed: retryBatches.reduce((sum, item) => sum + Number(item.failed || 0), 0),
            items: retryBatches.flatMap((item) => Array.isArray(item.items) ? item.items : []),
          }
        : null;

      return jsonResponse({
        ok: true,
        message: normalizedRunAction === 'run' ? 'Régua executada com sucesso.' : 'Falhas reprocessadas com sucesso.',
        result: {
          sent,
          sent_simulated: sentSimulated,
          boletos_encontrados: boletosEncontrados,
          mensagens_geradas: mensagensGeradas,
          arquivos_anexados: arquivosAnexados,
          ignored,
          errors,
          companies: companyResults,
          batch_max_records: BATCH_MAX_RECORDS,
          batch_concurrency: BATCH_CONCURRENCY_DEFAULT,
          retry_batches: retryBatches,
          ...(reprocessResult || {}),
        },
        debug: companyId
          ? (debugByCompany.find((item) => item.company_id === companyId) || null)
          : debugByCompany[0] || null,
        debug_by_company: debugByCompany,
        ...(overview || {}),
      });
    }

    if (action === 'extract_folder_id') {
      const raw = String(body?.url || body?.folder_id || '').trim();
      const extracted = extractFolderIdFromUrl(raw);
      return jsonResponse({ ok: true, folder_id: extracted, original: raw });
    }

    if (action === 'get_drive_folder_structure') {
      requireCompanyId(companyId);
      const config = await getSheetsDriveConfig(admin, companyId || '');
      const folderId = requireDriveFolderId(config?.drive_root_folder_id);
      const maxDepth = Math.min(5, Math.max(1, Number(body?.max_depth ?? config?.drive_max_depth ?? 3)));
      const structure = await getDriveFolderStructure(googleToken, folderId, maxDepth);
      return jsonResponse({ ok: true, company_id: companyId, folder_id: folderId, max_depth: maxDepth, structure });
    }

    // ── Drive permission diagnostic ──────────────────────────────────────────────
    // Tests root metadata, subfolder listing, PDF listing, and BFS at each level.
    // Reveals exactly where the service account loses access (403 vs empty vs OK).
    if (action === 'diagnose_drive_access') {
      requireCompanyId(companyId);
      const config = await getSheetsDriveConfig(admin, companyId || '');
      const folderId = requireDriveFolderId(config?.drive_root_folder_id);
      const serviceAccountEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || '(não configurado)';

      const steps: Array<Record<string, unknown>> = [];

      // Step 1: Can we read the root folder metadata?
      let rootMeta: Record<string, unknown> | null = null;
      try {
        const meta = await getDriveFileMetadata(googleToken, folderId);
        rootMeta = { id: meta.id, name: meta.name, mimeType: meta.mimeType };
        steps.push({ step: '1_root_metadata', ok: true, folder_id: folderId, name: meta.name });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        steps.push({ step: '1_root_metadata', ok: false, folder_id: folderId, error: msg });
      }

      // Step 2: Can we list subfolders of root?
      let level1Folders: Array<{ id: string; name: string }> = [];
      try {
        level1Folders = await listSubfolders(googleToken, folderId);
        steps.push({ step: '2_list_subfolders_root', ok: true, count: level1Folders.length, names: level1Folders.map((f) => f.name) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        steps.push({ step: '2_list_subfolders_root', ok: false, error: msg, diagnosis: 'SERVICE_ACCOUNT_NOT_SHARED — compartilhe a pasta raiz com ' + serviceAccountEmail });
      }

      // Step 3: Can we list PDFs in root?
      try {
        const pdfs = await listPdfFilesInFolder(googleToken, folderId, 5);
        steps.push({ step: '3_list_pdfs_root', ok: true, count: pdfs.length, names: pdfs.map((f) => f.name) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        steps.push({ step: '3_list_pdfs_root', ok: false, error: msg });
      }

      // Step 4: For each level-1 subfolder, test listing (up to 5 folders)
      const level2Results: Array<Record<string, unknown>> = [];
      for (const f1 of level1Folders.slice(0, 5)) {
        const entry: Record<string, unknown> = { folder_id: f1.id, folder_name: f1.name };
        try {
          const subs = await listSubfolders(googleToken, f1.id);
          const pdfs = await listPdfFilesInFolder(googleToken, f1.id, 3);
          entry.ok = true;
          entry.subfolders = subs.length;
          entry.subfolder_names = subs.map((s) => s.name);
          entry.pdfs_direct = pdfs.length;
          entry.pdf_names = pdfs.map((p) => p.name);
        } catch (err) {
          entry.ok = false;
          entry.error = err instanceof Error ? err.message : String(err);
        }
        level2Results.push(entry);
      }
      if (level2Results.length > 0) {
        steps.push({ step: '4_level2_subfolders', results: level2Results });
      }

      // Step 5: BFS diagnostic
      const { ids: bfsIds, errors: bfsErrors } = await collectFolderIdsDetailed(googleToken, folderId, 4, 20);
      steps.push({
        step: '5_bfs_summary',
        ok: bfsErrors.length === 0,
        folders_found: bfsIds.length,
        traversal_errors: bfsErrors.length,
        error_details: bfsErrors,
        all_folder_ids: bfsIds,
      });

      // Diagnosis summary
      const hasRootAccess = steps.find((s) => s.step === '1_root_metadata')?.ok ?? false;
      const hasSubfolderAccess = steps.find((s) => s.step === '2_list_subfolders_root')?.ok ?? false;
      const hasPdfAccess = steps.find((s) => s.step === '3_list_pdfs_root')?.ok ?? false;

      let diagnosis = 'OK';
      let action_required: string | null = null;
      if (!hasRootAccess) {
        diagnosis = 'ROOT_NOT_ACCESSIBLE';
        action_required = `A conta de serviço (${serviceAccountEmail}) não tem acesso à pasta raiz ${folderId}. Compartilhe a pasta com este email no Google Drive.`;
      } else if (!hasSubfolderAccess) {
        diagnosis = 'SUBFOLDERS_NOT_ACCESSIBLE';
        action_required = `A conta de serviço tem acesso à raiz mas não consegue listar subpastas. Verifique se a pasta está em Shared Drive ou compartilhe com ${serviceAccountEmail} e marque "Compartilhar com subpastas".`;
      } else if (!hasPdfAccess) {
        diagnosis = 'PDF_LISTING_FAILED';
        action_required = 'Listagem de PDFs na raiz falhou apesar do acesso à pasta. Verifique permissões de leitura de arquivo.';
      } else if (bfsIds.length === 1 && bfsErrors.length > 0) {
        diagnosis = 'PARTIAL_ACCESS_SUBFOLDERS_BLOCKED';
        action_required = `Acesso parcial — subpastas estão bloqueadas. Erros: ${bfsErrors.map((e) => e.error).join('; ')}`;
      }

      return jsonResponse({
        ok: hasRootAccess,
        company_id: companyId,
        folder_id: folderId,
        service_account_email: serviceAccountEmail,
        oauth_scope: 'https://www.googleapis.com/auth/drive.readonly',
        diagnosis,
        action_required,
        root_info: rootMeta,
        steps,
      });
    }

    if (action === 'test_boleto_lookup') {
      requireCompanyId(companyId);
      const lookupStart = Date.now();
      try {
        const config = await getSheetsDriveConfig(admin, companyId || '');
        const folderId = requireDriveFolderId(config?.drive_root_folder_id);
        const query = String(body?.query || body?.documento || body?.numero_boleto || body?.cliente_nome || '').trim();
        if (!query) {
          return jsonResponse({ ok: false, error: 'Informe um termo de busca (documento, boleto, nome).' }, 400);
        }
        // Test lookup is ALWAYS recursive — searching only the root folder is pointless
        // when PDFs live several levels deep (e.g. CLIENTES/CLIENTE/NUMERO/boleto.pdf).
        const maxDepth = Math.min(5, Math.max(4, Number(body?.max_depth ?? config?.drive_max_depth ?? 4)));

        // ── maxFolders budget ───────────────────────────────────────────────────
        // 100 folders × 2 API calls (BFS + PDF list) × ~250 ms = ~50 s.
        // Deno hard-kills at 150 s but Supabase's gateway kills at ~60 s.
        // Keeping at 100 means we still cover 40 % more than the old cap=60,
        // while staying safely inside the gateway timeout.
        // Pass body.max_folders to override during debugging (capped 20–130).
        const bfsMaxFolders = Math.min(130, Math.max(20, Number(body?.max_folders ?? 100)));

        const { results, meta } = await testBoletoLookup(
          googleToken, folderId, query, { recursive: true, maxDepth, maxFolders: bfsMaxFolders },
        );

        await admin.from('audit_logs').insert({
          company_id: companyId,
          user_id: auth.userId,
          action: 'drive_boleto_test_lookup',
          entity: 'google_sheets_config',
          metadata: {
            query,
            recursive: true,
            max_depth: maxDepth,
            bfs_max_folders: bfsMaxFolders,
            tokens: meta.tokens_all,
            results_found: results.length,
            folders_visited: meta.folders_visited,
            pdfs_scanned: meta.pdfs_scanned,
            fallback_used: meta.fallback_used,
            folder_id: folderId,
            duration_ms: Date.now() - lookupStart,
          },
        }).then(() => {}).catch(() => {});

        // ── Payload guards — hard-cap every large array before serialising ──────
        // Supabase gateway limit is 6 MB; Deno JSON.stringify on large objects
        // can also OOM. Caps below keep the debug block well under 200 KB.
        const MAX_VISITED = 50;
        const MAX_SCANNED = 50;
        const MAX_FOLDER_NAMES = 100;
        const MAX_QUEUE_CAP = 10;

        const safeVisited = meta.visited_folders.slice(0, MAX_VISITED).map((f) => ({
          name: String(f.name ?? ''),
          depth: Number(f.depth ?? 0),
          path: String(f.path ?? ''),
          id: String(f.id ?? ''),
        }));

        const safeScanned = meta.scanned_pdfs.slice(0, MAX_SCANNED).map((p) => ({
          file_name: String(p.file_name ?? ''),
          parent_folder: String(p.parent_folder ?? ''),
          folder_id: String(p.folder_id ?? ''),
        }));

        const safeQueueAtCap = meta.queue_at_cap.slice(0, MAX_QUEUE_CAP).map((q) => ({
          name: String(q.name ?? ''),
          depth: Number(q.depth ?? 0),
          path: String(q.path ?? ''),
          id: String(q.id ?? ''),
        }));

        const safeAllFolderNames = meta.all_folder_names.slice(0, MAX_FOLDER_NAMES).map(String);

        const debugBlock = {
          tokens_all: meta.tokens_all,
          tokens_numbers: meta.tokens_numbers,
          tokens_names: meta.tokens_names,
          folder_id: folderId,
          folders_visited: meta.folders_visited,
          pdfs_scanned: meta.pdfs_scanned,
          folder_errors: meta.folder_errors,
          fallback_used: meta.fallback_used,
          bfs_max_folders: bfsMaxFolders,
          duration_ms: Date.now() - lookupStart,
          // Full error details — traversal = BFS listing subfolders; pdf = listing files inside folder
          traversal_errors: meta.traversal_errors.map((e) => ({
            folder_id: String(e.folder_id ?? ''),
            folder_name: String(e.folder_name ?? ''),
            depth: Number(e.depth ?? 0),
            http_status: e.http_status ?? null,
            error: String(e.error ?? ''),
          })),
          pdf_errors: meta.pdf_errors.map((e) => ({
            folder_id: String(e.folder_id ?? ''),
            http_status: e.http_status ?? null,
            error: String(e.error ?? ''),
          })),
          // Scoring diagnostic — top 20 files that had token substring presence but scored < MIN_SCORE.
          rejected_candidates: meta.rejected_candidates,
          // Files that passed MIN_SCORE but only via base number — hidden from primary results
          // when any exact_match result exists. Visible here for debugging.
          base_only_candidates: Array.isArray(meta.base_only_candidates)
            ? meta.base_only_candidates.map((c) => ({
                file_name: String(c.file_name ?? ''),
                parent_folder: String(c.parent_folder ?? ''),
                score: Number(c.score ?? 0),
                matched_tokens: Array.isArray(c.matched_tokens) ? c.matched_tokens.map(String) : [],
                reasons: Array.isArray(c.reasons) ? c.reasons.map(String) : [],
              }))
            : [],
          // Raw substring presence of each query token across all scanned PDFs (no scoring).
          diagnostic_token_matches: meta.diagnostic_token_matches.map((d) => ({
            token: String(d.token ?? ''),
            normalized_token: String(d.normalized_token ?? ''),
            matches_count: Number(d.matches_count ?? 0),
            matches: (d.matches || []).map((m) => ({
              file_name: String(m.file_name ?? ''),
              parent_folder: String(m.parent_folder ?? ''),
            })),
          })),
          // ── Structural diagnostic (capped to avoid payload bloat) ────────────
          bfs_cap_hit: Boolean(meta.bfs_cap_hit),
          // Folders unvisited when cap hit (capped to MAX_QUEUE_CAP)
          queue_at_cap: safeQueueAtCap,
          queue_at_cap_total: meta.queue_at_cap.length,
          // Folders visited by BFS (capped to MAX_VISITED; full count in folders_visited)
          visited_folders: safeVisited,
          visited_folders_total: meta.visited_folders.length,
          // Flat list of folder names (capped to MAX_FOLDER_NAMES)
          all_folder_names: safeAllFolderNames,
          all_folder_names_total: meta.all_folder_names.length,
          // PDFs actually scanned (capped to MAX_SCANNED; full count in pdfs_scanned)
          scanned_pdfs: safeScanned,
          scanned_pdfs_total: meta.scanned_pdfs.length,
          // Targeted lookup diagnostic
          targeted_lookup_used: Boolean(meta.targeted_lookup_used),
          targeted_path_log: Array.isArray(meta.targeted_path_log) ? meta.targeted_path_log : [],
          // Phase 0 trace — always present even when BFS ran
          targeted_phase0_ran: Boolean(meta.targeted_phase0_ran),
          targeted_phase0_null: Boolean(meta.targeted_phase0_null),
          targeted_phase0_pdfs_collected: Number(meta.targeted_phase0_pdfs_collected ?? 0),
          targeted_phase0_error: meta.targeted_phase0_error ? String(meta.targeted_phase0_error) : null,
          targeted_phase0_path_log: Array.isArray(meta.targeted_phase0_path_log) ? meta.targeted_phase0_path_log : [],
          targeted_phase0_candidates: Array.isArray(meta.targeted_phase0_candidates)
            ? meta.targeted_phase0_candidates.map((c) => ({ name: String(c.name ?? ''), score: Number(c.score ?? 0), path: String(c.path ?? '') }))
            : [],
        };

        // Log approximate response size so we can catch payload issues in future
        try {
          const approxBytes = JSON.stringify(debugBlock).length;
          console.log(JSON.stringify({
            event: 'lookup_response_size',
            approx_bytes: approxBytes,
            duration_ms: Date.now() - lookupStart,
            folders_visited: meta.folders_visited,
            pdfs_scanned: meta.pdfs_scanned,
            bfs_max_folders: bfsMaxFolders,
          }));
        } catch (_sizeErr) { /* ignore — size logging is best-effort */ }

        return jsonResponse({
          ok: true,
          company_id: companyId,
          query,
          folder_id: folderId,
          folder_url: `https://drive.google.com/drive/folders/${folderId}`,
          recursive: true,
          max_depth: maxDepth,
          results_found: results.length,
          duration_ms: Date.now() - lookupStart,
          // OAuth / service account info — helps diagnose permission problems
          service_account_email: Deno.env.get('GOOGLE_CLIENT_EMAIL') || '(não configurado)',
          oauth_scope: 'https://www.googleapis.com/auth/drive.readonly',
          debug: debugBlock,
          results: results.map((r) => ({
            file_id: String(r.file.id ?? ''),
            file_name: String(r.file.name ?? ''),
            file: {
              id: String(r.file.id ?? ''),
              name: String(r.file.name ?? ''),
              mimeType: String(r.file.mimeType ?? ''),
              webViewLink: r.file.webViewLink || `https://drive.google.com/file/d/${r.file.id}/view`,
              webContentLink: r.file.webContentLink || null,
            },
            score: Number(r.score ?? 0),
            exact_match: Boolean(r.exact_match ?? false),
            reasons: Array.isArray(r.reasons) ? r.reasons.map(String) : [],
            matched_tokens: Array.isArray(r._debug?.matched_tokens) ? r._debug.matched_tokens.map(String) : [],
            match_origin: r.reasons?.[0] ? String(r.reasons[0]) : null,
            view_url: r.file.webViewLink || `https://drive.google.com/file/d/${r.file.id}/view`,
          })),
        });
      } catch (lookupErr) {
        const errMsg = lookupErr instanceof Error ? lookupErr.message : String(lookupErr);
        const errStack = lookupErr instanceof Error ? (lookupErr.stack || null) : null;
        const errName = lookupErr instanceof Error ? lookupErr.name : 'Error';
        console.error(JSON.stringify({
          event: 'test_boleto_lookup_error',
          error: errMsg,
          error_name: errName,
          stack: errStack,
          duration_ms: Date.now() - lookupStart,
          company_id: companyId,
        }));
        // Return HTTP 200 (not 500) so Supabase client puts the body in `data`
        // instead of `error`. The frontend reads `data.ok === false` and shows
        // data.error / data.error_stack. A 5xx causes the client to swallow the
        // body and surface only "non-2xx status code" — no useful message.
        return jsonResponse({
          ok: false,
          error: errMsg,
          error_name: errName,
          error_stack: errStack,
          action: 'test_boleto_lookup',
          duration_ms: Date.now() - lookupStart,
          hint: 'Veja os logs da edge function para mais detalhes.',
        }, 200);
      }
    }

    if (action === 'scan_folder_recursive') {
      requireCompanyId(companyId);
      const config = await getSheetsDriveConfig(admin, companyId || '');
      const folderId = requireDriveFolderId(config?.drive_root_folder_id);
      const maxDepth = Math.min(5, Math.max(1, Number(body?.max_depth ?? config?.drive_max_depth ?? 2)));
      const limit = Math.min(500, Math.max(1, Number(body?.limit || 100)));
      const files = await listPdfFilesRecursive(googleToken, folderId, maxDepth, limit);
      const folderIds = await collectFolderIds(googleToken, folderId, maxDepth);
      return jsonResponse({
        ok: true,
        company_id: companyId,
        folder_id: folderId,
        max_depth: maxDepth,
        folders_scanned: folderIds.length,
        pdf_count: files.length,
        files: files.slice(0, 50).map((f) => ({
          id: f.id,
          name: f.name,
          view_url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        })),
      });
    }

    // ETAPA 7: Z-API health check
    if (action === 'test_zapi_health') {
      requireCompanyId(companyId);
      const healthStart = Date.now();
      try {
        const zapiCfg = await resolveCompanyZapiConfig(admin, companyId || '', { allowTestMode: true });
        const statusData = await validateZapiConnection(zapiCfg);
        const connected = isZapiConnected(statusData);
        const phone = extractZapiPhoneNumber(statusData);
        const circuit = await checkZapiCircuit(admin, companyId || '');
        return jsonResponse({
          ok: true,
          company_id: companyId,
          zapi_connected: connected,
          zapi_phone: phone || null,
          circuit_open: circuit.open,
          circuit_reason: circuit.reason || null,
          source: zapiCfg.source,
          duration_ms: Date.now() - healthStart,
        });
      } catch (healthErr) {
        const errMsg = healthErr instanceof Error ? healthErr.message : String(healthErr);
        return jsonResponse({
          ok: false,
          company_id: companyId,
          zapi_connected: false,
          error: errMsg,
          circuit_open: false,
          duration_ms: Date.now() - healthStart,
        });
      }
    }

    // ETAPA 7: Drive health check (enhanced)
    if (action === 'test_drive_health') {
      requireCompanyId(companyId);
      const healthStart = Date.now();
      try {
        const result = await testDriveConnectionForCompany(admin, companyId || '', googleToken);
        const hasGoogleCreds = Boolean(Deno.env.get('GOOGLE_CLIENT_EMAIL') && Deno.env.get('GOOGLE_PRIVATE_KEY'));
        const ocrEnabled = String(Deno.env.get('ENABLE_GOOGLE_VISION_OCR') || '') === 'true';
        return jsonResponse({
          ok: true,
          company_id: companyId,
          drive_status: result.status,
          folder_name: result.folder_name,
          pdf_count: result.quantidade_arquivos_pdf,
          service_account: result.service_account_email,
          google_creds_configured: hasGoogleCreds,
          ocr_enabled: ocrEnabled,
          duration_ms: Date.now() - healthStart,
        });
      } catch (healthErr) {
        return jsonResponse({
          ok: false,
          company_id: companyId,
          drive_status: 'erro',
          error: healthErr instanceof Error ? healthErr.message : String(healthErr),
          duration_ms: Date.now() - healthStart,
        });
      }
    }

        return jsonResponse({ ok: false, error: 'Acao nao suportada.' }, 400);
  } catch (error) {
    return errorResponse(runtime, error, {
      status: 500,
      code: 'BILLING_AUTOMATION_FATAL',
      metadata: {
        action,
        company_id: companyId,
      },
    });
  }
});
