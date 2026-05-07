import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, BarChart3, BookOpenText, ClipboardList, ListChecks, TrendingUp, Zap } from 'lucide-react';
import KPICard from '../components/KPICard';
import AuditEventCard from '../components/AuditEventCard';
import { getRecentAudit } from '../services/auditTimelineService';
import { formatCurrencyBRL } from '../utils/format';

function SectionHeader({ title, subtitle, badge, action }) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-lg font-bold tracking-tight text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {badge ? (
          <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {badge}
          </span>
        ) : null}
        {action || null}
      </div>
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

export default function DashboardScreen({ metrics, errorMessage = '', onRetry, companyId, allCompanies = false, onNavigate, onboarding = null }) {
  const operational = metrics?.operational || {};
  const isEmpty = !metrics?.hasFinancialData && !metrics?.kpis?.length;

  const [recentAudit, setRecentAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!companyId && !allCompanies) return;
    setAuditLoading(true);
    getRecentAudit(companyId, 5, { allCompanies })
      .then((data) => { if (mountedRef.current) setRecentAudit(data); })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setAuditLoading(false); });
  }, [allCompanies, companyId]);

  if (errorMessage) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[32px] border border-amber-200 bg-white p-16 text-center shadow-soft">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50">
          <Activity size={28} className="text-amber-500" />
        </div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900">Nao foi possivel carregar o dashboard</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">{errorMessage}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
            Tentar novamente
          </button>
        ) : null}
      </div>
    );
  }

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
        {onRetry ? (
          <button type="button" onClick={onRetry} className="mt-5 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Tentar novamente
          </button>
        ) : null}
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

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <SectionHeader title="Proximos vencimentos" subtitle="Titulos mais proximos da empresa ativa." />
          {(metrics.nextDueRows || []).length ? (
            <div className="space-y-3">
              {metrics.nextDueRows.map((row) => (
                <div key={row.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.cliente || 'Cliente'}</p>
                      <p className="text-xs text-slate-500">{row.numero_boleto || row.documento || 'Sem documento'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatCurrencyBRL(row.valor || 0)}</p>
                      <p className="text-xs text-slate-500">{row.vencimento || 'Sem vencimento'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 py-10 text-sm text-slate-400">
              Nenhum proximo vencimento encontrado.
            </div>
          )}
        </article>

        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <SectionHeader title="Maiores valores em aberto" subtitle="Prioridades financeiras por valor." />
          {(metrics.biggestOpenRows || []).length ? (
            <div className="space-y-3">
              {metrics.biggestOpenRows.map((row) => (
                <div key={row.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.cliente || 'Cliente'}</p>
                      <p className="text-xs text-slate-500">{row.status || 'pendente'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatCurrencyBRL(row.valor || 0)}</p>
                      <p className="text-xs text-slate-500">{row.vencimento || 'Sem vencimento'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 py-10 text-sm text-slate-400">
              Nenhum valor em aberto encontrado.
            </div>
          )}
        </article>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <article className="rounded-[28px] border border-emerald-100 bg-white p-6 shadow-soft xl:col-span-2">
          <SectionHeader
            title="Primeiros passos"
            subtitle="Acompanhe a ativacao inicial da empresa e avance para as proximas etapas."
            badge={`${onboarding?.progress || 0}% concluido`}
            action={
              onNavigate ? (
                <button
                  onClick={() => onNavigate('onboarding')}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  Abrir onboarding <ArrowRight size={12} />
                </button>
              ) : null
            }
          />
          {(onboarding?.steps || []).length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {(onboarding.steps || []).slice(0, 4).map((step) => (
                <div key={step.id} className={`rounded-2xl border p-4 ${step.done ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${step.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      <ListChecks size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 py-10 text-sm text-slate-400">
              Nenhum passo inicial disponivel.
            </div>
          )}
        </article>

        <article className="rounded-[28px] border border-blue-100 bg-white p-6 shadow-soft">
          <SectionHeader title="Ajuda rapida" subtitle="Guias essenciais para tirar duvidas sem sair da operacao." />
          <div className="space-y-3">
            {[
              { label: 'Importar carteira', target: 'help' },
              { label: 'Preparar cobranca', target: 'help' },
              { label: 'Interpretar dashboard', target: 'help' },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onNavigate?.(item.target)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                <span className="flex items-center gap-2">
                  <BookOpenText size={16} className="text-blue-600" />
                  {item.label}
                </span>
                <ArrowRight size={14} className="text-slate-400" />
              </button>
            ))}
          </div>
        </article>
      </section>

      {/* Mini card de atividades recentes */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <article className="rounded-[28px] border border-violet-100 bg-white p-6 shadow-soft xl:col-span-2">
          <SectionHeader
            title="Ultimas atividades"
            subtitle={allCompanies ? 'Eventos operacionais recentes de todas as empresas.' : 'Eventos operacionais recentes desta empresa.'}
            action={
              onNavigate ? (
                <button
                  onClick={() => onNavigate('audit')}
                  className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                >
                  Ver auditoria completa <ArrowRight size={12} />
                </button>
              ) : null
            }
          />
          {auditLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-7 w-7 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3.5 w-40 rounded-full" />
                    <div className="skeleton h-3 w-56 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentAudit.length > 0 ? (
            <div className="divide-y divide-slate-50">
              {recentAudit.map((event) => (
                <AuditEventCard key={event.id} event={event} compact />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-10 text-center">
              <ClipboardList size={22} className="text-slate-300" />
              <p className="mt-2 text-sm text-slate-400">Nenhuma atividade registrada ainda.</p>
            </div>
          )}
        </article>

        <article className="accent-bar rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <SectionHeader title="Cobranca WhatsApp" subtitle="Status do agendador automatico." />
          <div className="space-y-3">
            {[
              { label: 'Status', value: operational.autoChargeActive ? 'Ativo' : 'Inativo', cls: operational.autoChargeActive ? 'text-emerald-700' : 'text-slate-500' },
              { label: 'Ultima execucao', value: operational.lastAutoExecution || 'Nunca executada', cls: 'text-slate-900' },
              { label: 'Proxima janela', value: operational.nextRunHint || 'Automacao inativa', cls: 'text-slate-900' },
            ].map((row) => (
              <div key={row.label} className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{row.label}</p>
                <p className={`mt-1.5 text-sm font-semibold ${row.cls}`}>{row.value}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-5">
        <article className="accent-bar rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <SectionHeader title="Leituras operacionais" subtitle="Sinais rapidos para operacao e venda do SaaS." badge={operational.recentAuditAction || 'Sem atividade recente'} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { label: 'Cobertura de contato', desc: 'Use a taxa com telefone para medir a prontidao real da carteira para cobranca.', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Modo teste', desc: operational.whatsappMockMode ? 'WhatsApp em mock ativo para validar o fluxo sem custo real.' : 'Ambiente preparado para ativar o provedor real depois.', icon: Zap, color: operational.whatsappMockMode ? 'text-amber-600' : 'text-slate-500', bg: operational.whatsappMockMode ? 'bg-amber-50' : 'bg-slate-50' },
              { label: 'Leitura multiempresa', desc: 'Voce esta em modo global com visao consolidada de todas as empresas, ou no escopo isolado de uma.', icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-50' },
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
