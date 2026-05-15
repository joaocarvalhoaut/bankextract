import OperationalStatusPill from './OperationalStatusPill';

export default function OperationalQueue({ items = [], getTone, renderMeta, empty }) {
  if (!items.length) return empty || null;

  return (
    <div className="space-y-3">
      {items.map((row) => {
        const tone = getTone ? getTone(row) : 'info';
        return (
          <div key={row.id} className="grid grid-cols-[minmax(0,1.5fr)_auto_auto] items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">{row.title || row.cliente || 'Registro'}</p>
              <p className="truncate font-mono text-xs text-slate-400">{row.subtitle || row.documento || row.id}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold tabular-nums text-slate-100">{row.value}</p>
              <p className="text-xs text-slate-400">{row.secondary || '—'}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <OperationalStatusPill tone={tone}>{row.statusLabel || row.status || 'Info'}</OperationalStatusPill>
              {renderMeta ? renderMeta(row) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
