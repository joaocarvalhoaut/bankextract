import { getBillingHistory, getBillingInconsistencies, getBoletoSyncReport } from './billingAutomationService';
import { getGoogleSheetsStatus } from './googleSheetsService';
import { supabase, hasSupabaseConfig } from './supabaseClient';

function sinceIso(days = 7) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function safePct(part, total) {
  if (!total) return 0;
  return Math.round((Number(part || 0) / Number(total || 0)) * 100);
}

function avg(values = []) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function toDurationMs(start, end) {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  return endMs - startMs;
}

function includesAny(haystack, needles = []) {
  const normalized = lower(haystack);
  return needles.some((needle) => normalized.includes(lower(needle)));
}

function summarizePayload(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function getWhatsAppMetrics(days = 30) {
  if (!hasSupabaseConfig || !supabase) return null;

  const { data, error } = await supabase
    .from('cobrancas_whatsapp')
    .select('id, status, empresa_id, created_at, sent_at, delivered_at, read_at, failed_at, failure_reason, provider_message_id, simulated')
    .gte('created_at', sinceIso(days))
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) throw new Error(error.message || 'Falha ao carregar metricas do WhatsApp.');

  const rows = data || [];
  const total = rows.length;
  const deliveredStatuses = new Set(['enviado', 'sent', 'delivered', 'read', 'mock_enviado', 'simulated']);
  const errorStatuses = new Set(['erro', 'falha', 'failed', 'error', 'timeout']);
  const pendingStatuses = new Set(['pending', 'enviando', 'processing']);

  const sentLatencies = [];
  const readLatencies = [];
  const byCompany = new Map();

  for (const row of rows) {
    const companyId = row.empresa_id || 'sem_empresa';
    const status = lower(row.status);
    const isSuccess = deliveredStatuses.has(status);
    const isFailed = errorStatuses.has(status);
    const isTimeout = includesAny(row.failure_reason || status, ['timeout', 'timed out']);

    const sentMs = toDurationMs(row.created_at, row.sent_at);
    const readMs = toDurationMs(row.sent_at, row.read_at);
    if (sentMs != null) sentLatencies.push(sentMs);
    if (readMs != null) readLatencies.push(readMs);

    const current = byCompany.get(companyId) || {
      empresa_id: companyId,
      total: 0,
      enviado: 0,
      falha: 0,
      pending: 0,
      timeouts: 0,
      last_event_at: row.created_at || null,
    };

    current.total += 1;
    if (isSuccess) current.enviado += 1;
    if (isFailed) current.falha += 1;
    if (pendingStatuses.has(status)) current.pending += 1;
    if (isTimeout) current.timeouts += 1;
    current.last_event_at = current.last_event_at && row.created_at && current.last_event_at > row.created_at
      ? current.last_event_at
      : (row.created_at || current.last_event_at);
    byCompany.set(companyId, current);
  }

  const enviado = rows.filter((row) => ['enviado', 'sent', 'delivered', 'read'].includes(lower(row.status))).length;
  const mockEnviado = rows.filter((row) => ['mock_enviado', 'simulated'].includes(lower(row.status))).length;
  const falha = rows.filter((row) => errorStatuses.has(lower(row.status))).length;
  const pending = rows.filter((row) => pendingStatuses.has(lower(row.status))).length;
  const delivered = rows.filter((row) => Boolean(row.delivered_at)).length;
  const read = rows.filter((row) => Boolean(row.read_at)).length;
  const timeouts = rows.filter((row) => includesAny(row.failure_reason || row.status, ['timeout', 'timed out'])).length;
  const rateLimited = rows.filter((row) => includesAny(row.failure_reason, ['rate limit', '429', 'too many requests'])).length;

  const recentErrors = rows
    .filter((row) => errorStatuses.has(lower(row.status)))
    .slice(0, 25)
    .map((row) => ({
      id: row.id,
      empresa_id: row.empresa_id,
      erro: row.failure_reason || row.status || 'Erro desconhecido',
      created_at: row.failed_at || row.created_at,
      status: row.status,
    }));

  return {
    total,
    enviado,
    mockEnviado,
    falha,
    pending,
    delivered,
    read,
    taxaSucesso: safePct(enviado + mockEnviado, total),
    avgSendLatencyMs: avg(sentLatencies),
    avgReadLatencyMs: avg(readLatencies),
    timeouts,
    rateLimited,
    byCompany: Array.from(byCompany.values())
      .map((row) => ({
        ...row,
        taxaSucesso: safePct(row.enviado, row.total),
      }))
      .sort((a, b) => b.total - a.total),
    recentErrors,
  };
}

