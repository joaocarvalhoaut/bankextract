import { AlertTriangle, ArrowRight, Info, ShieldAlert } from 'lucide-react';

const toneMap = {
  info: { wrapper: 'border-blue-500/30 bg-blue-500/10', title: 'text-blue-100', text: 'text-slate-300', icon: Info },
  warning: { wrapper: 'border-amber-500/30 bg-amber-500/10', title: 'text-amber-100', text: 'text-slate-300', icon: AlertTriangle },
  danger: { wrapper: 'border-red-500/30 bg-red-500/10', title: 'text-red-100', text: 'text-slate-300', icon: ShieldAlert },
};

export default function PlanLimitNotice({ type = 'info', title, message, actionLabel, onAction }) {
  const tone = toneMap[type] || toneMap.info;
  const Icon = tone.icon;

  return (
    <div className={"rounded-2xl border px-4 py-3 shadow-soft " + tone.wrapper}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="mt-0.5"><Icon size={18} className={tone.title} /></div>
          <div>
            <p className={"text-sm font-semibold " + tone.title}>{title}</p>
            <p className={"mt-1 text-sm leading-relaxed " + tone.text}>{message}</p>
          </div>
        </div>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-cyan-500/30 hover:bg-slate-900">
            {actionLabel}<ArrowRight size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
