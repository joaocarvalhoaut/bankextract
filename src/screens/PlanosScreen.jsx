import { Sparkles } from 'lucide-react';
import PlanCard from '../components/plans/PlanCard';
import PlanComparisonTable from '../components/plans/PlanComparisonTable';
import { getAllPlans, normalizePlanId } from '../constants/plans';

export default function PlanosScreen({ plans = [], currentPlanId, onChoosePlan }) {
  const catalog = Array.isArray(plans) && plans.length ? plans : getAllPlans();
  const normalizedCurrentPlanId = normalizePlanId(currentPlanId);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-soft">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          <Sparkles size={13} />
          Planos e beneficios
        </div>
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">Escolha o plano ideal para sua operacao</h2>
        <p className="mt-3 text-sm text-slate-500">
          Compare limites, recursos e bloqueios comerciais sem depender de strings espalhadas no app.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {catalog.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={plan.id === normalizedCurrentPlanId}
            onAction={plan.id === normalizedCurrentPlanId ? undefined : onChoosePlan}
            actionLabel={
              plan.id === normalizedCurrentPlanId
                ? 'Plano atual'
                : plan.id === 'business'
                  ? 'Falar com especialista'
                  : plan.cta
            }
          />
        ))}
      </section>

      <PlanComparisonTable plans={catalog} title="O que cada plano libera no produto" />

      <p className="text-center text-xs text-slate-400">
        Envios inclusos por mes. Pacotes extras, checkout e billing real serao liberados em breve.
      </p>
    </div>
  );
}
