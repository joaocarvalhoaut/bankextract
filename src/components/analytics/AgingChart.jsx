/**
 * AgingChart — Gráfico de aging de inadimplência com barras verticais SVG.
 */
function fmtBRL(v) {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(0)}k`;
  return `R$ ${Number(v).toFixed(0)}`;
}

export default function AgingChart({ buckets = [], totalValue = 0, totalCount = 0, loading = false }) {
  const maxValue = Math.max(...buckets.map(b => b.value || 0), 1);

  if (loading) {
    return (
      <div className="flex items-end gap-2 h-32">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex-1 bg-slate-700/50 rounded-t animate-pulse" style={{ height: `${40 + i * 10}%` }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-1.5 h-36 mb-2">
        {buckets.map((b, i) => {
          const height = Math.max((b.value / maxValue) * 100, 4);
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group cursor-default" title={`${b.label}: ${fmtBRL(b.value)} (${b.count} tít.)`}>
              <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100">
                {fmtBRL(b.value)}
              </span>
              <div
                className="w-full rounded-t transition-all duration-500 group-hover:opacity-100"
                style={{
                  height: `${height}%`,
                  background: b.color,
                  opacity: 0.75,
                  boxShadow: `0 0 8px ${b.color}44`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {buckets.map((b, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[9px] text-slate-500 block leading-tight">{b.label}</span>
            <span className="text-[9px] font-semibold block" style={{ color: b.color }}>{b.count}</span>
          </div>
        ))}
      </div>
      {(totalValue > 0 || totalCount > 0) && (
        <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between text-xs text-slate-400">
          <span>{totalCount} títulos em aberto</span>
          <span className="font-semibold text-slate-200">{fmtBRL(totalValue)}</span>
        </div>
      )}
    </div>
  );
}
