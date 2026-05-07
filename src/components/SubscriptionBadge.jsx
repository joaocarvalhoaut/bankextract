import { ArrowRight, Gem, ShieldCheck } from 'lucide-react';

const DAY_IN_MS = 86400000;

const statusTone = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  trialing: 'border-blue-200 bg-blue-50 text-blue-700',
  past_due: 'border-amber-200 bg-amber-50 text-amber-700',
  canceled: 'border-red-200 bg-red-50 text-red-700',
};

function getTrialDaysLeft(trialEndsAt) {
  if (!trialEndsAt) return null;
  const diff = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / DAY_IN_MS);
  return Number.isFinite(diff) ? Math.max(0, diff) : null;
}

export default function SubscriptionBadge({ subscription, onOpenPlans, compact = false }) {
  if (!subscription?.currentPlan) return null;

  const plan = subscription.currentPlan;
  const daysLeft = getTrialDaysLeft(subscription.trialEndsAt);
  const status = String(subscription.status || 'trialing').toLowerCase();

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white/92 ${compact ? 'p-3' : 'p-4'} shadow-soft`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Plano atual</p>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Gem size={15} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">{plan.name}</p>
              <p className="text-xs text-slate-500">{plan.subtitle}</p>
            </div>
          </div>
        </div>

        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone[status] || statusTone.trialing}`}>
          {status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="font-semibold text-slate-900">{Number(plan.monthly_send_limit || 0).toLocaleString('pt-BR')}</p>
          <p>cobrancas/mes</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="font-semibold text-slate-900">{subscription.remainingRealSends ?? 0}</p>
          <p>restantes</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {daysLeft !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600">
            <ShieldCheck size={12} />
            {daysLeft} dia(s) de trial
          </span>
        ) : null}
        <button
          type="button"
          onClick={onOpenPlans}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          Ver planos
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
