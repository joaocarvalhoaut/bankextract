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
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Client-token': String(config.clientToken || '').trim(),
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json().catch(() => ({}));
  console.log('[ZAPI COMPANY REQUEST]', {
    url: url.replace(/\/token\/[^/]+\//, '/token/****/'),
    ok: response.ok,
    status: response.status,
  });
  console.log('[ZAPI COMPANY RESPONSE]', data);

  if (!response.ok) {
    throw new Error(`Z-API validacao erro ${response.status}: ${JSON.stringify(data)}`);
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
    data?.qrCode,
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
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Client-token': clientToken,
      'Content-Type': 'application/json',
    },
  });

  const contentType = response.headers.get('content-type') || '';
  console.log('[ZAPI QR REQUEST]', {
    instanceId,
    hasToken: Boolean(token),
    hasClientToken: Boolean(clientToken),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.log('[ZAPI QR RESPONSE]', {
      status: response.status,
      ok: response.ok,
      data: errorData,
    });
    throw new Error('Nao foi possivel gerar o QR Code. Confira se a instancia, token e client token estao corretos.');
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
      throw new Error(await response.text());
    }

    return await response.json() as T;
  }

  throw new Error('googleJson: excedido número máximo de tentativas.');
}

async function getDriveFileMetadata(token: string, fileId: string) {
  return await googleJson<DriveCandidate>(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,parents,webViewLink,webContentLink`,
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
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1000`,
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
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,parents,webViewLink,webContentLink,modifiedTime),nextPageToken&pageSize=${Math.min(100, limit - files.length)}${suffix}`,
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
  const data = await googleJson<{ files?: Array<{ id: string; name: string }> }>(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=50`,
    token,
  );
  return data.files || [];
}

// Recursively collect all folder IDs under a root (BFS, capped at maxDepth and maxFolders)
async function collectFolderIds(
  token: string,
  rootId: string,
  maxDepth: number,
  maxFolders = 40,
): Promise<string[]> {
  const visited = new Set<string>([rootId]);
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];

  while (queue.length > 0 && visited.size < maxFolders) {
    const item = queue.shift();
    if (!item || item.depth >= maxDepth) continue;
    const children = await listSubfolders(token, item.id).catch(() => []);
    for (const child of children) {
      if (!visited.has(child.id) && visited.size < maxFolders) {
        visited.add(child.id);
        queue.push({ id: child.id, depth: item.depth + 1 });
      }
    }
  }

  return Array.from(visited);
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

// Get folder structure (tree) for admin preview
async function getDriveFolderStructure(
  token: string,
  rootFolderId: string,
  maxDepth = 2,
): Promise<unknown> {
  async function buildNode(id: string, name: string, depth: number): Promise<unknown> {
    const pdfCount = await countPdfFilesInFolder(token, id).catch(() => 0);
    const node: Record<string, unknown> = { id, name, pdf_count: pdfCount };
    if (depth < maxDepth) {
      const children = await listSubfolders(token, id).catch(() => []);
      if (children.length > 0) {
        node.subfolders = await Promise.all(
          children.slice(0, 20).map((child) => buildNode(child.id, child.name, depth + 1)),
        );
      }
    }
    return node;
  }

  const root = await getDriveFileMetadata(token, rootFolderId);
  return buildNode(rootFolderId, root.name || 'Root', 0);
}

