import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileSearch,
  ListChecks,
  Receipt,
  Shield,
  ShieldCheck,
  Sparkles,
  Upload,
  WalletCards,
} from 'lucide-react';
import PlanCard from '../components/plans/PlanCard';
import { getAllPlans } from '../constants/plans';

const painPoints = [
  {
    title: 'Carteira desorganizada',
    description:
      'Titulos espalhados, vencimentos perdidos e pouca visao do que precisa ser cobrado agora.',
    icon: WalletCards,
  },
  {
    title: 'Cobranca sem historico',
    description:
      'Mensagens enviadas sem auditoria, sem rastreio e sem clareza sobre o que ja foi feito.',
    icon: Clock3,
  },
  {
    title: 'Dados inconsistentes',
    description:
      'Telefone invalido, boleto ausente e informacoes incompletas atrasam toda a operacao.',
    icon: AlertCircle,
  },
];

const modules = [
  {
    title: 'Cobranca Automatica',
    description: 'Configure sua regua, templates, horarios e regras de simulacao.',
    icon: Activity,
  },
  {
    title: 'Central Operacional',
    description: 'Veja titulos em aberto, etapas da regua, boletos encontrados e acoes por cliente.',
    icon: Sparkles,
  },
  {
    title: 'Auditoria de Cobrancas',
    description: 'Acompanhe simulacoes, mensagens, status, erros e historico por empresa.',
    icon: Receipt,
  },
  {
    title: 'Auditoria de Dados',
    description: 'Identifique telefones invalidos, boletos ausentes, valores zerados e duplicidades.',
    icon: FileSearch,
  },
  {
    title: 'Checklist Pre-Envio',
    description: 'Valide se a empresa esta pronta antes de liberar qualquer envio real.',
    icon: ShieldCheck,
  },
];

const practicalFlow = [
  {
    step: '1',
    title: 'Importe sua carteira',
    description: 'Upload de planilhas e organizacao automatica.',
    icon: Upload,
  },
  {
    step: '2',
    title: 'Sistema valida tudo',
    description: 'Telefone, boleto, inconsistencias e regras antes de qualquer envio.',
    icon: ListChecks,
  },
  {
    step: '3',
    title: 'Simule antes de ativar',
    description: 'Audite toda a operacao antes do envio real.',
    icon: Shield,
  },
];

const outcomes = [
  'Ate 80% menos trabalho manual',
  'Mais controle sobre titulos em aberto',
  'Menos falhas antes do envio',
  'Mensagens padronizadas por empresa',
  'Auditoria completa da operacao',
  'Preparacao segura para automacao real',
];

const socialLogos = ['Construtora', 'Distribuidora', 'Industria', 'Atacado', 'Servicos', 'B2B'];
const trustMetrics = [
  { value: '+87%', label: 'Boletos localizados automaticamente' },
  { value: '3x', label: 'Mais produtividade operacional' },
  { value: '100%', label: 'Operacao auditavel por titulo' },
];

function SectionBadge({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
      <Sparkles size={12} />
      {children}
    </span>
  );
}

function PublicButton({ children, onClick, primary = false, fullWidth = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? `inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-7 py-4 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(5,150,105,0.22)] transition duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:bg-emerald-600 hover:shadow-[0_24px_48px_rgba(5,150,105,0.26)] active:scale-[0.99] ${fullWidth ? 'w-full' : ''}`
          : `inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-7 py-4 text-sm font-semibold text-slate-700 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:bg-slate-50 ${fullWidth ? 'w-full' : ''}`
      }
    >
      {children}
    </button>
  );
}

