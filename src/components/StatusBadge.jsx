const statusMap = {
  pendente: 'bg-slate-800/60 text-slate-200 border-slate-700',
  negociacao: 'bg-amber-50 text-amber-700 border-amber-200',
  promessa: 'bg-blue-900/20 text-blue-700 border-blue-700/40',
  liquidado: 'bg-emerald-50 text-emerald-700 border-emerald-200'
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
