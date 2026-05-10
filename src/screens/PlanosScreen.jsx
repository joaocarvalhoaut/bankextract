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
  const [checkoutLoading, setCheckoutLoading] = useState(false);
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
    return () => { alive = false; };
  }, [companyId, onToast]);

  const handlePlanAction = async (plan) => {
    const planCode = plan?.code || plan?.id;
    console.log('[PlanosScreen] handlePlanAction called', {
      planCode,
      planName: plan?.name,
      companyId,
      hasOnChoosePlan: typeof onChoosePlan === 'function',
    });

    if (!plan) return;
    if (!companyId) {
      onChoosePlan?.(plan);
      return;
    }

    setCheckoutLoading(true);
    try {
      await onChoosePlan?.(plan);
    } catch (error) {
      console.error('[PlanosScreen] handlePlanAction error:', error);
      onToast?.('erro', error.message || 'Falha ao iniciar o checkout do plano.');
    } finally {
      setCheckoutLoading(false);
      setUpgradeModalPlan(null);
    }
  };

  return (
    <div className="space-y-6">
      {usageSummary?.highestAlert ? (
        <PlanLimitNotice
          type={toNoticeType(usageSummary.highestAlert.level)}
          title={usageSummary.highestAlert.title}
          message={usageSummary.highestAlert.message}
          actionLabel="Ir para checkout"
          onAction={() => setUpgradeModalPlan(currentPlan)}
        />
      ) : null}

      <section className="surface-card rounded-[32px] px-8 py-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
          <Sparkles size={13} />
          Planos e faturamento
        </div>
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-50">Escolha o plano ideal para escalar o NC Finance</h2>
        <p className="mt-3 text-sm text-slate-300">
          Checkout Stripe, trial de 7 dias e limites comerciais sincronizados com o uso real da empresa.
        </p>
      </section>

      {companyId && usageSummary ? (
        <section className="surface-card rounded-[32px] p-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-50">Consumo comercial da empresa ativa</h3>
            <p className="text-sm text-slate-400">Acompanhe uso atual, limite do plano e o que ainda resta no ciclo.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {[
              usageSummary.metrics?.charges_month,
              usageSummary.metrics?.automations_month,
              usageSummary.metrics?.users_count,
              usageSummary.metrics?.integrations_count,
              usageSummary.metrics?.companies_count,
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
                : 'Abrir checkout'
            }
          />
        ))}
      </section>

      <PlanComparisonTable plans={catalog} title="Limites e recursos liberados em cada nivel do produto" />

      <p className="text-center text-xs text-slate-500">
        Trial padrao de 7 dias. Upgrade e downgrade passam pelo Stripe Checkout ou pelo Customer Portal.
      </p>

      <LimitWarningModal
        open={Boolean(upgradeModalPlan)}
        currentPlan={currentPlan}
        targetPlan={upgradeModalPlan}
        title="Confirmar alteracao de plano"
        description="O checkout Stripe sera aberto para concluir a troca de plano da empresa ativa sem quebrar o ambiente multi-tenant."
        primaryActionLabel="Ir para checkout"
        secondaryActionLabel="Ver detalhes depois"
        loading={checkoutLoading}
        onUpgrade={() => handlePlanAction(upgradeModalPlan)}
        onSecondaryAction={() => setUpgradeModalPlan(null)}
        onClose={() => setUpgradeModalPlan(null)}
      />
    </div>
  );
}
