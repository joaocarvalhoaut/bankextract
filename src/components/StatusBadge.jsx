const statusMap = {
  pendente:   'border-slate-700/80 bg-slate-800/40 text-slate-400',
  negociacao: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  promessa:   'border-blue-500/25 bg-blue-500/10 text-blue-300',
  liquidado:  'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
};

const statusLabelMap = {
  pendente: 'Pendente',
  negociacao: 'Negociação',
  promessa: 'Promessa',
  liquidado: 'Liquidado'
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusMap[status] || statusMap.pendente}`}>
      {statusLabelMap[status] || statusLabelMap.pendente}
    </span>
  );
}
