import { hasSupabaseConfig, supabase } from './supabaseClient';

export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  CRITICAL: 'critical',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown',
};

const CRITICAL_ENV_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const OPTIONAL_ENV_KEYS = ['VITE_SENTRY_DSN', 'VITE_SYSTEM_ADMIN_EMAILS'];

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function buildCheck(label, status, detail, extras = {}) {
  return {
    label,
    status,
    detail,
    ...extras,
  };
}

function measureStatusFromLatency(latencyMs, thresholds = {}) {
  const degradedMs = Number(thresholds.degradedMs || 1500);
  const criticalMs = Number(thresholds.criticalMs || 4000);

  if (latencyMs >= criticalMs) return HEALTH_STATUS.CRITICAL;
  if (latencyMs >= degradedMs) return HEALTH_STATUS.DEGRADED;
  return HEALTH_STATUS.HEALTHY;
}

async function checkSupabaseConnectivity() {
  const start = Date.now();

  if (!hasSupabaseConfig || !supabase) {
    return buildCheck('Supabase connectivity', HEALTH_STATUS.OFFLINE, 'Supabase nao configurado.', { latency_ms: 0 });
  }

  try {
    const { error } = await supabase.from('empresas').select('id').limit(1).maybeSingle();
    const latencyMs = Date.now() - start;

    if (error) {
      return buildCheck('Supabase connectivity', HEALTH_STATUS.CRITICAL, error.message, { latency_ms: latencyMs });
    }

    return buildCheck(
      'Supabase connectivity',
      measureStatusFromLatency(latencyMs, { degradedMs: 2000, criticalMs: 5000 }),
      `Conectado em ${latencyMs}ms.`,
      { latency_ms: latencyMs }
    );
  } catch (error) {
    return buildCheck('Supabase connectivity', HEALTH_STATUS.CRITICAL, String(error?.message || error), {
      latency_ms: Date.now() - start,
    });
  }
}

async function checkStripeStatus() {
  if (!hasSupabaseConfig || !supabase) {
    return buildCheck('Stripe / billing', HEALTH_STATUS.UNKNOWN, 'Supabase nao configurado.');
  }

  try {
    const { data, error } = await supabase
      .from('company_subscriptions')
      .select('company_id, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) {
      return buildCheck('Stripe / billing', HEALTH_STATUS.CRITICAL, error.message);
    }

    const rows = data || [];
    const active = rows.filter((row) => ['active', 'trialing'].includes(lower(row.status))).length;
    const failing = rows.filter((row) => ['past_due', 'canceled', 'blocked', 'expired'].includes(lower(row.status))).length;

    if (!rows.length) {
      return buildCheck('Stripe / billing', HEALTH_STATUS.DEGRADED, 'Nenhuma assinatura encontrada para validar o billing.');
    }

    if (failing > 0) {
      return buildCheck('Stripe / billing', HEALTH_STATUS.DEGRADED, `${failing} assinatura(s) com problema e ${active} saudavel(is).`);
    }

    return buildCheck('Stripe / billing', HEALTH_STATUS.HEALTHY, `${active} assinatura(s) ativa(s)/trialing sem falhas recentes.`);
  } catch (error) {
    return buildCheck('Stripe / billing', HEALTH_STATUS.CRITICAL, String(error?.message || error));
  }
}

async function checkStripeWebhookSignal() {
  if (!hasSupabaseConfig || !supabase) {
    return buildCheck('Stripe webhook', HEALTH_STATUS.UNKNOWN, 'Supabase nao configurado.');
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, action, created_at, severity, metadata')
      .gte('created_at', since)
      .or('action.ilike.%billing%,action.ilike.%stripe%,entity.ilike.%subscription%')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      return buildCheck('Stripe webhook', HEALTH_STATUS.DEGRADED, error.message);
    }

    if (!(data || []).length) {
      return buildCheck('Stripe webhook', HEALTH_STATUS.DEGRADED, 'Sem eventos recentes de billing/webhook para validar o fluxo.');
    }

    return buildCheck('Stripe webhook', HEALTH_STATUS.HEALTHY, `${data.length} evento(s) recentes relacionados a billing/webhook.`);
  } catch (error) {
    return buildCheck('Stripe webhook', HEALTH_STATUS.CRITICAL, String(error?.message || error));
  }
}