async function getDispatchMetrics(days = 30) {
  if (!hasSupabaseConfig || !supabase) return null;

  const { data, error } = await supabase
    .from('automation_dispatches')
    .select('*')
    .gte('created_at', sinceIso(days))
    .order('created_at', { ascending: false })
    .limit(1500);

  if (error) throw new Error(error.message || 'Falha ao carregar dispatches.');

  const rows = data || [];
  const now = Date.now();
  const recent = rows.slice(0, 30).map((row) => ({
    id: row.id,
    company_id: row.company_id || row.empresa_id || '',
    status: row.status || 'unknown',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    retry_count: Number(row.retry_count || 0),
    next_retry_at: row.next_retry_at || null,
    request_id: row.request_id || row.metadata?.request_id || '',
    correlation_id: row.correlation_id || row.metadata?.correlation_id || '',
    idempotency_key: row.idempotency_key || row.metadata?.idempotency_key || '',
    payload: row.payload || row.request_payload || row.metadata?.payload || null,
    response: row.response || row.response_payload || row.metadata?.response || null,
    error: row.error || row.last_error || row.metadata?.error || null,
  }));

  const completed = rows.filter((row) => ['completed', 'ok', 'success'].includes(lower(row.status))).length;
  const deduplicados = rows.filter((row) => ['duplicate', 'deduped', 'ignored_duplicate'].includes(lower(row.status))).length;
  const processing = rows.filter((row) => ['processing', 'running'].includes(lower(row.status))).length;
  const pending = rows.filter((row) => ['pending', 'queued', 'scheduled'].includes(lower(row.status))).length;
  const failed = rows.filter((row) => ['failed', 'error', 'timeout'].includes(lower(row.status))).length;
  const retriesExecuted = rows.reduce((sum, row) => sum + Math.max(0, Number(row.retry_count || 0)), 0);
  const timeouts = rows.filter((row) => includesAny(`${row.status} ${summarizePayload(row.error)} ${summarizePayload(row.response)}`, ['timeout', 'timed out'])).length;
  const rateLimited = rows.filter((row) => includesAny(`${summarizePayload(row.error)} ${summarizePayload(row.response)}`, ['rate limit', '429', 'too many requests'])).length;
  const stuckProcessing = rows.filter((row) => {
    const status = lower(row.status);
    const createdAt = new Date(row.created_at || row.updated_at || 0).getTime();
    return ['processing', 'running'].includes(status) && createdAt > 0 && now - createdAt > 15 * 60 * 1000;
  }).length;

  return {
    total: rows.length,
    completed,
    deduplicados,
    processing,
    pending,
    failed,
    retriesExecuted,
    timeouts,
    rateLimited,
    stuckProcessing,
    latestAt: rows[0]?.created_at || null,
    recent,
  };
}

async function getAuditMetrics(days = 7) {
  if (!hasSupabaseConfig || !supabase) return null;

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .gte('created_at', sinceIso(days))
    .order('created_at', { ascending: false })
    .limit(800);

  if (error) throw new Error(error.message || 'Falha ao carregar auditoria operacional.');

  const rows = data || [];
  const normalized = rows.map((row) => {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    return {
      ...row,
      metadata,
      action_normalized: lower(row.action),
      severity_normalized: lower(row.severity || metadata.severity || 'info'),
      request_id: row.request_id || metadata.request_id || '',
      correlation_id: row.correlation_id || metadata.correlation_id || '',
    };
  });

  const errors = normalized.filter((row) =>
    ['danger', 'error', 'critical'].includes(String(row.severity || '').toLowerCase()) ||
    ['error', 'erro', 'failed', 'falha'].some((term) => String(row.action || '').toLowerCase().includes(term))
  );

  return {
    total: normalized.length,
    errors: errors.length,
    recentEvents: normalized.slice(0, 30),
  };
}

// ── Active automation configs ─────────────────────────────────────────────────

