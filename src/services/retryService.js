const DEFAULT_BASE_DELAY_MS = 60_000;
const DEFAULT_MAX_DELAY_MS = 6 * 60 * 60 * 1000;

export function computeBackoffDelay(retryCount = 0, options = {}) {
  const baseDelay = Number(options.baseDelayMs || DEFAULT_BASE_DELAY_MS);
  const maxDelay = Number(options.maxDelayMs || DEFAULT_MAX_DELAY_MS);
  const attempt = Math.max(0, Number(retryCount || 0));
  return Math.min(baseDelay * (2 ** attempt), maxDelay);
}

export function buildRetrySchedule(retryCount = 0, options = {}) {
  const delayMs = computeBackoffDelay(retryCount, options);
  const now = new Date();
  return {
    retry_count: Math.max(0, Number(retryCount || 0)) + 1,
    last_retry_at: now.toISOString(),
    next_retry_at: new Date(now.getTime() + delayMs).toISOString(),
    delay_ms: delayMs,
  };
}

export function shouldRetryAt(nextRetryAt) {
  if (!nextRetryAt) return true;
  return new Date(nextRetryAt).getTime() <= Date.now();
}

export function withRetryMetadata(error, retryCount = 0, options = {}) {
  const schedule = buildRetrySchedule(retryCount, options);
  return {
    error: error instanceof Error ? error.message : String(error || 'Erro desconhecido'),
    ...schedule,
  };
}

export default {
  computeBackoffDelay,
  buildRetrySchedule,
  shouldRetryAt,
  withRetryMetadata,
};
