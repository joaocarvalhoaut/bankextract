import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  FileUp,
  Info,
  MessageSquare,
  RotateCcw,
  Settings,
  Shield,
  Star,
  Trash2,
  Upload,
  User,
  Users,
  WalletCards,
  Zap,
  ZapOff,
} from 'lucide-react';

const ACTION_ICON = {
  import_created: Upload,
  import_confirmed: Upload,
  history_deleted: Trash2,
  records_deleted: Trash2,
  view_cleared: RotateCcw,
  record_edited: WalletCards,
  export_data: FileUp,
  representative_changed: Users,
  financial_config_changed: Settings,
  charge_prepared: MessageSquare,
  collection_ai_generated: Zap,
  whatsapp_sent: MessageSquare,
  whatsapp_failed: ZapOff,
  whatsapp_simulated: MessageSquare,
  automation_executed: Zap,
  automation_simulated: Zap,
  automation_scheduled: Bell,
  plan_changed: CheckCircle2,
  limit_reached: AlertTriangle,
  trial_started: CheckCircle2,
  trial_ending: AlertTriangle,
  trial_ended: Info,
  notification_created: Bell,
  notification_read: CheckCircle2,
  user_joined: User,
  user_removed: User,
  permission_changed: Shield,
};

const COLOR_MAP = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/25', dot: 'bg-emerald-400' },
  green:   { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/25', dot: 'bg-emerald-400' },
  blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-300',    border: 'border-blue-500/25',    dot: 'bg-blue-400' },
  sky:     { bg: 'bg-sky-500/10',     text: 'text-sky-300',     border: 'border-sky-500/25',     dot: 'bg-sky-400' },
  violet:  { bg: 'bg-violet-500/10',  text: 'text-violet-300',  border: 'border-violet-500/25',  dot: 'bg-violet-400' },
  red:     { bg: 'bg-red-500/10',     text: 'text-red-300',     border: 'border-red-500/25',     dot: 'bg-red-400' },
  orange:  { bg: 'bg-orange-500/10',  text: 'text-orange-300',  border: 'border-orange-500/25',  dot: 'bg-orange-400' },
  yellow:  { bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/25',   dot: 'bg-amber-400' },
  slate:   { bg: 'bg-slate-800/60',   text: 'text-slate-300',   border: 'border-slate-700',      dot: 'bg-slate-400' },
};

const GROUP_LABELS = {
  financeiro: 'Financeiro',
  cobranca: 'Cobranca',
  automacao: 'Automacoes',
  sistema: 'Sistema',
  usuarios: 'Usuarios',
};

const SEVERITY_BADGE = {
  info:    'border-slate-700/60 bg-slate-800/40 text-slate-400',
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  danger:  'border-red-500/25 bg-red-500/10 text-red-300',
};

function formatMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return [];
  const skip = new Set(['title', 'description', 'severity', '_favorited', 'user_email']);
  return Object.entries(metadata)
    .filter(([key]) => !skip.has(key))
    .map(([key, value]) => ({
      key: key.replace(/_/g, ' '),
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));
}

export default function AuditEventCard({ event, onFavorite, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const colors = COLOR_MAP[event.color] || COLOR_MAP.slate;
  const Icon = ACTION_ICON[event.action] || Info;
  const metaEntries = formatMetadata(event.metadata);

  const handleCopy = () => {
    const text = [
      `Evento: ${event.title}`,
      `Acao: ${event.action}`,
      event.description ? `Detalhe: ${event.description}` : '',
      `Data: ${new Date(event.created_at).toLocaleString('pt-BR')}`,
      event.user_email ? `Usuario: ${event.user_email}` : '',
      event.company_id ? `Tenant: ${event.company_id}` : '',
      event.request_id ? `Request: ${event.request_id}` : '',
      event.correlation_id ? `Correlation: ${event.correlation_id}` : '',
      metaEntries.length ? `Metadata: ${metaEntries.map((entry) => `${entry.key}=${entry.value}`).join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (compact) {
    return (
      <div className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-800/40">
        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}>
          <Icon size={13} className={colors.text} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{event.title}</p>
          {event.description ? <p className="mt-0.5 truncate text-xs text-slate-500">{event.description}</p> : null}
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">
          {new Date(event.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    );
  }

  return (
    <div className="group relative flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${colors.bg} ${colors.border}`}>
          <Icon size={18} className={colors.text} />
        </div>
        <div className="mt-1 w-px flex-1 bg-slate-800/60" />
      </div>

      <div className="mb-4 min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm transition-shadow hover:shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-50">{event.title}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${colors.bg} ${colors.text} ${colors.border}`}>
                {GROUP_LABELS[event.group] || event.group}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${SEVERITY_BADGE[event.severity] || SEVERITY_BADGE.info}`}>
                {event.severity || 'info'}
              </span>
            </div>
            {event.description ? <p className="mt-1 text-sm text-slate-300">{event.description}</p> : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onFavorite?.(event)}
              title="Favoritar"
              className={`rounded-lg p-2 transition-colors ${event.favorited ? 'text-yellow-500' : 'text-slate-300 hover:bg-slate-800/50 hover:text-yellow-400'}`}
            >
              <Star size={14} fill={event.favorited ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              onClick={handleCopy}
              title="Copiar detalhes"
              className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-slate-800/50 hover:text-slate-100"
            >
              {copied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <ClipboardCopy size={14} />}
            </button>
            {metaEntries.length > 0 ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                title="Expandir metadata"
                className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-slate-800/50 hover:text-slate-100"
              >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          {event.company_id ? (
            <span className="rounded-full bg-slate-800/50 px-2 py-1 font-mono text-[10px] text-slate-300">
              tenant {event.company_id}
            </span>
          ) : null}
          {event.user_email ? (
            <span className="flex items-center gap-1">
              <User size={11} />
              {event.user_email}
            </span>
          ) : null}
          <span className="flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors.dot}`} />
            {new Date(event.created_at).toLocaleString('pt-BR')}
          </span>
          {event.entity ? (
            <span className="font-mono text-slate-300">
              {event.entity}
              {event.entity_id ? ` • ${String(event.entity_id).slice(0, 8)}` : ''}
            </span>
          ) : null}
          {event.request_id ? (
            <span className="rounded-full bg-slate-800/50 px-2 py-1 font-mono text-[10px] text-slate-300">
              req {event.request_id}
            </span>
          ) : null}
          {event.correlation_id ? (
            <span className="rounded-full bg-slate-800/50 px-2 py-1 font-mono text-[10px] text-slate-300">
              corr {event.correlation_id}
            </span>
          ) : null}
        </div>

        {expanded && metaEntries.length > 0 ? (
          <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Metadata</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {metaEntries.map(({ key, value }) => (
                <div key={key} className="min-w-0">
                  <p className="text-[10px] font-medium text-slate-400">{key}</p>
                  <p className="truncate text-xs font-semibold text-slate-200">{value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
