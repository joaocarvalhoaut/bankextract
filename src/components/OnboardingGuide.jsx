import { ArrowRight, CheckCircle2, CircleDashed, Eye, SkipForward, Sparkles } from 'lucide-react';
import { HELP_ARTICLE_MAP } from '../constants/helpArticles';

const STEP_ARTICLE_MAP = {
  connect_whatsapp: 'integracoes-zapi',
  import_clients: 'importar-carteira',
  create_first_automation: 'preparar-cobranca',
  send_first_charge: 'executar-simulacao',
  configure_billing: 'planos-billing',
};

function statusTone(done, skipped) {
  if (done) return 'border-cyan-500/20 bg-cyan-500/10';
  if (skipped) return 'border-amber-500/20 bg-amber-500/10';
  return 'border-slate-700 bg-slate-900/60';
}

export default function OnboardingGuide({
  steps = [],
  companyId,
  onOpenStep,
  onMarkStep,
  onSkipStep,
  onOpenArticle,
  markingStepId = '',
  skippedStepIds = [],
}) {
  const canMark = Boolean(companyId);

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 shadow-soft">
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Primeiros passos guiados</h2>
          <p className="mt-1 text-sm text-slate-500">
            Complete o basico para importar carteira, configurar cobranca e validar a operacao.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
          <Sparkles size={14} />
          Onboarding rico
        </span>
      </div>

      <div className="space-y-3">
        {steps.map((step) => {
          const done = Boolean(step.done);
          const skipped = !done && skippedStepIds.includes(step.id);
          const article = HELP_ARTICLE_MAP[step.helpArticleId || STEP_ARTICLE_MAP[step.id]];

          return (
            <article key={step.id} className={`rounded-2xl border p-4 shadow-soft transition ${statusTone(done, skipped)}`}>
              <div className="flex items-start gap-4">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${done ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white' : skipped ? 'bg-amber-500 text-white' : 'bg-slate-800/60 text-slate-500'}`}>
                  {done ? <CheckCircle2 size={18} /> : <CircleDashed size={18} />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-50">{step.title}</h3>
                    {done ? (
                      <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">Concluido</span>
                    ) : skipped ? (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">Pulada</span>
                    ) : null}
                    {step.actionTab ? (
                      <span className="rounded-full border border-slate-700 bg-slate-800/40 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        {step.actionTab}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{step.description}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenStep?.(step)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800/40"
                    >
                      Ir para etapa
                      <ArrowRight size={14} />
                    </button>

                    {article ? (
                      <button
                        type="button"
                        onClick={() => onOpenArticle?.(article.id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/15"
                      >
                        <Eye size={14} />
                        Ver guia
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => onMarkStep?.(step)}
                      disabled={!canMark || done || markingStepId === step.id}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        done
                          ? 'cursor-default border border-cyan-500/20 bg-cyan-500/10 text-cyan-200'
                          : !canMark
                            ? 'cursor-not-allowed border border-slate-700 bg-slate-800/60 text-slate-400'
                            : 'btn-brand border border-cyan-500/20 text-white'
                      }`}
                    >
                      {done ? 'Concluido' : markingStepId === step.id ? 'Marcando...' : 'Marcar como concluido'}
                    </button>

                    {!done ? (
                      <button
                        type="button"
                        onClick={() => onSkipStep?.(step)}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/15"
                      >
                        <SkipForward size={14} />
                        Pular etapa
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
