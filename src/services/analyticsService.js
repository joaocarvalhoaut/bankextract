import { createScopedLogger } from './loggerService';
import { hasSupabaseConfig, supabase } from './supabaseClient';
import {
  diffInDays,
  normalizeFinancialRecord,
  normalizeMoney,
  toDate,
} from './financeNormalizers.js';

const logger = createScopedLogger('analytics');
const isPaidStatus = (status) => ['pago', 'liquidado'].includes(String(status || '').trim().toLowerCase());

const toIsoStart = (value) => {
  if (!value) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  return new Date(value).toISOString();
};

const toIsoEnd = (value) => {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
};

const buildMonthlyBuckets = (rows = [], getDate, getValue) => {
  const map = new Map();

  rows.forEach((row) => {
    const date = getDate(row);
    if (!date) return;
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const current = map.get(label) || { label, value: 0, count: 0 };
    current.value += Number(getValue(row) || 0);
    current.count += 1;
    map.set(label, current);
  });

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
};

export { normalizeFinancialRecord } from './financeNormalizers.js';

async function fetchFinancialRows(companyId) {
  if (!companyId) return [];
  if (!hasSupabaseConfig || !supabase) return [];

  const { data, error } = await supabase
    .from('registros_financeiros')
    .select('*')
    .eq('company_id', companyId);

  if (error) {
    logger.error('financial_rows_failed', error, { company_id: companyId });
    throw new Error(error.message || 'Falha ao carregar registros financeiros.');
  }

  return (data || []).map(normalizeFinancialRecord);
}

export function buildDashboardFinancialData(rows = []) {
  const normalizedRows = (rows || []).map(normalizeFinancialRecord);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let carteiraAtiva = 0;
  let emCobranca = 0;
  let vencido = 0;
  let recebido = 0;
  let cobrancasPendentes = 0;
  let totalImportedMonth = 0;
  let withPhone = 0;

  const statusDistributionMap = new Map();
  const nextDueRows = [];
  const biggestOpenRows = [];

  const agingBuckets = {
    'A vencer': 0,
    '1-7 dias': 0,
    '8-15 dias': 0,
    '16-30 dias': 0,
    '+30 dias': 0,
  };

  for (const row of normalizedRows) {
    const amount = normalizeMoney(row.valor);
    const dueDate = toDate(row.vencimento);
    const importedAt = toDate(row.importado_em);
    const paid = isPaidStatus(row.status);
    const isNegotiated = row.status === 'negociado';
    const isSuspended = row.status === 'suspenso';

    if (importedAt && importedAt >= startOfMonth) totalImportedMonth += amount;
    if (row.telefone) withPhone += 1;

    statusDistributionMap.set(row.status || 'pendente', (statusDistributionMap.get(row.status || 'pendente') || 0) + 1);

    if (paid) {
      recebido += amount;
      continue;
    }

    carteiraAtiva += amount;
    if (!isSuspended) {
      emCobranca += amount;
      cobrancasPendentes += 1;
    }

    const diff = diffInDays(row.vencimento);
    if (diff === null || diff >= 0) {
      agingBuckets['A vencer'] += amount;
      if (dueDate) nextDueRows.push(row);
    } else if (diff >= -7) {
      agingBuckets['1-7 dias'] += amount;
      vencido += amount;
    } else if (diff >= -15) {
      agingBuckets['8-15 dias'] += amount;
      vencido += amount;
    } else if (diff >= -30) {
      agingBuckets['16-30 dias'] += amount;
      vencido += amount;
    } else {
      agingBuckets['+30 dias'] += amount;
      vencido += amount;
    }

    if (!isNegotiated && !isSuspended) biggestOpenRows.push(row);
  }

  nextDueRows.sort((a, b) => (toDate(a.vencimento)?.getTime() || 0) - (toDate(b.vencimento)?.getTime() || 0));
  biggestOpenRows.sort((a, b) => b.valor - a.valor);

  return {
    hasData: normalizedRows.length > 0,
    totalRecords: normalizedRows.length,
    summary: {
      carteiraAtiva: normalizeMoney(carteiraAtiva),
      emCobranca: normalizeMoney(emCobranca),
      vencido: normalizeMoney(vencido),
      recebido: normalizeMoney(recebido),
      totalImportedMonth: normalizeMoney(totalImportedMonth),
      cobrancasPendentes,
      coverageWithPhone: normalizedRows.length ? Math.round((withPhone / normalizedRows.length) * 100) : 0,
    },
    kpis: [
      { title: 'Carteira ativa', value: normalizeMoney(carteiraAtiva), hint: `${normalizedRows.length} registro(s) no escopo atual`, tone: 'blue' },
      { title: 'Em cobranca', value: normalizeMoney(emCobranca), hint: `${cobrancasPendentes} titulo(s) pendente(s)`, tone: 'blue' },
      { title: 'Vencido', value: normalizeMoney(vencido), hint: 'Titulos com vencimento passado', tone: 'red' },
      { title: 'Recebido', value: normalizeMoney(recebido), hint: 'Status pago ou liquidado', tone: 'blue' },
      { title: 'Total de registros', value: normalizedRows.length, hint: 'Carteira consolidada', tone: 'slate' },
      { title: 'Cobrancas pendentes', value: cobrancasPendentes, hint: 'Titulos ainda nao liquidados', tone: 'amber' },
    ],
    charts: {
      aging: Object.entries(agingBuckets).map(([label, value]) => ({
        label,
        value: normalizeMoney(value),
        color:
          label === 'A vencer'
            ? '#14D8FF'
            : label === '1-7 dias'
              ? '#F59E0B'
              : label === '8-15 dias'
                ? '#FB923C'
                : label === '16-30 dias'
                  ? '#F97316'
                  : '#EF4444',
      })),
      importacoes: [
        {
          label: 'Importado no mes',
          value: normalizedRows.filter((row) => {
            const importedAt = toDate(row.importado_em);
            return importedAt && importedAt >= startOfMonth;
          }).length,
        },
        { label: 'Com telefone', value: withPhone },
        { label: 'Pendentes', value: cobrancasPendentes },
      ],
      statusDistribution: Array.from(statusDistributionMap.entries()).map(([label, count]) => ({ label, value: count })),
    },
    nextDueRows: nextDueRows.slice(0, 5),
    biggestOpenRows: biggestOpenRows.slice(0, 5),
  };
}

