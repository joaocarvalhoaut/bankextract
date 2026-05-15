import OnboardingGuide from '../components/OnboardingGuide';
import OnboardingInsightStrip from '../components/onboarding/OnboardingInsightStrip';
import OnboardingProgressHero from '../components/onboarding/OnboardingProgressHero';
import PlanComparisonTable from '../components/plans/PlanComparisonTable';
import { getAllPlans } from '../constants/plans';

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
      <OnboardingProgressHero
        progress={progress}
        completed={completed}
        total={total}
        companyName={companyName}
        nextStep={nextStep}
        onOpenStep={onOpenStep}
      />

      <OnboardingInsightStrip items={onboarding?.insights || []} />

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
        <section className="surface-card rounded-2xl p-6 shadow-soft">
          <h2 className="mb-1 text-lg font-semibold text-slate-50">Comparativo de planos para ativacao real</h2>
          <p className="mb-6 text-sm text-slate-400">
            Use o billing como parte do onboarding para acelerar trial, upgrade e operacao comercial.
          </p>
          <PlanComparisonTable plans={plans} activePlanId={onboarding?.planId} />
        </section>
      ) : null}
    </div>
  );
}