// Test boleto lookup — finds PDFs matching a free-form search term
async function testBoletoLookup(
  token: string,
  rootFolderId: string,
  query: string,
  config: { recursive?: boolean; maxDepth?: number } = {},
): Promise<Array<{ file: DriveCandidate; score: number; reasons: string[] }>> {
  const recursive = Boolean(config.recursive);
  const maxDepth = Math.min(5, Math.max(1, Number(config.maxDepth || 2)));
  const folderIds = recursive
    ? await collectFolderIds(token, rootFolderId, maxDepth)
    : [rootFolderId];

  const term = normalizeText(String(query || '').trim());
  if (!term) return [];

  const candidates: DriveCandidate[] = [];

  for (const folderId of folderIds) {
    if (candidates.length >= 10) break;

    // Exact filename search
    const escapedTerm = term.replace(/'/g, "\'");
    const nameQuery = encodeURIComponent(
      `name contains '${escapedTerm}' and '${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
    );
    const nameData = await googleJson<{ files?: DriveCandidate[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${nameQuery}&fields=files(id,name,mimeType,webViewLink,webContentLink)&pageSize=5`,
      token,
    ).catch(() => ({ files: [] as DriveCandidate[] }));

    for (const f of nameData.files || []) {
      if (!candidates.find((c) => c.id === f.id)) candidates.push(f);
    }

    // Full-text search
    if (candidates.length < 5) {
      const ftQuery = encodeURIComponent(
        `fullText contains '${escapedTerm}' and '${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
      );
      const ftData = await googleJson<{ files?: DriveCandidate[] }>(
        `https://www.googleapis.com/drive/v3/files?q=${ftQuery}&fields=files(id,name,mimeType,webViewLink,webContentLink)&pageSize=5`,
        token,
      ).catch(() => ({ files: [] as DriveCandidate[] }));

      for (const f of ftData.files || []) {
        if (!candidates.find((c) => c.id === f.id)) candidates.push(f);
      }
    }
  }

  // Score candidates
  return candidates.slice(0, 5).map((file) => {
    const nameLower = normalizeText(file.name || '');
    const score = nameLower.includes(term) ? 80 : 50;
    const reasons: string[] = nameLower.includes(term) ? ['filename_match'] : ['fulltext_match'];
    return { file, score, reasons };
  });
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
    const pdfCount = await countPdfFilesInFolder(token, folderId);
    return {
      status: 'sucesso',
      folder_name: folder.name || null,
      quantidade_arquivos_pdf: pdfCount,
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
        .select('id, company_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, status, tentativas_cobranca')
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
      drive_file_id: String(item?.drive_file_id || '') || null,
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
      const sendResult = await sendZapiText(supabaseAdmin, companyId, { phone: normalizedPhone, message }, options);
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
  const { error } = await supabaseAdmin.from('logs_cobranca').insert(payload);
  if (error) throw new Error(error.message);
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
  const hash = await sha256Hex(`${record.company_id}|${record.id}|${numeroBoletoEfetivo || ''}|${tipo}|${todayIso}`);
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
      payload: { company_id: record.company_id, record_id: record.id, boleto_status: boletoStatus },
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
  if (usePreMatched) {
    // Verify the pre-matched file still exists in Drive (cheap metadata call, no re-search)
    file = await getDriveFileMetadata(token, record.drive_file_id!).catch(() => null);
    if (!file?.id) {
      // Pre-matched file missing or inaccessible — fall back to live search
      file = null;
    }
  }

  // ETAPA 1: Scored live search with blocking rules
  if (!file) {
    const scoredCandidates = await searchDriveFilesScored(token, folderId, record);
    const best = scoredCandidates[0];
    const second = scoredCandidates[1];

    if (best) {
      // Conflict: two candidates both >= 80 and within 5 points of each other
      if (best.score >= 80 && second && second.score >= 80 && Math.abs(best.score - second.score) <= 5) {
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
          drive_file_id: best.file.id,
          status_envio: 'erro',
          erro: 'boleto_conflito_live_search',
          payload: {
            winner_score: best.score, winner_file_id: best.file.id, winner_file_name: best.file.name,
            second_score: second.score, second_file_id: second.file.id, company_id: record.company_id,
          },
          envio_hash: hash,
        });
        await insertAutomationAuditLog(supabaseAdmin, {
          company_id: record.company_id, action: 'live_search_conflict_blocked',
          registro_id: record.id, charge_id: record.id,
          boleto_file_id: best.file.id, boleto_score: best.score, boleto_strategy: best.strategy,
          boleto_second_score: second.score, blocked_reason: 'conflict_live_search',
        });
        await finalizeAutomationDispatch(supabaseAdmin, {
          companyId: record.company_id, dispatchType, operationHash: dispatch.operationHash,
          status: 'failed', metadata: { reason: 'boleto_conflito_live_search', winner_score: best.score, second_score: second.score },
        });
        return { status: 'erro', reason: 'boleto_conflito_live_search' };
      }
      // Low confidence: block attachment if score < 80
      if (best.score < 80) {
        await insertAutomationAuditLog(supabaseAdmin, {
          company_id: record.company_id, action: 'live_search_low_confidence_blocked',
          registro_id: record.id, charge_id: record.id,
          boleto_file_id: best.file.id, boleto_score: best.score, boleto_strategy: best.strategy,
          blocked_reason: `baixa_confianca_score_${best.score}`,
        });
        // file stays null — will be handled by the !file check below
      } else {
        file = best.file;
        await insertAutomationAuditLog(supabaseAdmin, {
          company_id: record.company_id, action: 'live_search_matched',
          registro_id: record.id, boleto_file_id: best.file.id,
          boleto_score: best.score, boleto_strategy: best.strategy,
          boleto_second_score: second?.score ?? null,
        });
      }
    }
  }

  if (!file?.id && !permitirEnvioSemBoleto) {
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
      erro: 'boleto_nao_encontrado',
      payload: { company_id: record.company_id, record_id: record.id },
      envio_hash: hash,
    });
    await finalizeAutomationDispatch(supabaseAdmin, {
      companyId: record.company_id,
      dispatchType,
      operationHash: dispatch.operationHash,
      status: 'failed',
      metadata: { reason: 'boleto_nao_encontrado' },
    });
    return { status: 'erro', reason: 'boleto_nao_encontrado' };
  }

  const message = fillTemplate(template, record, diasAtraso, companyName);

  if (simulate) {
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
      },
      envio_hash: hash,
    });
    await finalizeAutomationDispatch(supabaseAdmin, {
      companyId: record.company_id,
      dispatchType,
      operationHash: dispatch.operationHash,
      status: 'completed',
      metadata: { simulated: true, file_name: file?.name || null },
    });
    // Forensic audit for simulated sends — allows BoletoMatchStatus panel to show them
    await insertAutomationAuditLog(supabaseAdmin, {
      company_id: record.company_id,
      action: 'whatsapp_charge_simulated',
      registro_id: record.id,
      charge_id: record.id,
      telefone: phone,
      boleto_file_id: file?.id || null,
      boleto_score: Number(record.boleto_match_confidence || 0) || null,
      boleto_strategy: record.boleto_match_strategy || null,
      template_used: tipo,
      zapi_status: 'simulated',
      request_payload: { tipo, dias_atraso: diasAtraso, simulate: true, document: record.documento, phone },
      response_payload: { simulated: true, file_name: file?.name || null, message_preview: message },
    });

    return {
      status: 'sucesso',
      tipo,
      fileId: file?.id || null,
      simulated: true,
      message,
      fileName: file?.name || `${numeroBoletoEfetivo || record.documento || record.id}.pdf`,
    };
  }

  if (!file?.id) {
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
      payload: { company_id: record.company_id, record_id: record.id, circuit_reason: circuit.reason },
    });
    await finalizeAutomationDispatch(supabaseAdmin, {
      companyId: record.company_id, dispatchType, operationHash: dispatch.operationHash,
      status: 'failed', metadata: { reason: 'zapi_circuit_open' },
    });
    return { status: 'erro', reason: 'zapi_circuit_open' };
  }

  const zapiConfig = await resolveCompanyZapiConfig(supabaseAdmin, record.company_id, { allowTestMode: false });
  const base64 = await downloadDriveFileBase64(token, file.id);
  let sendResult: { provider_id: string; raw: unknown };
  const sendStartedAt = Date.now();
  try {
    sendResult = await sendZapiDocument(zapiConfig, phone, message, file.name || `${numeroBoletoEfetivo || record.documento || record.id}.pdf`, base64);
    await recordZapiSuccess(supabaseAdmin, record.company_id);
  } catch (sendErr) {
    const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
    await recordZapiFailure(supabaseAdmin, record.company_id, errMsg);
    console.log(JSON.stringify({
      event: 'attachment_failed', company_id: record.company_id,
      financial_record_id: record.id, file_id: file.id, file_name: file.name,
      tipo, phone, error: errMsg,
    }));
    throw sendErr;
  }
  const sentAt = new Date().toISOString();
  const providerMessageId = sendResult.provider_id || null;

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
    boleto_score: Number(record.boleto_match_confidence || 0) || null,
    boleto_strategy: record.boleto_match_strategy || null,
    template_used: tipo,
    zapi_status: 'sent',
    provider_message_id: providerMessageId,
    duration_ms: Date.now() - sendStartedAt,
    request_payload: { tipo, dias_atraso: diasAtraso, document: record.documento, phone },
    response_payload: { provider_message_id: providerMessageId, sent_at: sentAt },
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

  return { status: 'sucesso', tipo, fileId: file.id };
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
    .select('id, company_id, nome, cliente_nome, documento, numero_nf, numero_boleto, data_vencimento, valor, telefone, status, created_at')
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
    .limit(limit);
  if (error) throw new Error(error.message);

  let simulated = 0;
  let errors = 0;
  const items: Array<Record<string, unknown>> = [];

  for (const record of records || []) {
    const outcome = await processChargeForRecord(
      supabaseAdmin,
      record as FinancialRow,
      config as BillingConfigRow | null,
      token,
      folderId,
      todayIso,
      true,
      true,
      companyName,
    );

    if (outcome.status === 'sucesso') simulated += 1;
    if (outcome.status === 'erro') errors += 1;

    items.push({
      id: record.id,
      nome: getClienteEfetivo(record) || record.nome || 'Cliente',
      numero_boleto: getNumeroBoletoEfetivo(record) || null,
      status: outcome.status,
      tipo: outcome.tipo || null,
      arquivo_encontrado: temBoletoEncontrado(record),
      motivo: outcome.reason || null,
      simulated: Boolean(outcome.simulated),
    });
  }

  return {
    simulated,
    errors,
    items,
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

    if (action === 'get_billing_config' || action === 'save_billing_config' || action === 'get_billing_rules' || action === 'save_billing_rules' || action === 'get_billing_center' || action === 'get_billing_history' || action === 'get_billing_inconsistencies' || action === 'get_real_send_checklist' || action === 'simulate_charge_batch' || action === 'simulate_charge_item' || action === 'update_charge_status' || action === 'update_financial_phone' || action === 'preview_template' || action === 'get_plan_capabilities' || action === 'get_usage_summary' || action === 'check_send_permission' || action === 'get_boleto_sync_report' || action === 'preview_charge_payload' || action === 'prepare_manual_charge' || action === 'send_real' || action === 'send_single_charge' || action === 'validate_company_integration' || action === 'validate_connection' || action === 'get_qr_code' || action === 'get_connection_status' || action === 'test_zapi_health' || action === 'test_drive_health') {
      requireCompanyId(companyId);
    }

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
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
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
        const qrCode = await getZapiQrCodeData({
          instanceId: zapiConfig.instanceId,
          token: zapiConfig.token,
          clientToken: zapiConfig.clientToken,
        });

        return jsonResponse({
          ok: true,
          success: true,
          action: 'get_qr_code',
          connected: qrCode.connected === true,
          status: qrCode.connected === true ? 'connected' : 'awaiting_qr',
          message: qrCode.connected === true ? 'WhatsApp ja conectado' : 'QR Code carregado com sucesso.',
          qrCode: qrCode.connected === true ? null : qrCode.imageDataUrl,
          image_data_url: qrCode.connected === true ? null : qrCode.imageDataUrl,
          data: qrCode.raw,
        }, 200);
      } catch (error) {
        return jsonResponse({
          ok: false,
          success: false,
          action: 'get_qr_code',
          error: String(error instanceof Error ? error.message : error),
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
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
          details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
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
        const limit = Math.min(50, Math.max(1, Number(body?.limit || 10) || 10));
        const result = await simulateChargeBatchData(admin, companyId || '', todayIso, limit);
        await admin.from('audit_logs').insert({
          company_id: companyId,
          user_id: auth.userId,
          action: 'billing_simulate_batch',
          entity: 'logs_cobranca',
          metadata: result,
        }).then(() => {}).catch(() => {});

        return jsonResponse({
          ok: true,
          success: true,
          action: 'simulate_charge_batch',
          simulated: result.simulated,
          errors: result.errors,
          items: result.items,
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

        for (const record of records || []) {
          const outcome = await processChargeForRecord(
            admin,
            record as FinancialRow,
            config as BillingConfigRow | null,
            googleToken,
            folderId,
            todayIso,
            normalizedRunAction === 'reprocess_failures',
            simulate,
            companyName,
          );
          if (outcome.status === 'sucesso') {
            companySent += 1;
            if (outcome.simulated) {
              companySentSimulated += 1;
              sentSimulated += 1;
            }
            if (outcome.fileId) boletosEncontrados += 1;
            if (outcome.message) mensagensGeradas += 1;
            if (outcome.fileName) arquivosAnexados += 1;
          }
          else if (outcome.status === 'erro') companyErrors += 1;
          else companyIgnored += 1;
        }

        sent += companySent;
        ignored += companyIgnored;
        errors += companyErrors;
        companyResults.push({ company_id: targetCompanyId, sent: companySent, ignored: companyIgnored, errors: companyErrors });

        await admin.from('audit_logs').insert({
          company_id: targetCompanyId,
          user_id: auth.userId,
          action: normalizedRunAction === 'run' ? 'billing_automation_run' : 'billing_automation_reprocess',
          entity: 'logs_cobranca',
          metadata: { sent: companySent, sent_simulated: companySentSimulated, ignored: companyIgnored, errors: companyErrors, company_id: targetCompanyId, simulate },
        }).then(() => {}).catch(() => {});
      }

      const overview = companyId ? await getOverview(admin, companyId, todayIso) : null;

      return jsonResponse({
        ok: true,
        message: normalizedRunAction === 'run' ? 'Régua executada com sucesso.' : 'Falhas reprocessadas com sucesso.',
        result: { sent, sent_simulated: sentSimulated, boletos_encontrados: boletosEncontrados, mensagens_geradas: mensagensGeradas, arquivos_anexados: arquivosAnexados, ignored, errors, companies: companyResults },
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
      const maxDepth = Math.min(5, Math.max(1, Number(body?.max_depth ?? config?.drive_max_depth ?? 2)));
      const structure = await getDriveFolderStructure(googleToken, folderId, maxDepth);
      return jsonResponse({ ok: true, company_id: companyId, folder_id: folderId, structure });
    }

    if (action === 'test_boleto_lookup') {
      requireCompanyId(companyId);
      const config = await getSheetsDriveConfig(admin, companyId || '');
      const folderId = requireDriveFolderId(config?.drive_root_folder_id);
      const query = String(body?.query || body?.documento || body?.numero_boleto || body?.cliente_nome || '').trim();
      if (!query) {
        return jsonResponse({ ok: false, error: 'Informe um termo de busca (documento, boleto, nome).' }, 400);
      }
      const recursive = Boolean(body?.recursive ?? config?.drive_recursive_scan ?? false);
      const maxDepth = Math.min(5, Math.max(1, Number(body?.max_depth ?? config?.drive_max_depth ?? 2)));
      const results = await testBoletoLookup(googleToken, folderId, query, { recursive, maxDepth });
      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: auth.userId,
        action: 'drive_boleto_test_lookup',
        entity: 'google_sheets_config',
        metadata: { query, recursive, results_found: results.length, folder_id: folderId },
      }).then(() => {}).catch(() => {});
      return jsonResponse({
        ok: true,
        company_id: companyId,
        query,
        folder_id: folderId,
        recursive,
        results_found: results.length,
        results: results.map((r) => ({
          file_id: r.file.id,
          file_name: r.file.name,
          score: r.score,
          reasons: r.reasons,
          view_url: r.file.webViewLink || `https://drive.google.com/file/d/${r.file.id}/view`,
        })),
      });
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
