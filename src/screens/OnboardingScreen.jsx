import { ArrowRight, CheckCircle2, CircleDashed, Sparkles } from 'lucide-react';
import PlanComparisonTable from '../components/plans/PlanComparisonTable';
import { getAllPlans } from '../constants/plans';

function ProgressRing({ pct = 0 }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx="36" cy="36" r={r}
        fill="none"
        stroke="url(#grad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)' }}
      />
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0E9F6E" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function StepRow({ step, index, onOpenStep }) {
  const done = step.done;
  return (
    <button
      type="button"
      onClick={() => onOpenStep?.(step)}
      className={`group flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card ${
        done
          ? 'border-emerald-200 bg-emerald-50/60'
          : 'border-slate-200 bg-white hover:border-emerald-200'
      }`}
    >
      {/* Step number / check */}
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
        done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-700'
      }`}>
        {done ? <CheckCircle2 size={18} className="text-white" /> : <CircleDashed size={18} />}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm font-semibold ${done ? 'text-emerald-800' : 'text-slate-900'}`}>
            {step.title}
          </p>
          <div className="flex items-center gap-2">
            {step.actionTab && (
              <span className="hidden rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 group-hover:inline-flex">
                {step.actionTab}
              </span>
            )}
            <ArrowRight size={14} className={`flex-shrink-0 transition ${done ? 'text-emerald-400' : 'text-slate-300 group-hover:text-emerald-500'}`} />
          </div>
        </div>
        <p className={`mt-0.5 text-xs leading-relaxed ${done ? 'text-emerald-600' : 'text-slate-500'}`}>
          {step.description}
        </p>
      </div>
    </button>
  );
}

export default function OnboardingScreen({ onboarding, companyName, onOpenStep }) {
  const steps = onboarding?.steps || [];
  const progress = onboarding?.progress || 0;
  const completed = onboarding?.completed || 0;
  const total = onboarding?.total || 0;
  const nextStep = onboarding?.nextStep || null;
  const plans = getAllPlans();

  return (
    <div className="space-y-6">

      {/* ── Progress header ─────────────────────────── */}
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              <ProgressRing pct={progress} />
              <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-slate-900 rotate-90">
                {progress}%
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Progresso geral</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {completed} de {total} etapas
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                {companyName && companyName !== 'Nenhuma empresa ativa'
                  ? `Configurando ${companyName}`
                  : 'Selecione uma empresa para começar'}
              </p>
            </div>
          </div>

          {progress === 100 ? (
            <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700">
              <Sparkles size={16} />
              Pronto para vender!
            </div>
          ) : nextStep ? (
            <button
              type="button"
              onClick={() => onOpenStep?.(nextStep)}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 active:scale-[0.98]"
            >
              Próximo passo
              <ArrowRight size={15} />
            </button>
          ) : null}
        </div>

        {/* Progress bar */}
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-500 transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </section>

      {/* ── Steps list ──────────────────────────────── */}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5">
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">Etapas de configuração</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Conclua cada etapa para ter o produto pronto para operação e venda.
          </p>
        </div>

        {steps.length ? (
          <div className="space-y-2.5">
            {steps.map((step, idx) => (
              <StepRow key={step.id} step={step} index={idx} onOpenStep={onOpenStep} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
            Selecione uma empresa para carregar as etapas de onboarding.
          </div>
        )}
      </section>

      <PlanComparisonTable plans={plans} title="Starter, Pro e Business desde o primeiro acesso" />

    </div>
  );
}
