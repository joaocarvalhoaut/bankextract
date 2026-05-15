import { useCallback, useMemo } from 'react';
import { Eye, Loader2, MessageCircleMore, PhoneCall, PhoneOff, Send, ShieldCheck } from 'lucide-react';
import DataTable from '../components/DataTable';
import { PageShell, ScreenHeader } from '../components/ui/layout';
import { OperationalMetric, OperationalPanel, OperationalStatusPill } from '../components/ui/operational';
import { formatCurrencyBRL } from '../utils/format';
import { canUserPerformAction } from '../security/permissions';

const statusTone = {
  pendente: 'bg-slate-800/60 text-slate-200 ring-slate-700',
  queued: 'bg-amber-950/30 text-amber-300 ring-amber-500/20',
  sent: 'bg-blue-950/30 text-blue-300 ring-blue-500/20',
  delivered: 'bg-emerald-950/30 text-emerald-300 ring-emerald-500/20',
  read: 'bg-violet-950/30 text-violet-300 ring-violet-500/20',
  failed: 'bg-red-950/30 text-red-300 ring-red-500/20',
  simulated: 'bg-slate-800/60 text-slate-200 ring-slate-700',
  'sem telefone': 'bg-amber-950/30 text-amber-300 ring-amber-500/20',
};

const statusMeta = {
  pendente: { label: 'Pendente', dot: 'bg-slate-400' },
  queued: { label: 'Fila', dot: 'bg-amber-400' },
  sent: { label: 'Enviada', dot: 'bg-blue-400' },
  delivered: { label: 'Entregue', dot: 'bg-emerald-500' },
  read: { label: 'Lida', dot: 'bg-violet-500' },
  failed: { label: 'Falhou', dot: 'bg-red-500' },
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
      render: (row) => <span className="font-semibold text-slate-50">{formatCurrencyBRL(row.valor)}</span>,
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
          <span className={`h-1.5 w-1.5 rounded-full ${(statusMeta[row.status] || statusMeta.pendente).dot}`} />
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
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800/40 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
    { label: 'Cobrancas pendentes', value: pending, Icon: PhoneOff },
    { label: 'Com telefone', value: rows.length - withoutPhone, Icon: PhoneCall },
    { label: 'Sem telefone', value: withoutPhone, Icon: PhoneOff },
    { label: 'Mensagens enviadas', value: sent, Icon: Eye },
  ];

  return (
    <PageShell>
      <ScreenHeader
        breadcrumb={['Cobranca', 'Fila WhatsApp']}
        title="Fila de cobrancas WhatsApp"
        description="Pendencias operacionais prontas para geracao de mensagem e disparo controlado."
        status={(
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200">
            <ShieldCheck size={12} />
            {simulationMode ? 'Simulacao ativa' : 'Envio real ativo'}
          </span>
        )}
        actions={(
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-2">
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
                    ? 'border border-amber-500/30 bg-amber-950/40 text-amber-200'
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
                    : 'border border-emerald-500/30 bg-emerald-950/40 text-emerald-200'
                }`}
              >
                Envio real
              </button>
            </div>
          </div>
        )}
      />

      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {stats.map(({ label, value, Icon }, index) => (
            <OperationalMetric
              key={label}
              label={label}
              value={value}
              icon={Icon}
              tone={index === 2 ? 'warning' : index === 3 ? 'processing' : index === 1 ? 'success' : 'info'}
            />
          ))}
        </section>

        <OperationalPanel title="Titulos prontos para acao" subtitle="A fila abaixo mantem leitura por cliente, documento, telefone e tracking de envio.">
          <div className="mb-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <OperationalStatusPill tone={simulationMode ? 'warning' : 'success'}>
                <PhoneOff size={12} />
                {simulationMode ? 'Simulacao ativa' : 'Envio real ativo'}
              </OperationalStatusPill>
            </div>

            <div className="flex flex-col items-start gap-3">
              {simulationMode ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  Simulacao ativa - nenhuma mensagem real sera enviada.
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  Envio real ativo - os envios individuais chamarao a Edge Function com simulate: false.
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
        </OperationalPanel>
      </div>
    </PageShell>
  );
}
