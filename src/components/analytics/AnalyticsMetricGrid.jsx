import { formatCurrencyBRL } from '../../utils/format';

export default function AnalyticsMetricGrid({ cards = [] }) {
  if (!cards.length) return null;

  const toneMap = {
    blue: 'text-cyan-200 border-cyan-500/10 bg-slate-900/50',
    warning: 'text-amber-200 border-amber-500/10 bg-slate-900/50',
    red: 'text-red-200 border-red-500/10 bg-slate-900/50',
    slate: 'text-slate-100 border-slate-700 bg-slate-900/50',
  };

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.id} className={`rounded-[24px] border p-5 shadow-soft ${toneMap[card.tone] || toneMap.slate}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{card.label}</p>
          <p className="mt-3 text-3xl font-semibold">
            {card.currency ? formatCurrencyBRL(card.value || 0) : `${card.value ?? 0}${card.suffix || ''}`}
          </p>
        </article>
      ))}
    </section>
  );
}
