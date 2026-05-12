import { formatCurrencyBRL } from '../../utils/format';

export default function AnalyticsTimelineChart({ items = [] }) {
  const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const width = Math.max((Number(item.value || 0) / max) * 100, 6);
        return (
          <div key={item.label}>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">{item.label}</span>
              <span className="font-semibold text-slate-50">
                {Number(item.value || 0) > 999 ? formatCurrencyBRL(item.value || 0) : item.value || 0}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-700"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
