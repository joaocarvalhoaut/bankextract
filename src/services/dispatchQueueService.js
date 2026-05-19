/**
 * dispatchQueueService.js
 *
 * Service layer for dispatch_jobs and dispatch_job_items.
 * Reads: direct Supabase queries (RLS-scoped).
 * Writes: Edge Function billing-automation actions.
 */

import { supabase } from './supabaseClient';
import { createScopedLogger } from './loggerService';

const logger = createScopedLogger('dispatch-queue');

// ── helpers ────────────────────────────────────────────────────────────────────

const buildError = (err, fallback) => {
  if (err instanceof Error) return err;
  return new Error(err?.message || err?.error || fallback);
};

async function invokeAction(body, fallbackMessage) {
  if (!supabase) throw new Error('Supabase nao configurado.');

  const { data, error } = await supabase.functions.invoke('billing-automation', { body });
  if (error) throw buildError(error, fallbackMessage);

  const isFailure = data?.ok === false || data?.success === false;
  if (isFailure) {
    throw new Error(data?.error || data?.message || fallbackMessage);
  }
  return data;
}

// ── read operations (direct Supabase) ─────────────────────────────────────────

/**
 * List dispatch_jobs for a company with optional filters.
 * @param {string} companyId
 * @param {{ status?: string[], period?: number, page?: number, pageSize?: number }} filters
 */
export async function listDispatchJobs(companyId, filters = {}) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!companyId) return { data: [], count: 0 };

  const {
    status,
    period,
    page = 0,
    pageSize = 20,
    withErrors = false,
  } = filters;

  let q = supabase
    .from('dispatch_jobs')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (status && status.length > 0) {
    q = q.in('status', status);
  }

  if (period && period > 0) {
    const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();
    q = q.gte('created_at', since);
  }

  if (withErrors) {
    q = q.gt('error_count', 0);
  }

  q = q.range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw buildError(error, 'Falha ao carregar os jobs da fila.');

  return { data: data || [], count: count || 0 };
}

/**
 * Get a single dispatch_job by ID.
 */
export async function getDispatchJob(jobId) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!jobId) return null;

  const { data, error } = await supabase
    .from('dispatch_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) throw buildError(error, 'Falha ao carregar o job.');
  return data;
}

/**
 * Get items for a dispatch_job.
 * @param {string} jobId
 * @param {{ status?: string[], withErrors?: boolean, retryable?: boolean, page?: number, pageSize?: number }} filters
 */
export async function getDispatchJobItems(jobId, filters = {}) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!jobId) return { data: [], count: 0 };

  const {
    status,
    withErrors = false,
    retryable = false,
    page = 0,
    pageSize = 50,
  } = filters;

  let q = supabase
    .from('dispatch_job_items')
    .select('*', { count: 'exact' })
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (status && status.length > 0) {
    q = q.in('status', status);
  }

  if (withErrors) {
    q = q.eq('status', 'error');
  }

  if (retryable) {
    q = q
      .eq('status', 'error')
      .lt('attempt_count', supabase.rpc ? 3 : 3); // max_attempts
  }

  q = q.range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw buildError(error, 'Falha ao carregar os itens do job.');

  return { data: data || [], count: count || 0 };
}

/**
 * Get summary KPIs for all jobs of a company.
 */
export async function getDispatchJobsKpis(companyId) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!companyId) return { active: 0, paused: 0, pending_retries: 0, total_success: 0, total_error: 0, total_ignored: 0 };

  const { data, error } = await supabase
    .from('dispatch_jobs')
    .select('status, success_count, error_count, ignored_count, processed_items, avg_ms_per_item')
    .eq('company_id', companyId)
    .in('status', ['pending', 'running', 'paused', 'completed', 'failed'])
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (error) throw buildError(error, 'Falha ao carregar os KPIs da fila.');

  const jobs = data || [];

  const active = jobs.filter((j) => j.status === 'running').length;
  const paused = jobs.filter((j) => j.status === 'paused').length;
  const total_success = jobs.reduce((s, j) => s + (j.success_count || 0), 0);
  const total_error = jobs.reduce((s, j) => s + (j.error_count || 0), 0);
  const total_ignored = jobs.reduce((s, j) => s + (j.ignored_count || 0), 0);
  const total_processed = jobs.reduce((s, j) => s + (j.processed_items || 0), 0);

  // Throughput: items/hour based on jobs processed in last 24h
  const recentJobs = jobs.filter((j) => j.avg_ms_per_item && j.avg_ms_per_item > 0);
  const avgMs = recentJobs.length > 0
    ? recentJobs.reduce((s, j) => s + j.avg_ms_per_item, 0) / recentJobs.length
    : 0;
  const throughput_per_hour = avgMs > 0 ? Math.round(3600000 / avgMs) : 0;

  const total_sent = total_success + total_error + total_ignored;
  const success_rate = total_sent > 0 ? Math.round((total_success / total_sent) * 100) : 0;

  return {
    active,
    paused,
    total_success,
    total_error,
    total_ignored,
    total_processed,
    throughput_per_hour,
    success_rate,
  };
}

/**
 * Count pending retries for a company.
 */
export async function countPendingRetries(companyId) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!companyId) return 0;

  const { count, error } = await supabase
    .from('dispatch_job_items')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'error')
    .lt('attempt_count', 3);

  if (error) return 0;
  return count || 0;
}

// ── write operations (edge function) ──────────────────────────────────────────

/**
 * Create a new dispatch job.
 */
