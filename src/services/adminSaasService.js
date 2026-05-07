import { companyService } from './companyService';
import { hasSupabaseConfig, supabase } from './supabaseClient';
import { getUsageSummary } from './usageService';

const FALLBACK_ADMIN_EMAILS = String(import.meta.env.VITE_SYSTEM_ADMIN_EMAILS || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const normalizeSubscriptionStatus = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (['active', 'trialing', 'past_due', 'canceled'].includes(raw)) {
    return raw;
  }
  return 'trialing';
};

export async function isSystemAdmin(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (email && FALLBACK_ADMIN_EMAILS.includes(email)) {
    return true;
  }

  if (!user?.id) {
    return false;
  }

  try {
    return await companyService.isSystemAdmin({ userId: user.id, email: user.email || '' });
  } catch {
    return email ? FALLBACK_ADMIN_EMAILS.includes(email) : false;
  }
}

const mockOverview = {
  totalCompanies: 3,
  totalUsers: 6,
  activeCompanies: 2,
  trialingCompanies: 1,
  blockedCompanies: 0,
  importations: 18,
  generatedCharges: 42,
  automationsExecuted: 17,
};

export async function getRecentAuditLogs() {
  if (!hasSupabaseConfig || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, company_id, action, entity, entity_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) {
    throw new Error(error.message || 'Falha ao carregar logs recentes.');
  }

  const companyIds = Array.from(new Set((data || []).map((item) => item.company_id).filter(Boolean)));
  let companyMap = new Map();

  if (companyIds.length) {
    const { data: companies } = await supabase.from('empresas').select('id, nome').in('id', companyIds);
    companyMap = new Map((companies || []).map((item) => [item.id, item.nome]));
  }

  return (data || []).map((item) => ({
    ...item,
    company_name: companyMap.get(item.company_id) || 'Empresa',
  }));
}

export async function getCompaniesList() {
  if (!hasSupabaseConfig || !supabase) {
    return [];
  }

  const [{ data: companies, error: companiesError }, { data: memberships, error: membershipsError }, { data: subscriptions, error: subscriptionsError }] =
    await Promise.all([
      supabase.from('empresas').select('id, nome, cnpj, created_at, subscription_plan, subscription_status, monthly_send_limit').order('created_at', { ascending: false }),
      supabase.from('usuarios_empresas').select('company_id, user_id'),
      supabase.from('company_subscriptions').select('company_id, plan_code, status, trial_ends_at, current_period_end'),
    ]);

  if (companiesError) throw new Error(companiesError.message || 'Falha ao carregar empresas.');
  if (membershipsError) throw new Error(membershipsError.message || 'Falha ao carregar usuarios das empresas.');
  if (subscriptionsError) throw new Error(subscriptionsError.message || 'Falha ao carregar assinaturas.');

  const usersByCompany = new Map();
  for (const membership of memberships || []) {
    usersByCompany.set(membership.company_id, (usersByCompany.get(membership.company_id) || 0) + 1);
  }

  const subscriptionByCompany = new Map((subscriptions || []).map((item) => [item.company_id, item]));

  const rows = (companies || []).map((company) => {
    const subscription = subscriptionByCompany.get(company.id);
    return {
      id: company.id,
      nome: company.nome,
      cnpj: company.cnpj || '',
      created_at: company.created_at,
      plan_code: subscription?.plan_code || company.subscription_plan || 'starter',
      status: normalizeSubscriptionStatus(subscription?.status || company.subscription_status || 'trialing'),
      trial_ends_at: subscription?.trial_ends_at || null,
      current_period_end: subscription?.current_period_end || null,
      monthly_send_limit: Number(company.monthly_send_limit || 0),
      users_count: usersByCompany.get(company.id) || 0,
    };
  });

  const usageSummaries = await Promise.all(
    rows.map(async (company) => {
      try {
        return [company.id, await getUsageSummary(company.id)];
      } catch {
        return [company.id, null];
      }
    })
  );

  const usageByCompany = new Map(usageSummaries);
  return rows.map((company) => ({
    ...company,
    usage_summary: usageByCompany.get(company.id),
  }));
}

