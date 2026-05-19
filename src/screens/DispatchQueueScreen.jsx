/**
 * DispatchQueueScreen.jsx
 *
 * ETAPA 7+8+9 — Painel operacional da fila dispatch_jobs com scheduler automático
 * e monitoramento multi-tenant: quotas, health do provider, circuit breaker.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  Slash,
  Squircle,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  listDispatchJobs,
  getDispatchJob,
  getDispatchJobItems,
  getDispatchJobsKpis,
  countPendingRetries,
  createDispatchJob,
  runDispatchBatch,
  cancelDispatchJob,
  reprocessDispatchJobFailures,
  getSchedulerStatus,
  runSchedulerTick,
  getTenantLimits,
  getProviderHealth,
  pauseTenantDispatch,
  resumeTenantDispatch,
} from '../services/dispatchQueueService';

// ── constants ──────────────────────────────────────────────────────────────────

const POLL_RUNNING_MS = 5_000;
const POLL_PAUSED_MS = 15_000;

const STATUS_META = {
  pending:   { label: 'Pendente',   bg: 'bg-slate-700/60',  text: 'text-slate-300',  ring: 'ring-slate-500/30',  dot: 'bg-slate-400' },
  running:   { label: 'Executando', bg: 'bg-blue-500/10',   text: 'text-blue-300',   ring: 'ring-blue-500/30',   dot: 'bg-blue-400 animate-pulse' },
  paused:    { label: 'Pausado',    bg: 'bg-amber-500/10',  text: 'text-amber-300',  ring: 'ring-amber-500/30',  dot: 'bg-amber-400' },
  completed: { label: 'Concluido', bg: 'bg-emerald-500/10', text: 'text-emerald-300', ring: 'ring-emerald-500/30', dot: 'bg-emerald-400' },
  failed:    { label: 'Falhou',    bg: 'bg-red-500/10',    text: 'text-red-300',    ring: 'ring-red-500/30',    dot: 'bg-red-400' },
  cancelled: { label: 'Cancelado', bg: 'bg-slate-600/10',  text: 'text-slate-400',  ring: 'ring-slate-600/30',  dot: 'bg-slate-500' },
};

const ITEM_STATUS_META = {
  pending:    { label: 'Pendente',     bg: 'bg-slate-700/40', text: 'text-slate-400' },
  processing: { label: 'Processando', bg: 'bg-blue-500/10',  text: 'text-blue-300 animate-pulse' },
  success:    { label: 'Sucesso',      bg: 'bg-emerald-500/10', text: 'text-emerald-300' },
  error:      { label: 'Erro',         bg: 'bg-red-500/10',  text: 'text-red-300' },
  ignored:    { label: 'Ignorado',     bg: 'bg-amber-500/10', text: 'text-amber-300' },
};

const PERIOD_OPTIONS = [
  { value: 1,  label: 'Hoje' },
  { value: 3,  label: '3 dias' },
  { value: 7,  label: '7 dias' },
  { value: 30, label: '30 dias' },
];

const STATUS_FILTER_OPTIONS = [
  { value: '',         label: 'Todos' },
  { value: 'pending',  label: 'Pendente' },
  { value: 'running',  label: 'Executando' },
  { value: 'paused',   label: 'Pausado' },
  { value: 'completed',label: 'Concluido' },
  { value: 'failed',   label: 'Falhou' },
  { value: 'cancelled',label: 'Cancelado' },
];

// ── format helpers ─────────────────────────────────────────────────────────────

function fmtDuration(ms) {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}min ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}min`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return ts;
  }
}

function fmtRelative(ts) {
  if (!ts) return '—';
  try {
    const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (secs < 60) return `${secs}s atrás`;
    if (secs < 3600) return `${Math.floor(secs / 60)}min atrás`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h atrás`;
    return fmtDate(ts);
  } catch {
    return ts;
  }
}

function calcDurationMs(job) {
  if (!job?.started_at) return null;
  const end = job.finished_at ? new Date(job.finished_at) : new Date();
  return end.getTime() - new Date(job.started_at).getTime();
}

function calcProgress(job) {
  const total = job?.total_items || 0;
  const processed = job?.processed_items || 0;
  if (total === 0) return 0;
  return Math.min(100, Math.round((processed / total) * 100));
}

function calcEstimatedRemaining(job) {
  if (!job?.avg_ms_per_item || !job?.total_items || !job?.processed_items) return null;
  const remaining = job.total_items - job.processed_items;
  if (remaining <= 0) return null;
  return remaining * job.avg_ms_per_item;
}

// ── sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, tone = 'default', loading = false }) {
  const tones = {
    default: { bg: 'bg-slate-800/40', icon: 'bg-slate-700 text-slate-300' },
    blue:    { bg: 'bg-blue-500/5',   icon: 'bg-blue-500/15 text-blue-400' },
    amber:   { bg: 'bg-amber-500/5',  icon: 'bg-amber-500/15 text-amber-400' },
    emerald: { bg: 'bg-emerald-500/5',icon: 'bg-emerald-500/15 text-emerald-400' },
    red:     { bg: 'bg-red-500/5',    icon: 'bg-red-500/15 text-red-400' },
  };
  const t = tones[tone] || tones.default;

  return (
    <div className={`${t.bg} rounded-2xl border border-slate-700/50 p-4 flex items-start gap-3`}>
      {Icon && (
        <div className={`${t.icon} rounded-xl p-2 flex-shrink-0`}>
          <Icon size={16} />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs text-slate-500 truncate">{label}</div>
        {loading ? (
          <div className="skeleton h-6 w-16 rounded mt-1" />
        ) : (
          <div className="text-xl font-bold text-slate-100 leading-tight">{value}</div>
        )}
        {sub && <div className="text-xs text-slate-500 mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${m.bg} ${m.text} ${m.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.dot}`} />
      {m.label}
    </span>
  );
}

function ItemStatusPill({ status }) {
  const m = ITEM_STATUS_META[status] || ITEM_STATUS_META.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.bg} ${m.text}`}>
      {m.label}
    </span>
  );
}

function ProgressBar({ value, status }) {
  const color = status === 'completed' ? 'bg-emerald-500'
    : status === 'failed' ? 'bg-red-500'
    : status === 'cancelled' ? 'bg-slate-500'
    : status === 'running' ? 'bg-blue-500'
    : 'bg-slate-600';

  return (
    <div className="h-1.5 w-full bg-slate-700/50 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function ActionBtn({ onClick, loading, disabled, icon: Icon, label, tone = 'default', size = 'sm' }) {
  const tones = {
    default: 'bg-slate-700/60 text-slate-200 hover:bg-slate-600/60 border-slate-600/40',
    blue:    'bg-blue-600/80 text-white hover:bg-blue-500/80 border-blue-500/40',
    red:     'bg-red-600/20 text-red-300 hover:bg-red-600/40 border-red-500/30',
    amber:   'bg-amber-600/20 text-amber-300 hover:bg-amber-600/40 border-amber-500/30',
    emerald: 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40 border-emerald-500/30',
  };
  const t = tones[tone] || tones.default;
  const pad = size === 'xs' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 rounded-xl border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${pad} ${t}`}
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : Icon && <Icon size={12} />}
      {label}
    </button>
  );
}

// ── Scheduler status card ──────────────────────────────────────────────────────

function SchedulerStatusCard({ status, loading, onTrigger, triggering }) {
  const workerOnline = status?.worker_online === true;
  const lastTickAt = status?.last_tick_at || null;
  const activeJobs = status?.active_jobs ?? 0;
  const staleJobs = status?.stale_jobs ?? 0;
  const latestLog = (status?.latest_logs || [])[0] || null;

  return (
    <div className={`rounded-2xl border px-5 py-4 flex flex-wrap items-start justify-between gap-4
      ${workerOnline ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-800/40 border-slate-700/50'}`}>
      <div className="flex items-start gap-3 min-w-0">
        <div className={`rounded-xl p-2 flex-shrink-0 ${workerOnline ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
          {workerOnline ? <Cpu size={16} /> : <WifiOff size={16} />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-100">Auto Worker</span>
            {loading ? (
              <Loader2 size={12} className="animate-spin text-slate-500" />
            ) : (
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium
                ${workerOnline ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${workerOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                {workerOnline ? 'online' : 'offline'}
              </span>
            )}
            {staleJobs > 0 && (
              <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">
                {staleJobs} travado{staleJobs !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
            {lastTickAt ? (
              <span>último tick {fmtRelative(lastTickAt)}</span>
            ) : (
              <span>nenhum tick registrado</span>
            )}
            {latestLog && (
              <>
                <span>·</span>
                <span>{latestLog.batches_run ?? 0} batch(es)</span>
                <span>·</span>
                <span className="text-emerald-400/70">{latestLog.total_success ?? 0} ok</span>
                {(latestLog.stale_recovered ?? 0) > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-amber-400/70">{latestLog.stale_recovered} stale recuperado(s)</span>
                  </>
                )}
              </>
            )}
            {activeJobs > 0 && (
              <>
                <span>·</span>
                <span className="text-blue-400/70">{activeJobs} job(s) ativo(s)</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0">
        <ActionBtn
          icon={Zap}
          label="Disparar tick"
          tone="default"
          size="xs"
          onClick={onTrigger}
          loading={triggering}
          disabled={triggering}
        />
      </div>
    </div>
  );
}

function EmptyState({ message, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-slate-800/60 rounded-full p-4 mb-4">
        <Squircle size={28} className="text-slate-500" />
      </div>
      <p className="text-slate-300 font-medium">{message}</p>
      {sub && <p className="text-slate-500 text-sm mt-1">{sub}</p>}
    </div>
  );
}

function LoadingRows({ count = 4 }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="border-b border-slate-700/30 px-4 py-4">
      <div className="skeleton h-4 w-2/3 rounded mb-2" />
      <div className="skeleton h-3 w-1/3 rounded" />
    </div>
  ));
}

// ── ETAPA 9: Quota / health sub-components ────────────────────────────────────

function QuotaMeter({ label, used, limit, tone = 'default' }) {
  if (!limit) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const isNearLimit = pct >= 80;
  const isAtLimit = pct >= 100;

  const barColor = isAtLimit
    ? 'bg-red-500'
    : isNearLimit
      ? 'bg-amber-500'
      : tone === 'blue'
        ? 'bg-blue-500'
        : 'bg-emerald-500';

  const textColor = isAtLimit
    ? 'text-red-400'
    : isNearLimit
      ? 'text-amber-400'
      : 'text-slate-400';

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-xs text-slate-500 truncate">{label}</span>
        <span className={`text-xs font-medium flex-shrink-0 ${textColor}`}>
          {used}/{limit}
          {isNearLimit && !isAtLimit && (
            <AlertTriangle size={10} className="inline ml-1 text-amber-400" />
          )}
          {isAtLimit && (
            <AlertTriangle size={10} className="inline ml-1 text-red-400" />
          )}
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-700/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TenantStatusBanner({ limits, loading, onResume, resumeLoading }) {
  if (loading || !limits) return null;

  if (!limits.enabled) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/8 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-red-500/15 text-red-400 rounded-xl p-2 flex-shrink-0">
            <ShieldAlert size={16} />
          </div>
          <div>
            <span className="text-sm font-semibold text-red-300">Dispatch suspenso</span>
            {limits.pause_reason && (
              <p className="text-xs text-red-400/70 mt-0.5 truncate max-w-xs">{limits.pause_reason}</p>
            )}
            {limits.paused_at && (
              <p className="text-xs text-slate-500 mt-0.5">Desde {fmtDate(limits.paused_at)}</p>
            )}
          </div>
        </div>
        <ActionBtn
          icon={Play}
          label="Reativar"
          tone="emerald"
          size="xs"
          onClick={onResume}
          loading={resumeLoading}
          disabled={resumeLoading}
        />
      </div>
    );
  }

  return null; // enabled — no banner needed
}

function ProviderHealthBadge({ health }) {
  if (!health) return null;

  const stateStyles = {
    healthy:   { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Provider saudável' },
    degraded:  { bg: 'bg-amber-500/10 border-amber-500/20',     text: 'text-amber-400',   dot: 'bg-amber-400 animate-pulse', label: 'Provider degradado' },
    unhealthy: { bg: 'bg-red-500/10 border-red-500/20',         text: 'text-red-400',     dot: 'bg-red-400 animate-pulse',   label: 'Provider com falhas' },
  };
  const s = stateStyles[health.state] || stateStyles.healthy;

  return (
    <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 ${s.bg}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
      <div className="min-w-0">
        <span className={`text-xs font-medium ${s.text}`}>{s.label}</span>
        <div className="flex gap-2 mt-0.5 text-xs text-slate-500">
          {health.consecutive_failures > 0 && (
            <span className="text-red-400/70">{health.consecutive_failures} falhas</span>
          )}
          {health.avg_response_ms > 0 && (
            <span>{health.avg_response_ms}ms médio</span>
          )}
          {health.total_success_24h + health.total_error_24h > 0 && (
            <span>{health.total_success_24h}✓ {health.total_error_24h}✗</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Job detail modal ───────────────────────────────────────────────────────────

function JobDetailModal({ job: initialJob, companyId, onClose, onRefreshList, onToast }) {
  const [job, setJob] = useState(initialJob);
  const [items, setItems] = useState([]);
  const [itemsCount, setItemsCount] = useState(0);
  const [itemsPage, setItemsPage] = useState(0);
  const [itemsFilter, setItemsFilter] = useState('');
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingJob, setLoadingJob] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // 'run'|'cancel'|'reprocess'
  const pollRef = useRef(null);

  const ITEMS_PAGE_SIZE = 50;

  const refreshJob = useCallback(async () => {
    if (!job?.id) return;
    setLoadingJob(true);
    try {
      const fresh = await getDispatchJob(job.id);
      if (fresh) setJob(fresh);
    } catch {
      // silent
    } finally {
      setLoadingJob(false);
    }
  }, [job?.id]);

  const loadItems = useCallback(async (page = 0, statusFilter = '') => {
    if (!job?.id) return;
    setLoadingItems(true);
    try {
      const filters = {
        page,
        pageSize: ITEMS_PAGE_SIZE,
        ...(statusFilter === 'error' ? { withErrors: true } : {}),
        ...(statusFilter && statusFilter !== 'error' ? { status: [statusFilter] } : {}),
        ...(statusFilter === 'retryable' ? { retryable: true } : {}),
      };
      const result = await getDispatchJobItems(job.id, filters);
      setItems(result.data);
      setItemsCount(result.count);
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao carregar os itens.');
    } finally {
      setLoadingItems(false);
    }
  }, [job?.id, onToast]);

  // initial load
  useEffect(() => {
    loadItems(0, itemsFilter);
  }, [loadItems, itemsFilter]);

  // polling while running
  useEffect(() => {
    if (job?.status === 'running') {
      pollRef.current = setInterval(async () => {
        await refreshJob();
        await loadItems(itemsPage, itemsFilter);
      }, POLL_RUNNING_MS);
    } else if (job?.status === 'paused') {
      pollRef.current = setInterval(refreshJob, POLL_PAUSED_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [job?.status, refreshJob, loadItems, itemsPage, itemsFilter]);

  const handleRun = async () => {
    setActionLoading('run');
    try {
      await runDispatchBatch(companyId, job.id);
      onToast?.('sucesso', 'Proximo batch iniciado.');
      await refreshJob();
      onRefreshList?.();
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao iniciar o batch.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    setActionLoading('cancel');
    try {
      await cancelDispatchJob(companyId, job.id);
      onToast?.('sucesso', 'Job cancelado.');
      await refreshJob();
      onRefreshList?.();
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao cancelar o job.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReprocess = async () => {
    setActionLoading('reprocess');
    try {
      await reprocessDispatchJobFailures(companyId, job.id);
      onToast?.('sucesso', 'Reprocessamento iniciado.');
      await refreshJob();
      await loadItems(0, itemsFilter);
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao reprocessar.');
    } finally {
      setActionLoading(null);
    }
  };

  const progress = calcProgress(job);
  const durationMs = calcDurationMs(job);
  const estimatedRemaining = calcEstimatedRemaining(job);
  const canRun = ['pending', 'paused'].includes(job?.status);
  const canCancel = ['pending', 'running', 'paused'].includes(job?.status);
  const canReprocess = job?.error_count > 0;
  const retryableCount = items.filter(
    (it) => it.status === 'error' && (it.attempt_count || 0) < (it.max_attempts || 3)
  ).length;

  const errorItems = items.filter((it) => it.status === 'error').slice(0, 5);
  const successItems = items.filter((it) => it.status === 'success').slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0d1929] border border-slate-700/60 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">

        {/* header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-700/40 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <StatusPill status={job?.status} />
              {loadingJob && <Loader2 size={12} className="animate-spin text-slate-500" />}
              <span className="text-xs text-slate-500 font-mono truncate">{job?.id?.slice(0, 8)}…</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-100 mt-1 leading-tight">
              {job?.simulate !== false ? 'Job simulado' : 'Job real'}
              {job?.current_batch_id && (
                <span className="ml-2 text-xs text-slate-500 font-normal">batch: {job.current_batch_id}</span>
              )}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Criado {fmtRelative(job?.created_at)}
              {job?.started_at && <> · iniciado {fmtRelative(job.started_at)}</>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ActionBtn icon={RefreshCw} label="Atualizar" onClick={async () => { await refreshJob(); await loadItems(itemsPage, itemsFilter); }} loading={loadingJob} />
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700/40 transition-colors">
              <XCircle size={18} />
            </button>
          </div>
        </div>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* progress + stats */}
          <div className="px-6 pt-5 pb-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-slate-400">Progresso</span>
                <span className="text-sm font-medium text-slate-200">{progress}%</span>
              </div>
              <ProgressBar value={progress} status={job?.status} />
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-slate-500">{job?.processed_items || 0} / {job?.total_items || 0} itens</span>
                {estimatedRemaining && job?.status === 'running' && (
                  <span className="text-xs text-slate-500">~{fmtDuration(estimatedRemaining)} restante</span>
                )}
              </div>
            </div>

            {/* counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-emerald-500/5 rounded-xl border border-emerald-500/15 p-3 text-center">
                <div className="text-xl font-bold text-emerald-300">{job?.success_count || 0}</div>
                <div className="text-xs text-slate-500 mt-0.5">Sucesso</div>
              </div>
              <div className="bg-red-500/5 rounded-xl border border-red-500/15 p-3 text-center">
                <div className="text-xl font-bold text-red-300">{job?.error_count || 0}</div>
                <div className="text-xs text-slate-500 mt-0.5">Erros</div>
              </div>
              <div className="bg-amber-500/5 rounded-xl border border-amber-500/15 p-3 text-center">
                <div className="text-xl font-bold text-amber-300">{job?.ignored_count || 0}</div>
                <div className="text-xs text-slate-500 mt-0.5">Ignorados</div>
              </div>
              <div className="bg-slate-700/30 rounded-xl border border-slate-600/20 p-3 text-center">
                <div className="text-xl font-bold text-slate-200">{retryableCount}</div>
                <div className="text-xs text-slate-500 mt-0.5">Retries pendentes</div>
              </div>
            </div>

            {/* meta info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-slate-500 text-xs">Duracao total</span>
                <div className="text-slate-200 font-medium">{fmtDuration(durationMs)}</div>
              </div>
              <div>
                <span className="text-slate-500 text-xs">Tempo medio / item</span>
                <div className="text-slate-200 font-medium">{job?.avg_ms_per_item ? `${job.avg_ms_per_item}ms` : '—'}</div>
              </div>
              <div>
                <span className="text-slate-500 text-xs">Batch recomendado</span>
                <div className="text-slate-200 font-medium">{job?.recommended_batch_size ?? '—'} itens</div>
              </div>
              {job?.finished_at && (
                <div>
                  <span className="text-slate-500 text-xs">Finalizado em</span>
                  <div className="text-slate-200 font-medium">{fmtDate(job.finished_at)}</div>
                </div>
              )}
            </div>
          </div>

          {/* actions */}
          <div className="px-6 pb-4 flex flex-wrap gap-2 border-b border-slate-700/30">
            {canRun && (
              <ActionBtn icon={Play} label="Rodar proximo batch" tone="blue" onClick={handleRun} loading={actionLoading === 'run'} disabled={!!actionLoading} />
            )}
            {canReprocess && (
              <ActionBtn icon={RotateCcw} label={`Reprocessar falhas (${job.error_count})`} tone="amber" onClick={handleReprocess} loading={actionLoading === 'reprocess'} disabled={!!actionLoading} />
            )}
            {canCancel && (
              <ActionBtn icon={Slash} label="Cancelar job" tone="red" onClick={handleCancel} loading={actionLoading === 'cancel'} disabled={!!actionLoading} />
            )}
          </div>

          {/* recent errors / success preview */}
          {(errorItems.length > 0 || successItems.length > 0) && (
            <div className="px-6 py-4 grid sm:grid-cols-2 gap-4 border-b border-slate-700/30">
              {errorItems.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ultimos erros</h3>
                  <div className="space-y-1.5">
                    {errorItems.map((it) => (
                      <div key={it.id} className="bg-red-500/5 rounded-xl border border-red-500/15 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono text-slate-400 truncate">{it.record_id?.slice(0, 12)}</span>
                          <span className="text-xs text-red-400 bg-red-500/10 rounded px-1.5 py-0.5 flex-shrink-0">{it.last_error_code || 'erro'}</span>
                        </div>
                        {it.last_error_message && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{it.last_error_message}</p>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-slate-600">tentativa {it.attempt_count}/{it.max_attempts}</span>
                          {it.next_attempt_at && (
                            <span className="text-xs text-slate-600">próx. {fmtRelative(it.next_attempt_at)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {successItems.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ultimos sucessos</h3>
                  <div className="space-y-1.5">
                    {successItems.map((it) => {
                      const p = it.payload || {};
                      return (
                        <div key={it.id} className="bg-emerald-500/5 rounded-xl border border-emerald-500/15 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-emerald-300 truncate">{p.cliente_nome || p.cliente || it.record_id?.slice(0, 12)}</span>
                            {p.whatsapp_attachment_sent && (
                              <span className="text-xs text-emerald-400/70 flex-shrink-0">📎 PDF</span>
                            )}
                          </div>
                          {p.boleto_file_name && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{p.boleto_file_name}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* items table */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-slate-200">
                Itens do job <span className="text-slate-500 font-normal">({itemsCount})</span>
              </h3>
              <div className="flex items-center gap-2">
                <select
                  value={itemsFilter}
                  onChange={(e) => { setItemsFilter(e.target.value); setItemsPage(0); }}
                  className="text-xs bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                >
                  <option value="">Todos</option>
                  <option value="pending">Pendente</option>
                  <option value="processing">Processando</option>
                  <option value="success">Sucesso</option>
                  <option value="error">Erro</option>
                  <option value="ignored">Ignorado</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-700/40">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-800/40">
                    <th className="text-left text-slate-500 font-medium px-3 py-2.5">Cliente</th>
                    <th className="text-left text-slate-500 font-medium px-3 py-2.5">Telefone</th>
                    <th className="text-left text-slate-500 font-medium px-3 py-2.5">Status</th>
                    <th className="text-left text-slate-500 font-medium px-3 py-2.5">Tentativas</th>
                    <th className="text-left text-slate-500 font-medium px-3 py-2.5">Erro</th>
                    <th className="text-left text-slate-500 font-medium px-3 py-2.5">Boleto</th>
                    <th className="text-left text-slate-500 font-medium px-3 py-2.5">Attach</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingItems ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        <Loader2 size={18} className="animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Nenhum item encontrado.
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const p = it.payload || {};
                      return (
                        <tr key={it.id} className="border-b border-slate-700/20 hover:bg-slate-800/20 transition-colors">
                          <td className="px-3 py-2 text-slate-300 max-w-[120px] truncate">
                            {p.cliente_nome || p.cliente || <span className="text-slate-600 font-mono">{it.record_id?.slice(0, 10)}</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-400 font-mono">
                            {p.telefone ? `…${String(p.telefone).slice(-4)}` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <ItemStatusPill status={it.status} />
                          </td>
                          <td className="px-3 py-2 text-slate-400 text-center">
                            {it.attempt_count ?? 0}/{it.max_attempts ?? 3}
                          </td>
                          <td className="px-3 py-2 text-red-400 max-w-[100px] truncate">
                            {it.last_error_code || '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-400 max-w-[100px] truncate">
                            {p.boleto_file_name || '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {p.whatsapp_attachment_sent ? (
                              <span className="text-emerald-400">✓</span>
                            ) : p.whatsapp_attachment_sent === false ? (
                              <span className="text-slate-600">✗</span>
                            ) : (
                              <span className="text-slate-700">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* items pagination */}
            {itemsCount > ITEMS_PAGE_SIZE && (
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-500">
                  {itemsPage * ITEMS_PAGE_SIZE + 1}–{Math.min((itemsPage + 1) * ITEMS_PAGE_SIZE, itemsCount)} de {itemsCount}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={itemsPage === 0}
                    onClick={() => { setItemsPage((p) => p - 1); loadItems(itemsPage - 1, itemsFilter); }}
                    className="text-xs px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    disabled={(itemsPage + 1) * ITEMS_PAGE_SIZE >= itemsCount}
                    onClick={() => { setItemsPage((p) => p + 1); loadItems(itemsPage + 1, itemsFilter); }}
                    className="text-xs px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Próximo →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Job row ───────────────────────────────────────────────────────────────────

function JobRow({ job, onOpenDetail }) {
  const progress = calcProgress(job);
  const durationMs = calcDurationMs(job);

  return (
    <div
      className="border-b border-slate-700/30 px-4 py-4 hover:bg-slate-800/20 transition-colors cursor-pointer group"
      onClick={() => onOpenDetail(job)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <StatusPill status={job.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                {job.total_items} itens
              </span>
              <span className="text-xs text-slate-500 font-mono">{job.id?.slice(0, 8)}…</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
              <span>criado {fmtRelative(job.created_at)}</span>
              {job.started_at && <span>iniciado {fmtRelative(job.started_at)}</span>}
              {durationMs && <span>duração {fmtDuration(durationMs)}</span>}
              {job.avg_ms_per_item && <span>{job.avg_ms_per_item}ms/item</span>}
            </div>
          </div>
        </div>

        {/* right: counters */}
        <div className="flex items-center gap-4 flex-shrink-0 text-xs">
          <div className="text-center hidden sm:block">
            <div className="text-emerald-300 font-semibold">{job.success_count}</div>
            <div className="text-slate-600">ok</div>
          </div>
          <div className="text-center hidden sm:block">
            <div className="text-red-300 font-semibold">{job.error_count}</div>
            <div className="text-slate-600">erro</div>
          </div>
          <div className="text-center hidden sm:block">
            <div className="text-amber-300 font-semibold">{job.ignored_count}</div>
            <div className="text-slate-600">ign.</div>
          </div>
          <ChevronDown size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
        </div>
      </div>

      {/* progress bar */}
      {job.total_items > 0 && (
        <div className="mt-3">
          <ProgressBar value={progress} status={job.status} />
          <div className="flex items-center justify-between mt-0.5 text-xs text-slate-600">
            <span>{job.processed_items} / {job.total_items}</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── main screen ────────────────────────────────────────────────────────────────

export default function DispatchQueueScreen({ companyId, globalMode = false, onToast }) {
  const [jobs, setJobs] = useState([]);
  const [jobsCount, setJobsCount] = useState(0);
  const [kpis, setKpis] = useState(null);
  const [pendingRetries, setPendingRetries] = useState(0);

  const [loading, setLoading] = useState(false);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // Scheduler state
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerTriggering, setSchedulerTriggering] = useState(false);

  // ETAPA 9: Tenant limits / quota / health
  const [tenantLimits, setTenantLimits] = useState(null);
  const [quotaUsage, setQuotaUsage] = useState(null);
  const [providerHealth, setProviderHealth] = useState(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);

  const [selectedJob, setSelectedJob] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // filters
  const [searchStatus, setSearchStatus] = useState('');
  const [searchPeriod, setSearchPeriod] = useState(7);
  const [withErrors, setWithErrors] = useState(false);

  const pollRef = useRef(null);
  const schedulerPollRef = useRef(null);

  // ── data loading ─────────────────────────────────────────────────────────────

  const loadKpis = useCallback(async () => {
    if (!companyId) return;
    setKpisLoading(true);
    try {
      const [k, pr] = await Promise.all([
        getDispatchJobsKpis(companyId),
        countPendingRetries(companyId),
      ]);
      setKpis(k);
      setPendingRetries(pr);
    } catch {
      // silent — KPIs are bonus info
    } finally {
      setKpisLoading(false);
    }
  }, [companyId]);

  const loadSchedulerStatus = useCallback(async () => {
    setSchedulerLoading(true);
    try {
      const data = await getSchedulerStatus();
      setSchedulerStatus(data);
    } catch {
      // Non-fatal — scheduler status is optional (requires admin)
    } finally {
      setSchedulerLoading(false);
    }
  }, []);

  const loadTenantData = useCallback(async () => {
    if (!companyId) return;
    setTenantLoading(true);
    try {
      const [limitsResult, health] = await Promise.all([
        getTenantLimits(companyId),
        getProviderHealth(companyId),
      ]);
      if (limitsResult?.limits) setTenantLimits(limitsResult.limits);
      if (limitsResult?.usage) setQuotaUsage(limitsResult.usage);
      setProviderHealth(health);
    } catch {
      // Non-fatal
    } finally {
      setTenantLoading(false);
    }
  }, [companyId]);

  const handlePauseTenant = async () => {
    if (!companyId) return;
    setPauseLoading(true);
    try {
      await pauseTenantDispatch(companyId, 'Suspenso manualmente pelo operador.');
      onToast?.('aviso', 'Dispatch suspenso para esta empresa.');
      await loadTenantData();
      await refresh(page);
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao suspender o dispatch.');
    } finally {
      setPauseLoading(false);
    }
  };

  const handleResumeTenant = async () => {
    if (!companyId) return;
    setResumeLoading(true);
    try {
      await resumeTenantDispatch(companyId);
      onToast?.('sucesso', 'Dispatch reativado.');
      await loadTenantData();
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao reativar o dispatch.');
    } finally {
      setResumeLoading(false);
    }
  };

  const handleTriggerScheduler = async () => {
    setSchedulerTriggering(true);
    try {
      await runSchedulerTick();
      onToast?.('sucesso', 'Tick do scheduler disparado.');
      await loadSchedulerStatus();
      await refresh(page);
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao disparar o scheduler.');
    } finally {
      setSchedulerTriggering(false);
    }
  };

  const loadJobs = useCallback(async (pageArg = 0) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const filters = {
        page: pageArg,
        pageSize: PAGE_SIZE,
        period: searchPeriod,
        ...(searchStatus ? { status: [searchStatus] } : {}),
        withErrors,
      };
      const result = await listDispatchJobs(companyId, filters);
      setJobs(result.data);
      setJobsCount(result.count);
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao carregar a fila.');
    } finally {
      setLoading(false);
    }
  }, [companyId, searchStatus, searchPeriod, withErrors, onToast]);

  const refresh = useCallback(async (pageArg) => {
    await Promise.all([loadJobs(pageArg ?? page), loadKpis(), loadTenantData()]);
  }, [loadJobs, loadKpis, loadTenantData, page]);

  // initial load — deps intentionally exclude `refresh` to avoid infinite loop;
  // filter changes should reset to page 0 and reload
  useEffect(() => {
    loadKpis();
    loadJobs(0);
    setPage(0);
    loadSchedulerStatus();
    loadTenantData();
  }, [companyId, searchStatus, searchPeriod, withErrors, loadJobs, loadKpis, loadSchedulerStatus, loadTenantData]);

  // adaptive polling for jobs
  useEffect(() => {
    clearInterval(pollRef.current);
    const hasRunning = jobs.some((j) => j.status === 'running');
    const hasPaused = jobs.some((j) => j.status === 'paused');

    if (hasRunning) {
      pollRef.current = setInterval(() => refresh(page), POLL_RUNNING_MS);
    } else if (hasPaused) {
      pollRef.current = setInterval(() => refresh(page), POLL_PAUSED_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [jobs, page, refresh]);

  // scheduler status polling every 30s
  useEffect(() => {
    clearInterval(schedulerPollRef.current);
    schedulerPollRef.current = setInterval(loadSchedulerStatus, 30_000);
    return () => clearInterval(schedulerPollRef.current);
  }, [loadSchedulerStatus]);

  // ── create job ───────────────────────────────────────────────────────────────

  const handleCreateJob = async () => {
    if (!companyId) {
      onToast?.('erro', 'Selecione uma empresa para criar o job.');
      return;
    }
    setCreateLoading(true);
    try {
      const result = await createDispatchJob(companyId, { simulate: true, limit: 50, batch_size: 20 });
      onToast?.('sucesso', `Job criado (${result?.job_id?.slice(0, 8) || 'ok'}).`);
      await refresh(0);
      setPage(0);
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao criar o job.');
    } finally {
      setCreateLoading(false);
    }
  };

  // ── computed ─────────────────────────────────────────────────────────────────

  const hasActiveJobs = jobs.some((j) => ['running', 'paused'].includes(j.status));
  const pollingActive = jobs.some((j) => j.status === 'running');

  // ── render ────────────────────────────────────────────────────────────────────

  if (!companyId && !globalMode) {
    return (
      <div className="hero-mesh rounded-2xl border border-slate-700/80 px-6 py-12 text-center">
        <p className="text-slate-300 font-medium">Selecione uma empresa para visualizar a fila de dispatch.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Scheduler status widget */}
      <SchedulerStatusCard
        status={schedulerStatus}
        loading={schedulerLoading}
        onTrigger={handleTriggerScheduler}
        triggering={schedulerTriggering}
      />

      {/* ETAPA 9: Tenant paused banner */}
      <TenantStatusBanner
        limits={tenantLimits}
        loading={tenantLoading}
        onPause={handlePauseTenant}
        onResume={handleResumeTenant}
        pauseLoading={pauseLoading}
        resumeLoading={resumeLoading}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Jobs ativos"
          value={kpisLoading ? '…' : (kpis?.active ?? 0)}
          sub={`${kpis?.paused ?? 0} pausados`}
          icon={Activity}
          tone="blue"
          loading={kpisLoading}
        />
        <KpiCard
          label="Throughput / hora"
          value={kpisLoading ? '…' : (kpis?.throughput_per_hour ?? 0)}
          sub="itens estimados"
          icon={Zap}
          tone="amber"
          loading={kpisLoading}
        />
        <KpiCard
          label="Taxa de sucesso"
          value={kpisLoading ? '…' : `${kpis?.success_rate ?? 0}%`}
          sub={`${kpis?.total_success ?? 0} enviados`}
          icon={CheckCircle2}
          tone="emerald"
          loading={kpisLoading}
        />
        <KpiCard
          label="Retries pendentes"
          value={kpisLoading ? '…' : pendingRetries}
          sub={`${kpis?.total_error ?? 0} total erros`}
          icon={RotateCcw}
          tone={pendingRetries > 0 ? 'red' : 'default'}
          loading={kpisLoading}
        />
      </div>

      {/* ETAPA 9: Quota meters + provider health */}
      {(tenantLimits || tenantLoading || providerHealth) && (
        <div className="hero-mesh rounded-2xl border border-slate-700/80 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-300">Quotas da empresa</span>
              {tenantLoading && <Loader2 size={12} className="animate-spin text-slate-500" />}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {providerHealth && <ProviderHealthBadge health={providerHealth} />}
              {tenantLimits?.enabled && (
                <ActionBtn
                  icon={Slash}
                  label="Suspender dispatch"
                  tone="red"
                  size="xs"
                  onClick={handlePauseTenant}
                  loading={pauseLoading}
                  disabled={pauseLoading}
                />
              )}
            </div>
          </div>

          {tenantLimits && quotaUsage && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <QuotaMeter
                label="Jobs ativos"
                used={quotaUsage.active_jobs}
                limit={tenantLimits.max_active_jobs}
                tone="blue"
              />
              <QuotaMeter
                label="Mensagens hoje"
                used={quotaUsage.daily_messages}
                limit={tenantLimits.max_daily_messages}
                tone="blue"
              />
              <QuotaMeter
                label="Batches concorrentes"
                used={quotaUsage.concurrent_batches}
                limit={tenantLimits.max_concurrent_batches}
                tone="blue"
              />
              <QuotaMeter
                label="Retentativas / hora"
                used={quotaUsage.retries_last_hour}
                limit={tenantLimits.max_retries_per_hour}
                tone="blue"
              />
            </div>
          )}

          {tenantLoading && !tenantLimits && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="skeleton h-3 w-3/4 rounded" />
                  <div className="skeleton h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* toolbar */}
      <div className="hero-mesh rounded-2xl border border-slate-700/80 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">

          {/* filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={searchStatus}
              onChange={(e) => setSearchStatus(e.target.value)}
              className="text-sm bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={searchPeriod}
              onChange={(e) => setSearchPeriod(Number(e.target.value))}
              className="text-sm bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={withErrors}
                onChange={(e) => setWithErrors(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500/30"
              />
              <span className="text-sm text-slate-400">Com erros</span>
            </label>
          </div>

          {/* actions */}
          <div className="flex items-center gap-2">
            {pollingActive && (
              <span className="flex items-center gap-1.5 text-xs text-blue-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                atualizando
              </span>
            )}
            <ActionBtn
              icon={RefreshCw}
              label="Atualizar"
              onClick={() => refresh(page)}
              loading={loading}
            />
            <ActionBtn
              icon={Plus}
              label="Novo job (simulate)"
              tone="blue"
              onClick={handleCreateJob}
              loading={createLoading}
            />
          </div>
        </div>
      </div>

      {/* jobs list */}
      <div className="hero-mesh rounded-2xl border border-slate-700/80 overflow-hidden">

        {/* list header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/40 bg-slate-800/20">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-slate-500" />
            <span className="text-sm font-medium text-slate-300">
              Fila de dispatch
            </span>
            <span className="text-xs text-slate-600 bg-slate-800 rounded-full px-2 py-0.5">{jobsCount}</span>
          </div>
          {hasActiveJobs && (
            <span className="text-xs text-blue-400 flex items-center gap-1">
              <Activity size={10} className="animate-pulse" />
              jobs ativos
            </span>
          )}
        </div>

        {/* content */}
        {loading && jobs.length === 0 ? (
          <LoadingRows count={4} />
        ) : jobs.length === 0 ? (
          <EmptyState
            message="Nenhum job encontrado"
            sub="Crie um novo job usando o botao acima ou ajuste os filtros."
          />
        ) : (
          <div>
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onOpenDetail={setSelectedJob} />
            ))}
          </div>
        )}

        {/* pagination */}
        {jobsCount > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/30 bg-slate-800/10">
            <span className="text-xs text-slate-500">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, jobsCount)} de {jobsCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => { const np = page - 1; setPage(np); loadJobs(np); }}
                className="text-xs px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Anterior
              </button>
              <button
                type="button"
                disabled={(page + 1) * PAGE_SIZE >= jobsCount || loading}
                onClick={() => { const np = page + 1; setPage(np); loadJobs(np); }}
                className="text-xs px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Proximo →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* job detail modal */}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          companyId={companyId}
          onClose={() => setSelectedJob(null)}
          onRefreshList={() => refresh(page)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
