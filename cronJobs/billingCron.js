const {
  SUPABASE_URL,
  BILLING_CRON_SECRET,
  BILLING_AUTOMATION_COMPANY_ID,
} = process.env;

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL nao configurado.');
}

if (!BILLING_CRON_SECRET) {
  throw new Error('BILLING_CRON_SECRET nao configurado.');
}

const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/billing-automation`;

async function run() {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': BILLING_CRON_SECRET,
    },
    body: JSON.stringify({
      action: 'run',
      company_id: BILLING_AUTOMATION_COMPANY_ID || null,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Falha no cron de cobranca (${response.status}).`);
  }

  console.log('[billingCron] sucesso', payload);
}

run().catch((error) => {
  console.error('[billingCron] erro', error);
  process.exitCode = 1;
});
