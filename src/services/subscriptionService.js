import {
  buildPlanCatalogForUi,
  calculateRemainingSends,
  getPlanMeta,
  getUsagePercent,
  normalizePlanId,
} from '../constants/plans';
import { hasSupabaseConfig, supabase } from './supabaseClient';
import {
  getCurrentUsage as getUsageSnapshot,
  getMonthlyUsage as getMonthlyUsageSnapshot,
  incrementUsage as incrementUsageMetric,
} from './usageService';
import { createScopedLogger } from './loggerService';

const logger = createScopedLogger('billing-limits');

const STORAGE_KEY = 'bankextract.subscription.mock';
const DEFAULT_PERIOD_DAYS = 30;
const DEFAULT_TRIAL_DAYS = 7;

const planDbSeeds = {
  starter: {
    code: 'starter',
    name: 'Starter',
    price_cents: 19700,
    billing_period: 'monthly',
    limits_json: {
      charges_month: 500,
      imports_month: 50,
      automations_month: 100,
      users: 2,
      companies: 1,
      users_count: 2,
      companies_count: 1,
      integrations_count: 2,
    },
    features_json: ['basic_import', 'manual_automation', 'basic_dashboard'],
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    price_cents: 39700,
    billing_period: 'monthly',
    limits_json: {
      charges_month: 2000,
      imports_month: 300,
      automations_month: 500,
      users: 3,
      companies: 1,
      users_count: 3,
      companies_count: 1,
      integrations_count: 4,
    },
    features_json: ['basic_import', 'manual_automation', 'advanced_automation', 'billing_center', 'analytics'],
  },
  business: {
    code: 'business',
    name: 'Business',
    price_cents: 79700,
    billing_period: 'monthly',
    limits_json: {
      charges_month: 10000,
      imports_month: 2000,
      automations_month: 2000,
      users: 10,
      companies: 3,
      users_count: 10,
      companies_count: 3,
      integrations_count: 10,
    },
    features_json: [
      'basic_import',
      'manual_automation',
      'advanced_automation',
      'billing_center',
      'analytics',
      'executive_dashboard',
      'full_audit',
    ],
  },
};

const readMockStore = () => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeMockStore = (nextValue) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextValue));
};

const addDays = (baseDate, days) => {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const getCurrentPeriodRange = (subscription = null) => {
  const start = subscription?.current_period_start
    ? new Date(subscription.current_period_start)
    : startOfToday();
  const end = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : addDays(start, DEFAULT_PERIOD_DAYS);

  return {
    start,
    end,
  };
};

const resolveMonthlyLimit = (planMeta, limitsJson = {}) =>
  Number(limitsJson?.charges_month || limitsJson?.monthly_charges || planMeta.monthly_send_limit || 0);

const buildCompanyCommercialFields = (planCode) => {
  const normalizedPlan = normalizePlanId(planCode);
  const planMeta = getPlanMeta(normalizedPlan);

  return {
    subscription_plan: normalizedPlan,
    subscription_status: normalizedPlan === 'starter' ? 'trialing' : 'active',
    monthly_send_limit: Number(planMeta.monthly_send_limit || 0),
    automatic_send_enabled: Boolean(planMeta.capabilities?.automatic_send),
  };
};

const normalizeSubscriptionStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'trial') return 'trialing';
  if (['trialing', 'active', 'past_due', 'canceled', 'expired', 'blocked'].includes(normalized)) {
    return normalized;
  }
  return 'trialing';
};

const normalizePlanRecord = (record = {}) => {
  const planId = normalizePlanId(record.plan_code || record.code || record.id);
  const planMeta = getPlanMeta(planId);
  const limits = {
    ...(planDbSeeds[planId]?.limits_json || {}),
    ...(record.limits_json || {
      charges_month: Number(planMeta.monthly_send_limit || 0),
    }),
  };

  return {
    ...planMeta,
    code: planId,
    id: planId,
    name: record.name || planMeta.name,
    price_cents: record.price_cents ?? Math.round(Number(planMeta.price || 0) * 100),
    billing_period: record.billing_period || 'monthly',
    limits_json: limits,
    features_json: record.features_json || planDbSeeds[planId]?.features_json || [],
    active: record.active ?? true,
  };
};

