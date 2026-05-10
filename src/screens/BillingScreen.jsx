import { CreditCard, Crown, Gauge, Layers3, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import UsageMeter from '../components/UsageMeter';
import PlanLimitNotice from '../components/PlanLimitNotice';
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

const STATUS_META = {
  trialing: {
    label: 'Trial ativo',
    badge: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
    description: 'A empresa esta operando em periodo de trial com 7 dias de uso comercial.',
  },
  active: {
    label: 'Assinatura ativa',
    badge: 'border-blue-500/30 bg-blue-500/10 text-blue-100',
    description: 'Checkout e portal Stripe estao prontos para upgrade, downgrade e autoatendimento.',
  },
  past_due: {
    label: 'Pagamento pendente',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    description: 'Existe uma pendencia de pagamento. Atualize a assinatura para evitar bloqueios.',
  },
  canceled: {
    label: 'Assinatura cancelada',
    badge: 'border-red-500/30 bg-red-500/10 text-red-100',
    description: 'A assinatura foi cancelada e pode exigir reativacao para continuar usando limites pagos.',
  },
};

const formatDateTime = (value) => {
  if (!value) return 'Nao definido';
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
};

const fallbackLimit = (plan, key) => {
  const planLimits = plan?.limits_json || {};
  switch (key) {
    case 'users_count':
      return Number(planLimits.users_count ?? planLimits.users ?? (plan?.id === 'business' ? 10 : plan?.id === 'pro' ? 3 : 2));
    case 'integrations_count':
      return Number(planLimits.integrations_count ?? (plan?.id === 'business' ? 10 : plan?.id === 'pro' ? 4 : 2));
    case 'companies_count':
      return Number(planLimits.companies_count ?? planLimits.companies ?? (plan?.id === 'business' ? 3 : 1));
    default:
      return Number(planLimits[key] ?? 0);
  }
};

export default function BillingScreen({
  billing,
  onOpenPlans,
  onChoosePlan,
  onOpenPortal,
  companyId,
  onToast,
}) {
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [usageSummary, setUsageSummary] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
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
    return () => { alive = false; };
  }, [companyId, onToast]);

  const usage = {
    monthly_send_limit: Number(currentPlan?.monthly_send_limit || 0),
    extra_send_credits: Number(billing?.extra_send_credits || 0),
    used_real_sends: Number(billing?.usage?.realSends || 0),
  };
  const remaining = calculateRemainingSends(usage);
  const upgrade = getUpgradeRecommendation(currentPlan.id, usage);
  const statusMeta = STATUS_META[billing?.status] || STATUS_META.active;
  const trialDays = Number(billing?.trialDaysRemaining || 0);

  const usageMeters = [
    usageSummary?.metrics?.charges_month,
    usageSummary?.metrics?.automations_month,
    usageSummary?.metrics?.users_count,
    usageSummary?.metrics?.integrations_count,
    usageSummary?.metrics?.companies_count,
  ].filter(Boolean);

  const kpis = [
    {
      label: 'Plano atual',
      value: currentPlan.name,
      sub: currentPlan.price_label,
      tone: 'text-cyan-200',
      icon: Crown,
    },
    {
      label: 'Status comercial',
      value: statusMeta.label,
      sub: billing?.status === 'trialing' ? `${trialDays} dia(s) restantes` : 'Stripe sincronizado com Supabase',
      tone: 'text-blue-100',
      icon: ShieldCheck,
    },
    {
      label: 'Proximo ciclo',
      value: formatDateTime(billing?.currentPeriodEnd),
      sub: billing?.status === 'past_due' ? 'Regularize para evitar bloqueios' : 'Periodo faturado no Stripe',
      tone: 'text-slate-50',
      icon: CreditCard,
    },
    {
      label: 'Envios restantes',
      value: remaining.toLocaleString('pt-BR'),
      sub: `${usage.used_real_sends.toLocaleString('pt-BR')}/${usage.monthly_send_limit.toLocaleString('pt-BR')} usados`,
      tone: 'text-cyan-100',
      icon: Gauge,
    },
  ];

  // FIX: guard usa plan?.code || plan?.id (objetos do DB tem code, constantes locais tem id)
  const handleCheckout = async (plan = upgrade?.target) => {
    const planCode = plan?.code || plan?.id;
    console.log('[BillingScreen] handleCheckout called', {
      planCode,
      planId: plan?.id,
      planName: plan?.name,
      hasUpgrade: !!upgrade,
      upgradeTarget: upgrade?.target?.id,
      hasOnChoosePlan: typeof onChoosePlan === 'function',
    });

    if (!planCode || !onChoosePlan) {
      console.warn('[BillingScreen] handleCheckout blocked:', {
        reason: !planCode ? 'planCode vazio - upgrade.target ausente' : 'onChoosePlan nao fornecido',
      });
      return;
    }

    setCheckoutLoading(true);
    try {
      await onChoosePlan(plan);
    } catch (error) {
      console.error('[BillingScreen] handleCheckout error:', error);
      onToast?.('erro', error.message || 'Falha ao iniciar o checkout Stripe.');
    } finally {
      setCheckoutLoading(false);
      setUpgradeModalOpen(false);
    }
  };

  const handleOpenPortal = async () => {
    if (!onOpenPortal) return;
    setPortalLoading(true);
    try {
      await onOpenPortal();
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao abrir o portal do cliente.');
    } finally {
      setPortalLoading(false);
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
          onAction={() => setUpgradeModalOpen(true)}
        />
      ) : null}

      <section className="surface-card relative overflow-hidden rounded-[32px] px-6 py-6">
        <div className="glow-brand pointer-events-none absolute -right-12 top-0 h-40 w-40 rounded-full" />
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusMeta.badge}`}>
              <Sparkles size={12} />
              {statusMeta.label}
            </div>
            <h2 className="mt-4 text-3xl font-semibold text-slate-50">Billing comercial pronto para venda</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Checkout Stripe, portal do cliente, trial de 7 dias e limites operacionais por plano sincronizados com o ambiente SaaS.
            </p>
            <p className="mt-2 text-sm text-slate-400">{statusMeta.description}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleCheckout(upgrade?.target)}
              disabled={checkoutLoading || !upgrade?.target}
              className="btn-brand rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkoutLoading ? 'Abrindo checkout...' : upgrade?.target ? `Upgrade para ${upgrade.target.name}` : 'Sem upgrade disponivel'}
            </button>
            <button
              type="button"
              onClick={handleOpenPortal}
              disabled={portalLoading}
              className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-500/30 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {portalLoading ? 'Abrindo portal...' : 'Gerenciar assinatura'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, sub, tone, icon: Icon }) => (
          <article key={label} className="surface-elevated rounded-[28px] border border-cyan-500/10 p-5 shadow-soft">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
              <Icon size={18} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
            <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
            <p className="mt-1 text-xs text-slate-400">{sub}</p>
          </article>
        ))}
      </section>

      {upgrade ? (
        <UpgradeBanner
          currentPlan={upgrade.current}
          targetPlan={upgrade.target}
          reason={upgrade.reason}
          actionLabel="Ir para checkout"
          onAction={() => setUpgradeModalOpen(true)}
        />
      ) : null}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="surface-card rounded-[32px] p-6">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-50">Limites do plano e consumo atual</h3>
            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
              {currentPlan.name}
            </span>
          </div>
          <p className="mb-6 text-sm text-slate-400">
            Usuarios, empresas, integracoes, automacoes e volume mensal sincronizados com o plano comercial.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {usageMeters.map((metric) => (
              <UsageMeter
                key={metric.key}
                label={metric.label}
                used={metric.used}
                limit={metric.limit || fallbackLimit(currentPlan, metric.key)}
                percentage={metric.percent}
                remaining={metric.remaining}
                status={toMeterStatus(metric.percent)}
              />
            ))}
          </div>
        </article>

        <div className="space-y-6">
          {upgrade?.target ? (
            <PlanCard
              plan={upgrade.target}
              compact
              onAction={() => setUpgradeModalOpen(true)}
              actionLabel="Abrir checkout"
            />
          ) : null}

          <article className="surface-card flex flex-col rounded-[32px] p-6">
            <h3 className="text-lg font-semibold text-slate-50">Operacao comercial</h3>
            <p className="mt-1 text-sm text-slate-400">
              Controle o ciclo de trial, abra o portal do cliente e leve a empresa para um plano superior com poucos cliques.
            </p>

            <div className="mt-6 grid gap-3">
              <div className="surface-elevated rounded-[24px] border border-cyan-500/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <Layers3 size={16} className="text-cyan-300" />
                  Trial e periodo faturado
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  Trial restante: {billing?.status === 'trialing' ? `${trialDays} dia(s)` : 'Nao aplicavel'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Periodo atual ate {formatDateTime(billing?.currentPeriodEnd)}
                </p>
              </div>

              <div className="surface-elevated rounded-[24px] border border-cyan-500/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <Users size={16} className="text-cyan-300" />
                  Limites elegantes
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  Quando a empresa excede um limite, o produto bloqueia com aviso comercial e direciona para upgrade ou portal.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleCheckout(upgrade?.target)}
                disabled={checkoutLoading || !upgrade?.target}
                className="btn-brand rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {checkoutLoading ? 'Abrindo checkout...' : 'Upgrade / downgrade'}
              </button>
              <button
                type="button"
                onClick={handleOpenPortal}
                disabled={portalLoading}
                className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-500/30 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {portalLoading ? 'Abrindo portal...' : 'Customer Portal Stripe'}
              </button>
              <button
                type="button"
                onClick={onOpenPlans}
                className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-900/60"
              >
                Comparar planos
              </button>
            </div>
          </article>
        </div>
      </section>

      <LimitWarningModal
        open={upgradeModalOpen}
        currentPlan={currentPlan}
        targetPlan={upgrade?.target}
        title="Atualize o plano da empresa"
        description="O checkout Stripe sera aberto para concluir o upgrade ou downgrade com trial, limites e faturamento sincronizados ao NC Finance."
        primaryActionLabel="Abrir checkout"
        secondaryActionLabel="Abrir portal"
        tertiaryActionLabel="Agora nao"
        loading={checkoutLoading}
        onUpgrade={() => handleCheckout(upgrade?.target)}
        onSecondaryAction={handleOpenPortal}
        onClose={() => setUpgradeModalOpen(false)}
      />
    </div>
  );
}
