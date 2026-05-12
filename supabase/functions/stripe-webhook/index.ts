import {
  buildAdminClient,
  createRequestContext,
  errorResponse,
  jsonResponse,
  logRuntime,
  requireEnv,
  successResponse,
} from '../_shared/runtime.ts';

type AdminClient = ReturnType<typeof buildAdminClient>;

function getEnv(name: string) {
  return String(Deno.env.get(name) || '').trim();
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
  if (normalized === 'trialing' || normalized === 'trial') return 'trialing';
  if (normalized === 'active') return 'active';
  if (normalized === 'past_due' || normalized === 'unpaid') return 'past_due';
  if (normalized === 'canceled') return 'canceled';
  if (normalized === 'incomplete_expired' || normalized === 'expired') return 'expired';
  if (normalized === 'blocked') return 'blocked';
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

async function upsertBillingEvent(
  admin: AdminClient,
  payload: {
    companyId?: string | null;
    subscriptionId?: string | null;
    eventType: string;
    status: 'pending' | 'processed' | 'failed' | 'duplicate' | 'retrying';
    externalReference?: string | null;
    source?: string;
    metadata?: Record<string, unknown>;
    rawPayload?: Record<string, unknown>;
  },
) {
  try {
    const { error } = await admin.from('billing_events').upsert({
      company_id: payload.companyId || null,
      subscription_id: payload.subscriptionId || null,
      event_type: payload.eventType,
      status: payload.status,
      source: payload.source || 'stripe',
      external_reference: payload.externalReference || null,
      metadata: payload.metadata || {},
      payload: payload.rawPayload || {},
    }, {
      onConflict: 'source,external_reference',
    });

    if (error) throw error;
  } catch (error) {
    console.warn('[stripe-webhook] billing_events unavailable', error instanceof Error ? error.message : error);
  }
}

async function isDuplicateEvent(admin: AdminClient, eventId: string) {
  try {
    const { data } = await admin
      .from('billing_events')
      .select('id, status')
      .eq('source', 'stripe')
      .eq('external_reference', eventId)
      .in('status', ['processed', 'duplicate'])
      .maybeSingle();

    return Boolean(data?.id);
  } catch {
    return false;
  }
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
  const ctx = createRequestContext(req, { module: 'stripe-webhook', action: 'webhook' });

  try {
    const rawBody = await req.text();
    await verifyStripeSignature(rawBody, req.headers.get('Stripe-Signature'));

    const event = JSON.parse(rawBody || '{}');
    const admin = buildAdminClient();
    const eventId = String(event?.id || '').trim();
    const eventType = String(event?.type || 'unknown');

    ctx.action = eventType;

    if (eventId && await isDuplicateEvent(admin, eventId)) {
      await upsertBillingEvent(admin, {
        eventType,
        status: 'duplicate',
        externalReference: eventId,
        rawPayload: event,
      });
      logRuntime(ctx, { status: 'warning', metadata: { duplicate: true, event_id: eventId } });
      return successResponse(ctx, { duplicate: true, event_id: eventId });
    }

    await upsertBillingEvent(admin, {
      eventType,
      status: 'pending',
      externalReference: eventId,
      rawPayload: event,
    });

    if (event?.type === 'checkout.session.completed') {
      const session = event?.data?.object || {};
      const synced = await upsertSubscriptionFromStripe(admin, {
        companyId: session?.metadata?.company_id || null,
        stripeCustomerId: session?.customer || null,
        stripeCheckoutSessionId: session?.id || null,
        stripeSubscriptionId: session?.subscription || null,
        billingEmail: session?.customer_details?.email || null,
        metadata: {
          checkout_completed: true,
        },
      });

      await upsertBillingEvent(admin, {
        companyId: session?.metadata?.company_id || null,
        subscriptionId: synced?.id || null,
        eventType,
        status: 'processed',
        externalReference: eventId,
        metadata: { phase: 'checkout_completed' },
        rawPayload: event,
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
      const synced = await upsertSubscriptionFromStripe(admin, {
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

      await upsertBillingEvent(admin, {
        companyId: subscription?.metadata?.company_id || null,
        subscriptionId: synced?.id || null,
        eventType,
        status: 'processed',
        externalReference: eventId,
        metadata: { phase: 'subscription_sync' },
        rawPayload: event,
      });
    }

    if (event?.type === 'invoice.payment_failed') {
      const invoice = event?.data?.object || {};
      const synced = await upsertSubscriptionFromStripe(admin, {
        companyId: invoice?.metadata?.company_id || null,
        stripeCustomerId: invoice?.customer || null,
        stripeSubscriptionId: invoice?.subscription || null,
        status: 'past_due',
        metadata: {
          invoice_payment_failed: true,
        },
      });

      await upsertBillingEvent(admin, {
        companyId: invoice?.metadata?.company_id || null,
        subscriptionId: synced?.id || null,
        eventType,
        status: 'processed',
        externalReference: eventId,
        metadata: { phase: 'payment_failed' },
        rawPayload: event,
      });
    }

    if (event?.type === 'invoice.paid') {
      const invoice = event?.data?.object || {};
      const synced = await upsertSubscriptionFromStripe(admin, {
        companyId: invoice?.metadata?.company_id || null,
        stripeCustomerId: invoice?.customer || null,
        stripeSubscriptionId: invoice?.subscription || null,
        status: 'active',
        metadata: {
          invoice_paid: true,
        },
      });

      await upsertBillingEvent(admin, {
        companyId: invoice?.metadata?.company_id || null,
        subscriptionId: synced?.id || null,
        eventType,
        status: 'processed',
        externalReference: eventId,
        metadata: { phase: 'invoice_paid' },
        rawPayload: event,
      });
    }

    logRuntime(ctx, { metadata: { event_id: eventId, event_type: eventType } });
    return successResponse(ctx, { event_id: eventId, event_type: eventType });
  } catch (error) {
    return errorResponse(ctx, error, {
      status: 400,
      code: 'STRIPE_WEBHOOK_FAILED',
    });
  }
});
