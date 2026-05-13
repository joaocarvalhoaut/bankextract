import { getPlanMeta, normalizePlanId } from '../constants/plans';
import { syncUsageAlertNotification } from './notificationService';
import { hasSupabaseConfig, supabase } from './supabaseClient';

const STORAGE_KEY = 'bankextract.usage-counters.mock';

const DEFAULT_LIMITS_BY_PLAN = {
  starter: {
    charges_month: 500,
    imports_month: 50,
    automations_month: 100,
    users_count: 2,
    companies_count: 1,
    integrations_count: 2,
  },
  pro: {
    charges_month: 2000,
    imports_month: 300,
    automations_month: 500,
    users_count: 3,
    companies_count: 1,
    integrations_count: 4,
  },
  business: {
    charges_month: 10000,
    imports_month: 2000,
    automations_month: 2000,
    users_count: 10,
    companies_count: 3,
    integrations_count: 10,
  },
};

const DEFAULT_COUNTERS = {
  real_sends_count: 0,
  simulated_sends_count: 0,
  manual_sends_count: 0,
  automatic_sends_count: 0,
  extra_send_credits: 0,
  monthly_send_limit: 0,
  company_count: 1,
  record_count: 0,
  imports_month: 0,
  charges_month: 0,
  automations_month: 0,
  users_count: 1,
  integrations_count: 0,
  companies_count: 1,
};

const METRIC_ORDER = ['charges_month', 'imports_month', 'automations_month', 'users_count', 'integrations_count', 'companies_count'];

const METRIC_LABELS = {
  charges_month: 'Cobrancas',
  imports_month: 'Importacoes',
  automations_month: 'Automacoes',
  users_count: 'Usuarios',
  integrations_count: 'Integracoes',
  companies_count: 'Empresas',
};

