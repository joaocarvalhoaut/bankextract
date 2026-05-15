import { CheckSquare, Pencil, Sparkles, UploadCloud, XCircle } from 'lucide-react';
import DataTable from './DataTable';
import { formatCurrencyBRL, formatDateBR } from '../utils/format';

function getStatusTone(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'liquidado') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
  if (normalized === 'vencido')   return 'border-red-500/25     bg-red-500/10     text-red-300';
  if (normalized === 'aberto')    return 'border-blue-500/25    bg-blue-500/10    text-blue-300';
  return 'border-amber-500/25 bg-amber-500/10 text-amber-300';
}

export default function PreviewImportTable({
  rows = [],
  onToggleRow,
  onToggleAll,
  onFieldChange,
  onDiscard,
  onImport,
}) {
  const allSelected = rows.length > 0 && rows.every((row) => row.selected !== false);
  const selectedRows = rows.filter((row) => row.selected !== false);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
  const today = new Date();
  const aVencer = rows
    .filter((row) => new Date(`${row.data_vencimento}T00:00:00`) >= today)
    .reduce((sum, row) => sum + Number(row.valor || 0), 0);
  const vencidos = rows
    .filter((row) => new Date(`${row.data_vencimento}T00:00:00`) < today)
    .reduce((sum, row) => sum + Number(row.valor || 0), 0);

  const columns = [
    {
      key: 'select',
      label: (
        <label className="inline-flex h-5 w-5 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="h-4 w-4 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
          />
        </label>
      ),
      render: (row) => (
        <label className="inline-flex h-5 w-5 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={row.selected !== false}
            onChange={() => onToggleRow(row.id)}
            className="h-4 w-4 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
          />
        </label>
      ),
      className: 'w-12',
    },
    {
      key: 'nome',
      label: 'Cliente/Fornecedor',
      render: (row) => (
        <input
          value={row.nome}
          onChange={(event) => onFieldChange(row.id, 'nome', event.target.value)}
          className="input-premium w-full border-transparent bg-transparent px-2 py-1 font-medium text-slate-50 shadow-none"
        />
      ),
    },
    {
      key: 'documento',
      label: 'Documento',
      render: (row) => (
        <input
          value={row.documento}
          onChange={(event) => onFieldChange(row.id, 'documento', event.target.value)}
          className="input-premium w-full border-transparent bg-transparent px-2 py-1 shadow-none"
        />
      ),
    },
    {
      key: 'data_vencimento',
      label: 'Vencimento',
      render: (row) => (
        <input
          type="date"
          value={row.data_vencimento}
          onChange={(event) => onFieldChange(row.id, 'data_vencimento', event.target.value)}
          className="input-premium w-full border-transparent bg-transparent px-2 py-1 shadow-none"
        />
      ),
    },
    {
      key: 'valor',
      label: 'Valor',
      render: (row) => (
        <input
          type="number"
          step="0.01"
          value={row.valor}
          onChange={(event) => onFieldChange(row.id, 'valor', Number(event.target.value || 0))}
          className="input-premium w-full border-transparent bg-transparent px-2 py-1 text-right shadow-none"
        />
      ),
      cellClassName: 'min-w-[140px]',
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <div className="relative">
          <select
            value={row.status}
            onChange={(event) => onFieldChange(row.id, 'status', event.target.value)}
            className={`input-premium w-full appearance-none border-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] shadow-none ${getStatusTone(row.status)}`}
          >
            <option value="pendente">Pendente</option>
            <option value="aberto">Aberto</option>
            <option value="vencido">Vencido</option>
            <option value="liquidado">Liquidado</option>
          </select>
        </div>
      ),
    },
    {
      key: 'telefone',
      label: 'Telefone',
      render: (row) => (
        <input
          value={row.telefone}
          onChange={(event) => onFieldChange(row.id, 'telefone', event.target.value)}
          className="input-premium w-full border-transparent bg-transparent px-2 py-1 shadow-none"
        />
      ),
    },
    {
      key: 'observacoes',
      label: 'Observacoes',
      render: (row) => (
        <input
          value={row.observacoes}
          onChange={(event) => onFieldChange(row.id, 'observacoes', event.target.value)}
          className="input-premium w-full border-transparent bg-transparent px-2 py-1 shadow-none"
        />
      ),
    },
  ];

  return (
    <section className="card-hover overflow-hidden rounded-2xl border border-white/70 bg-slate-900/70 shadow-[0_28px_90px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="hero-mesh border-b border-slate-700/50 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-slate-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300 shadow-sm">
              <Sparkles size={12} />
              OCR em revisao
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-50">Previa da importacao</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
                Revise, ajuste e selecione apenas as linhas que devem seguir para a carteira financeira.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-300 shadow-sm">
              <Pencil size={14} />
              Linhas editaveis
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 shadow-sm">
              <CheckSquare size={14} />
              {selectedRows.length} selecionados
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 px-4 py-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Registros totais</p>
            <p className="mt-2 text-2xl font-semibold text-slate-50">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-blue-500/25 bg-blue-500/10 px-4 py-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-blue-400">Valor total</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-blue-200">{formatCurrencyBRL(totalValue)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-400">A vencer</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-200">{formatCurrencyBRL(aVencer)}</p>
          </div>
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-red-400">Vencidos</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-red-200">{formatCurrencyBRL(vencidos)}</p>
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 pt-4 sm:px-4">
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="Nenhuma linha extraida."
          emptyDescription="Processe um arquivo para visualizar a previa OCR com os registros identificados."
        />
      </div>

      <div className="border-t border-slate-700/50 bg-slate-800/40 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-50">{selectedRows.length} linha(s) pronta(s) para importacao</p>
            <p className="text-xs text-slate-500">
              Proximo vencimento da selecao:{' '}
              <span className="font-medium text-slate-200">
                {selectedRows[0]?.data_vencimento ? formatDateBR(selectedRows[0].data_vencimento) : 'aguardando selecao'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onDiscard}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:-translate-y-0.5 hover:bg-slate-800/60"
            >
              <XCircle size={14} />
              Descartar previa
            </button>
            <button
              type="button"
              onClick={onImport}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(14,159,110,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_36px_rgba(14,159,110,0.32)]"
            >
              <UploadCloud size={14} />
              Importar selecionados
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
