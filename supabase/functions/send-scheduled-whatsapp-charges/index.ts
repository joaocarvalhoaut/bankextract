import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withTimeout } from '../_shared/runtime.ts';

interface WhatsAppAutoConfig {
  empresa_id: string;
  ativo: boolean;
  intervalo_dias: number;
  hora_envio: string;
  cobrar_apos_dias_vencido: number;
  limite_cobrancas_por_titulo: number;
  mensagem_template: string | null;
}

interface FinancialConfig {
  multa_percentual: number | null;
  juros_percentual_dia: number | null;
}

interface RegistroFinanceiro {
  id: string;
  company_id: string;
  nome: string;
  numero_boleto: string | null;
  data_vencimento: string;
  valor: number;
  telefone: string | null;
  status: string;
}

interface ChargeHistoryRow {
  id: string;
  created_at: string;
}

interface HistoricoDetalhe {
  registro_id: string;
  nome: string;
  historico_count: number;
  ultimo_envio_iso: string | null;
  dias_desde_ultimo_envio: number | null;
  limite_configurado: number;
  intervalo_configurado: number;
  bloqueio: string | null;
  force_send_ignorou: boolean;
}

interface CompanyDebugSummary {
  empresa_id: string;
  empresa_id_recebido?: string | null;
  coluna_empresa_usada?: string;
  query_company_id_usado?: string | null;
  total_registros_query_empresa?: number;
  erro_query_empresa?: string | null;
  total_registros_sem_filtro?: number;
  amostra_empresas?: Array<{
    id: string;
    nome: string;
  }>;
  amostra_registros_sem_filtro?: Array<{
    id: string;
    nome: string;
    company_id: string | null;
    empresa_id: string | null;
    data_vencimento: string | null;
    telefone: string | null;
    status: string | null;
  }>;
  total_registros_buscados: number;
  elegiveis: number;
  force_send_active: boolean;
  descartados: {
    sem_telefone: number;
    liquidado: number;
    nao_vencido: number;
    intervalo: number;
    limite: number;
    parse_invalido: number;
    empresa_diferente: number;
    outros: number;
  };
  exemplos_descartados: Array<{
    registro_id: string;
    nome: string;
    motivo: string;
    status: string;
    telefone: string;
    data_vencimento: string;
    company_id: string;
  }>;
  historico_detalhado: HistoricoDetalhe[];
}

interface CompanyProcessingResult {
  empresa_id: string;
  empresa_nome: string;
  eligible_titles: number;
  sent: number;
  skipped: number;
  errors: number;
  mocked: boolean;
  reasons: string[];
  debug: CompanyDebugSummary;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_TEMPLATE = [
  'Ola, {nome_cliente},',
  '',
  'Aqui e {sender_name}, do setor de cobranca da {empresa}.',
  '',
  'Estou entrando em contato para confirmar o pagamento do titulo abaixo:',
  '',
  'Documento: {numero_boleto}',
  'Vencimento: {data_vencimento}',
  'Valor original: {valor}',
  'Valor atualizado: {valor_atualizado}',
  'Dias em atraso: {dias_atraso}',
  '',
  'Informamos que, apos 5 dias do vencimento, o titulo pode estar sujeito a protesto e encargos adicionais.',
  '',
  'Aguardamos seu retorno.',
  '',
  'Caso ja tenha efetuado o pagamento, desconsidere esta mensagem.',
].join('\n');

const DEFAULT_SENDER_NAME = 'Equipe de cobranca';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const getSaoPauloParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const getValue = (type: string) => parts.find((part) => part.type === type)?.value || '';

  return {
    date: `${getValue('year')}-${getValue('month')}-${getValue('day')}`,
    hour: getValue('hour'),
    minute: getValue('minute'),
  };
};

const isWithinSendWindow = (horaEnvio: string, now = new Date()) => {
  const current = getSaoPauloParts(now);
  const [rawHour = '08', rawMinute = '00'] = String(horaEnvio || '08:00').split(':');
  const targetHour = Number(rawHour);
  const targetMinute = Number(rawMinute);
  const currentHour = Number(current.hour);
  const currentMinute = Number(current.minute);

  const targetTotal = targetHour * 60 + targetMinute;
  const currentTotal = currentHour * 60 + currentMinute;

  return Math.abs(currentTotal - targetTotal) <= 60;
};

