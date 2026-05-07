import { ArrowRight, Sparkles } from 'lucide-react';
import OnboardingGuide from '../components/OnboardingGuide';
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
        cx="36"
        cy="36"
        r={r}
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

export default function OnboardingScreen({
  onboarding,
  companyName,
  companyId,
  onOpenStep,
  onMarkStep,
  onSkipStep,
  onOpenArticle,
  markingStepId = '',
  skippedStepIds = [],
}) {
  const progress = onboarding?.progress || 0;
  const completed = onboarding?.completed || 0;
  const total = onboarding?.total || 0;
  const nextStep = onboarding?.nextStep || null;
  const plans = getAllPlans();

  return (
    <div className="space-y-6">
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
                  : 'Selecione uma empresa para marcar o onboarding manualmente'}
              </p>
            </div>
          </div>

          {progress === 100 ? (
            <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700">
              <Sparkles size={16} />
              Pronto para operar!
            </div>
          ) : nextStep ? (
            <button
              type="button"
              onClick={() => onOpenStep?.(nextStep)}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 active:scale-[0.98]"
            >
              Proximo passo
              <ArrowRight size={15} />
            </button>
          ) : null}
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-500 transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </section>

      <OnboardingGuide
        steps={onboarding?.steps || []}
        companyId={companyId}
        onOpenStep={onOpenStep}
        onMarkStep={onMarkStep}
        onSkipStep={onSkipStep}
        onOpenArticle={onOpenArticle}
        markingStepId={markingStepId}
        skippedStepIds={skippedStepIds}
      />

      {plans.length > 0 ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Compare os planos disponiveis</h2>
          <p className="mb-6 text-sm text-slate-500">Escolha o plano ideal para sua operacao.</p>
          <PlanComparisonTable plans={plans} activePlanId={onboarding?.planId} />
        </section>
      ) : null}
    </div>
  );
}
