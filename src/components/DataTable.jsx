export default function DataTable({
  columns = [],
  rows = [],
  emptyTitle = 'Nenhum dado encontrado.',
  emptyDescription = 'Ajuste os filtros ou importe uma nova carteira.',
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="border-b border-slate-200 bg-slate-50/90">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 ${column.className || ''}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!rows.length ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-16 text-center">
                  <p className="text-base font-semibold text-slate-800">{emptyTitle}</p>
                  <p className="mt-2 text-sm text-slate-500">{emptyDescription}</p>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id || index} className="transition-colors hover:bg-slate-50/90">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3.5 align-top text-sm text-slate-800 ${column.cellClassName || ''}`}
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
