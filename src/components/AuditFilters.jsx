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

const SEVERITY_OPTIONS = [
  { value: 'todos', label: 'Todas severidades' },
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'danger', label: 'Danger' },
];

export default function AuditFilters({ filters, onChange, onClear, resultCount }) {
  const hasActiveFilters =
    filters.group !== 'todos' ||
    filters.action !== 'todos' ||
    filters.period !== 'all' ||
    filters.search ||
    filters.userId ||
    filters.userQuery ||
    filters.entity ||
    filters.severity !== 'todos' ||
    filters.tenant ||
    filters.requestQuery;

  return (
    <div className="text-crisp rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-soft">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr]">
        <div className="relative min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Buscar por titulo, descricao ou usuario..."
            className="w-full rounded-xl border border-slate-700 bg-slate-800/50 py-3 pl-8 pr-3 text-sm outline-none ring-emerald-500 placeholder:text-slate-400 focus:ring-2"
          />
        </div>

        <div className="relative">
          <Filter size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={filters.group || 'todos'}
            onChange={(e) => onChange({ group: e.target.value })}
            className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/50 py-3 pl-8 pr-8 text-sm font-medium text-slate-200 outline-none ring-emerald-500 focus:ring-2"
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
            className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/50 py-3 pl-8 pr-8 text-sm font-medium text-slate-200 outline-none ring-emerald-500 focus:ring-2"
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
            className="w-full rounded-xl border border-slate-700 bg-slate-800/50 py-3 pl-8 pr-3 text-sm outline-none ring-emerald-500 placeholder:text-slate-400 focus:ring-2"
          />
        </div>

        <div className="relative">
          <Filter size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.entity || ''}
            onChange={(e) => onChange({ entity: e.target.value })}
            placeholder="Entidade"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/50 py-3 pl-8 pr-3 text-sm outline-none ring-emerald-500 placeholder:text-slate-400 focus:ring-2"
          />
        </div>

        <div className="relative">
          <Filter size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={filters.severity || 'todos'}
            onChange={(e) => onChange({ severity: e.target.value })}
            className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/50 py-3 pl-8 pr-8 text-sm font-medium text-slate-200 outline-none ring-emerald-500 focus:ring-2"
          >
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[0.7fr_0.9fr_1fr_auto] xl:items-start">
        <div className="relative">
          <Calendar size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={filters.period || 'all'}
            onChange={(e) => onChange({ period: e.target.value })}
            className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/50 py-3 pl-8 pr-8 text-sm font-medium text-slate-200 outline-none ring-emerald-500 focus:ring-2"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr]">
          {filters.period === 'custom' ? (
            <>
              <input
                type="date"
                value={filters.dateStart || ''}
                onChange={(e) => onChange({ dateStart: e.target.value })}
                className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
              <span className="hidden self-center text-center text-sm text-slate-400 sm:block">ate</span>
              <input
                type="date"
                value={filters.dateEnd || ''}
                onChange={(e) => onChange({ dateEnd: e.target.value })}
                className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
            </>
          ) : (
            <div className="sm:col-span-3">
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/30 px-3 py-3 text-sm text-slate-400">
                Selecione "Personalizado" para definir um intervalo manual.
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <input
            type="text"
            value={filters.tenant || ''}
            onChange={(e) => onChange({ tenant: e.target.value })}
            placeholder="Tenant / company_id"
            className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-3 text-sm outline-none ring-emerald-500 placeholder:text-slate-400 focus:ring-2"
          />

          <input
            type="text"
            value={filters.requestQuery || ''}
            onChange={(e) => onChange({ requestQuery: e.target.value })}
            placeholder="request_id / correlation_id"
            className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-3 text-sm outline-none ring-emerald-500 placeholder:text-slate-400 focus:ring-2"
          />
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onClear}
              className="control-surface flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:text-slate-50"
            >
              <X size={13} />
              Limpar
            </button>
          ) : (
            <div className="hidden xl:block xl:h-11" />
          )}

          {resultCount != null ? (
            <span className="text-xs text-slate-400">
              {resultCount} evento{resultCount !== 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
