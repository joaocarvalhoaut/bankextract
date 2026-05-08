import { Eye, FileSearch, FileStack, Trash2 } from 'lucide-react';
import DataTable from '../components/DataTable';
import { formatCurrencyBRL, formatDateTimeBR } from '../utils/format';

const typeLabel = {
  vencidos: 'Vencidos',
  liquidacao: 'Liquidacao',
};

const statusTone = {
  importado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  processado: 'bg-blue-50 text-blue-700 ring-blue-200',
  erro: 'bg-red-50 text-red-700 ring-red-200',
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
      render: (row) => <span className="text-slate-600">{formatDateTimeBR(row.created_at)}</span>,
    },
    {
      key: 'empresa_nome',
      label: 'Empresa',
      render: (row) => <span className="font-medium text-slate-900">{row.empresa_nome}</span>,
    },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (row) => (
        <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {typeLabel[row.tipo] || row.tipo}
        </span>
      ),
    },
    {
      key: 'arquivo',
      label: 'Arquivo',
      render: (row) => <span className="max-w-[140px] truncate text-slate-600">{row.arquivo}</span>,
    },
    {
      key: 'quantidade_registros',
      label: 'Qtd.',
      render: (row) => <span className="font-semibold text-slate-900">{row.quantidade_registros}</span>,
    },
    {
      key: 'valor_total',
      label: 'Valor total',
      render: (row) => <span className="font-semibold text-slate-900">{formatCurrencyBRL(row.valor_total)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
            statusTone[row.status] || 'bg-slate-100 text-slate-700 ring-slate-200'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              row.status === 'importado' ? 'bg-emerald-500' : row.status === 'erro' ? 'bg-red-400' : 'bg-blue-400'
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
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
          >
            <Eye size={12} />
            Visualizar lote
          </button>
          <button
            type="button"
            onClick={() => onDeleteItem(row)}
            className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 active:scale-[0.98]"
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
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-slate-900 text-white">
            <FileStack size={22} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Historico de importacoes</h3>
            <p className="text-sm text-slate-500">
              Cada lote e identificado por{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700">batch_id</code>.
              Exclusoes respeitam{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700">company_id</code>.
            </p>
          </div>
          {onOpenDataLogs ? (
            <button
              type="button"
              onClick={onOpenDataLogs}
              className="ml-auto inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <FileSearch size={14} />
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
