import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { SYNC_STATUS } from '../hooks/useAutoGoogleSheetsSync';

/**
 * Badge discreto que mostra o estado da sincronização automática com Google Sheets.
 * Visível apenas quando há algo a mostrar (syncing / synced / error).
 * Fica invisível (não ocupa espaço) quando status é idle ou no_config.
 */
export default function SyncStatusBadge({ status, message }) {
  if (!status || status === SYNC_STATUS.IDLE || status === SYNC_STATUS.NO_CONFIG) {
    return null;
  }

  const configs = {
    [SYNC_STATUS.SYNCING]: {
      icon: <Loader2 size={13} className="animate-spin" />,
      label: 'Sincronizando Google Sheets...',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    [SYNC_STATUS.SYNCED]: {
      icon: <CheckCircle2 size={13} />,
      label: 'Google Sheets sincronizado',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    [SYNC_STATUS.ERROR]: {
      icon: <AlertCircle size={13} />,
      label: message || 'Falha ao sincronizar Google Sheets',
      className: 'border-red-200 bg-red-50 text-red-700',
    },
  };

  const config = configs[status];
  if (!config) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${config.className}`}
      title={config.label}
    >
      {config.icon}
      <span className="hidden sm:inline">{config.label}</span>
    </div>
  );
}
