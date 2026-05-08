import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCurrencyBRL } from '../utils/format';

const toneMap = {
  green: {
    accent:   'text-cyan-300',
    bar:      'from-blue-500 to-cyan-400',
    surface:  'bg-blue-500/10',
    badge:    'border-blue-500/20 bg-blue-500/10 text-cyan-200',
    dot:      'bg-cyan-400',
  },
  red: {
    accent:   'text-red-300',
    bar:      'from-red-500 to-red-400',
    surface:  'bg-red-500/10',
    badge:    'border-red-500/20 bg-red-500/10 text-red-200',
    dot:      'bg-red-500',
  },
  blue: {
    accent:   'text-cyan-300',
    bar:      'from-blue-500 to-cyan-400',
    surface:  'bg-blue-500/10',
    badge:    'border-blue-500/20 bg-blue-500/10 text-blue-100',
    dot:      'bg-blue-600',
  },
  gold: {
    accent:   'text-amber-300',
    bar:      'from-amber-500 to-amber-400',
    surface:  'bg-amber-500/10',
    badge:    'border-amber-500/20 bg-amber-500/10 text-amber-200',
    dot:      'bg-amber-500',
  },
  amber: {
    accent:   'text-yellow-300',
    bar:      'from-yellow-500 to-yellow-400',
    surface:  'bg-yellow-500/10',
    badge:    'border-yellow-500/20 bg-yellow-500/10 text-yellow-200',
    dot:      'bg-yellow-500',
  },
  slate: {
    accent:   'text-slate-50',
    bar:      'from-slate-500 to-slate-300',
    surface:  'bg-slate-800',
    badge:    'border-slate-700 bg-slate-800 text-slate-300',
    dot:      'bg-slate-400',
  },
};

const formatValue = (value) => {
  if (typeof value === 'number' && Math.abs(value) > 999) return formatCurrencyBRL(value);
  if (typeof value === 'number') return new Intl.NumberFormat('pt-BR').format(value);
  return value;
};

export default function KPICard({ title, value, hint, trend = null, tone = 'slate' }) {
  const palette = toneMap[tone] || toneMap.slate;

  return (
    <article className="card-hover surface-card group relative overflow-hidden rounded-[24px] p-5">
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${palette.bar}`} />

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 pt-0.5">
          <div className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${palette.dot}`} />
          <p className="text-sm font-semibold leading-snug text-slate-200">{title}</p>
        </div>

        <div className={`flex-shrink-0 rounded-xl p-1.5 ring-1 ring-black/5 ${palette.surface}`}>
          {trend === 'up'   ? <ArrowUpRight   size={14} className={palette.accent} />
          : trend === 'down' ? <ArrowDownRight  size={14} className={palette.accent} />
          :                    <Minus           size={14} className={`${palette.accent} opacity-60`} />}
        </div>
      </div>

      <p className={`text-[2rem] font-bold tracking-tight ${palette.accent}`}>
        {formatValue(value)}
      </p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none shadow-sm ${palette.badge}`}>
          {hint}
        </span>
        <span className="text-[11px] font-medium text-slate-400">Atualizado</span>
      </div>
    </article>
  );
}
