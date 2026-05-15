/**
 * ExecutiveDashboard — Dashboard executivo completo com KPIs, funil, aging,
 * heatmap, rankings e série temporal. Composto dos sub-componentes de analytics.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

import CollectionFunnel from './CollectionFunnel';
import AgingChart from './AgingChart';
import SendHeatmap from './SendHeatmap';
import RankingTable from './RankingTable';
import TimeSeriesChart from './TimeSeriesChart';

import {
  getCollectionFunnel,
  getDetailedAging,
  getFullOperationalMetrics,
  getRankings,
  getSendHeatmap,
  getTemporalAggregations,
} from '../../services/observabilityService';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtPct(v) { return `${Number(v || 0).toFixed(1)}%`; }
function fmtMs(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}min`;
}
function fmtNum(v) {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(Number(v || 0));
}

function KPI({ icon: Icon, label, value, sub, tone = 'blue', loading = false }) {
  const tones = {
    blue:   'border-blue-500/20 bg-blue-500/5',
    green:  'border-emerald-500/20 bg-emerald-500/5',
    amber:  'border-amber-500/20 bg-amber-500/5',
    red:    'border-red-500/20 bg-red-500/5',
    purple: 'border-purple-500/20 bg-purple-500/5',
    slate:  'border-slate-700 bg-slate-800/40',
  };
  const textTones = {
    blue: 'text-blue-400', green: 'text-emerald-400', amber: 'text-amber-400',
    red: 'text-red-400', purple: 'text-purple-400', slate: 'text-slate-300',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} className={textTones[tone] || 'text-slate-400'} />}
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</span>
      </div>
      {loading
        ? <div className="h-7 w-20 bg-slate-700/50 rounded animate-pulse" />
        : <p className={`text-2xl font-bold ${textTones[tone] || 'text-slate-200'}`}>{value}</p>
      }
      {sub && !loading && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, icon: Icon, children, actions }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={15} className="text-slate-400" />}
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function PeriodFilter({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[7, 30, 90].map(d => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            value === d
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function ExecutiveDashboard({ companyId }) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [metrics, setMetrics] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [aging, setAging] = useState({ buckets: [], totalValue: 0, totalCount: 0 });
  const [heatmap, setHeatmap] = useState({ cells: [], maxValue: 0 });
  const [rankings, setRankings] = useState({ debtors: [], templates: [], strategies: [] });
  const [temporal, setTemporal] = useState({ daily: [], weekly: [], monthly: [] });

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [m, f, a, h, r, t] = await Promise.allSettled([
        getFullOperationalMetrics(companyId, { days }),
        getCollectionFunnel(companyId, { days }),
        getDetailedAging(companyId),
        getSendHeatmap(companyId, { days: Math.max(days, 60) }),
        getRankings(companyId, { days }),
        getTemporalAggregations(companyId, { days }),
      ]);

      const settle = (r, fb) => r.status === 'fulfilled' ? r.value : fb;
      setMetrics(settle(m, null));
      setFunnel(settle(f, []));
      setAging(settle(a, { buckets: [], totalValue: 0, totalCount: 0 }));
      setHeatmap(settle(h, { cells: [], maxValue: 0 }));
      setRankings(settle(r, { debtors: [], templates: [], strategies: [] }));
      setTemporal(settle(t, { daily: [], weekly: [], monthly: [] }));
    } catch (err) {
      setError(err.message || 'Erro ao carregar dashboard.');
    } finally {
      setLoading(false);
    }
  }, [companyId, days]);

  useEffect(() => { load(); }, [load]);

  const wp = metrics?.whatsapp || {};
  const bol = metrics?.boletos || {};
  const aut = metrics?.automation || {};

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Dashboard Executivo</h2>
          <p className="text-xs text-slate-500 mt-0.5">Plataforma inteligente de recuperação financeira</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodFilter value={days} onChange={setDays} />
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-800/50 rounded-xl text-sm text-red-400">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KPI icon={TrendingUp} label="Enviados"       value={fmtNum(wp.totalSent)}        sub={`${fmtPct(wp.deliveryRate)} entregue`}      tone="blue"   loading={loading} />
        <KPI icon={Activity}   label="Lidos"          value={fmtNum(wp.totalRead)}         sub={`${fmtPct(wp.readRate)} taxa leitura`}       tone="green"  loading={loading} />
        <KPI icon={AlertTriangle} label="Falhas"       value={fmtNum(wp.totalFailed)}      sub={`${fmtPct(wp.errorRate)} taxa erro`}          tone={wp.totalFailed > 0 ? 'red' : 'slate'} loading={loading} />
        <KPI icon={Clock}      label="Tempo médio"    value={fmtMs(wp.avgReadLatencyMs)}  sub="até leitura"                                  tone="purple" loading={loading} />
        <KPI icon={Zap}        label="Conflitos"      value={fmtNum(bol.totalConflict)}    sub={`${fmtPct(bol.conflictRate)} taxa`}           tone={bol.totalConflict > 0 ? 'amber' : 'slate'} loading={loading} />
        <KPI icon={Target}     label="OCR usado"      value={fmtNum(bol.totalOcrUsed)}    sub={`${fmtPct(bol.ocrUsageRate)} do total`}       tone="blue"   loading={loading} />
      </div>

      {/* Circuit breaker banner */}
      {aut.circuitOpen && (
        <div className="flex items-center gap-3 p-3 bg-red-950/60 border border-red-700/50 rounded-xl">
          <Zap size={16} className="text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-300">Circuit breaker Z-API aberto</p>
            <p className="text-xs text-red-400/70">
              {aut.consecutiveFailures} falhas consecutivas · Aberto em {aut.circuitOpenedAt ? new Date(aut.circuitOpenedAt).toLocaleString('pt-BR') : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Retries alert */}
      {aut.totalRetries > 10 && (
        <div className="flex items-center gap-3 p-3 bg-amber-950/40 border border-amber-700/40 rounded-xl">
          <Activity size={16} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            <span className="font-semibold">{aut.totalRetries}</span> retries nos últimos {days}d — verifique a estabilidade da Z-API.
          </p>
        </div>
      )}

      {/* Charts row 1: Temporal + Funil */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="Envios por dia" icon={BarChart3}>
          <TimeSeriesChart
            data={temporal.daily}
            color="#3B82F6"
            label={`Últimos ${days} dias`}
          />
        </Section>
        <Section title="Funil de cobrança" icon={Target}>
          <CollectionFunnel stages={funnel} loading={loading} />
        </Section>
      </div>

      {/* Charts row 2: Aging + Heatmap */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="Aging de inadimplência" icon={AlertTriangle}>
          <AgingChart
            buckets={aging.buckets}
            totalValue={aging.totalValue}
            totalCount={aging.totalCount}
            loading={loading}
          />
        </Section>
        <Section title="Heatmap de envios" icon={Clock}>
          <SendHeatmap
            cells={heatmap.cells}
            maxValue={heatmap.maxValue}
            loading={loading}
          />
        </Section>
      </div>

      {/* Rankings */}
      <Section title="Rankings" icon={Users}>
        <RankingTable
          debtors={rankings.debtors}
          templates={rankings.templates}
          strategies={rankings.strategies}
          loading={loading}
        />
      </Section>

      {/* Monthly trend */}
      {temporal.monthly.length > 1 && (
        <Section title="Tendência mensal" icon={TrendingUp}>
          <TimeSeriesChart
            data={temporal.monthly}
            color="#8B5CF6"
            label="Envios por mês"
          />
        </Section>
      )}
    </div>
  );
}
