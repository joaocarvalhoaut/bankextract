import { createScopedLogger } from './loggerService';
import { hasSupabaseConfig, supabase } from './supabaseClient';

const STORAGE_KEY = 'bankextract.onboarding.progress';
const logger = createScopedLogger('onboarding');

const defaultSteps = [
  {
    id: 'connect_whatsapp',
    title: 'Conectar WhatsApp',
    description: 'Ative a integracao Z-API para permitir envio real, QR Code e tracking da cobranca.',
    actionTab: 'integracoes',
    helpArticleId: 'integracoes-zapi',
    metricLabel: 'WhatsApp pronto',
  },
  {
    id: 'import_clients',
    title: 'Importar clientes',
    description: 'Traga a primeira carteira para habilitar analytics, cobranca e governanca comercial.',
    actionTab: 'importacao',
    helpArticleId: 'importar-carteira',
    metricLabel: 'Carteira importada',
  },
  {
    id: 'create_first_automation',
    title: 'Criar primeira automacao',
    description: 'Configure a base da regua para escalar cobranca com menos operacao manual.',
    actionTab: 'automacoes',
    helpArticleId: 'preparar-cobranca',
    metricLabel: 'Regua configurada',
  },
  {
    id: 'send_first_charge',
    title: 'Enviar primeira cobranca',
    description: 'Execute o primeiro envio ou simulacao para validar o fluxo ponta a ponta.',
    actionTab: 'cobrancas',
    helpArticleId: 'executar-simulacao',
    metricLabel: 'Primeiro envio',
  },
  {
    id: 'configure_billing',
    title: 'Configurar billing',
    description: 'Valide trial, assinatura e limite comercial para colocar a empresa em operacao real.',
    actionTab: 'billing',
    helpArticleId: 'planos-billing',
    metricLabel: 'Billing validado',
  },
];