const parseBrazilianDate = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const isoDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const brazilianMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brazilianMatch) {
    const [, day, month, year] = brazilianMatch;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const daysLate = (dueDate: string, todayIso: string) => {
  const due = parseBrazilianDate(dueDate);
  const today = parseBrazilianDate(todayIso);

  if (!due || !today) {
    return null;
  }

  if (due >= today) {
    return 0;
  }

  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
};

const formatDateBR = (iso: string) => {
  const parsed = parseBrazilianDate(iso);
  if (!parsed) return iso;
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const year = String(parsed.getUTCFullYear());
  return `${day}/${month}/${year}`;
};

const formatCurrencyBRL = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const normalizePhone = (raw: string) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) {
    return digits.length >= 12 && digits.length <= 13 ? digits : '';
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return '';
};

const calculateUpdatedValue = (
  valor: number,
  atraso: number,
  financialConfig: FinancialConfig | null,
) => {
  if (atraso <= 0) return Number(valor || 0);

  const multaPercentual = Number(financialConfig?.multa_percentual ?? 2) / 100;
  const jurosPercentualDia = Number(financialConfig?.juros_percentual_dia ?? 0.033) / 100;
  const multa = Number(valor || 0) * multaPercentual;
  const juros = Number(valor || 0) * jurosPercentualDia * atraso;
  return Number(valor || 0) + multa + juros;
};

const buildMessage = ({
  template,
  registro,
  empresaNome,
  senderName,
  diasAtraso,
  valorAtualizado,
}: {
  template: string | null;
  registro: RegistroFinanceiro;
  empresaNome: string;
  senderName: string;
  diasAtraso: number;
  valorAtualizado: number;
}) => {
  const safeTemplate = template || DEFAULT_TEMPLATE;

  return safeTemplate
    .replace(/{nome_cliente}/g, registro.nome || 'Cliente')
    .replace(/{nome}/g, registro.nome || 'Cliente')
    .replace(/{sender_name}/g, senderName || DEFAULT_SENDER_NAME)
    .replace(/{empresa}/g, empresaNome || 'Empresa')
    .replace(/{numero_boleto}/g, registro.numero_boleto || 'N/A')
    .replace(/{data_vencimento}/g, formatDateBR(registro.data_vencimento))
    .replace(/{valor}/g, formatCurrencyBRL(registro.valor))
    .replace(/{valor_atualizado}/g, formatCurrencyBRL(valorAtualizado))
    .replace(/{dias_atraso}/g, String(diasAtraso));
};

// Resolve modo mock vs. real com base no secret ENABLE_MOCK_WHATSAPP.
// Retorna objeto compatível com o resto do código (mocked, url, clientToken, instanceId, zapiToken).
const resolveZApiConfig = (): {
  mocked: boolean;
  url: string | null;
  clientToken: string | null;
  instanceId: string | null;
  zapiToken: string | null;
} => {
  if (Deno.env.get('ENABLE_MOCK_WHATSAPP') === 'true') {
    return { mocked: true, url: null, clientToken: null, instanceId: null, zapiToken: null };
  }

  const instanceId  = Deno.env.get('ZAPI_INSTANCE_ID');
  const zapiToken   = Deno.env.get('ZAPI_TOKEN');
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

  if (!instanceId || !zapiToken || !clientToken) {
    throw new Error(
      'Z-API não configurada. Verifique os secrets ZAPI_INSTANCE_ID, ZAPI_TOKEN e ' +
      'ZAPI_CLIENT_TOKEN no Supabase Dashboard, ou ative o modo teste com ENABLE_MOCK_WHATSAPP=true.'
    );
  }

  return {
    mocked: false,
    url: `https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-text`,
    clientToken,
    instanceId,
    zapiToken,
  };
};

// Alias para compatibilidade com o resto do arquivo
const buildZApiUrl = resolveZApiConfig;