async function getAutomationConfigs() {
  if (!hasSupabaseConfig || !supabase) return [];

  const [configsResult, companiesResult] = await Promise.all([
    supabase
      .from('whatsapp_cobranca_config')
      .select('empresa_id, ativo, hora_envio, intervalo_dias, limite_cobrancas_por_titulo, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase.from('empresas').select('id, nome').limit(200),
  ]);

  if (configsResult.error) throw new Error(configsResult.error.message || 'Falha ao carregar configs de automacao.');

  const companyMap = new Map((companiesResult.data || []).map((c) => [c.id, c.nome]));

  return (configsResult.data || []).map((cfg) => ({
    empresa_id: cfg.empresa_id,
    empresa_nome: companyMap.get(cfg.empresa_id) || cfg.empresa_id,
    ativo: cfg.ativo,
    hora_envio: cfg.hora_envio || '08:00',
    intervalo_dias: cfg.intervalo_dias || 5,
    limite_cobrancas_por_titulo: cfg.limite_cobrancas_por_titulo || 4,
    updated_at: cfg.updated_at,
  }));
}

// ── Tenant overview ───────────────────────────────────────────────────────────

async function getTenantOverview() {
  if (!hasSupabaseConfig || !supabase) return null;

  const [companiesResult, subscriptionsResult] = await Promise.all([
    supabase.from('empresas').select('id, nome, subscription_status, created_at').order('created_at', { ascending: false }).limit(200),
    supabase.from('company_subscriptions').select('company_id, status, plan_code').limit(200),
  ]);

  if (companiesResult.error) throw new Error(companiesResult.error.message || 'Falha ao carregar empresas.');

  const subMap = new Map((subscriptionsResult.data || []).map((s) => [s.company_id, s]));
  const companies = (companiesResult.data || []).map((c) => {
    const sub = subMap.get(c.id);
    return {
      id: c.id,
      nome: c.nome,
      status: sub?.status || c.subscription_status || 'trialing',
      plan_code: sub?.plan_code || 'starter',
    };
  });

  const active = companies.filter((c) => c.status === 'active').length;
  const trialing = companies.filter((c) => c.status === 'trialing').length;
  const blocked = companies.filter((c) => ['past_due', 'canceled'].includes(c.status)).length;

  return { total: companies.length, active, trialing, blocked, companies };
}

async function getIntegrationMetrics() {
  if (!hasSupabaseConfig || !supabase) return null;

  const [zapiResult, sheetsResult, subscriptionsResult] = await Promise.all([
    supabase
      .from('platform_integrations')
      .select('provider, connected')
      .eq('provider', 'zapi')
      .limit(1),
    supabase
      .from('google_sheets_config')
      .select('empresa_id, ativo, spreadsheet_id, sheet_name, last_source_sync_status, last_source_sync_error')
      .limit(500),
    supabase
      .from('company_subscriptions')
      .select('company_id, status')
      .limit(500),
  ]);

  if (zapiResult.error) throw new Error(zapiResult.error.message || 'Falha ao carregar integracoes Z-API.');
  if (sheetsResult.error) throw new Error(sheetsResult.error.message || 'Falha ao carregar integracoes Google Sheets.');
  if (subscriptionsResult.error) throw new Error(subscriptionsResult.error.message || 'Falha ao carregar assinaturas.');

  const zapiConnected = (zapiResult.data || []).filter((row) => Boolean(row.connected)).length;
  const googleSheetsConnected = (sheetsResult.data || []).filter(
    (row) => Boolean(row.ativo) && Boolean(row.spreadsheet_id) && Boolean(row.sheet_name)
  ).length;
  const googleSheetsErrors = (sheetsResult.data || []).filter(
    (row) => lower(row.last_source_sync_status) === 'error' || Boolean(row.last_source_sync_error)
  ).length;
  const driveReady = (sheetsResult.data || []).filter((row) => Boolean(row.spreadsheet_id) && Boolean(row.sheet_name)).length;
  const stripeActive = (subscriptionsResult.data || []).filter((row) => lower(row.status) === 'active').length;
  const stripeFailing = (subscriptionsResult.data || []).filter((row) => ['past_due', 'canceled', 'unpaid'].includes(lower(row.status))).length;

  return {
    zapiConnected,
    googleSheetsConnected,
    googleSheetsErrors,
    driveReady,
    stripeActive,
    stripeFailing,
  };
}

export async function getOperationalCompanyDrilldown(companyId) {
  if (!companyId) {
    return {
      drive: {
        encontrados: 0,
        conflitos: 0,
        naoEncontrados: 0,
        baixaConfianca: 0,
        erros: 0,
      },
      integrations: {
        zapiConnected: false,
        googleSheetsLabel: 'Nao configurado',
        googleSheetsLastSyncAt: '',
        googleSheetsLastSyncError: '',
      },
      recentHistory: [],
      inconsistencies: [],
    };
  }

  const [reportResult, inconsistenciesResult, historyResult, zapiResult, sheetsResult] = await Promise.allSettled([
    getBoletoSyncReport(companyId),
    getBillingInconsistencies(companyId, {}),
    getBillingHistory(companyId, {}, { page: 1, page_size: 10 }),
    supabase
      .from('platform_integrations')
      .select('provider, connected, phone_number')
      .eq('provider', 'zapi')
      .maybeSingle(),
    getGoogleSheetsStatus(companyId),
  ]);

  const report = reportResult.status === 'fulfilled' ? reportResult.value : {};
  const inconsistencies = inconsistenciesResult.status === 'fulfilled'
    ? (inconsistenciesResult.value?.items || inconsistenciesResult.value?.rows || inconsistenciesResult.value?.data || [])
    : [];
  const history = historyResult.status === 'fulfilled'
    ? (historyResult.value?.items || historyResult.value?.rows || historyResult.value?.data || historyResult.value?.registros || [])
    : [];
  const zapi = zapiResult.status === 'fulfilled' ? zapiResult.value?.data || zapiResult.value : null;
  const sheets = sheetsResult.status === 'fulfilled' ? sheetsResult.value : null;

  return {
    drive: {
      encontrados: Number(report?.summary?.encontrados ?? report?.encontrados ?? 0),
      conflitos: Number(report?.summary?.conflitos ?? report?.conflitos ?? inconsistencies.filter((item) => includesAny(item?.status || item?.motivo || item?.descricao, ['conflito']).length)),
      naoEncontrados: Number(report?.summary?.nao_encontrados ?? report?.nao_encontrados ?? report?.summary?.naoEncontrados ?? 0),
      baixaConfianca: Number(report?.summary?.baixa_confianca ?? report?.baixa_confianca ?? report?.summary?.baixaConfianca ?? 0),
      erros: Number(report?.summary?.erros ?? report?.erros ?? 0),
    },
    integrations: {
      zapiConnected: Boolean(zapi?.connected),
      googleSheetsLabel: sheets?.label || 'Nao configurado',
      googleSheetsLastSyncAt: sheets?.last_source_sync_at || '',
      googleSheetsLastSyncError: sheets?.last_source_sync_error || '',
    },
    recentHistory: Array.isArray(history) ? history : [],
    inconsistencies: Array.isArray(inconsistencies) ? inconsistencies : [],
  };
}

// ── Main aggregator ───────────────────────────────────────────────────────────

/**
 * Load all operational metrics in parallel.
 * @param {{ days: number }} options
 */
export async function getOperationalMetrics({ days = 30 } = {}) {
  const [whatsappResult, dispatchResult, auditResult, automationResult, tenantResult, integrationsResult] = await Promise.allSettled([
    getWhatsAppMetrics(days),
    getDispatchMetrics(days),
    getAuditMetrics(Math.min(days, 7)),
    getAutomationConfigs(),
    getTenantOverview(),
    getIntegrationMetrics(),
  ]);

  const settle = (r, fallback = null) => (r.status === 'fulfilled' ? r.value : fallback);

  return {
    whatsapp: settle(whatsappResult),
    dispatches: settle(dispatchResult),
    audit: settle(auditResult),
    automations: settle(automationResult, []),
    tenants: settle(tenantResult),
    integrations: settle(integrationsResult),
    loadedAt: new Date().toISOString(),
    days,
    errors: [whatsappResult, dispatchResult, auditResult, automationResult, tenantResult, integrationsResult]
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason?.message || String(r.reason)),
  };
}

export async function toggleAutomationActive(empresaId, ativo) {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase nao configurado.');

  const { error } = await supabase
    .from('whatsapp_cobranca_config')
    .update({ ativo: Boolean(ativo), updated_at: new Date().toISOString() })
    .eq('empresa_id', empresaId);

  if (error) throw new Error(error.message || 'Falha ao atualizar automacao.');
}
