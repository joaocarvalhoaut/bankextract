/**
 * SendHeatmap — Heatmap de envios por hora × dia da semana.
 * Grade 7×24 com intensidade de cor baseada em volume.
 */
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}h`);
const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function cellColor(value, maxValue) {
  if (!value || !maxValue) return 'bg-slate-800/40';
  const intensity = value / maxValue;
  if (intensity >= 0.8) return 'bg-blue-500';
  if (intensity >= 0.6) return 'bg-blue-500/70';
  if (intensity >= 0.4) return 'bg-blue-500/50';
  if (intensity >= 0.2) return 'bg-blue-500/30';
  return 'bg-blue-500/15';
}

export default function SendHeatmap({ cells = [], maxValue = 0, loading = false }) {
  if (loading) {
    return <div className="h-36 bg-slate-800/30 rounded animate-pulse" />;
  }

  if (!cells.length) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
        Sem dados de envio para exibir.
      </div>
    );
  }

  // Build grid[dow][hour]
  const grid = {};
  for (const cell of cells) {
    if (!grid[cell.dow]) grid[cell.dow] = {};
    grid[cell.dow][cell.hour] = cell.value;
  }

  // Find best hour
  const hourTotals = HOURS.map((_, h) => DAYS_SHORT.reduce((s, _, d) => s + (grid[d]?.[h] || 0), 0));
  const bestHour = hourTotals.indexOf(Math.max(...hourTotals));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[480px]">
        {/* Hour labels */}
        <div className="flex gap-px mb-1 ml-9">
          {HOURS.map((h, i) => (
            <div key={i} className="flex-1 text-center">
              {i % 4 === 0 && (
                <span className={`text-[9px] ${i === bestHour ? 'text-blue-400 font-bold' : 'text-slate-600'}`}>
                  {h}
                </span>
              )}
            </div>
          ))}
        </div>
        {/* Grid */}
        {DAYS_SHORT.map((day, dow) => (
          <div key={dow} className="flex items-center gap-px mb-px">
            <span className="text-[10px] text-slate-500 w-8 shrink-0 text-right pr-1">{day}</span>
            {HOURS.map((_, hour) => {
              const val = grid[dow]?.[hour] || 0;
              return (
                <div
                  key={hour}
                  className={`flex-1 h-4 rounded-[2px] cursor-default transition-opacity hover:opacity-100 ${cellColor(val, maxValue)}`}
                  title={val ? `${day} ${String(hour).padStart(2,'0')}h: ${val} envio(s)` : undefined}
                />
              );
            })}
          </div>
        ))}
        {bestHour >= 0 && (
          <div className="mt-2 text-xs text-slate-400">
            Melhor horário: <span className="text-blue-400 font-semibold">{HOURS[bestHour]}</span>
            <span className="ml-1">({hourTotals[bestHour]} envios)</span>
          </div>
        )}
      </div>
    </div>
  );
}
