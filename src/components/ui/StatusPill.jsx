const variants = {
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  danger:  'border-red-500/25 bg-red-500/10 text-red-300',
  info:    'border-blue-500/25 bg-blue-500/10 text-blue-300',
  neutral: 'border-slate-700/80 bg-slate-800/40 text-slate-300',
  pending: 'border-slate-700/80 bg-slate-800/40 text-slate-400',
};

const dotColors = {
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger:  'bg-red-400',
  info:    'bg-blue-400',
  neutral: 'bg-slate-500',
  pending: 'bg-slate-600',
};

export default function StatusPill({ variant = 'neutral', dot = false, className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none
        ${variants[variant] || variants.neutral} ${className}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColors[variant] || dotColors.neutral}`}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
