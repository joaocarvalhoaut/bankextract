import { Bell, Building2, Zap } from 'lucide-react';

export default function Header({ title, subtitle, companyName, actions = null }) {
  return (
    <header className="accent-bar card-hover mb-6 overflow-hidden rounded-[30px] border border-white/70 bg-white/90 shadow-card backdrop-blur-sm">
      <div className="px-5 py-4 lg:px-6 lg:py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Building2 size={11} />
                {companyName || 'Sem empresa ativa'}
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 ring-pulse" />
                SaaS Premium
              </div>
            </div>
            <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950 lg:text-3xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="max-w-2xl text-sm leading-relaxed text-slate-500 lg:text-[15px]">{subtitle}</p>
            ) : null}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {actions}

            <div className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 ring-pulse" />
              Sistema ativo
            </div>

            <div className="hidden items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 lg:inline-flex">
              <Zap size={11} />
              Live
            </div>

            <button
              type="button"
              className="micro-bounce relative inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            >
              <Bell size={16} />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-white" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
