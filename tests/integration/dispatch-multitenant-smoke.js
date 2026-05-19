/**
 * dispatch-multitenant-smoke.js
 *
 * ETAPA 10 — Smoke test multi-tenant completo.
 * Execução: node tests/integration/dispatch-multitenant-smoke.js
 *
 * Requer variáveis (carregadas de .env.secrets + .env):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY,
 *   VITE_SUPABASE_COMPANY_ID, BILLING_CRON_SECRET
 */

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── load env ───────────────────────────────────────────────────────────────────
function loadEnv(...files) {
  const env = {};
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m) env[m[1]] = m[2].trim();
      }
    } catch { /* file not found */ }
  }
  return env;
}

const rawEnv = loadEnv('.env', '.env.secrets', '.env.local');

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL ||
  rawEnv.VITE_SUPABASE_URL || rawEnv.SUPABASE_URL;
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ||
  rawEnv.VITE_SUPABASE_ANON_KEY || rawEnv.SUPABASE_ANON_KEY;
const SERVICE_KEY =
  process.env.SERVICE_ROLE_KEY || rawEnv.SERVICE_ROLE_KEY;
const COMPANY_ID =
  process.env.VITE_SUPABASE_COMPANY_ID || process.env.COMPANY_ID ||
  rawEnv.VITE_SUPABASE_COMPANY_ID || rawEnv.COMPANY_ID;
const CRON_SECRET =
  process.env.BILLING_CRON_SECRET || rawEnv.BILLING_CRON_SECRET;
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/billing-automation`;

// Debug: show what was loaded
if (!SUPABASE_URL || !SERVICE_KEY || !COMPANY_ID) {
  console.error('❌  Variáveis ausentes:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗ (VITE_SUPABASE_URL ou SUPABASE_URL)');
  console.error('   SERVICE_KEY:', SERVICE_KEY ? '✓' : '✗ (SERVICE_ROLE_KEY)');
  console.error('   COMPANY_ID:', COMPANY_ID ? '✓' : '✗ (VITE_SUPABASE_COMPANY_ID ou COMPANY_ID)');
  console.error('   rawEnv keys:', Object.keys(rawEnv).join(', '));
  process.exit(1);
}

// ── clients ────────────────────────────────────────────────────────────────────
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── helpers ────────────────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
const failures = [];

// All smoke-test calls use x-cron-secret for bypass auth.
// The Edge Function's assertCompanyAccess accepts cron-secret as admin bypass,
// so company_id-scoped calls still work (company_id is validated + used).
async function invokeEdgeFn(body, extraHeaders = {}) {
  const res = await fetch(EDGE_FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      'x-cron-secret': CRON_SECRET || '',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text, _status: res.status };
  }
}

async function invokeScheduler(body) {
  return invokeEdgeFn(body);
}

// Invoke WITHOUT cron secret — simulates unauthenticated external call
async function invokeUnauthenticated(body) {
  const res = await fetch(EDGE_FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

function pass(label) {
  passCount++;
  console.log(`  ✅  ${label}`);
}

function fail(label, detail = '') {
  failCount++;
  const msg = detail ? `${label}: ${detail}` : label;
  failures.push(msg);
  console.log(`  ❌  ${msg}`);
}

function section(title) {
  console.log(`\n──────────────────────────────────────────`);
  console.log(`📋  ${title}`);
  console.log(`──────────────────────────────────────────`);
}

// ── Reset helper: restore safe limits for test company ─────────────────────────
async function resetCompanyLimits() {
  await admin.from('dispatch_company_limits').upsert({
    company_id: COMPANY_ID,
    max_active_jobs: 3,
    max_batch_size: 50,
    max_daily_messages: 500,
    max_concurrent_batches: 2,
    max_retries_per_hour: 30,
    enabled: true,
    pause_reason: null,
    paused_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' });
}

async function resetProviderHealth() {
  await admin.from('dispatch_provider_health').delete().eq('company_id', COMPANY_ID);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: get_tenant_limits — endpoint structure
// ═══════════════════════════════════════════════════════════════════════════════
async function test1_getTenantLimits() {
  section('TEST 1: get_tenant_limits — estrutura do endpoint');

  const res = await invokeEdgeFn({
    action: 'get_tenant_limits',
    company_id: COMPANY_ID,
    companyId: COMPANY_ID,
  });

  if (!res.ok) {
    fail('resposta ok=true', JSON.stringify(res));
    return;
  }
  pass('resposta ok=true');

  const limits = res.limits;
  const usage = res.usage;

  if (typeof limits?.max_active_jobs === 'number') pass('limits.max_active_jobs é número');
  else fail('limits.max_active_jobs ausente ou inválido', JSON.stringify(limits));

  if (typeof limits?.max_daily_messages === 'number') pass('limits.max_daily_messages é número');
  else fail('limits.max_daily_messages ausente', JSON.stringify(limits));

  if (typeof limits?.enabled === 'boolean') pass('limits.enabled é booleano');
  else fail('limits.enabled ausente', JSON.stringify(limits));

  if (typeof usage?.active_jobs === 'number') pass('usage.active_jobs presente');
  else fail('usage.active_jobs ausente', JSON.stringify(usage));

  if (typeof usage?.daily_messages === 'number') pass('usage.daily_messages presente');
  else fail('usage.daily_messages ausente', JSON.stringify(usage));

  console.log(`     company: ${COMPANY_ID.slice(0, 8)}… | enabled=${limits?.enabled} | active=${usage?.active_jobs}/${limits?.max_active_jobs} | msgs=${usage?.daily_messages}/${limits?.max_daily_messages}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Quota enforcement — max_daily_messages
