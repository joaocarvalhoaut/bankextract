/**
 * TimeSeriesChart — Gráfico de série temporal SVG puro.
 * Suporta linha + área com dados diários/semanais/mensais.
 */
import { useMemo } from 'react';

const W = 600;
const H = 120;
const PAD = { top: 8, right: 16, bottom: 24, left: 40 };

function pathFromPoints(points) {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

function areaFromPoints(points) {
  if (!points.length) return '';
  const top = pathFromPoints(points);
  const bottom = `L ${points[points.length - 1].x.toFixed(1)} ${(H - PAD.bottom).toFixed(1)} L ${points[0].x.toFixed(1)} ${(H - PAD.bottom).toFixed(1)} Z`;
  return `${top} ${bottom}`;
}

function niceMax(max) {
  if (max <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / magnitude) * magnitude;
}

export default function TimeSeriesChart({ data = [], color = '#3B82F6', label = '', formatY = null }) {
  const points = useMemo(() => {
    if (!data.length) return [];
    const values = data.map(d => Number(d.value || 0));
    const maxVal = niceMax(Math.max(...values, 1));
    const xStep = (W - PAD.left - PAD.right) / Math.max(data.length - 1, 1);
    const yScale = (H - PAD.top - PAD.bottom) / maxVal;
    return data.map((d, i) => ({
      x: PAD.left + i * xStep,
      y: H - PAD.bottom - Number(d.value || 0) * yScale,
      value: d.value,
      label: d.date || d.week || d.month || d.label || '',
    }));
  }, [data]);

  const values = data.map(d => Number(d.value || 0));
  const maxVal = niceMax(Math.max(...values, 1));
  const fmtY = formatY || (v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v));

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-20 text-slate-600 text-sm">
        Sem dados para exibir.
      </div>
    );
  }

  // Pick ~3 x-axis labels evenly
  const xLabels = data.length <= 6
    ? data.map((d, i) => ({ i, label: d.date || d.week || d.month || d.label || '' }))
    : [0, Math.floor(data.length / 2), data.length - 1].map(i => ({
        i,
        label: data[i]?.date || data[i]?.week || data[i]?.month || data[i]?.label || '',
      }));

  return (
    <div>
      {label && <p className="text-xs text-slate-500 mb-1">{label}</p>}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        style={{ maxHeight: 120 }}
      >
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y-axis grid + labels */}
        {[0, 0.5, 1].map((frac, i) => {
          const y = H - PAD.bottom - frac * (H - PAD.top - PAD.bottom);
          const val = frac * maxVal;
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#334155" strokeWidth="0.5" strokeDasharray="3,4" />
              <text x={PAD.left - 4} y={y + 3.5} textAnchor="end" fontSize="9" fill="#64748B">{fmtY(val)}</text>
            </g>
          );
        })}

        {/* Area fill */}
        {points.length > 1 && (
          <path d={areaFromPoints(points)} fill={`url(#grad-${color.replace('#', '')})`} />
        )}

        {/* Line */}
        {points.length > 1 && (
          <path d={pathFromPoints(points)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={points.length > 30 ? 0 : 2.5}
            fill={color} opacity="0.9">
            <title>{p.label}: {p.value}</title>
          </circle>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ i, label }) => {
          if (!points[i]) return null;
          return (
            <text key={i} x={points[i].x} y={H - 4} textAnchor="middle" fontSize="9" fill="#64748B">
              {String(label).slice(-5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
