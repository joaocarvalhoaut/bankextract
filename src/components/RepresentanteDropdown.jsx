import { CheckCircle2, ChevronDown, PencilLine, Search, UserPlus, X } from 'lucide-react';

export default function RepresentanteDropdown({
  rowId,
  representative,
  isOpen,
  search,
  onSearchChange,
  onToggle,
  onAssign,
  onOpenNew,
  onOpenEdit,
  representatives,
  disabled = false,
  disabledMessage = '',
  allowCreate = true,
  allowEdit = true,
}) {
  return (
    <div className="relative" data-representante-dropdown>
      <button
        onClick={() => !disabled && onToggle()}
        disabled={disabled}
        title={disabledMessage}
        className={`text-crisp flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-slate-700 px-3 py-2 text-left text-sm transition ${
          isOpen
            ? 'bg-emerald-500/10 ring-2 ring-emerald-500'
            : representative
              ? 'bg-slate-900/60 text-slate-100 hover:bg-slate-800/70'
              : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800/70'
        } disabled:cursor-not-allowed disabled:bg-slate-800/60 disabled:text-slate-300`}
      >
        {representative ? (
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                representative.ativo ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {representative.nome
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')}
            </div>
            <span className="truncate">{representative.nome}</span>
          </div>
        ) : (
          <span>Atribuir...</span>
        )}
        <ChevronDown size={14} className="text-slate-300" />
      </button>

      {isOpen && !disabled ? (
        <div className="text-crisp absolute left-0 right-0 top-full z-40 mt-1 min-w-[280px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-soft">
          <div className="border-b border-slate-800 p-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                autoFocus
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Buscar representante..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900/70 py-2 pl-7 pr-2 text-xs text-slate-100 outline-none ring-emerald-500 placeholder:text-slate-400 focus:ring-2"
              />
            </div>
          </div>

          {representative ? (
            <button
              onClick={() => onAssign(rowId, null)}
              className="flex w-full items-center gap-2 border-b border-slate-800 px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800/40"
            >
              <X size={12} /> Remover representante
            </button>
          ) : null}

          <div className="max-h-60 overflow-y-auto">
            {!representatives.length ? (
              <div className="px-3 py-4 text-center text-xs text-slate-300">Nenhum representante cadastrado.</div>
            ) : (
              representatives.map((item) => (
                <div
                  key={item.id}
                  className={`group flex items-center ${item.id === representative?.id ? 'bg-emerald-500/10' : 'hover:bg-slate-800/40'}`}
                >
                  <button onClick={() => onAssign(rowId, item.id)} className="flex flex-1 items-center gap-2 px-3 py-2 text-left">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                        item.ativo ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {item.nome
                        .split(' ')
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-50">{item.nome}</p>
                      {item.email ? <p className="truncate text-xs text-slate-300">{item.email}</p> : null}
                    </div>
                    {item.id === representative?.id ? <CheckCircle2 size={14} className="text-emerald-600" /> : null}
                  </button>
                  {allowEdit ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenEdit(item);
                      }}
                      className="px-2 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-emerald-600"
                    >
                      <PencilLine size={12} />
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {allowCreate ? (
            <button
              onClick={() => onOpenNew(rowId)}
              className="flex w-full items-center gap-2 border-t border-slate-700 px-3 py-2.5 text-left text-sm font-medium text-emerald-300 hover:bg-emerald-500/10"
            >
              <UserPlus size={14} /> + Cadastrar novo representante
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
