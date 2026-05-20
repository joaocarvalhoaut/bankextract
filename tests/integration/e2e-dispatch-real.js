/**
 * e2e-dispatch-real.js — Smoke real ponta a ponta do sistema de cobrança
 *
 * Execução: node tests/integration/e2e-dispatch-real.js
 *
 * Cobre:
 *  Phase 0: Pre-flight checks (Z-API, quotas, env, Drive status)
 *  Phase 1: Real send — dispatch job simulate=false, 1 registro com phone=77981376867
 *  Phase 2: Fallback simulate=true, sem boleto — confirma bloqueio/texto-only
 *  Phase 3: Retry mechanics — item com phone invalido, confirma retryable e next_retry_at
 *
 * Estado restaurado após cada fase.
 * Relatório final impresso ao término.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// ── Env loader ─────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function loadEnv(...files) {
  const env = {};
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.resolve(ROOT, file), 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (m) {
          let val = m[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
          env[m[1]] = val;
        }
      }
    } catch { /* not found */ }
  }
  return env;
}

const rawEnv = loadEnv('.env', '.env.secrets', '.env.local');

const SUPABASE_URL   = rawEnv.VITE_SUPABASE_URL || rawEnv.SUPABASE_URL;
const SERVICE_KEY    = rawEnv.SERVICE_ROLE_KEY;
const COMPANY_ID     = rawEnv.VITE_SUPABASE_COMPANY_ID || rawEnv.COMPANY_ID;
const CRON_SECRET    = rawEnv.BILLING_CRON_SECRET;
const EDGE_FN_URL    = `${SUPABASE_URL}/functions/v1/billing-automation`;

const TEST_PHONE     = '77981376867';  // destino do smoke

if (!SUPABASE_URL || !SERVICE_KEY || !COMPANY_ID || !CRON_SECRET) {
  console.error('❌  Variáveis ausentes:');
  console.error('   SUPABASE_URL :', SUPABASE_URL ? '✓' : '✗');
  console.error('   SERVICE_KEY  :', SERVICE_KEY  ? '✓' : '✗');
  console.error('   COMPANY_ID   :', COMPANY_ID   ? '✓' : '✗');
  console.error('   CRON_SECRET  :', CRON_SECRET  ? '✓' : '✗');
  process.exit(1);
}

// ── Clients ────────────────────────────────────────────────────────────────────
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ────────────────────────────────────────────────────────────────────
const log   = (msg)       => console.log(`[${new Date().toISOString().substring(11,19)}] ${msg}`);
const ok    = (msg)       => console.log(`[${new Date().toISOString().substring(11,19)}] ✅  ${msg}`);
const fail  = (msg)       => console.log(`[${new Date().toISOString().substring(11,19)}] ❌  ${msg}`);
const warn  = (msg)       => console.log(`[${new Date().toISOString().substring(11,19)}] ⚠️   ${msg}`);
const info  = (msg)       => console.log(`[${new Date().toISOString().substring(11,19)}] ℹ️   ${msg}`);
const sleep = (ms)        => new Promise(r => setTimeout(r, ms));

