import { Search, X } from 'lucide-react';

export default function TableToolbar({
  search = '',
  onSearch,
  placeholder = 'Buscar...',
  hasFilters = false,
  onClearFilters,
  filterChips = [],
  actions = null,
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-700/60 bg-slate-900/40 px-4 py-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {onSearch && (
          <div className="relative min-w-0 flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-xl border border-slate-700/80 bg-[#0b172a] py-2 pl-9 pr-3 text-[13px] text-slate-100 outline-none transition focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
        )}

        <div className="flex flex-shrink-0 items-center gap-2">
          {hasFilters && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-[12px] font-medium text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
            >
              <X size={12} />
              Limpar filtros
            </button>
          )}
          {actions}
        </div>
      </div>

      {filterChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filterChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-300"
            >
              {chip.label}
              {chip.onRemove && (
                <button type="button" onClick={chip.onRemove} className="ml-0.5 opacity-60 hover:opacity-100">
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
