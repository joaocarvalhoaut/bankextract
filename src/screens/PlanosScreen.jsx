import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import UsageMeter from '../components/UsageMeter';
import PlanLimitNotice from '../components/PlanLimitNotice';
import LimitWarningModal from '../components/plans/LimitWarningModal';
import PlanCard from '../components/plans/PlanCard';
import PlanComparisonTable from '../components/plans/PlanComparisonTable';
import { getAllPlans, normalizePlanId } from '../constants/plans';
import { getUsageSummary } from '../services/usageService';

const toNoticeType = (level) => (level === 'warning' ? 'warning' : 'danger');
const toMeterStatus = (percent) => (percent >= 95 ? 'danger' : percent >= 80 ? 'warning' : 'ok');

export default function PlanosScreen({ plans = [], currentPlanId, onChoosePlan, companyId, onToast }) {
  const catalog = Array.isArray(plans) && plans.length ? plans : getAllPlans();
  const normalizedCurrentPlanId = normalizePlanId(currentPlanId);
  const [usageSummary, setUsageSummary] = useState(null);
  const [upgradeModalPlan, setUpgradeModalPlan] = useState(null);
  const currentPlan = catalog.find((plan) => plan.id === normalizedCurrentPlanId) || null;

  useEffect(() => {
    let alive = true;

    const loadUsage = async () => {
      if (!companyId) {
        if (alive) setUsageSummary(null);
        return;
      }

      try {
        const data = await getUsageSummary(companyId);
        if (alive) setUsageSummary(data);
      } catch (error) {
        if (alive) setUsageSummary(null);
        onToast?.('erro', error.message || 'Falha ao carregar o consumo comercial.');
      }
    };

    loadUsage();
    return () => {
      alive = false;
    };
  }, [companyId, onToast]);

  return (
    <div className="space-y-6">
      {usageSummary?.highestAlert ? (
        <PlanLimitNotice
          type={toNoticeType(usageSummary.highestAlert.level)}
          title={usageSummary.highestAlert.title}
          message={usageSummary.highestAlert.message}
          actionLabel="Fazer upgrade"
          onAction={() => setUpgradeModalPlan(currentPlan)}
        />
      ) : null}

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

      {companyId && usageSummary ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-900">Consumo comercial da empresa ativa</h3>
            <p className="text-sm text-slate-500">Acompanhe uso atual, limite do plano e o que ainda resta no ciclo.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {[
              usageSummary.metrics?.charges_month,
              usageSummary.metrics?.imports_month,
              usageSummary.metrics?.automations_month,
              usageSummary.metrics?.users_count,
            ]
              .filter(Boolean)
              .map((metric) => (
                <UsageMeter
                  key={metric.key}
                  label={metric.label}
                  used={metric.used}
                  limit={metric.limit}
                  percentage={metric.percent}
                  remaining={metric.remaining}
                  status={toMeterStatus(metric.percent)}
                />
              ))}
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {catalog.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={plan.id === normalizedCurrentPlanId}
            onAction={
              plan.id === normalizedCurrentPlanId
                ? undefined
                : companyId
                  ? () => setUpgradeModalPlan(plan)
                  : onChoosePlan
            }
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

      <LimitWarningModal
        open={Boolean(upgradeModalPlan)}
        currentPlan={currentPlan}
        targetPlan={upgradeModalPlan}
        description="Upgrade sera ativado em breve."
        onUpgrade={() => {
          setUpgradeModalPlan(null);
          onToast?.('aviso', 'Upgrade sera ativado em breve.');
        }}
        onClose={() => setUpgradeModalPlan(null)}
      />
    </div>
  );
}