export async function getDashboardFinancialData(companyId, providedRows = null) {
  const rows = Array.isArray(providedRows) ? providedRows : await fetchFinancialRows(companyId);
  return buildDashboardFinancialData(rows);
}

export async function getMonthlyFinancialSummary(companyId, providedRows = null) {
  const data = await getDashboardFinancialData(companyId, providedRows);
  return {
    totalImportedMonth: data.summary.totalImportedMonth,
    totalOpen: data.summary.carteiraAtiva,
    totalOverdue: data.summary.vencido,
    totalReceived: data.summary.recebido,
  };
}

export async function getBillingAutomationStats(companyId, period = {}) {
  if (!companyId) {
    return { sentCharges: 0, simulatedCharges: 0, recoveryRate: 0, errors: 0 };
  }

  if (!hasSupabaseConfig || !supabase) {
    return { sentCharges: 0, simulatedCharges: 0, recoveryRate: 0, errors: 0 };
  }

  const start = toIsoStart(period.start);
  const end = toIsoEnd(period.end);
  const { data, error } = await supabase
    .from('logs_cobranca')
    .select('status_envio, data_hora, erro')
    .eq('company_id', companyId)
    .gte('data_hora', start)
    .lte('data_hora', end);

  if (error) {
    logger.error('billing_stats_failed', error, { company_id: companyId, period: { start, end } });
    throw new Error(error.message || 'Falha ao carregar estatisticas de cobranca.');
  }

  const logs = data || [];
  const simulatedStatuses = new Set(['sucesso_simulado', 'simulado', 'preparado_manual']);
  const successStatuses = new Set(['sucesso', 'enviado']);

  const simulatedCharges = logs.filter((item) => simulatedStatuses.has(String(item.status_envio || '').toLowerCase())).length;
  const sentCharges = logs.filter((item) => successStatuses.has(String(item.status_envio || '').toLowerCase())).length;
  const errors = logs.filter((item) => Boolean(item.erro) || String(item.status_envio || '').toLowerCase().includes('erro')).length;

  return {
    sentCharges,
    simulatedCharges,
    recoveryRate: sentCharges > 0 ? Math.round((sentCharges / Math.max(sentCharges + errors, 1)) * 100) : 0,
    errors,
  };
}