export async function getCompanyDetails(companyId) {
  if (!companyId) {
    throw new Error('companyId obrigatorio para abrir o detalhe da empresa.');
  }

  if (!hasSupabaseConfig || !supabase) {
    return null;
  }

  const [
    { data: company, error: companyError },
    { data: subscription, error: subscriptionError },
    { count: importCount, error: importError },
    { count: recordCount, error: recordError },
    { data: usageRows, error: usageError },
  ] = await Promise.all([
    supabase.from('empresas').select('id, nome, cnpj, created_at, subscription_plan, subscription_status, monthly_send_limit').eq('id', companyId).maybeSingle(),
    supabase.from('company_subscriptions').select('*').eq('company_id', companyId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('importacoes').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase.from('registros_financeiros').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase.from('usage_counters').select('*').eq('company_id', companyId).order('period_start', { ascending: false }).limit(1),
  ]);

  if (companyError) throw new Error(companyError.message || 'Falha ao carregar empresa.');
  if (subscriptionError) throw new Error(subscriptionError.message || 'Falha ao carregar assinatura da empresa.');
  if (importError) throw new Error(importError.message || 'Falha ao carregar importacoes da empresa.');
  if (recordError) throw new Error(recordError.message || 'Falha ao carregar a carteira da empresa.');
  if (usageError) throw new Error(usageError.message || 'Falha ao carregar uso da empresa.');

  return {
    company,
    subscription,
    importCount: importCount || 0,
    recordCount: recordCount || 0,
    usage: usageRows?.[0] || null,
  };
}

export async function updateCompanySubscriptionStatus(companyId, status) {
  if (!companyId) {
    throw new Error('companyId obrigatorio para atualizar o status da assinatura.');
  }

  const normalizedStatus = normalizeSubscriptionStatus(status);

  if (!hasSupabaseConfig || !supabase) {
    return {
      company_id: companyId,
      status: normalizedStatus,
    };
  }

  const { error: companyError } = await supabase
    .from('empresas')
    .update({ subscription_status: normalizedStatus })
    .eq('id', companyId);

  if (companyError) {
    throw new Error(companyError.message || 'Falha ao atualizar o status comercial da empresa.');
  }

  const { error: subscriptionError } = await supabase
    .from('company_subscriptions')
    .update({ status: normalizedStatus })
    .eq('company_id', companyId);

  if (subscriptionError) {
    throw new Error(subscriptionError.message || 'Falha ao sincronizar a assinatura da empresa.');
  }

  return {
    company_id: companyId,
    status: normalizedStatus,
  };
}

export async function getAdminOverview() {
  if (!hasSupabaseConfig || !supabase) {
    return {
      ...mockOverview,
      logs: [],
    };
  }

  const [companies, memberships, imports, charges, subscriptions, recentLogs] = await Promise.all([
    supabase.from('empresas').select('id', { count: 'exact', head: true }),
    supabase.from('usuarios_empresas').select('user_id'),
    supabase.from('importacoes').select('id', { count: 'exact', head: true }),
    supabase.from('logs_cobranca').select('id', { count: 'exact', head: true }),
    supabase.from('company_subscriptions').select('company_id, status'),
    getRecentAuditLogs(),
  ]);

  if (companies.error) throw new Error(companies.error.message || 'Falha ao carregar total de empresas.');
  if (memberships.error) throw new Error(memberships.error.message || 'Falha ao carregar total de usuarios.');
  if (imports.error) throw new Error(imports.error.message || 'Falha ao carregar importacoes.');
  if (charges.error) throw new Error(charges.error.message || 'Falha ao carregar cobrancas geradas.');
  if (subscriptions.error) throw new Error(subscriptions.error.message || 'Falha ao carregar assinaturas.');

  const uniqueUsers = new Set((memberships.data || []).map((item) => item.user_id).filter(Boolean));
  const statuses = subscriptions.data || [];

  return {
    totalCompanies: companies.count || 0,
    totalUsers: uniqueUsers.size,
    activeCompanies: statuses.filter((item) => item.status === 'active').length,
    trialingCompanies: statuses.filter((item) => item.status === 'trialing').length,
    blockedCompanies: statuses.filter((item) => ['past_due', 'canceled'].includes(item.status)).length,
    importations: imports.count || 0,
    generatedCharges: charges.count || 0,
    automationsExecuted: charges.count || 0,
    logs: recentLogs,
  };
}

export default {
  isSystemAdmin,
  getAdminOverview,
  getCompaniesList,
  getCompanyDetails,
  updateCompanySubscriptionStatus,
  getRecentAuditLogs,
};
