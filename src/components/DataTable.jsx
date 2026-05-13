export default function DataTable({
  columns = [],
  rows = [],
  emptyTitle = 'Nenhum dado encontrado.',
  emptyDescription = 'Ajuste os filtros ou importe uma nova carteira.',
}) {
  return (
    <div className="text-crisp overflow-hidden rounded-[28px] border border-slate-700 bg-slate-900/60 shadow-card">
      <div className="table-scroll max-h-[70vh]">
        <table className="table-sticky-head min-w-[920px] divide-y divide-slate-800">
          <thead className="border-b border-slate-700 bg-[#10213B]/92">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300 ${column.className || ''}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {!rows.length ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-16 text-center">
                  <p className="text-base font-semibold text-slate-100">{emptyTitle}</p>
                  <p className="mt-2 max-w-xl mx-auto text-sm leading-relaxed text-slate-400">{emptyDescription}</p>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id || index} className="transition-colors hover:bg-slate-800/55">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3.5 align-top text-sm text-slate-100 ${column.cellClassName || ''}`}
                    >
                      {column.render ? column.render(row, index) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
