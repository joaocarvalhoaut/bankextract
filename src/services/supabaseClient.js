import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const fallbackCompanyId = String(import.meta.env.VITE_SUPABASE_COMPANY_ID || '').trim();
const fallbackUserId = String(import.meta.env.VITE_SUPABASE_USER_ID || '').trim();

const missingEnvKeys = [];

if (!supabaseUrl) {
  missingEnvKeys.push('VITE_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  missingEnvKeys.push('VITE_SUPABASE_ANON_KEY');
}

export const hasSupabaseConfig = missingEnvKeys.length === 0;

export const supabaseConfigError = hasSupabaseConfig
  ? ''
  : `Supabase nao configurado. Defina ${missingEnvKeys.join(' e ')} no arquivo .env.`;

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

export const getSupabaseConfigStatus = () => ({
  hasSupabaseConfig,
  supabaseConfigError,
  missingEnvKeys: [...missingEnvKeys]
});

export const getFallbackTenantIds = () => ({
  companyId: fallbackCompanyId,
  userId: fallbackUserId
});

export const getSupabaseSessionUser = async () => {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message || 'Falha ao ler a sessao do Supabase.');
  }

  return data.session?.user || null;
};

export const signInWithEmail = async ({ email, password }) => {
  if (!supabase) {
    throw new Error(supabaseConfigError || 'Supabase nao configurado.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw new Error(error.message || 'Falha ao entrar.');
  }

  return data;
};

export const signUpWithEmail = async ({ email, password }) => {
  if (!supabase) {
    throw new Error(supabaseConfigError || 'Supabase nao configurado.');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    throw new Error(error.message || 'Falha ao criar a conta.');
  }

  return data;
};

export const signOutSupabase = async () => {
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message || 'Falha ao sair.');
  }
};

export const subscribeToSupabaseAuth = (callback) => {
  if (!supabase) {
    return () => {};
  }

  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });

  return () => subscription.unsubscribe();
};
