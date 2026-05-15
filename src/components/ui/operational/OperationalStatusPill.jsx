const TONE_STYLES = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  danger: 'border-red-500/30 bg-red-500/10 text-red-200',
  processing: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
  info: 'border-slate-700 bg-slate-800/70 text-slate-200',
  empty: 'border-slate-700 bg-slate-800/50 text-slate-400',
};

const TONE_DOT = {
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  processing: 'bg-cyan-400',
  info: 'bg-slate-300',
  empty: 'bg-slate-500',
};

export function resolveOperationalTone(value) {
  const normalized = String(value || '').toLowerCase();
  if (['success', 'sucesso', 'sent', 'read', 'delivered', 'connected', 'ativo', 'resolved'].includes(normalized)) return 'success';
  if (['warning', 'queued', 'processing', 'processando', 'pending', 'acknowledged', 'ack'].includes(normalized)) return 'processing';
  if (['danger', 'erro', 'failed', 'missing_phone', 'overdue_high', 'critical'].includes(normalized)) return 'danger';
  if (['overdue', 'inactive', 'paused'].includes(normalized)) return 'warning';
  return 'info';
}

export default function OperationalStatusPill({ tone = 'info', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TONE_STYLES[tone] || TONE_STYLES.info} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone] || TONE_DOT.info}`} />
      {children}
    </span>
  );
}
