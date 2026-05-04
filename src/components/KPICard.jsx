import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCurrencyBRL } from '../utils/format';

const toneMap = {
  green: {
    accent:   'text-emerald-700',
    bar:      'from-emerald-400 to-emerald-600',
    surface:  'bg-emerald-50',
    badge:    'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot:      'bg-emerald-500',
  },
  red: {
    accent:   'text-red-600',
    bar:      'from-red-400 to-red-600',
    surface:  'bg-red-50',
    badge:    'border-red-200 bg-red-50 text-red-700',
    dot:      'bg-red-500',
  },
  blue: {
    accent:   'text-blue-700',
    bar:      'from-blue-400 to-blue-700',
    surface:  'bg-blue-50',
    badge:    'border-blue-200 bg-blue-50 text-blue-800',
    dot:      'bg-blue-600',
  },
  gold: {
    accent:   'text-amber-700',
    bar:      'from-amber-400 to-amber-600',
    surface:  'bg-amber-50',
    badge:    'border-amber-200 bg-amber-50 text-amber-700',
    dot:      'bg-amber-500',
  },
  amber: {
    accent:   'text-yellow-700',
    bar:      'from-yellow-400 to-yellow-600',
    surface:  'bg-yellow-50',
    badge:    'border-yellow-200 bg-yellow-50 text-yellow-700',
    dot:      'bg-yellow-500',
  },
  slate: {
    accent:   'text-slate-900',
    bar:      'from-slate-300 to-slate-500',
    surface:  'bg-slate-100',
    badge:    'border-slate-200 bg-slate-50 text-slate-600',
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
    <article className="card-hover group relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft">
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${palette.bar}`} />

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 pt-0.5">
          <div className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${palette.dot}`} />
          <p className="text-sm font-semibold leading-snug text-slate-700">{title}</p>
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
        <span className="text-[11px] font-medium text-slate-500">Atualizado</span>
      </div>
    </article>
  );
}