export async function getReceivablesAging(companyId, providedRows = null) {
  const data = await getDashboardFinancialData(companyId, providedRows);
  return data.charts.aging;
}

export async function getOperationalAnalytics(companyId, filters = {}) {
  if (!companyId) {
    return {
      filtersApplied: filters,
      kpis: [],
      timeline: [],
      usageByCompany: [],
      aiContext: {},
      health: { connection: 'idle' },
    };
  }

  if (!hasSupabaseConfig || !supabase) {
    return {
      filtersApplied: filters,
      cards: [
        { id: 'recovery-rate', label: 'Taxa de recuperacao', value: 0, suffix: '%', tone: 'blue' },
        { id: 'default-rate', label: 'Inadimplencia', value: 0, suffix: '%', tone: 'blue' },
        { id: 'charges-sent', label: 'Cobrancas enviadas', value: 0, tone: 'blue' },
        { id: 'charges-paid', label: 'Cobrancas pagas', value: 0, tone: 'blue' },
      ],
      summary: {
        totalOpenValue: 0,
        overdueValue: 0,
        totalRecoveredValue: 0,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
        totalWhatsapp: 0,
        importsCount: 0,
        importedRecords: 0,
        avgReadMinutes: 0,
      },
      usageByCompany: [],
      timeline: [],
      health: { connection: 'idle', message: 'Aguardando configuracao do Supabase.' },
      aiContext: {},
    };
  }

  const start = toIsoStart(filters.startDate);
  const end = toIsoEnd(filters.endDate);
  logger.info('operational_analytics_requested', { company_id: companyId, start, end });

  const [
    { data: financialData, error: financialError },
    { data: chargeLogs, error: chargeError },
    { data: whatsappData, error: whatsappError },
    { data: importsData, error: importError },
    { data: usageRows, error: usageError },
  ] = await Promise.all([
    supabase
      .from('registros_financeiros')
      .select('id, company_id, cliente_nome, cliente_fornecedor, valor, vencimento, status, created_at, importado_em')
      .eq('company_id', companyId),
    supabase
      .from('logs_cobranca')
      .select('id, company_id, financeiro_id, status_envio, erro, created_at, data_hora')
      .eq('company_id', companyId)
      .gte('data_hora', start)
      .lte('data_hora', end),
    supabase
      .from('cobrancas_whatsapp')
      .select('id, company_id, registro_id, status, sent_at, delivered_at, read_at, failed_at, failure_reason, simulated, created_at')
      .eq('company_id', companyId)
      .gte('created_at', start)
      .lte('created_at', end),
    supabase
      .from('importacoes')
      .select('id, company_id, created_at, total_registros, status')
      .eq('company_id', companyId)
      .gte('created_at', start)
      .lte('created_at', end),
    supabase
      .from('usage_counters')
      .select('company_id, period_start, period_end, real_sends_count, simulated_sends_count, automatic_sends_count, manual_sends_count, imports_month, charges_month, automations_month, users_count')
      .eq('company_id', companyId)
      .order('period_start', { ascending: true })
      .limit(12),
  ]);

  if (financialError) throw new Error(financialError.message || 'Falha ao carregar base financeira para analytics.');
  if (chargeError) throw new Error(chargeError.message || 'Falha ao carregar logs de cobranca para analytics.');
  if (whatsappError) throw new Error(whatsappError.message || 'Falha ao carregar tracking WhatsApp para analytics.');
  if (importError) throw new Error(importError.message || 'Falha ao carregar importacoes para analytics.');
  if (usageError) throw new Error(usageError.message || 'Falha ao carregar uso da empresa para analytics.');

  const rows = (financialData || []).map(normalizeFinancialRecord);
  const openRows = rows.filter((row) => !isPaidStatus(row.status));
  const paidRows = rows.filter((row) => isPaidStatus(row.status));
  const overdueRows = openRows.filter((row) => diffInDays(row.vencimento) < 0);
  const totalOpenValue = openRows.reduce((sum, row) => sum + normalizeMoney(row.valor), 0);
  const totalRecoveredValue = paidRows.reduce((sum, row) => sum + normalizeMoney(row.valor), 0);
  const overdueValue = overdueRows.reduce((sum, row) => sum + normalizeMoney(row.valor), 0);

  const logs = chargeLogs || [];
  const whatsapp = whatsappData || [];
  const imports = importsData || [];
  const usageTimeline = usageRows || [];

  const sentCount = whatsapp.filter((row) => ['sent', 'queued', 'delivered', 'read'].includes(String(row.status || '').toLowerCase())).length;
  const deliveredCount = whatsapp.filter((row) => String(row.status || '').toLowerCase() === 'delivered').length;
  const readCount = whatsapp.filter((row) => String(row.status || '').toLowerCase() === 'read').length;
  const failedCount = whatsapp.filter((row) => String(row.status || '').toLowerCase() === 'failed').length;
  const totalWhatsapp = whatsapp.length;
  const totalAutomationLogs = logs.filter((row) => String(row.status_envio || '').toLowerCase().includes('auto')).length;
  const successLogs = logs.filter((row) => ['sucesso', 'enviado', 'sucesso_simulado', 'simulado'].includes(String(row.status_envio || '').toLowerCase())).length;
  const errorLogs = logs.filter((row) => Boolean(row.erro) || String(row.status_envio || '').toLowerCase().includes('erro')).length;
  const importsCount = imports.length;
  const importedRecords = imports.reduce((sum, item) => sum + Number(item.total_registros || 0), 0);

  const averageReadTimeMs = whatsapp
    .filter((row) => row.sent_at && row.read_at)
    .map((row) => new Date(row.read_at).getTime() - new Date(row.sent_at).getTime())
    .filter((value) => Number.isFinite(value) && value >= 0);

  const avgReadMinutes = averageReadTimeMs.length
    ? Math.round(averageReadTimeMs.reduce((sum, item) => sum + item, 0) / averageReadTimeMs.length / 60000)
    : 0;

  const timeline = buildMonthlyBuckets(
    [
      ...imports.map((row) => ({ type: 'import', ...row, metric_value: Number(row.total_registros || 0) })),
      ...whatsapp.map((row) => ({ type: 'whatsapp', ...row, metric_value: 1 })),
      ...rows.map((row) => ({ type: 'finance', ...row, metric_value: normalizeMoney(row.valor) })),
    ],
    (row) => toDate(row.created_at || row.importado_em || row.sent_at || row.read_at),
    (row) => row.metric_value
  );

  const cards = [
    { id: 'recovery-rate', label: 'Taxa de recuperacao', value: openRows.length + paidRows.length ? Math.round((paidRows.length / Math.max(openRows.length + paidRows.length, 1)) * 100) : 0, suffix: '%', tone: 'blue' },
    { id: 'default-rate', label: 'Inadimplencia', value: rows.length ? Math.round((overdueRows.length / Math.max(rows.length, 1)) * 100) : 0, suffix: '%', tone: overdueRows.length ? 'warning' : 'blue' },
    { id: 'charges-sent', label: 'Cobrancas enviadas', value: sentCount, tone: 'blue' },
    { id: 'charges-paid', label: 'Cobrancas pagas', value: paidRows.length, tone: 'blue' },
    { id: 'amount-recovered', label: 'Valor recuperado', value: totalRecoveredValue, currency: true, tone: 'blue' },
    { id: 'whatsapp-success', label: 'Sucesso WhatsApp', value: totalWhatsapp ? Math.round(((deliveredCount + readCount) / totalWhatsapp) * 100) : 0, suffix: '%', tone: failedCount ? 'warning' : 'blue' },
    { id: 'automation-performance', label: 'Performance automacoes', value: totalAutomationLogs ? Math.round((successLogs / Math.max(totalAutomationLogs, 1)) * 100) : 0, suffix: '%', tone: 'blue' },
    { id: 'conversion-automation', label: 'Conversao por automacao', value: sentCount ? Math.round((paidRows.length / Math.max(sentCount, 1)) * 100) : 0, suffix: '%', tone: 'blue' },
  ];

  void errorLogs;

  return {
    filtersApplied: { startDate: start, endDate: end },
    cards,
    summary: {
      totalOpenValue,
      overdueValue,
      totalRecoveredValue,
      sentCount,
      deliveredCount,
      readCount,
      failedCount,
      totalWhatsapp,
      importsCount,
      importedRecords,
      avgReadMinutes,
    },
    usageByCompany: [
      { label: 'Envios', value: usageTimeline.reduce((sum, item) => sum + Number(item.real_sends_count || 0), 0) },
      { label: 'Automacoes', value: usageTimeline.reduce((sum, item) => sum + Number(item.automations_month || 0), 0) },
      { label: 'Importacoes', value: usageTimeline.reduce((sum, item) => sum + Number(item.imports_month || 0), 0) },
      { label: 'Usuarios', value: usageTimeline[usageTimeline.length - 1]?.users_count || 0 },
    ],
    timeline,
    health: {
      connection: failedCount > 0 ? 'attention' : sentCount > 0 ? 'healthy' : 'idle',
      message:
        failedCount > 0
          ? 'Existem falhas operacionais recentes para revisar.'
          : sentCount > 0
            ? 'Fluxo operacional com sinais saudaveis.'
            : 'Aguardando atividade suficiente para leitura operacional.',
    },
    aiContext: {
      overdueCount: overdueRows.length,
      overdueValue,
      whatsappSuccessRate: totalWhatsapp ? Math.round(((deliveredCount + readCount) / totalWhatsapp) * 100) : 0,
      automationCount: totalAutomationLogs,
      manualVsAutomatic: {
        manual: usageTimeline.reduce((sum, item) => sum + Number(item.manual_sends_count || 0), 0),
        automatic: usageTimeline.reduce((sum, item) => sum + Number(item.automatic_sends_count || 0), 0),
      },
      avgReadMinutes,
    },
  };
}

