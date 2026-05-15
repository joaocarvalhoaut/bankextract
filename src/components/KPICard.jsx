import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCurrencyBRL } from '../utils/format';

/* ─────────────────────────────────────────────────────────────
   Tone palette — dot accent + trend arrow colour only.
   Background and border come from .surface-card.
───────────────────────────────────────────────────────────── */
const toneMap = {
  green:  { dot: 'bg-cyan-400',   delta: 'text-cyan-400'   },
  red:    { dot: 'bg-red-500',    delta: 'text-red-400'    },
  blue:   { dot: 'bg-blue-500',   delta: 'text-blue-400'   },
  gold:   { dot: 'bg-amber-500',  delta: 'text-amber-400'  },
  amber:  { dot: 'bg-yellow-500', delta: 'text-yellow-400' },
  slate:  { dot: 'bg-slate-400',  delta: 'text-slate-400'  },
};

/* ─────────────────────────────────────────────────────────────
   Value formatter
   Numbers > 999 → BRL currency
   Other numbers  → pt-BR formatted
   Strings        → passthrough
───────────────────────────────────────────────────────────── */
const formatValue = (value) => {
  if (typeof value === 'number' && Math.abs(value) > 999) return formatCurrencyBRL(value);
  if (typeof value === 'number') return new Intl.NumberFormat('pt-BR').format(value);
  return String(value ?? '—');
};

/* ─────────────────────────────────────────────────────────────
   KPICard
   Three-zone layout (label / value / footer) with strict
   overflow containment. Premium enterprise style à la
   Stripe · Ramp · Mercury · Linear.
───────────────────────────────────────────────────────────── */
export default function KPICard({ title, value, hint, trend = null, tone = 'slate' }) {
  const palette = toneMap[tone] || toneMap.slate;
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const formatted  = formatValue(value);

  return (
    <article className="surface-card relative flex min-h-[96px] flex-col overflow-hidden rounded-2xl px-5 pb-4 pt-4">

      {/* ── Zone 1 — Label ───────────────────────
          Tight 1-line row: colour dot + uppercase label.
          Trend icon lives here, top-right, always visible.       */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${palette.dot}`} aria-hidden />
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {title}
          </p>
        </div>
        {/* Trend badge — always rendered so height is stable */}
        <span
          aria-hidden
          className={[
            'flex shrink-0 items-center justify-center rounded-full',
            'border border-slate-700/50 bg-slate-800/50 p-[3px]',
            trend === null ? 'opacity-20' : palette.delta,
          ].join(' ')}
        >
          <TrendIcon size={10} strokeWidth={2.5} />
        </span>
      </div>

      {/* ── Zone 2 — Main value ──────────────────
          Font-mono tabular-nums. Truncates at edge instead
          of overflowing the card boundary.
          font-size 20px: fits ~14 chars in 160px content area
          at the tightest 2-col mobile layout.                   */}
      <p
        className="mt-2.5 min-w-0 truncate font-mono text-[20px] font-semibold leading-none tabular-nums tracking-tight text-slate-50"
        title={formatted}
      >
        {formatted}
      </p>

      {/* ── Zone 3 — Hint footer ─────────────────
          Pinned to the bottom via mt-auto.
          Always occupies the same vertical space so all
          cards align at a consistent height.                     */}
      <p className="mt-auto truncate pt-2.5 text-[11px] leading-none text-slate-500">
        {hint ?? <span className="opacity-0" aria-hidden>·</span>}
      </p>

    </article>
  );
}
