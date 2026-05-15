import OperationalStatusPill from './OperationalStatusPill';

export default function OperationalStateView({ icon: Icon, title, description, tone = 'empty', action = null, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 px-4 text-center ${compact ? 'py-6' : 'py-8'}`}>
      <div className="mb-3">
        <OperationalStatusPill tone={tone}>
          {Icon ? <Icon size={14} /> : null}
          {title}
        </OperationalStatusPill>
      </div>
      <p className="max-w-sm text-xs leading-relaxed text-slate-400">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
