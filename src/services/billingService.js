import { supabase, hasSupabaseConfig } from './supabaseClient';

function assertSupabase() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase nao configurado para o billing.');
  }
}

async function invokeBilling(body, fallbackMessage) {
  assertSupabase();

  console.log('[billingService] invoking stripe-billing:', {
    action: body.action,
    companyId: body.companyId || body.company_id,
    planCode: body.planCode || body.plan_code,
  });

  const { data, error } = await supabase.functions.invoke('stripe-billing', { body });

  console.log('[billingService] stripe-billing response:', { data, error, hasUrl: !!data?.url });

  if (error) {
    console.error('[billingService] stripe-billing error:', error);
    throw new Error(error.message || fallbackMessage);
  }

  if (data?.success === false) {
    console.error('[billingService] stripe-billing returned success=false:', data?.error);
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