async function checkZapiConnection() {
  if (!hasSupabaseConfig || !supabase) {
    return buildCheck('WhatsApp / Z-API', HEALTH_STATUS.UNKNOWN, 'Supabase nao configurado.');
  }

  try {
    const { data, error } = await supabase
      .from('company_integrations')
      .select('company_id, provider, connected, updated_at')
      .eq('provider', 'zapi')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) {
      return buildCheck('WhatsApp / Z-API', HEALTH_STATUS.CRITICAL, error.message);
    }

    const rows = data || [];
    const connected = rows.filter((row) => row.connected).length;
    if (!rows.length) {
      return buildCheck('WhatsApp / Z-API', HEALTH_STATUS.DEGRADED, 'Nenhuma integracao Z-API configurada.');
    }
    if (connected === 0) {
      return buildCheck('WhatsApp / Z-API', HEALTH_STATUS.CRITICAL, 'Todas as integracoes Z-API estao desconectadas.');
    }
    if (connected < rows.length) {
      return buildCheck('WhatsApp / Z-API', HEALTH_STATUS.DEGRADED, `${connected}/${rows.length} integracao(oes) conectada(s).`);
    }
    return buildCheck('WhatsApp / Z-API', HEALTH_STATUS.HEALTHY, `${connected} integracao(oes) conectada(s).`);
  } catch (error) {
    return buildCheck('WhatsApp / Z-API', HEALTH_STATUS.CRITICAL, String(error?.message || error));
  }
}

async function checkGoogleTokenAndDrive() {
  if (!hasSupabaseConfig || !supabase) {
    return [
      buildCheck('Google token', HEALTH_STATUS.UNKNOWN, 'Supabase nao configurado.'),
      buildCheck('Google Drive access', HEALTH_STATUS.UNKNOWN, 'Supabase nao configurado.'),
    ];
  }

  try {
    const { data, error } = await supabase
      .from('google_sheets_config')
      .select('empresa_id, ativo, updated_at, last_source_sync_at, last_source_sync_status, last_source_sync_error')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) {
      return [
        buildCheck('Google token', HEALTH_STATUS.CRITICAL, error.message),
        buildCheck('Google Drive access', HEALTH_STATUS.CRITICAL, error.message),
      ];
    }

    const rows = data || [];
    const connected = rows.filter((row) => row.ativo).length;
    const syncErrors = rows.filter((row) => lower(row.last_source_sync_status) === 'error' || row.last_source_sync_error).length;
    const syncOk = rows.filter((row) => lower(row.last_source_sync_status) === 'success').length;

    const tokenStatus = !rows.length
      ? HEALTH_STATUS.DEGRADED
      : syncErrors > 0
        ? HEALTH_STATUS.DEGRADED
        : HEALTH_STATUS.HEALTHY;

    const driveStatus = !rows.length
      ? HEALTH_STATUS.DEGRADED
      : connected === 0
        ? HEALTH_STATUS.CRITICAL
        : syncErrors > connected / 2
          ? HEALTH_STATUS.CRITICAL
          : syncErrors > 0
            ? HEALTH_STATUS.DEGRADED
            : HEALTH_STATUS.HEALTHY;

    return [
      buildCheck('Google token', tokenStatus, !rows.length ? 'Nenhuma configuracao Google Sheets encontrada.' : `${connected} configuracao(oes) ativa(s), ${syncErrors} com erro.`),
      buildCheck('Google Drive access', driveStatus, !rows.length ? 'Nenhum acesso de Drive configurado.' : `${syncOk} sync(s) com sucesso e ${syncErrors} com erro.`),
    ];
  } catch (error) {
    return [
      buildCheck('Google token', HEALTH_STATUS.CRITICAL, String(error?.message || error)),
      buildCheck('Google Drive access', HEALTH_STATUS.CRITICAL, String(error?.message || error)),
    ];
  }
}

