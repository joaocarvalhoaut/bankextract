import * as Sentry from '@sentry/react';

// ---------------------------------------------------------------------------
// ATENCAO — armadilha de tree-shaking do Vite/Rollup:
// Init incondicional -> permanece no bundle independente do valor do DSN.
// enabled:false desativa o envio de eventos sem DSN, mantendo o SDK funcional.
// ---------------------------------------------------------------------------

const sentryDsn = (import.meta.env.VITE_SENTRY_DSN ?? '').trim();

// Log de diagnostico — confirma presenca do DSN sem expor o valor.
// REMOVER APOS CONFIRMAR FUNCIONAMENTO EM PRODUCAO.
console.log('[SENTRY] init | dsn_configured:', Boolean(sentryDsn), '| env:', import.meta.env.MODE);

if (!sentryDsn) {
  console.warn('[SENTRY] VITE_SENTRY_DSN ausente — SDK desabilitado. Configure a variavel na Vercel.');
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

// REMOVER APOS VALIDACAO DO SENTRY
// Expoe SDK globalmente para teste manual no DevTools sem depender de URL params.
// Como usar no console do browser:
//   await testSentry()              -> dispara captureException + flush
//   await testSentry('message')     -> dispara captureMessage + flush
if (typeof window !== 'undefined' && sentryDsn) {
  window.__SentrySDK = Sentry;
  window.testSentry = async (mode = 'error') => {
    console.log('[SENTRY] Disparando evento de teste | mode:', mode);
    if (mode === 'message') {
      Sentry.captureMessage('NC Finance — testSentry: manual message (production)', 'info');
    } else {
      Sentry.captureException(new Error('NC Finance — testSentry: manual exception (production)'));
    }
    const flushed = await Sentry.flush(5000);
    console.log('[SENTRY] Flush:', flushed ? 'OK — evento enviado' : 'TIMEOUT — evento nao confirmado');
    return flushed;
  };
  console.log('[SENTRY] DEBUG: window.testSentry() disponivel no console. Ex: await testSentry()');
}
// FIM REMOVER APOS VALIDACAO DO SENTRY
