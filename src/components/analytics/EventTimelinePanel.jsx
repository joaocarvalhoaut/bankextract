/**
 * EventTimelinePanel — Visualização do event bus: eventos recentes, dead-letter,
 * correlação, trace_id, replay e filtros por tipo.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  MailWarning,
  RefreshCw,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { getRecentEvents, getDeadLetterEvents, publishEvent } from '../../services/observabilityService';

// ── helpers ────────────────────────────────────────────────────────────────────

function timeSince(ts) {
  if (!ts) return '—';
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s atrás`;
  if (secs < 3600) return `${Math.floor(secs / 60)}min atrás`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h atrás`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const EVENT_COLORS = {
  whatsapp_sent:      'text-blue-400 bg-blue-500/10 border-blue-500/20',
  whatsapp_delivered: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  whatsapp_read:      'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  whatsapp_failed:    'text-red-400 bg-red-500/10 border-red-500/20',
  boleto_found:       'text-violet-400 bg-violet-500/10 border-violet-500/20',
  boleto_conflict:    'text-amber-400 bg-amber-500/10 border-amber-500/20',
  payment_detected:   'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  circuit_opened:     'text-red-400 bg-red-500/10 border-red-500/20',
  circuit_closed:     'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

function eventStyle(type) {
  return EVENT_COLORS[type] || 'text-slate-400 bg-slate-500/10 border-slate-500/20';
}

function EventRow({ event, onExpand, expanded }) {
  const style = eventStyle(event.event_type);
  return (
    <div className="border-b border-slate-800/60 last:border-0">
      <button
        className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-slate-800/30 transition-colors text-left"
        onClick={onExpand}
      >
        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${style} shrink-0 truncate max-w-[140px]`}>
          {event.event_type}
        </span>
        <span className="flex-1 text-xs text-slate-400 truncate font-mono">
          {event.correlation_id ? `cor:${event.correlation_id.slice(-8)}` : '—'}
        </span>
        <span className="text-[10px] text-slate-500 shrink-0">{timeSince(event.created_at)}</span>
        {expanded ? <ChevronDown size={12} className="text-slate-500 shrink-0" /> : <ChevronRight size={12} className="text-slate-500 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-1 pb-3">
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 text-[11px] font-mono space-y-1.5">
            {event.trace_id && (
              <div className="flex gap-2">
                <span className="text-slate-500 w-24 shrink-0">trace_id</span>
                <span className="text-slate-300 break-all">{event.trace_id}</span>
              </div>
            )}
            {event.correlation_id && (
              <div className="flex gap-2">
                <span className="text-slate-500 w-24 shrink-0">correlation</span>
                <span className="text-slate-300 break-all">{event.correlation_id}</span>
              </div>
            )}
            {event.registro_id && (
              <div className="flex gap-2">
                <span className="text-slate-500 w-24 shrink-0">registro_id</span>
                <span className="text-slate-300 break-all">{event.registro_id}</span>
              </div>
            )}
            {event.retry_count > 0 && (
              <div className="flex gap-2">
                <span className="text-slate-500 w-24 shrink-0">retries</span>
                <span className="text-amber-300">{event.retry_count}</span>
              </div>
            )}
            {event.processed_at && (
              <div className="flex gap-2">
                <span className="text-slate-500 w-24 shrink-0">processed_at</span>
                <span className="text-slate-300">{new Date(event.processed_at).toLocaleString('pt-BR')}</span>
              </div>
            )}
            {event.payload && (
              <details className="mt-1">
                <summary className="text-slate-500 cursor-pointer hover:text-slate-300">payload</summary>
                <pre className="mt-1 text-slate-400 overflow-x-auto text-[10px] leading-relaxed">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DeadLetterRow({ event, onReplay, replaying }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-red-800/40 bg-red-950/20">
      <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-red-300">{event.event_type}</span>
          <span className="text-[10px] text-slate-500 font-mono">retry {event.retry_count ?? 0}x</span>
        </div>
        {event.error_message && (
          <p className="text-[11px] text-slate-400 truncate">{event.error_message}</p>
        )}
        <p className="text-[10px] text-slate-600 mt-0.5">{timeSince(event.created_at)}</p>
      </div>
      <button
        onClick={() => onReplay(event)}
        disabled={replaying}
        className="shrink-0 flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
      >
        <RotateCcw size={10} />
        Replay
      </button>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  'all',
  'whatsapp_sent', 'whatsapp_delivered', 'whatsapp_read', 'whatsapp_failed',
  'boleto_found', 'boleto_conflict', 'payment_detected',
  'circuit_opened', 'circuit_closed',
];

export default function EventTimelinePanel({ companyId }) {
  const [tab, setTab] = useState('recent');
  const [events, setEvents] = useState([]);
  const [deadLetters, setDeadLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replayingId, setReplayingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [showFilter, setShowFilter] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [r, d] = await Promise.allSettled([
        getRecentEvents(companyId, { limit: 50 }),
        getDeadLetterEvents(companyId, { limit: 20 }),
      ]);
      if (r.status === 'fulfilled') setEvents(r.value || []);
      if (d.status === 'fulfilled') setDeadLetters(d.value || []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleReplay = useCallback(async (event) => {
    setReplayingId(event.id);
    try {
      await publishEvent(companyId, {
        event_type: event.event_type,
        payload: event.payload,
        correlation_id: event.correlation_id,
        registro_id: event.registro_id,
        is_replay: true,
        original_event_id: event.id,
      });
      setDeadLetters(prev => prev.filter(e => e.id !== event.id));
    } catch { /* ignore */ } finally {
      setReplayingId(null);
    }
  }, [companyId]);

  const filteredEvents = typeFilter === 'all'
    ? events
    : events.filter(e => e.event_type === typeFilter);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Event Bus / Timeline</h3>
          <p className="text-xs text-slate-500 mt-0.5">Eventos do sistema, correlação e dead-letter queue</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilter(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${showFilter ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
          >
            <Filter size={12} />
            Filtrar
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Type filter */}
      {showFilter && (
        <div className="flex flex-wrap gap-1.5 p-3 rounded-xl border border-slate-800 bg-slate-900/40">
          {EVENT_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                typeFilter === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t === 'all' ? 'Todos' : t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl border border-slate-800 bg-slate-900/40 w-fit">
        {[
          { id: 'recent', label: 'Recentes', icon: Zap },
          { id: 'dead_letter', label: `Dead Letter ${deadLetters.length > 0 ? `(${deadLetters.length})` : ''}`, icon: MailWarning },
        ].map(({ id, label, icon: Icon }) => (
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

      {/* Recent events */}
      {tab === 'recent' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          {loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-10 bg-slate-800/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm flex flex-col items-center gap-2">
              <Clock size={20} className="text-slate-600" />
              Nenhum evento registrado
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] text-slate-500">{filteredEvents.length} evento{filteredEvents.length !== 1 ? 's' : ''}</p>
                <p className="text-[10px] text-slate-600 font-mono">correlation · trace · tempo</p>
              </div>
              {filteredEvents.map(event => (
                <EventRow
                  key={event.id}
                  event={event}
                  expanded={expandedId === event.id}
                  onExpand={() => setExpandedId(expandedId === event.id ? null : event.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dead letter queue */}
      {tab === 'dead_letter' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-slate-800/40 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : deadLetters.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm flex flex-col items-center gap-2">
              <MailWarning size={20} className="text-slate-600" />
              Dead letter queue vazia
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500 mb-1">{deadLetters.length} evento{deadLetters.length !== 1 ? 's' : ''} não processado{deadLetters.length !== 1 ? 's' : ''}</p>
              {deadLetters.map(event => (
                <DeadLetterRow
                  key={event.id}
                  event={event}
                  onReplay={handleReplay}
                  replaying={replayingId === event.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
