import { hasSupabaseConfig, supabase } from './supabaseClient';

const STORAGE_KEY = 'bankextract.onboarding.progress';

const defaultSteps = [
  {
    id: 'company_created',
    title: 'Criar ou selecionar empresa',
    description: 'Defina a empresa que vai operar a carteira financeira dentro do BankExtract.',
    actionTab: 'configuracoes',
  },
  {
    id: 'first_import',
    title: 'Importar primeiro arquivo',
    description: 'Envie a primeira planilha ou documento para popular a carteira e o historico.',
    actionTab: 'importacao',
  },
  {
    id: 'billing_configured',
    title: 'Configurar cobranca',
    description: 'Revise regras, templates, integracoes e parametros da cobranca automatica.',
    actionTab: 'automacoes',
  },
  {
    id: 'first_automation',
    title: 'Executar primeira automacao ou simulacao',
    description: 'Rode a primeira simulacao assistida para validar o fluxo sem envio real.',
    actionTab: 'central-cobranca',
  },
];

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

const getMockProgressMap = (companyId) => {
  if (!companyId) return {};
  return readMockStore()[companyId] || {};
};

const buildProgressResponse = (steps = []) => {
  const completed = steps.filter((step) => step.done).length;
  const total = steps.length || 1;
  const progress = Math.round((completed / total) * 100);

  return {
    progress,
    completed,
    total,
    nextStep: steps.find((step) => !step.done) || null,
    steps,
  };
};

const safeBoolean = (value) => Boolean(value);

async function fetchDerivedStatus(companyId) {
  if (!companyId) {
    return {
      hasCompany: false,
      hasImport: false,
      hasBillingConfig: false,
      hasSimulation: false,
    };
  }

  if (!hasSupabaseConfig || !supabase) {
    const mock = getMockProgressMap(companyId);
    return {
      hasCompany: true,
      hasImport: safeBoolean(mock.first_import),
      hasBillingConfig: safeBoolean(mock.billing_configured),
      hasSimulation: safeBoolean(mock.first_automation),
    };
  }

  const [
    { count: importCount, error: importError },
    { data: billingConfig, error: billingError },
    { count: simulationCount, error: simulationError },
    { data: explicitSteps, error: stepsError },
  ] = await Promise.all([
    supabase
      .from('importacoes')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
    supabase
      .from('whatsapp_cobranca_config')
      .select('empresa_id, ativo, hora_envio, mensagem_template, template_preventiva, template_vencimento, template_atraso')
      .eq('empresa_id', companyId)
      .maybeSingle(),
    supabase
      .from('logs_cobranca')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
    supabase
      .from('onboarding_progress')
      .select('step_key, completed')
      .eq('company_id', companyId),
  ]);

  if (importError) {
    throw new Error(importError.message || 'Falha ao verificar importacoes do onboarding.');
  }
  if (billingError) {
    throw new Error(billingError.message || 'Falha ao verificar configuracao de cobranca.');
  }
  if (simulationError) {
    throw new Error(simulationError.message || 'Falha ao verificar simulacoes do onboarding.');
  }
  if (stepsError) {
    throw new Error(stepsError.message || 'Falha ao verificar progresso do onboarding.');
  }

  const explicitMap = new Map((explicitSteps || []).map((item) => [item.step_key, Boolean(item.completed)]));
  const hasBillingConfig = Boolean(
    billingConfig?.ativo ||
    billingConfig?.hora_envio ||
    billingConfig?.mensagem_template ||
    billingConfig?.template_preventiva ||
    billingConfig?.template_vencimento ||
    billingConfig?.template_atraso
  );

  return {
    hasCompany: true,
    hasImport: (importCount || 0) > 0,
    hasBillingConfig,
    hasSimulation: (simulationCount || 0) > 0,
    explicitMap,
  };
}

export async function getOnboardingStatus(companyId) {
  const derived = await fetchDerivedStatus(companyId);
  const mockProgress = !hasSupabaseConfig ? getMockProgressMap(companyId) : {};
  const explicitMap = derived.explicitMap || new Map();

  const steps = defaultSteps.map((step) => {
    let done = false;

    if (step.id === 'company_created') done = derived.hasCompany;
    if (step.id === 'first_import') done = derived.hasImport;
    if (step.id === 'billing_configured') done = derived.hasBillingConfig;
    if (step.id === 'first_automation') done = derived.hasSimulation;

    if (explicitMap.has(step.id)) {
      done = Boolean(explicitMap.get(step.id));
    }

    // Backward compatibility for earlier local/manual keys.
    const legacyKeyMap = {
      company_created: 'empresa',
      first_import: 'primeiro-arquivo',
      billing_configured: 'configurar-cobranca',
      first_automation: 'primeira-simulacao',
    };
    if (explicitMap.has(legacyKeyMap[step.id])) {
      done = Boolean(explicitMap.get(legacyKeyMap[step.id]));
    }

    if (mockProgress[step.id] === true) {
      done = true;
    }

    return {
      ...step,
      done,
    };
  });

  return buildProgressResponse(steps);
}

export async function markOnboardingStep(companyId, stepKey) {
  if (!companyId || !stepKey) {
    return false;
  }

  if (!hasSupabaseConfig || !supabase) {
    const store = readMockStore();
    const current = store[companyId] || {};
    store[companyId] = {
      ...current,
      [stepKey]: true,
      [`${stepKey}_completed_at`]: new Date().toISOString(),
    };
    writeMockStore(store);
    return true;
  }

  const payload = {
    company_id: companyId,
    step_key: stepKey,
    completed: true,
    completed_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('onboarding_progress')
    .upsert(payload, { onConflict: 'company_id,step_key' });

  if (error) {
    throw new Error(error.message || 'Falha ao registrar etapa do onboarding.');
  }

  return true;
}

export async function getOnboardingProgress(companyId) {
  const status = await getOnboardingStatus(companyId);
  return {
    progress: status.progress,
    completed: status.completed,
    total: status.total,
  };
}

export default {
  getOnboardingStatus,
  markOnboardingStep,
  getOnboardingProgress,
};
