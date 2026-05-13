import * as Sentry from '@sentry/react';

// Init incondicional: o SDK permanece no bundle e o envio fica controlado por enabled.
const sentryDsn = (import.meta.env.VITE_SENTRY_DSN ?? '').trim();

if (!sentryDsn) {
  console.warn('[SENTRY] VITE_SENTRY_DSN ausente - SDK desabilitado.');
}

Sentry.init({
  dsn: sentryDsn || undefined,
  enabled: Boolean(sentryDsn),
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
});
