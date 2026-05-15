export default function OperationalPanel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`surface-card rounded-[24px] border border-slate-800 bg-slate-950/70 p-4 shadow-soft ${className}`}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-slate-50">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs leading-relaxed text-slate-400">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
