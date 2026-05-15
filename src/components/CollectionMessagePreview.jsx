import { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCcw, Sparkles } from 'lucide-react';
import CollectionToneSelector from './CollectionToneSelector';
import { generateCollectionMessage, getDefaultCollectionTone } from '../services/collectionMessageService';

const severityClasses = {
  info:    'bg-blue-500/10    text-blue-300    ring-blue-500/25',
  warning: 'bg-amber-500/10   text-amber-300   ring-amber-500/25',
  danger:  'bg-red-500/10     text-red-300     ring-red-500/25',
  success: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
};

export default function CollectionMessagePreview({
  title = 'IA de cobranca local',
  context,
  initialMessage = '',
  restoreMessage = '',
  onMessageChange,
  onGenerated,
  onSaveTemplate,
  saveTemplateLabel = 'Salvar como modelo da empresa',
  savingTemplate = false,
  extraActions = null,
}) {
  const [tone, setTone] = useState(() => getDefaultCollectionTone(context));
  const [message, setMessage] = useState(initialMessage || '');
  const [generated, setGenerated] = useState(() => generateCollectionMessage(context, getDefaultCollectionTone(context)));

  useEffect(() => {
    const defaultTone = getDefaultCollectionTone(context);
    setTone(defaultTone);
    const nextGenerated = generateCollectionMessage(context, defaultTone);
    setGenerated(nextGenerated);
    const nextMessage = initialMessage || nextGenerated.message;
    setMessage(nextMessage);
  }, [context, initialMessage]);

  const activeRestoreMessage = restoreMessage || generated.message;

  const severityClass = useMemo(
    () => severityClasses[generated?.severity] || severityClasses.info,
    [generated?.severity]
  );

  const handleGenerate = () => {
    const next = generateCollectionMessage(context, tone);
    setGenerated(next);
    setMessage(next.message);
    onMessageChange?.(next.message);
    onGenerated?.(next);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message || '');
    } catch {
      // O feedback fica a cargo da tela consumidora quando necessario.
    }
  };

  const handleRestore = () => {
    setMessage(activeRestoreMessage);
    onMessageChange?.(activeRestoreMessage);
  };

  return (
    <section className="text-crisp rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-soft">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-50">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Gere uma mensagem local por regras, revise o tom e ajuste o texto antes de usar no WhatsApp.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${severityClass}`}>
          <Sparkles size={12} />
          {generated?.summary || 'Mensagem inteligente'}
        </span>
      </div>

      <div className="mt-4">
        <CollectionToneSelector value={tone} onChange={setTone} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4">
          <textarea
            rows={11}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              onMessageChange?.(event.target.value);
            }}
            className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-50 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Assunto / resumo</p>
            <p className="mt-2 text-sm font-semibold text-slate-50">{generated?.subject || '-'}</p>
            <p className="mt-2 text-xs text-slate-400">{generated?.actionSuggestion || '-'}</p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Acoes</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/15"
              >
                <Sparkles size={13} />
                Gerar mensagem
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="control-surface inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200"
              >
                <Copy size={13} />
                Copiar mensagem
              </button>
              <button
                type="button"
                onClick={handleRestore}
                className="control-surface inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200"
              >
                <RefreshCcw size={13} />
                Restaurar mensagem padrao
              </button>
              {onSaveTemplate ? (
                <button
                  type="button"
                  disabled={savingTemplate}
                  onClick={() => onSaveTemplate(message)}
                  className="control-surface inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50"
                >
                  <Copy size={13} />
                  {savingTemplate ? 'Salvando modelo...' : saveTemplateLabel}
                </button>
              ) : null}
              {extraActions}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
