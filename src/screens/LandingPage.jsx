import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  MessageCircleMore,
  Shield,
  Sheet,
  Sparkles,
  Zap,
} from 'lucide-react';

const stats = [
  { value: 'Minutos', label: 'atÃ© carteira pronta' },
  { value: '100%', label: 'multiempresa com RLS' },
  { value: 'Zero', label: 'planilha manual' },
  { value: 'WhatsApp', label: 'cobranÃ§a automÃ¡tica' },
];

const features = [
  {
    icon: FileSearch,
    color: 'emerald',
    title: 'OCR inteligente',
    description: 'Importe PDF, PNG, JPG e JPEG. Revise os dados extraÃ­dos antes de gravar qualquer registro na carteira.',
  },
  {
    icon: Building2,
    color: 'blue',
    title: 'Multiempresa',
    description: 'Cada empresa tem sua carteira isolada. RLS no Supabase garante que dados nunca se misturem entre clientes.',
  },
  {
    icon: MessageCircleMore,
    color: 'green',
    title: 'CobranÃ§as automÃ¡ticas',
    description: 'Configure cadÃªncia por atraso, horÃ¡rio de envio e limite por tÃ­tulo. WhatsApp em modo teste atÃ© ativar real.',
  },
  {
    icon: Sheet,
    color: 'teal',
    title: 'Google Sheets sync',
    description: 'Sincronize a carteira em uma planilha configurÃ¡vel. Cada empresa tem sua prÃ³pria aba e schedule.',
  },
  {
    icon: Shield,
    color: 'purple',
    title: 'Auditoria total',
    description: 'Cada aÃ§Ã£o sensÃ­vel Ã© registrada em audit_logs com company_id, user_id e timestamp. Rastreabilidade completa.',
  },
  {
    icon: BarChart3,
    color: 'amber',
    title: 'Dashboard executivo',
    description: 'KPIs financeiros em tempo real: total em aberto, vencidos, taxa de contato e Ãºltima execuÃ§Ã£o automÃ¡tica.',
  },
];

const colorMap = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'    },
  green:   { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200',   dot: 'bg-green-500'   },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',     dot: 'bg-teal-500'    },
  purple:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-500'  },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
};

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'R$ 97',
    period: '/mÃªs',
    emphasis: 'Para comeÃ§ar a operar',
    features: ['1 empresa', 'AtÃ© 500 registros/mÃªs', 'CobranÃ§a manual', 'Google Sheets', 'Dashboard executivo'],
    cta: 'ComeÃ§ar grÃ¡tis',
    featured: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'R$ 197',
    period: '/mÃªs',
    emphasis: 'Para escalar a cobranÃ§a',
    features: ['AtÃ© 5 empresas', 'AtÃ© 5.000 registros/mÃªs', 'CobranÃ§a automÃ¡tica WhatsApp', 'HistÃ³rico completo', 'Audit logs', 'Suporte prioritÃ¡rio'],
    cta: 'Assinar Pro',
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    emphasis: 'Para alto volume',
    features: ['Empresas ilimitadas', 'Alto volume', 'IntegraÃ§Ãµes personalizadas', 'SLA dedicado', 'Onboarding guiado'],
    cta: 'Falar com time',
    featured: false,
  },
];

const steps = [
  { n: '01', title: 'Envie o arquivo', desc: 'PDF, PNG, JPG ou JPEG do relatÃ³rio financeiro ou extrato bancÃ¡rio.' },
  { n: '02', title: 'Revise a prÃ©via', desc: 'Confira os dados extraÃ­dos pelo OCR antes de gravar qualquer registro.' },
  { n: '03', title: 'Organize a carteira', desc: 'Registros importados por empresa, lote e status â€” vencido ou a vencer.' },
  { n: '04', title: 'Acione cobranÃ§as', desc: 'WhatsApp manual ou automÃ¡tico com cadÃªncia configurÃ¡vel por empresa.' },
];

