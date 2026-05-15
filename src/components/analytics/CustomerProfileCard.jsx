/**
 * CustomerProfileCard — ETAPA 6: Payment Intelligence.
 * Exibe perfis financeiros dos clientes: score de pagamento, risco, sazonalidade,
 * melhor horário e dia para envio, tendência e histórico de pagamentos.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Clock,
  RefreshCw,
  ShieldAlert,
  Star,
  TrendingDown,
  TrendingUp,
  User,
} from 'lucide-react';
import { getCustomerProfiles } from '../../services/observabilityService';

// ── helpers ────────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function ScoreGauge({ value, label, color }) {
  const clamped = Math.min(Math.max(value || 0, 0), 100);
  const hue = color || (clamped >= 70 ? '#10B981' : clamped >= 40 ? '#F59E0B' : '#EF4444');
  return (
    <div className="text-center">
      <div
        className="text-xl font-bold"
        style={{ color: hue }}
      >
        {clamped.toFixed(0)}
      </div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function TrendIcon({ trend }) {
  if (trend === 'improving') return <TrendingUp size={12} className="text-emerald-400" />;
  if (trend === 'worsening') return <TrendingDown size={12} className="text-red-400" />;
  return <span className="text-[10px] text-slate-500">—</span>;
}

function ProfileCard({ profile }) {
  return (
    <div className={`rounded-xl border p-4 transition-colors hover:border-slate-600 ${
      profile.is_critical ? 'border-red-800/60 bg-red-950/20' :
      profile.is_high_risk ? 'border-amber-800/40 bg-amber-950/10' :
      'border-slate-800 bg-slate-900/40'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
            <User size={13} className="text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200 truncate max-w-[140px]">{profile.customer_name || profile.customer_id}</p>
            <p className="text-[10px] text-slate-500 font-mono truncate">{profile.customer_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {profile.is_critical && <ShieldAlert size={13} className="text-red-400" />}
          {profile.is_high_risk && !profile.is_critical && <AlertTriangle size={13} className="text-amber-400" />}
          <TrendIcon trend={profile.trend} />
        </div>
      </div>

      {/* Score gauges */}
      <div className="grid grid-cols-3 gap-2 mb-3 py-2 border-y border-slate-800/60">
        <ScoreGauge value={profile.payment_score} label="Pagamento" />
        <ScoreGauge
          value={100 - (profile.default_risk_score || 0)}
          label="Saúde"
          color={profile.default_risk_score > 60 ? '#EF4444' : profile.default_risk_score > 30 ? '#F59E0B' : '#10B981'}
        />
        <ScoreGauge value={(profile.response_probability || 0) * 100} label="Resposta" color="#3B82F6" />
      </div>

      {/* Optimal timing */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {profile.best_send_hour != null && (
          <div className="flex items-center gap-1.5 text-slate-400">
            <Clock size={10} className="text-slate-500" />
            Melhor hora: <span className="text-slate-200 font-medium">{String(profile.best_send_hour).padStart(2, '0')}h</span>
          </div>
        )}
        {profile.best_send_day_of_week != null && (
          <div className="flex items-center gap-1.5 text-slate-400">
            <Calendar size={10} className="text-slate-500" />
            Melhor dia: <span className="text-slate-200 font-medium">{DAY_NAMES[profile.best_send_day_of_week] || '—'}</span>
          </div>
        )}
        {profile.payment_probability != null && (
          <div className="flex items-center gap-1.5 text-slate-400">
            <Star size={10} className="text-slate-500" />
            Prob. pag.: <span className="text-emerald-300 font-medium">{(profile.payment_probability * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

const RISK_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'critical', label: 'Críticos' },
  { id: 'high_risk', label: 'Alto risco' },
  { id: 'healthy', label: 'Saudáveis' },
];

export default function CustomerProfileCard({ companyId }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await getCustomerProfiles(companyId, { limit: 60 });
      setProfiles(data || []);
    } catch { setProfiles([]); } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const filtered = profiles.filter(p => {
    if (filter === 'critical') return p.is_critical;
    if (filter === 'high_risk') return p.is_high_risk && !p.is_critical;
    if (filter === 'healthy') return !p.is_critical && !p.is_high_risk;
    return true;
  });

  const counts = {
    critical: profiles.filter(p => p.is_critical).length,
    high_risk: profiles.filter(p => p.is_high_risk && !p.is_critical).length,
    healthy: profiles.filter(p => !p.is_critical && !p.is_high_risk).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Inteligência de Pagamento</h3>
          <p className="text-xs text-slate-500 mt-0.5">Perfis financeiros, risco e timing otimizado por cliente</p>
        </div>
        <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 disabled:opacity-40">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary pills */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: 'Críticos', count: counts.critical, color: 'border-red-800/50 bg-red-950/30 text-red-300' },
          { label: 'Alto risco', count: counts.high_risk, color: 'border-amber-800/50 bg-amber-950/30 text-amber-300' },
          { label: 'Saudáveis', count: counts.healthy, color: 'border-emerald-800/50 bg-emerald-950/30 text-emerald-300' },
        ].map(({ label, count, color }) => (
          <div key={label} className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${color}`}>
            {count} <span className="text-xs font-normal opacity-70">{label}</span>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex gap-1 flex-wrap">
        {RISK_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              filter === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm flex flex-col items-center gap-2">
          <User size={24} className="text-slate-600" />
          {profiles.length === 0 ? 'Nenhum perfil gerado ainda.' : 'Nenhum cliente para este filtro.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(profile => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      )}
    </div>
  );
}
