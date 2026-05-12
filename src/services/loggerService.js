import { captureSentryException, captureSentryMessage, setSentryModuleContext } from './sentryContextService';

const runtimeContext = {
  company_id: '',
  user_id: '',
  environment: typeof import.meta !== 'undefined' ? import.meta.env?.MODE || 'development' : 'development',
  app: 'nc-finance',
  role: '',
  subscription_plan: '',
};

const LOG_LEVELS = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

const normalizeError = (error) => {
  if (!error) return null;
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack || '' };
  }
  if (typeof error === 'object') {
    try { return JSON.parse(JSON.stringify(error)); } catch { return { message: String(error) }; }
  }
  return { message: String(error) };
};

const createEntry = ({
  level = 'info', module = 'app', action = 'event', status = 'ok',
  company_id, user_id, metadata = {}, error = null, message = '',
  request_id = '', duration_ms = null,
}) => ({
  timestamp: new Date().toISOString(),
  created_at: new Date().toISOString(),
  request_id,
  company_id: company_id ?? runtimeContext.company_id ?? '',
  user_id: user_id ?? runtimeContext.user_id ?? '',
  module, action, status, metadata,
  error: normalizeError(error), message, duration_ms,
  level: LOG_LEVELS[level] || LOG_LEVELS.info,
  environment: runtimeContext.environment,
  app: runtimeContext.app,
  role: runtimeContext.role || '',
  subscription_plan: runtimeContext.subscription_plan || '',
});

const printEntry = (entry) => {
  const label = `[${entry.app}] [${entry.level}] ${entry.module}:${entry.action}`;
  if (entry.level === LOG_LEVELS.error) { console.error(label, entry); return; }
  if (entry.level === LOG_LEVELS.warn) { console.warn(label, entry); return; }
  if (entry.level === LOG_LEVELS.debug) { console.debug(label, entry); return; }
  console.log(label, entry);
};

export function setLoggerRuntimeContext(nextContext = {}) {
  Object.assign(runtimeContext, {
    ...nextContext,
    company_id: nextContext.company_id ?? nextContext.companyId ?? runtimeContext.company_id,
    user_id: nextContext.user_id ?? nextContext.userId ?? runtimeContext.user_id,
    role: nextContext.role ?? nextContext.userRole ?? runtimeContext.role,
    subscription_plan: nextContext.subscription_plan ?? nextContext.subscriptionPlan ?? runtimeContext.subscription_plan,
  });
}

export function clearLoggerRuntimeContext() {
  runtimeContext.company_id = '';
  runtimeContext.user_id = '';
  runtimeContext.role = '';
  runtimeContext.subscription_plan = '';
}

export function logEvent(payload = {}) {
  const entry = createEntry(payload);
  setSentryModuleContext(entry.module, { action: entry.action, status: entry.status });
  printEntry(entry);
  if (entry.level === LOG_LEVELS.error) {
    captureSentryException(payload.error || new Error(entry.message || `${entry.module}:${entry.action}`), {
      company_id: entry.company_id, user_id: entry.user_id, role: entry.role,
      module: entry.module, subscription_plan: entry.subscription_plan,
      environment: entry.environment, action: entry.action, status: entry.status, metadata: entry.metadata,
    });
  } else if (entry.level === LOG_LEVELS.warn) {
    captureSentryMessage(entry.message || `${entry.module}:${entry.action}`, 'warning', {
      company_id: entry.company_id, user_id: entry.user_id, role: entry.role,
      module: entry.module, subscription_plan: entry.subscription_plan,
      environment: entry.environment, action: entry.action, status: entry.status, metadata: entry.metadata,
    });
  }
  return entry;
}

export function logInfo(module, action, metadata = {}, extras = {}) {
  return logEvent({ level: 'info', module, action, metadata, ...extras });
}

export function logDebug(module, action, metadata = {}, extras = {}) {
  return logEvent({ level: 'debug', module, action, metadata, ...extras });
}

export function logWarn(module, action, metadata = {}, extras = {}) {
  return logEvent({ level: 'warn', module, action, metadata, ...extras });
}

export function logError(module, action, error, metadata = {}, extras = {}) {
  return logEvent({ level: 'error', module, action, status: 'error', error, metadata, ...extras });
}

export function createScopedLogger(module) {
  return {
    debug: (action, metadata = {}, extras = {}) => logDebug(module, action, metadata, extras),
    info: (action, metadata = {}, extras = {}) => logInfo(module, action, metadata, extras),
    warn: (action, metadata = {}, extras = {}) => logWarn(module, action, metadata, extras),
    error: (action, error, metadata = {}, extras = {}) => logError(module, action, error, metadata, extras),
  };
}

export default {
  setLoggerRuntimeContext, clearLoggerRuntimeContext,
  logEvent, logInfo, logDebug, logWarn, logError, createScopedLogger,
};
