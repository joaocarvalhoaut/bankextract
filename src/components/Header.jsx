import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, User2 } from 'lucide-react';
import NotificationBell from './NotificationBell';

export default function Header({
  title,
  subtitle,
  actions = null,
  userEmail = '',
  companyId = '',
  onOpenNotifications,
  onNavigate,
  onSignOut,
  signOutLoading = false,
  onToast,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handleClickOutside = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex flex-shrink-0 items-center justify-between border-b border-slate-800/60 bg-[#060d19]/95 px-4 py-3 backdrop-blur-sm lg:px-6">

      {/* Left: page title */}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-slate-50 lg:text-base">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>
        )}
      </div>

      {/* Right: actions + notifications + user */}
      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
        {actions}

        <NotificationBell
          companyId={companyId}
          onOpenNotifications={onOpenNotifications}
          onNavigate={onNavigate}
          onToast={onToast}
        />

        <div className="relative">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 px-2.5 text-[12px] font-medium text-slate-300 transition hover:bg-slate-800 hover:text-slate-100"
          >
            <User2 size={13} />
            <span className="hidden max-w-[100px] truncate sm:inline">{userEmail || 'Conta'}</span>
            <ChevronDown
              size={11}
              className={menuOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              className="absolute right-0 top-full z-[110] mt-1.5 min-w-[180px] rounded-xl border border-slate-700/80 bg-[#0d1b2e] py-1 shadow-xl"
            >
              <div className="border-b border-slate-700/60 px-3 py-2.5">
                <p className="text-[12px] font-semibold text-slate-100">{userEmail || 'Conta'}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Conta ativa</p>
              </div>
              <button
                type="button"
                onClick={() => { onSignOut?.(); setMenuOpen(false); }}
                disabled={signOutLoading}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-red-300 transition hover:bg-red-500/10"
              >
                <LogOut size={13} />
                {signOutLoading ? 'Saindo...' : 'Sair da conta'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
