import OperationalStatusPill from './OperationalStatusPill';

export default function OperationalChecklist({ items = [], empty }) {
  if (!items.length) return empty || null;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-100">{item.label || item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.detail || item.description}</p>
            </div>
            <OperationalStatusPill tone={item.ok || item.done ? 'success' : 'warning'}>
              {item.ok || item.done ? 'OK' : 'Pendente'}
            </OperationalStatusPill>
          </div>
        </div>
      ))}
    </div>
  );
}
