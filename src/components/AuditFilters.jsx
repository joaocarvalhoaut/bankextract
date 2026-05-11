import { Calendar, Filter, Search, User, X } from 'lucide-react';
import { ACTION_META } from '../services/auditTimelineService';

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Todo periodo' },
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'custom', label: 'Personalizado' },
];

const GROUP_OPTIONS = [
  { value: 'todos', label: 'Todos os grupos' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'cobranca', label: 'Cobranca' },
  { value: 'automacao', label: 'Automacoes' },
  { value: 'sistema', label: 'Sistema' },
  { value: 'usuarios', label: 'Usuarios' },
];

const ACTION_OPTIONS = [
  { value: 'todos', label: 'Todas as acoes' },
  ...Object.entries(ACTION_META).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
];

export default function AuditFilters({ filters, onChange, onClear, resultCount }) {
  const hasActiveFilters =
    filters.group !== 'todos' ||
    filters.action !== 'todos' ||
    filters.period !== 'all' ||
    filters.search ||
    filters.userId ||
    filters.userQuery ||
    filters.entity;

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-soft">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr]">
        <div className="relative min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Buscar por titulo, descricao ou usuario..."
            className="w-full rounded-xl border border-slate-700 bg-slate-800/40 py-2.5 pl-8 pr-3 text-sm outline-none ring-emerald-500 placeholder:text-slate-400 focus:ring-2"
          />
        </div>

        <div className="relative">
          <Filter size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={filters.group || 'todos'}
            onChange={(e) => onChange({ group: e.target.value })}
            className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/40 py-2.5 pl-8 pr-8 text-sm font-medium text-slate-200 outline-none ring-emerald-500 focus:ring-2"
          >
            {GROUP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Filter size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={filters.action || 'todos'}
            onChange={(e) => onChange({ action: e.target.value })}
            className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/40 py-2.5 pl-8 pr-8 text-sm font-medium text-slate-200 outline-none ring-emerald-500 focus:ring-2"
          >
            {ACTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <User size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.userQuery || ''}
            onChange={(e) => onChange({ userQuery: e.target.value })}
            placeholder="Usuario"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/40 py-2.5 pl-8 pr-3 text-sm outline-none ring-emerald-500 placeholder:text-slate-400 focus:ring-2"
          />
        </div>

        <div className="relative">
          <Filter size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.entity || ''}
            onChange={(e) => onChange({ entity: e.target.value })}
            placeholder="Entidade"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/40 py-2.5 pl-8 pr-3 text-sm outline-none ring-emerald-500 placeholder:text-slate-400 focus:ring-2"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Calendar size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={filters.period || 'all'}
            onChange={(e) => onChange({ period: e.target.value })}
            className="appearance-none rounded-xl border border-slate-700 bg-slate-800/40 py-2.5 pl-8 pr-8 text-sm font-medium text-slate-200 outline-none ring-emerald-500 focus:ring-2"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {filters.period === 'custom' ? (
          <>
            <input
              type="date"
              value={filters.dateStart || ''}
              onChange={(e) => onChange({ dateStart: e.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-2.5 text-sm outline-none ring-emerald-500 focus:ring-2"
            />
            <span className="text-sm text-slate-400">ate</span>
            <input
              type="date"
              value={filters.dateEnd || ''}
              onChange={(e) => onChange({ dateEnd: e.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-2.5 text-sm outline-none ring-emerald-500 focus:ring-2"
            />
          </>
        ) : null}

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            <X size={13} />
            Limpar
          </button>
        ) : null}

        {resultCount != null ? (
          <span className="ml-auto text-xs text-slate-400">
            {resultCount} evento{resultCount !== 1 ? 's' : ''}
          </span>
        ) : null}
      </div>
    </div>
  );
}
