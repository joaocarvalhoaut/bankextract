import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
  Send,
  ServerCrash,
  Settings2,
  ShieldCheck,
  Siren,
  XCircle,
  Zap,
} from 'lucide-react';
import { HEALTH_STATUS, healthStatusMeta, runHealthChecks } from '../services/healthService';
import {
  getOperationalCompanyDrilldown,
  getOperationalMetrics,
  toggleAutomationActive,
} from '../services/operationalMetricsService';
import {
  acknowledgeOperationalAlert,
  clearOperationalAlertAcknowledgement,
  getOperationalAlerts,
} from '../services/operationalAlertsService';

const PERIOD_OPTIONS = [
  { value: 7, label: '7 dias' },
  { value: 14, label: '14 dias' },
  { value: 30, label: '30 dias' },
  { value: 60, label: '60 dias' },
];

const TABS = [
  { id: 'overview', label: 'Visao geral', icon: BarChart3 },
  { id: 'health', label: 'Health', icon: Activity },
  { id: 'automations', label: 'Automacoes', icon: Settings2 },
  { id: 'alerts', label: 'Alertas', icon: Siren },
];

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (!value) return '0ms';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

function KpiCard({ label, value, sub, icon: Icon, tone = 'default', loading = false }) {
  const tones = {
    default: { bg: 'bg-slate-800/40', icon: 'bg-slate-700 text-slate-300', bar: '' },
    emerald: { bg: 'bg-emerald-500/5', icon: 'bg-emerald-500/15 text-emerald-400', bar: 'bg-gradient-to-r from-emerald-400 to-emerald-600' },
    blue: { bg: 'bg-blue-500/5', icon: 'bg-blue-500/15 text-blue-400', bar: 'bg-gradient-to-r from-blue-400 to-blue-600' },
    amber: { bg: 'bg-amber-500/5', icon: 'bg-amber-500/15 text-amber-400', bar: 'bg-gradient-to-r from-amber-400 to-orange-500' },
    red: { bg: 'bg-red-500/5', icon: 'bg-red-500/15 text-red-400', bar: 'bg-gradient-to-r from-red-400 to-red-600' },
    violet: { bg: 'bg-violet-500/5', icon: 'bg-violet-500/15 text-violet-400', bar: 'bg-gradient-to-r from-violet-400 to-violet-600' },
  };
  const currentTone = tones[tone] || tones.default;

  return (
    <article className={`relative overflow-hidden rounded-2xl border border-slate-700 ${currentTone.bg} p-5 shadow-soft`}>
      {currentTone.bar ? <div className={`absolute inset-x-0 top-0 h-0.5 ${currentTone.bar}`} /> : null}
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${currentTone.icon}`}>
        <Icon size={18} />
      </div>
      {loading ? (
        <>
          <div className="skeleton mb-2 h-3 w-20 rounded-full" />
          <div className="skeleton h-8 w-24 rounded-full" />
        </>
      ) : (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-1.5 text-3xl font-bold text-slate-50">{value}</p>
          {sub ? <p className="mt-1 text-xs text-slate-400">{sub}</p> : null}
        </>
      )}
    </article>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 py-12 text-center">
      <h3 className="text-base font-semibold text-slate-200">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}

function HealthCheckRow({ check }) {
  const meta = healthStatusMeta[check.status] || healthStatusMeta[HEALTH_STATUS.UNKNOWN];
  return (
    <div className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3.5 ${meta.bg}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100">{check.label}</p>
        <p className="mt-0.5 text-xs text-slate-400">{check.detail}</p>
        {check.latency_ms != null ? <p className="mt-1 text-[10px] text-slate-500">{check.latency_ms}ms</p> : null}
      </div>
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${meta.bg} ${meta.color}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    </div>
  );
}

function AutomationRow({ config, onToggle, togglingId, onSelect }) {
  const isToggling = togglingId === config.empresa_id;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3.5">
      <button
        type="button"
        onClick={() => onSelect(config.empresa_id)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-sm font-semibold text-slate-100">{config.empresa_nome}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Horario {config.hora_envio} • Intervalo {config.intervalo_dias}d • Limite {config.limite_cobrancas_por_titulo}x
        </p>
      </button>
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${config.ativo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
          {config.ativo ? 'Ativo' : 'Pausado'}
        </span>
        <button
          type="button"
          disabled={isToggling}
          onClick={() => onToggle(config.empresa_id, !config.ativo)}
          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            config.ativo
              ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
          }`}
        >
          {isToggling ? '...' : config.ativo ? 'Pausar' : 'Ativar'}
        </button>
      </div>
    </div>
  );
}

