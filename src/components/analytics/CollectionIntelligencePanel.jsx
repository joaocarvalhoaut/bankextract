/**
 * CollectionIntelligencePanel — ETAPA 5: Inteligência de cobrança.
 * Exibe scores de cobrança, priorização, template recomendado e horário ótimo.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Brain,
  Clock,
  RefreshCw,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { getCollectionScores } from '../../services/observabilityService';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(v) {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(0)}k`;
  return `R$ ${Number(v || 0).toFixed(0)}`;
}

function UrgencyBadge({ level }) {
  const config = {
    critical: 'bg-red-900/60 text-red-300 border-red-700/40',
    high:     'bg-orange-900/60 text-orange-300 border-orange-700/40',
    medium:   'bg-amber-900/60 text-amber-300 border-amber-700/40',
    low:      'bg-slate-800 text-slate-400 border-slate-700/40',
  };
  return (
    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${config[level] || config.low}`}>
      {level || 'low'}
    </span>
  );
}

function ScoreBar({ value, max = 100 }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct >= 80 ? '#EF4444' : pct >= 60 ? '#F97316' : pct >= 40 ? '#EAB308' : '#3B82F6';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{Math.round(value)}</span>
    </div>
  );
}

function ScoreCard({ score }) {
  const rf = score.registro;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{rf?.nome || '—'}</p>
          <p className="text-[11px] text-slate-500 truncate">{rf?.documento || '—'}</p>
        </div>
        <UrgencyBadge level={score.urgency_level} />
      </div>

      <div className="space-y-1 mb-2">
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <span>Prioridade</span>
        </div>
        <ScoreBar value={score.priority_score || 0} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {score.recommended_template && (
          <div className="flex items-center gap-1">
            <Target size={10} className="text-slate-500" />
            <span className="text-slate-400 capitalize">{score.recommended_template}</span>
          </div>
        )}
        {score.recommended_hour != null && (
          <div className="flex items-center gap-1">
            <Clock size={10} className="text-slate-500" />
            <span className="text-slate-400">{String(score.recommended_hour).padStart(2, '0')}h</span>
          </div>
        )}
        {score.predicted_payment_prob != null && (
          <div className="flex items-center gap-1">
            <TrendingUp size={10} className="text-slate-500" />
            <span className="text-slate-400">{(score.predicted_payment_prob * 100).toFixed(0)}% pag.</span>
          </div>
        )}
        {rf?.valor != null && (
          <div className="flex items-center gap-1">
            <Zap size={10} className="text-slate-500" />
            <span className="text-slate-400">{fmtBRL(rf.valor)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

const URGENCY_FILTERS = ['all', 'critical', 'high', 'medium', 'low'];

export default function CollectionIntelligencePanel({ companyId }) {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await getCollectionScores(companyId, { limit: 50 });
      setScores(data || []);
    } catch { setScores([]); } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? scores : scores.filter(s => s.urgency_level === filter);

  const counts = URGENCY_FILTERS.slice(1).reduce((acc, u) => {
    acc[u] = scores.filter(s => s.urgency_level === u).length;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Inteligência de Cobrança</h3>
          <p className="text-xs text-slate-500 mt-0.5">Priorização adaptativa, template e horário recomendado</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-2">
        {URGENCY_FILTERS.slice(1).map(u => (
          <div key={u} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2 text-center">
            <p className="text-lg font-bold text-slate-100">{counts[u] || 0}</p>
            <p className="text-[10px] text-slate-500 capitalize">{u}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-1 flex-wrap">
        {URGENCY_FILTERS.map(u => (
          <button
            key={u}
            onClick={() => setFilter(u)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
              filter === u ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {u === 'all' ? 'Todos' : u}
          </button>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm flex flex-col items-center gap-2">
          <Brain size={24} className="text-slate-600" />
          {scores.length === 0 ? 'Nenhum score calculado. Execute uma sincronização.' : 'Nenhum resultado para este filtro.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(score => (
            <ScoreCard key={score.id} score={score} />
          ))}
        </div>
      )}
    </div>
  );
}
