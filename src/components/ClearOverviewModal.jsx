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

  useEffect(() => {
    if (!isOpen) return undefined;

    const currentLockCount = Number(document.body.dataset.modalLockCount || '0');
    if (currentLockCount === 0) {
      document.body.dataset.modalPreviousOverflow = document.body.style.overflow || '';
    }
    document.body.dataset.modalLockCount = String(currentLockCount + 1);
    document.body.style.overflow = 'hidden';

    return () => {
      const nextLockCount = Math.max(0, Number(document.body.dataset.modalLockCount || '1') - 1);
      if (nextLockCount === 0) {
        document.body.style.overflow = document.body.dataset.modalPreviousOverflow || '';
        delete document.body.dataset.modalPreviousOverflow;
        delete document.body.dataset.modalLockCount;
        return;
      }

      document.body.dataset.modalLockCount = String(nextLockCount);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isValid = confirmationText.trim() === String(companyName || '').trim();

  return (
    <div className="modal-overlay fixed inset-0 z-[140] flex items-center justify-center px-4 py-6">
      <div className="modal-shell w-full max-w-2xl overflow-hidden rounded-[34px]">
        <div className="hero-mesh border-b border-slate-700/50 px-6 py-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-red-500/10 text-red-300 shadow-sm">
              <ShieldAlert size={22} />
            </div>
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-slate-900/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-400">
                <AlertTriangle size={12} />
                Acao destrutiva
              </div>
              <h3 className="text-2xl font-semibold text-slate-50">Limpar Visao Geral</h3>
              <p className="text-sm leading-6 text-slate-300">
                Isso removera todos os registros financeiros da empresa selecionada e deixara a carteira pronta para uma nova importacao.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="notice-danger rounded-[26px] p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold">Empresa:</span> {companyName || 'Empresa selecionada'}
                </p>
                <p>Esta acao nao pode ser desfeita.</p>
                <p>O historico de cobrancas sera mantido separado para auditoria futura.</p>
              </div>
            </div>
          </div>

          <div className="notice-info rounded-2xl px-4 py-3 text-sm shadow-sm">
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
              className="input-premium w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm outline-none ring-red-500 focus:ring-2"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-700/50 bg-slate-800/50 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="control-surface rounded-2xl px-4 py-3 text-sm font-medium text-slate-200 shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
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
