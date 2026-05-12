import { createClient } from 'jsr:@supabase/supabase-js@2';

export type AdminClient = ReturnType<typeof createClient>;

export type RuntimeContext = {
  requestId: string;
  module: string;
  action: string;
  companyId: string;
  userId: string;
  startedAt: number;
  createdAt: string;
  environment: string;
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, stripe-signature',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function getEnv(name: string) {
  return String(Deno.env.get(name) || '').trim();
}

export function requireEnv(name: string) {
  const value = getEnv(name);
  if (!value) throw new Error(`${name} nao configurado.`);
  return value;
}

export function buildAdminClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

export function buildAuthClient(req: Request) {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') || '',
      },
    },
  });
}

export function createRequestContext(req: Request, options: {
  module: string;
  action?: string;
  companyId?: string | null;
  userId?: string | null;
}) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  return {
    requestId,
    module: options.module,
    action: options.action || 'request',
    companyId: String(options.companyId || '').trim(),
    userId: String(options.userId || '').trim(),
    startedAt: Date.now(),
    createdAt: new Date().toISOString(),
    environment: getEnv('DENO_DEPLOYMENT_ID') ? 'production' : (getEnv('SUPABASE_ENV') || 'development'),
  } satisfies RuntimeContext;
}

export function getDurationMs(ctx: RuntimeContext) {
  return Math.max(0, Date.now() - ctx.startedAt);
}

export function normalizeRuntimeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Erro interno.',
      stack: error.stack || '',
    };
  }

  if (typeof error === 'object' && error) {
    try {
      return JSON.parse(JSON.stringify(error));
    } catch {
      return {
        name: 'UnknownObjectError',
        message: String(error),
        stack: '',
      };
    }
  }

  return {
    name: 'UnknownError',
    message: String(error || 'Erro interno.'),
    stack: '',
  };
}

export function logRuntime(
  ctx: RuntimeContext,
  payload: {
    action?: string;
    status?: string;
    companyId?: string | null;
    userId?: string | null;
    metadata?: Record<string, unknown>;
    error?: unknown;
  } = {},
) {
  const entry = {
    request_id: ctx.requestId,
    company_id: String(payload.companyId ?? ctx.companyId ?? '').trim() || null,
    user_id: String(payload.userId ?? ctx.userId ?? '').trim() || null,
    module: ctx.module,
    action: payload.action || ctx.action,
    status: payload.status || 'ok',
    duration_ms: getDurationMs(ctx),
    metadata: payload.metadata || {},
    created_at: new Date().toISOString(),
    environment: ctx.environment,
    error: payload.error ? normalizeRuntimeError(payload.error) : null,
  };

  if (entry.status === 'error') {
    console.error(`[${ctx.module}]`, entry);
  } else if (entry.status === 'warning') {
    console.warn(`[${ctx.module}]`, entry);
  } else {
    console.log(`[${ctx.module}]`, entry);
  }

  return entry;
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function successResponse(ctx: RuntimeContext, body: Record<string, unknown> = {}, status = 200) {
  return jsonResponse(
    {
      ok: true,
      request_id: ctx.requestId,
      duration_ms: getDurationMs(ctx),
      ...body,
    },
    status,
  );
}

export function errorResponse(
  ctx: RuntimeContext,
  error: unknown,
  options: {
    status?: number;
    code?: string;
    metadata?: Record<string, unknown>;
    exposeMessage?: boolean;
  } = {},
) {
  const normalized = normalizeRuntimeError(error);
  logRuntime(ctx, {
    status: 'error',
    metadata: options.metadata,
    error: normalized,
  });

  return jsonResponse(
    {
      ok: false,
      request_id: ctx.requestId,
      duration_ms: getDurationMs(ctx),
      code: options.code || 'RUNTIME_ERROR',
      error: options.exposeMessage === false ? 'Erro interno.' : normalized.message,
      details: ctx.environment === 'production' ? undefined : normalized,
    },
    options.status || 500,
  );
}

export async function requireAuthenticatedUser(req: Request) {
  const authClient = buildAuthClient(req);
  const { data, error } = await authClient.auth.getUser();
  if (error || !data?.user) {
    throw new Error('Usuario nao autenticado.');
  }

  return data.user;
}

export function requireCompanyId(companyId: string | null | undefined) {
  const normalized = String(companyId || '').trim();
  if (!normalized) {
    throw new Error('company_id e obrigatorio.');
  }
  return normalized;
}

export function extractCompanyId(body: Record<string, unknown> | null | undefined) {
  return String(body?.company_id || body?.companyId || '').trim();
}

export function createTimeoutSignal(timeoutMs = 12_000) {
  return AbortSignal.timeout(timeoutMs);
}

export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 12_000,
  timeoutMessage = 'Tempo limite excedido.',
) {
  const signal = createTimeoutSignal(timeoutMs);
  try {
    return await operation(signal);
  } catch (error) {
    if (signal.aborted) {
      throw new Error(timeoutMessage);
    }
    throw error;
  }
}

export function isTransientError(error: unknown) {
  const message = normalizeRuntimeError(error).message.toLowerCase();
  return [
    'timeout',
    'timed out',
    'network',
    'fetch failed',
    'temporar',
    '429',
    '500',
    '502',
    '503',
    '504',
    'rate limit',
    'econnreset',
  ].some((token) => message.includes(token));
}

export async function withRetry<T>(
  ctx: RuntimeContext,
  operation: (attempt: number) => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number } = {},
) {
  const attempts = Math.max(1, Number(options.attempts || 2));
  const baseDelayMs = Math.max(100, Number(options.baseDelayMs || 500));
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < attempts && isTransientError(error);
      logRuntime(ctx, {
        action: `${ctx.action}_attempt`,
        status: shouldRetry ? 'warning' : 'error',
        metadata: {
          attempt,
          attempts,
          should_retry: shouldRetry,
        },
        error,
      });

      if (!shouldRetry) {
        throw error;
      }

      const delay = baseDelayMs * (2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
