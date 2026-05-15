/**
 * RealtimeMonitorPanel — Monitoramento em tempo real: fila, jobs, circuit breaker,
 * latências Z-API / Drive, OCR, retries e alertas operacionais.
 * Auto-refresh a cada 30s.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  RefreshCw,
  Server,
  Shield,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  getActiveAlerts,
  acknowledgeAlert,
  getFullOperationalMetrics,
} from '../../services/observabilityService';

const REFRESH_INTERVAL = 30_000;

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtMs(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}min`;
}

function fmtNum(v) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Number(v || 0));
}

function timeSince(ts) {
  if (!ts) return '—';
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s atrás`;
  if (secs < 3600) return `${Math.floor(secs / 60)}min atrás`;
  return `${Math.floor(secs / 3600)}h atrás`;
}

// ── sub-components ─────────────────────────────────────────────────────────────

function StatusDot({ ok, pulse = false }) {
  const color = ok ? 'bg-emerald-400' : 'bg-red-400';
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${color} ${pulse && ok ? 'animate-pulse' : ''}`} />
  );
}

function MetricRow({ label, value, sub, tone = 'slate', icon: Icon }) {
  const textColors = {
    slate: 'text-slate-200',
    green: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
  };
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={12} className="text-slate-500 shrink-0" />}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className="text-right">
        <span className={`text-sm font-semibold ${textColors[tone] || textColors.slate}`}>{value}</span>
        {sub && <span className="text-[10px] text-slate-500 ml-1.5">{sub}</span>}
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children, badge, badgeColor = 'bg-slate-700 text-slate-300' }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-slate-400" />}
          <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
        </div>
        {badge != null && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function AlertItem({ alert, onAck }) {
  const severityConfig = {
    critical: { color: 'border-red-700/50 bg-red-950/40', text: 'text-red-300', badge: 'bg-red-900 text-red-200' },
    high:     { color: 'border-orange-700/50 bg-orange-950/40', text: 'text-orange-300', badge: 'bg-orange-900 text-orange-200' },
    medium:   { color: 'border-amber-700/50 bg-amber-950/30', text: 'text-amber-300', badge: 'bg-amber-900 text-amber-200' },
    low:      { color: 'border-slate-700/50 bg-slate-800/30', text: 'text-slate-300', badge: 'bg-slate-700 text-slate-300' },
  };
  const cfg = severityConfig[alert.severity] || severityConfig.low;
  return (
    <div className={`rounded-xl border p-3 ${cfg.color}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${cfg.badge}`}>
              {alert.severity}
            </span>
            <span className={`text-xs font-medium ${cfg.text} truncate`}>{alert.alert_type?.replace(/_/g, ' ')}</span>
          </div>
          {alert.message && <p className="text-[11px] text-slate-400 leading-snug">{alert.message}</p>}
          <p className="text-[10px] text-slate-600 mt-1">{timeSince(alert.created_at)}</p>
        </div>
        {!alert.acknowledged && (
          <button
            onClick={() => onAck(alert.id)}
            className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 px-2 py-0.5 rounded-lg transition-colors"
          >
            OK
          </button>
        )}
        {alert.acknowledged && (
          <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
        )}
      </div>
    </div>
  );
}

function CircuitBreakerCard({ aut }) {
  const isOpen = aut?.circuitOpen;
  return (
    <Card
      title="Circuit Breaker Z-API"
      icon={Shield}
      badge={isOpen ? 'ABERTO' : 'FECHADO'}
      badgeColor={isOpen ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200'}
    >
      <div className="flex items-center gap-3 mb-3">
        {isOpen
          ? <WifiOff size={28} className="text-red-400" />
          : <Wifi size={28} className="text-emerald-400" />
        }
        <div>
          <p className={`text-sm font-semibold ${isOpen ? 'text-red-300' : 'text-emerald-300'}`}>
            {isOpen ? 'Envios bloqueados' : 'Envios ativos'}
          </p>
          {isOpen && aut.circuitOpenedAt && (
            <p className="text-[11px] text-slate-500">Aberto {timeSince(aut.circuitOpenedAt)}</p>
          )}
        </div>
      </div>
      <MetricRow label="Falhas consecutivas" value={aut?.consecutiveFailures ?? '—'} tone={aut?.consecutiveFailures > 0 ? 'red' : 'slate'} icon={XCircle} />
      <MetricRow label="Total retries" value={fmtNum(aut?.totalRetries ?? 0)} tone={aut?.totalRetries > 10 ? 'amber' : 'slate'} icon={RefreshCw} />
      <MetricRow label="Jobs ativos" value={fmtNum(aut?.activeJobs ?? 0)} icon={Activity} />
      <MetricRow label="Jobs falhos" value={fmtNum(aut?.failedJobs ?? 0)} tone={aut?.failedJobs > 0 ? 'red' : 'slate'} icon={XCircle} />
    </Card>
  );
}

function WhatsappMetricsCard({ wp, loading }) {
  if (loading) return <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 h-48 animate-pulse" />;
  return (
    <Card title="WhatsApp / Z-API" icon={Zap}>
      <MetricRow label="Enviados" value={fmtNum(wp?.totalSent ?? 0)} icon={Activity} />
      <MetricRow label="Entregues" value={fmtNum(wp?.totalDelivered ?? 0)} sub={wp?.deliveryRate ? `${Number(wp.deliveryRate).toFixed(1)}%` : ''} tone="green" icon={CheckCircle2} />
      <MetricRow label="Lidos" value={fmtNum(wp?.totalRead ?? 0)} sub={wp?.readRate ? `${Number(wp.readRate).toFixed(1)}%` : ''} tone="blue" icon={Activity} />
      <MetricRow label="Falhas" value={fmtNum(wp?.totalFailed ?? 0)} tone={wp?.totalFailed > 0 ? 'red' : 'slate'} icon={XCircle} />
      <MetricRow label="Tempo médio leitura" value={fmtMs(wp?.avgReadLatencyMs)} icon={Clock} />
    </Card>
  );
}

function DriveOcrCard({ bol, loading }) {
  if (loading) return <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 h-48 animate-pulse" />;
  return (
    <Card title="Google Drive / OCR" icon={Server}>
      <MetricRow label="Boletos encontrados" value={fmtNum(bol?.totalFound ?? 0)} tone="green" icon={CheckCircle2} />
      <MetricRow label="OCR usado" value={fmtNum(bol?.totalOcrUsed ?? 0)} sub={bol?.ocrUsageRate ? `${Number(bol.ocrUsageRate).toFixed(1)}%` : ''} tone="blue" icon={Activity} />
      <MetricRow label="Conflitos" value={fmtNum(bol?.totalConflict ?? 0)} tone={bol?.totalConflict > 0 ? 'amber' : 'slate'} icon={AlertTriangle} />
      <MetricRow label="Baixa confiança" value={fmtNum(bol?.totalLowConfidence ?? 0)} tone={bol?.totalLowConfidence > 0 ? 'amber' : 'slate'} icon={Circle} />
      <MetricRow label="Taxa conflito" value={bol?.conflictRate ? `${Number(bol.conflictRate).toFixed(2)}%` : '0%'} icon={AlertTriangle} />
    </Card>
  );
}

function LiveIndicator({ lastUpdate, refreshing }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <StatusDot ok pulse />
      <span>Live</span>
      {lastUpdate && <span>· atualizado {timeSince(lastUpdate)}</span>}
      {refreshing && <RefreshCw size={11} className="animate-spin ml-1" />}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function RealtimeMonitorPanel({ companyId }) {
  const [metrics, setMetrics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!companyId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [m, a] = await Promise.allSettled([
        getFullOperationalMetrics(companyId, { days: 7 }),
        getActiveAlerts(companyId),
      ]);
      if (m.status === 'fulfilled') setMetrics(m.value);
      if (a.status === 'fulfilled') setAlerts(a.value || []);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId]);

  useEffect(() => {
    load(false);
    timerRef.current = setInterval(() => load(true), REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const handleAck = useCallback(async (alertId) => {
    try {
      await acknowledgeAlert(alertId);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
    } catch { /* ignore */ }
  }, []);

  const wp = metrics?.whatsapp || {};
  const bol = metrics?.boletos || {};
  const aut = metrics?.automation || {};

  const unacknowledged = alerts.filter(a => !a.acknowledged);
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && !a.acknowledged);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Monitor em Tempo Real</h3>
          <p className="text-xs text-slate-500 mt-0.5">Atualização automática a cada 30s</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator lastUpdate={lastUpdate} refreshing={refreshing} />
          <button
            onClick={() => load(true)}
            disabled={loading || refreshing}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading || refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Critical alert banner */}
      {criticalAlerts.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-950/60 border border-red-700/50 rounded-xl">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300 font-semibold">
            {criticalAlerts.length} alerta{criticalAlerts.length > 1 ? 's' : ''} crítico{criticalAlerts.length > 1 ? 's' : ''} ativo{criticalAlerts.length > 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <CircuitBreakerCard aut={aut} />
        <WhatsappMetricsCard wp={wp} loading={loading} />
        <DriveOcrCard bol={bol} loading={loading} />
      </div>

      {/* Alerts section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-slate-400" />
            <h4 className="text-sm font-semibold text-slate-200">Alertas Operacionais</h4>
          </div>
          {unacknowledged.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-900 text-red-200">
              {unacknowledged.length} pendente{unacknowledged.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-800/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex items-center gap-2 py-6 justify-center text-slate-500 text-sm">
            <CheckCircle2 size={16} className="text-emerald-500" />
            Nenhum alerta ativo
          </div>
        ) : (
          <div className="space-y-2">
            {/* Unacknowledged first */}
            {[...alerts]
              .sort((a, b) => {
                const sev = { critical: 0, high: 1, medium: 2, low: 3 };
                if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
                return (sev[a.severity] ?? 9) - (sev[b.severity] ?? 9);
              })
              .slice(0, 10)
              .map(alert => (
                <AlertItem key={alert.id} alert={alert} onAck={handleAck} />
              ))
            }
          </div>
        )}
      </div>

      {/* Auto-refresh footer */}
      <p className="text-[10px] text-slate-600 text-right">
        Próxima atualização automática em ~30s · Últimos 7 dias
      </p>
    </div>
  );
}
