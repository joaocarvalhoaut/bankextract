import { useEffect, useState } from 'react';
import {
  Activity,
  AreaChart,
  BarChart3,
  Bell,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Cog,
  CreditCard,
  FileSearch,
  History,
  LifeBuoy,
  Link2,
  ListChecks,
  PanelLeftOpen,
  Settings2,
  Shield,
  Sparkles,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Upload,
  WalletCards,
} from 'lucide-react';
import { getPlanMeta, getUpgradeRecommendation, normalizePlanId } from '../constants/plans';
import SubscriptionBadge from './SubscriptionBadge';
import { getUsageLimits } from '../services/subscriptionService';
import { formatCurrencyBRL } from '../utils/format';

const items = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, group: 'operacao' },
  { id: 'onboarding', label: 'Onboarding', icon: ListChecks, group: 'operacao' },
  { id: 'importacao', label: 'Importacao', icon: Upload, group: 'operacao' },
  { id: 'visao-geral', label: 'Visao Geral', icon: WalletCards, group: 'operacao' },
  { id: 'historico', label: 'Historico', icon: History, group: 'operacao' },
  { id: 'analytics', label: 'Analytics', icon: AreaChart, group: 'operacao' },
  { id: 'notifications', label: 'Notificacoes', icon: Bell, group: 'operacao' },
  { id: 'audit', label: 'Auditoria', icon: ClipboardList, group: 'operacao' },
  { id: 'help', label: 'Ajuda', icon: LifeBuoy, group: 'operacao' },
  { id: 'production-checklist', label: 'Checklist Producao', icon: ClipboardList, group: 'operacao' },
  { id: 'cobrancas', label: 'Cobranca Automatica', icon: Activity, group: 'cobranca' },
  { id: 'central-cobranca', label: 'Central Operacional', icon: Target, group: 'cobranca' },
  { id: 'historico-cobranca', label: 'Auditoria de Cobrancas', icon: History, group: 'cobranca' },
  { id: 'inconsistencias', label: 'Auditoria de Dados', icon: FileSearch, group: 'cobranca' },
  { id: 'pronto-envio', label: 'Checklist Pre-Envio', icon: BadgeCheck, group: 'cobranca' },
  { id: 'automacoes', label: 'Automacoes', icon: SlidersHorizontal, group: 'configuracoes' },
  { id: 'integracoes', label: 'Integracoes', icon: Link2, group: 'configuracoes' },
  { id: 'configuracoes', label: 'Configuracoes', icon: Cog, group: 'configuracoes' },
  { id: 'status-sistema', label: 'Status do Sistema', icon: ShieldCheck, group: 'admin' },
  { id: 'planos', label: 'Planos', icon: BriefcaseBusiness, group: 'admin' },
  { id: 'billing', label: 'Billing', icon: CreditCard, group: 'admin' },
  { id: 'admin-saas', label: 'Admin SaaS', icon: Settings2, group: 'admin', adminOnly: true },
];

const groupLabels = {
  operacao: 'Operacao',
  cobranca: 'Cobranca',
  configuracoes: 'Configuracoes',
  admin: 'Admin',
};

function NavGroup({ label, badge, children }) {
  return (
    <div className="mb-1">
      <div className="mb-1 ml-3 flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        {badge ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-700">
            {badge}
          </span>
        ) : null}
      </div>
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
  billingExecutionMode = 'simulate',
  isSystemAdmin = false,
  onOpenCompanyModal,
  onOpenPlans,
}) {
  const groups = ['operacao', 'cobranca', 'configuracoes', 'admin'];
  const [usageSummary, setUsageSummary] = useState(null);

  useEffect(() => {
    let alive = true;

    const loadUsage = async () => {
      if (!activeCompanyId || activeCompany?.isGlobal) {
        if (alive) setUsageSummary(null);
        return;
      }

      try {
        const data = await getUsageLimits(activeCompanyId);
        if (alive) setUsageSummary(data);
      } catch {
        if (alive) setUsageSummary(null);
      }
    };

    loadUsage();
    return () => {
      alive = false;
    };
  }, [activeCompanyId, activeCompany?.isGlobal]);

  const usagePercent = Number(usageSummary?.usage_percent || 0);
  const planId = normalizePlanId(usageSummary?.plan);
  const planMeta = getPlanMeta(planId);
  const usedRealSends = Number(usageSummary?.used_real_sends || usageSummary?.usage?.realSends || 0);
  const monthlyLimit = Number(usageSummary?.monthly_send_limit || usageSummary?.currentPlan?.monthly_send_limit || 0);
  const limitReached = Boolean(usageSummary?.blocked_by_limit || usageSummary?.remainingRealSends <= 0);
  const highUsage = !limitReached && usagePercent >= 80;
  const upgrade = getUpgradeRecommendation(planId, {
    monthly_send_limit: monthlyLimit,
    extra_send_credits: Number(usageSummary?.extra_send_credits || 0),
    used_real_sends: usedRealSends,
  });

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
                <p className="text-sm font-bold tracking-tight text-slate-950">BankExtract Pro</p>
                <p className="text-[11px] leading-tight text-slate-500">Gestao Financeira & Cobranca</p>
              </div>
              <div className="ml-auto flex h-5 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold tracking-[0.18em] text-emerald-700">
                B2B
              </div>
            </div>

            <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] ${
              billingExecutionMode === 'real'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}>
              <Shield size={11} className={billingExecutionMode === 'real' ? 'text-emerald-600' : 'text-amber-600'} />
              {billingExecutionMode === 'real' ? 'Envio real ativo' : 'Simulacao ativa'}
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
                  className="mt-2.5 w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-600"
                >
                  + Nova empresa
                </button>
              ) : null}
            </div>

            {usageSummary ? (
              <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Uso mensal</p>
                  {planMeta ? (
                    <SubscriptionBadge planId={planId} size="xs" />
                  ) : null}
                </div>
                <div className="mb-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">{usedRealSends} de {monthlyLimit > 0 ? monthlyLimit : '∞'} envios</span>
                  <span className={limitReached ? 'font-bold text-red-600' : highUsage ? 'font-bold text-amber-600' : 'text-slate-500'}>
                    {limitReached ? 'Limite atingido' : `${Math.round(usagePercent)}%`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${limitReached ? 'bg-red-500' : highUsage ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  />
                </div>
                {upgrade?.message ? (
                  <button
                    type="button"
                    onClick={onOpenPlans}
                    className="mt-2 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-blue-500 px-2 py-1.5 text-[10px] font-bold text-white"
                  >
                    <Sparkles size={9} className="mr-1 inline" />
                    {upgrade.message}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {groups.map((group) => {
          const groupItems = items.filter(
            (item) => item.group === group && (!item.adminOnly || isSystemAdmin)
          );
          if (!groupItems.length) return null;

          return (
            <NavGroup key={group} label={groupLabels[group]}>
              {groupItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon size={16} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                    {item.label}
                  </button>
                );
              })}
            </NavGroup>
          );
        })}
      </div>
    </aside>
  );
}
