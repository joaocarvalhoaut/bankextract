import { CalendarRange, RefreshCcw } from 'lucide-react';

export default function AnalyticsFiltersBar({ filters, onChange, onRefresh, loading = false }) {
  return (
    <section className="surface-card rounded-[28px] p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Data inicial</span>
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={(event) => onChange?.({ ...filters, startDate: event.target.value })}
              className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Data final</span>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={(event) => onChange?.({ ...filters, endDate: event.target.value })}
              className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500/40"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="btn-brand inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <RefreshCcw size={15} className="animate-spin" /> : <CalendarRange size={15} />}
          {loading ? 'Atualizando...' : 'Atualizar analytics'}
        </button>
      </div>
    </section>
  );
}
