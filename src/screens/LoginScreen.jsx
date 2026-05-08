import { useState } from 'react';
import { ArrowLeft, LockKeyhole, Mail } from 'lucide-react';
import BrandLockup from '../components/branding/BrandLockup';

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
          password,
        });
      } else {
        if (!onSignUp) {
          throw new Error('Fluxo de criacao de conta indisponivel no momento.');
        }
        await onSignUp({
          email: email.trim(),
          password,
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
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{
        background: 'linear-gradient(160deg, #071120 0%, #0D1B2E 50%, #071120 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: 0.045 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="lp-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#14D8FF" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lp-grid)" />
      </svg>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          top: '-10%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '700px',
          height: '400px',
          background: 'radial-gradient(ellipse at center, rgba(0,93,255,0.22) 0%, transparent 70%)',
          borderRadius: '50%',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          bottom: '-5%',
          right: '-5%',
          width: '400px',
          height: '300px',
          background: 'radial-gradient(ellipse at center, rgba(20,216,255,0.1) 0%, transparent 70%)',
          borderRadius: '50%',
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {onBackToLanding ? (
          <button
            type="button"
            onClick={onBackToLanding}
            className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:text-white"
            style={{ border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)' }}
          >
            <ArrowLeft size={12} />
            Voltar para landing
          </button>
        ) : null}

        <div
          className="rounded-3xl p-8"
          style={{
            background: 'rgba(13,27,46,0.85)',
            border: '1px solid rgba(0,93,255,0.25)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(20,216,255,0.08) inset',
          }}
        >
          <div className="mb-8 flex flex-col items-center text-center">
            <BrandLockup variant="login" />
          </div>

          <div
            className="mb-6 flex rounded-xl p-1"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition"
              style={
                mode === 'signin'
                  ? {
                      background: 'linear-gradient(135deg, #005DFF, #0040CC)',
                      color: '#fff',
                      boxShadow: '0 2px 12px rgba(0,93,255,0.4)',
                    }
                  : { color: '#94A3B8' }
              }
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition"
              style={
                mode === 'signup'
                  ? {
                      background: 'linear-gradient(135deg, #005DFF, #0040CC)',
                      color: '#fff',
                      boxShadow: '0 2px 12px rgba(0,93,255,0.4)',
                    }
                  : { color: '#94A3B8' }
              }
            >
              Criar conta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-300">
                <Mail size={14} className="text-blue-400" /> E-mail
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  colorScheme: 'dark',
                }}
                onFocus={(e) => {
                  e.target.style.border = '1px solid rgba(0,93,255,0.7)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(0,93,255,0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.border = '1px solid rgba(255,255,255,0.12)';
                  e.target.style.boxShadow = 'none';
                }}
                placeholder="voce@empresa.com"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-300">
                <LockKeyhole size={14} className="text-blue-400" /> Senha
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  colorScheme: 'dark',
                }}
                onFocus={(e) => {
                  e.target.style.border = '1px solid rgba(0,93,255,0.7)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(0,93,255,0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.border = '1px solid rgba(255,255,255,0.12)';
                  e.target.style.boxShadow = 'none';
                }}
                placeholder="Digite sua senha"
              />
            </label>

            {localError ? (
              <div
                className="rounded-xl px-4 py-3 text-sm text-red-300"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                {localError}
              </div>
            ) : null}

            {error ? (
              <div
                className="rounded-xl px-4 py-3 text-sm text-red-300"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: loading ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #005DFF 0%, #14D8FF 100%)',
                boxShadow: loading ? 'none' : '0 4px 24px rgba(0,93,255,0.4)',
              }}
            >
              {loading
                ? mode === 'signin'
                  ? 'Entrando...'
                  : 'Criando conta...'
                : mode === 'signin'
                  ? 'Entrar na plataforma'
                  : 'Criar conta'}
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Powered by NC HUB
          </p>
        </div>
      </div>
    </div>
  );
}
