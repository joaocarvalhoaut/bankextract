export default function UsageMeter({
  label,
  used = 0,
  limit = 0,
  percentage = 0,
  remaining = 0,
  status = 'ok',
}) {
  const tone = {
    ok: {
      bar: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700',
    },
    warning: {
      bar: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-700',
    },
    danger: {
      bar: 'bg-red-500',
      badge: 'bg-red-50 text-red-700',
    },
  }[status] || {
    bar: 'bg-slate-500',
    badge: 'bg-slate-100 text-slate-700',
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {used} <span className="text-base font-medium text-slate-400">/ {limit || 'sem limite'}</span>
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.badge}`}>{percentage}%</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>Restante: {remaining}</span>
        <span>Consumido: {percentage}%</span>
      </div>
    </article>
  );
}
