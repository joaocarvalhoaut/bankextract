import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Edit3, FileText, Save, Search, Trash2, X } from 'lucide-react';
import { formatCurrencyBRL, formatDateBR } from '../utils/format';

export default function PreviewScreen({
  preview,
  stats,
  rows,
  search,
  setSearch,
  filter,
  setFilter,
  companyName,
  editingCell,
  editingValue,
  setEditingValue,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onSelectWithoutProblems,
  onRemoveRow,
  onCancel,
  onConfirm,
  saving
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-slate-900/60 p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
              <CheckCircle2 size={20} className="text-emerald-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-50">Pré-visualização dos dados</h2>
              <p className="mt-0.5 text-sm text-slate-300">
                Revise, edite ou remova registros antes da acao manual · Origem: <span className="font-medium">{preview.origem}</span> · Destino: <span className="font-medium">{companyName}</span> · Tipo: <span className="font-medium">{preview.tipo === 'a_vencer' ? 'A vencer' : preview.tipo === 'liquidacao' ? 'Liquidacao' : 'Vencidos'}</span>
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60">
            <ArrowLeft size={14} /> Cancelar
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg bg-slate-800/40 p-3">
            <p className="text-xs text-slate-500">Extraídos</p>
            <p className="text-xl font-semibold text-slate-50">{stats.total}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3">
            <p className="text-xs text-emerald-700">Selecionados</p>
            <p className="text-xl font-semibold text-emerald-800">{stats.selecionados}</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3">
            <p className="text-xs text-amber-700">Com alertas</p>
            <p className="text-xl font-semibold text-amber-800">{stats.problemas}</p>
          </div>
          <div className="rounded-lg bg-orange-50 p-3">
            <p className="text-xs text-orange-700">Duplicados</p>
            <p className="text-xl font-semibold text-orange-800">{stats.duplicados}</p>
          </div>
          <div className="rounded-lg bg-blue-900/20 p-3">
            <p className="text-xs text-blue-700">Valor selecionado</p>
            <p className="text-xl font-semibold text-blue-800">{formatCurrencyBRL(stats.valorSelecionado)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nos registros extraidos..." className="w-full rounded-lg border border-slate-700 py-2 pl-9 pr-3 text-sm outline-none ring-emerald-500 focus:ring-2" />
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-800/60 p-1">
            {[
              { value: 'todos', label: 'Todos' },
              { value: 'sem_problema', label: 'Sem alertas' },
              { value: 'com_problema', label: 'Com alertas' },
              { value: 'duplicados', label: 'Duplicados' }
            ].map((item) => (
              <button key={item.value} onClick={() => setFilter(item.value)} className={`rounded px-3 py-1.5 text-xs ${filter === item.value ? 'bg-slate-900/60 font-medium text-slate-50 shadow-sm' : 'text-slate-300'}`}>
                {item.label}
              </button>
            ))}
          </div>
          <button onClick={onSelectAll} className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800/40">Selecionar todos</button>
          <button onClick={onClearSelection} className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800/40">Desmarcar todos</button>
          <button onClick={onSelectWithoutProblems} className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800/40">Apenas sem alertas</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/60 shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/40">
              <tr>
                <th className="w-10 border-r border-slate-700 px-3 py-2" />
                <th className="w-10 border-r border-slate-700 px-2 py-2 text-center text-xs font-medium text-slate-500">#</th>
                <th className="min-w-[220px] border-r border-slate-700 px-3 py-2 text-left text-xs font-medium text-slate-200">Nome do sacado</th>
                <th className="w-[130px] border-r border-slate-700 px-3 py-2 text-left text-xs font-medium text-slate-200">Número do boleto</th>
                <th className="w-[120px] border-r border-slate-700 px-3 py-2 text-left text-xs font-medium text-slate-200">Vencimento</th>
                <th className="w-[130px] border-r border-slate-700 px-3 py-2 text-left text-xs font-medium text-slate-200">Valor</th>
                <th className="w-[180px] border-r border-slate-700 px-3 py-2 text-left text-xs font-medium text-slate-200">Alertas</th>
                <th className="w-[60px] px-3 py-2 text-left text-xs font-medium text-slate-200">Ações</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <FileText size={32} className="mx-auto mb-2 opacity-40" />
                    Nenhum registro corresponde ao filtro.
                  </td>
                </tr>
              ) : rows.map((row, index) => {
                const selected = preview.selecionados.has(row.id);
                const hasError = row.problemas.some((item) => item.tipo === 'erro');
                const problemByField = Object.fromEntries(row.problemas.map((item) => [item.campo, item]));

                return (
                  <tr key={row.id} className={`border-t border-slate-100 ${selected ? 'bg-emerald-50/50' : 'hover:bg-slate-800/40'} ${hasError ? 'ring-1 ring-inset ring-red-200' : ''}`}>
                    <td className="border-r border-slate-100 px-3 py-2">
                      <input type="checkbox" checked={selected} onChange={() => onToggleSelection(row.id)} />
                    </td>
                    <td className="border-r border-slate-100 px-2 py-2 text-center text-xs text-slate-400">{index + 1}</td>

                    {['nome', 'numeroBoleto', 'dataVencimento', 'valor'].map((field) => {
                      const isEditing = editingCell?.id === row.id && editingCell?.campo === field;
                      const cellClass = problemByField[field]
                        ? problemByField[field].tipo === 'erro'
                          ? 'bg-red-50/70'
                          : 'bg-amber-50/70'
                        : '';

                      if (field === 'valor') {
                        return (
                          <td key={field} className={`border-r border-slate-100 px-3 py-2 text-right font-medium ${cellClass}`}>
                            {isEditing ? (
                              <input autoFocus type="number" step="0.01" value={editingValue} onChange={(event) => setEditingValue(event.target.value)} onBlur={onSaveEdit} onKeyDown={(event) => event.key === 'Enter' ? onSaveEdit() : event.key === 'Escape' ? onCancelEdit() : null} className="w-full rounded border border-emerald-500 px-2 py-1 text-right text-sm outline-none" />
                            ) : (
                              <button className="w-full text-right" onDoubleClick={() => onStartEdit(row.id, field, row[field])}>{formatCurrencyBRL(row[field])}</button>
                            )}
                          </td>
                        );
                      }

                      if (field === 'dataVencimento') {
                        return (
                          <td key={field} className={`border-r border-slate-100 px-3 py-2 ${cellClass}`}>
                            {isEditing ? (
                              <input autoFocus type="date" value={editingValue} onChange={(event) => setEditingValue(event.target.value)} onBlur={onSaveEdit} onKeyDown={(event) => event.key === 'Enter' ? onSaveEdit() : event.key === 'Escape' ? onCancelEdit() : null} className="w-full rounded border border-emerald-500 px-2 py-1 text-sm outline-none" />
                            ) : (
                              <button className="w-full text-left" onDoubleClick={() => onStartEdit(row.id, field, row[field])}>{formatDateBR(row[field])}</button>
                            )}
                          </td>
                        );
                      }

                      return (
                        <td key={field} className={`border-r border-slate-100 px-3 py-2 ${cellClass}`}>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input autoFocus value={editingValue} onChange={(event) => setEditingValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' ? onSaveEdit() : event.key === 'Escape' ? onCancelEdit() : null} className="flex-1 rounded border border-emerald-500 px-2 py-1 text-sm outline-none" />
                              <button onClick={onSaveEdit} className="text-emerald-600"><Save size={14} /></button>
                              <button onClick={onCancelEdit} className="text-slate-400"><X size={14} /></button>
                            </div>
                          ) : (
                            <button className={`w-full text-left ${field === 'nome' ? 'font-medium text-slate-50' : ''}`} onDoubleClick={() => onStartEdit(row.id, field, row[field])}>
                              {row[field] || <span className="italic text-red-500">(vazio)</span>}
                            </button>
                          )}
                        </td>
                      );
                    })}

                    <td className="border-r border-slate-100 px-3 py-2">
                      {!row.problemas.length ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle2 size={12} /> OK
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          {row.problemas.slice(0, 2).map((item, problemIndex) => (
                            <div key={`${row.id}_${problemIndex}`} className={`flex items-start gap-1 text-xs ${item.tipo === 'erro' ? 'text-red-700' : 'text-amber-700'}`}>
                              {item.tipo === 'erro' ? <AlertCircle size={11} className="mt-0.5 shrink-0" /> : <AlertTriangle size={11} className="mt-0.5 shrink-0" />}
                              <span>{item.msg}</span>
                            </div>
                          ))}
                          {row.problemas.length > 2 ? <p className="text-xs text-slate-400">+{row.problemas.length - 2} alerta(s)</p> : null}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => onRemoveRow(row.id)} title="Remover da importacao" className="rounded p-1.5 text-red-500 hover:bg-red-50">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><Edit3 size={12} /> Duplo clique em uma celula para editar</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1"><AlertCircle size={12} className="text-red-500" /> Erro critico (bloqueia importacao)</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1"><AlertTriangle size={12} className="text-amber-500" /> Aviso (importacao permitida)</span>
      </div>

      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 p-4 shadow-soft">
        <div>
          <p className="text-sm font-medium text-slate-50">{stats.selecionados} de {stats.total} registros selecionados</p>
          <p className="text-xs text-slate-500">Total a importar: <span className="font-medium text-slate-50">{formatCurrencyBRL(stats.valorSelecionado)}</span>{stats.total - stats.selecionados > 0 ? ` · ${stats.total - stats.selecionados} serao descartados` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800/60">Cancelar importação</button>
          <button onClick={onConfirm} disabled={!stats.selecionados || saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {preview.tipo === 'liquidacao' ? 'Confirmar Liquidacao' : 'Enviar para Visao Geral'} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