const LEGACY_STEP_KEYS = {
  connect_whatsapp: ['connect_whatsapp'],
  import_clients: ['first_import', 'import_clients', 'primeiro-arquivo'],
  create_first_automation: ['billing_configured', 'create_first_automation', 'configurar-cobranca'],
  send_first_charge: ['first_automation', 'send_first_charge', 'primeira-simulacao'],
  configure_billing: ['configure_billing'],
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

const getMockProgressMap = (companyId) => {
  if (!companyId) return {};
  return readMockStore()[companyId] || {};
};

const buildProgressResponse = (steps = [], derived = {}) => {
  const completed = steps.filter((step) => step.done).length;
  const total = steps.length || 1;
  const progress = Math.round((completed / total) * 100);

  return {
    progress,
    completed,
    total,
    nextStep: steps.find((step) => !step.done) || null,
    steps,
    insights: [
      {
        id: 'onboarding-health',
        label: 'Ativacao',
        value: `${progress}%`,
        tone: progress === 100 ? 'success' : progress >= 60 ? 'info' : 'warning',
      },
      {
        id: 'whatsapp-status',
        label: 'WhatsApp',
        value: derived.hasWhatsapp ? 'Conectado' : 'Pendente',
        tone: derived.hasWhatsapp ? 'success' : 'warning',
      },
      {
        id: 'billing-status',
        label: 'Billing',
        value: derived.hasBilling ? 'Ativo' : 'Pendente',
        tone: derived.hasBilling ? 'success' : 'warning',
      },
    ],
  };
};

const safeBoolean = (value) => Boolean(value);

async function fetchDerivedStatus(companyId) {
  if (!companyId) {
    return {
      hasCompany: false,
      hasWhatsapp: false,
      hasImport: false,
      hasAutomation: false,
      hasChargeSent: false,
      hasBilling: false,
      explicitMap: new Map(),
    };
  }

  if (!hasSupabaseConfig || !supabase) {
    const mock = getMockProgressMap(companyId);
    return {
      hasCompany: true,
      hasWhatsapp: safeBoolean(mock.connect_whatsapp),
      hasImport: safeBoolean(mock.import_clients),
      hasAutomation: safeBoolean(mock.create_first_automation),
      hasChargeSent: safeBoolean(mock.send_first_charge),
      hasBilling: safeBoolean(mock.configure_billing),
      explicitMap: new Map(),
    };
  }

  logger.debug('derived_status_requested', { company_id: companyId });

  const [
    { count: importCount, error: importError },
    { data: automationConfig, error: automationError },
    { count: chargeLogCount, error: chargeError },
    { data: explicitSteps, error: stepsError },
    { data: subscriptionRow, error: subscriptionError },
    { data: integrations, error: integrationError },
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
    supabase
      .from('subscriptions')
      .select('status, plan_code, trial_ends_at, stripe_customer_id, stripe_subscription_id')
      .eq('company_id', companyId)
      .maybeSingle(),
    supabase
      .from('company_integrations')
      .select('provider, connected, phone_number')
      .eq('company_id', companyId),
  ]);

  if (importError) throw new Error(importError.message || 'Falha ao verificar importacoes do onboarding.');
  if (automationError) throw new Error(automationError.message || 'Falha ao verificar automacoes do onboarding.');
  if (chargeError) throw new Error(chargeError.message || 'Falha ao verificar cobrancas do onboarding.');
  if (stepsError) throw new Error(stepsError.message || 'Falha ao verificar progresso do onboarding.');
  if (subscriptionError) throw new Error(subscriptionError.message || 'Falha ao verificar billing do onboarding.');
  if (integrationError) throw new Error(integrationError.message || 'Falha ao verificar integracoes do onboarding.');

  const explicitMap = new Map((explicitSteps || []).map((item) => [item.step_key, Boolean(item.completed)]));
  const hasAutomation = Boolean(
    automationConfig?.ativo ||
    automationConfig?.hora_envio ||
    automationConfig?.mensagem_template ||
    automationConfig?.template_preventiva ||
    automationConfig?.template_vencimento ||
    automationConfig?.template_atraso
  );
  const hasWhatsapp = (integrations || []).some((item) => String(item.provider || '').toLowerCase() === 'zapi' && item.connected);
  const hasBilling = Boolean(subscriptionRow?.status || subscriptionRow?.plan_code || subscriptionRow?.trial_ends_at);

  return {
    hasCompany: true,
    hasWhatsapp,
    hasImport: (importCount || 0) > 0,
    hasAutomation,
    hasChargeSent: (chargeLogCount || 0) > 0,
    hasBilling,
    explicitMap,
    subscriptionStatus: subscriptionRow?.status || '',
  };
}

export async function getOnboardingStatus(companyId) {
  const derived = await fetchDerivedStatus(companyId);
  const mockProgress = !hasSupabaseConfig ? getMockProgressMap(companyId) : {};
  const explicitMap = derived.explicitMap || new Map();

  const steps = defaultSteps.map((step) => {
    let done = false;

    if (step.id === 'connect_whatsapp') done = derived.hasWhatsapp;
    if (step.id === 'import_clients') done = derived.hasImport;
    if (step.id === 'create_first_automation') done = derived.hasAutomation;
    if (step.id === 'send_first_charge') done = derived.hasChargeSent;
    if (step.id === 'configure_billing') done = derived.hasBilling;

    if (explicitMap.has(step.id)) {
      done = Boolean(explicitMap.get(step.id));
    }

    for (const legacyKey of LEGACY_STEP_KEYS[step.id] || []) {
      if (explicitMap.has(legacyKey)) {
        done = Boolean(explicitMap.get(legacyKey));
      }
      if (mockProgress[legacyKey] === true) {
        done = true;
      }
    }

    return {
      ...step,
      done,
    };
  });

  logger.info('status_loaded', {
    company_id: companyId,
    progress: steps.filter((step) => step.done).length,
    total: steps.length,
  });

  return buildProgressResponse(steps, derived);
}

