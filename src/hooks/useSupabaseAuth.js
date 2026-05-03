import { useEffect, useMemo, useState } from 'react';
import {
  getSupabaseConfigStatus,
  getSupabaseSessionUser,
  signInWithEmail,
  signOutSupabase,
  signUpWithEmail,
  subscribeToSupabaseAuth
} from '../services/supabaseClient';

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
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Falha ao carregar a sessao.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    const unsubscribe = subscribeToSupabaseAuth((nextUser) => {
      if (!active) return;
      setUser(nextUser);
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
      const data = await signInWithEmail({ email, password });
      setUser(data.user || null);
      return data;
    } catch (err) {
      setError(err.message || 'Falha ao entrar.');
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const signUp = async ({ email, password }) => {
    setSubmitting(true);
    setError('');
    try {
      const data = await signUpWithEmail({ email, password });
      setUser(data.user || null);
      return data;
    } catch (err) {
      setError(err.message || 'Falha ao criar conta.');
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    setSubmitting(true);
    setError('');
    try {
      await signOutSupabase();
      setUser(null);
    } catch (err) {
      setError(err.message || 'Falha ao sair.');
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

