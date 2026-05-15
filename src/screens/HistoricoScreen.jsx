import { Eye, FileSearch, FileStack, Trash2 } from 'lucide-react';
import DataTable from '../components/DataTable';
import { formatCurrencyBRL, formatDateTimeBR } from '../utils/format';

const typeLabel = {
  vencidos: 'Vencidos',
  a_vencer: 'A vencer',
  liquidacao: 'Liquidacao',
};

const statusTone = {
  importado: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
  processado: 'bg-blue-500/10 text-blue-300 ring-blue-500/25',
  erro: 'bg-red-500/10 text-red-300 ring-red-500/25',
};

export default function HistoricoScreen({
  rows,
  onViewBatch,
  onDeleteItem,
  onOpenDataLogs,
}) {
  const columns = [
    {
      key: 'created_at',
      label: 'Data',
      render: (row) => (
        <span className="font-mono tabular-nums text-slate-400">
          {formatDateTimeBR(row.created_at)}
        </span>
      ),
    },
    {
      key: 'empresa_nome',
      label: 'Empresa',
      render: (row) => <span className="font-medium text-slate-50">{row.empresa_nome}</span>,
    },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (row) => (
        <span className="inline-flex rounded-lg border border-slate-700/60 bg-slate-800/40 px-2 py-0.5 text-xs font-semibold text-slate-300">
          {typeLabel[row.tipo] || row.tipo}
        </span>
      ),
    },
    {
      key: 'arquivo',
      label: 'Arquivo',
      render: (row) => (
        <span className="max-w-[140px] truncate font-mono text-xs text-slate-400">
          {row.arquivo}
        </span>
      ),
    },
    {
      key: 'quantidade_registros',
      label: 'Qtd.',
      render: (row) => (
        <span className="font-mono tabular-nums font-semibold text-slate-50">
          {row.quantidade_registros}
        </span>
      ),
    },
    {
      key: 'valor_total',
      label: 'Valor total',
      render: (row) => (
        <span className="font-mono tabular-nums font-semibold text-slate-50">
          {formatCurrencyBRL(row.valor_total)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
            statusTone[row.status] || 'bg-slate-800/60 text-slate-300 ring-slate-700'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              row.status === 'importado' ? 'bg-emerald-400' : row.status === 'erro' ? 'bg-red-400' : 'bg-blue-400'
            }`}
          />
          {row.status}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Acoes',
      render: (row) => (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onViewBatch(row)}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-800/40 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700/60 hover:text-slate-100 active:scale-[0.98]"
          >
            <Eye size={12} />
            Ver lote
          </button>
          <button
            type="button"
            onClick={() => onDeleteItem(row)}
            className="inline-flex items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 active:scale-[0.98]"
          >
            <Trash2 size={12} />
            Excluir
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800/60 text-slate-400">
            <FileStack size={18} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-50">Historico de importacoes</h3>
            <p className="text-sm text-slate-500">
              Cada lote e identificado por{' '}
              <code className="rounded bg-slate-800/60 px-1 py-0.5 font-mono text-xs text-slate-300">batch_id</code>.
              Exclusoes respeitam{' '}
              <code className="rounded bg-slate-800/60 px-1 py-0.5 font-mono text-xs text-slate-300">company_id</code>.
            </p>
          </div>
          {onOpenDataLogs ? (
            <button
              type="button"
              onClick={onOpenDataLogs}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/40 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-700/60"
            >
              <FileSearch size={13} />
              Logs de Dados
            </button>
          ) : null}
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="Nenhum lote importado ainda."
          emptyDescription="Processe um documento na aba Importacao para comecar a construir o historico."
        />
      </section>
    </div>
  );
}
