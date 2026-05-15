/**
 * CollectionFunnel — Funil de cobrança visual com barras proporcionais.
 * Não requer biblioteca de gráficos externa.
 */

function fmtNum(v) {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(v);
}

export default function CollectionFunnel({ stages = [], loading = false }) {
  const maxValue = Math.max(...stages.map(s => s.value || 0), 1);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-32 h-3 bg-slate-700/50 rounded animate-pulse" />
            <div className="flex-1 h-6 bg-slate-700/50 rounded-lg animate-pulse" />
            <div className="w-10 h-3 bg-slate-700/50 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const allZero = stages.every(s => !s.value);

  if (!stages.length || allZero) {
    return (
      <div className="flex flex-col items-center justify-center h-24 text-slate-500 text-sm gap-1.5">
        <span>Funil sem dados no período selecionado.</span>
        <span className="text-[11px] text-slate-600">Aguarde sincronizações ou amplie o intervalo.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {stages.map((stage, i) => {
        const width = Math.max((stage.value / maxValue) * 100, 2);
        return (
          <div key={i} className="flex items-center gap-3 group">
            <div className="w-36 text-right shrink-0">
              <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200 transition-colors">
                {stage.stage}
              </span>
            </div>
            <div className="flex-1 relative h-7 bg-slate-800/60 rounded-lg overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-lg transition-all duration-700 flex items-center justify-end pr-2"
                style={{ width: `${width}%`, background: `${stage.color}22`, borderRight: `2px solid ${stage.color}` }}
              >
                <span className="text-xs font-semibold" style={{ color: stage.color }}>
                  {fmtNum(stage.value)}
                </span>
              </div>
            </div>
            <div className="w-12 text-right shrink-0">
              <span className="text-xs font-mono text-slate-400">
                {stage.pct}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
