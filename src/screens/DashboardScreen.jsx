import { Activity, BarChart3, TrendingUp, Zap } from 'lucide-react';
import KPICard from '../components/KPICard';
import { formatCurrencyBRL } from '../utils/format';

function SectionHeader({ title, subtitle, badge }) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-lg font-bold tracking-tight text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {badge ? (
        <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function MiniBars({ items = [] }) {
  const max = Math.max(...items.map((item) => item.value || 0), 1);

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const pct = Math.max(((item.value || 0) / max) * 100, 4);
        return (
          <div key={item.label}>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">{item.label}</span>
              <span className="font-semibold text-slate-900">{formatCurrencyBRL(item.value || 0)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: item.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ active, label, tone = 'emerald' }) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : tone === 'blue'
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  const dotClass = tone === 'amber' ? 'bg-amber-500' : tone === 'blue' ? 'bg-blue-500' : 'bg-emerald-500';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
        active ? toneClass : 'border-slate-200 bg-slate-50 text-slate-500'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? dotClass : 'bg-slate-300'}`} />
      {label}
    </span>
  );
}

export default function DashboardScreen({ metrics }) {
  const operational = metrics?.operational || {};
  const isEmpty = !metrics?.kpis?.length;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[32px] border border-dashed border-slate-300 bg-white p-16 text-center shadow-soft">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100">
          <Activity size={28} className="text-slate-400" />
        </div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900">Sem dados financeiros</h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          Importe uma carteira para popular o dashboard executivo com metricas reais da empresa ativa.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="hero-mesh overflow-hidden rounded-[32px] border border-slate-200 bg-white p-7 shadow-lifted lg:p-9">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <StatusPill active label="Dashboard ao vivo" />
              {operational.autoChargeActive ? <StatusPill active label="Cobranca automatica" tone="blue" /> : null}
              {operational.whatsappMockMode ? <StatusPill active label="Modo teste WhatsApp" tone="amber" /> : null}
            </div>
            <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-slate-950 lg:text-4xl">
              Operacao financeira organizada para escalar cobrancas com seguranca.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 lg:text-base">
              O BankExtract consolida carteira, lotes importados, automacoes e sinais operacionais em uma leitura
              executiva pronta para venda e para a rotina do financeiro.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Ultima execucao', value: operational.lastAutoExecution || 'Nunca executada' },
              { label: 'Proxima janela', value: operational.nextRunHint || 'Automacao inativa' },
              { label: 'Audit log recente', value: operational.recentAuditAction || 'Sem atividade' },
              { label: 'Ambiente', value: operational.whatsappMockMode ? 'Modo teste' : 'Pronto para real' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(metrics.kpis || []).map((item, idx) => (
          <div key={item.title} className={`animate-slide-up stagger-${Math.min(idx + 1, 6)}`}>
            <KPICard title={item.title} value={item.value} hint={item.hint} tone={item.tone} />
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <article className="accent-bar rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <SectionHeader title="Aging de carteira" subtitle="Distribuicao real por janela de atraso." />
          <MiniBars items={metrics.charts?.aging || []} />
        </article>

        <article className="accent-bar rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <SectionHeader title="Importacoes recentes" subtitle="Volume de linhas por lote no periodo." />
          {(metrics.charts?.importacoes || []).length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {metrics.charts.importacoes.map((item) => (
                <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 py-10 text-sm text-slate-400">
              Nenhuma importacao registrada ainda.
            </div>
          )}
        </article>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <article className="accent-bar rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <SectionHeader title="Cobranca WhatsApp" subtitle="Status do agendador automatico." />
          <div className="space-y-3">
            {[
              {
                label: 'Status',
                value: operational.autoChargeActive ? 'Ativo' : 'Inativo',
                cls: operational.autoChargeActive ? 'text-emerald-700' : 'text-slate-500',
              },
              {
                label: 'Ultima execucao',
                value: operational.lastAutoExecution || 'Nunca executada',
                cls: 'text-slate-900',
              },
              {
                label: 'Proxima janela',
                value: operational.nextRunHint || 'Automacao inativa',
                cls: 'text-slate-900',
              },
            ].map((row) => (
              <div key={row.label} className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{row.label}</p>
                <p className={`mt-1.5 text-sm font-semibold ${row.cls}`}>{row.value}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="accent-bar rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft xl:col-span-2">
          <SectionHeader
            title="Leituras operacionais"
            subtitle="Sinais rapidos para operacao e venda do SaaS."
            badge={operational.recentAuditAction || 'Sem atividade recente'}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              {
                label: 'Cobertura de contato',
                desc: 'Use a taxa com telefone para medir a prontidao real da carteira para cobranca.',
                icon: TrendingUp,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50',
              },
              {
                label: 'Modo teste',
                desc: operational.whatsappMockMode
                  ? 'WhatsApp em mock ativo para validar o fluxo sem custo real.'
                  : 'Ambiente preparado para ativar o provedor real depois.',
                icon: Zap,
                color: operational.whatsappMockMode ? 'text-amber-600' : 'text-slate-500',
                bg: operational.whatsappMockMode ? 'bg-amber-50' : 'bg-slate-50',
              },
              {
                label: 'Leitura multiempresa',
                desc: 'Voce esta em modo global com visao consolidada de todas as empresas, ou no escopo isolado de uma.',
                icon: BarChart3,
                color: 'text-blue-600',
                bg: 'bg-blue-50',
              },
            ].map(({ label, desc, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl ${bg}`}>
                  <Icon size={18} className={color} />
                </div>
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
