export default function OperationalProgress({ label, value, total, tone = 'info' }) {
  const pct = total > 0 ? Math.max(4, Math.round((value / total) * 100)) : 0;
  const barClass =
    tone === 'success'
      ? 'bg-emerald-400'
      : tone === 'danger'
        ? 'bg-red-400'
        : tone === 'warning'
          ? 'bg-amber-400'
          : tone === 'processing'
            ? 'bg-cyan-400'
            : 'bg-slate-400';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <span className="font-mono text-xs tabular-nums text-slate-100">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