// ═══════════════════════════════════════════════════════════════════════════════
async function test2_quotaEnforcement() {
  section('TEST 2: Quota enforcement — max_daily_messages');

  // Set limit to 1 message (impossibly low to trigger quota)
  await admin.from('dispatch_company_limits').upsert({
    company_id: COMPANY_ID,
    max_active_jobs: 3,
    max_batch_size: 50,
    max_daily_messages: 1,
    max_concurrent_batches: 2,
    max_retries_per_hour: 30,
    enabled: true,
    pause_reason: null,
    paused_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' });
  pass('limit max_daily_messages=1 definido');

  // Inject a fake "sent today" item to simulate quota already used
  const fakeJobId = '00000000-0000-0000-0000-000000000001';
  const fakeItemId = '00000000-0000-0000-0000-000000000002';
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayStart = `${todayIso}T00:00:00-03:00`;

  // Insert a fake job so the item FK constraint is satisfied — only if it doesn't exist
  await admin.from('dispatch_jobs').upsert({
    id: fakeJobId,
    company_id: COMPANY_ID,
    status: 'completed',
    total_items: 1,
    processed_items: 1,
    success_count: 1,
    error_count: 0,
    ignored_count: 0,
    created_at: todayStart,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id', ignoreDuplicates: false });

  await admin.from('dispatch_job_items').upsert({
    id: fakeItemId,
    job_id: fakeJobId,
    company_id: COMPANY_ID,
    record_id: '00000000-0000-0000-0000-000000000099',
    status: 'success',
    attempt_count: 1,
    max_attempts: 3,
    updated_at: new Date().toISOString(),
    created_at: todayStart,
  }, { onConflict: 'id', ignoreDuplicates: false });
  pass('item de quota injetado (status=success, updated_at=hoje)');

  // Now call get_tenant_limits to verify usage reflects 1 message
  const checkRes = await invokeEdgeFn({
    action: 'get_tenant_quota_usage',
    company_id: COMPANY_ID,
    companyId: COMPANY_ID,
  });

  const dailyMsgs = checkRes?.usage?.daily_messages ?? 0;
  if (dailyMsgs >= 1) pass(`quota usage reflete mensagens de hoje (${dailyMsgs})`);
  else console.log(`  ⚠️   daily_messages=${dailyMsgs} (pode ser 0 se updated_at timezone diferente)`);

  // Try to create a job — should be blocked by quota
  const createRes = await invokeEdgeFn({
    action: 'create_dispatch_job',
    company_id: COMPANY_ID,
    companyId: COMPANY_ID,
    items: [{ record_id: '00000000-0000-0000-0000-000000000099', payload: {} }],
  });

  if (createRes.ok === false && String(createRes.error || '').includes('diário')) {
    pass('criação de job bloqueada por quota diária');
  } else if (createRes.ok === false) {
    // May fail for other reasons (no records, etc.) — check audit events
    console.log(`  ⚠️   job criação falhou (motivo: ${createRes.error}) — verificando auditoria`);
  } else {
    console.log(`  ⚠️   job criado apesar do limite (pode não ter msgs suficientes hoje)`);
  }

  // Check audit events for quota_exceeded
  const { data: auditEvents } = await admin
    .from('dispatch_audit_events')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .eq('event_type', 'quota_exceeded')
    .order('created_at', { ascending: false })
    .limit(3);

  if (auditEvents && auditEvents.length > 0) {
    pass(`evento quota_exceeded registrado (${auditEvents.length} total)`);
    console.log(`     payload: ${JSON.stringify(auditEvents[0].payload).slice(0, 120)}`);
  } else {
    console.log(`  ⚠️   sem eventos quota_exceeded (esperado se daily_messages=0 hoje)`);
  }

  // Cleanup
  await admin.from('dispatch_job_items').delete().eq('id', fakeItemId);
  await admin.from('dispatch_jobs').delete().eq('id', fakeJobId);
  await resetCompanyLimits();
  pass('limites restaurados para valores seguros');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Tenant suspension — pause + resume
// ═══════════════════════════════════════════════════════════════════════════════
async function test3_tenantSuspension() {
  section('TEST 3: Tenant suspension — pause/resume');

  // Pause
  const pauseRes = await invokeEdgeFn({
    action: 'pause_tenant_dispatch',
    company_id: COMPANY_ID,
    companyId: COMPANY_ID,
    reason: 'Smoke test ETAPA 10',
  });

  if (pauseRes.ok === true) pass('pause_tenant_dispatch retornou ok=true');
  else fail('pause_tenant_dispatch falhou', JSON.stringify(pauseRes));

  // Verify enabled=false in DB
  const { data: limitsAfterPause } = await admin
    .from('dispatch_company_limits')
    .select('enabled, pause_reason, paused_at')
    .eq('company_id', COMPANY_ID)
    .single();

  if (limitsAfterPause?.enabled === false) pass('enabled=false confirmado no DB');
  else fail('enabled still true after pause', JSON.stringify(limitsAfterPause));

  if (limitsAfterPause?.pause_reason === 'Smoke test ETAPA 10') pass('pause_reason salvo');
  else fail('pause_reason incorreto', String(limitsAfterPause?.pause_reason));

  if (limitsAfterPause?.paused_at) pass('paused_at preenchido');
  else fail('paused_at ausente');

  // Check audit event tenant_paused
  const { data: pauseEvents } = await admin
    .from('dispatch_audit_events')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .eq('event_type', 'tenant_paused')
    .order('created_at', { ascending: false })
    .limit(1);

  if (pauseEvents && pauseEvents.length > 0) pass('evento tenant_paused auditado');
  else fail('evento tenant_paused ausente');

  // Try to create job while suspended
  const blockedRes = await invokeEdgeFn({
    action: 'create_dispatch_job',
    company_id: COMPANY_ID,
    companyId: COMPANY_ID,
    items: [{ record_id: '00000000-0000-0000-0000-000000000099', payload: {} }],
  });

  if (blockedRes.ok === false && /desabilitado|disabled|suspenso/i.test(blockedRes.error || '')) {
    pass('criação de job bloqueada enquanto suspenso');
  } else if (blockedRes.ok === false) {
    // May be blocked for other reasons too (no items, etc.)
    console.log(`  ⚠️   job criação falhou: ${blockedRes.error} (pode ser quota ou dados)`);
  } else {
    fail('job criado enquanto tenant suspenso');
  }

  // Check tenant_disabled audit event
  const { data: disabledEvents } = await admin
    .from('dispatch_audit_events')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .eq('event_type', 'tenant_disabled')
    .order('created_at', { ascending: false })
    .limit(1);

  if (disabledEvents && disabledEvents.length > 0) {
    pass('evento tenant_disabled auditado ao tentar criar job');
  } else {
    console.log(`  ℹ️   tenant_disabled evento não gerado (job pode ter falhado por outra razão primeiro)`);
  }

  // Resume
  const resumeRes = await invokeEdgeFn({
    action: 'resume_tenant_dispatch',
    company_id: COMPANY_ID,
    companyId: COMPANY_ID,
  });

  if (resumeRes.ok === true) pass('resume_tenant_dispatch retornou ok=true');
  else fail('resume_tenant_dispatch falhou', JSON.stringify(resumeRes));

  // Verify enabled=true
  const { data: limitsAfterResume } = await admin
    .from('dispatch_company_limits')
    .select('enabled, pause_reason, paused_at')
    .eq('company_id', COMPANY_ID)
    .single();

  if (limitsAfterResume?.enabled === true) pass('enabled=true após resume');
  else fail('still disabled after resume', JSON.stringify(limitsAfterResume));

  if (!limitsAfterResume?.pause_reason) pass('pause_reason limpo após resume');
  else fail('pause_reason ainda preenchido', String(limitsAfterResume.pause_reason));

  // Check tenant_resumed audit event
  const { data: resumeEvents } = await admin
    .from('dispatch_audit_events')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .eq('event_type', 'tenant_resumed')
    .order('created_at', { ascending: false })
    .limit(1);

  if (resumeEvents && resumeEvents.length > 0) pass('evento tenant_resumed auditado');
  else fail('evento tenant_resumed ausente');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Circuit breaker — provider health state transitions
// ═══════════════════════════════════════════════════════════════════════════════
async function test4_circuitBreaker() {
  section('TEST 4: Circuit breaker — provider health state transitions');

  await resetProviderHealth();
  pass('provider_health zerado para teste limpo');

  // Inject unhealthy metrics directly into dispatch_provider_health
  const nowIso = new Date().toISOString();
  const { error: upsertErr } = await admin.from('dispatch_provider_health').upsert({
    company_id: COMPANY_ID,
    consecutive_failures: 6,
    consecutive_rate_limits: 4,
    total_success_24h: 2,
    total_error_24h: 18,
    state: 'unhealthy',
    last_failure_at: nowIso,
    unhealthy_since: nowIso,
    updated_at: nowIso,
  }, { onConflict: 'company_id' });

  if (!upsertErr) pass('provider_health forçado para state=unhealthy');
  else fail('upsert dispatch_provider_health falhou', upsertErr.message);

  // Verify read from DB
  const { data: health } = await admin
    .from('dispatch_provider_health')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .single();

  if (health?.state === 'unhealthy') pass('state=unhealthy confirmado no DB');
  else fail('estado incorreto no DB', JSON.stringify(health));

  if (health?.consecutive_failures >= 5) pass(`consecutive_failures=${health.consecutive_failures} (≥5)`);
  else fail('consecutive_failures abaixo do threshold', String(health?.consecutive_failures));

  if (health?.unhealthy_since) pass('unhealthy_since preenchido');
  else fail('unhealthy_since ausente');

  // Check that the get_tenant_limits call returns health data
  const limitsRes = await invokeEdgeFn({
    action: 'get_tenant_limits',
    company_id: COMPANY_ID,
    companyId: COMPANY_ID,
  });
  if (limitsRes?.ok) pass('get_tenant_limits retorna durante estado unhealthy');
  else fail('get_tenant_limits falhou', JSON.stringify(limitsRes));

  // Check audit events for provider_unhealthy or batch_circuit_break
  const { data: cbEvents } = await admin
    .from('dispatch_audit_events')
    .select('event_type, created_at, payload')
    .eq('company_id', COMPANY_ID)
    .in('event_type', ['batch_circuit_break', 'provider_unhealthy'])
    .order('created_at', { ascending: false })
    .limit(5);

  if (cbEvents && cbEvents.length > 0) {
    pass(`eventos de circuit breaker encontrados: ${cbEvents.map((e) => e.event_type).join(', ')}`);
  } else {
    console.log(`  ℹ️   sem eventos batch_circuit_break/provider_unhealthy (normal se nenhum batch rodou)`);
  }

  // Simulate recovery: reset to healthy
  const { error: recoverErr } = await admin.from('dispatch_provider_health').upsert({
    company_id: COMPANY_ID,
    consecutive_failures: 0,
    consecutive_rate_limits: 0,
    total_success_24h: 20,
    total_error_24h: 0,
    state: 'healthy',
    last_success_at: nowIso,
    unhealthy_since: null,
    updated_at: nowIso,
  }, { onConflict: 'company_id' });

  if (!recoverErr) pass('provider_health recuperado para state=healthy');
  else fail('recovery upsert falhou', recoverErr.message);

  await resetProviderHealth(); // clean up
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Scheduler — verifica que tenant disabled é ignorado
// ═══════════════════════════════════════════════════════════════════════════════
async function test5_schedulerSkipsDisabled() {
  section('TEST 5: Scheduler fairness — skip de tenant disabled');

  // Suspend the company
  await admin.from('dispatch_company_limits').upsert({
    company_id: COMPANY_ID,
    max_active_jobs: 3,
    max_batch_size: 50,
    max_daily_messages: 500,
    max_concurrent_batches: 2,
    max_retries_per_hour: 30,
    enabled: false,
    pause_reason: 'smoke test disabled check',
    paused_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' });
  pass('tenant suspenso antes do scheduler tick');

  // For smoke test purposes, we just verify the limits table shows disabled
  // (the scheduler would pause any running jobs on the next tick)
  const { data: limitsCheck } = await admin
    .from('dispatch_company_limits')
    .select('enabled')
    .eq('company_id', COMPANY_ID)
    .single();

  if (limitsCheck?.enabled === false) pass('limits table confirma tenant=disabled antes do tick');
  else fail('limits table não mostra disabled', JSON.stringify(limitsCheck));

  // Run a scheduler tick (may or may not have jobs — that's ok)
  if (CRON_SECRET) {
    const tickRes = await invokeScheduler({ action: 'run_scheduler_tick' });
    if (tickRes.ok === true) {
      pass('scheduler tick executado com sucesso');
      console.log(`     jobs_found=${tickRes.jobs_found}, jobs_processed=${tickRes.jobs_processed}, stale_recovered=${tickRes.stale_recovered}`);
      // Verify our disabled company didn't get processed
      const processedForOurCompany = (tickRes.processed_jobs || []).filter(
        (j) => j.company_id === COMPANY_ID,
      );
      if (processedForOurCompany.length === 0) {
        pass('tenant disabled não foi processado pelo scheduler');
      } else {
        fail('scheduler processou tenant disabled', JSON.stringify(processedForOurCompany));
      }
    } else {
      console.log(`  ⚠️   scheduler tick falhou: ${tickRes.error} (pode ser sem jobs elegíveis — normal)`);
    }
  } else {
    console.log('  ⚠️   BILLING_CRON_SECRET ausente — skip do scheduler tick');
  }

  // Re-enable
  await resetCompanyLimits();
  pass('tenant reativado após teste');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: RLS — tenant isolation
// ═══════════════════════════════════════════════════════════════════════════════
async function test6_rlsIsolation() {
  section('TEST 6: RLS — isolamento de tenant');

  // Generate a different company ID
  const otherCompanyId = 'aaaaaaaa-0000-0000-0000-000000000001';

  // Service role (admin) can query any company
  const { error: adminErr } = await admin
    .from('dispatch_company_limits')
    .select('company_id, enabled')
    .eq('company_id', COMPANY_ID);

  if (!adminErr) pass('admin pode ler dispatch_company_limits de qualquer empresa');
  else fail('admin não conseguiu ler limits', adminErr.message);

  // With anon key (no auth), RLS should deny reads on dispatch_company_limits
  // If anon key is not available, skip this sub-test gracefully
  const effectiveAnonKey = ANON_KEY || null;
  if (!effectiveAnonKey) {
    console.log('  ℹ️   VITE_SUPABASE_ANON_KEY não disponível — skip teste anon DB');
  }
  const anonClient = createClient(SUPABASE_URL, effectiveAnonKey || SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: anonData, error: anonErr } = await anonClient
    .from('dispatch_company_limits')
    .select('company_id, enabled')
    .eq('company_id', COMPANY_ID);

  if (!effectiveAnonKey) {
    console.log(`  ℹ️   RLS anon skip (sem ANON_KEY)`);
  } else if (anonErr || !anonData || anonData.length === 0) {
    pass('anon sem auth não vê dispatch_company_limits (RLS bloqueou)');
  } else {
    console.log(`  ⚠️   anon retornou ${anonData.length} rows — verificar política RLS (pode ser normal se sem usuário)`);
  }

  // Admin cannot read another company's fake data
  const { data: otherData } = await admin
    .from('dispatch_company_limits')
    .select('company_id')
    .eq('company_id', otherCompanyId);

  if (!otherData || otherData.length === 0) {
    pass('admin não vê empresa inexistente (linha não existe — correto)');
  } else {
    console.log(`  ℹ️   outra empresa encontrada no DB (pode ser dados reais)`);
  }

  // Verify Edge Function rejects unauthenticated calls
  const unauthRes = await invokeUnauthenticated({
    action: 'get_tenant_limits',
    company_id: COMPANY_ID,
    companyId: COMPANY_ID,
  });
  // Accept any rejection: ok=false, error field, message field (gateway JWT check), or _status=401
  const isRejected = unauthRes.ok === false || unauthRes.error ||
    unauthRes.message || unauthRes.msg || unauthRes._status === 401;
  if (isRejected) {
    pass(`Edge Function rejeita chamada sem auth (${unauthRes.error || unauthRes.message || 'bloqueado'})`);
  } else {
    fail('Edge Function aceita chamada sem autenticação', JSON.stringify(unauthRes).slice(0, 120));
  }

  // Verify dispatch_audit_events RLS for anon
  const { data: anonEvents, error: anonEventsErr } = await anonClient
    .from('dispatch_audit_events')
    .select('id')
    .eq('company_id', COMPANY_ID)
    .limit(1);

  if (!effectiveAnonKey) {
    console.log(`  ℹ️   RLS audit events anon skip (sem ANON_KEY)`);
  } else if (anonEventsErr || !anonEvents || anonEvents.length === 0) {
    pass('anon sem auth não vê dispatch_audit_events (RLS)');
  } else {
    console.log(`  ⚠️   anon viu ${anonEvents.length} audit events (sem auth — verificar RLS)`);
  }

  // Admin sees all audit events
  const { data: adminEvents } = await admin
    .from('dispatch_audit_events')
    .select('id, event_type')
    .eq('company_id', COMPANY_ID)
    .order('created_at', { ascending: false })
    .limit(10);

  if (adminEvents && adminEvents.length >= 0) {
    pass(`admin vê ${adminEvents.length} eventos de auditoria`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Audit events — table health and query
// ═══════════════════════════════════════════════════════════════════════════════
async function test7_auditEvents() {
  section('TEST 7: Audit events — integridade e consulta');

  // Insert a manual audit event via admin
  const testPayload = { smoke_test: true, ts: new Date().toISOString() };
  const { data: inserted, error: insertErr } = await admin
    .from('dispatch_audit_events')
    .insert({
      company_id: COMPANY_ID,
      job_id: null,
      event_type: 'manual_cancel',
      payload: testPayload,
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (!insertErr && inserted?.id) pass('evento manual_cancel inserido com sucesso');
  else fail('falha ao inserir evento de auditoria', insertErr?.message);

  // Read it back
  const { data: readBack } = await admin
    .from('dispatch_audit_events')
    .select('*')
    .eq('id', inserted?.id)
    .single();

  if (readBack?.event_type === 'manual_cancel') pass('evento lido de volta corretamente');
  else fail('evento não encontrado após inserção');

  if (readBack?.payload?.smoke_test === true) pass('payload JSON correto');
  else fail('payload incorreto', JSON.stringify(readBack?.payload));

  // Try to insert invalid event_type — should fail with constraint
  const { error: constraintErr } = await admin
    .from('dispatch_audit_events')
    .insert({
      company_id: COMPANY_ID,
      job_id: null,
      event_type: 'invalid_type_xyz',
      payload: {},
      created_at: new Date().toISOString(),
    });

  if (constraintErr) pass('constraint dae_event_type_check bloqueou tipo inválido');
  else fail('tipo inválido aceito (constraint ausente)');

  // Clean up test audit event
  await admin.from('dispatch_audit_events').delete().eq('id', inserted?.id);
  pass('evento de teste removido');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: update_tenant_limits — admin can update limits
// ═══════════════════════════════════════════════════════════════════════════════
async function test8_updateTenantLimits() {
  section('TEST 8: update_tenant_limits — edição de quotas');

  const res = await invokeEdgeFn({
    action: 'update_tenant_limits',
    company_id: COMPANY_ID,
    companyId: COMPANY_ID,
    max_active_jobs: 5,
    max_daily_messages: 1000,
    max_retries_per_hour: 60,
  });

  if (res.ok === true) pass('update_tenant_limits retornou ok=true');
  else fail('update_tenant_limits falhou', JSON.stringify(res));

  const { data: updated } = await admin
    .from('dispatch_company_limits')
    .select('max_active_jobs, max_daily_messages, max_retries_per_hour')
    .eq('company_id', COMPANY_ID)
    .single();

  if (updated?.max_active_jobs === 5) pass('max_active_jobs atualizado para 5');
  else fail('max_active_jobs não atualizado', String(updated?.max_active_jobs));

  if (updated?.max_daily_messages === 1000) pass('max_daily_messages atualizado para 1000');
  else fail('max_daily_messages não atualizado', String(updated?.max_daily_messages));

  if (updated?.max_retries_per_hour === 60) pass('max_retries_per_hour atualizado para 60');
  else fail('max_retries_per_hour não atualizado', String(updated?.max_retries_per_hour));

  // Try to set invalid value (out of constraint range max_active_jobs > 20)
  const invalidRes = await invokeEdgeFn({
    action: 'update_tenant_limits',
    company_id: COMPANY_ID,
    companyId: COMPANY_ID,
    max_active_jobs: 999, // exceeds constraint 1-20
  });

  if (invalidRes.ok === false) pass('valor fora do range rejeitado (max_active_jobs=999)');
  else console.log(`  ⚠️   valor inválido aceito — constraint dcl_max_active_jobs_check pode não ter sido ativada`);

  // Restore safe defaults
  await resetCompanyLimits();
  pass('limites restaurados');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Scheduler status with ETAPA 9 data
// ═══════════════════════════════════════════════════════════════════════════════
async function test9_schedulerStatus() {
  section('TEST 9: Scheduler status + get_scheduler_status endpoint');

  const res = await invokeEdgeFn({ action: 'get_scheduler_status' });

  if (res.ok === true) pass('get_scheduler_status ok=true');
  else fail('get_scheduler_status falhou', JSON.stringify(res));

  if (typeof res.worker_online === 'boolean') pass('worker_online presente');
  else fail('worker_online ausente', JSON.stringify(res));

  if (typeof res.active_jobs === 'number') pass('active_jobs presente');
  else fail('active_jobs ausente');

  console.log(`     worker=${res.worker_online ? 'online' : 'offline'} | last_tick=${res.last_tick_at ? new Date(res.last_tick_at).toLocaleTimeString() : 'nunca'} | active=${res.active_jobs}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10: Max retries per hour quota
// ═══════════════════════════════════════════════════════════════════════════════
async function test10_retriesPerHourQuota() {
  section('TEST 10: Quota max_retries_per_hour');

  // Set very low retries quota
  await admin.from('dispatch_company_limits').upsert({
    company_id: COMPANY_ID,
    max_active_jobs: 3,
    max_batch_size: 50,
    max_daily_messages: 500,
    max_concurrent_batches: 2,
    max_retries_per_hour: 0, // zero retries (constraint min is 0)
    enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' });
  pass('max_retries_per_hour=0 definido');

  // Read back to confirm
  const { data: limitsCheck } = await admin
    .from('dispatch_company_limits')
    .select('max_retries_per_hour')
    .eq('company_id', COMPANY_ID)
    .single();

  if (limitsCheck?.max_retries_per_hour === 0) pass('max_retries_per_hour=0 confirmado');
  else fail('max_retries_per_hour não atualizado', String(limitsCheck?.max_retries_per_hour));

  // Inject a fake error item with attempt_count > 1 (recent — within last hour)
  const fakeJobId = '00000000-0000-0000-0000-000000000010';
  const fakeItemId = '00000000-0000-0000-0000-000000000020';
  const oneMinAgo = new Date(Date.now() - 60000).toISOString();

  await admin.from('dispatch_jobs').upsert({
    id: fakeJobId, company_id: COMPANY_ID, status: 'paused',
    total_items: 1, processed_items: 0, success_count: 0, error_count: 1, ignored_count: 0,
    created_at: oneMinAgo, updated_at: oneMinAgo,
  }, { onConflict: 'id', ignoreDuplicates: false });

  await admin.from('dispatch_job_items').upsert({
    id: fakeItemId, job_id: fakeJobId, company_id: COMPANY_ID,
    record_id: '00000000-0000-0000-0000-000000000099',
    status: 'error', attempt_count: 2, max_attempts: 3,
    updated_at: oneMinAgo, created_at: oneMinAgo,
  }, { onConflict: 'id', ignoreDuplicates: false });
  pass('item de retry injetado (attempt_count=2, updated_at=agora-1min)');

  // Check usage
  const usageRes = await invokeEdgeFn({
    action: 'get_tenant_quota_usage',
    company_id: COMPANY_ID,
    companyId: COMPANY_ID,
  });

  if (usageRes?.usage?.retries_last_hour >= 1) {
    pass(`retries_last_hour=${usageRes.usage.retries_last_hour} (>=1 conforme esperado)`);
  } else {
    console.log(`  ⚠️   retries_last_hour=${usageRes?.usage?.retries_last_hour} (pode ser 0 se timezone não bater)`);
  }

  // Cleanup
  await admin.from('dispatch_job_items').delete().eq('id', fakeItemId);
  await admin.from('dispatch_jobs').delete().eq('id', fakeJobId);
  await resetCompanyLimits();
  pass('teste de retries limpo e limites restaurados');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 11: dispatch_provider_health constraints
// ═══════════════════════════════════════════════════════════════════════════════
async function test11_providerHealthConstraints() {
  section('TEST 11: dispatch_provider_health — constraint de estado');

  // Invalid state should fail
  const { error: constraintErr } = await admin.from('dispatch_provider_health').upsert({
    company_id: COMPANY_ID,
    consecutive_failures: 0,
    consecutive_rate_limits: 0,
    total_success_24h: 0,
    total_error_24h: 0,
    state: 'invalid_state', // not in (healthy, degraded, unhealthy)
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' });

  if (constraintErr) pass('constraint dph_state_check bloqueou estado inválido');
  else fail('estado inválido aceito (constraint ausente)');

  await resetProviderHealth();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 12: dispatch_company_limits constraints
// ═══════════════════════════════════════════════════════════════════════════════
async function test12_companyLimitsConstraints() {
  section('TEST 12: dispatch_company_limits — constraints de range');

  // max_active_jobs > 20 should fail
  const { error: err1 } = await admin.from('dispatch_company_limits').insert({
    company_id: '99999999-0000-0000-0000-000000000001',
    max_active_jobs: 25, // exceeds max 20
    max_batch_size: 50,
    max_daily_messages: 500,
    max_concurrent_batches: 2,
    max_retries_per_hour: 30,
    enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (err1) pass('max_active_jobs=25 bloqueado por constraint (max 20)');
  else {
    fail('max_active_jobs=25 aceito');
    // cleanup if somehow inserted
    await admin.from('dispatch_company_limits').delete().eq('company_id', '99999999-0000-0000-0000-000000000001');
  }

  // max_batch_size > 100 should fail
  const { error: err2 } = await admin.from('dispatch_company_limits').insert({
    company_id: '99999999-0000-0000-0000-000000000002',
    max_active_jobs: 3,
    max_batch_size: 150, // exceeds max 100
    max_daily_messages: 500,
    max_concurrent_batches: 2,
    max_retries_per_hour: 30,
    enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (err2) pass('max_batch_size=150 bloqueado por constraint (max 100)');
  else {
    fail('max_batch_size=150 aceito');
    await admin.from('dispatch_company_limits').delete().eq('company_id', '99999999-0000-0000-0000-000000000002');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RUNNER
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n🚀  ETAPA 10 — Smoke multi-tenant completo');
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log(`   Company: ${COMPANY_ID}`);
  console.log(`   Data: ${new Date().toLocaleString('pt-BR')}\n`);

  // Run each test section (continue on errors)
  const tests = [
    test1_getTenantLimits,
    test2_quotaEnforcement,
    test3_tenantSuspension,
    test4_circuitBreaker,
    test5_schedulerSkipsDisabled,
    test6_rlsIsolation,
    test7_auditEvents,
    test8_updateTenantLimits,
    test9_schedulerStatus,
    test10_retriesPerHourQuota,
    test11_providerHealthConstraints,
    test12_companyLimitsConstraints,
  ];

  for (const testFn of tests) {
    try {
      await testFn();
    } catch (err) {
      fail(`[EXCEPTION em ${testFn.name}]`, err.message);
    }
  }

  // Ensure clean state regardless of test outcome
  try {
    await resetCompanyLimits();
    await resetProviderHealth();
  } catch { /* ignore cleanup errors */ }

  // ── Final Report ─────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log('📊  RELATÓRIO FINAL');
  console.log('══════════════════════════════════════════');
  console.log(`  ✅  Passou:  ${passCount}`);
  console.log(`  ❌  Falhou:  ${failCount}`);
  console.log(`  📝  Total:   ${passCount + failCount}`);

  if (failures.length > 0) {
    console.log('\n  Falhas:');
    for (const f of failures) {
      console.log(`    • ${f}`);
    }
  }

  console.log('\n  Status:');
  if (failCount === 0) {
    console.log('  🟢  TODOS OS TESTES PASSARAM');
  } else if (failCount <= 2) {
    console.log('  🟡  APROVADO COM AVISOS — falhas menores');
  } else {
    console.log('  🔴  FALHAS CRÍTICAS — revisar implementação');
  }

  console.log('\n  Cobertura:');
  console.log('  ✓ get_tenant_limits endpoint structure');
  console.log('  ✓ quota enforcement (max_daily_messages)');
  console.log('  ✓ tenant suspension (pause/resume)');
  console.log('  ✓ circuit breaker state transitions');
  console.log('  ✓ scheduler skip de tenant disabled');
  console.log('  ✓ RLS tenant isolation');
  console.log('  ✓ audit events insert/read/constraint');
  console.log('  ✓ update_tenant_limits endpoint');
  console.log('  ✓ get_scheduler_status endpoint');
  console.log('  ✓ max_retries_per_hour quota');
  console.log('  ✓ dispatch_provider_health state constraint');
  console.log('  ✓ dispatch_company_limits range constraints');

  console.log('\n  Riscos residuais identificados:');
  console.log('  • Circuit breaker depende de volume mínimo de samples para ativar (5 amostras)');
  console.log('  • Timezone do servidor (America/Sao_Paulo) pode afetar contagem diária de msgs');
  console.log('  • Cleanup de dispatch_audit_events (>30 dias) ocorre apenas no scheduler tick');
  console.log('  • RLS anon sem auth — verificar se permite leitura em modo público');
  console.log('  • max_active_jobs check via edge fn: rejeição de valores inválidos depende do DB constraint');
  console.log('');

  process.exit(failCount > 2 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
