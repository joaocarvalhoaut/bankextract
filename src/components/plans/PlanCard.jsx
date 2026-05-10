import { ArrowRight, BadgeCheck } from 'lucide-react';
import FeatureBadge from './FeatureBadge';

export default function PlanCard({
  plan,
  current = false,
  compact = false,
  onAction,
  actionLabel,
  footer,
}) {
  const highlight = Boolean(plan?.highlighted || plan?.featured);
  const buttonLabel =
    actionLabel ||
    (current ? 'Plano atual' : plan?.cta || (plan?.id === 'business' ? 'Falar com especialista' : 'Fazer upgrade'));

  return (
    <article
      className={`relative overflow-hidden rounded-[28px] border p-6 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-card ${
        highlight ? 'surface-card border-cyan-400/30 ring-1 ring-cyan-500/20' : 'surface-card border-cyan-500/10'
      }`}
    >
      {plan?.badge ? (
        <span className="absolute right-5 top-5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">
          {plan.badge}
        </span>
      ) : null}

      <div className="pr-20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{plan?.name}</p>
        <h3 className="mt-2 text-2xl font-bold text-slate-50">{plan?.subtitle}</h3>
        <p className="mt-3 text-4xl font-bold tracking-tight text-slate-50">{plan?.price_label}</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{plan?.description}</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <FeatureBadge subtle>{`${Number(plan?.monthly_send_limit || 0).toLocaleString('pt-BR')} envios/mes`}</FeatureBadge>
        {current ? <FeatureBadge subtle>Plano atual</FeatureBadge> : null}
      </div>

      <div className={`mt-6 space-y-3 ${compact ? '' : 'min-h-[168px]'}`}>
        {(plan?.features || []).map((feature) => (
          <div key={feature} className="flex items-start gap-2 text-sm text-slate-200">
            <BadgeCheck size={15} className="mt-0.5 shrink-0 text-cyan-300" />
            <span>{feature}</span>
          </div>
        ))}
      </div>

      {(plan?.limitations || []).length ? (
        <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Bloqueios atuais</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {plan.limitations.map((item) => (
              <FeatureBadge key={item} enabled={false} subtle>
                {item}
              </FeatureBadge>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onAction?.(plan)}
        disabled={current && !onAction}
        className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold transition ${
          highlight
            ? 'btn-brand'
            : current
              ? 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-200'
              : 'border border-slate-700 bg-slate-900/60 text-slate-100 hover:border-cyan-500/30 hover:bg-slate-900'
        }`}
      >
        <span>{buttonLabel}</span>
        {!current ? <ArrowRight size={15} /> : null}
      </button>

      {footer ? <div className="mt-4 text-xs leading-relaxed text-slate-400">{footer}</div> : null}
    </article>
  );
}
