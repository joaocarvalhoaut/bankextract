import { createClient } from 'jsr:@supabase/supabase-js@2';

type AdminClient = ReturnType<typeof createClient>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
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

function buildAdminClient(): AdminClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyStripeSignature(rawBody: string, header: string | null) {
  const secret = requireEnv('STRIPE_WEBHOOK_SECRET');
  if (!header) throw new Error('Stripe-Signature ausente.');

  const parts = Object.fromEntries(
    header.split(',').map((item) => {
      const [key, value] = item.split('=');
      return [key, value];
    }),
  );

  const timestamp = parts.t;
  const signature = parts.v1;

  if (!timestamp || !signature) {
    throw new Error('Stripe-Signature invalida.');
  }

  const payload = `${timestamp}.${rawBody}`;
  const expected = await hmacSha256Hex(secret, payload);

  if (!timingSafeEqual(expected, signature)) {
    throw new Error('Assinatura Stripe invalida.');
  }
}

function mapStripeStatus(value: string) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'trialing') return 'trialing';
  if (normalized === 'active') return 'active';
  if (normalized === 'past_due' || normalized === 'unpaid') return 'past_due';
  if (normalized === 'canceled' || normalized === 'incomplete_expired') return 'canceled';
  return 'trialing';
}

async function findPlanByPriceId(admin: AdminClient, priceId: string | null) {
  if (!priceId) return null;

  const { data } = await admin
    .from('plans')
    .select('id, code')
    .eq('stripe_price_id', priceId)
    .maybeSingle();

  return data || null;
}

async function upsertSubscriptionFromStripe(admin: AdminClient, payload: {
  companyId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCheckoutSessionId?: string | null;
  planId?: string | null;
  planCode?: string | null;
  status?: string | null;
  billingEmail?: string | null;
  trialEndsAt?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  metadata?: Record<string, unknown>;
}) {
  let subscription = null as Record<string, unknown> | null;

  if (payload.stripeSubscriptionId) {
    const { data } = await admin
      .from('subscriptions')
      .select('*')
      .eq('stripe_subscription_id', payload.stripeSubscriptionId)
      .maybeSingle();
    subscription = data;
  }

  if (!subscription && payload.stripeCustomerId) {
    const { data } = await admin
      .from('subscriptions')
      .select('*')
      .eq('stripe_customer_id', payload.stripeCustomerId)
      .maybeSingle();
    subscription = data;
  }

  if (!subscription && payload.companyId) {
    const { data } = await admin
      .from('subscriptions')
      .select('*')
      .eq('company_id', payload.companyId)
      .maybeSingle();
    subscription = data;
  }

  const companyId = payload.companyId || String(subscription?.company_id || '').trim();
  if (!companyId) return null;

  const nextPayload = {
    company_id: companyId,
    plan_id: payload.planId || subscription?.plan_id || null,
    plan_code: payload.planCode || String(subscription?.plan_code || 'starter'),
    status: mapStripeStatus(payload.status || String(subscription?.status || 'trialing')),
    provider: 'stripe',
    stripe_customer_id: payload.stripeCustomerId || subscription?.stripe_customer_id || null,
    stripe_subscription_id: payload.stripeSubscriptionId || subscription?.stripe_subscription_id || null,
    stripe_checkout_session_id: payload.stripeCheckoutSessionId || subscription?.stripe_checkout_session_id || null,
    billing_email: payload.billingEmail || subscription?.billing_email || null,
    trial_starts_at: subscription?.trial_starts_at || null,
    trial_ends_at: payload.trialEndsAt || subscription?.trial_ends_at || null,
    current_period_start: payload.currentPeriodStart || subscription?.current_period_start || null,
    current_period_end: payload.currentPeriodEnd || subscription?.current_period_end || null,
    cancel_at_period_end: payload.cancelAtPeriodEnd ?? Boolean(subscription?.cancel_at_period_end),
    metadata: {
      ...(subscription?.metadata as Record<string, unknown> || {}),
      ...(payload.metadata || {}),
      last_webhook_at: new Date().toISOString(),
    },
  };

  const { data, error } = await admin
    .from('subscriptions')
    .upsert(nextPayload, { onConflict: 'company_id' })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Falha ao sincronizar assinatura Stripe.');
  }

  return data;
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();
    await verifyStripeSignature(rawBody, req.headers.get('Stripe-Signature'));
    const event = JSON.parse(rawBody);
    const admin = buildAdminClient();

    console.log('[STRIPE WEBHOOK]', event?.type);

    if (event?.type === 'checkout.session.completed') {
      const session = event?.data?.object || {};
      await upsertSubscriptionFromStripe(admin, {
        companyId: session?.metadata?.company_id || null,
        stripeCustomerId: session?.customer || null,
        stripeCheckoutSessionId: session?.id || null,
        stripeSubscriptionId: session?.subscription || null,
        billingEmail: session?.customer_details?.email || null,
        metadata: {
          checkout_completed: true,
        },
      });
    }

    if (
      event?.type === 'customer.subscription.created' ||
      event?.type === 'customer.subscription.updated' ||
      event?.type === 'customer.subscription.deleted'
    ) {
      const subscription = event?.data?.object || {};
      const priceId = subscription?.items?.data?.[0]?.price?.id || null;
      const plan = await findPlanByPriceId(admin, priceId);
      await upsertSubscriptionFromStripe(admin, {
        companyId: subscription?.metadata?.company_id || null,
        stripeCustomerId: subscription?.customer || null,
        stripeSubscriptionId: subscription?.id || null,
        planId: plan?.id || null,
        planCode: plan?.code || subscription?.metadata?.plan_code || null,
        status: event?.type === 'customer.subscription.deleted' ? 'canceled' : subscription?.status,
        trialEndsAt: subscription?.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        currentPeriodStart: subscription?.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
        currentPeriodEnd: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
        metadata: {
          stripe_event_type: event?.type,
        },
      });
    }

    if (event?.type === 'invoice.payment_failed') {
      const invoice = event?.data?.object || {};
      await upsertSubscriptionFromStripe(admin, {
        companyId: invoice?.metadata?.company_id || null,
        stripeCustomerId: invoice?.customer || null,
        stripeSubscriptionId: invoice?.subscription || null,
        status: 'past_due',
        metadata: {
          invoice_payment_failed: true,
        },
      });
    }

    if (event?.type === 'invoice.paid') {
      const invoice = event?.data?.object || {};
      await upsertSubscriptionFromStripe(admin, {
        companyId: invoice?.metadata?.company_id || null,
        stripeCustomerId: invoice?.customer || null,
        stripeSubscriptionId: invoice?.subscription || null,
        status: 'active',
        metadata: {
          invoice_paid: true,
        },
      });
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('[stripe-webhook] erro', error);
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro interno no webhook Stripe.',
      },
      400,
    );
  }
});