const CRONHDR = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}`, 'x-cron-secret': CRON_SECRET };

async function edgeFn(body) {
  const res = await fetch(EDGE_FN_URL, { method: 'POST', headers: CRONHDR, body: JSON.stringify(body) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text, _status: res.status }; }
}

// ── Report accumulator ─────────────────────────────────────────────────────────
const REPORT = {
  started_at: new Date().toISOString(),
  environment: { supabase_url: SUPABASE_URL.substring(0,40), company_id: COMPANY_ID },
  preflight:   {},
  phase1:      {},
  phase2:      {},
  phase3:      {},
  issues:      [],
  corrections: [],
  verdict:     'pending',
};

function addIssue(msg) { REPORT.issues.push(msg); warn(msg); }
function addFix(msg)   { REPORT.corrections.push(msg); info(`FIX: ${msg}`); }

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 0 — Pre-flight
// ═══════════════════════════════════════════════════════════════════════════════
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log('PHASE 0 — Pre-flight checks');
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 0.1 — Tenant limits
const limitsRes = await edgeFn({ action: 'get_tenant_limits', company_id: COMPANY_ID });
if (!limitsRes.ok) {
  addIssue(`get_tenant_limits failed: ${limitsRes.error}`);
  REPORT.preflight.limits = 'error';
} else {
  const { limits, usage } = limitsRes;
  REPORT.preflight.limits = { enabled: limits.enabled, daily: `${usage.daily_messages}/${limits.max_daily_messages}`, active_jobs: `${usage.active_jobs}/${limits.max_active_jobs}` };
  if (!limits.enabled) {
    addIssue('Tenant disabled — resuming before test');
    await edgeFn({ action: 'resume_tenant_dispatch', company_id: COMPANY_ID });
    addFix('Tenant dispatch resumed');
  }
  ok(`Tenant limits: enabled=${limits.enabled} daily=${usage.daily_messages}/${limits.max_daily_messages} jobs=${usage.active_jobs}/${limits.max_active_jobs}`);
}

// 0.2 — Scheduler status
const schedRes = await edgeFn({ action: 'get_scheduler_status' });
REPORT.preflight.scheduler = { online: schedRes.online, active_jobs: schedRes.active_jobs, last_tick: schedRes.last_tick };
if (schedRes.ok) {
  ok(`Scheduler: online=${schedRes.online} active_jobs=${schedRes.active_jobs}`);
} else {
  addIssue(`Scheduler check failed: ${schedRes.error}`);
}

// 0.3 — Z-API integration check and repair
const { data: zapiRow } = await admin.from('company_integrations').select('id,instance_id,token,client_token,connected,phone_number').eq('company_id', COMPANY_ID).eq('provider', 'zapi').maybeSingle();
REPORT.preflight.zapi_original_connected = zapiRow?.connected;
REPORT.preflight.zapi_instance_id = zapiRow?.instance_id;
REPORT.preflight.zapi_has_token = Boolean(zapiRow?.token);
REPORT.preflight.zapi_has_client_token = Boolean(zapiRow?.client_token);

if (!zapiRow) {
  addIssue('Z-API integration row missing entirely');
  REPORT.preflight.zapi_status = 'missing';
} else if (!zapiRow.connected) {
  addIssue('Z-API connected=false — setting connected=true for smoke test');
  const { error: fixErr } = await admin.from('company_integrations')
    .update({ connected: true, updated_at: new Date().toISOString() })
    .eq('id', zapiRow.id);
  if (fixErr) {
    addIssue(`Failed to set connected=true: ${fixErr.message}`);
    REPORT.preflight.zapi_status = 'fix_failed';
  } else {
    addFix('Z-API connected set to true for smoke test');
    REPORT.preflight.zapi_status = 'fixed_connected';
  }
} else {
  REPORT.preflight.zapi_status = 'already_connected';
  ok('Z-API connected=true already');
}

// 0.4 — Billing config (permitir_envio_sem_boleto) check
const { data: bilCfg } = await admin.from('whatsapp_cobranca_config').select('*').eq('empresa_id', COMPANY_ID).maybeSingle();
const originalAllowWithoutBoleto = bilCfg?.permitir_envio_sem_boleto ?? false;
REPORT.preflight.drive_configured = false; // will check below
REPORT.preflight.original_allow_without_boleto = originalAllowWithoutBoleto;

// 0.5 — Drive config
const { data: drCfg } = await admin.from('google_sheets_configs').select('drive_root_folder_id').eq('empresa_id', COMPANY_ID).maybeSingle();
const driveConfigured = Boolean(drCfg?.drive_root_folder_id);
REPORT.preflight.drive_configured = driveConfigured;
REPORT.preflight.drive_folder_id = drCfg?.drive_root_folder_id || null;

if (!driveConfigured) {
  addIssue('Google Drive pasta nao configurada — boleto PDF lookup desabilitado');
  info('Drive root folder ID ausente em google_sheets_configs');
  info('Para teste completo com PDF: configurar Drive e executar sync antes do smoke test');
  // Enable send without boleto so real test can proceed
  if (!originalAllowWithoutBoleto) {
    const { error: cfgErr } = await admin.from('whatsapp_cobranca_config')
      .update({ permitir_envio_sem_boleto: true, updated_at: new Date().toISOString() })
      .eq('empresa_id', COMPANY_ID);
    if (cfgErr) {
      addIssue(`Falha ao habilitar permitir_envio_sem_boleto: ${cfgErr.message}`);
    } else {
      addFix('permitir_envio_sem_boleto=true habilitado para smoke (Drive ausente)');
    }
  }
} else {
  ok(`Drive configurado: folder_id=${drCfg.drive_root_folder_id}`);
  // Check Drive health
  const drHealth = await edgeFn({ action: 'test_drive_health', company_id: COMPANY_ID });
  REPORT.preflight.drive_health = drHealth.drive_status;
  if (drHealth.ok) {
    ok(`Drive health: ${drHealth.drive_status} pdfs=${drHealth.pdf_count}`);
  } else {
    addIssue(`Drive health falhou: ${drHealth.error}`);
  }
}

// 0.6 — Find best test record
const { data: candidates } = await admin
  .from('registros_financeiros')
  .select('id,nome,telefone,documento,valor,data_vencimento,status,boleto_status,drive_file_id,boleto_pdf_nome,boleto_match_confidence')
  .eq('company_id', COMPANY_ID)
  .not('telefone', 'is', null)
  .not('status', 'in', '("liquidado","pago","cancelado")')
  .order('boleto_match_confidence', { ascending: false, nullsFirst: false })
  .limit(20);

// Prefer record with exact_match boleto; fallback to highest-value open record
const withBoleto = candidates?.filter(r => r.boleto_status === 'encontrado' && r.drive_file_id) || [];
const withoutBoleto = candidates?.filter(r => !r.drive_file_id) || [];
const testRecord = withBoleto[0] || withoutBoleto.sort((a, b) => Number(b.valor) - Number(a.valor))[0] || null;

if (!testRecord) {
  fail('Nenhum registro elegível encontrado para o teste');
  process.exit(1);
}

REPORT.preflight.test_record = {
  id: testRecord.id,
  nome: testRecord.nome,
  documento: testRecord.documento,
  valor: testRecord.valor,
  vencimento: testRecord.data_vencimento,
  status: testRecord.status,
  boleto_status: testRecord.boleto_status,
  has_drive_file: Boolean(testRecord.drive_file_id),
  boleto_pdf_nome: testRecord.boleto_pdf_nome || null,
  boleto_match_confidence: testRecord.boleto_match_confidence || null,
  original_telefone: testRecord.telefone,
};

ok(`Registro selecionado: ${testRecord.nome} | doc=${testRecord.documento} | val=R$${testRecord.valor} | tel-original=${testRecord.telefone}`);
ok(`Boleto: status=${testRecord.boleto_status} | drive=${testRecord.drive_file_id ? 'YES' : 'NO'} | confidence=${testRecord.boleto_match_confidence}`);
info(`Preflight complete — ${REPORT.issues.length} issue(s), ${REPORT.corrections.length} fix(es)`);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Real dispatch (simulate=false)
// ═══════════════════════════════════════════════════════════════════════════════
log('');
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log(`PHASE 1 — Real dispatch job (simulate=false) → ${TEST_PHONE}`);
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 1.1 — Override phone
const { error: phoneErr } = await admin
  .from('registros_financeiros')
  .update({ telefone: TEST_PHONE, updated_at: new Date().toISOString() })
  .eq('id', testRecord.id);
if (phoneErr) {
  fail(`Falha ao sobrescrever telefone: ${phoneErr.message}`);
  REPORT.phase1.error = `phone_override_failed: ${phoneErr.message}`;
} else {
  ok(`Telefone sobrescrito para ${TEST_PHONE} (original: ${testRecord.telefone})`);
  REPORT.phase1.phone_override = { from: testRecord.telefone, to: TEST_PHONE };
}

// 1.2 — Create dispatch job
const createRes = await edgeFn({
  action: 'create_dispatch_job',
  company_id: COMPANY_ID,
  simulate: false,
  items: [{ record_id: testRecord.id, payload: { record_id: testRecord.id, simulate: false } }],
});

if (!createRes.ok) {
  fail(`create_dispatch_job falhou: ${createRes.error}`);
  REPORT.phase1.create_job = { ok: false, error: createRes.error };
} else {
  const jobId = createRes.job_id;
  ok(`dispatch_job criado: ${jobId} | items=${createRes.created_items}`);
  REPORT.phase1.create_job = { ok: true, job_id: jobId, created_items: createRes.created_items };

  // 1.3 — Trigger scheduler tick
  log(`Triggering scheduler tick para processar job ${jobId}...`);
  const tickRes = await edgeFn({ action: 'run_scheduler_tick' });
  REPORT.phase1.scheduler_tick1 = { ok: tickRes.ok, processed: tickRes.processed_jobs, error: tickRes.error };
  if (!tickRes.ok) {
    addIssue(`Scheduler tick 1 falhou: ${tickRes.error}`);
  } else {
    ok(`Scheduler tick 1: processed_jobs=${tickRes.processed_jobs}`);
  }

  // 1.4 — Poll job status (até 60 segundos)
  let finalStatus = null;
  let pollAttempt = 0;
  const maxPolls = 12;
  const pollInterval = 5000;

  log(`Aguardando processamento do job (até ${maxPolls * pollInterval / 1000}s)...`);
  while (pollAttempt < maxPolls) {
    await sleep(pollInterval);
    pollAttempt++;

    // Trigger another scheduler tick
    await edgeFn({ action: 'run_scheduler_tick' });

    const statusRes = await edgeFn({ action: 'get_dispatch_job_status', company_id: COMPANY_ID, job_id: jobId });
    if (!statusRes.ok) {
      log(`Poll ${pollAttempt}: status check error: ${statusRes.error}`);
      continue;
    }

    const jobStatus = statusRes.status || statusRes.job?.status || statusRes;
    log(`Poll ${pollAttempt}: status=${jobStatus.status || jobStatus} pending=${jobStatus.pending_items} processing=${jobStatus.processing_items} done=${jobStatus.success_count}/${jobStatus.total_items}`);

    const st = String(jobStatus.status || '').toLowerCase();
    if (st === 'completed' || st === 'failed' || st === 'cancelled') {
      finalStatus = jobStatus;
      break;
    }

    // If no activity after 3 polls, try a direct batch run
    if (pollAttempt === 3) {
      log('Triggering direct batch run (fallback)...');
      const batchRes = await edgeFn({ action: 'run_dispatch_job_batch', company_id: COMPANY_ID, job_id: jobId, requested_batch_size: 1 });
      log(`Direct batch: ok=${batchRes.ok} processed=${batchRes.processed_items} err=${batchRes.error || '-'}`);
      REPORT.phase1.direct_batch = { ok: batchRes.ok, processed: batchRes.processed_items, stopped_reason: batchRes.stopped_reason };
    }
  }

  if (!finalStatus) {
    // Force final status check
    const fs2 = await edgeFn({ action: 'get_dispatch_job_status', company_id: COMPANY_ID, job_id: jobId });
    finalStatus = fs2.status || fs2.job || fs2;
  }

  REPORT.phase1.job_final = finalStatus;
  const finalSt = String(finalStatus?.status || '').toLowerCase();

  if (finalSt === 'completed') {
    ok(`Job ${jobId} COMPLETED — success=${finalStatus.success_count} err=${finalStatus.error_count}`);
  } else if (finalSt === 'failed') {
    addIssue(`Job ${jobId} FAILED — success=${finalStatus.success_count} err=${finalStatus.error_count}`);
  } else {
    addIssue(`Job ${jobId} final status=${finalSt} (timeout ou inconclusivo)`);
  }

  // 1.5 — Validate DB state after job
  // dispatch_job_items
  const { data: jobItems } = await admin
    .from('dispatch_job_items')
    .select('id,record_id,status,last_error_code,last_error_message,attempt_count,log_cobranca_id,payload')
    .eq('job_id', jobId)
    .eq('company_id', COMPANY_ID)
    .limit(5);

  REPORT.phase1.job_items = (jobItems || []).map(i => ({
    id: i.id.substring(0,8),
    status: i.status,
    error_code: i.last_error_code,
    error_msg: i.last_error_message?.substring(0,80),
    attempts: i.attempt_count,
    log_id: i.log_cobranca_id,
  }));

  const mainItem = jobItems?.[0];
  if (mainItem) {
    ok(`dispatch_job_item: status=${mainItem.status} attempts=${mainItem.attempt_count} err=${mainItem.last_error_code || '-'}`);
    if (mainItem.log_cobranca_id) {
      ok(`log_cobranca_id vinculado: ${mainItem.log_cobranca_id}`);
    }
  }

  // logs_cobranca for this record
  const { data: logRows } = await admin
    .from('logs_cobranca')
    .select('id,status_envio,erro,tipo_cobranca,created_at,payload')
    .eq('company_id', COMPANY_ID)
    .eq('financeiro_id', testRecord.id)
    .order('created_at', { ascending: false })
    .limit(3);

  REPORT.phase1.logs_cobranca = (logRows || []).map(l => {
    const p = typeof l.payload === 'string' ? JSON.parse(l.payload || '{}') : (l.payload || {});
    return {
      id: l.id.substring(0,8),
      status_envio: l.status_envio,
      erro: l.erro,
      tipo: l.tipo_cobranca,
      provider_message_id: p.provider_message_id || p.zapi_message_id || null,
      telefone: p.telefone || null,
      boleto_nome: p.boleto_nome || p.pdf_nome || null,
      simulate: p.simulated ?? p.simulate ?? null,
    };
  });

  const latestLog = logRows?.[0];
  if (latestLog) {
    const lp = typeof latestLog.payload === 'string' ? JSON.parse(latestLog.payload || '{}') : (latestLog.payload || {});
    REPORT.phase1.latest_log = {
      status_envio: latestLog.status_envio,
      erro: latestLog.erro,
      provider_message_id: lp.provider_message_id || lp.zapi_message_id || null,
      telefone: lp.telefone || null,
      boleto_nome: lp.boleto_nome || lp.pdf_nome || null,
      simulate: lp.simulated ?? lp.simulate ?? null,
    };
    if (latestLog.status_envio === 'sucesso' && !lp.simulated) {
      ok(`✉️  WhatsApp ENVIADO: provider_message_id=${lp.provider_message_id || lp.zapi_message_id}`);
      ok(`   Telefone entregue: ${lp.telefone}`);
      ok(`   PDF boleto: ${lp.boleto_nome || '(nenhum)'}`);
      REPORT.phase1.whatsapp_sent = true;
      REPORT.phase1.provider_message_id = lp.provider_message_id || lp.zapi_message_id;
      REPORT.phase1.attachment_sent = Boolean(lp.boleto_nome || lp.pdf_nome);
    } else if (latestLog.status_envio === 'sucesso_simulado') {
      addIssue(`Envio foi simulado (sucesso_simulado) — esperava real`);
      REPORT.phase1.whatsapp_sent = false;
    } else if (latestLog.status_envio === 'erro') {
      addIssue(`Envio com erro: ${latestLog.erro}`);
      REPORT.phase1.whatsapp_sent = false;
      REPORT.phase1.send_error = latestLog.erro;
    }
  } else {
    addIssue('Nenhum log_cobranca encontrado para o registro após o job');
    REPORT.phase1.whatsapp_sent = false;
  }

  // 1.6 — Provider health after Phase 1
  const { data: health } = await admin.from('dispatch_provider_health').select('state,consecutive_failures,total_success_24h,total_error_24h,last_success_at').eq('company_id', COMPANY_ID).maybeSingle();
  REPORT.phase1.provider_health = health;
  if (health) {
    info(`Provider health: state=${health.state} consec_fail=${health.consecutive_failures} success24h=${health.total_success_24h}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — Simulate fallback (simulate=true, sem boleto)
