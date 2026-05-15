import {
  Activity,
  BarChart3,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  ChevronLeft,
  ChevronRight,
  Cog,
  CreditCard,
  History,
  Link2,
  ListChecks,
  Settings2,
  SlidersHorizontal,
  Target,
  Upload,
  WalletCards,
  Zap,
} from 'lucide-react';
import BrandLockup from './branding/BrandLockup';
import BrandLogo from './branding/BrandLogo';

const navItems = [
  { id: 'dashboard',          label: 'Dashboard',         icon: BarChart3,         group: 'operacao' },
  { id: 'onboarding',         label: 'Onboarding',         icon: ListChecks,        group: 'operacao' },
  { id: 'importacao',         label: 'Importacao',         icon: Upload,            group: 'operacao' },
  { id: 'visao-geral',        label: 'Visao Geral',        icon: WalletCards,       group: 'operacao' },
  { id: 'historico',          label: 'Historico',          icon: History,           group: 'operacao' },
  { id: 'cobrancas',          label: 'Cobranca Auto',      icon: Activity,          group: 'cobranca' },
  { id: 'central-cobranca',   label: 'Central Ops',        icon: Target,            group: 'cobranca' },
  { id: 'historico-cobranca', label: 'Central de Envios',  icon: History,           group: 'cobranca' },
  { id: 'pronto-envio',       label: 'Checklist Envio',    icon: BadgeCheck,        group: 'cobranca' },
  { id: 'automacoes',         label: 'Automacoes',         icon: SlidersHorizontal, group: 'config' },
  { id: 'integracoes',        label: 'Integracoes',        icon: Link2,             group: 'config' },
  { id: 'configuracoes',      label: 'Configuracoes',      icon: Cog,               group: 'config' },
  { id: 'planos',             label: 'Planos',             icon: BriefcaseBusiness, group: 'admin', billingAccess: true },
  { id: 'billing',            label: 'Billing',            icon: CreditCard,        group: 'admin', billingAccess: true },
  { id: 'admin-saas',         label: 'Admin SaaS',         icon: Settings2,         group: 'admin', adminOnly: true },
  { id: 'admin-ops',          label: 'Central Ops Admin',  icon: Zap,               group: 'admin', adminOnly: true },
];

const groupLabels = {
  operacao: 'Operacao',
  cobranca: 'Cobranca',
  config:   'Config.',
  admin:    'Admin',
};

const groups = ['operacao', 'cobranca', 'config', 'admin'];

function NavItem({ item, isActive, collapsed, onClick }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      title={item.label}
      onClick={onClick}
      className={`group relative flex h-[34px] w-full items-center gap-2.5 rounded-xl px-2.5 text-[13px] font-medium transition-colors
        ${isActive
          ? 'nav-active-brand'
          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
        }
        ${collapsed ? 'justify-center' : ''}
      `}
    >
      <Icon
        size={15}
        className={`flex-shrink-0 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  );
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  collapsed = false,
  onToggle,
  activeCompany,
  isSystemAdmin = false,
  canAccessBilling = false,
}) {
  return (
    <aside
      className={`sidebar-enterprise flex-shrink-0 border-r border-slate-800/70 bg-[#060d19]
        ${collapsed ? 'w-full lg:w-[60px]' : 'w-full lg:w-[240px]'}
      `}
    >
      <div className="flex flex-col lg:sticky lg:top-0 lg:h-screen">

        {/* ── Zone 1: Brand Header ── */}
        <div className={`flex h-[52px] flex-shrink-0 items-center border-b border-slate-800/70
          ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}
        `}>
          {collapsed ? (
            <BrandLogo size="sm" className="flex-shrink-0" />
          ) : (
            <BrandLockup variant="compact" />
          )}

          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={`hidden lg:flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg
              text-slate-600 transition-colors hover:bg-slate-800/80 hover:text-slate-300
              ${collapsed ? '' : 'ml-2'}
            `}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </div>

        {/* ── Zone 2: Navigation ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 space-y-3">
          {groups.map((group) => {
            const items = navItems.filter(
              (item) =>
                item.group === group &&
                (!item.adminOnly || isSystemAdmin) &&
                (!item.billingAccess || canAccessBilling),
            );
            if (!items.length) return null;

            return (
              <div key={group}>
                {!collapsed && (
                  <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                    {groupLabels[group]}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      isActive={activeTab === item.id}
                      collapsed={collapsed}
                      onClick={() => setActiveTab(item.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Zone 3: Footer ── */}
        <div className={`flex-shrink-0 border-t border-slate-800/70 py-3
          ${collapsed ? 'flex items-center justify-center px-2' : 'px-3'}
        `}>
          {collapsed ? (
            <div className="h-1.5 w-1.5 rounded-full bg-slate-800" />
          ) : (
            <>
              {activeCompany && (
                <div className="mb-2 flex min-w-0 items-center gap-1.5">
                  <Building2 size={10} className="flex-shrink-0 text-slate-700" />
                  <span className="truncate text-[11px] text-slate-600">
                    {activeCompany.isGlobal ? 'Todas as empresas' : (activeCompany.nome || 'Sem empresa')}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-x-3 text-[10px] text-slate-700">
                <button
                  type="button"
                  onClick={() => setActiveTab('privacy')}
                  className="transition-colors hover:text-slate-400"
                >
                  Privacidade
                </button>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('terms')}
                  className="transition-colors hover:text-slate-400"
                >
                  Termos
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </aside>
  );
}
