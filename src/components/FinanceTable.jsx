import { ArrowUpDown, Download, FileSpreadsheet, Filter, MessageSquare, Search, Trash2, UserPlus, X } from 'lucide-react';
import RepresentanteDropdown from './RepresentanteDropdown';
import { formatCurrencyBRL, formatDateBR } from '../utils/format';
import { canUserPerformAction } from '../security/permissions';

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
  userRole = 'operador',
  showPrimaryActions = true,
  onCreateRepresentative,
  savingCell,
  saveFeedback,
}) {
  const canDelete = canUserPerformAction(userRole, 'delete_financial_records');
  const canExport = canUserPerformAction(userRole, 'export_data');
  const canClearView = canUserPerformAction(userRole, 'clear_overview');
  const canEdit = canUserPerformAction(userRole, 'edit_financial_records');
  const canChargeWA = canUserPerformAction(userRole, 'manage_charges');
  const canCreateRepresentative = canUserPerformAction(userRole, 'edit_financial_records');

  const columns = [
    ...(showCompanyColumn ? [{ campo: 'empresaNome', label: 'Empresa', width: 'min-w-[200px]' }] : []),
    { campo: 'nome', label: 'Cliente / Fornecedor', width: 'min-w-[220px]' },
    { campo: 'numeroBoleto', label: 'Documento', width: 'w-[140px]' },
    { campo: 'dataVencimento', label: 'Vencimento', width: 'w-[130px]' },
    { campo: 'valor', label: 'Valor', width: 'w-[130px]' },
    { campo: 'juros', label: 'Juros', width: 'w-[120px]' },
    { campo: 'multa', label: 'Multa', width: 'w-[120px]' },
    { campo: 'valorAtualizado', label: 'Valor atualizado', width: 'w-[150px]' },
    { campo: 'telefone', label: 'Telefone', width: 'w-[150px]' },
    { campo: 'tipo', label: 'Tipo', width: 'w-[140px]' },
    { campo: 'observacao', label: 'Observações', width: 'min-w-[200px]' },
    { campo: 'representanteId', label: 'Representante', width: 'w-[220px]' },
    { campo: 'status', label: 'Status', width: 'w-[140px]' },
  ];

  const hasFilters = Object.values(filters).some((values) => values?.length > 0) || Boolean(search);

  const statusLabel = (status) => {
    if (status === 'negociacao') return 'Negociação';
    if (status === 'promessa') return 'Promessa';
    if (status === 'liquidado') return 'Liquidado';
    if (status === 'vencido') return 'Vencido';
    if (status === 'aberto') return 'Aberto';
    return 'Pendente';
  };

  const statusClasses = (status) => {
    if (status === 'liquidado') return 'border-cyan-500/30 bg-cyan-900/20 text-cyan-300';
    if (status === 'negociacao') return 'border-amber-500/30 bg-amber-900/20 text-amber-300';
    if (status === 'promessa') return 'border-blue-500/30 bg-blue-900/20 text-blue-300';
    if (status === 'vencido') return 'border-red-500/30 bg-red-900/20 text-red-300';
    if (status === 'aberto') return 'border-sky-500/30 bg-sky-900/20 text-sky-300';
    return 'border-slate-700 bg-slate-800/60 text-slate-200';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">Visão Geral</h2>
          <p className="text-sm text-slate-300">
            {allRows.length} registros totais · {representatives.length} representantes cadastrados
          </p>
          {globalMode ? (
            <p className="mt-1 text-xs text-amber-700">
              Modo global ativo. Selecione uma empresa específica para cadastrar representantes.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!globalMode && canCreateRepresentative && onCreateRepresentative ? (
            <button
              type="button"
              onClick={() => onCreateRepresentative(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <UserPlus size={14} /> Novo representante
            </button>
          ) : null}

          {!!selectedRows.size && canDelete ? (
            <button
              onClick={() => deleteSelectedRows()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> Excluir ({selectedRows.size})
            </button>
          ) : null}

          {!!selectedRows.size && !globalMode && onWhatsAppCharge && canChargeWA ? (
            <button
              type="button"
              onClick={() => onWhatsAppCharge(selectedRows)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <MessageSquare size={14} />
              Cobrar WhatsApp ({selectedRows.size})
            </button>
          ) : null}

          {showPrimaryActions && canExport ? (
            <button
              onClick={() => exportRows('csv')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm hover:bg-slate-800/40"
            >
              <Download size={14} /> CSV
            </button>
          ) : null}

          {showPrimaryActions && canExport ? (
            <button
              onClick={() => exportRows('xls')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm hover:bg-slate-800/40"
            >
              <FileSpreadsheet size={14} /> Excel
            </button>
          ) : null}

          {showPrimaryActions && canClearView ? (
            <button
              onClick={clearOverview}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-slate-900/60 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> Limpar visão
            </button>
          ) : null}
        </div>
      </div>

      <div className="surface-card rounded-xl p-3">
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
              className="w-full rounded-lg border border-slate-700 bg-[#0B172A] py-2 pl-9 pr-3 text-sm text-slate-100 outline-none ring-blue-500 focus:ring-2"
            />
          </div>
          {hasFilters ? (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60">
              <X size={14} /> Limpar filtros
            </button>
          ) : null}
        </div>
      </div>

      <div className="surface-card overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#10213B]">
              <tr>
                <th className="w-10 border-r border-slate-700 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedRows.size === rows.length}
                    onChange={toggleAllPageRows}
                  />
                </th>
                <th className="w-12 border-r border-slate-700 px-2 py-2 text-center text-xs font-medium text-slate-500">
                  #
                </th>
                {columns.map((column) => (
                  <th
                    key={column.campo}
                    className={`${column.width} relative border-r border-slate-700 px-3 py-2 text-left text-xs font-medium text-slate-200`}
                    data-filter-dropdown
                  >
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleSort(column.campo)} className="inline-flex items-center gap-1 hover:text-emerald-600">
                        {column.label}
                        <ArrowUpDown size={12} className={sortBy.campo === column.campo ? 'text-emerald-600' : 'text-slate-400'} />
                      </button>
                      {['juros', 'multa', 'valorAtualizado'].includes(column.campo) ? null : (
                        <button
                          onClick={() => setOpenFilterDropdown(openFilterDropdown === column.campo ? null : column.campo)}
                          className={`ml-auto rounded p-1 hover:bg-slate-200 ${filters[column.campo]?.length ? 'text-emerald-600' : 'text-slate-400'}`}
                        >
                          <Filter size={12} />
                        </button>
                      )}
                    </div>

                    {openFilterDropdown === column.campo ? (
                      <div className="absolute left-0 top-full z-20 mt-1 max-h-72 min-w-[220px] overflow-auto rounded-xl border border-slate-700 bg-slate-900/60 p-2 shadow-soft">
                        <div className="mb-2 px-2 text-xs font-medium text-slate-500">Filtrar {column.label}</div>
                        {getUniqueColumnValues(column.campo).map((value) => (
                          <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-800/40">
                            <input
                              type="checkbox"
                              checked={filters[column.campo]?.includes(value) || false}
                              onChange={() => toggleFilter(column.campo, value)}
                            />
                            <span className="truncate text-xs text-slate-200">{value || '(vazio)'}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </th>
                ))}
                <th className="w-[70px] px-3 py-2 text-left text-xs font-medium text-slate-200">Ações</th>
              </tr>
            </thead>

            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={columns.length + 3} className="py-16 text-center text-slate-400">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const representative = representatives.find((item) => item.id === row.representanteId);
                  const dropdownOpen = openRepresentativeDropdown === row.id;

                  return (
                    <tr
                      key={row.id}
                      className={`border-t border-slate-800 ${selectedRows.has(row.id) ? 'bg-blue-900/200/10' : 'hover:bg-slate-900/40'}`}
                    >
                      <td className="border-r border-slate-100 px-3 py-2">
                        <input type="checkbox" checked={selectedRows.has(row.id)} onChange={() => toggleRowSelection(row.id)} />
                      </td>
                      <td className="border-r border-slate-100 px-2 py-2 text-center text-xs text-slate-400">
                        {(page - 1) * itemsPerPage + index + 1}
                      </td>

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
                                disabledMessage="Selecione uma empresa específica para cadastrar representantes."
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
                              allowCreate={canCreateRepresentative}
                              allowEdit={canCreateRepresentative}
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
                                  className="w-full rounded border border-emerald-500 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none"
                                >
                                  <option value="pendente">Pendente</option>
                                  <option value="aberto">Aberto</option>
                                  <option value="vencido">Vencido</option>
                                  <option value="negociacao">Negociação</option>
                                  <option value="promessa">Promessa</option>
                                  {row.status === 'liquidado' ? <option value="liquidado">Liquidado</option> : null}
                                </select>
                              ) : (
                                <button
                                  className="w-full text-left"
                                  onDoubleClick={() => (row.status !== 'liquidado' && canEdit ? startCellEdit(row.id, 'status', row.status) : null)}
                                >
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(row.status)}`}>
                                    {statusLabel(row.status)}
                                  </span>
                                </button>
                              )}
                            </td>
                          );
                        }

                        if (column.campo === 'tipo') {
                          return (
                            <td key={column.campo} className="border-r border-slate-100 px-3 py-2">
                              {isEditing ? (
                                <select
                                  autoFocus
                                  value={editingValue}
                                  onChange={(event) => setEditingValue(event.target.value)}
                                  onBlur={saveCellEdit}
                                  className="w-full rounded border border-emerald-500 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none"
                                >
                                  <option value="vencidos">Vencidos</option>
                                  <option value="liquidacao">Liquidação</option>
                                </select>
                              ) : (
                                <button className="w-full text-left" onDoubleClick={() => (canEdit ? startCellEdit(row.id, 'tipo', row.tipo || 'vencidos') : null)}>
                                  <span className="inline-flex rounded-full border border-slate-700 bg-slate-800/40 px-2 py-0.5 text-xs font-medium text-slate-200">
                                    {row.tipo === 'liquidacao' ? 'Liquidação' : 'Vencidos'}
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
                                  onKeyDown={(event) =>
                                    event.key === 'Enter' ? saveCellEdit() : event.key === 'Escape' ? cancelCellEdit() : null
                                  }
                                  className="w-full rounded border border-emerald-500 bg-slate-800 px-2 py-1 text-right text-sm text-slate-100 caret-slate-100 outline-none"
                                />
                              ) : (
                                <button
                                  className="w-full text-right"
                                  onDoubleClick={() => (column.campo === 'valor' && canEdit ? startCellEdit(row.id, column.campo, row[column.campo]) : null)}
                                >
                                  {formatCurrencyBRL(row[column.campo])}
                                </button>
                              )}
                              {savingCell?.id === row.id && savingCell?.campo === column.campo ? (
                                <p className="mt-1 text-[11px] font-medium text-blue-600">Salvando...</p>
                              ) : null}
                              {saveFeedback?.id === row.id && saveFeedback?.campo === column.campo ? (
                                <p className={`mt-1 text-[11px] font-medium ${saveFeedback.type === 'erro' ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {saveFeedback.type === 'erro' ? 'Erro ao salvar' : '✓ salvo'}
                                </p>
                              ) : null}
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
                                  onKeyDown={(event) =>
                                    event.key === 'Enter' ? saveCellEdit() : event.key === 'Escape' ? cancelCellEdit() : null
                                  }
                                  className="w-full rounded border border-emerald-500 bg-slate-800 px-2 py-1 text-sm text-slate-100 caret-slate-100 outline-none"
                                />
                              ) : (
                                <button className="w-full text-left" onDoubleClick={() => (canEdit ? startCellEdit(row.id, column.campo, row[column.campo]) : null)}>
                                  {formatDateBR(row[column.campo])}
                                </button>
                              )}
                              {savingCell?.id === row.id && savingCell?.campo === column.campo ? (
                                <p className="mt-1 text-[11px] font-medium text-blue-600">Salvando...</p>
                              ) : null}
                              {saveFeedback?.id === row.id && saveFeedback?.campo === column.campo ? (
                                <p className={`mt-1 text-[11px] font-medium ${saveFeedback.type === 'erro' ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {saveFeedback.type === 'erro' ? 'Erro ao salvar' : '✓ salvo'}
                                </p>
                              ) : null}
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
                                onKeyDown={(event) =>
                                  event.key === 'Enter' ? saveCellEdit() : event.key === 'Escape' ? cancelCellEdit() : null
                                }
                                className="w-full rounded border border-emerald-500 bg-slate-800 px-2 py-1 text-sm text-slate-100 caret-slate-100 outline-none"
                              />
                            ) : (
                              <button
                                className={`w-full text-left ${column.campo === 'nome' ? 'font-medium text-slate-50' : ''}`}
                                onDoubleClick={() => (canEdit ? startCellEdit(row.id, column.campo, row[column.campo]) : null)}
                              >
                                {row[column.campo] || <span className="italic text-slate-400">vazio</span>}
                              </button>
                            )}
                            {savingCell?.id === row.id && savingCell?.campo === column.campo ? (
                              <p className="mt-1 text-[11px] font-medium text-blue-600">Salvando...</p>
                            ) : null}
                            {saveFeedback?.id === row.id && saveFeedback?.campo === column.campo ? (
                              <p className={`mt-1 text-[11px] font-medium ${saveFeedback.type === 'erro' ? 'text-red-600' : 'text-emerald-600'}`}>
                                {saveFeedback.type === 'erro' ? 'Erro ao salvar' : '✓ salvo'}
                              </p>
                            ) : null}
                          </td>
                        );
                      })}

                      <td className="px-3 py-2 text-red-600">
                        {canDelete ? (
                          <button onClick={() => deleteSelectedRows(new Set([row.id]))} className="rounded p-1.5 hover:bg-red-50">
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {rows.length ? (
              <tfoot className="border-t-2 border-slate-700 bg-slate-800/40">
                <tr>
                  <td colSpan={showCompanyColumn ? 7 : 6} className="border-r border-slate-700 px-3 py-2 text-xs font-medium text-slate-300">
                    Total da pagina ({rows.length} registros)
                  </td>
                  <td className="border-r border-slate-700 px-3 py-2 text-right font-medium">
                    {formatCurrencyBRL(rows.reduce((sum, row) => sum + Number(row.juros || 0), 0))}
                  </td>
                  <td className="border-r border-slate-700 px-3 py-2 text-right font-medium">
                    {formatCurrencyBRL(rows.reduce((sum, row) => sum + Number(row.multa || 0), 0))}
                  </td>
                  <td className="border-r border-slate-700 px-3 py-2 text-right font-medium">
                    {formatCurrencyBRL(rows.reduce((sum, row) => sum + Number(row.valorAtualizado || 0), 0))}
                  </td>
                  <td colSpan={6} className="px-3 py-2 text-xs text-slate-500">
                    Filtro total: <strong>{formatCurrencyBRL(allRows.reduce((sum, row) => sum + Number(row.valorAtualizado || 0), 0))}</strong>
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-700 bg-slate-800/40 px-4 py-3">
            <p className="text-xs text-slate-500">
              Pagina {page} de {totalPages} · {allRows.length} registros
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40">
                {'<<'}
              </button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40">
                {'<'}
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40">
                {'>'}
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40">
                {'>>'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
"rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40">
                {'>>'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
