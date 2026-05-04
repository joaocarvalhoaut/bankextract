import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, Sparkles } from 'lucide-react';

export default function ClearOverviewModal({
  isOpen,
  companyName,
  loading = false,
  onClose,
  onConfirm,
}) {
  const [confirmationText, setConfirmationText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setConfirmationText('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isValid = confirmationText.trim() === String(companyName || '').trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
      <div className="card-hover w-full max-w-2xl overflow-hidden rounded-[34px] border border-white/70 bg-white/95 shadow-[0_40px_120px_rgba(15,23,42,0.2)] backdrop-blur">
        <div className="hero-mesh border-b border-slate-200/80 px-6 py-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-red-50 text-red-600 shadow-sm">
              <ShieldAlert size={22} />
            </div>
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-600">
                <AlertTriangle size={12} />
                Acao destrutiva
              </div>
              <h3 className="text-2xl font-semibold text-white">Limpar Visao Geral</h3>
              <p className="text-sm leading-6 text-slate-100">
                Isso removera todos os registros financeiros da empresa selecionada e deixara a carteira pronta para uma nova importacao.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="rounded-[26px] border border-red-200 bg-red-50/95 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
              <div className="space-y-2 text-sm text-red-900">
                <p>
                  <span className="font-semibold">Empresa:</span> {companyName || 'Empresa selecionada'}
                </p>
                <p>Esta acao nao pode ser desfeita.</p>
                <p>O historico de cobrancas sera mantido separado para auditoria futura.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-sm">
            <div className="flex items-start gap-2">
              <Sparkles size={15} className="mt-0.5 shrink-0" />
              <p>Use esta limpeza apenas quando quiser substituir completamente a carteira atual por uma nova importacao.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Digite exatamente o nome da empresa para confirmar
            </label>
            <input
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              placeholder={companyName || 'Nome da empresa'}
              className="input-premium w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-red-500 focus:ring-2"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200/80 bg-slate-50/80 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !isValid}
            className="rounded-2xl bg-gradient-to-r from-red-600 to-red-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(220,38,38,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_34px_rgba(220,38,38,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Limpando visao...' : 'Confirmar limpeza'}
          </button>
        </div>
      </div>
    </div>
  );
}