function InfoCard({ icon: Icon, title, description, tone = 'emerald' }) {
  const toneClass =
    tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700';

  return (
    <article className="fade-up rounded-[24px] border border-slate-200 bg-white p-6 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-card">
      <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl ${toneClass}`}>
        <Icon size={20} />
      </div>
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
    </article>
  );
}

export default function LandingPage({ onStartNow, onOpenPlans, isAuthenticated = false }) {
  const handleStart = onStartNow || (() => {});
  const handlePlans = onOpenPlans || (() => {});
  const plans = getAllPlans();

  return (
    <div className="pb-28 md:pb-10">
      <div className="mx-auto flex max-w-[1540px] flex-col gap-12 px-4 py-4 md:px-6 xl:px-8">
        <header className="sticky top-0 z-40 -mx-4 border-b border-slate-200/80 bg-white/82 px-4 py-2.5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all md:-mx-6 md:px-6 xl:-mx-8 xl:px-8">
          <div className="mx-auto flex max-w-[1540px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-900/15">
                <WalletCards size={20} />
              </div>
              <div>
                <p className="text-base font-bold tracking-tight text-slate-950">BankExtract Pro</p>
                <p className="text-xs text-slate-500">Gestao Financeira & Cobranca</p>
              </div>
            </div>

            <nav className="hidden flex-wrap items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
              <a href="#recursos" className="transition hover:text-slate-950">Recursos</a>
              <a href="#como-funciona" className="transition hover:text-slate-950">Como funciona</a>
              <a href="#planos" className="transition hover:text-slate-950">Planos</a>
              <a href="#clientes" className="transition hover:text-slate-950">Clientes</a>
              <button type="button" onClick={handleStart} className="transition hover:text-slate-950">Entrar</button>
            </nav>

            <PublicButton primary onClick={handleStart}>
              Teste gratis
              <ArrowRight size={16} />
            </PublicButton>
          </div>
        </header>

        <section className="hero-mesh overflow-hidden rounded-[38px] border border-slate-200 bg-white px-8 py-12 shadow-[0_30px_80px_rgba(15,23,42,0.10)] md:px-10 md:py-14 xl:px-14 xl:py-20">
          <div className="grid gap-12 xl:grid-cols-[1.08fr_0.92fr] xl:items-center">
            <div className="fade-up space-y-8">
              <SectionBadge>Plataforma de cobranca inteligente</SectionBadge>

              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-bold leading-[0.92] tracking-[-0.04em] text-slate-950 md:text-6xl xl:text-7xl">
                  Cobranca automatica por WhatsApp para{' '}
                  <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-blue-600 bg-clip-text text-transparent">
                    reduzir inadimplencia
                  </span>
                </h1>
                <p className="max-w-2xl text-base leading-8 text-slate-600 md:text-lg">
                  Organize sua carteira, encontre inconsistencias, simule cobrancas e acompanhe tudo antes do envio real.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <PublicButton primary onClick={handleStart}>
                  {isAuthenticated ? 'Acessar plataforma' : 'Comecar teste gratis'}
                  <ArrowRight size={16} />
                </PublicButton>
                <PublicButton onClick={handlePlans}>
                  Ver demonstracao
                  <ChevronRight size={16} />
                </PublicButton>
              </div>

              <p className="text-sm font-medium text-slate-500">
                Sem instalacao • Ambiente seguro • Comece em minutos
              </p>

              <div className="grid gap-3 md:grid-cols-3">
                {trustMetrics.map((metric) => (
                  <article
                    key={metric.label}
                    className="fade-up rounded-[22px] border border-slate-200 bg-white/92 p-4 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-card"
                  >
                    <p className="text-2xl font-bold tracking-tight text-slate-950">{metric.value}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{metric.label}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="relative fade-up xl:scale-[1.16] xl:origin-right">
              <div className="absolute -left-10 top-10 h-40 w-40 rounded-full bg-emerald-200/45 blur-3xl" />
              <div className="absolute -right-6 bottom-6 h-40 w-40 rounded-full bg-blue-200/45 blur-3xl" />
              <div className="relative rounded-[34px] border border-slate-200 bg-slate-50 p-4 shadow-[0_34px_90px_rgba(15,23,42,0.14)] md:p-5">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Painel operacional</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-950">Cobranca em simulacao</h3>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
                      Simulacao ativa
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Total em aberto', value: 'R$ 182.540', tone: 'text-slate-950' },
                      { label: 'Telefones validos', value: '84%', tone: 'text-emerald-700' },
                      { label: 'Boletos encontrados', value: '88%', tone: 'text-blue-700' },
                      { label: 'Simulacoes hoje', value: '37', tone: 'text-emerald-700' },
                    ].map((card) => (
                      <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.label}</p>
                        <p className={`mt-2 text-2xl font-bold ${card.tone}`}>{card.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-[22px] border border-slate-200 bg-white shadow-soft">
                    <div className="grid grid-cols-[1.45fr_1fr_1fr_0.95fr] gap-3 border-b border-slate-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <span>Cliente</span>
                      <span>Boleto</span>
                      <span>Vencimento</span>
                      <span>Status</span>
                    </div>
                    {[
                      { cliente: 'Distribuidora Atlas', boleto: '3001-2', vencimento: '10/05/2026', status: 'Simulado' },
                      { cliente: 'Industria Norte', boleto: '8841-9', vencimento: '11/05/2026', status: 'Em analise' },
                      { cliente: 'Clinica Central', boleto: '1208-4', vencimento: '12/05/2026', status: 'Sem boleto' },
                    ].map((row, index) => (
                      <div key={`${row.cliente}-${index}`} className="grid grid-cols-[1.45fr_1fr_1fr_0.95fr] gap-3 px-4 py-3 text-sm text-slate-700">
                        <span className="font-medium text-slate-900">{row.cliente}</span>
                        <span>{row.boleto}</span>
                        <span>{row.vencimento}</span>
                        <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          row.status === 'Simulado'
                            ? 'bg-emerald-50 text-emerald-700'
                            : row.status === 'Em analise'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-amber-50 text-amber-700'
                        }`}>
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white px-8 py-8 shadow-soft md:px-10 xl:px-14">
          <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-end">
            <div className="fade-up">
              <h2 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
                Empresas organizando sua cobranca com BankExtract Pro
              </h2>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600">
                Mais controle operacional, menos inadimplencia e mais previsibilidade financeira.
              </p>
            </div>
            <div className="fade-up inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <ShieldCheck size={14} className="text-emerald-600" />
              Ambiente seguro • Operacao auditavel • Simulacao antes do envio real
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {socialLogos.map((logo) => (
              <div
                key={logo}
                className="fade-up flex h-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold uppercase tracking-[0.22em] text-slate-400 transition duration-200 hover:border-slate-300 hover:bg-white hover:text-slate-500"
              >
                {logo}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-soft lg:p-10">
          <div className="max-w-3xl fade-up">
            <SectionBadge>Problema</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              Cobrar manualmente custa tempo, dinheiro e controle
            </h2>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {painPoints.map((item) => (
              <InfoCard key={item.title} {...item} tone="red" />
            ))}
          </div>
        </section>

        <section id="recursos" className="rounded-[32px] border border-slate-200 bg-slate-50 px-8 py-10 shadow-soft lg:px-10">
          <div className="max-w-3xl fade-up">
            <SectionBadge>Solucao em modulos</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              Uma plataforma completa para operar sua cobranca
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Do monitoramento da carteira a auditoria de envio, tudo em um fluxo seguro antes da ativacao real.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {modules.map((item) => (
              <InfoCard key={item.title} {...item} />
            ))}
          </div>
        </section>

        <section id="como-funciona" className="rounded-[32px] border border-slate-200 bg-white px-8 py-10 shadow-soft lg:px-10">
          <div className="max-w-3xl fade-up">
            <SectionBadge>Como funciona na pratica</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Como funciona na pratica</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Fluxo operacional desenhado para cobranca segura e escalavel.
            </p>
          </div>

          <div className="relative mt-10 grid gap-5 xl:grid-cols-3">
            {practicalFlow.map((item) => (
              <article
                key={item.step}
                className="fade-up relative rounded-[26px] border border-slate-200 bg-slate-50 p-6 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-card"
              >
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white shadow-lg shadow-emerald-900/15">
                    {item.step}
                  </div>
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-soft">
                    <item.icon size={18} />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="clientes" className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-soft lg:p-10">
          <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr] xl:items-center">
            <div className="fade-up rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-soft">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft">
                <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sidebar resumida</p>
                    <div className="mt-4 space-y-2">
                      {['Dashboard', 'Cobranca Automatica', 'Central Operacional', 'Auditoria de Dados', 'Checklist Pre-Envio'].map((item, index) => (
                        <div
                          key={item}
                          className={`rounded-xl px-3 py-2 text-sm font-medium ${
                            index === 1 ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'text-slate-600'
                          }`}
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Carteira ativa', value: 'R$ 92.440' },
                        { label: 'Em cobranca', value: '126 titulos' },
                        { label: 'Com inconsistencia', value: '9 itens' },
                        { label: 'Auditoria', value: 'Ativa' },
                      ].map((card) => (
                        <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.label}</p>
                          <p className="mt-2 text-xl font-bold text-slate-950">{card.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-white shadow-soft">
                      <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-3 border-b border-slate-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        <span>Cliente</span>
                        <span>Etapa</span>
                        <span>Boleto</span>
                        <span>Status</span>
                      </div>
                      {[
                        ['Atacado Norte', 'Preventiva', 'Encontrado', 'Simulado'],
                        ['Oficina Brasil', 'Atraso', 'Pendente', 'Inconsistencia'],
                        ['Distribuidora Vale', 'Vencimento', 'Encontrado', 'Auditoria'],
                      ].map((row) => (
                        <div key={row.join('-')} className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-3 px-4 py-3 text-sm text-slate-700">
                          <span className="font-medium text-slate-900">{row[0]}</span>
                          <span>{row[1]}</span>
                          <span>{row[2]}</span>
                          <span>{row[3]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="fade-up">
              <SectionBadge>Preview do produto</SectionBadge>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
                Visao completa para decidir antes de cobrar
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate-600">
                O BankExtract mostra sua operacao com clareza antes de qualquer envio real.
              </p>

              <div className="mt-6 space-y-3">
                {[
                  'Simulacao antes do envio real',
                  'Isolamento por empresa',
                  'Historico auditavel',
                  'Painel de inconsistencias',
                  'Checklist de prontidao',
                  'Preparado para integracao WhatsApp',
                ].map((item) => (
                  <div key={item} className="fade-up flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-soft">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span className="text-sm font-medium text-slate-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-slate-50 px-8 py-10 shadow-soft lg:px-10">
          <div className="max-w-3xl fade-up">
            <SectionBadge>Resultados e beneficios</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              Menos cobranca manual. Mais controle financeiro.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {outcomes.map((item) => (
              <div
                key={item}
                className="fade-up rounded-[24px] border border-slate-200 bg-white p-6 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-card"
              >
                <CheckCircle2 size={18} className="text-emerald-600" />
                <p className="mt-4 text-base font-semibold text-slate-950">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="planos" className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-soft lg:p-10">
          <div className="max-w-3xl fade-up">
            <SectionBadge>Planos</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Planos para cada fase da sua operacao</h2>
          </div>
          <div className="mt-8 grid gap-4 xl:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onAction={plan.id === 'business' ? handlePlans : handleStart}
                footer="Envios inclusos por mês."
              />
            ))}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-slate-500">
            Envios inclusos por mes. Pacotes extras e integracoes podem ser contratados separadamente.
          </p>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white px-8 py-10 shadow-card lg:px-10">
          <div className="mx-auto max-w-3xl text-center fade-up">
            <SectionBadge>Proximo passo</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              Pronto para transformar sua cobranca em processo?
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Comece com simulacao segura, organize sua carteira e prepare sua empresa para cobranca automatica.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <PublicButton primary onClick={handleStart}>
                Comecar teste gratis
                <ArrowRight size={16} />
              </PublicButton>
              <PublicButton onClick={handlePlans}>
                Ver demonstracao
                <ChevronRight size={16} />
              </PublicButton>
            </div>
          </div>
        </section>

        <footer className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-soft">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-base font-bold text-slate-950">BankExtract Pro</p>
              <p className="text-sm text-slate-500">Gestao Financeira & Cobranca</p>
            </div>

            <div className="flex flex-wrap gap-5 text-sm font-medium text-slate-600">
              <a href="#recursos" className="transition hover:text-slate-950">Recursos</a>
              <a href="#planos" className="transition hover:text-slate-950">Planos</a>
              <button type="button" onClick={handleStart} className="transition hover:text-slate-950">Entrar</button>
              <a href="mailto:contato@bankextract.pro" className="transition hover:text-slate-950">Contato</a>
            </div>
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-500">
            © BankExtract Pro. Todos os direitos reservados.
          </div>
        </footer>
      </div>

      <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <PublicButton primary fullWidth onClick={handleStart}>
          Comecar teste gratis
          <ArrowRight size={16} />
        </PublicButton>
      </div>
    </div>
  );
}
