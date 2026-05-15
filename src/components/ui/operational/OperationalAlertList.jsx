import OperationalStatusPill from './OperationalStatusPill';

export default function OperationalAlertList({ items = [], empty, actionRenderer = null }) {
  if (!items.length) return empty || null;

  return (
    <div className="space-y-3">
      {items.map((alert) => (
        <div key={alert.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-100">{alert.title}</p>
                <OperationalStatusPill tone={alert.tone || 'warning'}>{alert.statusLabel || alert.status || 'Atenção'}</OperationalStatusPill>
              </div>
              <p className="mt-1 text-xs opacity-90 text-slate-400">{alert.detail}</p>
              {alert.meta ? <p className="mt-2 text-[11px] text-slate-500">{alert.meta}</p> : null}
            </div>
            {actionRenderer ? actionRenderer(alert) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
