import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';

export function EmptyState({ title = 'Nenhum dado encontrado', description, action = null, icon: Icon = Inbox }) {
  return (
    <div className="empty-state flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center">
      <Icon size={32} className="mb-3 text-slate-600" />
      <p className="text-sm font-semibold text-slate-300">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Algo deu errado', description, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-16 text-center">
      <AlertTriangle size={32} className="mb-3 text-red-400" />
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500">{description}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-secondary mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 text-[13px] font-medium"
        >
          <RefreshCw size={13} />
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function LoadingSkeleton({ rows = 4, cols = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="skeleton h-9 flex-1 rounded-xl"
              style={{ animationDelay: `${(r * cols + c) * 0.05}s` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function LoadingSpinner({ size = 20, className = '' }) {
  return (
    <Loader2
      size={size}
      className={`animate-spin text-slate-500 ${className}`}
    />
  );
}
