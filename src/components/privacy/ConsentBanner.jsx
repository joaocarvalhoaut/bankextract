import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'nc-finance.privacy-consent.v1';

export default function ConsentBanner() {
  const [accepted, setAccepted] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setAccepted(stored === 'accepted');
  }, []);

  const handleAccept = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'accepted');
    }
    setAccepted(true);
  };

  if (accepted) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[90] mx-auto max-w-4xl rounded-[24px] border border-cyan-500/20 bg-slate-950/90 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-50">Consentimento basico de uso e privacidade</p>
            <p className="mt-1 text-sm text-slate-300">
              Ao continuar, voce concorda com os nossos
              <a href="/termos" className="mx-1 text-cyan-300 hover:text-cyan-200">Termos</a>
              e com a
              <a href="/privacidade" className="ml-1 text-cyan-300 hover:text-cyan-200">Politica de Privacidade</a>.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAccept}
          className="btn-brand rounded-2xl px-4 py-3 text-sm font-semibold"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
