import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  ClipboardList,
  ListChecks,
  MessageSquare,
  RefreshCcw,
  TrendingUp,
  Zap,
  ZapOff,
} from 'lucide-react';
import KPICard from '../components/KPICard';
import AuditEventCard from '../components/AuditEventCard';
import StatusPill from '../components/ui/StatusPill';
import { getRecentAudit } from '../services/auditTimelineService';
import { formatCurrencyBRL, formatDateBR } from '../utils/format';

/* ─────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────── */

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
      {children}
    </p>
  );
}

function SectionRow({ title, action }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {action}
    </div>
  );
}

function NavAction({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 transition hover:text-slate-300"
    >
      {label}
      <ChevronRight size={11} />
    </button>
  );
}

function ConsoleStatusBar({ operational }) {
  const { autoChargeActive, whatsappMockMode, lastAutoExecution, nextRunHint, recentAuditAction } = operational;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-700/60 bg-slate-900/50 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span className="text-[12px] font-medium text-slate-300">Console ativo</span>
      </div>

      <div className="h-3.5 w-px bg-slate-700/60 max-sm:hidden" />

      <StatusPill variant={autoChargeActive ? 'success' : 'neutral'} dot>
        {autoChargeActive ? 'Cobrança automática on' : 'Cobrança automática off'}
      </StatusPill>

      {whatsappMockMode && (
        <StatusPill variant="warning" dot>Modo simulação ativo</StatusPill>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        {lastAutoExecution && (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Clock size={11} />
            Última exec: <span className="font-medium text-slate-400">{lastAutoExecution}</span>
          </span>
        )}
        {nextRunHint && (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Zap size={11} />
            Próxima: <span className="font-medium text-slate-400">{nextRunHint}</span>
          </span>
        )}
        {recentAuditAction && recentAuditAction !== 'Sem atividade' && (
          <span className="hidden text-[11px] text-slate-600 xl:block">
            Última ação: <span className="text-slate-500">{recentAuditAction}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function CriticalQueueRow({ row }) {
  const statusTone = {
    pendente:    'neutral',
    aberto:      'info',
    vencido:     'danger',
    negociacao:  'warning',
    promessa:    'info',
    liquidado:   'success',
  };

  return (
    <div className="grid grid-cols-[1.6fr_1fr_auto_auto] items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-slate-800/40 sm:grid-cols-[2fr_1.2fr_1fr_auto]">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-slate-100">{row.cliente || 'Cliente'}</p>
        <p className="truncate font-mono text-[11px] text-slate-500">
          {row.numero_boleto || row.documento || '—'}
        </p>
      </div>
      <span className="font-mono tabular-nums text-[13px] font-semibold text-slate-50">
        {formatCurrencyBRL(row.valor || 0)}
      </span>
      <span className="hidden font-mono text-[12px] text-slate-400 sm:block">
        {row.vencimento ? formatDateBR(row.vencimento) : '—'}
      </span>
      <StatusPill variant={statusTone[row.status] || 'neutral'}>
        {row.status || 'pendente'}
      </StatusPill>
    </div>
  );
}

function AgingStrip({ items = [] }) {
  const max = Math.max(...items.map((i) => i.value || 0), 1);

  if (!items.length) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-700/60 py-6 text-[12px] text-slate-500">
        Sem dados de aging
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const pct = Math.max(((item.value || 0) / max) * 100, 3);
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-[88px] shrink-0 text-[11px] text-slate-400 truncate">{item.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800/60">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: item.color || '#475569' }}
              />
            </div>
            <span className="w-[72px] shrink-0 text-right font-mono tabular-nums text-[11px] font-medium text-slate-300">
              {formatCurrencyBRL(item.value || 0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ImportWidget({ importacoes = [] }) {
  if (!importacoes.length) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-700/60 py-5 text-[12px] text-slate-500">
        Sem importações recentes
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {importacoes.map((item) => (
        <div key={item.label} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-800/40">
          <span className="truncate text-[12px] text-slate-400">{item.label}</span>
          <span className="font-mono tabular-nums text-[12px] font-semibold text-slate-200">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function AutomationWidget({ operational }) {
  const { autoChargeActive, whatsappMockMode, lastAutoExecution, nextRunHint } = operational;

  const rows = [
    {
      label: 'Cobrança auto',
      value: autoChargeActive ? 'Ativa' : 'Inativa',
      icon: autoChargeActive ? CheckCircle2 : ZapOff,
      cls: autoChargeActive ? 'text-emerald-300' : 'text-slate-500',
    },
    {
      label: 'Modo envio',
      value: whatsappMockMode ? 'Simulação' : 'Real',
      icon: whatsappMockMode ? Zap : MessageSquare,
      cls: whatsappMockMode ? 'text-amber-300' : 'text-slate-300',
    },
    {
      label: 'Última execução',
      value: lastAutoExecution || 'Nunca',
      icon: Clock,
      cls: 'text-slate-400',
    },
    {
      label: 'Próxima janela',
      value: nextRunHint || 'Inativa',
      icon: TrendingUp,
      cls: 'text-slate-400',
    },
  ];

  return (
    <div className="space-y-1">
      {rows.map(({ label, value, icon: Icon, cls }) => (
        <div key={label} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <Icon size={12} className={cls} />
            <span className="text-[12px] text-slate-500">{label}</span>
          </div>
          <span className={`text-[12px] font-medium ${cls}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function OnboardingWidget({ onboarding, onNavigate }) {
  if (!onboarding?.steps?.length) return null;

  const steps = onboarding.steps.slice(0, 4);
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5">
      <SectionRow
        title="Primeiros passos"
        action={
          onNavigate ? <NavAction label="Ver tudo" onClick={() => onNavigate('onboarding')} /> : null
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-400">{pct}%</span>
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.id} className="flex items-start gap-2.5">
            <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${step.done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800/60 text-slate-600'}`}>
              {step.done ? <CheckCircle2 size={11} /> : <ListChecks size={11} />}
            </div>
            <div className="min-w-0">
              <p className={`text-[12px] font-medium ${step.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                {step.title}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────────── */

export default function DashboardScreen({
  metrics,
  errorMessage = '',
  onRetry,
  companyId,
  allCompanies = false,
  onNavigate,
  onboarding = null,
}) {
  const operational = metrics?.operational || {};
  const isEmpty = !metrics?.hasFinancialData && !metrics?.kpis?.length;

  const [recentAudit, setRecentAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [criticalTab, setCriticalTab] = useState('due');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!companyId && !allCompanies) return;
    setAuditLoading(true);
    getRecentAudit(companyId, 6, { allCompanies })
      .then((data) => { if (mountedRef.current) setRecentAudit(data); })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setAuditLoading(false); });
  }, [allCompanies, companyId]);

  /* ── Error state ── */
  if (errorMessage) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-900/60 p-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
          <Activity size={22} className="text-amber-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-50">Não foi possível carregar o console</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">{errorMessage}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700/60"
          >
            <RefreshCcw size={14} />
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  /* ── Empty state ── */
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/40 p-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/60">
          <Activity size={22} className="text-slate-500" />
        </div>
        <h3 className="text-base font-semibold text-slate-50">Sem dados financeiros</h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
          Importe uma carteira para popular o console operacional com métricas reais.
        </p>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('importacao')}
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700/60"
          >
            Ir para Importação
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    );
  }

  const dueRows = metrics.nextDueRows || [];
  const openRows = metrics.biggestOpenRows || [];
  const criticalRows = criticalTab === 'due' ? dueRows : openRows;

  /* ── Operations Console ── */
  return (
    <div className="space-y-4">

      {/* 1 ─ Console status bar */}
      <ConsoleStatusBar operational={operational} />

      {/* 2 ─ KPI strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {(metrics.kpis || []).slice(0, 5).map((item, idx) => (
          <div key={item.title} className={`stagger-${Math.min(idx + 1, 6)}`}>
            <KPICard title={item.title} value={item.value} hint={item.hint} tone={item.tone} />
          </div>
        ))}
      </section>

      {/* 3 ─ Main operations grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">

        {/* 3a ─ Critical queue */}
        <div className="xl:col-span-7">
          <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5">
            <SectionRow
              title="Fila crítica"
              action={onNavigate ? <NavAction label="Ver visão geral" onClick={() => onNavigate('visao-geral')} /> : null}
            />

            {/* Tabs */}
            <div className="mb-3 flex gap-1 rounded-lg border border-slate-700/60 bg-slate-800/40 p-1">
              {[
                { id: 'due', label: `Próx. vencimentos (${dueRows.length})` },
                { id: 'open', label: `Maiores em aberto (${openRows.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCriticalTab(tab.id)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
                    criticalTab === tab.id
                      ? 'bg-slate-700/80 text-slate-100'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {criticalRows.length ? (
              <div className="space-y-0.5">
                {/* Header */}
                <div className="grid grid-cols-[1.6fr_1fr_auto_auto] gap-3 px-3 pb-1 sm:grid-cols-[2fr_1.2fr_1fr_auto]">
                  <SectionLabel>Cliente</SectionLabel>
                  <SectionLabel>Valor</SectionLabel>
                  <SectionLabel className="hidden sm:block">Vencimento</SectionLabel>
                  <SectionLabel>Status</SectionLabel>
                </div>
                {criticalRows.map((row, i) => (
                  <CriticalQueueRow key={row.id || i} row={row} index={i} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-700/60 py-8 text-[12px] text-slate-500">
                {criticalTab === 'due' ? 'Nenhum vencimento próximo encontrado.' : 'Nenhum valor em aberto encontrado.'}
              </div>
            )}
          </div>
        </div>

        {/* 3b ─ Right rail */}
        <div className="space-y-4 xl:col-span-5">

          {/* Aging */}
          <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5">
            <SectionRow title="Aging da carteira" />
            <AgingStrip items={metrics.charts?.aging || []} />
          </div>

          {/* Automation status */}
          <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5">
            <SectionRow
              title="Automação"
              action={onNavigate ? <NavAction label="Configurar" onClick={() => onNavigate('automacoes')} /> : null}
            />
            <AutomationWidget operational={operational} />
          </div>

          {/* Import stats */}
          {(metrics.charts?.importacoes || []).length > 0 && (
            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5">
              <SectionRow
                title="Importações recentes"
                action={onNavigate ? <NavAction label="Ver histórico" onClick={() => onNavigate('historico')} /> : null}
              />
              <ImportWidget importacoes={metrics.charts.importacoes} />
            </div>
          )}
        </div>
      </div>

      {/* 4 ─ Activity + Onboarding */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">

        {/* Activity feed */}
        <div className="xl:col-span-8">
          <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5">
            <SectionRow
              title={allCompanies ? 'Atividade recente — todas as empresas' : 'Atividade recente'}
              action={onNavigate ? <NavAction label="Ver auditoria" onClick={() => onNavigate('audit')} /> : null}
            />

            {auditLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <div className="skeleton h-7 w-7 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3 w-40 rounded-full" />
                      <div className="skeleton h-2.5 w-56 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentAudit.length > 0 ? (
              <div className="divide-y divide-slate-800/60">
                {recentAudit.map((event) => (
                  <AuditEventCard key={event.id} event={event} compact />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700/60 py-8 text-center">
                <ClipboardList size={20} className="mb-2 text-slate-600" />
                <p className="text-[12px] text-slate-500">Nenhuma atividade registrada ainda.</p>
              </div>
            )}
          </div>
        </div>

        {/* Onboarding progress */}
        <div className="xl:col-span-4">
          {onboarding?.steps?.length ? (
            <OnboardingWidget onboarding={onboarding} onNavigate={onNavigate} />
          ) : (
            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5">
              <SectionRow title="Status do sistema" />
              <div className="space-y-2">
                {[
                  { label: 'Banco de dados', ok: true },
                  { label: 'WhatsApp provider', ok: !operational.whatsappMockMode },
                  { label: 'Cobrança automática', ok: !!operational.autoChargeActive },
                  { label: 'Audit log', ok: !!(recentAudit.length || operational.recentAuditAction) },
                ].map(({ label, ok }) => (
                  <div key={label} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-800/40">
                    <span className="text-[12px] text-slate-400">{label}</span>
                    <StatusPill variant={ok ? 'success' : 'neutral'} dot>
                      {ok ? 'OK' : 'Inativo'}
                    </StatusPill>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
