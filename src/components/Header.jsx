import { useEffect, useRef, useState } from 'react';
import { Bell, Building2, ChevronDown, Globe2, LogOut, User2, Zap } from 'lucide-react';

export default function Header({
  title,
  subtitle,
  companyName,
  actions = null,
  userEmail = '',
  onViewPublicSite,
  onSignOut,
  signOutLoading = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="accent-bar mb-6 overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-card">
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
            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="max-w-2xl text-sm leading-relaxed text-slate-700 lg:text-[15px]">{subtitle}</p>
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

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <User2 size={15} />
                </span>
                <span className="hidden sm:inline">Conta</span>
                <ChevronDown size={15} className={`transition ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen ? (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Conta</p>
                    <p className="mt-1 truncate text-sm font-medium text-slate-700">{userEmail || 'Sessão ativa'}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onViewPublicSite?.();
                    }}
                    className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Globe2 size={15} className="text-slate-500" />
                    Ver site público
                  </button>

                  <button
                    type="button"
                    disabled={signOutLoading}
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut?.();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <LogOut size={15} />
                    {signOutLoading ? 'Saindo...' : 'Sair'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
