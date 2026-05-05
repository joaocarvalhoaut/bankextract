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
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
          isOpen
            ? 'bg-emerald-50 ring-2 ring-emerald-500'
            : representative
              ? 'hover:bg-slate-100'
              : 'text-slate-400 hover:bg-slate-100'
        } disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
      >
        {representative ? (
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                representative.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
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
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {isOpen && !disabled ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 min-w-[280px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Buscar representante..."
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-xs outline-none ring-emerald-500 focus:ring-2"
              />
            </div>
          </div>

          {representative ? (
            <button
              onClick={() => onAssign(rowId, null)}
              className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
            >
              <X size={12} /> Remover representante
            </button>
          ) : null}

          <div className="max-h-60 overflow-y-auto">
            {!representatives.length ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">Nenhum representante cadastrado.</div>
            ) : (
              representatives.map((item) => (
                <div
                  key={item.id}
                  className={`group flex items-center ${item.id === representative?.id ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  <button onClick={() => onAssign(rowId, item.id)} className="flex flex-1 items-center gap-2 px-3 py-2 text-left">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                        item.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {item.nome
                        .split(' ')
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">{item.nome}</p>
                      {item.email ? <p className="truncate text-xs text-slate-500">{item.email}</p> : null}
                    </div>
                    {item.id === representative?.id ? <CheckCircle2 size={14} className="text-emerald-600" /> : null}
                  </button>
                  {allowEdit ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenEdit(item);
                      }}
                      className="px-2 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-emerald-600"
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
              className="flex w-full items-center gap-2 border-t border-slate-200 px-3 py-2.5 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              <UserPlus size={14} /> + Cadastrar novo representante
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
