import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, RefreshCcw, Sparkles } from 'lucide-react';
import CollectionToneSelector from './CollectionToneSelector';
import { generateCollectionMessage, getDefaultCollectionTone } from '../services/collectionMessageService';

const severityClasses = {
  info: 'bg-blue-900/20 text-blue-700 ring-blue-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
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
  const contextKey = useMemo(() => JSON.stringify(context || {}), [context]);
  const [tone, setTone] = useState(() => getDefaultCollectionTone(context));
  const generated = useMemo(() => generateCollectionMessage(context, tone), [contextKey, context, tone]);
  const [message, setMessage] = useState(() => initialMessage || generated.message);
  const skipToneSyncRef = useRef(false);
  const previousContextKeyRef = useRef(contextKey);
  const previousInitialMessageRef = useRef(initialMessage);
  const onMessageChangeRef = useRef(onMessageChange);

  useEffect(() => {
    onMessageChangeRef.current = onMessageChange;
  }, [onMessageChange]);

  useEffect(() => {
    if (previousContextKeyRef.current === contextKey) return;

    previousContextKeyRef.current = contextKey;
    previousInitialMessageRef.current = initialMessage;
    const defaultTone = getDefaultCollectionTone(context);
    const nextGenerated = generateCollectionMessage(context, defaultTone);
    skipToneSyncRef.current = true;
    setTone(defaultTone);
    const nextMessage = initialMessage || nextGenerated.message;
    setMessage(nextMessage);
    onMessageChangeRef.current?.(nextMessage);
  }, [context, contextKey, initialMessage]);

  useEffect(() => {
    if (previousInitialMessageRef.current === initialMessage) return;

    previousInitialMessageRef.current = initialMessage;
    setMessage(initialMessage || generated.message);
  }, [generated.message, initialMessage]);

  useEffect(() => {
    if (skipToneSyncRef.current) {
      skipToneSyncRef.current = false;
      return;
    }

    setMessage(generated.message);
    previousInitialMessageRef.current = generated.message;
    onMessageChangeRef.current?.(generated.message);
  }, [generated.message, tone]);

  const activeRestoreMessage = generated.message || restoreMessage || '';

  const severityClass = useMemo(
    () => severityClasses[generated?.severity] || severityClasses.info,
    [generated?.severity]
  );

  const handleGenerate = () => {
    setMessage(generated.message);
    previousInitialMessageRef.current = generated.message;
    onMessageChangeRef.current?.(generated.message);
    onGenerated?.(generated);
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
    previousInitialMessageRef.current = activeRestoreMessage;
    onMessageChangeRef.current?.(activeRestoreMessage);
  };

  return (
    <section className="text-crisp rounded-[24px] border border-slate-700 bg-slate-900/60 p-4 shadow-soft">
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
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
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
                Restaurar padrao do estilo
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
