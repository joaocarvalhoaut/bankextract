import { CreditCard, LifeBuoy, TrendingUp, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import UsageMeter from '../components/UsageMeter';
import PlanLimitNotice from '../components/PlanLimitNotice';
import FeatureBadge from '../components/plans/FeatureBadge';
import LimitWarningModal from '../components/plans/LimitWarningModal';
import PlanCard from '../components/plans/PlanCard';
import UpgradeBanner from '../components/plans/UpgradeBanner';
import { getUsageSummary } from '../services/usageService';
import {
  calculateRemainingSends,
  getPlanMeta,
  getUpgradeRecommendation,
  normalizePlanId,
} from '../constants/plans';

const toNoticeType = (level) => (level === 'warning' ? 'warning' : 'danger');
const toMeterStatus = (percent) => (percent >= 95 ? 'danger' : percent >= 80 ? 'warning' : 'ok');

export default function BillingScreen({ billing, onOpenPlans, companyId, onToast }) {
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [usageSummary, setUsageSummary] = useState(null);
  const normalizedPlanId = normalizePlanId(billing?.currentPlan?.id);
  const currentPlan = useMemo(
    () => ({
      ...getPlanMeta(normalizedPlanId),
      ...(billing?.currentPlan || {}),
    }),
    [billing?.currentPlan, normalizedPlanId]
  );

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

  const usage = {
    monthly_send_limit: Number(currentPlan?.monthly_send_limit || 0),
    extra_send_credits: 0,
    used_real_sends: Number(billing?.usage?.realSends || 0),
  };
  const remaining = calculateRemainingSends(usage);
  const upgrade = getUpgradeRecommendation(currentPlan.id, usage);

  const kpis = [
    {
      label: 'Plano atual',
      value: currentPlan.name + ' - ' + currentPlan.subtitle,
      sub: currentPlan.price_label,
      bg: 'bg-emerald-50',
      fg: 'text-emerald-700',
      Icon: Zap,
    },
    {
      label: 'Status',
      value: billing?.status || 'Ativa',
      sub: 'Base comercial preparada',
      bg: 'bg-blue-50',
      fg: 'text-blue-700',
      valueColor: 'text-emerald-700',
      Icon: CreditCard,
    },
    {
      label: 'Proxima cobranca',
      value: billing?.nextCharge || '15/05/2026',
      sub: 'Checkout sera liberado em breve',
      bg: 'bg-amber-50',
      fg: 'text-amber-700',
      Icon: TrendingUp,
    },
    {
      label: 'Envios restantes',
      value: remaining,
      sub: usage.used_real_sends + '/' + usage.monthly_send_limit + ' usados',
      bg: 'bg-violet-50',
      fg: 'text-violet-700',
      Icon: LifeBuoy,
    },
  ];

  return (
    <div className="space-y-6">
      {usageSummary?.highestAlert ? (
        <PlanLimitNotice
          type={toNoticeType(usageSummary.highestAlert.level)}
          title={usageSummary.highestAlert.title}
          message={usageSummary.highestAlert.message}
          actionLabel="Fazer upgrade"
          onAction={() => setUpgradeModalOpen(true)}
        />
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, sub, bg, fg, valueColor, Icon }) => (
          <article
            key={label}
            className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-slate-200 via-emerald-300 to-blue-300 opacity-70" />
            <div className={"mb-3 flex h-10 w-10 items-center justify-center rounded-2xl " + bg + " " + fg}>
              <Icon size={18} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className={"mt-1.5 text-2xl font-semibold " + (valueColor || 'text-slate-900')}>{value}</p>
            <p className="mt-1 text-xs text-slate-400">{sub}</p>
          </article>
        ))}
      </section>

      {upgrade ? (
        <UpgradeBanner
          currentPlan={upgrade.current}
          targetPlan={upgrade.target}
          reason={upgrade.reason}
          onAction={() => setUpgradeModalOpen(true)}
        />
      ) : null}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_0.85fr]">
        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">Seu plano inclui</h3>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
              {currentPlan.name}
            </span>
          </div>
          <p className="mb-6 text-sm text-slate-500">Recursos, limites e bloqueios compartilhados a partir do catalogo central.</p>

          <div className="grid gap-3 md:grid-cols-2">
            {(currentPlan.features || []).map((feature) => (
              <FeatureBadge key={feature}>{feature}</FeatureBadge>
            ))}
            {(currentPlan.limitations || []).map((feature) => (
              <FeatureBadge key={feature} enabled={false}>
                {feature}
              </FeatureBadge>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <UsageMeter
              label="Cobrancas do mes"
              used={usageSummary?.metrics?.charges_month?.used ?? usage.used_real_sends}
              limit={usageSummary?.metrics?.charges_month?.limit ?? usage.monthly_send_limit}
              percentage={usageSummary?.metrics?.charges_month?.percent ?? 0}
              remaining={usageSummary?.metrics?.charges_month?.remaining ?? remaining}
              status={toMeterStatus(usageSummary?.metrics?.charges_month?.percent ?? 0)}
            />
            <UsageMeter
              label="Importacoes do mes"
              used={usageSummary?.metrics?.imports_month?.used ?? 0}
              limit={usageSummary?.metrics?.imports_month?.limit ?? 0}
              percentage={usageSummary?.metrics?.imports_month?.percent ?? 0}
              remaining={usageSummary?.metrics?.imports_month?.remaining ?? 0}
              status={toMeterStatus(usageSummary?.metrics?.imports_month?.percent ?? 0)}
            />
            <UsageMeter
              label="Automacoes do mes"
              used={usageSummary?.metrics?.automations_month?.used ?? 0}
              limit={usageSummary?.metrics?.automations_month?.limit ?? 0}
              percentage={usageSummary?.metrics?.automations_month?.percent ?? 0}
              remaining={usageSummary?.metrics?.automations_month?.remaining ?? 0}
              status={toMeterStatus(usageSummary?.metrics?.automations_month?.percent ?? 0)}
            />
            <UsageMeter
              label="Usuarios"
              used={usageSummary?.metrics?.users_count?.used ?? (billing?.usage?.usersCount || 0)}
              limit={usageSummary?.metrics?.users_count?.limit ?? (currentPlan.id === 'business' ? 10 : currentPlan.id === 'pro' ? 3 : 2)}
              percentage={usageSummary?.metrics?.users_count?.percent ?? 0}
              remaining={usageSummary?.metrics?.users_count?.remaining ?? 0}
              status={toMeterStatus(usageSummary?.metrics?.users_count?.percent ?? 0)}
            />
          </div>
        </article>

        <div className="space-y-6">
          {upgrade?.target ? (
            <PlanCard
              plan={upgrade.target}
              compact
              onAction={() => setUpgradeModalOpen(true)}
              actionLabel="Fazer upgrade"
            />
          ) : null}

          <article className="flex flex-col rounded-[32px] border border-slate-200 bg-white p-6 shadow-soft">
            <h3 className="text-lg font-semibold text-slate-900">Proximas acoes</h3>
            <p className="mt-1 text-sm text-slate-500">
              Organize a operacao agora e conecte pagamento real depois.
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => (upgrade?.target ? setUpgradeModalOpen(true) : onOpenPlans?.())}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
              >
                <Zap size={15} />
                Fazer upgrade
              </button>
              <button
                type="button"
                onClick={onOpenPlans}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
              >
                <LifeBuoy size={15} />
                Ver planos
              </button>
            </div>

            <div className="mt-auto pt-6">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-800">Checkout em breve</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  O fluxo comercial esta pronto para upgrade e bloqueio, mas a cobranca real ainda sera ativada em uma proxima fase.
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <LimitWarningModal
        open={upgradeModalOpen}
        currentPlan={currentPlan}
        targetPlan={upgrade?.target}
        description="Seu plano atual ja esta funcionando para simulacao e operacao assistida. O checkout sera liberado em breve para ativar upgrades reais."
        onUpgrade={() => {
          setUpgradeModalOpen(false);
          onToast?.('aviso', 'Upgrade sera ativado em breve.');
        }}
        onClose={() => setUpgradeModalOpen(false)}
      />
    </div>
  );
}
