import { supabase, hasSupabaseConfig } from './supabaseClient';
import { createScopedLogger } from './loggerService';

const logger = createScopedLogger('billing');

function assertSupabase() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase nao configurado para o billing.');
  }
}

async function invokeBilling(body, fallbackMessage) {
  assertSupabase();
  logger.info('invoke_requested', {
    action: body.action,
    company_id: body.companyId || body.company_id,
    plan_code: body.planCode || body.plan_code,
  });

  const { data, error } = await supabase.functions.invoke('stripe-billing', { body });
  logger.info('invoke_response', {
    action: body.action,
    has_url: !!data?.url,
    has_error: Boolean(error),
  });

  if (error) {
    logger.error('invoke_failed', error, { action: body.action });
    throw new Error(error.message || fallbackMessage);
  }

  if (data?.success === false || data?.ok === false) {
    logger.error('invoke_failed_response', new Error(data?.error || fallbackMessage), { action: body.action, data });
    throw new Error(data?.error || fallbackMessage);
  }

  return data;
}

export async function createStripeCheckoutSession({
  companyId,
  planCode,
  successUrl,
  cancelUrl,
}) {
  return invokeBilling(
    {
      action: 'create_checkout_session',
      companyId,
      company_id: companyId,
      planCode,
      plan_code: planCode,
      successUrl,
      cancelUrl,
    },
    'Falha ao iniciar o checkout Stripe.',
  );
}

export async function createStripePortalSession({
  companyId,
  returnUrl,
}) {
  return invokeBilling(
    {
      action: 'create_customer_portal_session',
      companyId,
      company_id: companyId,
      returnUrl,
    },
    'Falha ao abrir o portal do cliente Stripe.',
  );
}

export default {
  createStripeCheckoutSession,
  createStripePortalSession,
};