export async function createDispatchJob(companyId, options = {}) {
  logger.info('create_dispatch_job', { company_id: companyId, simulate: options.simulate });
  return invokeAction(
    {
      action: 'create_dispatch_job',
      company_id: companyId,
      companyId,
      simulate: options.simulate !== false,
      limit: options.limit ?? 50,
      batch_size: options.batch_size ?? 20,
    },
    'Falha ao criar o job de disparo.'
  );
}

/**
 * Run the next batch for an existing dispatch job.
 */
export async function runDispatchBatch(companyId, jobId, options = {}) {
  logger.info('run_dispatch_batch', { company_id: companyId, job_id: jobId });
  return invokeAction(
    {
      action: 'run_dispatch_batch',
      company_id: companyId,
      companyId,
      job_id: jobId,
      batch_size: options.batch_size,
    },
    'Falha ao executar o proximo batch do job.'
  );
}

/**
 * Cancel a dispatch job.
 */
export async function cancelDispatchJob(companyId, jobId) {
  logger.info('cancel_dispatch_job', { company_id: companyId, job_id: jobId });
  return invokeAction(
    {
      action: 'cancel_dispatch_job',
      company_id: companyId,
      companyId,
      job_id: jobId,
    },
    'Falha ao cancelar o job.'
  );
}

/**
 * Reprocess failed items for a dispatch job.
 */
export async function reprocessDispatchJobFailures(companyId, jobId) {
  logger.info('reprocess_dispatch_job_failures', { company_id: companyId, job_id: jobId });
  return invokeAction(
    {
      action: 'reprocess_dispatch_job_failures',
      company_id: companyId,
      companyId,
      job_id: jobId,
    },
    'Falha ao reprocessar as falhas do job.'
  );
}

// ── Scheduler operations ───────────────────────────────────────────────────────

/**
 * Trigger a manual scheduler tick (useful for testing without pg_cron).
 * Requires admin / cron bypass.
 */
export async function runSchedulerTick() {
  logger.info('run_scheduler_tick');
  return invokeAction(
    { action: 'run_scheduler_tick' },
    'Falha ao executar o tick do scheduler.'
  );
}

/**
 * Get the current scheduler status: worker online, last tick, active/stale jobs.
 */
export async function getSchedulerStatus() {
  if (!supabase) throw new Error('Supabase nao configurado.');
  return invokeAction(
    { action: 'get_scheduler_status' },
    'Falha ao carregar o status do scheduler.'
  );
}

// ── ETAPA 9: Tenant limits / quota ────────────────────────────────────────────

/**
 * Get tenant limits and current quota usage.
 */
export async function getTenantLimits(companyId) {
  logger.info('get_tenant_limits', { company_id: companyId });
  return invokeAction(
    { action: 'get_tenant_limits', company_id: companyId, companyId },
    'Falha ao carregar os limites do tenant.',
  );
}

/**
 * Get current quota usage for a company (without limits).
 */
export async function getTenantQuotaUsage(companyId) {
  logger.info('get_tenant_quota_usage', { company_id: companyId });
  return invokeAction(
    { action: 'get_tenant_quota_usage', company_id: companyId, companyId },
    'Falha ao carregar o uso de quota.',
  );
}

/**
 * Update tenant limits (admin only).
 * @param {string} companyId
 * @param {{ max_active_jobs?: number, max_batch_size?: number, max_daily_messages?: number, max_concurrent_batches?: number, max_retries_per_hour?: number }} limits
 */
export async function updateTenantLimits(companyId, limits = {}) {
  logger.info('update_tenant_limits', { company_id: companyId, limits });
  return invokeAction(
    { action: 'update_tenant_limits', company_id: companyId, companyId, ...limits },
    'Falha ao atualizar os limites do tenant.',
  );
}

/**
 * Suspend all dispatch for a company.
 */
export async function pauseTenantDispatch(companyId, reason = 'Suspenso manualmente.') {
  logger.info('pause_tenant_dispatch', { company_id: companyId, reason });
  return invokeAction(
    { action: 'pause_tenant_dispatch', company_id: companyId, companyId, reason },
    'Falha ao suspender o dispatch do tenant.',
  );
}

/**
 * Resume dispatch for a company.
 */
export async function resumeTenantDispatch(companyId) {
  logger.info('resume_tenant_dispatch', { company_id: companyId });
  return invokeAction(
    { action: 'resume_tenant_dispatch', company_id: companyId, companyId },
    'Falha ao reativar o dispatch do tenant.',
  );
}

/**
 * Read audit events for a company (direct Supabase, RLS-scoped).
 */
export async function getDispatchAuditEvents(companyId, limit = 50) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!companyId) return { data: [] };

  const { data, error } = await supabase
    .from('dispatch_audit_events')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message || 'Falha ao carregar os eventos de auditoria.');
  return { data: data || [] };
}

/**
 * Read provider health for a company (direct Supabase, RLS-scoped).
 */
export async function getProviderHealth(companyId) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!companyId) return null;

  const { data, error } = await supabase
    .from('dispatch_provider_health')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) return null;
  return data;
}

/**
 * Query the last N scheduler logs directly from the database.
 * Used by the UI to display observability data.
 * Only accessible by system_admins (RLS).
 */
export async function getSchedulerLogs(limit = 20) {
  if (!supabase) throw new Error('Supabase nao configurado.');

  const { data, error } = await supabase
    .from('dispatch_scheduler_logs')
    .select('*')
    .order('tick_at', { ascending: false })
    .limit(limit);

  if (error) {
    // Non-fatal: RLS may reject for non-admins
    return { data: [], error: error.message };
  }
  return { data: data || [], error: null };
}