function FeatureCard({ icon: Icon, color, title, description }) {
  const c = colorMap[color] || colorMap.emerald;
  return (
      <article className={`group rounded-[22px] border ${c.border} bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lifted`}>
      <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl ${c.bg}`}>
        <Icon size={20} className={c.text} />
      </div>
      <h3 className="mb-2 text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-600">{description}</p>
    </article>
  );
}

export default function LandingPage({ onStartNow, onOpenPlans, isAuthenticated = false }) {
  return (
    <div className="space-y-10">

      {/* â”€â”€ HERO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="hero-mesh dot-grid relative overflow-hidden rounded-[36px] border border-slate-200 bg-white p-8 shadow-card lg:p-14">
        {/* Decorative rings */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full border border-slate-200/70" />
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full border border-slate-200/70" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-72 w-72 rounded-full border border-emerald-200/80" />

        <div className="relative grid grid-cols-1 gap-12 xl:grid-cols-[1.15fr_0.85fr]">
          {/* Left column */}
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-semibold tracking-widest text-emerald-700 shadow-soft">
              <Sparkles size={12} />
              SaaS financeiro pronto para operar
            </div>

            <div>
              <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-slate-950 lg:text-5xl xl:text-[3.4rem]">
                Transforme relatÃ³rios<br />
                bancÃ¡rios em carteira<br />
                <span className="text-gradient">financeira inteligente.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 lg:text-lg">
                Importe documentos, organize vencidos por empresa, automatize cobranÃ§as via WhatsApp e entregue visÃ£o clara da sua carteira financeira em minutos.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onStartNow}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.98]"
              >
                {isAuthenticated ? 'Acessar produto' : 'ComeÃ§ar agora'}
                <ArrowRight size={16} />
              </button>
              <a
                href="mailto:comercial@bankextract.app?subject=Demo%20BankExtract"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
              >
                Agendar demonstraÃ§Ã£o
              </a>
              <button
                type="button"
                onClick={onOpenPlans}
                className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
              >
                Ver planos <ChevronRight size={14} />
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-soft">
                  <p className="text-lg font-extrabold text-slate-950">{s.value}</p>
                  <p className="mt-1 text-[11px] font-medium leading-tight text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right column â€” UI mockup */}
          <div className="space-y-3">
            {/* KPI mini-preview */}
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-card">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Dashboard executivo</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Em aberto', value: 'R$ 48.290', color: 'text-emerald-400' },
                  { label: 'Vencido',   value: 'R$ 12.740', color: 'text-red-400'     },
                  { label: 'CobranÃ§as', value: '148',        color: 'text-blue-400'    },
                  { label: 'Sem tel.',  value: '19',          color: 'text-amber-500'   },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">{k.label}</p>
                    <p className={`mt-1.5 text-xl font-bold ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Pipeline mockup */}
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <FileSearch size={14} className="text-emerald-400" />
                <p className="text-xs font-semibold text-slate-700">Pipeline OCR</p>
              </div>
              <div className="space-y-1.5">
                {['Enviando arquivo', 'Executando OCR', 'Estruturando dados', 'Validando registros'].map((item, i) => (
                  <div key={item} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <span className="text-xs font-medium text-slate-700">{item}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${i < 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {i < 3 ? 'âœ“' : 'â€¦'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* WhatsApp mockup */}
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <Zap size={14} className="text-amber-500" />
                <p className="text-xs font-semibold text-slate-700">CobranÃ§a automÃ¡tica</p>
                <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-500">Modo teste</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { name: 'CONSTRUTORA PARQUE REAL', status: 'enviado', valor: 'R$ 4.200' },
                  { name: 'CLÃNICA SANTA LUZIA',    status: 'pendente', valor: 'R$ 1.850' },
                  { name: 'LOJAS CENTRO SUL',        status: 'sem tel.', valor: 'R$ 990'   },
                ].map((r) => (
                  <div key={r.name} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-[11px] font-semibold text-slate-900">{r.name}</p>
                      <p className="text-[10px] text-slate-500">{r.valor}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.status === 'enviado'  ? 'bg-emerald-100 text-emerald-700' :
                      r.status === 'pendente' ? 'bg-blue-100 text-blue-700' :
                                                'bg-slate-200 text-slate-600'
                    }`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* â”€â”€ HOW IT WORKS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-soft lg:p-10">
        <div className="mb-8 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-600">Como funciona</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">
            De arquivo solto a carteira acionÃ¡vel em 4 etapas
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, idx) => (
            <div key={s.n} className="relative rounded-[20px] border border-slate-200 bg-slate-50 p-5">
              {idx < steps.length - 1 && (
                <div className="absolute right-0 top-1/2 hidden h-px w-4 -translate-y-1/2 translate-x-full bg-slate-200 xl:block" />
              )}
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white">
                {s.n}
              </div>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-900">{s.title}</h3>
              <p className="text-xs leading-relaxed text-slate-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* â”€â”€ FEATURES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-600">Funcionalidades</p>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Tudo que sua operaÃ§Ã£o precisa</h2>
          </div>
          <button
            type="button"
            onClick={onOpenPlans}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50"
          >
            Ver planos <ChevronRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* â”€â”€ BENEFITS STRIP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="overflow-hidden rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 lg:p-8">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">Para times financeiros e comerciais</h2>
          <p className="mt-1 text-sm text-slate-500">Estrutura pronta para vender, operar e crescer sem depender de planilhas soltas.</p>
        </div>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {[
            'ImportaÃ§Ã£o rÃ¡pida de PDF, JPG, PNG e JPEG',
            'OrganizaÃ§Ã£o financeira por empresa com RLS',
            'HistÃ³rico por lote com batch_id rastreÃ¡vel',
            'CobranÃ§a automÃ¡tica com cadÃªncia configurÃ¡vel',
            'IntegraÃ§Ã£o com Google Sheets por empresa',
            'Audit logs e permissÃµes por role',
          ].map((b) => (
            <div key={b} className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-soft">
              <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-800">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* â”€â”€ PRICING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section>
        <div className="mb-6 text-center">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-600">Planos</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">Escolha o plano ideal</h2>
          <p className="mt-2 text-sm text-slate-500">Comece pequeno e escale conforme crescer. Sem custos ocultos.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className={`relative overflow-hidden rounded-[28px] border p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-lifted ${
                plan.featured
                  ? 'border-emerald-300 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white shadow-lifted'
                  : 'border-slate-200 bg-white shadow-soft'
              }`}
            >
              {plan.featured && (
                <>
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-400 to-blue-500" />
                  <div className="absolute right-4 top-4">
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-[11px] font-bold tracking-widest text-emerald-300">
                      MAIS POPULAR
                    </span>
                  </div>
                </>
              )}

              <div className="mb-5">
                <p className={`text-xs font-bold uppercase tracking-widest ${plan.featured ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {plan.name}
                </p>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className={`text-4xl font-extrabold tracking-tight ${plan.featured ? 'text-white' : 'text-slate-900'}`}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className={`text-sm ${plan.featured ? 'text-slate-400' : 'text-slate-400'}`}>{plan.period}</span>
                  )}
                </div>
                <p className={`mt-1.5 text-xs ${plan.featured ? 'text-slate-400' : 'text-slate-500'}`}>{plan.emphasis}</p>
              </div>

              <ul className="mb-6 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <BadgeCheck size={15} className={plan.featured ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span className={plan.featured ? 'text-slate-300' : 'text-slate-700'}>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={onStartNow}
                className={`w-full rounded-2xl px-4 py-3.5 text-sm font-bold transition active:scale-[0.98] ${
                  plan.featured
                    ? 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-900/40'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {plan.cta}
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* â”€â”€ CTA FOOTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br from-slate-950 to-blue-950 p-8 text-center text-white shadow-card lg:p-12">
        <div className="pointer-events-none absolute inset-0 dot-grid opacity-30" />
        <div className="relative">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">Pronto para comeÃ§ar?</p>
          <h2 className="mx-auto max-w-2xl text-2xl font-bold leading-snug text-white lg:text-3xl">
            BankExtract transforma documentos financeiros em operaÃ§Ã£o controlada.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
            Configure em minutos. Sem cartÃ£o. Sem burocracia. Comece no plano Starter e escale quando precisar.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onStartNow}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/50 transition hover:bg-emerald-400 active:scale-[0.98]"
            >
              ComeÃ§ar agora grÃ¡tis <ArrowRight size={16} />
            </button>
            <a
              href="mailto:comercial@bankextract.app?subject=Contato%20BankExtract"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
            >
              Falar com time comercial
            </a>
          </div>
        </div>
      </section>

    </div>
  );
}

