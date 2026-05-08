import { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, Globe2, LogOut, User2, Zap } from 'lucide-react';
import NotificationBell from './NotificationBell';

export default function Header({
  title,
  subtitle,
  companyName,
  actions = null,
  userEmail = '',
  companyId = '',
  onViewPublicSite,
  onOpenNotifications,
  onNavigate,
  onSignOut,
  signOutLoading = false,
  onToast,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 16 });
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      setMenuPosition({
        top: rect.bottom + 8,
        right: Math.max(16, window.innerWidth - rect.right),
      });
    };

    const handleClickOutside = (event) => {
      const menuElement = menuRef.current;
      const buttonElement = buttonRef.current;

      if (menuElement?.contains(event.target) || buttonElement?.contains(event.target)) {
        return;
      }

      setMenuOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  return (
    <header className="accent-bar surface-card relative z-20 mb-6 overflow-visible rounded-[30px]">
      <div className="overflow-visible px-5 py-4 lg:px-6 lg:py-5">
        <div className="flex flex-col gap-4 overflow-visible xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <Building2 size={11} />
                {companyName || 'Sem empresa ativa'}
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                <Zap size={10} />
                NC Finance
              </div>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-50 lg:text-2xl">{title}</h1>
            {subtitle && <p className="text-sm text-slate-300">{subtitle}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2 overflow-visible">
            {actions}
            <NotificationBell
              companyId={companyId}
              onOpenNotifications={onOpenNotifications}
              onNavigate={onNavigate}
              onToast={onToast}
            />

            {onViewPublicSite && (
              <button
                type="button"
                onClick={onViewPublicSite}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                <Globe2 size={13} />
                Site
              </button>
            )}

            <div className="relative overflow-visible">
              <button
                ref={buttonRef}
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                <User2 size={14} />
                <span className="max-w-[120px] truncate">{userEmail || 'Conta'}</span>
                <ChevronDown size={12} className={menuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>

              {menuOpen && (
                <div
                  ref={menuRef}
                  className="fixed z-[200] min-w-[180px] rounded-2xl border border-slate-700 bg-[#10213B] py-1 shadow-xl"
                  style={{ top: menuPosition.top, right: menuPosition.right }}
                >
                  <div className="border-b border-slate-700 px-4 py-2.5">
                    <p className="text-xs font-semibold text-slate-50">{userEmail || 'Conta'}</p>
                    <p className="text-[11px] text-slate-300">Conta ativa</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { onSignOut?.(); setMenuOpen(false); }}
                    disabled={signOutLoading}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-300 hover:bg-red-500/10"
                  >
                    <LogOut size={14} />
                    {signOutLoading ? 'Saindo...' : 'Sair da conta'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
