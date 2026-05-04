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
  { value: 'Minutos', label: 'até carteira pronta' },
  { value: '100%', label: 'multiempresa com RLS' },
  { value: 'Zero', label: 'planilha manual' },
  { value: 'WhatsApp', label: 'cobrança automática' },
];

const features = [
  {
    icon: FileSearch,
    color: 'emerald',
    title: 'OCR inteligente',
    description: 'Importe PDF, PNG, JPG e JPEG. Revise os dados extraídos antes de gravar qualquer registro na carteira.',
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
    title: 'Cobranças automáticas',
    description: 'Configure cadência por atraso, horário de envio e limite por título. WhatsApp em modo teste até ativar real.',
  },
  {
    icon: Sheet,
    color: 'teal',
    title: 'Google Sheets sync',
    description: 'Sincronize a carteira em uma planilha configurável. Cada empresa tem sua própria aba e schedule.',
  },
  {
    icon: Shield,
    color: 'purple',
    title: 'Auditoria total',
    description: 'Cada ação sensível é registrada em audit_logs com company_id, user_id e timestamp. Rastreabilidade completa.',
  },
  {
    icon: BarChart3,
    color: 'amber',
    title: 'Dashboard executivo',
    description: 'KPIs financeiros em tempo real: total em aberto, vencidos, taxa de contato e última execução automática.',
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
    period: '/mês',
    emphasis: 'Para começar a operar',
    features: ['1 empresa', 'Até 500 registros/mês', 'Cobrança manual', 'Google Sheets', 'Dashboard executivo'],
    cta: 'Começar grátis',
    featured: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'R$ 197',
    period: '/mês',
    emphasis: 'Para escalar a cobrança',
    features: ['Até 5 empresas', 'Até 5.000 registros/mês', 'Cobrança automática WhatsApp', 'Histórico completo', 'Audit logs', 'Suporte prioritário'],
    cta: 'Assinar Pro',
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    emphasis: 'Para alto volume',
    features: ['Empresas ilimitadas', 'Alto volume', 'Integrações personalizadas', 'SLA dedicado', 'Onboarding guiado'],
    cta: 'Falar com time',
    featured: false,
  },
];

