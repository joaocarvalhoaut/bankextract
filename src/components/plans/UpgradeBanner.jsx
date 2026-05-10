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
    <section className="surface-card rounded-[24px] border border-cyan-500/20 p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            <Sparkles size={12} />
            Upgrade recomendado
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-50">
            {currentPlan.name} para {targetPlan.name}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{reason}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-300">
            <span className="rounded-full border border-slate-700 bg-slate-900/50 px-3 py-1 shadow-soft">
              {Number(currentPlan.monthly_send_limit || 0).toLocaleString('pt-BR')} envios/mes hoje
            </span>
            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 shadow-soft">
              {Number(targetPlan.monthly_send_limit || 0).toLocaleString('pt-BR')} envios/mes no upgrade
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onAction?.(targetPlan)}
          className="btn-brand inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
        >
          {actionLabel}
          <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}
