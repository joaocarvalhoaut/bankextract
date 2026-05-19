/**
 * dispatch-quota-logic.test.js
 *
 * Pure unit tests for ETAPA 9 logic (no network, no Supabase).
 * Tests round-robin selection, circuit breaker thresholds,
 * and quota condition helpers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ── Round-robin selection (mirrors runSchedulerTick logic) ────────────────────

function selectRoundRobin(jobs, maxConcurrent = 3) {
  const priorityMap = { running: 0, paused: 1, pending: 2 };
  const sorted = [...jobs].sort(
    (a, b) => (priorityMap[a.status] ?? 3) - (priorityMap[b.status] ?? 3),
  );
  const seenCompanies = new Set();
  const selected = [];
  for (const job of sorted) {
    if (selected.length >= maxConcurrent) break;
    if (seenCompanies.has(job.company_id)) continue;
    seenCompanies.add(job.company_id);
    selected.push(job);
  }
  return selected;
}

test('round-robin: selects 1 job per company max', () => {
  const jobs = [
    { id: '1', company_id: 'A', status: 'running' },
    { id: '2', company_id: 'A', status: 'running' },
    { id: '3', company_id: 'B', status: 'running' },
    { id: '4', company_id: 'C', status: 'pending' },
  ];
  const selected = selectRoundRobin(jobs);
  const companies = selected.map((j) => j.company_id);
  assert.deepEqual(companies.sort(), ['A', 'B', 'C'].sort(), 'one job per company');
  assert.equal(selected.length, 3, 'exactly 3 selected');
});

test('round-robin: respects maxConcurrent cap', () => {
  const jobs = [
    { id: '1', company_id: 'A', status: 'running' },
    { id: '2', company_id: 'B', status: 'running' },
    { id: '3', company_id: 'C', status: 'pending' },
    { id: '4', company_id: 'D', status: 'pending' },
  ];
  const selected = selectRoundRobin(jobs, 2);
  assert.equal(selected.length, 2, 'capped at maxConcurrent');
});

test('round-robin: prioritises running > paused > pending', () => {
  const jobs = [
    { id: '1', company_id: 'A', status: 'pending' },
    { id: '2', company_id: 'A', status: 'paused' },
    { id: '3', company_id: 'A', status: 'running' },
  ];
  const selected = selectRoundRobin(jobs, 1);
  assert.equal(selected[0].status, 'running', 'running wins priority');
  assert.equal(selected[0].id, '3');
});

test('round-robin: company B not starved when A has many jobs', () => {
  const jobs = [
    { id: 'a1', company_id: 'A', status: 'running' },
    { id: 'a2', company_id: 'A', status: 'running' },
    { id: 'a3', company_id: 'A', status: 'paused' },
    { id: 'b1', company_id: 'B', status: 'paused' },
  ];
  const selected = selectRoundRobin(jobs, 3);
  const companies = selected.map((j) => j.company_id);
  assert.ok(companies.includes('B'), 'company B included in selection');
  assert.ok(companies.filter((c) => c === 'A').length === 1, 'company A only gets 1 slot');
});

test('round-robin: disabled companies already filtered before call', () => {
  // Simulate: disabled companies would be excluded upstream
  const allJobs = [
    { id: '1', company_id: 'DISABLED', status: 'running', enabled: false },
    { id: '2', company_id: 'ACTIVE', status: 'running', enabled: true },
  ];
  const eligibleJobs = allJobs.filter((j) => j.enabled);
  const selected = selectRoundRobin(eligibleJobs, 3);
  assert.equal(selected.length, 1, 'only active company');
  assert.equal(selected[0].company_id, 'ACTIVE');
});

// ── Circuit breaker state logic ────────────────────────────────────────────────

const CIRCUIT_BREAKER_MIN_SAMPLES = 5;
const CIRCUIT_BREAKER_ERROR_RATE_THRESHOLD = 0.80;
const CIRCUIT_BREAKER_MAX_CONSECUTIVE_FAILURES = 5;
const CIRCUIT_BREAKER_MAX_CONSECUTIVE_RATE_LIMITS = 3;

function computeProviderState(metrics) {
  const {
    consecutive_failures,
    consecutive_rate_limits,
    total_success_24h,
    total_error_24h,
  } = metrics;

  const total = total_success_24h + total_error_24h;
  const errorRate = total > 0 ? total_error_24h / total : 0;

  if (
    consecutive_failures >= CIRCUIT_BREAKER_MAX_CONSECUTIVE_FAILURES ||
    (total >= CIRCUIT_BREAKER_MIN_SAMPLES && errorRate >= CIRCUIT_BREAKER_ERROR_RATE_THRESHOLD)
  ) {
    return 'unhealthy';
  }
  if (
    consecutive_failures >= 2 ||
    consecutive_rate_limits >= CIRCUIT_BREAKER_MAX_CONSECUTIVE_RATE_LIMITS ||
    (total >= CIRCUIT_BREAKER_MIN_SAMPLES && errorRate >= 0.5)
  ) {
    return 'degraded';
  }
  return 'healthy';
}

test('circuit breaker: healthy on clean slate', () => {
  assert.equal(
    computeProviderState({ consecutive_failures: 0, consecutive_rate_limits: 0, total_success_24h: 10, total_error_24h: 0 }),
    'healthy',
  );
});

test('circuit breaker: degraded after 2 consecutive failures', () => {
  assert.equal(
    computeProviderState({ consecutive_failures: 2, consecutive_rate_limits: 0, total_success_24h: 10, total_error_24h: 1 }),
    'degraded',
  );
});

test('circuit breaker: unhealthy after 5 consecutive failures', () => {
  assert.equal(
    computeProviderState({ consecutive_failures: 5, consecutive_rate_limits: 0, total_success_24h: 5, total_error_24h: 5 }),
    'unhealthy',
  );
});

test('circuit breaker: unhealthy when error rate >= 80% with enough samples', () => {
  assert.equal(
    computeProviderState({ consecutive_failures: 1, consecutive_rate_limits: 0, total_success_24h: 1, total_error_24h: 9 }),
    'unhealthy',  // 90% error rate, 10 samples
  );
});

test('circuit breaker: degraded when error rate 50-80% with enough samples', () => {
  assert.equal(
    computeProviderState({ consecutive_failures: 0, consecutive_rate_limits: 0, total_success_24h: 4, total_error_24h: 5 }),
    'degraded',  // ~56% error rate, 9 samples (>= 5)
  );
});

test('circuit breaker: not triggered with <5 samples even at high error rate', () => {
  assert.equal(
    computeProviderState({ consecutive_failures: 0, consecutive_rate_limits: 0, total_success_24h: 0, total_error_24h: 3 }),
    'healthy',  // 100% error rate but only 3 samples < MIN_SAMPLES
  );
});

test('circuit breaker: degraded on 3 consecutive rate limits', () => {
  assert.equal(
    computeProviderState({ consecutive_failures: 0, consecutive_rate_limits: 3, total_success_24h: 20, total_error_24h: 0 }),
    'degraded',
  );
});

test('circuit breaker: resets to healthy after success', () => {
  // After successes reset consecutive_failures to 0
  assert.equal(
    computeProviderState({ consecutive_failures: 0, consecutive_rate_limits: 0, total_success_24h: 100, total_error_24h: 0 }),
    'healthy',
  );
});

// ── Quota enforcement logic ────────────────────────────────────────────────────

function checkCreateJobQuota(limits, usage) {
  if (!limits.enabled) return { ok: false, reason: 'tenant_disabled' };
  if (usage.active_jobs >= limits.max_active_jobs) return { ok: false, reason: 'max_active_jobs' };
  if (usage.daily_messages >= limits.max_daily_messages) return { ok: false, reason: 'max_daily_messages' };
  return { ok: true };
}

function checkBatchQuota(limits, usage) {
  if (!limits.enabled) return { ok: false, reason: 'tenant_disabled' };
  if (usage.daily_messages >= limits.max_daily_messages) return { ok: false, reason: 'max_daily_messages' };
  if (usage.retries_last_hour >= limits.max_retries_per_hour) return { ok: false, reason: 'rate_limit_pause' };
  return { ok: true };
}

test('quota: blocks creation when tenant disabled', () => {
  const limits = { enabled: false, max_active_jobs: 3, max_daily_messages: 500 };
  const usage = { active_jobs: 0, daily_messages: 0 };
  const result = checkCreateJobQuota(limits, usage);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'tenant_disabled');
});

test('quota: blocks creation when max_active_jobs reached', () => {
  const limits = { enabled: true, max_active_jobs: 3, max_daily_messages: 500 };
  const usage = { active_jobs: 3, daily_messages: 0 };
  const result = checkCreateJobQuota(limits, usage);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'max_active_jobs');
});

test('quota: blocks creation when daily message limit reached', () => {
  const limits = { enabled: true, max_active_jobs: 3, max_daily_messages: 500 };
  const usage = { active_jobs: 1, daily_messages: 500 };
  const result = checkCreateJobQuota(limits, usage);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'max_daily_messages');
});

test('quota: allows creation when all limits have headroom', () => {
  const limits = { enabled: true, max_active_jobs: 3, max_daily_messages: 500 };
  const usage = { active_jobs: 1, daily_messages: 100 };
  const result = checkCreateJobQuota(limits, usage);
  assert.equal(result.ok, true);
});

test('quota: blocks batch when rate limit exceeded', () => {
  const limits = { enabled: true, max_retries_per_hour: 30, max_daily_messages: 500 };
  const usage = { daily_messages: 0, retries_last_hour: 30 };
  const result = checkBatchQuota(limits, usage);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rate_limit_pause');
});

test('quota: near-limit detection at 80%', () => {
  const limit = 500;
  const used = 400; // 80%
  const pct = Math.round((used / limit) * 100);
  assert.ok(pct >= 80, `${pct}% should be flagged as near limit`);
});

test('quota: at-limit detection at 100%', () => {
  const limit = 10;
  const used = 10;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  assert.equal(pct, 100, 'at limit');
});

// ── Audit event type validation ────────────────────────────────────────────────

const VALID_AUDIT_EVENT_TYPES = new Set([
  'quota_exceeded',
  'scheduler_pause',
  'stale_worker',
  'provider_unhealthy',
  'tenant_disabled',
  'manual_cancel',
  'retry_exhausted',
  'batch_circuit_break',
  'tenant_paused',
  'tenant_resumed',
  'rate_limit_pause',
  'job_auto_completed',
  'job_auto_failed',
]);

test('audit events: all expected types present in valid set', () => {
  const required = [
    'quota_exceeded', 'stale_worker', 'batch_circuit_break',
    'tenant_paused', 'tenant_resumed', 'rate_limit_pause', 'tenant_disabled',
    'provider_unhealthy',
  ];
  for (const type of required) {
    assert.ok(VALID_AUDIT_EVENT_TYPES.has(type), `${type} must be a valid audit event type`);
  }
});

test('audit events: unknown type rejected', () => {
  assert.equal(VALID_AUDIT_EVENT_TYPES.has('made_up_event'), false);
});

// ── Provider state transitions ─────────────────────────────────────────────────

test('provider health: consecutive failures reset to 0 on success', () => {
  // Simulate updateProviderHealth logic: success resets consecutiveFailures
  const prev = { consecutive_failures: 4, consecutive_rate_limits: 2 };
  const success = true;
  const consecutiveFailures = success ? 0 : prev.consecutive_failures + 1;
  const consecutiveRateLimits = success ? 0 : prev.consecutive_rate_limits;
  assert.equal(consecutiveFailures, 0, 'failures reset on success');
  assert.equal(consecutiveRateLimits, 0, 'rate limits reset on success');
});

test('provider health: state persists unhealthy_since timestamp', () => {
  // Once unhealthy, unhealthy_since should not update on subsequent failures
  const unhealthySince = '2026-01-01T00:00:00Z';
  const prevState = 'unhealthy';
  const newState = 'unhealthy';
  const resultSince = newState === 'unhealthy' && prevState !== 'unhealthy'
    ? 'new-timestamp'
    : unhealthySince;
  assert.equal(resultSince, unhealthySince, 'unhealthy_since preserved on continued unhealthy state');
});

test('provider health: unhealthy_since set only on first transition', () => {
  const prevState = 'healthy';
  const newState = 'unhealthy';
  const nowIso = '2026-05-19T12:00:00Z';
  const prevUnhealthySince = null;
  const resultSince = newState === 'unhealthy' && prevState !== 'unhealthy'
    ? nowIso
    : (prevUnhealthySince || null);
  assert.equal(resultSince, nowIso, 'unhealthy_since set on first unhealthy transition');
});