export async function markOnboardingStep(companyId, stepKey) {
  if (!companyId || !stepKey) {
    return false;
  }

  logger.info('mark_step_requested', { company_id: companyId, step_key: stepKey });

  if (!hasSupabaseConfig || !supabase) {
    const store = readMockStore();
    const current = store[companyId] || {};
    store[companyId] = {
      ...current,
      [stepKey]: true,
      [`${stepKey}_completed_at`]: new Date().toISOString(),
    };
    writeMockStore(store);
    logger.info('mark_step_succeeded_mock', { company_id: companyId, step_key: stepKey });
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
    logger.error('mark_step_failed', error, { company_id: companyId, step_key: stepKey });
    throw new Error(error.message || 'Falha ao registrar etapa do onboarding.');
  }

  logger.info('mark_step_succeeded', { company_id: companyId, step_key: stepKey });
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

// ── ETAPA 11: Wizard de onboarding SaaS ──────────────────────────────────────

export const WIZARD_STEPS = [
  { id: 'welcome',             title: 'Bem-vindo',          icon: 'Rocket' },
  { id: 'connect_whatsapp',   title: 'WhatsApp Z-API',     icon: 'Smartphone' },
  { id: 'connect_drive',      title: 'Google Drive',       icon: 'FolderOpen' },
  { id: 'validate_env',       title: 'Validar Ambiente',   icon: 'ShieldCheck' },
  { id: 'configure_messages', title: 'Mensagens',          icon: 'MessageSquare' },
  { id: 'test_dispatch',      title: 'Primeiro Dispatch',  icon: 'SendHorizonal' },
  { id: 'complete',           title: 'Pronto!',            icon: 'PartyPopper' },
];

export const TEMPLATE_PRESETS = [
  {
    id: 'amigavel',
    label: 'Amigavel',
    tone: 'Amigavel e positivo',
    description: 'Tom leve e colaborativo — ideal para relacoes comerciais de longo prazo.',
    template_preventiva: 'Ola, {{cliente}}! Passando para lembrar que o boleto de R$ {{valor}} vence em breve ({{vencimento}}). Qualquer duvida, fale com a gente!',
    template_vencimento: 'Ola, {{cliente}}! Hoje e o dia do vencimento do seu boleto de R$ {{valor}} (doc. {{documento}}). Caso ja tenha pago, desconsidere.',
    template_atraso: 'Oi, {{cliente}}! Identificamos o boleto ref. {{documento}} com R$ {{valor}} em atraso ha {{dias_atraso}} dia(s). Podemos ajudar a regularizar? Fale com a gente!',
  },
  {
    id: 'neutro',
    label: 'Neutro',
    tone: 'Profissional e objetivo',
    description: 'Tom direto e institucional — adequado para a maioria dos contextos B2B.',
    template_preventiva: 'Prezado(a) {{cliente}}, informamos que o boleto no valor de R$ {{valor}} vencera em {{vencimento}}. Em caso de duvidas, entre em contato.',
    template_vencimento: 'Prezado(a) {{cliente}}, o boleto ref. {{documento}} no valor de R$ {{valor}} vence hoje. Pedimos a gentileza de efetuar o pagamento.',
    template_atraso: 'Prezado(a) {{cliente}}, o boleto ref. {{documento}} (R$ {{valor}}) esta em atraso ha {{dias_atraso}} dia(s). Solicitamos a regularizacao do debito.',
  },
  {
    id: 'firme',
    label: 'Firme',
    tone: 'Direto e assertivo',
    description: 'Tom assertivo sem agressividade — recomendado para atrasos recorrentes.',
    template_preventiva: '{{cliente}}, boleto de R$ {{valor}} vence em {{vencimento}}. Evite encargos realizando o pagamento ate a data.',
    template_vencimento: '{{cliente}}, o boleto {{documento}} de R$ {{valor}} vence HOJE. Efetue o pagamento para evitar encargos.',
    template_atraso: '{{cliente}}, ha {{dias_atraso}} dia(s) identificamos o boleto {{documento}} de R$ {{valor}} em aberto. Regularize o quanto antes para evitar juros e multa.',
  },
  {
    id: 'juridico',
    label: 'Juridico',
    tone: 'Formal com implicacoes legais',
    description: 'Tom formal com mencao a encargos e protesto — para devedores reincidentes.',
    template_preventiva: 'Comunicamos a V.Sa. {{cliente}} que o titulo {{documento}} no valor de R$ {{valor}} vencera em {{vencimento}}. Solicitamos providencias para evitar encargos contratuais.',
    template_vencimento: 'Notificamos V.Sa. {{cliente}} sobre o vencimento do titulo {{documento}} no valor de R$ {{valor}} nesta data. O nao pagamento sujeita o devedor a encargos previstos em contrato.',
    template_atraso: 'Notificamos V.Sa. {{cliente}} que o titulo {{documento}} (R$ {{valor}}) encontra-se em atraso ha {{dias_atraso}} dia(s). Decorrido o prazo legal, o titulo podera ser encaminhado a protesto e negativacao.',
  },
];

export async function getWizardProgress(companyId) {
  if (!companyId) return null;

  if (!hasSupabaseConfig || !supabase) {
    const store = readMockStore();
    const wiz = (store[`wizard:${companyId}`]) || null;
    return wiz;
  }

  const { data, error } = await supabase
    .from('onboarding_wizard_progress')
    .select('current_step, completed_steps, completed_at, metadata')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    logger.error('get_wizard_progress_failed', error, { company_id: companyId });
    return null;
  }

  return data || null;
}

