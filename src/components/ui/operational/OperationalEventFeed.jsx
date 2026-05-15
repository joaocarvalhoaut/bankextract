import OperationalStateView from './OperationalStateView';
import OperationalStatusPill from './OperationalStatusPill';

export default function OperationalEventFeed({ items = [], emptyIcon, emptyTitle, emptyDescription, formatTimestamp }) {
  if (!items.length) {
    return <OperationalStateView icon={emptyIcon} title={emptyTitle} description={emptyDescription} compact />;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-100">{item.title}</p>
              {item.badge ? <OperationalStatusPill tone={item.tone || 'info'}>{item.badge}</OperationalStatusPill> : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.detail}</p>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-slate-500">{formatTimestamp ? formatTimestamp(item.timestamp) : item.timestamp}</span>
        </div>
      ))}
    </div>
  );
}
