import { useCallback, useMemo } from 'react';
import { Eye, Loader2, MessageCircleMore, PhoneCall, PhoneOff, Send, ShieldCheck } from 'lucide-react';
import DataTable from '../components/DataTable';
import { formatCurrencyBRL } from '../utils/format';
import { canUserPerformAction } from '../security/permissions';

const statusTone = {
  pendente:      'bg-slate-800/40 text-slate-300 ring-slate-700/60',
  queued:        'bg-amber-500/10 text-amber-300 ring-amber-500/25',
  sent:          'bg-blue-500/10 text-blue-300 ring-blue-500/25',
  delivered:     'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
  read:          'bg-violet-500/10 text-violet-300 ring-violet-500/25',
  failed:        'bg-red-500/10 text-red-300 ring-red-500/25',
  simulated:     'bg-slate-800/40 text-slate-300 ring-slate-700/60',
  'sem telefone':'bg-amber-500/10 text-amber-300 ring-amber-500/25',
};

const statusMeta = {
  pendente: { label: 'Pendente', dot: 'bg-slate-400' },
  queued: { label: '🟡 fila', dot: 'bg-amber-400' },
  sent: { label: '🔵 enviada', dot: 'bg-blue-400' },
  delivered: { label: '🟢 entregue', dot: 'bg-emerald-500' },
  read: { label: '👁 lida', dot: 'bg-violet-500' },
  failed: { label: '🔴 falhou', dot: 'bg-red-500' },
  simulated: { label: 'Simulada', dot: 'bg-slate-400' },
  'sem telefone': { label: 'Sem telefone', dot: 'bg-amber-400' },
};

const buildStatusTooltip = (row) => {
  const parts = [];
  if (row?.sent_at) parts.push(`Enviada: ${new Date(row.sent_at).toLocaleString('pt-BR')}`);
  if (row?.delivered_at) parts.push(`Entregue: ${new Date(row.delivered_at).toLocaleString('pt-BR')}`);
  if (row?.read_at) parts.push(`Lida: ${new Date(row.read_at).toLocaleString('pt-BR')}`);
  if (row?.failed_at) parts.push(`Falhou: ${new Date(row.failed_at).toLocaleString('pt-BR')}`);
  if (row?.failure_reason) parts.push(`Motivo: ${row.failure_reason}`);
  return parts.join(' | ');
};