async function checkCronExecution() {
  if (!hasSupabaseConfig || !supabase) {
    return buildCheck('Cron execution', HEALTH_STATUS.UNKNOWN, 'Supabase nao configurado.');
  }

  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('automation_dispatches')
      .select('id, status, created_at, retry_count')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return buildCheck('Cron execution', HEALTH_STATUS.CRITICAL, error.message);
    }

    const rows = data || [];
    if (!rows.length) {
      return buildCheck('Cron execution', HEALTH_STATUS.CRITICAL, 'Nenhum dispatch nas ultimas 48h. Cron pode estar parado.');
    }

    const stuck = rows.filter((row) => ['processing', 'running'].includes(lower(row.status))).length;
    if (stuck > 5) {
      return buildCheck('Cron execution', HEALTH_STATUS.DEGRADED, `${stuck} dispatch(es) presos em processamento.`);
    }

    return buildCheck('Cron execution', HEALTH_STATUS.HEALTHY, `${rows.length} dispatch(es) registrados nas ultimas 48h.`);
  } catch (error) {
    return buildCheck('Cron execution', HEALTH_STATUS.CRITICAL, String(error?.message || error));
  }
}

async function checkEdgeFunctionLatency() {
  const start = Date.now();

  if (!hasSupabaseConfig || !supabase) {
    return buildCheck('Edge Function latency', HEALTH_STATUS.UNKNOWN, 'Supabase nao configurado.', { latency_ms: 0 });
  }

  try {
    const { error } = await supabase
      .from('company_subscriptions')
      .select('company_id')
      .limit(1)
      .maybeSingle();

    const latencyMs = Date.now() - start;
    if (error) {
      return buildCheck('Edge Function latency', HEALTH_STATUS.DEGRADED, error.message, { latency_ms: latencyMs });
    }

    return buildCheck(
      'Edge Function latency',
      measureStatusFromLatency(latencyMs, { degradedMs: 1200, criticalMs: 3000 }),
      `Sinal de leitura backend em ${latencyMs}ms.`,
      { latency_ms: latencyMs }
    );
  } catch (error) {
    return buildCheck('Edge Function latency', HEALTH_STATUS.CRITICAL, String(error?.message || error), {
      latency_ms: Date.now() - start,
    });
  }
}

async function checkStorageHealth() {
  if (!hasSupabaseConfig || !supabase) {
    return buildCheck('Storage health', HEALTH_STATUS.UNKNOWN, 'Supabase nao configurado.');
  }

  try {
    const { error } = await supabase
      .from('importacoes')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return buildCheck('Storage health', HEALTH_STATUS.CRITICAL, error.message);
    }

    return buildCheck('Storage health', HEALTH_STATUS.HEALTHY, 'Leitura de importacoes/armazenamento operacional funcionando.');
  } catch (error) {
    return buildCheck('Storage health', HEALTH_STATUS.CRITICAL, String(error?.message || error));
  }
}

function checkEnvVars() {
  const missingCritical = CRITICAL_ENV_KEYS.filter((key) => !String(import.meta.env[key] || '').trim());
  const missingOptional = OPTIONAL_ENV_KEYS.filter((key) => !String(import.meta.env[key] || '').trim());

  if (missingCritical.length) {
    return buildCheck('Env vars criticas', HEALTH_STATUS.CRITICAL, `Faltando: ${missingCritical.join(', ')}.`);
  }

  if (missingOptional.length) {
    return buildCheck('Env vars criticas', HEALTH_STATUS.DEGRADED, `Criticas ok. Opcionais ausentes: ${missingOptional.join(', ')}.`);
  }

  return buildCheck('Env vars criticas', HEALTH_STATUS.HEALTHY, 'Variaveis criticas e opcionais principais configuradas.');
}

