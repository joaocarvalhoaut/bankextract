export default function DataTable({
  columns = [],
  rows = [],
  emptyTitle = 'Nenhum dado encontrado.',
  emptyDescription = 'Ajuste os filtros ou importe uma nova carteira.',
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50/90 backdrop-blur-sm">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 ${column.className || ''}`}
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
                  <p className="text-base font-medium text-slate-700">{emptyTitle}</p>
                  <p className="mt-2 text-sm text-slate-400">{emptyDescription}</p>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id || index} className="transition-colors hover:bg-slate-50/80">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 align-top text-sm text-slate-700 ${column.cellClassName || ''}`}
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
