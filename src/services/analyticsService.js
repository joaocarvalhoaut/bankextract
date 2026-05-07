import { hasSupabaseConfig, supabase } from './supabaseClient';
import {
  diffInDays,
  normalizeFinancialRecord,
  normalizeMoney,
  toDate,
} from './financeNormalizers.js';

const isPaidStatus = (status) => ['pago', 'liquidado'].includes(String(status || '').trim().toLowerCase());

const startOfMonthIso = () => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), 1);
  return date.toISOString();
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

    if (importedAt && importedAt >= startOfMonth) {
      totalImportedMonth += amount;
    }

    if (row.telefone) {
      withPhone += 1;
    }

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
      if (dueDate) {
        nextDueRows.push(row);
      }
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

    if (!isNegotiated && !isSuspended) {
      biggestOpenRows.push(row);
    }
  }

  nextDueRows.sort((a, b) => {
    const aDate = toDate(a.vencimento)?.getTime() || 0;
    const bDate = toDate(b.vencimento)?.getTime() || 0;
    return aDate - bDate;
  });

  biggestOpenRows.sort((a, b) => b.valor - a.valor);

  const statusDistribution = Array.from(statusDistributionMap.entries()).map(([label, count]) => ({
    label,
    value: count,
  }));

  const aging = Object.entries(agingBuckets).map(([label, value]) => ({
    label,
    value: normalizeMoney(value),
    color:
      label === 'A vencer'
        ? '#10b981'
        : label === '1-7 dias'
          ? '#f59e0b'
          : label === '8-15 dias'
            ? '#fb923c'
            : label === '16-30 dias'
              ? '#f97316'
              : '#ef4444',
  }));

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
      {
        title: 'Carteira ativa',
        value: normalizeMoney(carteiraAtiva),
        hint: `${normalizedRows.length} registro(s) no escopo atual`,
        tone: 'emerald',
      },
      {
        title: 'Em cobranca',
        value: normalizeMoney(emCobranca),
        hint: `${cobrancasPendentes} titulo(s) pendente(s)`,
        tone: 'blue',
      },
      {
        title: 'Vencido',
        value: normalizeMoney(vencido),
        hint: 'Titulos com vencimento passado',
        tone: 'red',
      },
      {
        title: 'Recebido',
        value: normalizeMoney(recebido),
        hint: 'Status pago ou liquidado',
        tone: 'emerald',
      },
      {
        title: 'Total de registros',
        value: normalizedRows.length,
        hint: 'Carteira consolidada',
        tone: 'slate',
      },
      {
        title: 'Cobrancas pendentes',
        value: cobrancasPendentes,
        hint: 'Titulos ainda nao liquidados',
        tone: 'amber',
      },
    ],
    charts: {
      aging,
      importacoes: [
        {
          label: 'Importado no mes',
          value: normalizedRows.filter((row) => {
            const importedAt = toDate(row.importado_em);
            return importedAt && importedAt >= startOfMonth;
          }).length,
        },
        {
          label: 'Com telefone',
          value: withPhone,
        },
        {
          label: 'Pendentes',
          value: cobrancasPendentes,
        },
      ],
      statusDistribution,
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

export async function getBillingAutomationStats(companyId) {
  if (!companyId) {
    return {
      sentCharges: 0,
      simulatedCharges: 0,
      recoveryRate: 0,
      errors: 0,
    };
  }

  if (!hasSupabaseConfig || !supabase) {
    return {
      sentCharges: 0,
      simulatedCharges: 0,
      recoveryRate: 0,
      errors: 0,
    };
  }

  const { data, error } = await supabase
    .from('logs_cobranca')
    .select('status_envio, data_hora, erro')
    .eq('company_id', companyId)
    .gte('data_hora', startOfMonthIso());

  if (error) {
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
    };
  }

  const [dashboard, billing] = await Promise.all([
    getDashboardFinancialData(companyId, providedRows),
    getBillingAutomationStats(companyId),
  ]);

  let activeUsers = 0;
  let activeCompanies = 1;

  if (hasSupabaseConfig && supabase && companyId) {
    const [{ count: usersCount }, { count: activeCompaniesCount }] = await Promise.all([
      supabase.from('usuarios_empresas').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase.from('company_subscriptions').select('company_id', { count: 'exact', head: true }).in('status', ['active', 'trialing']),
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
    cards: [
      { id: 'em-aberto', label: 'Em aberto', value: dashboard.summary.carteiraAtiva, tone: 'slate' },
      { id: 'vencido', label: 'Vencido', value: dashboard.summary.vencido, tone: 'red' },
      { id: 'recebido', label: 'Recebido', value: dashboard.summary.recebido, tone: 'emerald' },
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
};
