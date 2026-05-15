import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Building2, ClipboardList, CreditCard, FileClock, ShieldCheck, ShieldPlus, Users } from 'lucide-react';
import { PageShell, ScreenHeader } from '../components/ui/layout';
import { OperationalEventFeed, OperationalMetric, OperationalPanel } from '../components/ui/operational';
import {
  getAdminOverview,
  getCompaniesList,
  getRecentAuditLogs,
  updateCompanySubscriptionStatus,
} from '../services/adminSaasService';

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
      <PageShell width="wide">
        <ScreenHeader
          breadcrumb={['Admin', 'SaaS']}
          title="Operacao central do NC Finance"
          description="Painel administrativo global para empresas, assinaturas, uso e auditoria interna."
        />
        <div className="rounded-3xl border border-red-500/20 bg-slate-950/80 p-12 text-center">
          <AlertTriangle className="mx-auto mb-4 text-red-500" size={30} />
          <h2 className="text-xl font-semibold text-slate-50">Acesso restrito</h2>
          <p className="mt-2 text-sm text-slate-500">
            O painel Admin SaaS fica disponivel apenas para administradores globais do sistema.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="wide">
      <ScreenHeader
        breadcrumb={['Admin', 'SaaS']}
        title="Operacao central do NC Finance"
        description="Visao consolidada de empresas, assinaturas, uso e auditoria interna."
        status={(
          <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-300">
            Logado como <span className="font-semibold text-slate-50">{user?.email || 'admin'}</span>
          </div>
        )}
      />

      <div className="space-y-6">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OperationalMetric label="Total de empresas" value={overview?.totalCompanies || 0} hint="Base SaaS" tone="info" icon={Building2} />
          <OperationalMetric label="Total de usuarios" value={overview?.totalUsers || 0} hint="Usuarios ativos" tone="processing" icon={Users} />
          <OperationalMetric label="Empresas em trial" value={overview?.trialingCompanies || 0} hint="Conversao em aberto" tone="warning" icon={CreditCard} />
          <OperationalMetric label="Empresas bloqueadas" value={overview?.blockedCompanies || 0} hint="Requer revisao" tone="danger" icon={ShieldCheck} />
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <OperationalPanel title="Empresas SaaS" subtitle="Altere status de trial e assinatura sem gateway de pagamento nesta fase.">
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
                        <p className="font-semibold text-slate-50">{company.nome}</p>
                        <p className="text-xs text-slate-500">{company.cnpj || 'CNPJ nao informado'}</p>
                      </td>
                      <td className="py-3 capitalize text-slate-200">{company.plan_code}</td>
                      <td className="py-3">
                        <span className="rounded-full border border-slate-700 bg-slate-800/40 px-2.5 py-1 text-xs font-semibold text-slate-300">
                          {company.status}
                        </span>
                      </td>
                      <td className="py-3 text-slate-200">{company.users_count}</td>
                      <td className="py-3">
                        <div className="space-y-1 text-xs text-slate-300">
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
                              className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-60"
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
          </OperationalPanel>

          <OperationalPanel title="Leitura operacional" subtitle="Atalhos para acompanhar volume, auditoria e validacoes internas.">
            <div className="space-y-3">
              <OperationalMetric label="Importacoes" value={overview?.importations || 0} tone="info" />
              <OperationalMetric label="Cobrancas geradas" value={overview?.generatedCharges || 0} tone="success" />
              <OperationalMetric label="Automacoes executadas" value={overview?.automationsExecuted || 0} tone="processing" />
              <button
                type="button"
                onClick={() => onNavigate?.('production-checklist')}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/40 p-4 text-left transition hover:bg-slate-800/60"
              >
                <span className="flex items-center gap-3">
                  <ClipboardList size={16} className="text-slate-500" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-50">Checklist de Implantacao</span>
                    <span className="block text-xs text-slate-500">Acesso interno ao checklist de producao.</span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate?.('status-sistema')}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/40 p-4 text-left transition hover:bg-slate-800/60"
              >
                <span className="flex items-center gap-3">
                  <ShieldPlus size={16} className="text-slate-500" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-50">Status Tecnico</span>
                    <span className="block text-xs text-slate-500">Saude operacional e prontidao do ambiente.</span>
                  </span>
                </span>
              </button>
            </div>
          </OperationalPanel>
        </section>

        <OperationalPanel title="Logs recentes" subtitle={loading ? 'Atualizando auditoria...' : 'Eventos mais recentes da operacao SaaS.'}>
          <OperationalEventFeed
            items={(logs || []).map((log) => ({
              id: log.id,
              title: log.company_name || 'Empresa',
              detail: `${log.action}${log.entity ? ` - ${log.entity}${log.entity_id ? ` #${log.entity_id}` : ''}` : ''}`,
              badge: log.action || 'evento',
              tone: 'info',
              timestamp: log.created_at,
            }))}
            emptyIcon={FileClock}
            emptyTitle="Sem logs recentes"
            emptyDescription="Quando novos eventos administrativos forem registrados, eles aparecerao aqui."
            formatTimestamp={(value) =>
              value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-'
            }
          />
        </OperationalPanel>
      </div>
    </PageShell>
  );
}
