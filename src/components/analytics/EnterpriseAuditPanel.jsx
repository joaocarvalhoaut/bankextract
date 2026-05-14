/**
 * EnterpriseAuditPanel — ETAPA 7+8: Auditoria enterprise e segurança.
 * Timeline de audit logs com diffs before/after, trace/correlation, replay info
 * e sessões de segurança (IP, device, anomalia).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  RefreshCw,
  Shield,
  User,
} from 'lucide-react';
import { getSecuritySessions } from '../../services/observabilityService';
import { supabase } from '../../services/supabaseClient';

// ── helpers ────────────────────────────────────────────────────────────────────

function timeFull(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function timeSince(ts) {
  if (!ts) return '—';
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s atrás`;
  if (secs < 3600) return `${Math.floor(secs / 60)}min atrás`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h atrás`;
  return `${Math.floor(secs / 86400)}d atrás`;
}

const ACTION_STYLE = {
  whatsapp_charge_sent:       'text-blue-400 bg-blue-500/10',
  whatsapp_charge_simulated:  'text-indigo-400 bg-indigo-500/10',
  whatsapp_charge_failed:     'text-red-400 bg-red-500/10',
  drive_sync_conflict:        'text-amber-400 bg-amber-500/10',
  drive_sync_low_confidence:  'text-orange-400 bg-orange-500/10',
  boleto_matched:             'text-violet-400 bg-violet-500/10',
  payment_detected:           'text-emerald-400 bg-emerald-500/10',
  circuit_breaker_opened:     'text-red-400 bg-red-500/10',
  circuit_breaker_closed:     'text-emerald-400 bg-emerald-500/10',
};

function ActionBadge({ action }) {
  const style = ACTION_STYLE[action] || 'text-slate-400 bg-slate-500/10';
  return (
    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${style}`}>
      {action?.replace(/_/g, ' ') || '—'}
    </span>
  );
}

function DiffViewer({ before, after }) {
  if (!before && !after) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {before && (
        <div>
          <p className="text-[10px] text-slate-500 mb-1 font-mono">before</p>
          <pre className="text-[10px] text-red-300/80 bg-red-950/20 border border-red-800/30 rounded-lg p-2 overflow-x-auto leading-relaxed">
            {JSON.stringify(before, null, 2)}
          </pre>
        </div>
      )}
      {after && (
        <div>
          <p className="text-[10px] text-slate-500 mb-1 font-mono">after</p>
          <pre className="text-[10px] text-emerald-300/80 bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-2 overflow-x-auto leading-relaxed">
            {JSON.stringify(after, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function AuditRow({ log, expanded, onExpand }) {
  return (
    <div className="border-b border-slate-800/60 last:border-0">
      <button
        className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-slate-800/30 transition-colors text-left"
        onClick={onExpand}
      >
        <ActionBadge action={log.action} />
        <span className="flex-1 text-[11px] text-slate-500 font-mono truncate">
          {log.trace_id ? `trace:${log.trace_id.slice(-8)}` : log.registro_id ? `reg:${log.registro_id.slice(-8)}` : '—'}
        </span>
        {log.ip_address && (
          <span className="text-[10px] text-slate-600 font-mono shrink-0 hidden sm:block">{log.ip_address}</span>
        )}
        <span className="text-[10px] text-slate-500 shrink-0">{timeSince(log.created_at)}</span>
        {expanded ? <ChevronDown size={12} className="shrink-0 text-slate-500" /> : <ChevronRight size={12} className="shrink-0 text-slate-500" />}
      </button>

      {expanded && (
        <div className="px-1 pb-3 space-y-2">
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 text-[11px] font-mono space-y-1.5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {log.created_at && <><span className="text-slate-500">timestamp</span><span className="text-slate-300">{timeFull(log.created_at)}</span></>}
              {log.trace_id && <><span className="text-slate-500">trace_id</span><span className="text-slate-300 break-all">{log.trace_id}</span></>}
              {log.correlation_id && <><span className="text-slate-500">correlation</span><span className="text-slate-300 break-all">{log.correlation_id}</span></>}
              {log.session_id && <><span className="text-slate-500">session</span><span className="text-slate-300 break-all">{log.session_id}</span></>}
              {log.ip_address && <><span className="text-slate-500">ip</span><span className="text-slate-300">{log.ip_address}</span></>}
              {log.boleto_score != null && <><span className="text-slate-500">boleto_score</span><span className="text-slate-300">{log.boleto_score}</span></>}
              {log.boleto_strategy && <><span className="text-slate-500">strategy</span><span className="text-slate-300">{log.boleto_strategy}</span></>}
              {log.zapi_status && <><span className="text-slate-500">zapi_status</span><span className="text-slate-300">{log.zapi_status}</span></>}
              {log.blocked_reason && <><span className="text-slate-500">blocked</span><span className="text-amber-300">{log.blocked_reason}</span></>}
            </div>
          </div>
          <DiffViewer before={log.diff_before} after={log.diff_after} />
        </div>
      )}
    </div>
  );
}

function SessionRow({ session }) {
  const hasAnomaly = session.anomaly_flags && Object.keys(session.anomaly_flags).length > 0;
  return (
    <div className={`rounded-xl border p-3 ${hasAnomaly ? 'border-amber-800/40 bg-amber-950/10' : 'border-slate-800 bg-slate-900/40'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <User size={13} className="text-slate-500 shrink-0" />
          <div>
            <p className="text-xs font-medium text-slate-300 font-mono truncate max-w-[160px]">{session.user_id}</p>
            <p className="text-[10px] text-slate-500">{session.ip_address || '—'} · {timeSince(session.created_at)}</p>
          </div>
        </div>
        {hasAnomaly && (
          <span className="text-[10px] font-bold text-amber-300 bg-amber-900/40 border border-amber-700/30 px-1.5 py-0.5 rounded shrink-0">
            anomalia
          </span>
        )}
      </div>
      {session.user_agent && (
        <p className="text-[10px] text-slate-600 mt-1.5 truncate">{session.user_agent}</p>
      )}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

async function fetchAuditLogs(companyId, { limit = 50, action } = {}) {
  let query = supabase
    .from('automation_audit_logs')
    .select('id,action,registro_id,trace_id,correlation_id,session_id,ip_address,boleto_score,boleto_strategy,zapi_status,blocked_reason,diff_before,diff_after,created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (action) query = query.eq('action', action);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

const AUDIT_TABS = [
  { id: 'audit', label: 'Audit Trail', icon: FileText },
  { id: 'security', label: 'Sessões', icon: Shield },
];

export default function EnterpriseAuditPanel({ companyId }) {
  const [tab, setTab] = useState('audit');
  const [logs, setLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [l, s] = await Promise.allSettled([
        fetchAuditLogs(companyId, { limit: 100 }),
        getSecuritySessions(companyId, { limit: 30, byCompany: true }),
      ]);
      if (l.status === 'fulfilled') setLogs(l.value);
      if (s.status === 'fulfilled') setSessions(s.value || []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Auditoria Enterprise</h3>
          <p className="text-xs text-slate-500 mt-0.5">Trail completo, diffs, correlação e sessões de segurança</p>
        </div>
        <div className="flex items-center gap-2">
          <Eye size={13} className="text-slate-500" />
          <span className="text-xs text-slate-500">{logs.length} eventos</span>
          <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 disabled:opacity-40">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl border border-slate-800 bg-slate-900/40 w-fit">
        {AUDIT_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === id ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'audit' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          {loading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-10 bg-slate-800/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              <FileText size={20} className="mx-auto mb-2 text-slate-600" />
              Nenhum log de auditoria encontrado.
            </div>
          ) : (
            logs.map(log => (
              <AuditRow
                key={log.id}
                log={log}
                expanded={expandedId === log.id}
                onExpand={() => setExpandedId(expandedId === log.id ? null : log.id)}
              />
            ))
          )}
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-2">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-800/40 animate-pulse" />
            ))
          ) : sessions.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <Shield size={20} className="mx-auto mb-2 text-slate-600" />
              Nenhuma sessão registrada.
            </div>
          ) : (
            sessions.map(session => (
              <SessionRow key={session.id} session={session} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
