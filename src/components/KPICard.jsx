import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCurrencyBRL } from '../utils/format';

const toneMap = {
  green: {
    accent: 'text-cyan-300',
    dot:    'bg-cyan-400',
    delta:  'text-cyan-400',
  },
  red: {
    accent: 'text-red-300',
    dot:    'bg-red-500',
    delta:  'text-red-400',
  },
  blue: {
    accent: 'text-blue-300',
    dot:    'bg-blue-500',
    delta:  'text-blue-400',
  },
  gold: {
    accent: 'text-amber-300',
    dot:    'bg-amber-500',
    delta:  'text-amber-400',
  },
  amber: {
    accent: 'text-yellow-300',
    dot:    'bg-yellow-500',
    delta:  'text-yellow-400',
  },
  slate: {
    accent: 'text-slate-100',
    dot:    'bg-slate-400',
    delta:  'text-slate-400',
  },
};

const formatValue = (value) => {
  if (typeof value === 'number' && Math.abs(value) > 999) return formatCurrencyBRL(value);
  if (typeof value === 'number') return new Intl.NumberFormat('pt-BR').format(value);
  return value;
};

export default function KPICard({ title, value, hint, trend = null, tone = 'slate' }) {
  const palette = toneMap[tone] || toneMap.slate;

  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;

  return (
    <article className="surface-card relative rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${palette.dot}`} />
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
        </div>
        <TrendIcon size={13} className={`flex-shrink-0 ${palette.delta} ${trend === null ? 'opacity-40' : ''}`} />
      </div>

      <p className={`font-mono text-2xl font-semibold tabular-nums tracking-tight text-slate-50`}>
        {formatValue(value)}
      </p>

      {hint && (
        <p className="mt-2 text-[11px] text-slate-500">{hint}</p>
      )}
    </article>
  );
}
