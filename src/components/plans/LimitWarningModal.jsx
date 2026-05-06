import { AlertCircle, ArrowRight, X } from 'lucide-react';
import FeatureBadge from './FeatureBadge';

export default function LimitWarningModal({
  open,
  title = 'Recurso disponivel no plano Pro',
  description,
  currentPlan,
  targetPlan,
  onUpgrade,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/40 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
              <AlertCircle size={12} />
              Bloqueio comercial
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-slate-950">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Seu plano atual</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-950">{currentPlan?.name}</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {(currentPlan?.features || []).slice(0, 4).map((feature) => (
                <FeatureBadge key={feature} subtle>
                  {feature}
                </FeatureBadge>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Upgrade sugerido</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-950">{targetPlan?.name}</h4>
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
            onClick={onUpgrade}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Fazer upgrade
            <ArrowRight size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Comprar pacote extra
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Agora nao
          </button>
        </div>
      </div>
    </div>
  );
}
