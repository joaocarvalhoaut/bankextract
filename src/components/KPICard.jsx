import { formatCurrencyBRL } from '../utils/format';

/* ─────────────────────────────────────────────────────────────
   Tone palette
   dot accent colour only — background comes from .surface-card
───────────────────────────────────────────────────────────── */
const toneMap = {
  green:   'bg-cyan-400',
  red:     'bg-red-500',
  blue:    'bg-blue-500',
  gold:    'bg-amber-500',
  amber:   'bg-yellow-500',
  slate:   'bg-slate-400',
  emerald: 'bg-emerald-400',
};

/* ─────────────────────────────────────────────────────────────
   Status-badge colour map
   Only meaningful operational states render a badge.
   badge prop must be one of: "OK" | "Atenção" | "Atraso" | "Crítico"
   Any other value (including null / undefined / "Info") = no badge.
───────────────────────────────────────────────────────────── */
const STATUS_BADGE = {
  ok:      'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  atenção: 'border-amber-500/30  bg-amber-500/10   text-amber-300',
  atencao: 'border-amber-500/30  bg-amber-500/10   text-amber-300',
  atraso:  'border-amber-500/30  bg-amber-500/10   text-amber-300',
  crítico: 'border-red-500/30    bg-red-500/10     text-red-300',
  critico: 'border-red-500/30    bg-red-500/10     text-red-300',
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
   KPICard — CSS-grid 3-zone layout
   ─────────────────────────────────────────────────────────────

   Layout uses named grid areas:
     ┌──────────────────┐
     │   header (row 1) │  ← label + optional status badge
     ├──────────────────┤
     │   value  (row 2) │  ← financial value, full width
     ├──────────────────┤
     │   hint   (row 3) │  ← description / footer
     └──────────────────┘

   Each zone is in its own dedicated grid row.
   It is PHYSICALLY IMPOSSIBLE for any element in row 2
   to share horizontal space with anything in row 1.

   The trend-icon pill has been REMOVED:
   · It was never connected to real trend data
   · It was the element users saw as a phantom "Info badge"
   · Status is shown only through the optional `badge` prop
     with meaningful labels: "OK" | "Atenção" | "Atraso" | "Crítico"
───────────────────────────────────────────────────────────── */
export default function KPICard({
  title,
  value,
  hint,
  tone  = 'slate',
  badge = null,         /* "OK" | "Atenção" | "Atraso" | "Crítico" — any other value is ignored */
}) {
  const dotColor  = toneMap[tone] || toneMap.slate;
  const formatted = formatValue(value);

  /* Only render a badge when it maps to a known operational state */
  const badgeKey  = typeof badge === 'string' ? badge.toLowerCase() : null;
  const badgeCls  = badgeKey ? STATUS_BADGE[badgeKey] : null;

  return (
    <article
      className="surface-card overflow-hidden rounded-2xl px-5 pb-4 pt-4"
      style={{
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr',
        minHeight: '96px',
      }}
    >

      {/* ── Row 1 — Header ────────────────────────────────────────
          label (dot + title) on the left.
          Optional status badge on the right — still in the SAME
          grid row, never bleeding into the value row below.     */}
      <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden">

        {/* Left: dot + title */}
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`}
            aria-hidden
          />
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {title}
          </span>
        </div>

        {/* Right: status badge — only when operationally meaningful */}
        {badgeCls && (
          <span
            className={[
              'shrink-0 inline-flex items-center',
              'rounded-full border px-2 py-0.5',
              'text-[10px] font-semibold leading-none',
              badgeCls,
            ].join(' ')}
          >
            {badge}
          </span>
        )}
      </div>

      {/* ── Row 2 — Main value ────────────────────────────────────
          Lives in its own grid row — cannot share space with Row 1.
          Hard overflow clip + truncate prevents bleed at any width.
          title attr provides full value on hover (accessibility).  */}
      <p
        className={[
          'mt-2.5',
          'w-full min-w-0 max-w-full',
          'overflow-hidden truncate',
          'font-mono text-[20px] font-semibold',
          'leading-none tabular-nums tracking-tight',
          'text-slate-50',
        ].join(' ')}
        title={formatted}
      >
        {formatted}
      </p>

      {/* ── Row 3 — Hint footer ───────────────────────────────────
          `align-self: end` pins it to the grid cell's bottom edge,
          keeping all cards in a row aligned at the same baseline.  */}
      <p
        className="w-full truncate pt-2.5 text-[11px] leading-none text-slate-500"
        style={{ alignSelf: 'end' }}
      >
        {hint ?? <span className="opacity-0" aria-hidden>·</span>}
      </p>

    </article>
  );
}