const buildMockSubscription = (companyId, planCode = 'starter') => {
  const normalizedPlan = normalizePlanId(planCode);
  const now = new Date();
  const usesTrial = normalizedPlan === 'starter';
  const periodEnd = addDays(now, usesTrial ? DEFAULT_TRIAL_DAYS : DEFAULT_PERIOD_DAYS);
  const trialEndsAt = usesTrial ? addDays(now, DEFAULT_TRIAL_DAYS) : null;

  return {
    id: `mock-subscription-${companyId}`,
    company_id: companyId,
    plan_code: normalizedPlan,
    status: usesTrial ? 'trialing' : 'active',
    trial_ends_at: trialEndsAt?.toISOString() || null,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
};

const ensureMockSubscription = (companyId) => {
  if (!companyId) return null;

  const store = readMockStore();
  if (!store[companyId]) {
    store[companyId] = buildMockSubscription(companyId, 'starter');
    writeMockStore(store);
  }

  return store[companyId];
};

const mergeSubscriptionWithPlan = (subscription, usage = null) => {
  const planId = normalizePlanId(subscription?.plan_code || subscription?.subscription_plan || 'starter');
  const planMeta = getPlanMeta(planId);
  const period = getCurrentPeriodRange(subscription);
  const usageSnapshot = usage || {};
  const usedRealSends = Number(usageSnapshot.real_sends_count || 0);
  const extraCredits = Number(usageSnapshot.extra_send_credits || 0);
  const monthlyLimit =
    Number(usageSnapshot.monthly_send_limit || 0) ||
    Number(subscription?.monthly_send_limit || 0) ||
    Number(planMeta.monthly_send_limit || 0);
  const remaining = calculateRemainingSends({
    monthly_send_limit: monthlyLimit,
    extra_send_credits: extraCredits,
    used_real_sends: usedRealSends,
  });

  return {
    id: subscription?.id || `subscription-${subscription?.company_id || planId}`,
    company_id: subscription?.company_id || '',
    currentPlan: {
      ...planMeta,
      monthly_send_limit: monthlyLimit,
      limits_json: usageSnapshot.limits_json || planDbSeeds[planId]?.limits_json || {},
      features_json: usageSnapshot.features_json || planDbSeeds[planId]?.features_json || [],
    },
    status: normalizeSubscriptionStatus(subscription?.status || 'trialing'),
    trialEndsAt: subscription?.trial_ends_at || null,
    currentPeriodStart: period.start.toISOString(),
    currentPeriodEnd: period.end.toISOString(),
    usage: {
      realSends: usedRealSends,
      simulatedSends: Number(usageSnapshot.simulated_sends_count || 0),
      manualSends: Number(usageSnapshot.manual_sends_count || 0),
      automaticSends: Number(usageSnapshot.automatic_sends_count || 0),
      companies: Number(usageSnapshot.company_count || 1),
      companiesCount: Number(usageSnapshot.company_count || 1),
      records: Number(usageSnapshot.record_count || 0),
      importsMonth: Number(usageSnapshot.imports_month || 0),
      chargesMonth: Number(usageSnapshot.charges_month || 0),
      automationsMonth: Number(usageSnapshot.automations_month || 0),
      usersCount: Number(usageSnapshot.users_count || 0),
      integrationsCount: Number(usageSnapshot.integrations_count || 0),
    },
    remainingRealSends: remaining,
    monthly_send_limit: monthlyLimit,
    extra_send_credits: extraCredits,
    nextCharge: subscription?.current_period_end
      ? new Intl.DateTimeFormat('pt-BR').format(period.end)
      : 'Ciclo em preparacao',
    usage_percent: getUsagePercent({
      monthly_send_limit: monthlyLimit,
      extra_send_credits: extraCredits,
      used_real_sends: usedRealSends,
    }),
    currentUsage: {
      imports_month: Number(usageSnapshot.imports_month || 0),
      charges_month: Number(usageSnapshot.charges_month || 0),
      automations_month: Number(usageSnapshot.automations_month || 0),
      users_count: Number(usageSnapshot.users_count || 0),
      integrations_count: Number(usageSnapshot.integrations_count || 0),
      companies_count: Number(usageSnapshot.company_count || 1),
    },
    trialDaysRemaining:
      normalizeSubscriptionStatus(subscription?.status) === 'trialing' && subscription?.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86400000))
        : 0,
  };
};

async function getUsageCounter(companyId, subscription = null) {
  if (!companyId) {
    return {
      company_id: '',
      real_sends_count: 0,
      simulated_sends_count: 0,
      manual_sends_count: 0,
      automatic_sends_count: 0,
      extra_send_credits: 0,
      monthly_send_limit: 0,
      company_count: 0,
      record_count: 0,
      imports_month: 0,
      charges_month: 0,
      automations_month: 0,
      users_count: 0,
    };
  }

  const snapshot = await getUsageSnapshot(companyId);
  const planId = normalizePlanId(snapshot?.plan_code || subscription?.plan_code || 'starter');

  return {
    ...snapshot,
    limits_json: {
      ...(planDbSeeds[planId]?.limits_json || {}),
      ...(snapshot?.limits_json || {}),
    },
    features_json: planDbSeeds[planId]?.features_json || [],
  };
}

