import {
  Activity,
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileSearch,
  ListChecks,
  MessageCircleMore,
  Receipt,
  Shield,
  ShieldCheck,
  Sparkles,
  Upload,
  WalletCards,
} from 'lucide-react';

const painPoints = [
  {
    title: 'Carteira desorganizada',
    description:
      'Títulos espalhados, vencimentos perdidos e falta de visão clara do que precisa ser cobrado.',
    icon: WalletCards,
  },
  {
    title: 'Cobrança sem histórico',
    description:
      'Mensagens enviadas sem auditoria, sem rastreio e sem clareza sobre o que já foi feito.',
    icon: Clock3,
  },
  {
    title: 'Dados inconsistentes',
    description:
      'Telefone inválido, boleto ausente e informações incompletas atrasam toda a operação.',
    icon: AlertCircle,
  },
];

const modules = [
  {
    title: 'Cobrança Automática',
    description: 'Configure sua régua, templates, horários e regras de simulação.',
    icon: Activity,
  },
  {
    title: 'Central Operacional',
    description: 'Veja títulos em aberto, etapas da régua, boletos encontrados e ações por cliente.',
    icon: Sparkles,
  },
  {
    title: 'Auditoria de Cobranças',
    description: 'Acompanhe simulações, mensagens, status, erros e histórico por empresa.',
    icon: Receipt,
  },
  {
    title: 'Auditoria de Dados',
    description: 'Identifique telefones inválidos, boletos ausentes, valores zerados e duplicidades.',
    icon: FileSearch,
  },
  {
    title: 'Checklist Pré-Envio',
    description: 'Valide se a empresa está pronta antes de liberar qualquer envio real.',
    icon: ShieldCheck,
  },
];

const practicalFlow = [
  {
    step: '1',
    title: 'Importe sua carteira',
    description: 'Upload de planilhas e organização automática.',
    icon: Upload,
  },
  {
    step: '2',
    title: 'Sistema valida tudo',
    description: 'Telefone, boleto, inconsistências e regras.',
    icon: ListChecks,
  },
  {
    step: '3',
    title: 'Simule antes de ativar',
    description: 'Audite toda operação antes do envio real.',
    icon: Shield,
  },
];

const outcomes = [
  'Até 80% menos trabalho manual',
  'Mais controle sobre títulos em aberto',
  'Menos falhas antes do envio',
  'Mensagens padronizadas por empresa',
  'Auditoria completa da operação',
  'Preparação segura para automação real',
];

const plans = [
  {
    name: 'Starter',
    price: 'R$149/mês',
    description: 'Para pequenas operações que querem organizar a cobrança.',
    features: [
      '1 empresa',
      'Importação de dados',
      'Visão geral',
      'Simulação de cobrança',
      'Histórico básico',
    ],
    cta: 'Começar teste grátis',
    featured: false,
  },
  {
    name: 'Pro',
    price: 'R$297/mês',
    description: 'Para empresas que querem operar cobrança com auditoria.',
    features: [
      'Tudo do Starter',
      'Central Operacional',
      'Auditoria de Cobranças',
      'Auditoria de Dados',
      'Checklist Pré-Envio',
      'Multiusuário básico',
    ],
    cta: 'Começar teste grátis',
    featured: true,
    badge: 'Mais indicado',
  },
  {
    name: 'Business',
    price: 'R$597/mês',
    description: 'Para operações com maior volume e controle.',
    features: [
      'Tudo do Pro',
      'Multiempresa',
      'Relatórios avançados',
      'Permissões por usuário',
      'Suporte prioritário',
      'Integrações sob demanda',
    ],
    cta: 'Falar com especialista',
    featured: false,
  },
];

const socialLogos = ['Construtora', 'Distribuidora', 'Indústria', 'Atacado', 'Serviços', 'B2B'];
const trustMetrics = [
  { value: '+87%', label: 'Boletos localizados automaticamente' },
  { value: '3x', label: 'Mais produtividade operacional' },
  { value: '100%', label: 'Operação auditável por título' },
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

function PainCard({ icon: Icon, title, description, className = '' }) {
  return (
    <article className={`fade-up rounded-[24px] border border-slate-200 bg-white p-6 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-card ${className}`}>
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <Icon size={20} />
      </div>
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
    </article>
  );
}

function ModuleCard({ icon: Icon, title, description, className = '' }) {
  return (
    <article className={`fade-up rounded-[24px] border border-slate-200 bg-white p-6 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-card ${className}`}>
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
        <Icon size={20} />
      </div>
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
    </article>
  );
}

function PlanCard({ plan, onPrimaryClick }) {
  return (
    <article
      className={`fade-up relative rounded-[28px] border p-7 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-card ${
        plan.featured ? 'border-emerald-300 bg-white ring-1 ring-emerald-100' : 'border-slate-200 bg-white'
      }`}
    >
      {plan.badge ? (
        <span className="absolute right-5 top-5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
          {plan.badge}
        </span>
      ) : null}
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{plan.name}</p>
      <h3 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">{plan.price}</h3>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{plan.description}</p>
      <ul className="mt-6 space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm text-slate-700">
            <BadgeCheck size={15} className="text-emerald-600" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onPrimaryClick}
        className={`mt-7 w-full rounded-2xl px-4 py-3.5 text-sm font-bold transition ${
          plan.featured
            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
            : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
        }`}
      >
        {plan.cta}
      </button>
    </article>
  );
}

