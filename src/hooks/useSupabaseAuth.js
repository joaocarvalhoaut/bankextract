import { useEffect, useMemo, useState } from 'react';
import {
  getSupabaseConfigStatus,
  getSupabaseSessionUser,
  signInWithEmail,
  signOutSupabase,
  signUpWithEmail,
  subscribeToSupabaseAuth
} from '../services/supabaseClient';
import { createScopedLogger } from '../services/loggerService';
import { clearSentryContext, syncSentryContext } from '../services/sentryContextService';

const logger = createScopedLogger('auth');

export const useSupabaseAuth = () => {
  const configStatus = useMemo(() => getSupabaseConfigStatus(), []);
  const [loading, setLoading] = useState(configStatus.hasSupabaseConfig);
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!configStatus.hasSupabaseConfig) {
      setLoading(false);
      return;
    }

    let active = true;

    getSupabaseSessionUser()
      .then((nextUser) => {
        if (!active) return;
        setUser(nextUser);
        syncSentryContext({
          user_id: nextUser?.id || '',
          email: nextUser?.email || '',
          environment: import.meta.env.MODE,
          module: 'auth',
        });
        logger.info('session_loaded', {
          user_id: nextUser?.id || '',
          authenticated: Boolean(nextUser),
        });
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Falha ao carregar a sessao.');
        logger.error('session_load_failed', err, {});
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    const unsubscribe = subscribeToSupabaseAuth((nextUser) => {
      if (!active) return;
      setUser(nextUser);
      if (nextUser) {
        syncSentryContext({
          user_id: nextUser?.id || '',
          email: nextUser?.email || '',
          environment: import.meta.env.MODE,
          module: 'auth',
        });
      } else {
        clearSentryContext();
      }
      logger.info('auth_state_changed', {
        user_id: nextUser?.id || '',
        authenticated: Boolean(nextUser),
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [configStatus.hasSupabaseConfig]);

  const signIn = async ({ email, password }) => {
    setSubmitting(true);
    setError('');
    try {
      logger.info('sign_in_started', { email });
      const data = await signInWithEmail({ email, password });
      setUser(data.user || null);
      logger.info('sign_in_succeeded', { email, user_id: data?.user?.id || '' });
      syncSentryContext({
        user_id: data?.user?.id || '',
        email: data?.user?.email || email,
        environment: import.meta.env.MODE,
        module: 'auth',
      });
      return data;
    } catch (err) {
      setError(err.message || 'Falha ao entrar.');
      logger.error('sign_in_failed', err, { email });
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const signUp = async ({ email, password }) => {
    setSubmitting(true);
    setError('');
    try {
      logger.info('sign_up_started', { email });
      const data = await signUpWithEmail({ email, password });
      setUser(data.user || null);
      logger.info('sign_up_succeeded', { email, user_id: data?.user?.id || '' });
      syncSentryContext({
        user_id: data?.user?.id || '',
        email: data?.user?.email || email,
        environment: import.meta.env.MODE,
        module: 'auth',
      });
      return data;
    } catch (err) {
      setError(err.message || 'Falha ao criar conta.');
      logger.error('sign_up_failed', err, { email });
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    setSubmitting(true);
    setError('');
    try {
      logger.info('sign_out_started', { user_id: user?.id || '' });
      await signOutSupabase();
      setUser(null);
      clearSentryContext();
      logger.info('sign_out_succeeded', {});
    } catch (err) {
      setError(err.message || 'Falha ao sair.');
      logger.error('sign_out_failed', err, { user_id: user?.id || '' });
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    authEnabled: configStatus.hasSupabaseConfig,
    configError: configStatus.supabaseConfigError,
    loading,
    submitting,
    user,
    error,
    setError,
    signIn,
    signUp,
    signOut
  };
};