export async function saveWizardProgress(companyId, currentStep, completedSteps = [], metadata = {}) {
  if (!companyId || !currentStep) return false;

  logger.info('save_wizard_progress', { company_id: companyId, current_step: currentStep });

  if (!hasSupabaseConfig || !supabase) {
    const store = readMockStore();
    store[`wizard:${companyId}`] = { current_step: currentStep, completed_steps: completedSteps, metadata };
    writeMockStore(store);
    return true;
  }

  const { error } = await supabase
    .from('onboarding_wizard_progress')
    .upsert(
      {
        company_id: companyId,
        current_step: currentStep,
        completed_steps: completedSteps,
        metadata,
      },
      { onConflict: 'company_id' }
    );

  if (error) {
    logger.error('save_wizard_progress_failed', error, { company_id: companyId });
    throw new Error(error.message || 'Falha ao salvar progresso do wizard.');
  }

  return true;
}

export async function markWizardComplete(companyId, metadata = {}) {
  if (!companyId) return false;

  logger.info('mark_wizard_complete', { company_id: companyId });

  if (!hasSupabaseConfig || !supabase) {
    const store = readMockStore();
    store[`wizard:${companyId}`] = {
      ...(store[`wizard:${companyId}`] || {}),
      current_step: 'complete',
      completed_at: new Date().toISOString(),
      metadata,
    };
    writeMockStore(store);
    return true;
  }

  const allStepIds = WIZARD_STEPS.map((s) => s.id);
  const { error } = await supabase
    .from('onboarding_wizard_progress')
    .upsert(
      {
        company_id: companyId,
        current_step: 'complete',
        completed_steps: allStepIds,
        completed_at: new Date().toISOString(),
        metadata,
      },
      { onConflict: 'company_id' }
    );

  if (error) {
    logger.error('mark_wizard_complete_failed', error, { company_id: companyId });
    throw new Error(error.message || 'Falha ao concluir o wizard.');
  }

  return true;
}

export default {
  getOnboardingStatus,
  markOnboardingStep,
  getOnboardingProgress,
  getWizardProgress,
  saveWizardProgress,
  markWizardComplete,
  WIZARD_STEPS,
  TEMPLATE_PRESETS,
};
