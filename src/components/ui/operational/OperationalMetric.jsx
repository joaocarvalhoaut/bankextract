import OperationalStatusPill from './OperationalStatusPill';

export default function OperationalMetric({ label, value, hint, tone = 'info', icon: Icon = null, className = '' }) {
  return (
    <article className={`rounded-2xl border border-slate-800 bg-slate-950/80 p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-slate-50">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {Icon ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-slate-400">
              <Icon size={16} />
            </div>
          ) : null}
          <OperationalStatusPill tone={tone}>
            {tone === 'danger' ? 'Atencao' : tone === 'processing' ? 'Ativo' : tone === 'warning' ? 'Risco' : tone === 'success' ? 'OK' : 'Info'}
          </OperationalStatusPill>
        </div>
      </div>
    </article>
  );
}
