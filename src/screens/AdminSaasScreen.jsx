import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Building2, ClipboardList, CreditCard, FileClock, ShieldCheck, ShieldPlus, Users } from 'lucide-react';
import {
  getAdminOverview,
  getCompaniesList,
  getRecentAuditLogs,
  updateCompanySubscriptionStatus,
} from '../services/adminSaasService';

function AdminCard({ label, value, icon: Icon, tone = 'slate' }) {
  const toneClass = {
    slate: 'bg-slate-50 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  };

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${toneClass[tone] || toneClass.slate}`}>
        <Icon size={18} />
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
    </article>
  );
}

export default function AdminSaasScreen({ user, isSystemAdminUser = false, onToast, onNavigate }) {
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [logs, setLogs] = useState([]);
  const [updatingCompanyId, setUpdatingCompanyId] = useState('');

  const loadAll = useCallback(async () => {
    if (!isSystemAdminUser) return;

    setLoading(true);
    try {
      const [overviewData, companiesData, recentLogs] = await Promise.all([
        getAdminOverview(),
        getCompaniesList(),
        getRecentAuditLogs(),
      ]);
      setOverview(overviewData);
      setCompanies(companiesData);
      setLogs(recentLogs);
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao carregar o painel administrativo.');
    } finally {
      setLoading(false);
    }
  }, [isSystemAdminUser, onToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleStatusChange = async (companyId, nextStatus) => {
    setUpdatingCompanyId(companyId);
    try {
      await updateCompanySubscriptionStatus(companyId, nextStatus);
      await loadAll();
      onToast?.('sucesso', 'Status comercial da empresa atualizado.');
    } catch (error) {
      onToast?.('erro', error.message || 'Nao foi possivel atualizar a assinatura.');
    } finally {
      setUpdatingCompanyId('');
    }
  };

  if (!isSystemAdminUser) {
    return (
      <div className="rounded-[32px] border border-red-200 bg-white p-12 text-center shadow-soft">
        <AlertTriangle className="mx-auto mb-4 text-red-500" size={30} />
        <h2 className="text-xl font-semibold text-slate-900">Acesso restrito</h2>
        <p className="mt-2 text-sm text-slate-500">
          O painel Admin SaaS fica disponivel apenas para administradores globais do sistema.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Admin SaaS</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Operacao central do BankExtract</h2>
            <p className="mt-2 text-sm text-slate-500">
              Visao consolidada de empresas, assinaturas, uso e auditoria interna.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Logado como <span className="font-semibold text-slate-900">{user?.email || 'admin'}</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminCard label="Total de empresas" value={overview?.totalCompanies || 0} icon={Building2} />
        <AdminCard label="Total de usuarios" value={overview?.totalUsers || 0} icon={Users} tone="blue" />
        <AdminCard label="Empresas em trial" value={overview?.trialingCompanies || 0} icon={CreditCard} tone="amber" />
        <AdminCard label="Empresas bloqueadas" value={overview?.blockedCompanies || 0} icon={ShieldCheck} tone="red" />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-900">Empresas SaaS</h3>
            <p className="text-sm text-slate-500">Altere status de trial e assinatura sem gateway de pagamento nesta fase.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <th className="pb-3">Empresa</th>
                  <th className="pb-3">Plano</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Usuarios</th>
                  <th className="pb-3">Uso atual</th>
                  <th className="pb-3">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td className="py-3">
                      <p className="font-semibold text-slate-900">{company.nome}</p>
                      <p className="text-xs text-slate-500">{company.cnpj || 'CNPJ nao informado'}</p>
                    </td>
                    <td className="py-3 capitalize text-slate-700">{company.plan_code}</td>
                    <td className="py-3">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {company.status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-700">{company.users_count}</td>
                    <td className="py-3">
                      <div className="space-y-1 text-xs text-slate-600">
                        <p>Cobrancas: {company.usage_summary?.metrics?.charges_month?.used || 0}/{company.usage_summary?.metrics?.charges_month?.limit || 0}</p>
                        <p>Importacoes: {company.usage_summary?.metrics?.imports_month?.used || 0}/{company.usage_summary?.metrics?.imports_month?.limit || 0}</p>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        {['active', 'trialing', 'canceled'].map((status) => (
                          <button
                            key={status}
                            type="button"
                            disabled={updatingCompanyId === company.id}
                            onClick={() => handleStatusChange(company.id, status)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-900">Leitura operacional</h3>
            <p className="text-sm text-slate-500">Atalhos para acompanhar volume, auditoria e validacoes internas.</p>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Importacoes</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{overview?.importations || 0}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cobrancas geradas</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{overview?.generatedCharges || 0}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Automacoes executadas</p>
              <p className="mt-2 text-2xl font-bold text-blue-700">{overview?.automationsExecuted || 0}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.('production-checklist')}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:bg-slate-100"
            >
              <span className="flex items-center gap-3">
                <ClipboardList size={16} className="text-slate-500" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Checklist de Implantacao</span>
                  <span className="block text-xs text-slate-500">Acesso interno ao checklist de producao.</span>
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('status-sistema')}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:bg-slate-100"
            >
              <span className="flex items-center gap-3">
                <ShieldPlus size={16} className="text-slate-500" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Status Tecnico</span>
                  <span className="block text-xs text-slate-500">Saude operacional e prontidao do ambiente.</span>
                </span>
              </span>
            </button>
          </div>
        </article>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-2">
          <FileClock size={18} className="text-slate-500" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Logs recentes</h3>
            <p className="text-sm text-slate-500">{loading ? 'Atualizando auditoria...' : 'Eventos mais recentes da operacao SaaS.'}</p>
          </div>
        </div>

        <div className="space-y-3">
          {(logs || []).map((log) => (
            <div key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-slate-900">
                  {log.company_name} <span className="font-normal text-slate-500">• {log.action}</span>
                </p>
                <p className="text-xs text-slate-500">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(log.created_at))}</p>
              </div>
              <p className="mt-1 text-xs text-slate-500">{log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}</p>
            </div>
          ))}
          {!logs?.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              Nenhum log recente encontrado.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