// ── Z-API pairing gate ──────────────────────────────────────────────────────
async function checkZapiPairing(
  zapi: { mocked: boolean; instanceId: string | null; zapiToken: string | null; clientToken: string | null },
): Promise<{ connected: boolean; reason: string }> {
  if (zapi.mocked || !zapi.instanceId || !zapi.zapiToken || !zapi.clientToken) {
    return { connected: true, reason: 'mocked_or_no_config' };
  }

  try {
    const statusUrl = `https://api.z-api.io/instances/${zapi.instanceId}/token/${zapi.zapiToken}/status`;
    const response = await withTimeout(
      (signal) =>
        fetch(statusUrl, {
          method: 'GET',
          signal,
          headers: { 'Client-Token': zapi.clientToken! },
        }),
      15000,
      'Timeout ao verificar status Z-API.',
    );

    if (!response.ok) {
      const s = response.status;
      if (s === 401 || s === 403) return { connected: false, reason: `Credenciais Z-API inválidas (HTTP ${s}).` };
      return { connected: false, reason: `Z-API retornou HTTP ${s}.` };
    }

    const data = await response.json().catch(() => ({}));
    const connected = data?.connected === true || String(data?.status || '').toLowerCase() === 'connected';
    return {
      connected,
      reason: connected ? 'ok' : `WhatsApp desconectado (status: ${data?.status ?? 'unknown'}).`,
    };
  } catch (err) {
    return {
      connected: false,
      reason: err instanceof Error ? err.message : 'Falha ao verificar status Z-API.',
    };
  }
}

