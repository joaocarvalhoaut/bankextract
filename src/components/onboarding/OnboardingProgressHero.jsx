import { ArrowRight, Sparkles } from 'lucide-react';

function ProgressRing({ pct = 0 }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke="url(#grad-onboarding)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)' }}
      />
      <defs>
        <linearGradient id="grad-onboarding" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#005DFF" />
          <stop offset="100%" stopColor="#14D8FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function OnboardingProgressHero({
  progress = 0,
  completed = 0,
  total = 0,
  companyName = '',
  nextStep = null,
  onOpenStep,
}) {
  return (
    <section className="surface-card overflow-hidden rounded-2xl p-6 shadow-soft">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <div className="relative flex-shrink-0">
            <ProgressRing pct={progress} />
            <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-slate-50 rotate-90">
              {progress}%
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Progresso geral</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-slate-50">
              {completed} de {total} etapas
            </p>
            <p className="mt-0.5 text-sm text-slate-400">
              {companyName && companyName !== 'Nenhuma empresa ativa'
                ? `Ativando ${companyName} com foco em operacao real`
                : 'Selecione uma empresa para ativar o onboarding inteligente'}
            </p>
          </div>
        </div>

        {progress === 100 ? (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-3 text-sm font-bold text-cyan-200">
            <Sparkles size={16} />
            Pronto para operar
          </div>
        ) : nextStep ? (
          <button
            type="button"
            onClick={() => onOpenStep?.(nextStep)}
            className="btn-brand inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold active:scale-[0.98]"
          >
            Proxima etapa
            <ArrowRight size={15} />
          </button>
        ) : null}
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>
    </section>
  );
}
