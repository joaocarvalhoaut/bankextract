export default function OnboardingInsightStrip({ items = [] }) {
  if (!items.length) return null;

  const toneMap = {
    success: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200',
    warning: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
    info: 'border-slate-700 bg-slate-900/50 text-slate-200',
  };

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((item) => (
        <article
          key={item.id}
          className={`rounded-[24px] border px-4 py-4 shadow-soft ${toneMap[item.tone] || toneMap.info}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{item.label}</p>
          <p className="mt-2 text-xl font-semibold">{item.value}</p>
        </article>
      ))}
    </section>
  );
}
