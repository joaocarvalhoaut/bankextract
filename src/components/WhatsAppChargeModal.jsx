import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  FileQuestion,
  FileX,
  FlaskConical,
  GitMerge,
  Loader2,
  MessageSquare,
  Phone,
  Send,
  X,
} from 'lucide-react';
import { formatCurrencyBRL, formatDateBR } from '../utils/format';

function BoletoBadge({ row }) {
  const status = row.boleto_status || 'pendente';
  const confidence = Number(row.boleto_match_confidence || 0);
  const filename = row.boleto_pdf_nome || null;

  if (status === 'encontrado') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-3 py-1.5 text-xs">
        <FileCheck size={12} className="text-emerald-400 shrink-0" />
        <span className="font-semibold text-emerald-300">Boleto encontrado</span>
        <span className="text-emerald-500">{confidence.toFixed(0)}% confianca</span>
        {filename ? <span className="truncate max-w-[160px] text-slate-400" title={filename}>{filename}</span> : null}
      </div>
    );
  }

  if (status === 'baixa_confianca') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-700/40 bg-amber-900/20 px-3 py-1.5 text-xs">
        <AlertTriangle size={12} className="text-amber-400 shrink-0" />
        <span className="font-semibold text-amber-300">Baixa confianca</span>
        <span className="text-amber-500">{confidence.toFixed(0)}%</span>
        {filename ? <span className="truncate max-w-[160px] text-slate-400" title={filename}>{filename}</span> : null}
      </div>
    );
  }

  if (status === 'conflito') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/20 px-3 py-1.5 text-xs">
        <GitMerge size={12} className="text-red-400 shrink-0" />
        <span className="font-semibold text-red-300">Conflito de boleto</span>
        <span className="text-slate-400">Multiplos PDFs com score alto</span>
      </div>
    );
  }

  if (status === 'nao_encontrado') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-xs">
        <FileX size={12} className="text-slate-400 shrink-0" />
        <span className="text-slate-400">Boleto nao localizado no Drive</span>
      </div>
    );
  }

  if (status === 'erro') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-800/40 bg-red-950/30 px-3 py-1.5 text-xs">
        <AlertCircle size={12} className="text-red-400 shrink-0" />
        <span className="text-red-300">Erro ao processar PDF</span>
      </div>
    );
  }

  // pendente / default
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-xs">
      <FileQuestion size={12} className="text-slate-500 shrink-0" />
      <span className="text-slate-500">Boleto pendente de varredura</span>
    </div>
  );
}

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
      <div className="card-hover w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/70 bg-slate-900/60/95 shadow-[0_40px_120px_rgba(15,23,42,0.2)] backdrop-blur">
        <div className="hero-mesh border-b border-slate-700/50 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm">
                <MessageSquare size={18} />
              </div>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-slate-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  {mocked ? <FlaskConical size={12} /> : <Send size={12} />}
                  {mocked ? 'Modo teste' : 'Revisao antes do envio'}
                </div>
                <h2 className="mt-3 text-xl font-semibold text-slate-50">Cobrancas por WhatsApp</h2>
                <p className="mt-1 text-sm text-slate-300">{records.length} registro(s) elegivel(is) para revisao.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="rounded-2xl border border-slate-700 bg-slate-900/60/85 p-2 text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800/40 disabled:opacity-50"
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
            <div className="rounded-[28px] border border-dashed border-slate-700 bg-slate-800/40 px-6 py-12 text-center shadow-inner">
              <p className="text-base font-semibold text-slate-50">Nenhum registro elegivel encontrado</p>
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
                : 'border-slate-700 bg-slate-900/60';

              return (
                <div key={row.id} className={`rounded-[28px] border px-4 py-4 shadow-sm transition hover:-translate-y-0.5 ${tone}`}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-50">{row.nome}</p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          <Phone size={11} />
                          {row.telefone}
                        </span>
                        <span>Venc: {formatDateBR(row.dataVencimento)}</span>
                        <span className="font-semibold text-slate-50">{formatCurrencyBRL(row.valorAtualizado)}</span>
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

                  <div className="mb-2">
                    <BoletoBadge row={row} />
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
                    <div className="rounded-2xl border border-white/60 bg-slate-900/60/75 px-4 py-3 text-xs leading-6 text-slate-300 shadow-inner">
                      <p className="whitespace-pre-line">{messages[row.id]}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-700/50 bg-slate-800/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
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
              className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
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
