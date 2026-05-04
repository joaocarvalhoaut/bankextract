import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Cog,
  CreditCard,
  History,
  Link2,
  ListChecks,
  PanelLeftOpen,
  Rocket,
  Settings2,
  Sparkles,
  ShieldCheck,
  Upload,
  WalletCards,
} from 'lucide-react';
import { formatCurrencyBRL } from '../utils/format';

const items = [
  { id: 'landing', label: 'Landing Page', icon: Rocket, group: 'marketing' },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, group: 'core' },
  { id: 'onboarding', label: 'Onboarding', icon: ListChecks, group: 'core' },
  { id: 'importacao', label: 'Importacao', icon: Upload, group: 'core' },
  { id: 'visao-geral', label: 'Visao Geral', icon: WalletCards, group: 'core' },
  { id: 'historico', label: 'Historico', icon: History, group: 'core' },
  { id: 'cobrancas', label: 'Cobrancas', icon: Sparkles, group: 'core' },
  { id: 'automacoes', label: 'Automacoes', icon: Settings2, group: 'ops' },
  { id: 'integracoes', label: 'Integracoes', icon: Link2, group: 'ops' },
  { id: 'configuracoes', label: 'Configuracoes', icon: Cog, group: 'ops' },
  { id: 'status-sistema', label: 'Status do Sistema', icon: ShieldCheck, group: 'admin' },
  { id: 'planos', label: 'Planos', icon: BriefcaseBusiness, group: 'admin' },
  { id: 'billing', label: 'Billing', icon: CreditCard, group: 'admin' },
];

const groupLabels = {
  marketing: 'Marketing',
  core: 'Operacao',
  ops: 'Config',
  admin: 'Admin',
};

function NavGroup({ label, children }) {
  return (
    <div className="mb-1">
      <p className="mb-1 ml-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      {children}
    </div>
  );
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  activeCompanyId,
  setActiveCompanyId,
  companies,
  activeCompany,
  stats,
  isSystemAdmin = false,
  onOpenCompanyModal,
}) {
  const groups = ['marketing', 'core', 'ops', 'admin'];

  return (
    <aside className="w-full border-r border-slate-200 bg-white lg:min-h-screen lg:w-[286px] lg:px-3 lg:py-5">
      <div className="space-y-4 lg:sticky lg:top-0">
        <div className="hero-mesh overflow-hidden rounded-[26px] border border-slate-200 shadow-lifted">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-900/35">
                <PanelLeftOpen size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold tracking-tight text-slate-950">BankExtract</p>
                <p className="text-[11px] leading-tight text-slate-500">SaaS financeiro premium</p>
              </div>
              <div className="ml-auto flex h-5 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold tracking-[0.18em] text-emerald-700">
                B2B
              </div>
            </div>

            <div className="glass mt-4 rounded-2xl p-3">
              <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Building2 size={10} />
                Empresa ativa
              </label>
              <select
                value={activeCompanyId}
                onChange={(e) => setActiveCompanyId(e.target.value)}
                className="input-premium w-full rounded-xl border border-white/10 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 outline-none ring-emerald-500 focus:ring-2"
              >
                {!activeCompanyId ? <option value="">Selecione uma empresa</option> : null}
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.nome}
                  </option>
                ))}
              </select>

              <div className="mt-2 text-[11px] text-slate-500">
                {activeCompany?.isGlobal ? (
                  <span className="rounded-lg bg-blue-50 px-2 py-1 font-semibold text-blue-700">Modo global ativo</span>
                ) : (
                  <span className="font-mono text-slate-600">{activeCompany?.cnpj || activeCompany?.inviteCode || 'Sem dados'}</span>
                )}
              </div>

              {isSystemAdmin ? (
                <button
                  type="button"
                  onClick={() => onOpenCompanyModal?.('criar')}
                  className="mt-2.5 w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-600 active:scale-[0.98]"
                >
                  + Nova empresa
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <nav className="rounded-[24px] border border-slate-200 bg-white p-2 shadow-soft">
          {groups.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            return (
              <NavGroup key={group} label={groupLabels[group]}>
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`${
                        active ? 'nav-item-active bg-emerald-50 text-emerald-700 shadow-soft' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      } relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all duration-150`}
                    >
                      <Icon size={15} className={active ? 'text-emerald-600' : 'text-slate-400'} />
                      {item.label}
                    </button>
                  );
                })}
              </NavGroup>
            );
          })}
        </nav>

        <div className="accent-bar overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Resumo</p>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">A vencer</p>
              <p className="text-sm font-bold text-slate-900">{formatCurrencyBRL(stats?.aVencer || 0)}</p>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Vencido</p>
              <p className="text-sm font-bold text-red-600">{formatCurrencyBRL(stats?.vencidos || 0)}</p>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Sem telefone</p>
              <p className="text-sm font-bold text-amber-600">{stats?.semTelefone || 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              Operacao protegida por company_id, batch_id e auditoria ativa.
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
