export const PLAN_ORDER = ['starter', 'pro', 'business'];

export const PLAN_FEATURES = {
  starter: {
    id: 'starter',
    name: 'Starter',
    subtitle: 'Manual Assistido',
    price: 197,
    price_label: 'R$197/mes',
    badge: 'Essencial',
    description: 'Para operacoes que querem organizar a cobranca com previsibilidade e uma base segura de onboarding.',
    monthly_send_limit: 500,
    recommended: false,
    highlighted: false,
    cta: 'Comecar teste gratis',
    upgrade_target: 'pro',
    theme: 'slate',
    features: [
      '500 cobrancas/mes inclusas',
      '1 empresa',
      '2 usuarios',
      'Importacoes basicas',
      'Automacoes manuais',
      'Checklist pre-envio',
    ],
    limitations: [
      'Sem automacoes avancadas',
      'Sem dashboard executivo',
      'Sem suporte prioritario',
    ],
    capabilities: {
      manual_send: true,
      batch_manual_send: true,
      automatic_send: false,
      multi_company: false,
      approval_flow: false,
      advanced_reports: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    subtitle: 'Automacao Inteligente',
    price: 397,
    price_label: 'R$397/mes',
    badge: 'Mais indicado',
    description: 'Para empresas que precisam de mais volume, automacoes avancadas e leitura operacional da cobranca.',
    monthly_send_limit: 2000,
    recommended: true,
    highlighted: true,
    cta: 'Fazer upgrade',
    upgrade_target: 'business',
    theme: 'emerald',
    features: [
      '2.000 cobrancas/mes inclusas',
      '3 usuarios',
      'Tudo do Starter',
      'Automacoes avancadas',
      'Central de cobranca',
      'Relatorios',
    ],
    limitations: [
      'Sem dashboard executivo completo',
      'Sem suporte prioritario',
    ],
    capabilities: {
      manual_send: true,
      batch_manual_send: true,
      automatic_send: true,
      multi_company: false,
      approval_flow: false,
      advanced_reports: true,
    },
  },
  business: {
    id: 'business',
    name: 'Business',
    subtitle: 'Enterprise',
    price: 797,
    price_label: 'A partir de R$797/mes',
    badge: 'Customizavel',
    description: 'Para operacoes de maior volume, com multiempresa, governanca e acompanhamento executivo.',
    monthly_send_limit: 10000,
    recommended: false,
    highlighted: false,
    cta: 'Falar com especialista',
    upgrade_target: null,
    theme: 'blue',
    features: [
      '10.000 cobrancas/mes inclusas',
      '10 usuarios',
      'Tudo do Pro',
      'Dashboard executivo',
      'Auditoria completa',
      'Suporte prioritario',
      'Limite personalizado',
    ],
    limitations: [],
    capabilities: {
      manual_send: true,
      batch_manual_send: true,
      automatic_send: true,
      multi_company: true,
      approval_flow: true,
      advanced_reports: true,
    },
  },
};

const COMPARISON_ROWS = [
  {
    key: 'monthly_send_limit',
    label: 'Cobrancas inclusas por mes',
    formatter: (plan) => `${Number(plan.monthly_send_limit || 0).toLocaleString('pt-BR')}`,
  },
  { key: 'manual_send', label: 'Envio manual individual' },
  { key: 'batch_manual_send', label: 'Envio em lote manual' },
  { key: 'automatic_send', label: 'Automacao programada' },
  { key: 'approval_flow', label: 'Fluxo de aprovacao' },
  { key: 'multi_company', label: 'Multiempresa' },
  { key: 'advanced_reports', label: 'Relatorios avancados' },
];

export function getPlanMeta(planId) {
  return PLAN_FEATURES[planId] || PLAN_FEATURES.starter;
}

export function getAllPlans() {
  return PLAN_ORDER.map((planId) => getPlanMeta(planId));
}

export function getPlanBadgeLabel(planId) {
  return getPlanMeta(planId).name;
}

export function getComparisonRows() {
  return COMPARISON_ROWS;
}

export function getCapabilityLabel(enabled) {
  return enabled ? 'Liberado' : 'Bloqueado';
}

export function calculateRemainingSends({
  monthly_send_limit = 0,
  extra_send_credits = 0,
  used_real_sends = 0,
} = {}) {
  return Math.max(
    0,
    Number(monthly_send_limit || 0) + Number(extra_send_credits || 0) - Number(used_real_sends || 0),
  );
}

export function isLimitReached(usage = {}) {
  return calculateRemainingSends(usage) <= 0;
}

export function getUsagePercent({
  monthly_send_limit = 0,
  extra_send_credits = 0,
  used_real_sends = 0,
} = {}) {
  const total = Number(monthly_send_limit || 0) + Number(extra_send_credits || 0);
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(used_real_sends || 0) / total) * 100)));
}

export function getUpgradeRecommendation(planId, usage = {}) {
  const current = getPlanMeta(planId);
  if (!current.upgrade_target) return null;

  const next = getPlanMeta(current.upgrade_target);
  const percent = getUsagePercent(usage);

  let reason = 'Desbloqueie mais capacidade operacional e recursos comerciais.';
  if (current.id === 'starter') {
    reason = 'O plano Pro libera automacoes avancadas, mais usuarios e maior volume mensal.';
  } else if (percent >= 80) {
    reason = 'Seu uso esta alto para o plano atual. O proximo nivel amplia o limite mensal.';
  }

  return {
    current,
    target: next,
    reason,
  };
}

export function normalizePlanId(planId) {
  if (planId === 'enterprise') return 'business';
  return PLAN_FEATURES[planId] ? planId : 'starter';
}

export function buildPlanCatalogForUi() {
  return getAllPlans().map((plan) => ({
    ...plan,
    featured: Boolean(plan.highlighted),
    emphasis: plan.subtitle,
    limits: `${Number(plan.monthly_send_limit || 0).toLocaleString('pt-BR')} cobrancas/mes`,
  }));
}