const readMockStore = () => {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeMockStore = (nextValue) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextValue));
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const getFallbackPeriodRange = () => {
  const start = startOfToday();
  start.setDate(1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const toIsoDate = (value) => new Date(value).toISOString().slice(0, 10);

const buildPeriodKey = (periodStart, periodEnd) => `${periodStart}::${periodEnd}`;

const normalizeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const buildAlertForMetric = (metric) => {
  const percent = Number(metric.percent || 0);
  if (percent >= 100) {
    return {
      level: 'danger',
      title: 'Limite mensal atingido',
      message: 'Limite mensal atingido. Considere upgrade.',
    };
  }
  if (percent >= 95) {
    return {
      level: 'danger',
      title: 'Seu plano esta proximo do limite mensal',
      message: 'Seu plano esta proximo do limite mensal.',
    };
  }
  if (percent >= 80) {
    return {
      level: 'warning',
      title: 'Uso alto do plano',
      message: 'Atencao: voce ja utilizou 80% do limite do seu plano.',
    };
  }
  return null;
};

const buildMetricSummary = (key, used, limit, periodStart, periodEnd) => {
  const normalizedUsed = normalizeNumber(used);
  const normalizedLimit = Math.max(0, normalizeNumber(limit));
  const percent = normalizedLimit > 0 ? Math.min(999, Math.round((normalizedUsed / normalizedLimit) * 100)) : 0;
  const remaining = normalizedLimit > 0 ? Math.max(0, normalizedLimit - normalizedUsed) : 0;

  const start = new Date(periodStart);
  const today = new Date();
  const totalDays = Math.max(1, Math.ceil((new Date(periodEnd).getTime() - start.getTime()) / 86400000));
  const elapsedDays = Math.max(1, Math.min(totalDays, Math.ceil((today.getTime() - start.getTime()) / 86400000)));
  const projected = Math.round((normalizedUsed / elapsedDays) * totalDays);

  const summary = {
    key,
    label: METRIC_LABELS[key] || key,
    used: normalizedUsed,
    limit: normalizedLimit,
    remaining,
    percent,
    projected,
  };

  return {
    ...summary,
    alert: buildAlertForMetric(summary),
  };
};

const buildLimitsJson = (planCode, planLimits = {}) => {
  const defaults = DEFAULT_LIMITS_BY_PLAN[normalizePlanId(planCode)] || DEFAULT_LIMITS_BY_PLAN.starter;
  return {
    ...defaults,
    companies: defaults.companies_count,
    users: defaults.users_count,
    ...(planLimits || {}),
  };
};

async function resolvePlanContext(companyId) {
  const fallbackPlan = normalizePlanId('starter');
  const fallbackMeta = getPlanMeta(fallbackPlan);
  const fallbackPeriod = getFallbackPeriodRange();

  if (!companyId) {
    return {
      planCode: fallbackPlan,
      planMeta: fallbackMeta,
      limits: buildLimitsJson(fallbackPlan),
      periodStart: toIsoDate(fallbackPeriod.start),
      periodEnd: toIsoDate(fallbackPeriod.end),
      extraCredits: 0,
      monthlySendLimit: Number(fallbackMeta.monthly_send_limit || 0),
    };
  }

  if (!hasSupabaseConfig || !supabase) {
    return {
      planCode: fallbackPlan,
      planMeta: fallbackMeta,
      limits: buildLimitsJson(fallbackPlan),
      periodStart: toIsoDate(fallbackPeriod.start),
      periodEnd: toIsoDate(fallbackPeriod.end),
      extraCredits: 0,
      monthlySendLimit: Number(fallbackMeta.monthly_send_limit || 0),
    };
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan_code, current_period_start, current_period_end')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: company } = await supabase
    .from('empresas')
    .select('subscription_plan, monthly_send_limit, extra_send_credits')
    .eq('id', companyId)
    .maybeSingle();

  const planCode = normalizePlanId(subscription?.plan_code || company?.subscription_plan || fallbackPlan);
  const planMeta = getPlanMeta(planCode);
  const { data: planRow } = await supabase
    .from('plans')
    .select('limits_json')
    .eq('code', planCode)
    .maybeSingle();

  const periodStart = subscription?.current_period_start
    ? toIsoDate(subscription.current_period_start)
    : toIsoDate(fallbackPeriod.start);
  const periodEnd = subscription?.current_period_end
    ? toIsoDate(subscription.current_period_end)
    : toIsoDate(fallbackPeriod.end);

  return {
    planCode,
    planMeta,
    limits: buildLimitsJson(planCode, planRow?.limits_json || {}),
    periodStart,
    periodEnd,
    extraCredits: normalizeNumber(company?.extra_send_credits),
    monthlySendLimit: normalizeNumber(company?.monthly_send_limit) || normalizeNumber(planMeta.monthly_send_limit),
  };
}

async function getActualCompanyCounts(companyId, periodStart) {
  if (!companyId) {
    return {
      company_count: 0,
      record_count: 0,
      users_count: 0,
      import_count: 0,
      integrations_count: 0,
    };
  }

  if (!hasSupabaseConfig || !supabase) {
    return {
      company_count: 1,
      record_count: 0,
      users_count: 1,
      import_count: 0,
      integrations_count: 0,
    };
  }

  const [
    { count: recordCount },
    { count: usersCount },
    { count: importCount },
    { count: integrationsCount },
  ] = await Promise.all([
    supabase.from('registros_financeiros').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase.from('usuarios_empresas').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase.from('importacoes').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', `${periodStart}T00:00:00.000Z`),
    supabase.from('company_integrations').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('connected', true),
  ]);

  return {
    company_count: 1,
    record_count: normalizeNumber(recordCount),
    users_count: Math.max(1, normalizeNumber(usersCount, 1)),
    import_count: normalizeNumber(importCount),
    integrations_count: normalizeNumber(integrationsCount),
  };
}

function getMockUsageSnapshot(companyId, planContext) {
  const store = readMockStore();
  const companyStore = store[companyId] || {};
  const periodKey = buildPeriodKey(planContext.periodStart, planContext.periodEnd);
  const current = companyStore[periodKey] || {};

  return {
    company_id: companyId,
    period_start: planContext.periodStart,
    period_end: planContext.periodEnd,
    plan_code: planContext.planCode,
    limits_json: planContext.limits,
    features_json: [],
    ...DEFAULT_COUNTERS,
    ...current,
    monthly_send_limit: planContext.monthlySendLimit,
    extra_send_credits: planContext.extraCredits,
    users_count: normalizeNumber(current.users_count, 1),
    integrations_count: normalizeNumber(current.integrations_count),
    companies_count: normalizeNumber(current.companies_count, 1),
  };
}

function saveMockUsageSnapshot(companyId, planContext, snapshot) {
  const store = readMockStore();
  const periodKey = buildPeriodKey(planContext.periodStart, planContext.periodEnd);
  store[companyId] = {
    ...(store[companyId] || {}),
    [periodKey]: snapshot,
  };
  writeMockStore(store);
}

export async function getCurrentUsage(companyId) {
  const planContext = await resolvePlanContext(companyId);
  const actualCounts = await getActualCompanyCounts(companyId, planContext.periodStart);

  if (!hasSupabaseConfig || !supabase) {
    const snapshot = getMockUsageSnapshot(companyId, planContext);
    return {
      ...snapshot,
      company_count: actualCounts.company_count,
      record_count: actualCounts.record_count,
      users_count: normalizeNumber(snapshot.users_count, actualCounts.users_count || 1),
      integrations_count: normalizeNumber(snapshot.integrations_count, actualCounts.integrations_count),
      companies_count: normalizeNumber(snapshot.companies_count, actualCounts.company_count || 1),
    };
  }

  const { data, error } = await supabase
    .from('usage_counters')
    .select('*')
    .eq('company_id', companyId)
    .eq('period_start', planContext.periodStart)
    .eq('period_end', planContext.periodEnd)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Falha ao carregar usage_counters.');
  }

  return {
    company_id: companyId,
    period_start: planContext.periodStart,
    period_end: planContext.periodEnd,
    plan_code: planContext.planCode,
    limits_json: planContext.limits,
    features_json: [],
    ...DEFAULT_COUNTERS,
    ...(data || {}),
    monthly_send_limit: planContext.monthlySendLimit,
    extra_send_credits: planContext.extraCredits,
    company_count: actualCounts.company_count,
    record_count: actualCounts.record_count,
    users_count: actualCounts.users_count,
    integrations_count: actualCounts.integrations_count,
    companies_count: actualCounts.company_count,
  };
}

export async function setUsage(companyId, metricKey, value) {
  if (!companyId || !metricKey) return false;

  const planContext = await resolvePlanContext(companyId);
  const current = await getCurrentUsage(companyId);
  const nextValue = Math.max(0, normalizeNumber(value));
  const payload = {
    ...current,
    [metricKey]: nextValue,
    users_count: metricKey === 'users_count' ? nextValue : current.users_count,
  };

  if (!hasSupabaseConfig || !supabase) {
    saveMockUsageSnapshot(companyId, planContext, payload);
    return payload;
  }

  const { error } = await supabase.from('usage_counters').upsert(
    {
      company_id: companyId,
      period_start: planContext.periodStart,
      period_end: planContext.periodEnd,
      real_sends_count: normalizeNumber(payload.real_sends_count),
      simulated_sends_count: normalizeNumber(payload.simulated_sends_count),
      manual_sends_count: normalizeNumber(payload.manual_sends_count),
      automatic_sends_count: normalizeNumber(payload.automatic_sends_count),
      imports_month: normalizeNumber(payload.imports_month),
      charges_month: normalizeNumber(payload.charges_month),
      automations_month: normalizeNumber(payload.automations_month),
      users_count: normalizeNumber(payload.users_count),
    },
    { onConflict: 'company_id,period_start,period_end' }
  );

  if (error) {
    throw new Error(error.message || 'Falha ao salvar o uso da empresa.');
  }

  const metricLimit =
    metricKey === 'users_count'
      ? planContext.limits.users_count ?? planContext.limits.users
      : metricKey === 'companies_count'
        ? planContext.limits.companies_count ?? planContext.limits.companies
      : planContext.limits[metricKey];

  const metricSummary = buildMetricSummary(
    metricKey,
    payload[metricKey],
    metricLimit,
    planContext.periodStart,
    planContext.periodEnd
  );

  if (metricSummary?.alert) {
    try {
      await syncUsageAlertNotification(companyId, metricSummary, planContext.periodStart, planContext.periodEnd);
    } catch {
      // Nao bloqueia a operacao principal se o centro de notificacoes ainda nao estiver disponivel.
    }
  }

  return payload;
}

export async function incrementUsage(companyId, metricKey, amount = 1) {
  const current = await getCurrentUsage(companyId);
  const currentValue = normalizeNumber(current?.[metricKey]);
  return setUsage(companyId, metricKey, currentValue + normalizeNumber(amount));
}

export async function getMonthlyUsage(companyId) {
  return getCurrentUsage(companyId);
}

export async function resetMonthlyCounters() {
  if (!hasSupabaseConfig || !supabase) {
    const store = readMockStore();
    const nextStore = {};
    const { start, end } = getFallbackPeriodRange();
    const currentPeriodKey = buildPeriodKey(toIsoDate(start), toIsoDate(end));

    Object.entries(store).forEach(([companyId, periods]) => {
      if (periods?.[currentPeriodKey]) {
        nextStore[companyId] = { [currentPeriodKey]: periods[currentPeriodKey] };
      }
    });

    writeMockStore(nextStore);
    return { ok: true, reset: 0, mode: 'mock_pruned' };
  }

  return {
    ok: true,
    reset: 0,
    mode: 'period_scoped',
    message: 'Os contadores ja sao segregados por periodo. Um novo ciclo passa a usar uma nova linha em usage_counters.',
  };
}

export async function getUsageSummary(companyId) {
  const usage = await getCurrentUsage(companyId);
  const limits = buildLimitsJson(usage.plan_code, usage.limits_json);

  const metrics = {
    charges_month: buildMetricSummary('charges_month', usage.charges_month, limits.charges_month, usage.period_start, usage.period_end),
    imports_month: buildMetricSummary('imports_month', usage.imports_month, limits.imports_month, usage.period_start, usage.period_end),
    automations_month: buildMetricSummary('automations_month', usage.automations_month, limits.automations_month, usage.period_start, usage.period_end),
    users_count: buildMetricSummary('users_count', usage.users_count, limits.users_count ?? limits.users, usage.period_start, usage.period_end),
    integrations_count: buildMetricSummary('integrations_count', usage.integrations_count, limits.integrations_count, usage.period_start, usage.period_end),
    companies_count: buildMetricSummary('companies_count', usage.companies_count, limits.companies_count ?? limits.companies, usage.period_start, usage.period_end),
  };

  const alerts = METRIC_ORDER.map((key) => metrics[key]?.alert).filter(Boolean);
  const highestAlert = alerts[0] || null;

  return {
    company_id: companyId,
    plan_code: usage.plan_code,
    period_start: usage.period_start,
    period_end: usage.period_end,
    metrics,
    alerts,
    highestAlert,
    usage,
    limits,
  };
}

export default {
  getCurrentUsage,
  incrementUsage,
  setUsage,
  resetMonthlyCounters,
  getMonthlyUsage,
  getUsageSummary,
};
