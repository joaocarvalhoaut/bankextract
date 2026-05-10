export default function UsageMeter({ label, used = 0, limit = 0, percentage = 0, remaining = 0, status = 'ok' }) {
  const tone = {
    ok: { bar: 'bg-gradient-to-r from-blue-500 to-cyan-400', badge: 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-200' },
    warning: { bar: 'bg-amber-500', badge: 'border border-amber-500/20 bg-amber-500/10 text-amber-200' },
    danger: { bar: 'bg-red-500', badge: 'border border-red-500/20 bg-red-500/10 text-red-200' },
  }[status] || { bar: 'bg-slate-500', badge: 'border border-slate-600 bg-slate-800 text-slate-200' };

  return (
    <article className="surface-elevated rounded-2xl border border-cyan-500/10 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-50">
            {used} <span className="text-base font-medium text-slate-400">/ {limit || 'sem limite'}</span>
          </p>
        </div>
        <span className={"rounded-full px-2.5 py-1 text-[11px] font-semibold " + tone.badge}>{percentage}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={"h-full rounded-full transition-all duration-500 " + tone.bar} style={{ width: Math.min(percentage, 100) + '%' }} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>Restante: {remaining}</span>
        <span>Consumido: {percentage}%</span>
      </div>
    </article>
  );
}
