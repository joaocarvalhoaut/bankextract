import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  MessageSquare,
  Phone,
  Send,
  X,
} from 'lucide-react';
import { formatCurrencyBRL, formatDateBR } from '../utils/format';

export default function WhatsAppChargeModal({ modal, onClose, onUpdateMessage, onSend }) {
  if (!modal) return null;

  const { records, messages, sending, results, mocked } = modal;
  const sentCount = results ? Object.values(results).filter((result) => result.ok).length : 0;
  const failCount = results ? Object.values(results).filter((result) => !result.ok).length : 0;

  const handleSend = () => {
    const charges = records.map((row) => ({
      registro_id: row.id,
      telefone: row.telefone,
      mensagem: messages[row.id] || '',
    }));
    onSend(charges);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 pb-10 pt-8 backdrop-blur-sm">
      <div className="card-hover w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/70 bg-white/95 shadow-[0_40px_120px_rgba(15,23,42,0.2)] backdrop-blur">
        <div className="hero-mesh border-b border-slate-200/80 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm">
                <MessageSquare size={18} />
              </div>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  {mocked ? <FlaskConical size={12} /> : <Send size={12} />}
                  {mocked ? 'Modo teste' : 'Revisao antes do envio'}
                </div>
                <h2 className="mt-3 text-xl font-semibold text-slate-950">Cobrancas por WhatsApp</h2>
                <p className="mt-1 text-sm text-slate-600">{records.length} registro(s) elegivel(is) para revisao.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="rounded-2xl border border-slate-200 bg-white/85 p-2 text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {mocked ? (
          <div className="mx-5 mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm sm:mx-6">
            Os secrets da Z-API ainda nao foram configurados. As cobrancas serao registradas como preparadas no banco, sem disparo real de mensagem.
          </div>
        ) : null}

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-5 sm:px-6">
          {records.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center shadow-inner">
              <p className="text-base font-semibold text-slate-900">Nenhum registro elegivel encontrado</p>
              <p className="mt-2 text-sm text-slate-500">Revise os filtros da carteira, telefone e status antes de gerar novas cobrancas.</p>
            </div>
          ) : (
            records.map((row) => {
              const result = results?.[row.id];
              const isMockedResult = result?.mocked === true;
              const tone = result
                ? result.ok
                  ? isMockedResult
                    ? 'border-amber-200 bg-amber-50/80'
                    : 'border-emerald-200 bg-emerald-50/80'
                  : 'border-red-200 bg-red-50/80'
                : 'border-slate-200 bg-white';

              return (
                <div key={row.id} className={`rounded-[28px] border px-4 py-4 shadow-sm transition hover:-translate-y-0.5 ${tone}`}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{row.nome}</p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Phone size={11} />
                          {row.telefone}
                        </span>
                        <span>Venc: {formatDateBR(row.dataVencimento)}</span>
                        <span className="font-semibold text-slate-900">{formatCurrencyBRL(row.valorAtualizado)}</span>
                      </div>
                    </div>

                    {result ? (
                      result.ok ? (
                        isMockedResult ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm">
                            <FlaskConical size={11} />
                            Preparado (modo teste)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
                            <CheckCircle2 size={11} />
                            Enviado
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 shadow-sm">
                          <AlertCircle size={11} />
                          Erro
                        </span>
                      )
                    ) : null}
                  </div>

                  {result && !result.ok && result.error ? (
                    <p className="mb-2 text-xs font-medium text-red-600">{result.error}</p>
                  ) : null}

                  {!result ? (
                    <textarea
                      value={messages[row.id] || ''}
                      onChange={(e) => onUpdateMessage(row.id, e.target.value)}
                      disabled={sending}
                      rows={7}
                      className="input-premium min-h-[180px] w-full font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  ) : (
                    <div className="rounded-2xl border border-white/60 bg-white/75 px-4 py-3 text-xs leading-6 text-slate-600 shadow-inner">
                      <p className="whitespace-pre-line">{messages[row.id]}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200/80 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="font-medium">{records.length} registro(s)</span>
            {results ? (
              <>
                <span className="text-emerald-700">{sentCount} com sucesso</span>
                <span className="text-red-600">{failCount} com erro</span>
              </>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Fechar
            </button>
            {!results ? (
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || records.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {sending ? 'Enviando...' : mocked ? 'Registrar cobrancas' : 'Enviar cobrancas'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
