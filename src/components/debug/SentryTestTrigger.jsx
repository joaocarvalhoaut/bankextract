// =============================================================================
// REMOVER APOS VALIDACAO DO SENTRY
// Arquivo: src/components/debug/SentryTestTrigger.jsx
//
// MODOS DE USO:
//   ?sentry_test=error    -> lancca erro durante render (ErrorBoundary captura,
//                            Sentry.captureException + Replay disparam)
//   ?sentry_test=message  -> envia evento "info" ao Sentry sem quebrar a UI
//   ?sentry_test=true     -> alias de "error"
//
// PROBLEMA CORRIGIDO: o ?sentry_test=error era perdido no redirect de auth.
// Fix: param persistido em sessionStorage antes da navegacao.
//
// COMO REMOVER:
//   1. Delete este arquivo
//   2. Remova import + bloco <ErrorBoundary name="sentry-test"> em App.jsx
//   3. npm run build -> confirmar build limpo
// =============================================================================

import * as Sentry from '@sentry/react';
import { useEffect, useState } from 'react';
import {
  captureSentryException,
  captureSentryMessage,
  syncSentryContext,
} from '../../services/sentryContextService';

const SESSION_KEY = '_ncf_sentry_test';

export default function SentryTestTrigger({
  companyId = '',
  userId = '',
  email = '',
  role = '',
  plan = '',
}) {
  const [triggerThrow, setTriggerThrow] = useState(false);

  useEffect(() => {
    // REMOVER APOS VALIDACAO DO SENTRY
    // Verifica o param na URL atual OU no sessionStorage (caso tenha sobrevivido
    // a um redirect de auth — o App.jsx faz pushState sem preservar ?search).
    const urlParam = new URLSearchParams(window.location.search).get('sentry_test');

    // Persiste o param para sobreviver ao redirect de auth
    if (urlParam) sessionStorage.setItem(SESSION_KEY, urlParam);
    const param = urlParam || sessionStorage.getItem(SESSION_KEY);
    if (!param) return;

    // Usa apenas uma vez — remove para nao re-disparar em navegacoes futuras
    sessionStorage.removeItem(SESSION_KEY);

    console.log('[SENTRY TEST] Param detectado:', param, '| company:', companyId, '| user:', userId);

    // Re-sync do contexto multi-tenant com dados atuais do usuario logado
    syncSentryContext({
      user_id: userId,
      email,
      company_id: companyId,
      role,
      subscription_plan: plan,
      module: 'sentry_validation',
      environment: import.meta.env.MODE,
    });

    if (param === 'message') {
      // Teste silencioso: envia captureMessage + flush
      captureSentryMessage(
        'NC Finance — Sentry validation: message event (production)',
        'info',
        {
          company_id: companyId,
          user_id: userId,
          role,
          module: 'sentry_validation',
          environment: import.meta.env.MODE,
          action: 'test_message',
          status: 'ok',
          metadata: { triggered_by: 'sentry_test=message', plan, timestamp: new Date().toISOString() },
        },
      );
      // Flush garante envio HTTP antes de qualquer navegacao
      Sentry.flush(5000).then((ok) => {
        console.log('[SENTRY TEST] captureMessage flush:', ok ? 'OK' : 'TIMEOUT');
      });
    } else {
      // param === 'error' | 'true'
      // Dispara captureException explicito + flush antes do throw
      captureSentryException(
        new Error('NC Finance — Sentry validation: captureException (production)'),
        {
          company_id: companyId,
          user_id: userId,
          role,
          module: 'sentry_validation',
          environment: import.meta.env.MODE,
          action: 'test_error',
          status: 'validation',
          metadata: { triggered_by: `sentry_test=${param}`, plan, timestamp: new Date().toISOString() },
        },
      );
      // Flush antes do throw — garante envio mesmo se ErrorBoundary engolir a propagacao
      Sentry.flush(3000).then(() => {
        console.log('[SENTRY TEST] captureException flush: OK — agendando render throw');
        setTriggerThrow(true);
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // REMOVER APOS VALIDACAO DO SENTRY
  // Throw durante render -> capturado pelo <ErrorBoundary name="sentry-test"> pai
  // -> componentDidCatch chama Sentry.captureException -> gera Session Replay
  if (triggerThrow) {
    throw new Error('NC Finance — Sentry validation: render throw (production)');
  }

  return null;
}
