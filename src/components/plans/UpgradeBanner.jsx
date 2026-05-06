import { ArrowRight, Sparkles } from 'lucide-react';

export default function UpgradeBanner({
  currentPlan,
  targetPlan,
  reason,
  onAction,
  actionLabel = 'Fazer upgrade',
}) {
  if (!currentPlan || !targetPlan) return null;

  return (
    <section className="rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
            <Sparkles size={12} />
            Upgrade recomendado
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-950">
            {currentPlan.name} para {targetPlan.name}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{reason}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            <span className="rounded-full bg-white px-3 py-1 shadow-soft">
              {Number(currentPlan.monthly_send_limit || 0).toLocaleString('pt-BR')} envios/mês hoje
            </span>
            <span className="rounded-full bg-white px-3 py-1 shadow-soft">
              {Number(targetPlan.monthly_send_limit || 0).toLocaleString('pt-BR')} envios/mês no upgrade
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onAction?.(targetPlan)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {actionLabel}
          <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}
