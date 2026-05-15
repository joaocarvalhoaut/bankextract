function joinClasses(...values) {
  return values.filter(Boolean).join(' ');
}

function normalizeBreadcrumb(breadcrumb) {
  if (!breadcrumb) return [];
  return Array.isArray(breadcrumb) ? breadcrumb.filter(Boolean) : [breadcrumb];
}

export default function ScreenHeader({
  breadcrumb,
  title,
  description = '',
  actions = null,
  secondaryActions = null,
  status = null,
  className = '',
  compact = false,
}) {
  const crumbs = normalizeBreadcrumb(breadcrumb);

  return (
    <header className={joinClasses('flex flex-col gap-4 rounded-[28px] border border-slate-800 bg-slate-950/60 px-5 py-5 shadow-soft sm:px-6', className)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          {crumbs.length ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {crumbs.map((item, index) => (
                <span key={`${item}-${index}`} className="inline-flex items-center gap-2">
                  {index ? <span className="text-slate-700">{'>'}</span> : null}
                  <span>{item}</span>
                </span>
              ))}
            </div>
          ) : null}
          <div className={crumbs.length ? 'mt-3' : ''}>
            <h1 className={joinClasses(compact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-[2rem]', 'text-balance font-semibold tracking-tight text-slate-50')}>
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-400">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {(status || actions || secondaryActions) ? (
          <div className="flex w-full flex-col items-stretch gap-3 xl:w-auto xl:min-w-[280px] xl:items-end">
            {status ? (
              <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
                {status}
              </div>
            ) : null}
            {secondaryActions ? (
              <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
                {secondaryActions}
              </div>
            ) : null}
            {actions ? (
              <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
