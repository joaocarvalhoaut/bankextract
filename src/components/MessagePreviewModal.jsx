import { Copy, MessageSquare, Phone, Send, X } from 'lucide-react';
import CollectionMessagePreview from './CollectionMessagePreview';
import { formatCurrencyBRL, formatDateBR } from '../utils/format';

export default function MessagePreviewModal({
  modal,
  data,
  onClose,
  onChangeMessage,
  onCopy,
  onCollectionGenerated,
  onSend,
  onConfirmSend,
  sending = false,
}) {
  const resolvedModal = modal || data;
  const resolvedSend = onSend || onConfirmSend;

  if (!resolvedModal?.open || !resolvedModal.row) return null;

  const { row, message } = resolvedModal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
      onClick={(event) => (sending ? null : event.target === event.currentTarget ? onClose() : null)}
    >
      <div className="w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.2)]">
        <div className="hero-mesh border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <MessageSquare size={18} />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-950">Previa da mensagem</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Revise, ajuste o tom e edite a cobranca antes de enviar pelo WhatsApp.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={sending ? undefined : onClose}
              disabled={sending}
              className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 px-6 py-6 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cliente</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{row.cliente}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Documento</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{row.documento}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Vencimento</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{formatDateBR(row.vencimento)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Valor</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{formatCurrencyBRL(row.valor)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Telefone</p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Phone size={14} className="text-slate-500" />
                {row.telefone || 'Sem telefone'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <CollectionMessagePreview
              title="IA de cobranca no modal principal"
              context={{
                nome: row.cliente,
                valor: row.valor,
                vencimento: row.vencimento,
                diasAtraso: row.dias_atraso,
                documento: row.documento,
                telefone: row.telefone,
                empresa: row.company_name || row.empresa,
                linha_digitavel: row.linha_digitavel,
                link_boleto: row.boleto_url,
                codigo_barras: row.codigo_barras,
                historico: row.historico,
              }}
              initialMessage={message}
              restoreMessage={resolvedModal.originalMessage || row.mensagem || message}
              onMessageChange={onChangeMessage}
              onGenerated={onCollectionGenerated}
            />

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Copy size={14} />
                Copiar mensagem
              </button>
              <button
                type="button"
                onClick={resolvedSend}
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send size={14} />
                {sending ? 'Enviando...' : 'Enviar WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
