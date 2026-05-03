import { CreditCard, LifeBuoy, TrendingUp, Zap } from 'lucide-react';

function UsageMeter({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className="text-xs font-semibold text-slate-900">
          {value} <span className="font-normal text-slate-400">/ {max}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-right text-[10px] text-slate-400">{pct}% usado</p>
    </div>
  );
}

export default function BillingScreen({ billing, onOpenPlans }) {
  const currentPlan = billing?.currentPlan;

  const kpis = [
    {
      label: 'Plano atual',
      value: currentPlan?.name || 'Starter',
      sub: currentPlan?.price || 'R$ 97/mes',
      bar: 'from-emerald-400 to-emerald-600',
      bg: 'bg-emerald-50',
      fg: 'text-emerald-700',
      Icon: Zap,
    },
    {
      label: 'Status',
      value: billing?.status || 'Ativa',
      sub: 'Modo comercial',
      bar: 'from-blue-400 to-blue-600',
      bg: 'bg-blue-50',
      fg: 'text-blue-700',
      valueColor: 'text-emerald-700',
      Icon: CreditCard,
    },
    {
      label: 'Proxima cobranca',
      value: billing?.nextCharge || '15/05/2026',
      sub: 'Experiencia comercial',
      bar: 'from-amber-400 to-orange-400',
      bg: 'bg-amber-50',
      fg: 'text-amber-700',
      Icon: TrendingUp,
    },
    {
      label: 'Carteira atual',
      value: billing?.usage?.records || 0,
      sub: 'Registros carregados',
      bar: 'from-violet-400 to-purple-500',
      bg: 'bg-violet-50',
      fg: 'text-violet-700',
      Icon: LifeBuoy,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, sub, bar, bg, fg, valueColor, Icon }) => (
          <article
            key={label}
            className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
          >
            <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${bar} opacity-70`} />
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${bg} ${fg}`}>
              <Icon size={18} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className={`mt-1.5 text-2xl font-semibold ${valueColor || 'text-slate-900'}`}>{value}</p>
            <p className="mt-1 text-xs text-slate-400">{sub}</p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_0.8fr]">
        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">Consumo atual</h3>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
              Live
            </span>
          </div>
          <p className="mb-6 text-sm text-slate-500">Uso do plano no periodo atual do ciclo de cobranca.</p>

          <div className="mb-6 grid grid-cols-3 gap-3">
            {[
              { label: 'Empresas', value: billing?.usage?.companies || 0 },
              { label: 'Importacoes', value: billing?.usage?.importedRowsThisMonth || 0 },
              { label: 'Carteira', value: billing?.usage?.records || 0 },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <UsageMeter
              label="Empresas cadastradas"
              value={billing?.usage?.companies || 0}
              max={currentPlan?.limits?.companies || 5}
              color="bg-emerald-500"
            />
            <UsageMeter
              label="Registros importados este mes"
              value={billing?.usage?.importedRowsThisMonth || 0}
              max={currentPlan?.limits?.rowsPerMonth || 1000}
              color="bg-blue-500"
            />
            <UsageMeter
              label="Carteira total"
              value={billing?.usage?.records || 0}
              max={currentPlan?.limits?.totalRecords || 5000}
              color="bg-violet-500"
            />
          </div>
        </article>

        <article className="flex flex-col rounded-[32px] border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-lg font-semibold text-slate-900">Proximas acoes</h3>
          <p className="mt-1 text-sm text-slate-500">
            Organize a operacao agora e conecte pagamento real depois.
          </p>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={onOpenPlans}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
            >
              <Zap size={15} />
              Alterar plano
            </button>
            <a
              href="mailto:suporte@bankextract.app?subject=Suporte%20BankExtract"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
            >
              <LifeBuoy size={15} />
              {billing?.supportLabel || 'Falar com suporte'}
            </a>
          </div>

          <div className="mt-auto pt-6">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold text-amber-800">Pagamento real em breve</p>
              <p className="mt-0.5 text-xs text-amber-700">
                O gateway sera ativado na proxima fase. Nenhuma acao necessaria agora.
              </p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