function checkSentryActive() {
  const dsn = String(import.meta.env.VITE_SENTRY_DSN || '').trim();
  if (!dsn) {
    return buildCheck('Sentry ativo', HEALTH_STATUS.DEGRADED, 'VITE_SENTRY_DSN ausente. Observabilidade de erros desabilitada.');
  }

  return buildCheck('Sentry ativo', HEALTH_STATUS.HEALTHY, 'DSN do Sentry configurado para captura de erros.');
}

async function checkRecentErrors() {
  if (!hasSupabaseConfig || !supabase) {
    return buildCheck('Erros recentes', HEALTH_STATUS.UNKNOWN, 'Supabase nao configurado.');
  }

  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, action, severity, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return buildCheck('Erros recentes', HEALTH_STATUS.DEGRADED, error.message);
    }

    const rows = (data || []).filter((row) =>
      ['danger', 'error', 'critical'].includes(lower(row.severity)) ||
      ['error', 'erro', 'failed', 'falha'].some((term) => lower(row.action).includes(term))
    );

    if (!rows.length) {
      return buildCheck('Erros recentes', HEALTH_STATUS.HEALTHY, 'Nenhum erro operacional critico na ultima hora.');
    }

    const status = rows.length >= 10 ? HEALTH_STATUS.CRITICAL : HEALTH_STATUS.DEGRADED;
    return buildCheck('Erros recentes', status, `${rows.length} evento(s) de erro na ultima hora.`);
  } catch (error) {
    return buildCheck('Erros recentes', HEALTH_STATUS.CRITICAL, String(error?.message || error));
  }
}

function aggregateStatus(checks) {
  if (checks.some((check) => check.status === HEALTH_STATUS.CRITICAL)) return HEALTH_STATUS.CRITICAL;
  if (checks.some((check) => check.status === HEALTH_STATUS.OFFLINE)) return HEALTH_STATUS.OFFLINE;
  if (checks.some((check) => check.status === HEALTH_STATUS.DEGRADED)) return HEALTH_STATUS.DEGRADED;
  if (checks.some((check) => check.status === HEALTH_STATUS.UNKNOWN)) return HEALTH_STATUS.UNKNOWN;
  return HEALTH_STATUS.HEALTHY;
}

export async function runHealthChecks() {
  const [
    supabaseCheck,
    stripeCheck,
    stripeWebhookCheck,
    zapiCheck,
    googleChecks,
    cronCheck,
    edgeLatencyCheck,
    storageCheck,
    recentErrorsCheck,
  ] = await Promise.all([
    checkSupabaseConnectivity(),
    checkStripeStatus(),
    checkStripeWebhookSignal(),
    checkZapiConnection(),
    checkGoogleTokenAndDrive(),
    checkCronExecution(),
    checkEdgeFunctionLatency(),
    checkStorageHealth(),
    checkRecentErrors(),
  ]);

  const checks = [
    supabaseCheck,
    stripeCheck,
    stripeWebhookCheck,
    zapiCheck,
    ...(googleChecks || []),
    cronCheck,
    edgeLatencyCheck,
    storageCheck,
    checkEnvVars(),
    checkSentryActive(),
    recentErrorsCheck,
  ];

  return {
    overall: aggregateStatus(checks),
    checks,
    checkedAt: new Date().toISOString(),
  };
}

export const healthStatusMeta = {
  [HEALTH_STATUS.HEALTHY]: { label: 'Saudavel', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  [HEALTH_STATUS.DEGRADED]: { label: 'Degradado', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400' },
  [HEALTH_STATUS.CRITICAL]: { label: 'Critico', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-400' },
  [HEALTH_STATUS.OFFLINE]: { label: 'Offline', color: 'text-slate-400', bg: 'bg-slate-800/60 border-slate-700', dot: 'bg-slate-500' },
  [HEALTH_STATUS.UNKNOWN]: { label: 'Desconhecido', color: 'text-slate-400', bg: 'bg-slate-800/60 border-slate-700', dot: 'bg-slate-600' },
};

export default {
  HEALTH_STATUS,
  healthStatusMeta,
  runHealthChecks,
};