export default function CobrancasScreen({
  companyId,
  billingExecutionMode = 'simulate',
  onBillingExecutionModeChange,
  rows,
  onGenerateMessage,
  onSend,
  sendingChargeIds = [],
  userRole = 'operador',
  onToast,
}) {
  const canManageCharges = canUserPerformAction(userRole, 'manage_charges');
  const simulationMode = billingExecutionMode !== 'real';
  const pending = rows.filter((row) => row.status === 'pendente').length;
  const withoutPhone = rows.filter((row) => row.status === 'sem telefone').length;
  const sent = rows.filter((row) => ['queued', 'sent', 'delivered', 'read'].includes(String(row.status || '').toLowerCase())).length;

  const handleSendSingleCharge = useCallback(
    async (row) => {
      if (!companyId) {
        onToast?.('erro', 'Selecione uma empresa especifica para enviar a cobranca.');
        return;
      }

      if (!canManageCharges) {
        onToast?.('erro', 'Seu perfil atual nao pode enviar cobrancas.');
        return;
      }

      const registroId = String(row?.financeiro_id || row?.registro_id || row?.id || '').trim();
      if (!registroId) {
        onToast?.('erro', 'Esta cobranca nao possui um titulo financeiro associado.');
        return;
      }

      try {
        const data = await onSend?.(row, { simulate: simulationMode });
        if (data?.cancelled) return;
      } catch (error) {
        onToast?.('erro', error.message || 'Falha ao enviar cobranca via WhatsApp.');
      }
    },
    [canManageCharges, companyId, onSend, onToast, simulationMode]
  );

  const columns = useMemo(() => [
    {
      key: 'cliente',
      label: 'Cliente',
      render: (row) => <span className="font-medium text-slate-50">{row.cliente}</span>,
    },
    { key: 'documento', label: 'Documento', render: (row) => row.documento },
    {
      key: 'valor',
      label: 'Valor',
      render: (row) => <span className="font-mono tabular-nums font-semibold text-slate-50">{formatCurrencyBRL(row.valor)}</span>,
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
          title={buildStatusTooltip(row)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
            statusTone[row.status] || 'bg-slate-800/60 text-slate-200 ring-slate-700'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${(statusMeta[row.status] || statusMeta.pendente).dot}`}
          />
          {(statusMeta[row.status] || statusMeta.pendente).label}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Acoes',
      render: (row) => {
        const registroId = String(row?.financeiro_id || row?.registro_id || row?.id || '').trim();
        const sending = sendingChargeIds.includes(registroId);
        const alreadySent = ['sent', 'delivered', 'read', 'enviada'].includes(String(row?.status || '').toLowerCase());
        const sendDisabled = !canManageCharges || !companyId || !registroId || sending;

        return (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canManageCharges}
              onClick={() => onGenerateMessage(row)}
              title={!canManageCharges ? 'Seu perfil nao pode gerar mensagens.' : ''}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageCircleMore size={12} />
              Gerar mensagem
            </button>
            <button
              type="button"
              disabled={sendDisabled}
              onClick={() => handleSendSingleCharge(row)}
              title={
                !canManageCharges
                  ? 'Seu perfil nao pode enviar cobrancas.'
                  : !companyId
                    ? 'Selecione uma empresa especifica para enviar.'
                    : sending
                      ? 'Esta cobranca ja esta sendo enviada.'
                    : !registroId
                      ? 'Esta cobranca nao possui um titulo financeiro associado.'
                      : alreadySent
                        ? 'Esta cobranca ja foi enviada. Clique para confirmar o reenvio.'
                        : ''
              }
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {sending ? 'Enviando...' : alreadySent ? 'Enviada' : 'Enviar'}
            </button>
          </div>
        );
      },
    },
  ], [canManageCharges, companyId, handleSendSingleCharge, onGenerateMessage, sendingChargeIds]);

  const stats = [
    { label: 'Cobrancas pendentes', value: pending, color: 'text-slate-50', bar: 'from-slate-400 to-slate-500', Icon: PhoneOff },
    { label: 'Com telefone', value: rows.length - withoutPhone, color: 'text-emerald-300', bar: 'from-emerald-400 to-emerald-600', Icon: PhoneCall },
    { label: 'Sem telefone', value: withoutPhone, color: 'text-amber-300', bar: 'from-amber-400 to-orange-400', Icon: PhoneOff },
    { label: 'Mensagens enviadas', value: sent, color: 'text-blue-300', bar: 'from-blue-400 to-blue-600', Icon: Eye },
  ];

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map(({ label, value, color, bar, Icon }) => (
          <article
            key={label}
            className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5 shadow-card"
          >
            <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${bar} opacity-70`} />
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/40 text-slate-500">
              <Icon size={16} />
            </div>
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`mt-1.5 text-3xl font-semibold ${color}`}>{value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 shadow-card">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
              <PhoneOff size={22} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-50">Fila de cobrancas WhatsApp</h3>
              <p className="text-sm text-slate-500">
                Pendencias operacionais prontas para mensagem manual ou automatica.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-2 shadow-soft">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <ShieldCheck size={12} />
                Modo de envio
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onBillingExecutionModeChange?.('simulate')}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    simulationMode
                      ? 'bg-amber-500 text-white shadow-soft'
                      : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/40'
                  }`}
                >
                  Simulacao
                </button>
                <button
                  type="button"
                  onClick={() => onBillingExecutionModeChange?.('real')}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    simulationMode
                      ? 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/40'
                      : 'bg-emerald-600 text-white shadow-soft'
                  }`}
                >
                  Envio real
                </button>
              </div>
            </div>

            {simulationMode ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
                Simulacao ativa — nenhuma mensagem real sera enviada.
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
                Envio real ativo — os envios individuais chamarao a Edge Function com simulate: false.
              </div>
            )}
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
