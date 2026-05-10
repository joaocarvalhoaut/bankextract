import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AdminClient = ReturnType<typeof createClient>;

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  billing_period: string;
  trial_days: number;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  limits_json: Record<string, unknown> | null;
  features_json: unknown[] | null;
  active: boolean;
  highlighted: boolean;
};

type SubscriptionRow = {
  id: string;
  company_id: string;
  plan_id: string | null;
  plan_code: string;
  status: string;
  provider: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  billing_email: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  metadata: Record<string, unknown> | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getEnv(name: string) {
  return String(Deno.env.get(name) || '').trim();
}

function requireEnv(name: string) {
  const value = getEnv(name);
  if (!value) throw new Error(`${name} nao configurado.`);
  return value;
}

function getBaseUrl(req: Request) {
  return (
    getEnv('APP_BASE_URL') ||
    getEnv('SITE_URL') ||
    new URL(req.url).origin
  );
}

function getPlanPriceFallback(planCode: string) {
  const map: Record<string, string> = {
    starter: getEnv('STRIPE_PRICE_STARTER'),
    pro: getEnv('STRIPE_PRICE_PRO'),
    business: getEnv('STRIPE_PRICE_BUSINESS'),
  };
  return map[planCode] || '';
}

function buildAdminClient() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, serviceRoleKey);
}

function buildAuthClient(req: Request) {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') || '',
      },
    },
  });
}

async function getAuthenticatedUser(req: Request) {
  const authClient = buildAuthClient(req);
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) {
    throw new Error('Sessao invalida para billing.');
  }

  return user;
}

async function userHasCompanyAccess(admin: AdminClient, userId: string, companyId: string) {
  const [{ data: membership }, { data: systemAdmin }] = await Promise.all([
    admin
      .from('usuarios_empresas')
      .select('id')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle(),
    admin
      .from('system_admins')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  return Boolean(membership?.id || systemAdmin?.id);
}

async function getCompany(admin: AdminClient, companyId: string) {
  const { data, error } = await admin
    .from('empresas')
    .select('id, nome, subscription_plan, subscription_status')
    .eq('id', companyId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message || 'Empresa nao encontrada.');
  }

  return data;
}

async function getPlan(admin: AdminClient, planCode: string): Promise<PlanRow> {
  const { data, error } = await admin
    .from('plans')
    .select('*')
    .eq('code', planCode)
    .eq('active', true)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message || 'Plano nao encontrado para checkout.');
  }

  return data as PlanRow;
}

async function ensureSubscription(admin: AdminClient, companyId: string, planCode = 'starter') {
  const { data: existing, error } = await admin
    .from('subscriptions')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Falha ao carregar assinatura.');
  }

  if (existing) {
    return existing as SubscriptionRow;
  }

  const plan = await getPlan(admin, planCode);
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + Number(plan.trial_days || 7) * 86400000);

  const { data: created, error: insertError } = await admin
    .from('subscriptions')
    .insert({
      company_id: companyId,
      plan_id: plan.id,
      plan_code: plan.code,
      status: 'trialing',
      provider: 'stripe',
      trial_starts_at: now.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: trialEndsAt.toISOString(),
      cancel_at_period_end: false,
      metadata: { source: 'stripe-billing' },
    })
    .select('*')
    .single();

  if (insertError || !created) {
    throw new Error(insertError?.message || 'Falha ao criar assinatura trial.');
  }

  return created as SubscriptionRow;
}

