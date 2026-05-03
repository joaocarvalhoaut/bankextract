import { MessageCircleMore, PhoneCall, PhoneOff, Send } from 'lucide-react';
import DataTable from '../components/DataTable';
import { formatCurrencyBRL } from '../utils/format';

const statusTone = {
  pendente: 'bg-slate-100 text-slate-700 ring-slate-200',
  enviada: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'sem telefone': 'bg-amber-50 text-amber-700 ring-amber-200',
};

export default function CobrancasScreen({
  rows,
  onGenerateMessage,
  onSend,
}) {
  const pending = rows.filter((row) => row.status === 'pendente').length;
  const withoutPhone = rows.filter((row) => row.status === 'sem telefone').length;
  const sent = rows.filter((row) => row.status === 'enviada').length;

  const columns = [
    {
      key: 'cliente',
      label: 'Cliente',
      render: (row) => <span className="font-medium text-slate-900">{row.cliente}</span>,
    },
    { key: 'documento', label: 'Documento', render: (row) => row.documento },
    {
      key: 'valor',
      label: 'Valor',
      render: (row) => <span className="font-semibold text-slate-900">{formatCurrencyBRL(row.valor)}</span>,
    },
    {
      key: 'telefone',
      label: 'Telefone',
      render: (row) => row.telefone || <span className="text-slate-400">Sem telefone</span>,
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
              row.status === 'enviada'
                ? 'bg-emerald-500'
                : row.status === 'sem telefone'
                ? 'bg-amber-400'
                : 'bg-slate-400'
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
            onClick={() => onGenerateMessage(row)}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
          >
            <MessageCircleMore size={12} />
            Gerar mensagem
          </button>
          <button
            type="button"
            onClick={() => onSend(row)}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98]"
          >
            <Send size={12} />
            Enviar
          </button>
        </div>
      ),
    },
  ];

  const stats = [
    { label: 'Cobrancas pendentes', value: pending, color: 'text-slate-900', bar: 'from-slate-400 to-slate-500', Icon: PhoneOff },
    { label: 'Com telefone', value: rows.length - withoutPhone, color: 'text-emerald-700', bar: 'from-emerald-400 to-emerald-600', Icon: PhoneCall },
    { label: 'Sem telefone', value: withoutPhone, color: 'text-amber-700', bar: 'from-amber-400 to-orange-400', Icon: PhoneOff },
    { label: 'Mensagens enviadas', value: sent, color: 'text-blue-700', bar: 'from-blue-400 to-blue-600', Icon: Send },
  ];

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map(({ label, value, color, bar, Icon }) => (
          <article
            key={label}
            className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
          >
            <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${bar} opacity-70`} />
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
              <Icon size={16} />
            </div>
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`mt-1.5 text-3xl font-semibold ${color}`}>{value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
            <PhoneOff size={22} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Fila de cobrancas WhatsApp</h3>
            <p className="text-sm text-slate-500">
              Pendencias operacionais prontas para mensagem manual ou automatica.
            </p>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="Nenhuma cobranca disponivel."
          emptyDescription="Quando houver titulos pendentes, eles aparecerao aqui com status de telefone e envio."
        />
      </section>
    </div>
  );
}