// ── Circuit breaker (per-company Z-API state) ───────────────────────────────
async function checkCircuitBreaker(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<{ open: boolean; reason: string }> {
  const { data, error } = await supabaseAdmin
    .from('zapi_circuit_state')
    .select('circuit_open, circuit_opened_at, consecutive_failures')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error || !data) return { open: false, reason: 'no_state' };
  if (!data.circuit_open) return { open: false, reason: 'closed' };

  // Auto-reset after 15 minutes
  const openedAt = data.circuit_opened_at ? new Date(data.circuit_opened_at).getTime() : 0;
  if (Date.now() - openedAt > 15 * 60 * 1000) {
    await supabaseAdmin.from('zapi_circuit_state').upsert({
      company_id: companyId,
      circuit_open: false,
      consecutive_failures: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' }).catch(() => {});
    return { open: false, reason: 'auto_reset' };
  }

  return { open: true, reason: `Circuit aberto após ${data.consecutive_failures} falhas consecutivas.` };
}

async function recordCircuitSuccess(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
) {
  await supabaseAdmin.from('zapi_circuit_state').upsert({
    company_id: companyId,
    consecutive_failures: 0,
    circuit_open: false,
    last_success_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' }).catch(() => {});
}

async function recordCircuitFailure(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
) {
  const { data } = await supabaseAdmin
    .from('zapi_circuit_state')
    .select('consecutive_failures')
    .eq('company_id', companyId)
    .maybeSingle();

  const current = Number(data?.consecutive_failures ?? 0);
  const next = current + 1;
  const shouldOpen = next >= 3;

  await supabaseAdmin.from('zapi_circuit_state').upsert({
    company_id: companyId,
    consecutive_failures: next,
    circuit_open: shouldOpen,
    circuit_opened_at: shouldOpen ? new Date().toISOString() : null,
    last_failure_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' }).catch(() => {});
}

// ── Forensic audit log ──────────────────────────────────────────────────────
async function appendAuditLog(
  supabaseAdmin: ReturnType<typeof createClient>,
  entry: {
    company_id: string;
    action: string;
    registro_id?: string | null;
    telefone?: string | null;
    zapi_status?: string | null;
    provider_message_id?: string | null;
    blocked_reason?: string | null;
    duration_ms?: number | null;
  },
) {
  await supabaseAdmin.from('automation_audit_logs').insert({
    company_id: entry.company_id,
    action: entry.action,
    registro_id: entry.registro_id ?? null,
    telefone: entry.telefone ?? null,
    zapi_status: entry.zapi_status ?? null,
    provider_message_id: entry.provider_message_id ?? null,
    blocked_reason: entry.blocked_reason ?? null,
    duration_ms: entry.duration_ms ?? null,
  }).catch(() => {});
}

async function assertCompanyAccess(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  empresaId: string,
) {
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

  const { data: membershipRow, error: membershipError } = await supabaseAdmin
    .from('usuarios_empresas')
    .select('company_id')
    .eq('user_id', userId)
    .eq('company_id', empresaId)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message || 'Falha ao validar empresa do usuario.');
  }

  if (!membershipRow?.company_id) {
    throw new Error('Sem permissao para esta empresa.');
  }

  return true;
}

const normalizeZApiError = (status: number, data: Record<string, unknown>): string => {
  if (status === 401) return 'Credencial Z-API inválida (401 Unauthorized).';
  if (status === 403) return 'Acesso negado à Z-API (403 Forbidden).';
  if (status === 429) return 'Rate limit Z-API excedido (429 Too Many Requests).';
  if (status >= 500) return `Erro interno Z-API (HTTP ${status}).`;
  return String(data?.message || data?.error || `HTTP ${status}`);
};

async function sendChargeMessage(
  phone: string,
  message: string,
  zapi: { mocked: boolean; url: string | null; clientToken: string | null },
) {
  if (zapi.mocked || !zapi.url || !zapi.clientToken) {
    return {
      mocked: true,
      ok: true,
      status: 'mock_enviado',
      zapiMessageId: `MOCK-SCHEDULED-${Date.now()}`,
      error: null,
    };
  }

  try {
    const response = await withTimeout(
      (signal) =>
        fetch(zapi.url, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': zapi.clientToken,
          },
          body: JSON.stringify({
            phone,
            message,
          }),
        }),
      15000,
      'Tempo limite excedido ao enviar cobranca agendada pela Z-API.',
    );

    const data = await response.json().catch(() => ({}));
    const zapiMessageId = String(
      data?.zaapId ||
      data?.messageId ||
      data?.id ||
      ''
    ).trim();

    if (!response.ok || !zapiMessageId) {
      return {
        mocked: false,
        ok: false,
        status: 'erro',
        zapiMessageId: null,
        error: normalizeZApiError(response.status, data as Record<string, unknown>),
      };
    }

    return {
      mocked: false,
      ok: true,
      status: 'enviado',
      zapiMessageId,
      error: null,
    };
  } catch (error) {
    return {
      mocked: false,
      ok: false,
      status: 'erro',
      zapiMessageId: null,
      error: error instanceof Error ? error.message : 'Falha ao enviar cobranca pela Z-API.',
    };
  }
}

async function processCompany(
  supabaseAdmin: ReturnType<typeof createClient>,
  config: WhatsAppAutoConfig,
  empresaNome: string,
  senderName: string,
  dryRun: boolean,
  forceSend: boolean,
  zapi: { mocked: boolean; url: string | null; clientToken: string | null },
  companyIdForQuery: string,
  debugContext: Partial<CompanyDebugSummary> = {},
) {
  const result: CompanyProcessingResult = {
    empresa_id: config.empresa_id,
    empresa_nome: empresaNome,
    eligible_titles: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    mocked: zapi.mocked,
    reasons: [],
    debug: {
      empresa_id: config.empresa_id,
      empresa_id_recebido: debugContext.empresa_id_recebido ?? config.empresa_id,
      coluna_empresa_usada: debugContext.coluna_empresa_usada ?? 'company_id',
      query_company_id_usado: debugContext.query_company_id_usado ?? companyIdForQuery,
      total_registros_query_empresa: debugContext.total_registros_query_empresa ?? 0,
      erro_query_empresa: debugContext.erro_query_empresa ?? null,
      total_registros_sem_filtro: debugContext.total_registros_sem_filtro ?? 0,
      amostra_empresas: debugContext.amostra_empresas ?? [],
      amostra_registros_sem_filtro: debugContext.amostra_registros_sem_filtro ?? [],
      total_registros_buscados: 0,
      elegiveis: 0,
      force_send_active: forceSend,
      descartados: {
        sem_telefone: 0,
        liquidado: 0,
        nao_vencido: 0,
        intervalo: 0,
        limite: 0,
        parse_invalido: 0,
        empresa_diferente: 0,
        outros: 0,
      },
      exemplos_descartados: [],
      historico_detalhado: [],
    },
  };

  const pushDiscardExample = (registro: RegistroFinanceiro, motivo: string) => {
    if (result.debug.exemplos_descartados.length >= 5) {
      return;
    }

    result.debug.exemplos_descartados.push({
      registro_id: registro.id,
      nome: registro.nome || '',
      motivo,
      status: String(registro.status || ''),
      telefone: String(registro.telefone || ''),
      data_vencimento: String(registro.data_vencimento || ''),
      company_id: String(registro.company_id || ''),
    });
  };

  if (!config.ativo && !dryRun && !forceSend) {
    result.reasons.push('Configuracao inativa.');
    return result;
  }

  if (!dryRun && !forceSend && !isWithinSendWindow(config.hora_envio)) {
    result.reasons.push('Fora da janela de envio.');
    return result;
  }

  // Circuit breaker: skip company if Z-API circuit is open (auto-resets after 15 min)
  if (!forceSend) {
    const circuit = await checkCircuitBreaker(supabaseAdmin, config.empresa_id);
    if (circuit.open) {
      result.reasons.push(`Circuit aberto (Z-API): ${circuit.reason}`);
      return result;
    }
  }

  const { data: financialConfig, error: financialConfigError } = await supabaseAdmin
    .from('configuracoes_financeiras')
    .select('multa_percentual, juros_percentual_dia')
    .eq('company_id', config.empresa_id)
    .maybeSingle();

  if (financialConfigError) {
    throw new Error(financialConfigError.message || 'Falha ao carregar configuracao financeira.');
  }

  const todayIso = getSaoPauloParts().date;
  const { data: registrosQueryData, error: registrosQueryError } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, nome, numero_boleto, data_vencimento, valor, telefone, status')
    .eq('company_id', companyIdForQuery);

  result.debug.query_company_id_usado = companyIdForQuery;
  result.debug.erro_query_empresa = registrosQueryError?.message || null;
  result.debug.total_registros_query_empresa = (registrosQueryData || []).length;

  if (registrosQueryError) {
    throw new Error(registrosQueryError.message || 'Falha ao buscar registros financeiros elegiveis.');
  }

  let candidateRows = (registrosQueryData || []) as RegistroFinanceiro[];

  if (candidateRows.length === 0) {
    const { data: fallbackRows, error: fallbackError } = await supabaseAdmin
      .from('registros_financeiros')
      .select('id, company_id, nome, numero_boleto, data_vencimento, valor, telefone, status')
      .eq('company_id', companyIdForQuery)
      .limit(500);

    if (fallbackError) {
      throw new Error(fallbackError.message || 'Falha ao buscar fallback de registros financeiros.');
    }

    candidateRows = ((fallbackRows || []) as RegistroFinanceiro[]).filter(
      (r) => r.company_id === companyIdForQuery
    );

    result.debug.total_registros_sem_filtro = candidateRows.length;
    result.debug.coluna_empresa_usada = 'company_id (fallback)';
  }

  result.debug.total_registros_buscados = candidateRows.length;

  // ── Batch-fetch charge history para todos os candidatos em UMA query (evita N+1) ──
  const candidateIds = candidateRows.map((r) => r.id).filter(Boolean);
  const historicoMap = new Map<string, { id: string; created_at: string; status: string }[]>();
  if (candidateIds.length > 0) {
    const { data: allHistorico } = await supabaseAdmin
      .from('cobrancas_whatsapp')
      .select('id, registro_id, created_at, status')
      .in('registro_id', candidateIds)
      .in('status', ['enviado', 'mock_enviado'])
      .order('created_at', { ascending: false });
    for (const row of (allHistorico || [])) {
      const list = historicoMap.get(row.registro_id) || [];
      list.push({ id: row.id, created_at: row.created_at, status: row.status });
      historicoMap.set(row.registro_id, list);
    }
  }

  const todayDate = parseBrazilianDate(todayIso);

  for (const registro of candidateRows) {
    if (!registro.telefone?.trim()) {
      result.debug.descartados.sem_telefone++;
      pushDiscardExample(registro, 'sem_telefone');
      continue;
    }
    if (registro.status === 'liquidado') {
      result.debug.descartados.liquidado++;
      pushDiscardExample(registro, 'liquidado');
      continue;
    }

    const due = parseBrazilianDate(registro.data_vencimento);
    if (!due) {
      result.debug.descartados.parse_invalido++;
      pushDiscardExample(registro, 'data_invalida');
      continue;
    }

    if (todayDate && due >= todayDate) {
      const diasParaVencer = Math.floor((due.getTime() - todayDate.getTime()) / 86400000);
      if (diasParaVencer > 0) {
        result.debug.descartados.nao_vencido++;
        pushDiscardExample(registro, `nao_vencido (vence em ${diasParaVencer}d)`);
        continue;
      }
    }

    const diasAtraso = daysLate(registro.data_vencimento, todayIso) ?? 0;

    if (diasAtraso < config.cobrar_apos_dias_vencido) {
      result.debug.descartados.intervalo++;
      pushDiscardExample(registro, `atraso_insuficiente (${diasAtraso}d < ${config.cobrar_apos_dias_vencido}d)`);
      continue;
    }

    // ── Histórico de cobranças anteriores (pré-carregado em batch, sem N+1) ─
    const historicoRows = historicoMap.get(registro.id) || [];
    const historicoCount   = historicoRows.length;
    const ultimoEnvioIso   = historicoCount > 0 ? historicoRows![0].created_at : null;
    const diasDesdeUltimo  = ultimoEnvioIso
      ? Math.floor((Date.now() - new Date(ultimoEnvioIso).getTime()) / 86400000)
      : null;

    // Determina bloqueios antes de decidir skip/force
    let bloqueioLimite: string | null = null;
    let bloqueioIntervalo: string | null = null;

    if (historicoCount >= config.limite_cobrancas_por_titulo) {
      bloqueioLimite = `limite_atingido (${historicoCount}/${config.limite_cobrancas_por_titulo} cobranças)`;
    }

    if (ultimoEnvioIso && diasDesdeUltimo !== null && config.intervalo_dias > 0) {
      if (diasDesdeUltimo < config.intervalo_dias) {
        bloqueioIntervalo = `intervalo_nao_atingido (${diasDesdeUltimo}d desde ultimo envio < ${config.intervalo_dias}d configurado)`;
      }
    }

    const bloqueioAtivo = bloqueioLimite ?? bloqueioIntervalo ?? null;

    // Registra historico_detalhado SEMPRE que houver histórico ou bloqueio
    if (historicoCount > 0 || bloqueioAtivo) {
      result.debug.historico_detalhado.push({
        registro_id:             registro.id,
        nome:                    registro.nome || '',
        historico_count:         historicoCount,
        ultimo_envio_iso:        ultimoEnvioIso,
        dias_desde_ultimo_envio: diasDesdeUltimo,
        limite_configurado:      config.limite_cobrancas_por_titulo,
        intervalo_configurado:   config.intervalo_dias,
        bloqueio:                bloqueioAtivo,
        force_send_ignorou:      forceSend && bloqueioAtivo !== null,
      });
    }

    // Aplica bloqueio de LIMITE (a menos que force_send=true)
    if (bloqueioLimite) {
      if (forceSend) {
        result.reasons.push(`[force_send] ${registro.nome}: ${bloqueioLimite} — ignorado`);
      } else {
        result.debug.descartados.limite++;
        pushDiscardExample(registro, bloqueioLimite);
        continue;
      }
    }

    // Aplica bloqueio de INTERVALO (a menos que force_send=true)
    if (bloqueioIntervalo) {
      if (forceSend) {
        result.reasons.push(`[force_send] ${registro.nome}: ${bloqueioIntervalo} — ignorado`);
      } else {
        result.debug.descartados.intervalo++;
        pushDiscardExample(registro, bloqueioIntervalo);
        continue;
      }
    }

    result.debug.elegiveis++;
    result.eligible_titles++;

    if (dryRun) {
      result.skipped++;
      continue;
    }

    const valorAtualizado = calculateUpdatedValue(registro.valor, diasAtraso, financialConfig);
    const mensagem = buildMessage({
      template: config.mensagem_template,
      registro,
      empresaNome,
      senderName,
      diasAtraso,
      valorAtualizado,
    });

    const phone = normalizePhone(registro.telefone || '');
    const sendStartedAt = Date.now();
    const sendResult = await sendChargeMessage(phone, mensagem, zapi);
    const sendDurationMs = Date.now() - sendStartedAt;

    // Circuit breaker recording (only for real sends)
    if (!sendResult.mocked) {
      if (sendResult.ok) {
        await recordCircuitSuccess(supabaseAdmin, config.empresa_id);
      } else {
        await recordCircuitFailure(supabaseAdmin, config.empresa_id);
      }
    }

    // Forensic audit log
    await appendAuditLog(supabaseAdmin, {
      company_id: config.empresa_id,
      action: sendResult.ok ? 'whatsapp_scheduled_sent' : 'whatsapp_scheduled_error',
      registro_id: registro.id,
      telefone: phone,
      zapi_status: sendResult.status,
      provider_message_id: sendResult.zapiMessageId ?? null,
      blocked_reason: sendResult.error ?? null,
      duration_ms: sendDurationMs,
    });

    const { error: trackingError } = await supabaseAdmin.from('cobrancas_whatsapp').insert({
      empresa_id: config.empresa_id,
      registro_id: registro.id,
      telefone: phone,
      mensagem,
      status: sendResult.status,
      zapi_message_id: sendResult.zapiMessageId,
      erro: sendResult.error,
      enviado_por: null,
    });
    if (trackingError) {
      console.log(JSON.stringify({ event: 'tracking_insert_error', registro_id: registro.id, error: trackingError.message }));
    }

    if (sendResult.ok) {
      result.sent++;
    } else {
      result.errors++;
      result.reasons.push(`Registro ${registro.id}: ${sendResult.error}`);
    }
  }

  return result;
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
    // Sempre usa service role — funciona para scheduler, Dashboard e invocações diretas.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    );

    // ── Resolução Z-API ────────────────────────────────────────────────────
    let zapi: { mocked: boolean; url: string | null; clientToken: string | null; instanceId: string | null; zapiToken: string | null };
    try {
      zapi = buildZApiUrl();
    } catch (zapiErr) {
      return jsonResponse({
        ok: false,
        error: zapiErr instanceof Error ? zapiErr.message : 'Falha ao configurar Z-API.',
      }, 500);
    }

    // ── Determinação do modo de invocação ─────────────────────────────────
    // Aceita: (1) cron via x-cron-secret, (2) service_role, (3) usuário JWT,
    //         (4) ausência de auth (Dashboard test sem configuração extra).
    const cronSecret = Deno.env.get('BILLING_CRON_SECRET') || Deno.env.get('CRON_SECRET');
    const cronHeader = req.headers.get('x-cron-secret');
    const isCronMode = !!(cronSecret && cronHeader === cronSecret);

    const authHeader = req.headers.get('Authorization') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const isServiceRoleCall = !!(serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`);

    // Sempre lê o body (pode estar presente em qualquer modo).
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    let manualEmpresaId: string | null = body?.empresa_id ? String(body.empresa_id) : null;
    const dryRun     = body?.dry_run     === true;
    // force_send=true ignora intervalo_dias e limite_cobrancas_por_titulo.
    // Útil para reenvio manual de cobranças com histórico mock ou para debug.
    const forceSend  = body?.force_send  === true;

    // ── Validação opcional de usuário JWT ─────────────────────────────────
    // Só executa quando há um Bearer token que não seja a service_role key.
    // Em caso de JWT inválido: prossegue sem userId (não bloqueia).
    if (!isCronMode && !isServiceRoleCall && authHeader.startsWith('Bearer ')) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_ANON_KEY') || '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser().catch(() => ({ data: { user: null } }));
      if (user && manualEmpresaId) {
        await assertCompanyAccess(supabaseAdmin, user.id, manualEmpresaId);
      }
    }

    // Resolve o modo para o campo `mode` na resposta.
    const executionMode = isCronMode ? 'cron' : isServiceRoleCall ? 'service_role' : 'manual';

    // ── Busca configurações ────────────────────────────────────────────────
    // - empresa_id presente no body → filtra por empresa (dry_run ou invocação direta)
    // - sem empresa_id → pega apenas ativas (modo cron / scheduler)
    let configQuery = supabaseAdmin
      .from('whatsapp_cobranca_config')
      .select('*');

    if (manualEmpresaId) {
      configQuery = configQuery.eq('empresa_id', manualEmpresaId);
    } else {
      configQuery = configQuery.eq('ativo', true);
    }

    const { data: configs, error: configError } = await configQuery;
    if (configError) {
      return jsonResponse({ ok: false, error: configError.message }, 500);
    }

    if (!configs || configs.length === 0) {
      return jsonResponse({
        ok: true,
        mocked: zapi.mocked,
        message: 'Nenhuma configuracao ativa encontrada.',
        results: [],
      });
    }

    // ── Z-API pairing gate (verifica conexão antes de processar empresas) ──
    if (!zapi.mocked) {
      const pairing = await checkZapiPairing(zapi);
      if (!pairing.connected) {
        return jsonResponse({
          ok: false,
          error: `Z-API desconectada: ${pairing.reason}`,
          mocked: false,
        }, 503);
      }
    }

    // ── Processa cada empresa ─────────────────────────────────────────────
    const results: CompanyProcessingResult[] = [];

    for (const config of configs as WhatsAppAutoConfig[]) {
      try {
        const { data: empresaRow } = await supabaseAdmin
          .from('empresas')
          .select('nome')
          .eq('id', config.empresa_id)
          .maybeSingle();

        const empresaNome = empresaRow?.nome || config.empresa_id;
        const senderName = DEFAULT_SENDER_NAME;

        const result = await processCompany(
          supabaseAdmin,
          config,
          empresaNome,
          senderName,
          dryRun,
          forceSend,
          zapi,
          config.empresa_id,
        );

        // Audit log por empresa
        await supabaseAdmin.from('audit_logs').insert({
          company_id: config.empresa_id,
          action: zapi.mocked ? 'whatsapp_scheduled_mock' : 'whatsapp_scheduled_sent',
          entity: 'cobrancas_whatsapp',
          metadata: {
            sent: result.sent,
            skipped: result.skipped,
            errors: result.errors,
            eligible: result.eligible_titles,
            mocked: zapi.mocked,
            dry_run: dryRun,
            force_send: forceSend,
            historico_detalhado_count: result.debug.historico_detalhado.length,
          },
        }).then(() => {}).catch(() => {});

        results.push(result);
      } catch (companyErr) {
        results.push({
          empresa_id: config.empresa_id,
          empresa_nome: config.empresa_id,
          eligible_titles: 0,
          sent: 0,
          skipped: 0,
          errors: 1,
          mocked: zapi.mocked,
          reasons: [companyErr instanceof Error ? companyErr.message : 'Erro desconhecido.'],
          debug: {
            empresa_id: config.empresa_id,
            total_registros_buscados: 0,
            elegiveis: 0,
            descartados: {
              sem_telefone: 0, liquidado: 0, nao_vencido: 0,
              intervalo: 0, limite: 0, parse_invalido: 0,
              empresa_diferente: 0, outros: 1,
            },
            exemplos_descartados: [],
          },
        });
      }
    }

    const totalSent   = results.reduce((s, r) => s + r.sent, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors, 0);

    return jsonResponse({
      ok: true,
      success: true,
      mocked: zapi.mocked,
      mode: executionMode,
      dry_run: dryRun,
      force_send: forceSend,
      summary: {
        empresas_processadas: results.length,
        total_sent: totalSent,
        total_errors: totalErrors,
      },
      results,
    });

  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err instanceof Error ? err.message : 'Erro interno na Edge Function.',
    }, 500);
  }
});