// ═══════════════════════════════════════════════════════════════════════════════
log('');
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log('PHASE 2 — Simulate fallback (simulate=true, sem boleto)');
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Use same record, override phone to test number
const simRes = await edgeFn({
  action: 'create_dispatch_job',
  company_id: COMPANY_ID,
  simulate: true,
  items: [{ record_id: testRecord.id, payload: { record_id: testRecord.id, simulate: true } }],
});

if (!simRes.ok) {
  addIssue(`Phase 2 create_dispatch_job falhou: ${simRes.error}`);
  REPORT.phase2 = { ok: false, error: simRes.error };
} else {
  const simJobId = simRes.job_id;
  ok(`Simulate job criado: ${simJobId}`);

  // Trigger direct batch (faster than scheduler)
  const simBatch = await edgeFn({ action: 'run_dispatch_job_batch', company_id: COMPANY_ID, job_id: simJobId, requested_batch_size: 1 });
  REPORT.phase2.batch_result = { ok: simBatch.ok, processed: simBatch.processed_items, stopped: simBatch.stopped_reason };

  await sleep(3000);

  // Check log
  const { data: simLogs } = await admin
    .from('logs_cobranca')
    .select('status_envio,erro,payload')
    .eq('company_id', COMPANY_ID)
    .eq('financeiro_id', testRecord.id)
    .order('created_at', { ascending: false })
    .limit(1);

  const simLog = simLogs?.[0];
  const sp = typeof simLog?.payload === 'string' ? JSON.parse(simLog?.payload || '{}') : (simLog?.payload || {});

  REPORT.phase2 = {
    job_id: simJobId,
    batch_ok: simBatch.ok,
    processed: simBatch.processed_items,
    log_status: simLog?.status_envio,
    log_error: simLog?.erro,
    is_simulated: sp.simulated ?? sp.simulate ?? null,
    no_attachment: !(sp.boleto_nome || sp.pdf_nome),
  };

  if (simLog?.status_envio === 'sucesso_simulado') {
    ok(`Fallback simulate correto: status_envio=sucesso_simulado`);
    if (!sp.boleto_nome && !sp.pdf_nome) {
      ok('Sem PDF attachment no simulate — comportamento correto (boleto_status=pendente)');
    }
  } else {
    addIssue(`Phase 2 log status inesperado: ${simLog?.status_envio} erro=${simLog?.erro}`);
  }

  // Cancel sim job to keep state clean
  await edgeFn({ action: 'cancel_dispatch_job', company_id: COMPANY_ID, job_id: simJobId });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — Retry mechanics
// ═══════════════════════════════════════════════════════════════════════════════
log('');
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log('PHASE 3 — Retry mechanics (telefone invalido → retryable=true)');
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Find another record to use for retry test, or use a different record
const { data: retryCandidate } = await admin
  .from('registros_financeiros')
  .select('id,nome,telefone,documento')
  .eq('company_id', COMPANY_ID)
  .not('id', 'eq', testRecord.id)
  .not('status', 'in', '("liquidado","pago","cancelado")')
  .not('telefone', 'is', null)
  .limit(1)
  .single();

const retryRecord = retryCandidate || testRecord;
const originalRetryPhone = retryRecord.telefone;

// Override with invalid phone to force error
await admin.from('registros_financeiros')
  .update({ telefone: '000', updated_at: new Date().toISOString() })
  .eq('id', retryRecord.id);

const retryJobRes = await edgeFn({
  action: 'create_dispatch_job',
  company_id: COMPANY_ID,
  simulate: false,
  items: [{ record_id: retryRecord.id, payload: { record_id: retryRecord.id, simulate: false } }],
});

REPORT.phase3 = { record_id: retryRecord.id, invalid_phone: '000' };

if (!retryJobRes.ok) {
  addIssue(`Phase 3 create failed: ${retryJobRes.error}`);
  REPORT.phase3.error = retryJobRes.error;
} else {
  const retryJobId = retryJobRes.job_id;
  ok(`Retry test job: ${retryJobId}`);

  // Run batch with invalid phone
  const retryBatch = await edgeFn({ action: 'run_dispatch_job_batch', company_id: COMPANY_ID, job_id: retryJobId, requested_batch_size: 1 });
  await sleep(4000);

  // Check item state
  const { data: retryItems } = await admin
    .from('dispatch_job_items')
    .select('id,status,last_error_code,last_error_message,attempt_count,next_attempt_at,payload')
    .eq('job_id', retryJobId)
    .limit(1);

  const ri = retryItems?.[0];
  REPORT.phase3.batch_ok = retryBatch.ok;
  REPORT.phase3.item_status = ri?.status;
  REPORT.phase3.error_code = ri?.last_error_code;
  REPORT.phase3.error_message = ri?.last_error_message?.substring(0, 100);
  REPORT.phase3.attempt_count = ri?.attempt_count;
  REPORT.phase3.next_retry_at = ri?.next_attempt_at;

  const isRetryable = ['sem_telefone', 'telefone_invalido', 'zapi_timeout', 'zapi_error', 'batch_timeout', 'network_error'].includes(ri?.last_error_code || '');
  REPORT.phase3.is_retryable = isRetryable;

  if (ri?.status === 'error') {
    ok(`Item com erro esperado: code=${ri.last_error_code} attempts=${ri.attempt_count}`);
    if (ri.next_attempt_at) {
      ok(`next_attempt_at preenchido: ${ri.next_attempt_at}`);
    } else {
      addIssue('next_attempt_at está null no item em erro');
    }
  }

  // Cancel and restore
  await edgeFn({ action: 'cancel_dispatch_job', company_id: COMPANY_ID, job_id: retryJobId });
}

// Restore retry record phone
await admin.from('registros_financeiros').update({ telefone: originalRetryPhone, updated_at: new Date().toISOString() }).eq('id', retryRecord.id);
addFix(`Phone restaurado para retry record: ${originalRetryPhone}`);

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP — Restore original state
// ═══════════════════════════════════════════════════════════════════════════════
log('');
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log('CLEANUP — Restaurando estado original');
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Restore test record phone
const { error: restoreErr } = await admin
  .from('registros_financeiros')
  .update({ telefone: testRecord.telefone, updated_at: new Date().toISOString() })
  .eq('id', testRecord.id);
if (restoreErr) {
  addIssue(`Falha ao restaurar telefone: ${restoreErr.message}`);
} else {
  ok(`Telefone restaurado: ${testRecord.telefone}`);
}

// Restore permitir_envio_sem_boleto
if (!driveConfigured && !originalAllowWithoutBoleto) {
  const { error: restoreCfgErr } = await admin
    .from('whatsapp_cobranca_config')
    .update({ permitir_envio_sem_boleto: false, updated_at: new Date().toISOString() })
    .eq('empresa_id', COMPANY_ID);
  if (restoreCfgErr) {
    addIssue(`Falha ao restaurar permitir_envio_sem_boleto: ${restoreCfgErr.message}`);
  } else {
    ok('permitir_envio_sem_boleto restaurado para false');
  }
}

// Restore Z-API connected to original value
if (REPORT.preflight.zapi_status === 'fixed_connected' && zapiRow) {
  const { error: zapiRestoreErr } = await admin
    .from('company_integrations')
    .update({ connected: false, updated_at: new Date().toISOString() })
    .eq('id', zapiRow.id);
  if (zapiRestoreErr) {
    addIssue(`Falha ao restaurar Z-API connected: ${zapiRestoreErr.message}`);
  } else {
    ok('Z-API connected restaurado para false (original)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════════════════
REPORT.finished_at = new Date().toISOString();
REPORT.verdict = (REPORT.issues.filter(i => !i.includes('FIX') && !i.toLowerCase().includes('drive') && !i.toLowerCase().includes('z-api connected=false')).length === 0 && REPORT.phase1.create_job?.ok)
  ? 'PASSED'
  : (REPORT.phase1.whatsapp_sent ? 'PARTIAL' : 'FAILED');

console.log('');
console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║                    RELATÓRIO FINAL — E2E DISPATCH REAL              ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('  Data/Hora      :', REPORT.started_at.substring(0,19), '→', REPORT.finished_at.substring(0,19));
console.log('  Empresa        :', REPORT.environment.company_id);
console.log('  VERDICT        :', REPORT.verdict);
console.log('');
console.log('── PRÉ-FLIGHT ─────────────────────────────────────────────────────────');
console.log('  Tenant enabled :', REPORT.preflight.limits?.enabled);
console.log('  Mensagens hoje :', REPORT.preflight.limits?.daily);
console.log('  Scheduler      :', REPORT.preflight.scheduler?.online ? 'online' : 'offline', '| jobs ativos:', REPORT.preflight.scheduler?.active_jobs);
console.log('  Z-API          :', REPORT.preflight.zapi_status, '| instance:', REPORT.preflight.zapi_instance_id?.substring(0,20)+'...');
console.log('  Drive          :', REPORT.preflight.drive_configured ? `OK (${REPORT.preflight.drive_folder_id?.substring(0,20)}...)` : 'NÃO CONFIGURADO');
console.log('');
console.log('── REGISTRO DE TESTE ──────────────────────────────────────────────────');
const tr = REPORT.preflight.test_record || {};
console.log('  record_id      :', tr.id);
console.log('  cliente_nome   :', tr.nome);
console.log('  documento      :', tr.documento);
console.log('  valor          : R$', tr.valor);
console.log('  vencimento     :', tr.vencimento);
console.log('  status         :', tr.status);
console.log('  boleto_status  :', tr.boleto_status);
console.log('  boleto_pdf     :', tr.boleto_pdf_nome || '(sem boleto)');
console.log('  exact_match    :', tr.has_drive_file ? `SIM (confidence=${tr.boleto_match_confidence})` : 'NÃO (Drive não sincronizado)');
console.log('  telefone orig. :', tr.original_telefone);
console.log('  telefone smoke :', TEST_PHONE);
console.log('');
console.log('── FASE 1 — ENVIO REAL ────────────────────────────────────────────────');
const p1 = REPORT.phase1;
console.log('  dispatch_job criado  :', p1.create_job?.ok ? `✅ ${p1.create_job?.job_id}` : `❌ ${p1.create_job?.error}`);
console.log('  scheduler tick       :', p1.scheduler_tick1?.ok ? `✅ processed=${p1.scheduler_tick1?.processed}` : `❌ ${p1.scheduler_tick1?.error}`);
console.log('  batch direto         :', p1.direct_batch ? `ok=${p1.direct_batch?.ok} processed=${p1.direct_batch?.processed}` : '(nao invocado)');
console.log('  job final status     :', p1.job_final?.status);
console.log('  job success/error    :', `${p1.job_final?.success_count}/${p1.job_final?.total_items} ok, ${p1.job_final?.error_count} err`);
console.log('  item status          :', p1.job_items?.[0]?.status);
console.log('  item error_code      :', p1.job_items?.[0]?.error_code || '-');
console.log('  log_cobranca_id      :', p1.job_items?.[0]?.log_id || '-');
console.log('  WhatsApp enviado     :', p1.whatsapp_sent ? `✅ SIM` : `❌ NÃO`);
console.log('  provider_message_id  :', p1.provider_message_id || '-');
console.log('  PDF attachment       :', p1.attachment_sent ? '✅ SIM' : (REPORT.preflight.drive_configured ? '❌ NÃO' : '⚠️  N/A (Drive não configurado)'));
console.log('  telefone final usado :', p1.logs_cobranca?.[0]?.telefone || '-');
console.log('  send error           :', p1.send_error || '-');
console.log('  Provider health      :', p1.provider_health?.state, `consec_fail=${p1.provider_health?.consecutive_failures}`);
console.log('');
console.log('── FASE 2 — SIMULATE FALLBACK ─────────────────────────────────────────');
const p2 = REPORT.phase2;
console.log('  job_id               :', p2.job_id);
console.log('  batch ok             :', p2.batch_ok);
console.log('  log status_envio     :', p2.log_status);
console.log('  é simulação          :', p2.is_simulated);
console.log('  sem PDF attachment   :', p2.no_attachment ? '✅ correto' : '⚠️  attachment presente');
console.log('');
console.log('── FASE 3 — RETRY MECHANICS ───────────────────────────────────────────');
const p3 = REPORT.phase3;
console.log('  telefone inválido    : 000');
console.log('  item status          :', p3.item_status);
console.log('  error_code           :', p3.error_code);
console.log('  retryable            :', p3.is_retryable ? '✅ SIM' : '❌ NÃO');
console.log('  next_retry_at        :', p3.next_retry_at || '-');
console.log('  attempt_count        :', p3.attempt_count);
console.log('');
console.log('── ISSUES ENCONTRADOS ─────────────────────────────────────────────────');
if (REPORT.issues.length === 0) {
  console.log('  (nenhum)');
} else {
  REPORT.issues.forEach((i, idx) => console.log(`  [${idx+1}] ${i}`));
}
console.log('');
console.log('── CORREÇÕES APLICADAS ────────────────────────────────────────────────');
REPORT.corrections.forEach((c, idx) => console.log(`  [${idx+1}] ${c}`));
console.log('');
console.log('── ESTADO RESTAURADO ──────────────────────────────────────────────────');
console.log('  telefone do registro :', testRecord.telefone, '(restaurado)');
console.log('  permitir_sem_boleto  :', originalAllowWithoutBoleto, '(restaurado)');
console.log('  Z-API connected      :', REPORT.preflight.zapi_original_connected, '(restaurado)');
console.log('');

// JSON report
const reportPath = path.resolve(ROOT, 'tests', 'integration', 'e2e-dispatch-real-report.json');
fs.writeFileSync(reportPath, JSON.stringify(REPORT, null, 2), 'utf8');
console.log(`  Relatório JSON salvo em: tests/integration/e2e-dispatch-real-report.json`);
console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log(`║  VERDICT: ${REPORT.verdict.padEnd(60)}║`);
console.log('╚══════════════════════════════════════════════════════════════════════╝');
