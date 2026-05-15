import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Brain, GitBranch, LayoutDashboard, Lock, Radio, Rocket, Users } from 'lucide-react';
import PlanLimitNotice from '../components/PlanLimitNotice';
import AnalyticsFiltersBar from '../components/analytics/AnalyticsFiltersBar';
import AnalyticsMetricGrid from '../components/analytics/AnalyticsMetricGrid';
import AnalyticsTimelineChart from '../components/analytics/AnalyticsTimelineChart';
import OperationalAiPanel from '../components/analytics/OperationalAiPanel';
import ExecutiveDashboard from '../components/analytics/ExecutiveDashboard';
import RealtimeMonitorPanel from '../components/analytics/RealtimeMonitorPanel';
import EventTimelinePanel from '../components/analytics/EventTimelinePanel';
import CollectionIntelligencePanel from '../components/analytics/CollectionIntelligencePanel';
import CustomerProfileCard from '../components/analytics/CustomerProfileCard';
import EnterpriseAuditPanel from '../components/analytics/EnterpriseAuditPanel';
import GoLiveDiagnosticPanel from '../components/analytics/GoLiveDiagnosticPanel';
import { checkFeatureAccess } from '../services/subscriptionService';
import { getCompanyAnalytics, getOperationalAnalytics } from '../services/analyticsService';
import { getUsageSummary } from '../services/usageService';
import { getOperationalInsights } from '../services/aiOperationalService';
import { formatCurrencyBRL } from '../utils/format';

function SummaryPill({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-50">{value}</p>
    </div>
  );
}

const TABS = [
  { id: 'executive',    label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'realtime',     label: 'Monitor Live',     icon: Radio },
  { id: 'events',       label: 'Event Bus',        icon: GitBranch },
  { id: 'collection',   label: 'Cobrança IA',      icon: Brain },
  { id: 'customers',    label: 'Clientes',         icon: Users },
  { id: 'audit',        label: 'Auditoria',        icon: Lock },
  { id: 'golive',       label: 'Go-Live',          icon: Rocket },
  { id: 'operational',  label: 'Analytics',        icon: BarChart3 },
];