export async function getPlans() {
  logger.debug('plans_requested', {});
  if (!hasSupabaseConfig || !supabase) {
    return buildPlanCatalogForUi();
  }

  const { data, error } = await supabase
    .from('plans')
    .select('code, name, price_cents, billing_period, limits_json, features_json, active')
    .eq('active', true)
    .order('price_cents', { ascending: true });

  if (error && error.code !== 'PGRST205') {
    throw new Error(error.message || 'Falha ao carregar os planos.');
  }

  let sourceRows = Array.isArray(data) && data.length ? data : [];
  if (!sourceRows.length) {
    const legacy = await supabase
      .from('subscription_plans')
      .select('code, name, price_cents, billing_period, limits_json, features_json, active')
      .eq('active', true)
      .order('price_cents', { ascending: true });

    if (legacy.error) {
      throw new Error(legacy.error.message || 'Falha ao carregar os planos.');
    }

    sourceRows = legacy.data || [];
  }

  const rows = Array.isArray(sourceRows) && sourceRows.length
    ? sourceRows.map(normalizePlanRecord)
    : buildPlanCatalogForUi().map(normalizePlanRecord);

  return rows.map((row) => {
    const planMeta = getPlanMeta(row.code);
    return {
      ...planMeta,
      ...row,
      price_label: planMeta.price_label,
      limits: `${Number(resolveMonthlyLimit(planMeta, row.limits_json)).toLocaleString('pt-BR')} cobrancas/mes`,
    };
  });
}

export async function ensureTrialSubscription(companyId) {
  if (!companyId) return null;

  if (!hasSupabaseConfig || !supabase) {
    return ensureMockSubscription(companyId);
  }

  const { data: existing, error: existingError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || 'Falha ao carregar a assinatura da empresa.');
  }

  if (existing) {
    return existing;
  }

  const now = new Date();
  const trialEndsAt = addDays(now, DEFAULT_TRIAL_DAYS);
  const periodEnd = addDays(now, DEFAULT_TRIAL_DAYS);
  const payload = {
    company_id: companyId,
    provider: 'stripe',
    plan_code: 'starter',
    status: 'trialing',
    trial_starts_at: now.toISOString(),
    trial_ends_at: trialEndsAt.toISOString(),
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
  };

  const { data: created, error: insertError } = await supabase
    .from('subscriptions')
    .upsert(payload, { onConflict: 'company_id' })
    .select('*')
    .single();

  if (insertError) {
    throw new Error(insertError.message || 'Falha ao iniciar o trial da empresa.');
  }
  return created;
}

export async function getCompanySubscription(companyId) {
  if (!companyId) return null;
  logger.debug('subscription_requested', { company_id: companyId });

  const subscription = await ensureTrialSubscription(companyId);
  const usage = await getUsageCounter(companyId, subscription);
  return mergeSubscriptionWithPlan(subscription, usage);
}

export async function updateCompanyPlan(companyId, planCode) {
  if (!companyId) {
    throw new Error('companyId obrigatorio para atualizar o plano.');
  }
  logger.info('plan_update_requested', { company_id: companyId, plan_code: planCode });

  const normalizedPlan = normalizePlanId(planCode);
  const planMeta = getPlanMeta(normalizedPlan);
  const now = new Date();
  const periodEnd = normalizedPlan === 'starter' ? addDays(now, DEFAULT_TRIAL_DAYS) : addDays(now, DEFAULT_PERIOD_DAYS);

  if (!hasSupabaseConfig || !supabase) {
    const store = readMockStore();
    store[companyId] = {
      ...(store[companyId] || buildMockSubscription(companyId, normalizedPlan)),
      plan_code: normalizedPlan,
      status: normalizedPlan === 'starter' ? 'trialing' : 'active',
      trial_ends_at: normalizedPlan === 'starter' ? addDays(now, DEFAULT_TRIAL_DAYS).toISOString() : null,
      updated_at: now.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    };
    writeMockStore(store);
    return getCompanySubscription(companyId);
  }

  const payload = {
    company_id: companyId,
    provider: 'stripe',
    plan_code: normalizedPlan,
    status: normalizedPlan === 'starter' ? 'trialing' : 'active',
    trial_starts_at: normalizedPlan === 'starter' ? now.toISOString() : null,
    trial_ends_at: normalizedPlan === 'starter' ? addDays(now, DEFAULT_TRIAL_DAYS).toISOString() : null,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
  };

  const { error } = await supabase.from('subscriptions').upsert(payload, { onConflict: 'company_id' });
  if (error) {
    logger.error('plan_update_failed', error, { company_id: companyId, plan_code: normalizedPlan });
    throw new Error(error.message || 'Falha ao atualizar o plano da empresa.');
  }

  logger.info('plan_update_succeeded', { company_id: companyId, plan_code: normalizedPlan });

  return {
    ...(await getCompanySubscription(companyId)),
    currentPlan: {
      ...planMeta,
      monthly_send_limit: Number(planMeta.monthly_send_limit || 0),
      limits_json: planDbSeeds[normalizedPlan]?.limits_json || {},
      features_json: planDbSeeds[normalizedPlan]?.features_json || [],
    },
  };
}

