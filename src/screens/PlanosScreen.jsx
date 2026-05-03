import { BadgeCheck, Zap } from 'lucide-react';

export default function PlanosScreen({ plans = [], currentPlanId, onChoosePlan }) {
  if (!plans.length) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center shadow-soft">
        <p className="text-sm text-slate-500">Carregando planos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-600">Planos e preços</p>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Escolha o plano ideal</h2>
        <p className="mt-2 text-sm text-slate-500">Comece pequeno e escale conforme crescer. Sem custos ocultos.</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isFeatured = plan.featured;
          return (
            <article
              key={plan.id}
              className={`relative overflow-hidden rounded-[28px] border p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-lifted ${
                isFeatured
                  ? 'border-emerald-300 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white shadow-lifted'
                  : isCurrent
                  ? 'border-emerald-200 bg-emerald-50/40 shadow-card'
                  : 'border-slate-200 bg-white shadow-soft'
              }`}
            >
              {/* Top gradient bar */}
              <div className={`absolute inset-x-0 top-0 h-0.5 ${
                isFeatured ? 'bg-gradient-to-r from-emerald-400 to-blue-500' : 'bg-gradient-to-r from-slate-200 to-slate-300'
              }`} />

              {/* Badges */}
              <div className="mb-5 flex items-start justify-between gap-2">
                <p className={`text-xs font-bold uppercase tracking-widest ${isFeatured ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {plan.name}
                </p>
                <div className="flex gap-1.5">
                  {isFeatured && (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold tracking-widest text-emerald-300">
                      POPULAR
                    </span>
                  )}
                  {isCurrent && (
                    <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      ATUAL
                    </span>
                  )}
                </div>
              </div>

              {/* Price */}
              <div className="mb-2 flex items-baseline gap-1">
                <span className={`text-4xl font-extrabold tracking-tight ${isFeatured ? 'text-white' : 'text-slate-900'}`}>
                  {plan.price}
                </span>
                <span className={`text-sm ${isFeatured ? 'text-slate-400' : 'text-slate-400'}`}>
                  {plan.price !== 'Sob consulta' ? '/mês' : ''}
                </span>
              </div>
              <p className={`mb-5 text-xs ${isFeatured ? 'text-slate-400' : 'text-slate-500'}`}>{plan.emphasis}</p>
              <p className={`mb-6 text-[11px] font-medium uppercase tracking-wider ${isFeatured ? 'text-slate-500' : 'text-slate-400'}`}>
                {plan.limits}
              </p>

              {/* Features list */}
              <ul className="mb-7 space-y-2.5">
                {(plan.features || []).map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <BadgeCheck size={15} className={isFeatured ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span className={isFeatured ? 'text-slate-300' : 'text-slate-700'}>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                type="button"
                onClick={() => onChoosePlan?.(plan)}
                disabled={isCurrent}
                className={`group w-full rounded-2xl px-5 py-3.5 text-sm font-bold transition active:scale-[0.98] disabled:cursor-default disabled:opacity-70 ${
                  isFeatured
                    ? 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-900/40'
                    : isCurrent
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {isCurrent ? 'Plano atual' : plan.id === 'enterprise' ? 'Falar com time' : (
                    <>
                      <Zap size={14} className="group-hover:animate-pulse" />
                      {plan.id === 'starter' ? 'Começar grátis' : `Assinar ${plan.name}`}
                    </>
                  )}
                </span>
              </button>
            </article>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-slate-400">
        Todos os planos incluem acesso ao dashboard, histórico de importações e suporte por e-mail.
        Billing real será ativado em uma próxima fase.
      </p>
    </div>
  );
}