const steps = [
  { n: '01', title: 'Envie o arquivo', desc: 'PDF, PNG, JPG ou JPEG do relatório financeiro ou extrato bancário.' },
  { n: '02', title: 'Revise a prévia', desc: 'Confira os dados extraídos pelo OCR antes de gravar qualquer registro.' },
  { n: '03', title: 'Organize a carteira', desc: 'Registros importados por empresa, lote e status — vencido ou a vencer.' },
  { n: '04', title: 'Acione cobranças', desc: 'WhatsApp manual ou automático com cadência configurável por empresa.' },
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

      {/* ── HERO ──────────────────────────────────────── */}
      <section className="hero-mesh dot-grid relative overflow-hidden rounded-[36px] p-8 text-white lg:p-14">
        {/* Decorative rings */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full border border-white/5" />
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full border border-white/5" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-72 w-72 rounded-full border border-emerald-500/10" />

        <div className="relative grid grid-cols-1 gap-12 xl:grid-cols-[1.15fr_0.85fr]">
          {/* Left column */}
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/25 px-4 py-1.5 text-xs font-semibold tracking-widest text-emerald-300">
              <Sparkles size={12} />
              SaaS financeiro pronto para operar
            </div>

            <div>
              <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-white lg:text-5xl xl:text-[3.4rem]">
                Transforme relatórios<br />
                bancários em carteira<br />
                <span className="text-gradient">financeira inteligente.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white lg:text-lg">
                Importe documentos, organize vencidos por empresa, automatize cobranças via WhatsApp e entregue visão clara da sua carteira financeira em minutos.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onStartNow}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-400 active:scale-[0.98]"
              >
                {isAuthenticated ? 'Acessar produto' : 'Começar agora'}
                <ArrowRight size={16} />
              </button>
              <a
                href="mailto:comercial@bankextract.app?subject=Demo%20BankExtract"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/15 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
              >
                Agendar demonstração
              </a>
              <button
                type="button"
                onClick={onOpenPlans}
                className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-3.5 text-sm font-medium text-slate-200 transition hover:text-white"
              >
                Ver planos <ChevronRight size={14} />
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl border border-white/8 bg-white/15 px-4 py-3.5 backdrop-blur-sm">
                  <p className="text-lg font-bold text-white">{s.value}</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-slate-200">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right column — UI mockup */}
          <div className="space-y-3">
            {/* KPI mini-preview */}
            <div className="rounded-[22px] border border-white/20 bg-white/13 p-4 backdrop-blur-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-300">Dashboard executivo</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Em aberto', value: 'R$ 48.290', color: 'text-emerald-400' },
                  { label: 'Vencido',   value: 'R$ 12.740', color: 'text-red-400'     },
                  { label: 'Cobranças', value: '148',        color: 'text-blue-400'    },
                  { label: 'Sem tel.',  value: '19',          color: 'text-amber-400'   },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl bg-white/15 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-300">{k.label}</p>
                    <p className={`mt-1.5 text-xl font-bold ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Pipeline mockup */}
            <div className="rounded-[22px] border border-white/20 bg-white/13 p-4 backdrop-blur-sm">
              <div className="mb-3 flex items-center gap-2">
                <FileSearch size={14} className="text-emerald-400" />
                <p className="text-xs font-semibold text-slate-200">Pipeline OCR</p>
              </div>
              <div className="space-y-1.5">
                {['Enviando arquivo', 'Executando OCR', 'Estruturando dados', 'Validando registros'].map((item, i) => (
                  <div key={item} className="flex items-center justify-between rounded-xl border border-white/6 bg-white/12 px-3 py-2">
                    <span className="text-xs text-slate-200">{item}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${i < 3 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/30 text-slate-500'}`}>
                      {i < 3 ? '✓' : '…'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* WhatsApp mockup */}
            <div className="rounded-[22px] border border-white/20 bg-white/13 p-4 backdrop-blur-sm">
              <div className="mb-3 flex items-center gap-2">
                <Zap size={14} className="text-amber-400" />
                <p className="text-xs font-semibold text-slate-200">Cobrança automática</p>
                <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">Modo teste</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { name: 'CONSTRUTORA PARQUE REAL', status: 'enviado', valor: 'R$ 4.200' },
                  { name: 'CLÍNICA SANTA LUZIA',    status: 'pendente', valor: 'R$ 1.850' },
                  { name: 'LOJAS CENTRO SUL',        status: 'sem tel.', valor: 'R$ 990'   },
                ].map((r) => (
                  <div key={r.name} className="flex items-center justify-between rounded-xl bg-white/12 px-3 py-2">
                    <div>
                      <p className="text-[11px] font-semibold text-white">{r.name}</p>
                      <p className="text-[10px] text-slate-300">{r.valor}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.status === 'enviado'  ? 'bg-emerald-500/20 text-emerald-400' :
                      r.status === 'pendente' ? 'bg-blue-500/20 text-blue-400' :
                                                'bg-slate-600/30 text-slate-500'
                    }`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────── */}
      <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-soft lg:p-10">
        <div className="mb-8 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-600">Como funciona</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">
            De arquivo solto a carteira acionável em 4 etapas
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

      {/* ── FEATURES ─────────────────────────────────── */}
      <section>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-600">Funcionalidades</p>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Tudo que sua operação precisa</h2>
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

      {/* ── BENEFITS STRIP ───────────────────────────── */}
      <section className="overflow-hidden rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 lg:p-8">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">Para times financeiros e comerciais</h2>
          <p className="mt-1 text-sm text-slate-500">Estrutura pronta para vender, operar e crescer sem depender de planilhas soltas.</p>
        </div>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {[
            'Importação rápida de PDF, JPG, PNG e JPEG',
            'Organização financeira por empresa com RLS',
            'Histórico por lote com batch_id rastreável',
            'Cobrança automática com cadência configurável',
            'Integração com Google Sheets por empresa',
            'Audit logs e permissões por role',
          ].map((b) => (
            <div key={b} className="flex items-start gap-3 rounded-2xl bg-white/70 px-4 py-3.5 shadow-soft">
              <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-800">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────── */}
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

      {/* ── CTA FOOTER ───────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 to-blue-950 p-8 text-center text-white lg:p-12">
        <div className="pointer-events-none absolute inset-0 dot-grid opacity-30" />
        <div className="relative">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">Pronto para começar?</p>
          <h2 className="mx-auto max-w-2xl text-2xl font-bold leading-snug text-white lg:text-3xl">
            BankExtract transforma documentos financeiros em operação controlada.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
            Configure em minutos. Sem cartão. Sem burocracia. Comece no plano Starter e escale quando precisar.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onStartNow}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/50 transition hover:bg-emerald-400 active:scale-[0.98]"
            >
              Começar agora grátis <ArrowRight size={16} />
            </button>
            <a
              href="mailto:comercial@bankextract.app?subject=Contato%20BankExtract"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/15 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
            >
              Falar com time comercial
            </a>
          </div>
        </div>
      </section>

    </div>
  );
}