export async function getCompanyAnalytics(companyId, providedRows = null) {
  if (!companyId && !Array.isArray(providedRows)) {
    return {
      cards: [],
      summary: {
        totalImportedMonth: 0,
        totalOpen: 0,
        totalOverdue: 0,
        totalReceived: 0,
      },
      billing: {
        sentCharges: 0,
        simulatedCharges: 0,
        recoveryRate: 0,
        errors: 0,
      },
      aging: [],
      activeCompanies: 0,
      activeUsers: 0,
      hasData: false,
      nextDueRows: [],
      biggestOpenRows: [],
      statusDistribution: [],
      operational: {
        cards: [],
        timeline: [],
        usageByCompany: [],
        health: { connection: 'idle' },
        aiContext: {},
      },
    };
  }

  const [dashboard, billing, operational] = await Promise.all([
    getDashboardFinancialData(companyId, providedRows),
    getBillingAutomationStats(companyId),
    companyId ? getOperationalAnalytics(companyId) : Promise.resolve(null),
  ]);

  let activeUsers = 0;
  let activeCompanies = 1;

  if (hasSupabaseConfig && supabase && companyId) {
    const [{ count: usersCount }, { count: activeCompaniesCount }] = await Promise.all([
      supabase.from('usuarios_empresas').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase.from('subscriptions').select('company_id', { count: 'exact', head: true }).in('status', ['active', 'trialing']),
    ]);

    activeUsers = usersCount || 0;
    activeCompanies = activeCompaniesCount || 0;
  }

  return {
    summary: {
      totalImportedMonth: dashboard.summary.totalImportedMonth,
      totalOpen: dashboard.summary.carteiraAtiva,
      totalOverdue: dashboard.summary.vencido,
      totalReceived: dashboard.summary.recebido,
    },
    billing,
    aging: dashboard.charts.aging,
    statusDistribution: dashboard.charts.statusDistribution,
    nextDueRows: dashboard.nextDueRows,
    biggestOpenRows: dashboard.biggestOpenRows,
    activeCompanies,
    activeUsers,
    hasData: dashboard.hasData,
    operational,
    cards: [
      { id: 'em-aberto', label: 'Em aberto', value: dashboard.summary.carteiraAtiva, tone: 'slate' },
      { id: 'vencido', label: 'Vencido', value: dashboard.summary.vencido, tone: 'red' },
      { id: 'recebido', label: 'Recebido', value: dashboard.summary.recebido, tone: 'blue' },
      { id: 'cobrancas-mes', label: 'Cobrancas do mes', value: billing.simulatedCharges + billing.sentCharges, tone: 'blue' },
    ],
  };
}

export default {
  normalizeFinancialRecord,
  buildDashboardFinancialData,
  getDashboardFinancialData,
  getCompanyAnalytics,
  getMonthlyFinancialSummary,
  getBillingAutomationStats,
  getReceivablesAging,
  getOperationalAnalytics,
};