export default function LandingPage({ onStartNow, onOpenPlans, isAuthenticated = false }) {
  const handleStart = onStartNow || (() => {});
  const handlePlans = onOpenPlans || (() => {});

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
                <p className="text-xs text-slate-500">Gestão Financeira & Cobrança</p>
              </div>
            </div>

            <nav className="hidden flex-wrap items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
              <a href="#recursos" className="transition hover:text-slate-950">
                Recursos
              </a>
              <a href="#como-funciona" className="transition hover:text-slate-950">
                Como funciona
              </a>
              <a href="#planos" className="transition hover:text-slate-950">
                Planos
              </a>
              <a href="#clientes" className="transition hover:text-slate-950">
                Clientes
              </a>
              <button type="button" onClick={handleStart} className="transition hover:text-slate-950">
                Entrar
              </button>
            </nav>

            <PublicButton primary onClick={handleStart}>
              Teste grátis
              <ArrowRight size={16} />
            </PublicButton>
          </div>
        </header>

        <section className="hero-mesh overflow-hidden rounded-[38px] border border-slate-200 bg-white px-8 py-12 shadow-[0_30px_80px_rgba(15,23,42,0.10)] md:px-10 md:py-14 xl:px-14 xl:py-20">
          <div className="grid gap-12 xl:grid-cols-[1.08fr_0.92fr] xl:items-center">
            <div className="fade-up space-y-8">
              <SectionBadge>Plataforma de cobrança inteligente</SectionBadge>

              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-bold leading-[0.92] tracking-[-0.04em] text-slate-950 md:text-6xl xl:text-7xl">
                  Cobrança automática por WhatsApp para{' '}
                  <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-blue-600 bg-clip-text text-transparent">
                    reduzir inadimplência
                  </span>
                </h1>
                <p className="max-w-2xl text-base leading-8 text-slate-600 md:text-lg">
                  Organize sua carteira, encontre inconsistências, simule cobranças e acompanhe tudo antes do envio
                  real.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <PublicButton primary onClick={handleStart}>
                  {isAuthenticated ? 'Acessar plataforma' : 'Começar teste grátis'}
                  <ArrowRight size={16} />
                </PublicButton>
                <PublicButton onClick={handlePlans}>
                  Ver demonstração
                  <ChevronRight size={16} />
                </PublicButton>
              </div>

              <p className="text-sm font-medium text-slate-500">
                Sem instalação • Ambiente seguro • Comece em minutos
              </p>

              <div className="grid gap-3 md:grid-cols-3">
                {trustMetrics.map((metric, index) => (
                  <article
                    key={metric.label}
                    className={`fade-up rounded-[22px] border border-slate-200 bg-white/92 p-4 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-card stagger-${index + 1}`}
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
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Painel operacional
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-950">Cobrança em simulação</h3>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
                      Simulação ativa
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Total em aberto', value: 'R$ 182.540', tone: 'text-slate-950' },
                      { label: 'Telefones válidos', value: '84%', tone: 'text-emerald-700' },
                      { label: 'Boletos encontrados', value: '88%', tone: 'text-blue-700' },
                      { label: 'Simulações hoje', value: '37', tone: 'text-emerald-700' },
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
                      { cliente: 'Indústria Norte', boleto: '8841-9', vencimento: '11/05/2026', status: 'Em análise' },
                      { cliente: 'Clínica Central', boleto: '1208-4', vencimento: '12/05/2026', status: 'Sem boleto' },
                    ].map((row, index) => (
                      <div
                        key={`${row.cliente}-${index}`}
                        className="grid grid-cols-[1.45fr_1fr_1fr_0.95fr] gap-3 px-4 py-3 text-sm text-slate-700"
                      >
                        <span className="font-medium text-slate-900">{row.cliente}</span>
                        <span>{row.boleto}</span>
                        <span>{row.vencimento}</span>
                        <span
                          className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            row.status === 'Simulado'
                              ? 'bg-emerald-50 text-emerald-700'
                              : row.status === 'Em análise'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-amber-50 text-amber-700'
                          }`}
                        >
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
                Empresas organizando sua cobrança com BankExtract Pro
              </h2>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600">
                Mais controle operacional, menos inadimplência e mais previsibilidade financeira.
              </p>
            </div>
            <div className="fade-up inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <ShieldCheck size={14} className="text-emerald-600" />
              Ambiente seguro • Operação auditável • Simulação antes do envio real
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {socialLogos.map((logo, index) => (
              <div
                key={logo}
                className={`fade-up flex h-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold uppercase tracking-[0.22em] text-slate-400 transition duration-200 hover:border-slate-300 hover:bg-white hover:text-slate-500 stagger-${(index % 6) + 1}`}
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
            {painPoints.map((item, index) => (
              <PainCard key={item.title} {...item} className={`stagger-${index + 1}`} />
            ))}
          </div>
        </section>

        <section id="recursos" className="rounded-[32px] border border-slate-200 bg-slate-50 px-8 py-10 shadow-soft lg:px-10">
          <div className="max-w-3xl fade-up">
            <SectionBadge>Solução em módulos</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              Uma plataforma completa para operar sua cobrança
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Do monitoramento da carteira à auditoria de envio, tudo em um fluxo seguro antes da ativação real.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {modules.map((item, index) => (
              <ModuleCard key={item.title} {...item} className={`stagger-${(index % 5) + 1}`} />
            ))}
          </div>
        </section>

        <section id="como-funciona" className="rounded-[32px] border border-slate-200 bg-white px-8 py-10 shadow-soft lg:px-10">
          <div className="max-w-3xl fade-up">
            <SectionBadge>Como funciona na prática</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              Como funciona na prática
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Fluxo operacional desenhado para cobrança segura e escalável.
            </p>
          </div>

          <div className="relative mt-10 grid gap-5 xl:grid-cols-3">
            <div className="absolute left-[18px] top-0 hidden h-full w-px bg-gradient-to-b from-emerald-200 via-slate-200 to-blue-200 xl:left-[calc(16.666%-10px)] xl:top-[38px] xl:block xl:h-px xl:w-[66%]" />
            {practicalFlow.map((item, index) => (
              <article
                key={item.step}
                className={`fade-up relative rounded-[26px] border border-slate-200 bg-slate-50 p-6 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-card stagger-${index + 1}`}
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
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Sidebar resumida
                    </p>
                    <div className="mt-4 space-y-2">
                      {[
                        'Dashboard',
                        'Cobrança Automática',
                        'Central Operacional',
                        'Auditoria de Dados',
                        'Checklist Pré-Envio',
                      ].map((item, index) => (
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
                        { label: 'Em cobrança', value: '126 títulos' },
                        { label: 'Com inconsistência', value: '9 itens' },
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
                        ['Oficina Brasil', 'Atraso', 'Pendente', 'Inconsistência'],
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
                Visão completa para decidir antes de cobrar
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate-600">
                O BankExtract mostra sua operação com clareza antes de qualquer envio real.
              </p>

              <div className="mt-6 space-y-3">
                {[
                  'Simulação antes do envio real',
                  'Isolamento por empresa',
                  'Histórico auditável',
                  'Painel de inconsistências',
                  'Checklist de prontidão',
                  'Preparado para integração WhatsApp',
                ].map((item, index) => (
                  <div
                    key={item}
                    className={`fade-up flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-soft stagger-${(index % 6) + 1}`}
                  >
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
            <SectionBadge>Resultados e benefícios</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              Menos cobrança manual. Mais controle financeiro.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {outcomes.map((item, index) => (
              <div
                key={item}
                className={`fade-up rounded-[24px] border border-slate-200 bg-white p-6 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-card stagger-${(index % 6) + 1}`}
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
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              Planos para cada fase da sua operação
            </h2>
          </div>
          <div className="mt-8 grid gap-4 xl:grid-cols-3">
            {plans.map((plan, index) => (
              <PlanCard
                key={plan.name}
                plan={plan}
                onPrimaryClick={plan.cta === 'Falar com especialista' ? handlePlans : handleStart}
                className={`stagger-${index + 1}`}
              />
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white px-8 py-10 shadow-card lg:px-10">
          <div className="mx-auto max-w-3xl text-center fade-up">
            <SectionBadge>Próximo passo</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              Pronto para transformar sua cobrança em processo?
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Comece com simulação segura, organize sua carteira e prepare sua empresa para cobrança automática.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <PublicButton primary onClick={handleStart}>
                Começar teste grátis
                <ArrowRight size={16} />
              </PublicButton>
              <PublicButton onClick={handlePlans}>
                Ver demonstração
                <ChevronRight size={16} />
              </PublicButton>
            </div>
          </div>
        </section>

        <footer className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-soft">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-base font-bold text-slate-950">BankExtract Pro</p>
              <p className="text-sm text-slate-500">Gestão Financeira & Cobrança</p>
            </div>

            <div className="flex flex-wrap gap-5 text-sm font-medium text-slate-600">
              <a href="#recursos" className="transition hover:text-slate-950">
                Recursos
              </a>
              <a href="#planos" className="transition hover:text-slate-950">
                Planos
              </a>
              <button type="button" onClick={handleStart} className="transition hover:text-slate-950">
                Entrar
              </button>
              <a href="mailto:contato@bankextract.pro" className="transition hover:text-slate-950">
                Contato
              </a>
            </div>
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-500">
            © BankExtract Pro. Todos os direitos reservados.
          </div>
        </footer>
      </div>

      <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <PublicButton primary fullWidth onClick={handleStart}>
          Começar teste grátis
          <ArrowRight size={16} />
        </PublicButton>
      </div>
    </div>
  );
}
