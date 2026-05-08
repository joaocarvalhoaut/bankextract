import { HelpCircle, LifeBuoy, MessageSquareQuote } from 'lucide-react';
import HelpArticleCard from '../components/HelpArticleCard';
import OnboardingGuide from '../components/OnboardingGuide';
import { HELP_ARTICLES } from '../constants/helpArticles';

const FAQ_ITEMS = [
  {
    question: 'O sistema envia cobranca automatica real agora?',
    answer: 'Nao. O NC Finance continua priorizando simulacao e preparo manual assistido nesta fase.',
  },
  {
    question: 'Preciso configurar WhatsApp ou Z-API para testar?',
    answer: 'Nao. O fluxo de simulacao e preparo manual pode ser validado sem integracao paga.',
  },
  {
    question: 'Os dados ficam separados por empresa?',
    answer: 'Sim. O isolamento por company_id continua valendo para carteira, cobrancas, notificacoes e auditoria.',
  },
  {
    question: 'Como acompanho limites do plano?',
    answer: 'Use Billing, Planos, Analytics e os avisos do sistema para ver consumo, restante e alertas de limite.',
  },
];

export default function HelpCenterScreen({
  onboarding,
  companyId,
  onOpenTab,
  onOpenStep,
  onMarkStep,
  onSkipStep,
  onOpenArticle,
  markingStepId = '',
  skippedStepIds = [],
}) {
  return (
    <div className="space-y-6">
      <section className="hero-mesh overflow-hidden rounded-[32px] border border-slate-200 bg-white px-6 py-8 shadow-soft">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <LifeBuoy size={14} />
              Central de ajuda
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Guias praticos para operar o NC Finance com seguranca</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Aprenda o fluxo de importacao, cobranca, simulacao, dashboard, limites, notificacoes e auditoria sem depender de integracoes pagas.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: 'Guias', value: HELP_ARTICLES.length },
              { label: 'FAQ', value: FAQ_ITEMS.length },
              { label: 'Etapas', value: onboarding?.total || 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-soft">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <OnboardingGuide
        steps={onboarding?.steps || []}
        companyId={companyId}
        onOpenStep={onOpenStep}
        onMarkStep={onMarkStep}
        onSkipStep={onSkipStep}
        onOpenArticle={onOpenArticle}
        markingStepId={markingStepId}
        skippedStepIds={skippedStepIds}
      />

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <HelpCircle size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Artigos essenciais</h2>
            <p className="text-sm text-slate-500">Percorra os guias mais usados pela operacao e abra a tela correspondente com um clique.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {HELP_ARTICLES.map((article) => (
            <HelpArticleCard key={article.id} article={article} onOpenTab={onOpenTab} />
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
            <MessageSquareQuote size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Perguntas frequentes</h2>
            <p className="text-sm text-slate-500">Respostas rapidas para as duvidas que mais aparecem no onboarding e na operacao.</p>
          </div>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item) => (
            <article key={item.question} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">{item.question}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
