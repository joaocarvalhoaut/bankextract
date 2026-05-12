import { checkFeatureAccess, checkUsageLimit, getCompanySubscription, getUsageLimits } from './subscriptionService';
import { checkSendPermission } from './billingAutomationService';

const FRIENDLY_MESSAGES = {
  PLAN_RESTRICTED: 'Seu plano atual nao libera esta funcionalidade. Faca upgrade para continuar.',
  LIMIT_REACHED: 'O limite do seu plano foi atingido. Ajuste o plano ou aguarde o proximo ciclo.',
  SUBSCRIPTION_INACTIVE: 'A assinatura da empresa nao esta apta para novos envios reais no momento.',
  FEATURE_BLOCKED: 'Esta funcionalidade nao esta disponivel no plano atual.',
};

export async function getSubscriptionLimitsContext(companyId) {
  const [subscription, usage] = await Promise.all([
    getCompanySubscription(companyId),
    getUsageLimits(companyId),
  ]);

  return {
    subscription,
    usage,
    plan: subscription?.currentPlan || null,
    status: subscription?.status || usage?.status || 'trialing',
  };
}

export async function getFeatureGate(companyId, featureKey) {
  const result = await checkFeatureAccess(companyId, featureKey);
  return {
    ...result,
    message: result.allowed ? null : (FRIENDLY_MESSAGES[result.reason] || 'Funcionalidade indisponivel para o plano atual.'),
    gate: result.allowed ? 'open' : 'hard',
  };
}

export async function getUsageGate(companyId, limitKey, currentUsage = 0) {
  const result = await checkUsageLimit(companyId, limitKey, currentUsage);
  return {
    ...result,
    message: result.allowed ? null : (FRIENDLY_MESSAGES[result.reason] || 'Limite do plano atingido.'),
    gate: result.allowed ? (result.remaining <= Math.max(1, Math.ceil(result.maxAllowed * 0.2)) ? 'soft' : 'open') : 'hard',
  };
}

export async function getSendGate(companyId, sendType = 'manual', quantity = 1) {
  const result = await checkSendPermission(companyId, sendType, quantity);
  return {
    ...result,
    message: result.message || FRIENDLY_MESSAGES[result.reason] || null,
    gate: result.allowed ? 'open' : 'hard',
  };
}

export default {
  getSubscriptionLimitsContext,
  getFeatureGate,
  getUsageGate,
  getSendGate,
};
