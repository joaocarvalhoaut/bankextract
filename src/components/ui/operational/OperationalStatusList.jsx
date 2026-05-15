import OperationalStatusPill from './OperationalStatusPill';

export default function OperationalStatusList({ items = [], empty, renderTitle, renderDetail, renderMeta, toneResolver }) {
  if (!items.length) return empty || null;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id || item.label || item.title} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-100">{renderTitle ? renderTitle(item) : item.label || item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{renderDetail ? renderDetail(item) : item.detail}</p>
            {renderMeta ? <div className="mt-1">{renderMeta(item)}</div> : null}
          </div>
          <OperationalStatusPill tone={toneResolver ? toneResolver(item) : item.tone || 'info'}>
            {item.statusLabel || item.status || 'Info'}
          </OperationalStatusPill>
        </div>
      ))}
    </div>
  );
}
