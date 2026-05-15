import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCurrencyBRL } from '../utils/format';

/* ─────────────────────────────────────────────────────────────
   Tone palette — dot accent + trend arrow colour only.
   Background and border come from .surface-card.
───────────────────────────────────────────────────────────── */
const toneMap = {
  green:   { dot: 'bg-cyan-400',    delta: 'text-cyan-400'    },
  red:     { dot: 'bg-red-500',     delta: 'text-red-400'     },
  blue:    { dot: 'bg-blue-500',    delta: 'text-blue-400'    },
  gold:    { dot: 'bg-amber-500',   delta: 'text-amber-400'   },
  amber:   { dot: 'bg-yellow-500',  delta: 'text-yellow-400'  },
  slate:   { dot: 'bg-slate-400',   delta: 'text-slate-400'   },
  emerald: { dot: 'bg-emerald-400', delta: 'text-emerald-400' },
};

/* ─────────────────────────────────────────────────────────────
   Optional text-badge tone map (badge="Info" | "OK" | "Atenção")
───────────────────────────────────────────────────────────── */
const badgeToneMap = {
  info:    'border-blue-500/30   bg-blue-500/10   text-blue-300',
  ok:      'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  atenção: 'border-amber-500/30  bg-amber-500/10  text-amber-300',
  atencao: 'border-amber-500/30  bg-amber-500/10  text-amber-300',
  alerta:  'border-amber-500/30  bg-amber-500/10  text-amber-300',
  erro:    'border-red-500/30    bg-red-500/10    text-red-300',
  danger:  'border-red-500/30    bg-red-500/10    text-red-300',
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
   KPICard — three-zone layout with absolute-positioned badge
   ─────────────────────────────────────────────────────────────
   Zone 1  label row   — full-width, right-padded to clear badge
   Zone 2  value       — own block, no horizontal neighbours
   Zone 3  hint footer — bottom-pinned via mt-auto

   The trend-pill badge is taken OUT of document flow
   (position: absolute, top-right corner).  This makes it
   PHYSICALLY IMPOSSIBLE for it to share horizontal space with
   any other zone, regardless of card width or zoom level.

   Optional `badge` prop ("Info" | "OK" | "Atenção" | etc.)
   renders a text pill inside Zone 1.
───────────────────────────────────────────────────────────── */
export default function KPICard({
  title,
  value,
  hint,
  trend  = null,
  tone   = 'slate',
  badge  = null,
}) {
  const palette   = toneMap[tone] || toneMap.slate;
  const TrendIcon = trend === 'up' ? ArrowUpRight
                  : trend === 'down' ? ArrowDownRight
                  : Minus;
  const formatted = formatValue(value);

  /* badge tone — look up by lower-cased key, fall back to 'info' */
  const badgeCls  = badge
    ? (badgeToneMap[badge.toLowerCase()] || badgeToneMap.info)
    : null;

  return (
    <article
      className={[
        'surface-card',
        'relative',                   /* anchor for the absolute badge      */
        'flex min-h-[96px] flex-col', /* vertical stack — zones never share rows */
        'overflow-hidden',            /* hard outer clip                    */
        'rounded-2xl',
        'px-5 pb-4 pt-4',
      ].join(' ')}
    >

      {/* ══ Trend-pill badge — ABSOLUTE, outside document flow ══════
          Right-4 Top-4 exactly matches the article's px-5 / pt-4
          inset.  No zone can flow into this space.               */}
      <span
        aria-hidden
        className={[
          'absolute right-4 top-4',
          'flex items-center justify-center rounded-full',
          'border border-slate-700/50 bg-slate-800/50 p-[3px]',
          trend === null ? 'opacity-20' : palette.delta,
        ].join(' ')}
      >
        <TrendIcon size={10} strokeWidth={2.5} />
      </span>

      {/* ── Zone 1 — Label ────────────────────────────────────────
          pr-8 (32 px) reserves clearance for the absolute badge
          (badge pill: ~22 px wide + 4 px gap ≈ 26 px → pr-8 safe).
          Optional text-badge lives here, not near the value.    */}
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden pr-8">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${palette.dot}`}
          aria-hidden
        />
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {title}
        </span>
        {badgeCls && (
          <span
            className={[
              'ml-1 shrink-0 inline-flex items-center',
              'rounded-full border px-2 py-0.5',
              'text-[10px] font-semibold leading-none',
              badgeCls,
            ].join(' ')}
          >
            {badge}
          </span>
        )}
      </div>

      {/* ── Zone 2 — Main value ───────────────────────────────────
          Own block element — never on the same line as the badge.
          w-full + max-w-full + truncate = hard containment at
          card boundary.  title attr exposes full value on hover. */}
      <p
        className={[
          'mt-2.5',
          'block w-full max-w-full min-w-0',
          'overflow-hidden truncate',
          'font-mono text-[20px] font-semibold',
          'leading-none tabular-nums tracking-tight',
          'text-slate-50',
        ].join(' ')}
        title={formatted}
      >
        {formatted}
      </p>

      {/* ── Zone 3 — Hint footer ──────────────────────────────────
          mt-auto pins it to the card bottom so all cards in a row
          share a consistent baseline regardless of content height. */}
      <p className="mt-auto w-full truncate pt-2.5 text-[11px] leading-none text-slate-500">
        {hint ?? <span className="opacity-0" aria-hidden>·</span>}
      </p>

    </article>
  );
}
