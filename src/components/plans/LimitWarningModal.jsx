import { AlertCircle, ArrowRight, X } from 'lucide-react';
import FeatureBadge from './FeatureBadge';

export default function LimitWarningModal({
  open,
  title = 'Recurso disponivel no plano Pro',
  description,
  currentPlan,
  targetPlan,
  onUpgrade,
  onSecondaryAction,
  onClose,
  primaryActionLabel = 'Fazer upgrade',
  secondaryActionLabel = 'Abrir portal',
  tertiaryActionLabel = 'Agora nao',
  loading = false,
}) {
  if (!open) return null;

  const handleUpgradeClick = () => {
    onUpgrade?.();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/40 px-4 py-8 backdrop-blur-sm">
      <div className="surface-card w-full max-w-xl rounded-[32px] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
              <AlertCircle size={12} />
              Bloqueio comercial
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-slate-50">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700 text-slate-400 transition hover:bg-slate-900/60 disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="surface-elevated rounded-[24px] border border-slate-700 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Seu plano atual</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-50">{currentPlan?.name}</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {(currentPlan?.features || []).slice(0, 4).map((feature) => (
                <FeatureBadge key={feature} subtle>
                  {feature}
                </FeatureBadge>
              ))}
            </div>
          </div>

          <div className="surface-elevated rounded-[24px] border border-cyan-500/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Upgrade sugerido</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-50">{targetPlan?.name}</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {(targetPlan?.features || []).slice(0, 4).map((feature) => (
                <FeatureBadge key={feature}>{feature}</FeatureBadge>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={handleUpgradeClick}
            disabled={loading}
            className="btn-brand inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Abrindo checkout...' : primaryActionLabel}
            {!loading && <ArrowRight size={15} />}
          </button>
          {onSecondaryAction ? (
            <button
              type="button"
              onClick={onSecondaryAction}
              disabled={loading}
              className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-900 disabled:opacity-40"
            >
              {secondaryActionLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-2xl border border-slate-700 bg-transparent px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-900/60 disabled:opacity-40"
          >
            {tertiaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
