export default function TableBulkActions({ count, actions = [], onClear }) {
  if (!count) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-2.5">
      <span className="text-[13px] font-semibold text-blue-300">
        {count} {count === 1 ? 'registro selecionado' : 'registros selecionados'}
      </span>

      <div className="h-4 w-px bg-blue-500/30" />

      <div className="flex items-center gap-2">
        {actions.map((action, i) => (
          <button
            key={i}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50 ${
              action.variant === 'danger'
                ? 'border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                : action.variant === 'primary'
                ? 'border border-blue-500/40 bg-blue-600 text-white hover:bg-blue-700'
                : 'border border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700/60'
            }`}
          >
            {action.icon && <action.icon size={12} />}
            {action.label}
          </button>
        ))}
      </div>

      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-[12px] text-slate-500 hover:text-slate-300"
        >
          Limpar seleção
        </button>
      )}
    </div>
  );
}
