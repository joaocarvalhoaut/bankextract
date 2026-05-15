import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  XCircle,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_META = {
  found:          { label: 'Encontrado',       icon: CheckCircle2, color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  sent:           { label: 'Enviado',           icon: CheckCircle2, color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  conflict:       { label: 'Conflito',          icon: AlertTriangle,color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25' },
  low_confidence: { label: 'Baixa confiança',   icon: Search,       color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25' },
  ocr_used:       { label: 'OCR aplicado',      icon: Eye,          color: 'text-blue-300',    bg: 'bg-blue-500/10',    border: 'border-blue-500/25' },
  blocked:        { label: 'Bloqueado',         icon: Shield,       color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-500/25' },
  failed:         { label: 'Falhou',            icon: XCircle,      color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-500/25' },
  simulated:      { label: 'Simulado',          icon: Eye,          color: 'text-violet-300',  bg: 'bg-violet-500/10',  border: 'border-violet-500/25' },
  retry:          { label: 'Aguardando retry',  icon: Clock,        color: 'text-violet-300',  bg: 'bg-violet-500/10',  border: 'border-violet-500/25' },
  pending:        { label: 'Pendente',          icon: FileText,     color: 'text-slate-400',   bg: 'bg-slate-800/40',   border: 'border-slate-700' },
};

function resolveAuditStatus(log) {
  if (log.zapi_status === 'sent') return 'sent';
  if (log.zapi_status === 'simulated') return 'simulated';
  if (log.action === 'whatsapp_charge_simulated') return 'simulated';
  if (log.blocked_reason?.startsWith('conflict')) return 'conflict';
  if (log.blocked_reason?.startsWith('baixa_confianca') || log.blocked_reason === 'baixa_confianca') return 'low_confidence';
  if (log.blocked_reason) return 'blocked';
  if (log.zapi_status === 'failed') return 'failed';
  if (log.ocr_used) return 'ocr_used';
  if (log.boleto_file_id) return 'found';
  return 'pending';
}

function ScoreBadge({ score }) {
  if (score == null) return null;
  const color =
    score >= 90
      ? 'bg-emerald-500/10 text-emerald-300'
      : score >= 80
        ? 'bg-amber-500/10 text-amber-300'
        : 'bg-red-500/10 text-red-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold ${color}`}>
      {score}
    </span>
  );
}

function StatusChip({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.bg} ${meta.color} ${meta.border}`}
    >
      <Icon size={12} />
      {meta.label}
    </span>
  );
}

function AuditRow({ log, onReprocess }) {
  const [expanded, setExpanded] = useState(false);
  const status = resolveAuditStatus(log);
  const needsReview = ['conflict', 'low_confidence', 'failed'].includes(status);

  return (
    <div className={`border rounded-lg mb-2 overflow-hidden ${STATUS_META[status]?.border || 'border-slate-700'}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusChip status={status} />
            {log.ocr_used && <span className="text-xs text-blue-300 font-medium">OCR</span>}
            <span className="text-xs text-slate-500 font-mono truncate">{log.charge_id || log.registro_id || '—'}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {new Date(log.created_at).toLocaleString('pt-BR')}
            {log.template_used && ` · ${log.template_used}`}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {log.boleto_score != null && <ScoreBadge score={log.boleto_score} />}
          {needsReview && onReprocess && (
            <button
              className="p-1.5 rounded hover:bg-amber-500/10 text-amber-400 transition-colors"
              title="Reprocessar"
              onClick={(e) => {
                e.stopPropagation();
                onReprocess(log);
              }}
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-slate-700/60 bg-slate-800/40">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-xs">
            {log.blocked_reason && (
              <div className="col-span-2">
                <dt className="text-slate-500">Motivo do bloqueio</dt>
                <dd className="font-medium text-red-300">{log.blocked_reason}</dd>
              </div>
            )}
            {log.boleto_file_id && (
              <div>
                <dt className="text-slate-500">Arquivo boleto</dt>
                <dd className="font-mono truncate">{log.boleto_file_id}</dd>
              </div>
            )}
            {log.boleto_strategy && (
              <div>
                <dt className="text-slate-500">Estratégia</dt>
                <dd>{log.boleto_strategy}</dd>
              </div>
            )}
            {log.boleto_second_score != null && (
              <div>
                <dt className="text-slate-500">2º score</dt>
                <dd><ScoreBadge score={log.boleto_second_score} /></dd>
              </div>
            )}
            {log.ocr_source && (
              <div>
                <dt className="text-slate-500">Fonte OCR</dt>
                <dd>{log.ocr_source}</dd>
              </div>
            )}
            {log.pdf_validation_reason && (
              <div>
                <dt className="text-slate-500">Validação PDF</dt>
                <dd>{log.pdf_validation_reason}</dd>
              </div>
            )}
            {log.duration_ms != null && (
              <div>
                <dt className="text-slate-500">Duração</dt>
                <dd>{log.duration_ms} ms</dd>
              </div>
            )}
            {log.provider_message_id && (
              <div>
                <dt className="text-slate-500">Provider ID</dt>
                <dd className="font-mono truncate">{log.provider_message_id}</dd>
              </div>
            )}
            {log.telefone && (
              <div>
                <dt className="text-slate-500">Telefone</dt>
                <dd>{log.telefone}</dd>
              </div>
            )}
            {log.pdf_hash && (
              <div className="col-span-2">
                <dt className="text-slate-500">Hash PDF (SHA-256)</dt>
                <dd className="font-mono text-[10px] break-all">{log.pdf_hash}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

function SummaryBar({ logs }) {
  const counts = logs.reduce((acc, log) => {
    const s = resolveAuditStatus(log);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const items = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {items.map(([status, count]) => (
        <div
          key={status}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${STATUS_META[status]?.bg || 'bg-slate-800/40'} ${STATUS_META[status]?.border || 'border-slate-700'} ${STATUS_META[status]?.color || 'text-slate-400'}`}
        >
          {count} {STATUS_META[status]?.label || status}
        </div>
      ))}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function BoletoMatchStatus({ companyId, supabase, onReprocess }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [limit] = useState(50);

  const load = useCallback(async () => {
    if (!companyId || !supabase) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('automation_audit_logs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (filter !== 'all') {
        if (filter === 'conflict') query = query.like('blocked_reason', 'conflict%');
        else if (filter === 'low_confidence') query = query.like('blocked_reason', 'baixa_confianca%');
        else if (filter === 'blocked') query = query.not('blocked_reason', 'is', null);
        else if (filter === 'sent') query = query.eq('zapi_status', 'sent');
        else if (filter === 'simulated') query = query.eq('zapi_status', 'simulated');
        else if (filter === 'ocr') query = query.eq('ocr_used', true);
        else if (filter === 'failed') query = query.eq('zapi_status', 'failed');
      }

      const { data, error: dbError } = await query;
      if (dbError) throw dbError;
      setLogs(data || []);
    } catch (err) {
      setError(err.message || 'Erro ao carregar logs');
    } finally {
      setLoading(false);
    }
  }, [companyId, supabase, filter, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = search
    ? logs.filter(
        (l) =>
          (l.charge_id || '').toLowerCase().includes(search.toLowerCase()) ||
          (l.registro_id || '').toLowerCase().includes(search.toLowerCase()) ||
          (l.telefone || '').includes(search) ||
          (l.boleto_file_id || '').toLowerCase().includes(search.toLowerCase()),
      )
    : logs;

  const filterOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'sent', label: 'Enviados' },
    { value: 'simulated', label: 'Simulados' },
    { value: 'conflict', label: 'Conflito' },
    { value: 'low_confidence', label: 'Baixa confiança' },
    { value: 'blocked', label: 'Bloqueados' },
    { value: 'ocr', label: 'OCR' },
    { value: 'failed', label: 'Falhou' },
  ];

  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 shadow-card">
      {/* header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-slate-400" />
          <h2 className="text-base font-semibold text-slate-50">Status de correspondência — Boletos</h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 transition-colors disabled:opacity-40"
          title="Atualizar"
          aria-label="Atualizar logs"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="px-5 py-4">
        {/* filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === opt.value
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : 'bg-slate-800/40 text-slate-300 border-slate-700 hover:bg-slate-800/60'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* search */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por charge_id, telefone, arquivo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-700 bg-slate-800/40 text-slate-200 placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50"
          />
        </div>

        {/* summary */}
        {!loading && logs.length > 0 && <SummaryBar logs={filtered} />}

        {/* content */}
        {loading && (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">Carregando...</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-300">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            {logs.length === 0 ? 'Nenhum registro de auditoria encontrado.' : 'Nenhum resultado para o filtro selecionado.'}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div>
            {filtered.map((log) => (
              <AuditRow key={log.id} log={log} onReprocess={onReprocess} />
            ))}
            {logs.length === limit && (
              <p className="text-xs text-center text-slate-400 mt-2">Exibindo os {limit} registros mais recentes.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