export async function getCurrentUsage(companyId) {
  return getUsageSnapshot(companyId);
}

export async function getMonthlyUsage(companyId) {
  return getMonthlyUsageSnapshot(companyId);
}

export async function incrementUsageCounter(companyId, counterKey, amount = 1) {
  return incrementUsageMetric(companyId, counterKey, amount);
}

export async function getUsageLimits(companyId) {
  const subscription = await getCompanySubscription(companyId);
  if (!subscription) return null;

  const plan = subscription.currentPlan || getPlanMeta('starter');
  const usedRealSends = Number(subscription.usage?.realSends || 0);
  const extraCredits = Number(subscription.extra_send_credits || 0);
  const monthlyLimit = Number(subscription.monthly_send_limit || plan.monthly_send_limit || 0);
  const remaining = calculateRemainingSends({
    monthly_send_limit: monthlyLimit,
    extra_send_credits: extraCredits,
    used_real_sends: usedRealSends,
  });
  const blockedBySubscription = ['blocked', 'expired'].includes(String(subscription.status || '').toLowerCase());

  return {
    ...subscription,
    plan: plan.id,
    status: subscription.status,
    monthly_send_limit: monthlyLimit,
    extra_send_credits: extraCredits,
    used_real_sends: usedRealSends,
    remaining_real_sends: remaining,
    blocked_by_limit: remaining <= 0 || blockedBySubscription,
    blocked_by_subscription: blockedBySubscription,
    usage_percent: getUsagePercent({
      monthly_send_limit: monthlyLimit,
      extra_send_credits: extraCredits,
      used_real_sends: usedRealSends,
    }),
  };
}

export async function checkFeatureAccess(companyId, featureKey) {
  const subscription = await getCompanySubscription(companyId);
  const plan = subscription?.currentPlan || getPlanMeta('starter');
  const normalizedStatus = String(subscription?.status || '').toLowerCase();
  const featureSet = new Set([
    ...(planDbSeeds[plan.id]?.features_json || []),
    ...(Array.isArray(plan.features_json) ? plan.features_json : []),
  ]);
  const capabilityMap = {
    manual_send: Boolean(plan.capabilities?.manual_send),
    batch_manual_send: Boolean(plan.capabilities?.batch_manual_send),
    automatic_send: Boolean(plan.capabilities?.automatic_send),
    multi_company: Boolean(plan.capabilities?.multi_company),
    advanced_reports: Boolean(plan.capabilities?.advanced_reports),
  };

  const blockedByStatus = ['blocked', 'expired', 'canceled'].includes(normalizedStatus);
  const allowed = !blockedByStatus && (featureSet.has(featureKey) || capabilityMap[featureKey] === true);

  return {
    allowed,
    plan: plan.id,
    reason: allowed ? null : (blockedByStatus ? 'SUBSCRIPTION_INACTIVE' : 'FEATURE_BLOCKED'),
    upgradeTarget: plan.upgrade_target || null,
  };
}

export async function checkUsageLimit(companyId, limitKey, currentUsage = 0) {
  const subscription = await getCompanySubscription(companyId);
  const plan = subscription?.currentPlan || getPlanMeta('starter');
  const usage = await getCurrentUsage(companyId);
  const limits = planDbSeeds[plan.id]?.limits_json || plan.limits_json || {};

  const maxAllowed = Number(
    limits[limitKey] ||
    (limitKey === 'charges_month' ? subscription?.monthly_send_limit : 0),
  );
  const actualUsage = Number(currentUsage || usage?.[limitKey] || 0);
  const allowed = maxAllowed <= 0 ? true : actualUsage <= maxAllowed;

  return {
    allowed,
    limitKey,
    currentUsage: actualUsage,
    maxAllowed,
    remaining: Math.max(0, maxAllowed - actualUsage),
    reason: allowed ? null : 'LIMIT_REACHED',
  };
}

export default {
  getPlans,
  getCompanySubscription,
  ensureTrialSubscription,
  updateCompanyPlan,
  getUsageLimits,
  getCurrentUsage,
  getMonthlyUsage,
  incrementUsageCounter,
  checkFeatureAccess,
  checkUsageLimit,
};
