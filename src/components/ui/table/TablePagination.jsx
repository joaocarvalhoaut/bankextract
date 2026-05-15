import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export default function TablePagination({ page, totalPages, total, onPageChange, pageSize }) {
  if (totalPages <= 1 && !total) return null;

  const from = total ? (page - 1) * (pageSize || 12) + 1 : null;
  const to = total ? Math.min(page * (pageSize || 12), total) : null;

  return (
    <div className="flex items-center justify-between border-t border-slate-700/60 bg-slate-900/30 px-4 py-3">
      <p className="text-[12px] text-slate-500">
        {total != null
          ? `${from}–${to} de ${total} registros`
          : `Página ${page} de ${totalPages}`}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-1.5 text-slate-400 transition hover:bg-slate-700/60 hover:text-slate-200 disabled:opacity-30"
          title="Primeira página"
        >
          <ChevronsLeft size={13} />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-1.5 text-slate-400 transition hover:bg-slate-700/60 hover:text-slate-200 disabled:opacity-30"
          title="Página anterior"
        >
          <ChevronLeft size={13} />
        </button>

        <span className="min-w-[60px] text-center text-[12px] font-medium text-slate-400">
          {page} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-1.5 text-slate-400 transition hover:bg-slate-700/60 hover:text-slate-200 disabled:opacity-30"
          title="Próxima página"
        >
          <ChevronRight size={13} />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-1.5 text-slate-400 transition hover:bg-slate-700/60 hover:text-slate-200 disabled:opacity-30"
          title="Última página"
        >
          <ChevronsRight size={13} />
        </button>
      </div>
    </div>
  );
}
