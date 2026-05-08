import { useCallback, useMemo, useState } from 'react';
import { Loader2, MessageCircleMore, PhoneCall, PhoneOff, Send, ShieldCheck } from 'lucide-react';
import DataTable from '../components/DataTable';
import { formatCurrencyBRL } from '../utils/format';
import { canUserPerformAction } from '../security/permissions';
import { sendSingleCharge } from '../services/billingAutomationService';

const statusTone = {
  pendente: 'bg-slate-100 text-slate-700 ring-slate-200',
  enviada: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'sem telefone': 'bg-amber-50 text-amber-700 ring-amber-200',
};

export default function CobrancasScreen({
  companyId,
  billingExecutionMode = 'simulate',
  onBillingExecutionModeChange,
  rows,
  onGenerateMessage,
  userRole = 'operador',
  onToast,
}) {
  const canManageCharges = canUserPerformAction(userRole, 'manage_charges');
  const simulationMode = billingExecutionMode !== 'real';
  const [sendingId, setSendingId] = useState('');
  const pending = rows.filter((row) => row.status === 'pendente').length;
  const withoutPhone = rows.filter((row) => row.status === 'sem telefone').length;
  const sent = rows.filter((row) => row.status === 'enviada').length;

  const handleSendSingleCharge = useCallback(
    async (row) => {
      console.log('[SEND BUTTON CLICKED - COBRANCAS]', row);

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

      const payload = {
        action: 'send_single_charge',
        companyId,
        company_id: companyId,
        registro_id: registroId,
        charge_id: registroId,
        simulate: simulationMode,
      };

      console.log('[SEND SINGLE CHARGE REQUEST - COBRANCAS]', payload);
      setSendingId(registroId);

      try {
        const data = await sendSingleCharge(companyId, registroId, { simulate: simulationMode });
        console.log('[SEND SINGLE CHARGE RESPONSE - COBRANCAS]', data, null);
        onToast?.(
          simulationMode ? 'aviso' : 'sucesso',
          data?.message ||
            (simulationMode
              ? 'Simulacao executada, nenhuma mensagem real enviada'
              : 'Mensagem enviada via WhatsApp')
        );
      } catch (error) {
        console.log('[SEND SINGLE CHARGE RESPONSE - COBRANCAS]', null, error);
        onToast?.('erro', error.message || 'Falha ao enviar cobranca via WhatsApp.');
      } finally {
        setSendingId('');
      }
    },
    [canManageCharges, companyId, onToast, simulationMode]
  );

  const columns = useMemo(() => [
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
      render: (row) => {
        const registroId = String(row?.financeiro_id || row?.registro_id || row?.id || '').trim();
        const sending = sendingId === registroId;
        const sendDisabled = !canManageCharges || !companyId || !registroId || Boolean(sendingId);

        return (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canManageCharges}
              onClick={() => onGenerateMessage(row)}
              title={!canManageCharges ? 'Seu perfil nao pode gerar mensagens.' : ''}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
                    : !registroId
                      ? 'Esta cobranca nao possui um titulo financeiro associado.'
                      : ''
              }
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Enviar
            </button>
          </div>
        );
      },
    },
  ], [canManageCharges, companyId, handleSendSingleCharge, onGenerateMessage, sendingId]);

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
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
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

          <div className="flex flex-col items-start gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-soft">
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
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Simulacao
                </button>
                <button
                  type="button"
                  onClick={() => onBillingExecutionModeChange?.('real')}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    simulationMode
                      ? 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      : 'bg-emerald-600 text-white shadow-soft'
                  }`}
                >
                  Envio real
                </button>
              </div>
            </div>

            {simulationMode ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Simulacao ativa — nenhuma mensagem real sera enviada.
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
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
