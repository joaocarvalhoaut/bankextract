import { Copy, MessageSquare, Phone, Send, X } from 'lucide-react';
import { formatCurrencyBRL, formatDateBR } from '../utils/format';

export default function MessagePreviewModal({
  modal,
  onClose,
  onChangeMessage,
  onCopy,
  onSend,
  sending = false,
}) {
  if (!modal?.open || !modal.row) return null;

  const { row, message } = modal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
      onClick={(event) => (event.target === event.currentTarget ? onClose() : null)}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.2)]">
        <div className="hero-mesh border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <MessageSquare size={18} />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-950">Prévia da mensagem</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Revise e edite a cobrança antes de enviar pelo WhatsApp.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 px-6 py-6 lg:grid-cols-[0.9fr_1.1fr]">
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
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Mensagem editável
              </label>
              <textarea
                rows={16}
                value={message}
                onChange={(event) => onChangeMessage(event.target.value)}
                className="input-premium min-h-[340px] w-full"
              />
            </div>

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
                onClick={onSend}
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
