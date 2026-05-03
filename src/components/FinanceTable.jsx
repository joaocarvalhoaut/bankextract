import { ArrowUpDown, Download, FileSpreadsheet, Filter, MessageSquare, Search, Trash2, X } from 'lucide-react';
import RepresentanteDropdown from './RepresentanteDropdown';
import { formatCurrencyBRL, formatDateBR } from '../utils/format';
import { canUserPerformAction } from '../services/permissionsService';

export default function FinanceTable({
  rows,
  allRows,
  representatives,
  search,
  setSearch,
  filters,
  toggleFilter,
  clearFilters,
  sortBy,
  toggleSort,
  getUniqueColumnValues,
  page,
  setPage,
  totalPages,
  itemsPerPage,
  selectedRows,
  toggleRowSelection,
  toggleAllPageRows,
  deleteSelectedRows,
  editingCell,
  editingValue,
  setEditingValue,
  startCellEdit,
  saveCellEdit,
  cancelCellEdit,
  openFilterDropdown,
  setOpenFilterDropdown,
  openRepresentativeDropdown,
  setOpenRepresentativeDropdown,
  representativeSearch,
  setRepresentativeSearch,
  representativesFiltered,
  assignRepresentative,
  openNewRepresentativeModal,
  openEditRepresentativeModal,
  exportRows,
  clearOverview,
  showCompanyColumn = false,
  globalMode = false,
  onWhatsAppCharge,
  userRole = 'membro',
}) {
  const canDelete       = canUserPerformAction(userRole, 'excluir_registros');
  const canExport       = canUserPerformAction(userRole, 'exportar_csv');
  const canClearView    = canUserPerformAction(userRole, 'limpar_visao');
  const canEdit         = canUserPerformAction(userRole, 'editar_registro');
  const canChargeWA     = canUserPerformAction(userRole, 'cobrar_whatsapp');
  const columns = [
    ...(showCompanyColumn ? [{ campo: 'empresaNome', label: 'Empresa', width: 'min-w-[200px]' }] : []),
    { campo: 'nome', label: 'Nome', width: 'min-w-[220px]' },
    { campo: 'numeroBoleto', label: 'NumeroBoleto', width: 'w-[140px]' },
    { campo: 'dataVencimento', label: 'DataVencimento', width: 'w-[130px]' },
    { campo: 'valor', label: 'Valor', width: 'w-[130px]' },
    { campo: 'juros', label: 'Juros', width: 'w-[120px]' },
    { campo: 'multa', label: 'Multa', width: 'w-[120px]' },
    { campo: 'valorAtualizado', label: 'ValorAtualizado', width: 'w-[150px]' },
    { campo: 'telefone', label: 'Telefone', width: 'w-[150px]' },
    { campo: 'observacao', label: 'Observacao', width: 'min-w-[200px]' },
    { campo: 'representanteId', label: 'Representante', width: 'w-[220px]' },
    { campo: 'status', label: 'Status', width: 'w-[140px]' }
  ];

  const hasFilters = Object.values(filters).some((values) => values?.length > 0) || Boolean(search);

  const statusLabel = (status) => {
    if (status === 'negociacao') return 'Negociacao';
    if (status === 'promessa') return 'Promessa';
    if (status === 'liquidado') return 'Liquidado';
    return 'Pendente';
  };

  const statusClasses = (status) => {
    if (status === 'liquidado') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === 'negociacao') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (status === 'promessa') return 'border-blue-200 bg-blue-50 text-blue-700';
    return 'border-slate-200 bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Visao Geral</h2>
          <p className="text-sm text-slate-600">{allRows.length} registros totais · {representatives.length} representantes cadastrados</p>
          {globalMode ? (
            <p className="mt-1 text-xs text-amber-700">Modo global ativo. Selecione uma empresa especifica para cadastrar representantes.</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!!selectedRows.size && canDelete && (
            <button onClick={() => deleteSelectedRows()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 size={14} /> Excluir ({selectedRows.size})
            </button>
          )}
          {!!selectedRows.size && !globalMode && onWhatsAppCharge && canChargeWA ? (
            <button
              type="button"
              onClick={() => onWhatsAppCharge(selectedRows)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              <MessageSquare size={14} />
              Cobrar WhatsApp ({selectedRows.size})
            </button>
          ) : null}
          {canExport && (
            <button onClick={() => exportRows('csv')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
              <Download size={14} /> CSV
            </button>
          )}
          {canExport && (
            <button onClick={() => exportRows('xls')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
              <FileSpreadsheet size={14} /> Excel
            </button>
          )}
          {canClearView && (
            <button onClick={clearOverview} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 size={14} /> Limpar visao
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar em todos os campos..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none ring-emerald-500 focus:ring-2"
            />
          </div>
          {hasFilters ? (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              <X size={14} /> Limpar filtros
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-10 border-r border-slate-200 px-3 py-2">
                  <input type="checkbox" checked={rows.length > 0 && selectedRows.size === rows.length} onChange={toggleAllPageRows} />
                </th>
                <th className="w-12 border-r border-slate-200 px-2 py-2 text-center text-xs font-medium text-slate-500">#</th>
                {columns.map((column) => (
                  <th key={column.campo} className={`${column.width} relative border-r border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-700`} data-filter-dropdown>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleSort(column.campo)} className="inline-flex items-center gap-1 hover:text-emerald-600">
                        {column.label}
                        <ArrowUpDown size={12} className={sortBy.campo === column.campo ? 'text-emerald-600' : 'text-slate-400'} />
                      </button>
                      {['juros', 'multa', 'valorAtualizado'].includes(column.campo) ? null : (
                        <button onClick={() => setOpenFilterDropdown(openFilterDropdown === column.campo ? null : column.campo)} className={`ml-auto rounded p-1 hover:bg-slate-200 ${filters[column.campo]?.length ? 'text-emerald-600' : 'text-slate-400'}`}>
                          <Filter size={12} />
                        </button>
                      )}
                    </div>

                    {openFilterDropdown === column.campo ? (
                      <div className="absolute left-0 top-full z-20 mt-1 max-h-72 min-w-[220px] overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-soft">
                        <div className="mb-2 px-2 text-xs font-medium text-slate-500">Filtrar {column.label}</div>
                        {getUniqueColumnValues(column.campo).map((value) => (
                          <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50">
                            <input type="checkbox" checked={filters[column.campo]?.includes(value) || false} onChange={() => toggleFilter(column.campo, value)} />
                            <span className="truncate text-xs text-slate-700">{value || '(vazio)'}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </th>
                ))}
                <th className="w-[70px] px-3 py-2 text-left text-xs font-medium text-slate-700">Acoes</th>
              </tr>
            </thead>

            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={columns.length + 3} className="py-16 text-center text-slate-400">Nenhum registro encontrado.</td>
                </tr>
              ) : rows.map((row, index) => {
                const representative = representatives.find((item) => item.id === row.representanteId);
                const dropdownOpen = openRepresentativeDropdown === row.id;

                return (
                  <tr key={row.id} className={`border-t border-slate-100 ${selectedRows.has(row.id) ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}`}>
                    <td className="border-r border-slate-100 px-3 py-2">
                      <input type="checkbox" checked={selectedRows.has(row.id)} onChange={() => toggleRowSelection(row.id)} />
                    </td>
                    <td className="border-r border-slate-100 px-2 py-2 text-center text-xs text-slate-400">{(page - 1) * itemsPerPage + index + 1}</td>

                    {columns.map((column) => {
                      const isEditing = editingCell?.id === row.id && editingCell?.campo === column.campo;

                      if (column.campo === 'representanteId') {
                        return (
                          <td key={column.campo} className="border-r border-slate-100 px-2 py-1.5">
                            <RepresentanteDropdown
                              rowId={row.id}
                              representative={representative}
                              isOpen={dropdownOpen}
                              disabled={globalMode}
                              disabledMessage="Selecione uma empresa especifica para cadastrar representantes."
                              search={representativeSearch}
                              onSearchChange={setRepresentativeSearch}
                              onToggle={() => {
                                setOpenRepresentativeDropdown(dropdownOpen ? null : row.id);
                                setRepresentativeSearch('');
                              }}
                              onAssign={assignRepresentative}
                              onOpenNew={openNewRepresentativeModal}
                              onOpenEdit={openEditRepresentativeModal}
                              representatives={representativesFiltered}
                            />
                          </td>
                        );
                      }

                      if (column.campo === 'status') {
                        return (
                          <td key={column.campo} className="border-r border-slate-100 px-3 py-2">
                            {isEditing ? (
                              <select
                                autoFocus
                                value={editingValue}
                                onChange={(event) => setEditingValue(event.target.value)}
                                onBlur={saveCellEdit}
                                className="w-full rounded border border-emerald-500 px-2 py-1.5 text-sm outline-none"
                              >
                                <option value="pendente">Pendente</option>
                                <option value="negociacao">Negociacao</option>
                                <option value="promessa">Promessa</option>
                                {row.status === 'liquidado' ? <option value="liquidado">Liquidado</option> : null}
                              </select>
                            ) : (
                              <button className="w-full text-left" onDoubleClick={() => row.status !== 'liquidado' && startCellEdit(row.id, 'status', row.status)}>
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(row.status)}`}>
                                  {statusLabel(row.status)}
                                </span>
                              </button>
                            )}
                          </td>
                        );
                      }

                      if (['juros', 'multa', 'valorAtualizado', 'valor'].includes(column.campo)) {
                        return (
                          <td key={column.campo} className="border-r border-slate-100 px-3 py-2 text-right font-medium">
                            {isEditing ? (
                              <input
                                autoFocus
                                type="number"
                                step="0.01"
                                value={editingValue}
                                onChange={(event) => setEditingValue(event.target.value)}
                                onBlur={saveCellEdit}
                                onKeyDown={(event) => event.key === 'Enter' ? saveCellEdit() : event.key === 'Escape' ? cancelCellEdit() : null}
                                className="w-full rounded border border-emerald-500 px-2 py-1 text-right text-sm outline-none"
                              />
                            ) : (
                              <button className="w-full text-right" onDoubleClick={() => column.campo === 'valor' && startCellEdit(row.id, column.campo, row[column.campo])}>
                                {formatCurrencyBRL(row[column.campo])}
                              </button>
                            )}
                          </td>
                        );
                      }

                      if (column.campo === 'dataVencimento') {
                        return (
                          <td key={column.campo} className="border-r border-slate-100 px-3 py-2">
                            {isEditing ? (
                              <input
                                autoFocus
                                type="date"
                                value={editingValue}
                                onChange={(event) => setEditingValue(event.target.value)}
                                onBlur={saveCellEdit}
                                onKeyDown={(event) => event.key === 'Enter' ? saveCellEdit() : event.key === 'Escape' ? cancelCellEdit() : null}
                                className="w-full rounded border border-emerald-500 px-2 py-1 text-sm outline-none"
                              />
                            ) : (
                              <button className="w-full text-left" onDoubleClick={() => startCellEdit(row.id, column.campo, row[column.campo])}>
                                {formatDateBR(row[column.campo])}
                              </button>
                            )}
                          </td>
                        );
                      }

                      return (
                        <td key={column.campo} className="border-r border-slate-100 px-3 py-2">
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editingValue}
                              onChange={(event) => setEditingValue(event.target.value)}
                              onBlur={saveCellEdit}
                              onKeyDown={(event) => event.key === 'Enter' ? saveCellEdit() : event.key === 'Escape' ? cancelCellEdit() : null}
                              className="w-full rounded border border-emerald-500 px-2 py-1 text-sm outline-none"
                            />
                          ) : (
                            <button className={`w-full text-left ${column.campo === 'nome' ? 'font-medium text-slate-900' : ''}`} onDoubleClick={() => canEdit ? startCellEdit(row.id, column.campo, row[column.campo]) : null}>
                              {row[column.campo] || <span className="italic text-slate-400">vazio</span>}
                            </button>
                          )}
                        </td>
                      );
                    })}

                    {canDelete && (
                      <td className="px-3 py-2 text-red-600">
                        <button onClick={() => deleteSelectedRows(new Set([row.id]))} className="rounded p-1.5 hover:bg-red-50">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>

            {rows.length ? (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={showCompanyColumn ? 7 : 6} className="border-r border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Total da pagina ({rows.length} registros)</td>
                  <td className="border-r border-slate-200 px-3 py-2 text-right font-medium">{formatCurrencyBRL(rows.reduce((sum, row) => sum + row.juros, 0))}</td>
                  <td className="border-r border-slate-200 px-3 py-2 text-right font-medium">{formatCurrencyBRL(rows.reduce((sum, row) => sum + row.multa, 0))}</td>
                  <td className="border-r border-slate-200 px-3 py-2 text-right font-medium">{formatCurrencyBRL(rows.reduce((sum, row) => sum + row.valorAtualizado, 0))}</td>
                  <td colSpan={5} className="px-3 py-2 text-xs text-slate-500">
                    Filtro total: <strong>{formatCurrencyBRL(allRows.reduce((sum, row) => sum + row.valorAtualizado, 0))}</strong>
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">Pagina {page} de {totalPages} · {allRows.length} registros</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-40">{'<<'}</button>
              <button onClick={() => setPag