export default function AnalyticsScreen({ companyId, companyName, onToast }) {
  const [activeTab, setActiveTab] = useState('executive');
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [operational, setOperational] = useState(null);
  const [advancedLocked, setAdvancedLocked] = useState(false);
  const [usageSummary, setUsageSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState({ insights: [], risk_score: '', suggested_tones: [] });
  const [filters, setFilters] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    return { startDate: start, endDate: end };
  });

  const usageCards = useMemo(
    () =>
      [
        usageSummary?.metrics?.charges_month,
        usageSummary?.metrics?.imports_month,
        usageSummary?.metrics?.automations_month,
        usageSummary?.metrics?.users_count,
        usageSummary?.metrics?.integrations_count,
      ].filter(Boolean),
    [usageSummary]
  );

  const load = useCallback(async () => {
    if (!companyId) {
      setAnalytics(null);
      setOperational(null);
      setUsageSummary(null);
      setAiInsights({ insights: [], risk_score: '', suggested_tones: [] });
      return;
    }

    setLoading(true);
    try {
      const [analyticsResponse, usageResponse, operationalResponse] = await Promise.all([
        getCompanyAnalytics(companyId),
        getUsageSummary(companyId),
        getOperationalAnalytics(companyId, filters),
      ]);

      setAnalytics(analyticsResponse);
      setUsageSummary(usageResponse);
      setOperational(operationalResponse);

      setAiLoading(true);
      try {
        const aiResponse = await getOperationalInsights(companyId, {
          summary: operationalResponse?.summary || {},
          aiContext: operationalResponse?.aiContext || {},
          usageByCompany: operationalResponse?.usageByCompany || [],
          timeline: operationalResponse?.timeline || [],
        });
        setAiInsights(aiResponse || { insights: [], risk_score: '', suggested_tones: [] });
      } catch (error) {
        setAiInsights({ insights: [], risk_score: '', suggested_tones: [] });
        onToast?.('aviso', error.message || 'Nao foi possivel gerar insights de IA agora.');
      } finally {
        setAiLoading(false);
      }
    } catch (error) {
      setAnalytics(null);
      setOperational(null);
      setUsageSummary(null);
      onToast?.('erro', error.message || 'Falha ao carregar analytics.');
    } finally {
      setLoading(false);
    }
  }, [companyId, filters, onToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    const loadAccess = async () => {
      if (!companyId) {
        if (alive) setAdvancedLocked(false);
        return;
      }
      try {
        const access = await checkFeatureAccess(companyId, 'analytics');
        if (alive) setAdvancedLocked(!access.allowed);
      } catch {
        if (alive) setAdvancedLocked(false);
      }
    };
    loadAccess();
    return () => {
      alive = false;
    };
  }, [companyId]);

  if (!companyId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-12 text-center shadow-soft">
        <BarChart3 className="mx-auto mb-4 text-slate-300" size={30} />
        <h2 className="text-xl font-semibold text-slate-50">Selecione uma empresa para abrir o analytics</h2>
        <p className="mt-2 text-sm text-slate-500">As leituras operacionais e comerciais sao calculadas por company_id.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {advancedLocked ? (
        <PlanLimitNotice
          type="info"
          title="Analytics avancado disponivel nos planos Pro e Business"
          message="Voce continua vendo metricas essenciais. Leituras executivas mais profundas podem ser liberadas conforme o plano."
        />
      ) : null}

      {usageSummary?.highestAlert ? (
        <PlanLimitNotice
          type={usageSummary.highestAlert.level === 'warning' ? 'warning' : 'danger'}
          title={usageSummary.highestAlert.title}
          message={usageSummary.highestAlert.message}
        />
      ) : null}

      <section className="surface-card rounded-2xl p-7 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Analytics operacional e comercial</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-50">Leituras executivas de {companyName || 'uma empresa ativa'}</h2>
            <p className="mt-2 text-sm text-slate-400">
              Recovery rate, inadimplencia, uso por empresa, performance de automacoes e tracking real do WhatsApp.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-200">
            <Activity size={14} />
            {loading ? 'Atualizando leitura operacional...' : operational?.health?.message || 'Analytics pronto'}
          </div>
        </div>
      </section>

      {/* Tab navigation — scrollável no mobile */}
      <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
        <div className="flex gap-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-1 w-max min-w-full sm:w-fit sm:min-w-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Icon size={13} />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'executive' && <ExecutiveDashboard companyId={companyId} />}

      {activeTab === 'realtime' && <RealtimeMonitorPanel companyId={companyId} />}

      {activeTab === 'events' && <EventTimelinePanel companyId={companyId} />}

      {activeTab === 'collection' && <CollectionIntelligencePanel companyId={companyId} />}

      {activeTab === 'customers' && <CustomerProfileCard companyId={companyId} />}

      {activeTab === 'audit' && <EnterpriseAuditPanel companyId={companyId} />}

      {activeTab === 'golive' && <GoLiveDiagnosticPanel companyId={companyId} />}

      {activeTab === 'operational' && <>
      <AnalyticsFiltersBar filters={filters} onChange={setFilters} onRefresh={load} loading={loading} />

      <AnalyticsMetricGrid cards={operational?.cards || []} />

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="surface-card rounded-2xl p-6 shadow-soft">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-50">Evolucao mensal</h3>
            <p className="text-sm text-slate-400">Linha do tempo de importacoes, envios e atividade financeira da empresa.</p>
          </div>
          <AnalyticsTimelineChart items={operational?.timeline || []} />
        </article>

        <article className="surface-card rounded-2xl p-6 shadow-soft">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-50">Saude operacional</h3>
            <p className="text-sm text-slate-400">KPIs rapidos para acompanhar execucao real, leitura e risco operacional.</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <SummaryPill label="Valor recuperado" value={formatCurrencyBRL(operational?.summary?.totalRecoveredValue || 0)} />
            <SummaryPill label="Valor vencido" value={formatCurrencyBRL(operational?.summary?.overdueValue || 0)} />
            <SummaryPill label="Taxa de leitura" value={`${operational?.summary?.totalWhatsapp ? Math.round(((operational.summary.readCount || 0) / Math.max(operational.summary.totalWhatsapp, 1)) * 100) : 0}%`} />
            <SummaryPill label="Tempo medio ate leitura" value={`${operational?.summary?.avgReadMinutes || 0} min`} />
          </div>
        </article>
      </section>

      <section className="surface-card rounded-2xl p-6 shadow-soft">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-slate-50">Uso do plano no ciclo atual</h3>
          <p className="text-sm text-slate-400">Medição multi-tenant por empresa para importações, cobranças, automações, usuários e integrações.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {usageCards.map((metric) => (
            <article key={metric.key} className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-50">
                    {metric.used} / {metric.limit || 'sem limite'}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-950/60 px-3 py-2 text-right shadow-soft">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">% consumido</p>
                  <p className="mt-1 text-lg font-semibold text-slate-50">{metric.percent}%</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    metric.percent >= 100 ? 'bg-red-500' : metric.percent >= 95 ? 'bg-orange-500' : metric.percent >= 80 ? 'bg-amber-500' : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                  }`}
                  style={{ width: `${Math.min(metric.percent, 100)}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>Restante: {metric.remaining}</span>
                <span>Projecao: {metric.projected}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <OperationalAiPanel
        loading={aiLoading}
        insights={aiInsights?.insights || []}
        riskScore={aiInsights?.risk_score || ''}
        tones={aiInsights?.suggested_tones || []}
      />

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <article className="surface-card rounded-2xl p-6 shadow-soft">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-50">Resumo financeiro consolidado</h3>
            <p className="text-sm text-slate-400">Leitura executiva da carteira e da recuperação no período.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SummaryPill label="Em aberto" value={formatCurrencyBRL(analytics?.summary?.totalOpen || 0)} />
            <SummaryPill label="Vencido" value={formatCurrencyBRL(analytics?.summary?.totalOverdue || 0)} />
            <SummaryPill label="Recebido" value={formatCurrencyBRL(analytics?.summary?.totalReceived || 0)} />
            <SummaryPill label="Importado no mes" value={formatCurrencyBRL(analytics?.summary?.totalImportedMonth || 0)} />
          </div>
        </article>

        <article className="surface-card rounded-2xl p-6 shadow-soft">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-50">Base operacional</h3>
            <p className="text-sm text-slate-400">Volume ativo de empresas, usuários e envios com leitura comercial.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SummaryPill label="Empresas ativas" value={analytics?.activeCompanies || 0} />
            <SummaryPill label="Usuarios ativos" value={analytics?.activeUsers || 0} />
            <SummaryPill label="Cobrancas enviadas" value={analytics?.billing?.sentCharges || 0} />
            <SummaryPill label="Falhas operacionais" value={analytics?.billing?.errors || 0} />
          </div>
        </article>
      </section>
      </>}
    </div>
  );
}
