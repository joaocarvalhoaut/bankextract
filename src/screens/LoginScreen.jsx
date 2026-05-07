import { useState } from 'react';
import { ArrowLeft, LockKeyhole, Mail } from 'lucide-react';

export default function LoginScreen({ onSignIn, onSignUp, loading, error, onBackToLanding }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');

    if (!email.trim() || !password.trim()) {
      setLocalError('Informe e-mail e senha.');
      return;
    }

    try {
      if (mode === 'signin') {
        if (!onSignIn) {
          throw new Error('Fluxo de login indisponivel no momento.');
        }
        await onSignIn({
          email: email.trim(),
          password
        });
      } else {
        if (!onSignUp) {
          throw new Error('Fluxo de criacao de conta indisponivel no momento.');
        }
        await onSignUp({
          email: email.trim(),
          password
        });
      }
    } catch (submitError) {
      if (import.meta.env.DEV) {
        console.error('Erro ao enviar formulario de autenticacao:', submitError);
      }

      if (!error) {
        setLocalError(submitError?.message || 'Erro ao entrar. Tente novamente.');
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="mb-6">
          {onBackToLanding ? (
            <button
              type="button"
              onClick={onBackToLanding}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft size={12} />
              Voltar para landing
            </button>
          ) : null}
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">BankExtract</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {mode === 'signin' ? 'Entrar na plataforma' : 'Criar conta'}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {mode === 'signin'
              ? 'Use sua conta do Supabase para acessar os dados reais da sua empresa.'
              : 'Crie sua conta para começar a usar o ambiente autenticado.'}
          </p>
        </div>

        <div className="mb-6 flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
              <Mail size={14} /> E-mail
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
              placeholder="voce@empresa.com"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
              <LockKeyhole size={14} /> Senha
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
              placeholder="Digite sua senha"
            />
          </label>

          {localError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {localError}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? (mode === 'signin' ? 'Entrando...' : 'Criando conta...') : mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  );
}
