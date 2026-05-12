import * as Sentry from '@sentry/react';

const runtimeState = {
  user: null,
  tags: {},
  contexts: {},
};

const sanitizeValue = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value;
};

const sanitizeTags = (tags = {}) =>
  Object.fromEntries(
    Object.entries(tags)
      .map(([key, value]) => [key, sanitizeValue(value)])
      .filter(([, value]) => value !== undefined)
  );

export function syncSentryContext(payload = {}) {
  const user = {
    id: sanitizeValue(payload.user_id || payload.userId),
    email: sanitizeValue(payload.email),
  };

  runtimeState.user = user.id || user.email ? user : null;
  runtimeState.tags = sanitizeTags({
    company_id: payload.company_id || payload.companyId,
    role: payload.role,
    module: payload.module,
    subscription_plan: payload.subscription_plan || payload.subscriptionPlan,
    environment: payload.environment || import.meta.env.MODE,
  });
  runtimeState.contexts = {
    tenant: sanitizeTags({
      company_id: payload.company_id || payload.companyId,
      role: payload.role,
      subscription_plan: payload.subscription_plan || payload.subscriptionPlan,
      environment: payload.environment || import.meta.env.MODE,
    }),
  };

  Sentry.setUser(runtimeState.user);
  Object.entries(runtimeState.tags).forEach(([key, value]) => Sentry.setTag(key, String(value)));
  Object.entries(runtimeState.contexts).forEach(([key, value]) => Sentry.setContext(key, value));
}

export function setSentryModuleContext(module, metadata = {}) {
  if (!module) return;
  Sentry.setTag('module', module);
  Sentry.setContext('module', sanitizeTags({ module, ...metadata }));
}

export function clearSentryContext() {
  runtimeState.user = null;
  runtimeState.tags = {};
  runtimeState.contexts = {};
  Sentry.setUser(null);
}

export function captureSentryException(error, extras = {}) {
  Sentry.withScope((scope) => {
    const tags = sanitizeTags({
      company_id: extras.company_id,
      user_id: extras.user_id,
      role: extras.role,
      module: extras.module,
      subscription_plan: extras.subscription_plan,
      environment: extras.environment || import.meta.env.MODE,
      action: extras.action,
      status: extras.status,
    });

    Object.entries(tags).forEach(([key, value]) => scope.setTag(key, String(value)));

    if (extras.metadata && typeof extras.metadata === 'object') {
      scope.setContext('metadata', extras.metadata);
    }

    if (extras.contexts && typeof extras.contexts === 'object') {
      Object.entries(extras.contexts).forEach(([key, value]) => {
        if (value && typeof value === 'object') {
          scope.setContext(key, value);
        }
      });
    }

    Sentry.captureException(error);
  });
}

export function captureSentryMessage(message, level = 'info', extras = {}) {
  Sentry.withScope((scope) => {
    const tags = sanitizeTags({
      company_id: extras.company_id,
      user_id: extras.user_id,
      role: extras.role,
      module: extras.module,
      subscription_plan: extras.subscription_plan,
      environment: extras.environment || import.meta.env.MODE,
      action: extras.action,
      status: extras.status,
    });

    Object.entries(tags).forEach(([key, value]) => scope.setTag(key, String(value)));

    if (extras.metadata && typeof extras.metadata === 'object') {
      scope.setContext('metadata', extras.metadata);
    }

    Sentry.captureMessage(message, level);
  });
}

export default {
  syncSentryContext,
  setSentryModuleContext,
  clearSentryContext,
  captureSentryException,
  captureSentryMessage,
};