async function fetchStripe(path: string, init: RequestInit) {
  const secretKey = requireEnv('STRIPE_SECRET_KEY');
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Stripe erro ${response.status}.`);
  }

  return data;
}

async function ensureStripeCustomer(
  admin: AdminClient,
  subscription: SubscriptionRow,
  companyName: string,
  billingEmail: string,
) {
  if (subscription.stripe_customer_id) {
    return subscription.stripe_customer_id;
  }

  const payload = new URLSearchParams();
  payload.set('name', companyName);
  if (billingEmail) payload.set('email', billingEmail);
  payload.set('metadata[company_id]', subscription.company_id);
  payload.set('metadata[subscription_id]', subscription.id);

  const customer = await fetchStripe('customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload.toString(),
  });

  const customerId = String(customer?.id || '');
  if (!customerId) {
    throw new Error('Falha ao criar customer Stripe.');
  }

  await admin
    .from('subscriptions')
    .update({
      stripe_customer_id: customerId,
      billing_email: billingEmail || subscription.billing_email || null,
    })
    .eq('id', subscription.id);

  return customerId;
}

function getTrialDaysRemaining(subscription: SubscriptionRow, plan: PlanRow) {
  if (subscription.status !== 'trialing' || !subscription.trial_ends_at) {
    return 0;
  }

  const end = new Date(subscription.trial_ends_at).getTime();
  const diffDays = Math.ceil((end - Date.now()) / 86400000);
  if (diffDays <= 0) return 0;
  return Math.min(diffDays, Number(plan.trial_days || 7) || 7);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    if (!action) {
      return jsonResponse({ success: false, error: 'Action obrigatoria.' }, 400);
    }

    const user = await getAuthenticatedUser(req);
    const admin = buildAdminClient();
    const companyId = String(body?.companyId || body?.company_id || '').trim();

    if (!companyId) {
      return jsonResponse({ success: false, error: 'companyId obrigatorio.' }, 400);
    }

    const canAccess = await userHasCompanyAccess(admin, user.id, companyId);
    if (!canAccess) {
      return jsonResponse({ success: false, error: 'Acesso negado para esta empresa.' }, 403);
    }

    const company = await getCompany(admin, companyId);

    if (action === 'create_checkout_session') {
      const planCode = String(body?.planCode || body?.plan_code || '').trim() || 'starter';
      const plan = await getPlan(admin, planCode);
      const subscription = await ensureSubscription(admin, companyId, planCode);
      const customerId = await ensureStripeCustomer(admin, subscription, company.nome || 'Empresa', user.email || '');
      const priceId = plan.stripe_price_id || getPlanPriceFallback(plan.code);

      if (!priceId) {
        return jsonResponse({
          success: false,
          error: 'Plano sem Stripe Price ID configurado.',
        }, 400);
      }

      const successUrl = String(body?.successUrl || `${getBaseUrl(req)}/billing?checkout=success`).trim();
      const cancelUrl = String(body?.cancelUrl || `${getBaseUrl(req)}/billing?checkout=cancel`).trim();
      const params = new URLSearchParams();
      params.set('mode', 'subscription');
      params.set('customer', customerId);
      params.set('success_url', successUrl);
      params.set('cancel_url', cancelUrl);
      params.set('allow_promotion_codes', 'true');
      params.set('line_items[0][price]', priceId);
      params.set('line_items[0][quantity]', '1');
      params.set('metadata[company_id]', companyId);
      params.set('metadata[plan_code]', plan.code);
      params.set('subscription_data[metadata][company_id]', companyId);
      params.set('subscription_data[metadata][plan_code]', plan.code);

      const remainingTrialDays = getTrialDaysRemaining(subscription, plan);
      if (!subscription.stripe_subscription_id && remainingTrialDays > 0) {
        params.set('subscription_data[trial_period_days]', String(remainingTrialDays));
      }

      const session = await fetchStripe('checkout/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      await admin
        .from('subscriptions')
        .update({
          plan_id: plan.id,
          plan_code: plan.code,
          stripe_customer_id: customerId,
          stripe_checkout_session_id: session?.id || null,
          billing_email: user.email || subscription.billing_email || null,
          metadata: {
            ...(subscription.metadata || {}),
            last_checkout_created_at: new Date().toISOString(),
          },
        })
        .eq('id', subscription.id);

      return jsonResponse({
        success: true,
        sessionId: session?.id || null,
        url: session?.url || null,
      });
    }

    if (action === 'create_customer_portal_session') {
      const subscription = await ensureSubscription(admin, companyId, String(company.subscription_plan || 'starter'));
      const customerId = await ensureStripeCustomer(admin, subscription, company.nome || 'Empresa', user.email || '');
      const returnUrl = String(body?.returnUrl || `${getBaseUrl(req)}/billing`).trim();
      const params = new URLSearchParams();
      params.set('customer', customerId);
      params.set('return_url', returnUrl);

      const session = await fetchStripe('billing_portal/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      await admin
        .from('subscriptions')
        .update({
          stripe_customer_id: customerId,
          stripe_portal_last_url: session?.url || null,
        })
        .eq('id', subscription.id);

      return jsonResponse({
        success: true,
        url: session?.url || null,
      });
    }

    return jsonResponse({ success: false, error: 'Action nao suportada.' }, 400);
  } catch (error) {
    console.error('[stripe-billing] erro', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno no billing Stripe.',
      },
      500,
    );
  }
});
