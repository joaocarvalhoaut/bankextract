import { AlertTriangle, ArrowRight, Info, ShieldAlert } from 'lucide-react';

const toneMap = {
  info: {
    wrapper: 'border-blue-200 bg-blue-50',
    title: 'text-blue-800',
    text: 'text-blue-700',
    icon: Info,
  },
  warning: {
    wrapper: 'border-amber-200 bg-amber-50',
    title: 'text-amber-800',
    text: 'text-amber-700',
    icon: AlertTriangle,
  },
  danger: {
    wrapper: 'border-red-200 bg-red-50',
    title: 'text-red-800',
    text: 'text-red-700',
    icon: ShieldAlert,
  },
};

export default function PlanLimitNotice({
  type = 'info',
  title,
  message,
  actionLabel,
  onAction,
}) {
  const tone = toneMap[type] || toneMap.info;
  const Icon = tone.icon;

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-soft ${tone.wrapper}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="mt-0.5">
            <Icon size={18} className={tone.title} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${tone.title}`}>{title}</p>
            <p className={`mt-1 text-sm leading-relaxed ${tone.text}`}>{message}</p>
          </div>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
          >
            {actionLabel}
            <ArrowRight size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