function AlertRow({ alert, onAcknowledgeToggle }) {
  const severityMeta = {
    critical: 'border-red-500/20 bg-red-500/10 text-red-200',
    warning: 'border-amber-500/20 bg-amber-500/10 text-amber-100',
    info: 'border-blue-500/20 bg-blue-500/10 text-blue-100',
    resolved: 'border-slate-700 bg-slate-800/40 text-slate-300',
  };

  return (
    <div className={`rounded-2xl border px-4 py-4 ${severityMeta[alert.state === 'resolved' ? 'resolved' : alert.severity] || severityMeta.info}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{alert.title}</p>
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]">
              {alert.state === 'resolved' ? 'resolved' : alert.state === 'acknowledged' ? 'ack' : alert.severity}
            </span>
            {alert.companyId ? (
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-medium">
                {alert.companyId}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs opacity-90">{alert.detail}</p>
          <p className="mt-2 text-[11px] opacity-70">
            {alert.state === 'resolved'
              ? `Resolvido em ${new Date(alert.resolvedAt).toLocaleString('pt-BR')}`
              : `Ultimo sinal em ${new Date(alert.lastSeenAt || alert.createdAt).toLocaleString('pt-BR')}`}
          </p>
        </div>
        {alert.state !== 'resolved' ? (
          <button
            type="button"
            onClick={() => onAcknowledgeToggle(alert)}
            className="rounded-xl border border-white/10 bg-black/10 px-3 py-1.5 text-xs font-semibold text-white/90 transition hover:bg-black/20"
          >
            {alert.acknowledgedAt ? 'Remover ack' : 'Acknowledge'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, action, children }) {
  return (
    <section className="text-crisp rounded-2xl border border-slate-700 bg-slate-900/60 p-6 shadow-soft">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-50">{title}</h3>
          {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function AdminOpsScreen({ isSystemAdminUser = false, onToast }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState(30);
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [companyPage, setCompanyPage] = useState(1);
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companyDrilldown, setCompanyDrilldown] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingDrilldown, setLoadingDrilldown] = useState(false);
  const [togglingId, setTogglingId] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const autoRefreshRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMetrics = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoadingMetrics(true);
    try {
      const data = await getOperationalMetrics({ days: period });
      if (!mountedRef.current) return;
      setMetrics(data);
      setLastRefresh(new Date());
      if (data.errors?.length) {
        console.warn('[AdminOpsScreen] partial metric errors', data.errors);
      }
    } catch (error) {
      onToast?.('erro', error?.message || 'Falha ao carregar metricas operacionais.');
    } finally {
      if (mountedRef.current) setLoadingMetrics(false);
    }
  }, [onToast, period]);

  const loadHealth = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoadingHealth(true);
    try {
      const data = await runHealthChecks();
      if (!mountedRef.current) return;
      setHealth(data);
    } catch (error) {
      onToast?.('erro', error?.message || 'Falha ao executar os health checks.');
    } finally {
      if (mountedRef.current) setLoadingHealth(false);
    }
  }, [onToast]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadMetrics(), loadHealth()]);
  }, [loadHealth, loadMetrics]);

  useEffect(() => {
    if (!isSystemAdminUser) return;
    loadAll();
  }, [isSystemAdminUser, loadAll]);

  useEffect(() => {
    if (!isSystemAdminUser || !autoRefresh) return undefined;
    autoRefreshRef.current = window.setInterval(() => {
      if (mountedRef.current) {
        loadAll();
      }
    }, 60_000);
    return () => window.clearInterval(autoRefreshRef.current);
  }, [autoRefresh, isSystemAdminUser, loadAll]);

  useEffect(() => {
    setAlerts(getOperationalAlerts(metrics, health));
  }, [health, metrics]);

  useEffect(() => {
    if (!selectedCompanyId) {
      setCompanyDrilldown(null);
      return;
    }

    let active = true;
    setLoadingDrilldown(true);
    getOperationalCompanyDrilldown(selectedCompanyId)
      .then((data) => {
        if (active) setCompanyDrilldown(data);
      })
      .catch((error) => {
        if (active) onToast?.('erro', error?.message || 'Falha ao carregar o drill-down da empresa.');
      })
      .finally(() => {
        if (active) setLoadingDrilldown(false);
      });

    return () => {
      active = false;
    };
  }, [onToast, selectedCompanyId]);

  const companyRows = useMemo(() => {
    const tenantRows = metrics?.tenants?.companies || [];
    const whatsappMap = new Map((metrics?.whatsapp?.byCompany || []).map((row) => [row.empresa_id, row]));
    const dispatchMap = new Map();

    for (const item of metrics?.dispatches?.recent || []) {
      const current = dispatchMap.get(item.company_id) || { failed: 0, processing: 0, retries: 0 };
      if (['failed', 'error', 'timeout'].includes(String(item.status || '').toLowerCase())) current.failed += 1;
      if (['processing', 'running'].includes(String(item.status || '').toLowerCase())) current.processing += 1;
      current.retries += Number(item.retry_count || 0);
      dispatchMap.set(item.company_id, current);
    }

    return tenantRows
      .map((company) => {
        const whatsapp = whatsappMap.get(company.id) || {};
        const dispatch = dispatchMap.get(company.id) || {};
        return {
          ...company,
          whatsapp_total: whatsapp.total || 0,
          whatsapp_success: whatsapp.enviado || 0,
          whatsapp_failure: whatsapp.falha || 0,
          whatsapp_success_rate: whatsapp.taxaSucesso || 0,
          dispatch_failed: dispatch.failed || 0,
          dispatch_processing: dispatch.processing || 0,
          dispatch_retries: dispatch.retries || 0,
        };
      })
      .filter((row) => {
        if (!search.trim()) return true;
        const haystack = `${row.nome} ${row.id} ${row.plan_code}`.toLowerCase();
        return haystack.includes(search.trim().toLowerCase());
      });
  }, [metrics?.dispatches?.recent, metrics?.tenants?.companies, metrics?.whatsapp?.byCompany, search]);

  const companyPageSize = 8;
  const totalCompanyPages = Math.max(1, Math.ceil(companyRows.length / companyPageSize));
  const paginatedCompanies = companyRows.slice((companyPage - 1) * companyPageSize, companyPage * companyPageSize);

  useEffect(() => {
    setCompanyPage(1);
  }, [search, period]);

  const filteredHealthChecks = useMemo(() => {
    const checks = health?.checks || [];
    if (!search.trim()) return checks;
    return checks.filter((check) => `${check.label} ${check.detail}`.toLowerCase().includes(search.trim().toLowerCase()));
  }, [health?.checks, search]);

  const filteredAlerts = useMemo(() => {
    if (!search.trim()) return alerts;
    return alerts.filter((alert) =>
      `${alert.title} ${alert.detail} ${alert.companyId} ${alert.source}`.toLowerCase().includes(search.trim().toLowerCase())
    );
  }, [alerts, search]);

  const handleToggleAutomation = async (empresaId, ativo) => {
    setTogglingId(empresaId);
    try {
      await toggleAutomationActive(empresaId, ativo);
      onToast?.('sucesso', `Automacao ${ativo ? 'ativada' : 'pausada'} com sucesso.`);
      await loadMetrics();
    } catch (error) {
      onToast?.('erro', error?.message || 'Falha ao atualizar automacao.');
    } finally {
      setTogglingId('');
    }
  };

  const handleAlertToggle = useCallback((alert) => {
    if (alert.acknowledgedAt) {
      clearOperationalAlertAcknowledgement(alert.id);
    } else {
      acknowledgeOperationalAlert(alert.id);
    }
    setAlerts(getOperationalAlerts(metrics, health));
  }, [health, metrics]);

  if (!isSystemAdminUser) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-slate-900/60 p-12 text-center shadow-soft">
        <ShieldCheck className="mx-auto mb-4 text-red-400" size={30} />
        <h2 className="text-xl font-semibold text-slate-50">Acesso restrito</h2>
        <p className="mt-2 text-sm text-slate-400">A Central Operacional esta disponivel apenas para administradores globais.</p>
      </div>
    );
  }

  const healthMeta = healthStatusMeta[health?.overall || HEALTH_STATUS.UNKNOWN];

  return (
    <div className="text-crisp space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/70 px-7 py-6 shadow-soft">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 via-violet-500 to-cyan-400 opacity-70" />
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-900/30">
              <Zap size={22} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Admin • nivel sistema</p>
              <h1 className="mt-0.5 text-2xl font-bold text-slate-50">Central Operacional</h1>
              <p className="mt-0.5 text-sm text-slate-300">Saude, envios, automacoes, auditoria e uso multi-tenant em uma so leitura operacional.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold ${healthMeta.bg} ${healthMeta.color}`}>
              <span className={`h-2 w-2 rounded-full ${healthMeta.dot}`} />
              {healthMeta.label}
            </span>
            <select
              value={period}
              onChange={(event) => setPeriod(Number(event.target.value))}
              className="control-surface rounded-xl px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-blue-500"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAutoRefresh((current) => !current)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${autoRefresh ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800/40 text-slate-300'}`}
            >
              {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
            </button>
            <button
              type="button"
              onClick={loadAll}
              disabled={loadingMetrics || loadingHealth}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              <RefreshCw size={13} className={loadingMetrics || loadingHealth ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[280px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar empresa, alerta, integracao ou check..."
              className="w-full rounded-2xl border border-slate-700 bg-slate-800/40 py-3 pl-9 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-500"
            />
          </label>
          {lastRefresh ? (
            <p className="text-[11px] text-slate-500">
              Ultima atualizacao {lastRefresh.toLocaleTimeString('pt-BR')} {autoRefresh ? '• ciclo automatico 60s' : ''}
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Envios totais" value={metrics?.whatsapp?.total ?? '—'} sub={`${period} dias`} icon={Send} tone="blue" loading={loadingMetrics} />
        <KpiCard label="Falhas" value={metrics?.whatsapp?.falha ?? '—'} sub={`${metrics?.whatsapp?.timeouts || 0} timeout(s)`} icon={XCircle} tone={metrics?.whatsapp?.falha > 0 ? 'red' : 'default'} loading={loadingMetrics} />
        <KpiCard label="Taxa de sucesso" value={metrics?.whatsapp ? `${metrics.whatsapp.taxaSucesso}%` : '—'} sub="real + mock" icon={CheckCircle2} tone={metrics?.whatsapp?.taxaSucesso >= 90 ? 'emerald' : metrics?.whatsapp?.taxaSucesso >= 70 ? 'amber' : 'red'} loading={loadingMetrics} />
        <KpiCard label="Tempo medio envio" value={formatDuration(metrics?.whatsapp?.avgSendLatencyMs)} sub="created_at → sent_at" icon={Clock} tone="violet" loading={loadingMetrics} />
        <KpiCard label="Retries" value={metrics?.dispatches?.retriesExecuted ?? '—'} sub={`${metrics?.dispatches?.deduplicados || 0} dedups`} icon={RefreshCw} tone="amber" loading={loadingMetrics} />
        <KpiCard label="Tenants ativos" value={metrics?.tenants ? `${metrics.tenants.active}/${metrics.tenants.total}` : '—'} sub={`${metrics?.tenants?.blocked || 0} bloqueados`} icon={Building2} tone="blue" loading={loadingMetrics} />
      </section>

      <div className="sticky-toolbar table-scroll flex flex-nowrap gap-1 rounded-2xl border border-slate-700 bg-slate-900/55 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === id ? 'bg-slate-700 text-slate-50 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-5">
          <SectionCard
            title="Breakdown por empresa"
            subtitle="Uso, sucesso, falhas, retries e fila por tenant com paginação e drill-down."
            action={
              <span className="rounded-full border border-slate-700 bg-slate-800/40 px-3 py-1 text-xs font-semibold text-slate-300">
                {companyRows.length} empresa(s)
              </span>
            }
          >
            {!paginatedCompanies.length ? (
              <EmptyState title="Nenhuma empresa encontrada" description="Ajuste a busca ou aguarde novos dados operacionais." />
            ) : (
              <div className="space-y-3">
                {paginatedCompanies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => setSelectedCompanyId(company.id)}
                    className={`flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition ${
                      selectedCompanyId === company.id
                        ? 'border-blue-500/30 bg-blue-500/10'
                        : 'border-slate-700 bg-slate-800/40 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-100">{company.nome}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{company.id}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                      <span>{company.whatsapp_total} envios</span>
                      <span className="text-emerald-400">{company.whatsapp_success_rate}% sucesso</span>
                      <span className={company.whatsapp_failure > 0 ? 'text-red-400' : 'text-slate-400'}>{company.whatsapp_failure} falhas</span>
                      <span>{company.dispatch_retries} retries</span>
                      <span className={company.dispatch_processing > 0 ? 'text-amber-400' : 'text-slate-400'}>{company.dispatch_processing} processing</span>
                      <ChevronRight size={14} className="text-slate-500" />
                    </div>
                  </button>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-500">Pagina {companyPage} de {totalCompanyPages}</p>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={companyPage === 1} onClick={() => setCompanyPage((value) => Math.max(1, value - 1))} className="control-surface rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40">Anterior</button>
                    <button type="button" disabled={companyPage === totalCompanyPages} onClick={() => setCompanyPage((value) => Math.min(totalCompanyPages, value + 1))} className="control-surface rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40">Proxima</button>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Drill-down operacional" subtitle={selectedCompanyId ? `Empresa ${selectedCompanyId}` : 'Selecione uma empresa acima para abrir detalhes operacionais.'}>
            {!selectedCompanyId ? (
              <EmptyState title="Nenhuma empresa selecionada" description="O drill-down mostra PDFs, retries, inconsistencias, Drive e eventos recentes da empresa." />
            ) : loadingDrilldown ? (
              <div className="space-y-3">
                <div className="skeleton h-20 rounded-2xl" />
                <div className="skeleton h-40 rounded-2xl" />
              </div>
            ) : companyDrilldown ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <KpiCard label="PDFs encontrados" value={companyDrilldown.drive?.encontrados ?? 0} sub="Drive" icon={CheckCircle2} tone="emerald" />
                  <KpiCard label="Conflitos" value={companyDrilldown.drive?.conflitos ?? 0} sub="match de boleto" icon={AlertTriangle} tone="amber" />
                  <KpiCard label="Nao encontrados" value={companyDrilldown.drive?.naoEncontrados ?? 0} sub="PDF ausente" icon={XCircle} tone="red" />
                  <KpiCard label="Baixa confianca" value={companyDrilldown.drive?.baixaConfianca ?? 0} sub="OCR/Drive" icon={ServerCrash} tone="amber" />
                  <KpiCard label="Erros Drive" value={companyDrilldown.drive?.erros ?? 0} sub={companyDrilldown.integrations?.googleSheetsLabel || 'Drive'} icon={ExternalLink} tone={companyDrilldown.drive?.erros > 0 ? 'red' : 'default'} />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4">
                    <p className="text-sm font-semibold text-slate-100">Integracoes</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <p>Z-API: <span className={companyDrilldown.integrations?.zapiConnected ? 'text-emerald-400' : 'text-red-400'}>{companyDrilldown.integrations?.zapiConnected ? 'conectada' : 'desconectada'}</span></p>
                      <p>Google Sheets: <span className="text-slate-100">{companyDrilldown.integrations?.googleSheetsLabel || 'Nao configurado'}</span></p>
                      <p>Ultimo sync Drive: <span className="text-slate-100">{companyDrilldown.integrations?.googleSheetsLastSyncAt ? new Date(companyDrilldown.integrations.googleSheetsLastSyncAt).toLocaleString('pt-BR') : '—'}</span></p>
                      {companyDrilldown.integrations?.googleSheetsLastSyncError ? (
                        <p className="text-red-400">{companyDrilldown.integrations.googleSheetsLastSyncError}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4">
                    <p className="text-sm font-semibold text-slate-100">Historico de cobranca recente</p>
                    <div className="mt-3 space-y-2">
                      {(companyDrilldown.recentHistory || []).slice(0, 5).map((row, index) => (
                        <div key={`${row.id || row.documento || index}`} className="rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-xs font-semibold text-slate-100">{row.cliente_nome || row.cliente || row.documento || 'Registro'}</p>
                            <span className="text-[10px] text-slate-500">{row.status_envio || row.status || 'pendente'}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-400">{row.erro || row.tipo_cobranca || 'Sem erro recente'}</p>
                        </div>
                      ))}
                      {!companyDrilldown.recentHistory?.length ? <p className="text-xs text-slate-500">Sem historico recente para a empresa.</p> : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="Drill-down indisponivel" description="Nao foi possivel carregar detalhes dessa empresa." />
            )}
          </SectionCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="Dispatches e idempotencia" subtitle="Fila, retries, duplicidade bloqueada e eventos em processamento.">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Total', value: metrics?.dispatches?.total ?? '—', tone: 'text-slate-200' },
                  { label: 'Completados', value: metrics?.dispatches?.completed ?? '—', tone: 'text-emerald-400' },
                  { label: 'Deduplicados', value: metrics?.dispatches?.deduplicados ?? '—', tone: 'text-violet-400' },
                  { label: 'Travados', value: metrics?.dispatches?.stuckProcessing ?? '—', tone: metrics?.dispatches?.stuckProcessing > 0 ? 'text-red-400' : 'text-slate-400' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                    <p className={`mt-1.5 text-2xl font-bold ${item.tone}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Integracoes do ecossistema" subtitle="Sinais consolidados de Z-API, Google e Stripe.">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Z-API online', value: metrics?.integrations?.zapiConnected ?? 0, tone: 'text-emerald-400' },
                  { label: 'Sheets ok', value: metrics?.integrations?.googleSheetsConnected ?? 0, tone: 'text-blue-400' },
                  { label: 'Sheets erro', value: metrics?.integrations?.googleSheetsErrors ?? 0, tone: metrics?.integrations?.googleSheetsErrors > 0 ? 'text-red-400' : 'text-slate-400' },
                  { label: 'Drive pronto', value: metrics?.integrations?.driveReady ?? 0, tone: 'text-emerald-400' },
                  { label: 'Stripe ok', value: metrics?.integrations?.stripeActive ?? 0, tone: 'text-emerald-400' },
                  { label: 'Stripe falhando', value: metrics?.integrations?.stripeFailing ?? 0, tone: metrics?.integrations?.stripeFailing > 0 ? 'text-red-400' : 'text-slate-400' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                    <p className={`mt-1.5 text-2xl font-bold ${item.tone}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      ) : null}

      {activeTab === 'health' ? (
        <SectionCard
          title="Health checks automaticos"
          subtitle={health?.checkedAt ? `Ultima verificacao em ${new Date(health.checkedAt).toLocaleString('pt-BR')}.` : 'Execute ou aguarde a verificacao automatica.'}
          action={
            <button
              type="button"
              onClick={loadHealth}
              disabled={loadingHealth}
              className="control-surface flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-200 disabled:opacity-60"
            >
              <RefreshCw size={12} className={loadingHealth ? 'animate-spin' : ''} />
              Reverificar
            </button>
          }
        >
          {loadingHealth ? (
            <div className="space-y-3">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="skeleton h-16 rounded-2xl" />)}</div>
          ) : filteredHealthChecks.length ? (
            <div className="space-y-3">{filteredHealthChecks.map((check, index) => <HealthCheckRow key={`${check.label}-${index}`} check={check} />)}</div>
          ) : (
            <EmptyState title="Nenhum check encontrado" description="A busca atual nao retornou checks de health." />
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'automations' ? (
        <div className="space-y-5">
          <SectionCard title="Controle de automacoes" subtitle="Pausa/ativacao segura por empresa.">
            {!metrics?.automations?.length ? (
              <EmptyState title="Nenhuma automacao configurada" description="Nao ha configuracoes de automacao registradas." />
            ) : (
              <div className="space-y-2">
                {metrics.automations
                  .filter((row) => !search.trim() || `${row.empresa_nome} ${row.empresa_id}`.toLowerCase().includes(search.trim().toLowerCase()))
                  .map((config) => (
                    <AutomationRow
                      key={config.empresa_id}
                      config={config}
                      onToggle={handleToggleAutomation}
                      togglingId={togglingId}
                      onSelect={setSelectedCompanyId}
                    />
                  ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Dispatches recentes" subtitle="Historico operacional com request_id, correlation_id e retries.">
            {!metrics?.dispatches?.recent?.length ? (
              <EmptyState title="Sem dispatches recentes" description="A fila ainda nao gerou eventos no periodo." />
            ) : (
              <div className="space-y-2">
                {metrics.dispatches.recent.slice(0, 12).map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{row.company_id || 'sem_empresa'}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{row.status} • retry {row.retry_count || 0}</p>
                      </div>
                      <p className="text-[11px] text-slate-500">{row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : '—'}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
                      {row.request_id ? <span className="rounded-full bg-slate-900/60 px-2 py-1">request {row.request_id}</span> : null}
                      {row.correlation_id ? <span className="rounded-full bg-slate-900/60 px-2 py-1">corr {row.correlation_id}</span> : null}
                      {row.idempotency_key ? <span className="rounded-full bg-slate-900/60 px-2 py-1">idem {row.idempotency_key}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {activeTab === 'alerts' ? (
        <SectionCard title="Alertas internos" subtitle="Deduplicados por assinatura, com acknowledge e resolucao automatica quando o sinal desaparece.">
          {!filteredAlerts.length ? (
            <EmptyState title="Nenhum alerta encontrado" description="Nenhum alerta ativo ou resolvido corresponde ao filtro atual." />
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} onAcknowledgeToggle={handleAlertToggle} />
              ))}
            </div>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
