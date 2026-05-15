import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileWarning,
  Layers3,
  ListTodo,
  MessageSquareWarning,
  RefreshCw,
  ShieldCheck,
  Timer,
  Upload,
} from 'lucide-react';
import AuditEventCard from '../components/AuditEventCard';
import { PageShell, ScreenHeader } from '../components/ui/layout';
import {
  OperationalChecklist,
  OperationalEventFeed,
  OperationalMetric,
  OperationalPanel,
  OperationalProgress,
  OperationalQueue,
  OperationalStateView,
  OperationalStatusList,
  OperationalStatusPill,
  resolveOperationalTone,
} from '../components/ui/operational';
import { getRecentAudit } from '../services/auditTimelineService';
import { formatCurrencyBRL } from '../utils/format';

function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

function formatMoney(value) {
  return formatCurrencyBRL(Number(value || 0));
}


export default function DashboardScreen({ metrics, errorMessage = '', onRetry, companyId, allCompanies = false, onNavigate, onboarding = null }) {
  const operational = metrics?.operational || {};
  const isEmpty = !metrics?.hasFinancialData && !metrics?.kpis?.length;
  const [recentAudit, setRecentAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!companyId && !allCompanies) return;
    setAuditLoading(true);
    getRecentAudit(companyId, 8, { allCompanies })
      .then((data) => {
        if (mountedRef.current) setRecentAudit(data);
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setAuditLoading(false);
      });
  }, [allCompanies, companyId]);

  const compactKpis = useMemo(() => {
    const summary = metrics?.financialSummary || {};
    const sendCounts = operational.chargeStatusCounts || {};
    const totalSends = Object.values(sendCounts).reduce((acc, value) => acc + Number(value || 0), 0);

    return [
      {
        label: 'Carteira ativa',
        value: formatMoney(summary.carteiraAtiva || 0),
        hint: `${metrics?.kpis?.find((item) => item.title === 'Total de registros')?.value || 0} registro(s) no escopo atual`,
        tone: 'info',
      },
      {
        label: 'Vencido',
        value: formatMoney(summary.vencido || 0),
        hint: `${summary.cobrancasPendentes || 0} titulo(s) em aberto`,
        tone: (summary.vencido || 0) > 0 ? 'warning' : 'success',
      },
      {
        label: 'Cobertura telefone',
        value: `${summary.coverageWithPhone || 0}%`,
        hint: 'Prontidao para disparo',
        tone: (summary.coverageWithPhone || 0) >= 85 ? 'success' : 'warning',
      },
      {
        label: 'Falhas de envio',
        value: String(sendCounts.failed || 0),
        hint: totalSends ? `${totalSends} envio(s) monitorado(s)` : 'Sem tracking recente',
        tone: (sendCounts.failed || 0) > 0 ? 'danger' : 'success',
      },
      {
        label: 'Importacoes recentes',
        value: String((operational.recentImports || []).length),
        hint: `${operational.importStatusCounts?.concluida || 0} concluida(s)`,
        tone: (operational.importStatusCounts?.erro || 0) > 0 ? 'warning' : 'info',
      },
      {
        label: 'Usuarios no tenant',
        value: String(operational.usersCount || 0),
        hint: allCompanies ? 'Modo multiempresa ativo' : 'Equipe no escopo atual',
        tone: 'info',
      },
    ];
  }, [allCompanies, metrics, operational]);

  if (errorMessage) {
    return (
      <PageShell>
        <ScreenHeader
          breadcrumb={['Operacao', 'Dashboard']}
          title="Dashboard operacional financeiro"
          description="Central de leitura operacional para fila, envios, importacoes e auditoria."
        />
        <div className="surface-card rounded-[28px] border border-red-500/20 bg-red-500/5 p-10">
          <OperationalStateView icon={AlertTriangle} title="Falha ao carregar a central operacional" description={errorMessage} tone="danger" />
          {onRetry ? (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800">
                <RefreshCw size={14} />
                Tentar novamente
              </button>
            </div>
          ) : null}
        </div>
      </PageShell>
    );
  }

  if (isEmpty) {
    return (
      <PageShell>
        <ScreenHeader
          breadcrumb={['Operacao', 'Dashboard']}
          title="Dashboard operacional financeiro"
          description="Central de leitura operacional para fila, envios, importacoes e auditoria."
        />
        <div className="surface-card rounded-[28px] p-10">
          <OperationalStateView
            icon={Layers3}
            title="Sem carteira operacional"
            description="Importe uma carteira para habilitar fila, pendencias, envios, auditoria e integracoes nesta central."
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ScreenHeader
        breadcrumb={['Operacao', 'Dashboard']}
        title="Dashboard operacional financeiro"
        description="Priorize cobrancas, acompanhe falhas, valide importacoes e monitore a saude operacional do tenant sem sair da rotina do financeiro."
        status={
          <>
            <OperationalStatusPill tone="success">Dashboard ao vivo</OperationalStatusPill>
            <OperationalStatusPill tone={operational.autoChargeActive ? 'success' : 'warning'}>
              {operational.autoChargeActive ? 'Automacao ativa' : 'Automacao inativa'}
            </OperationalStatusPill>
            <OperationalStatusPill tone={operational.whatsappMockMode ? 'warning' : 'success'}>
              {operational.whatsappMockMode ? 'Modo teste WhatsApp' : 'Envio real habilitavel'}
            </OperationalStatusPill>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {compactKpis.map((item) => (
          <OperationalMetric key={item.label} {...item} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <OperationalPanel
          title="Fila de cobranca"
          subtitle="Titulos que exigem acao imediata, ordenados por risco operacional e vencimento."
          className="xl:col-span-7"
        >
          {(operational.billingQueue || []).length ? (
            <div className="space-y-3">
              <OperationalQueue
                items={operational.billingQueue.map((row) => ({
                  ...row,
                  title: row.cliente,
                  subtitle: row.documento,
                  value: formatMoney(row.valor),
                  secondary: row.vencimento || 'Sem vencimento',
                  statusLabel: !row.hasPhone ? 'Sem telefone' : row.overdueDays > 0 ? `${row.overdueDays}d atraso` : 'A vencer',
                }))}
                getTone={(row) => (!row.hasPhone ? 'danger' : row.overdueDays > 30 ? 'danger' : row.overdueDays > 0 ? 'warning' : 'info')}
                renderMeta={(row) => <span className="text-[11px] text-slate-500">{row.status || 'pendente'}</span>}
              />
            </div>
          ) : (
            <OperationalStateView icon={ListTodo} title="Fila vazia" description="Nao ha titulos abertos no escopo atual." tone="success" />
          )}
        </OperationalPanel>

        <div className="space-y-4 xl:col-span-5">
          <OperationalPanel title="Pendencias criticas" subtitle="Itens que bloqueiam ou degradam o processo de cobranca.">
            {(operational.criticalIssues || []).length ? (
              <div className="space-y-3">
                {operational.criticalIssues.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{item.cliente}</p>
                        <p className="mt-1 font-mono text-xs text-slate-400">{item.documento}</p>
                        <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
                      </div>
                      <OperationalStatusPill tone={resolveOperationalTone(item.status)}>{item.status === 'missing_phone' ? 'Sem telefone' : 'Atraso'}</OperationalStatusPill>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <OperationalStateView icon={ShieldCheck} title="Sem pendencias criticas" description="A fila principal nao mostrou bloqueios de telefone ou atraso alto." tone="success" />
            )}
          </OperationalPanel>

          <OperationalPanel title="Alertas operacionais" subtitle="Sinais que merecem tratativa antes de ampliar os disparos.">
            {(operational.alerts || []).length ? (
              <OperationalStatusList
                items={(operational.alerts || []).map((alert) => ({
                  ...alert,
                  statusLabel: alert.tone === 'danger' ? 'Critico' : 'Atenção',
                }))}
                toneResolver={(item) => item.tone || 'warning'}
              />
            ) : (
              <OperationalStateView icon={CheckCircle2} title="Sem alertas ativos" description="Nenhum desvio operacional relevante no escopo atual." tone="success" />
            )}
          </OperationalPanel>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <OperationalPanel title="Status de envios" subtitle="Leitura rapida do tracking WhatsApp recente." className="xl:col-span-4">
          <div className="space-y-3">
            <OperationalProgress label="Lidas" value={operational.chargeStatusCounts?.read || 0} total={Object.values(operational.chargeStatusCounts || {}).reduce((acc, value) => acc + Number(value || 0), 0)} tone="success" />
            <OperationalProgress label="Entregues" value={operational.chargeStatusCounts?.delivered || 0} total={Object.values(operational.chargeStatusCounts || {}).reduce((acc, value) => acc + Number(value || 0), 0)} tone="success" />
            <OperationalProgress label="Enviadas" value={operational.chargeStatusCounts?.sent || 0} total={Object.values(operational.chargeStatusCounts || {}).reduce((acc, value) => acc + Number(value || 0), 0)} tone="processing" />
            <OperationalProgress label="Em fila" value={operational.chargeStatusCounts?.queued || 0} total={Object.values(operational.chargeStatusCounts || {}).reduce((acc, value) => acc + Number(value || 0), 0)} tone="processing" />
            <OperationalProgress label="Falhas" value={operational.chargeStatusCounts?.failed || 0} total={Object.values(operational.chargeStatusCounts || {}).reduce((acc, value) => acc + Number(value || 0), 0)} tone="danger" />
            <OperationalProgress label="Sem telefone" value={operational.chargeStatusCounts?.missing_phone || 0} total={Object.values(operational.chargeStatusCounts || {}).reduce((acc, value) => acc + Number(value || 0), 0)} tone="warning" />
          </div>
        </OperationalPanel>

        <OperationalPanel title="Saude de integracoes" subtitle="Conectividade e prontidao do stack operacional." className="xl:col-span-4">
          <OperationalStatusList
            items={(operational.integrationHealth || []).map((item) => ({
              ...item,
              statusLabel: item.status === 'success' ? 'OK' : item.status === 'warning' ? 'Atenção' : 'Sem dados',
            }))}
            toneResolver={(item) => item.status}
          />
        </OperationalPanel>

        <OperationalPanel title="Atividades do dia" subtitle="Volume operacional no recorte de hoje." className="xl:col-span-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Envios', value: operational.activityToday?.sends || 0, icon: RefreshCw },
              { label: 'Falhas', value: operational.activityToday?.failures || 0, icon: FileWarning },
              { label: 'Importacoes', value: operational.activityToday?.imports || 0, icon: Upload },
              { label: 'Auditoria', value: operational.activityToday?.audits || 0, icon: Timer },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-slate-400">{label}</p>
                  <Icon size={14} className="text-slate-500" />
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-slate-50">{value}</p>
              </div>
            ))}
          </div>
        </OperationalPanel>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <OperationalPanel title="Status de importacoes" subtitle="Ultimos lotes processados no escopo atual." className="xl:col-span-4">
          <div className="mb-4 grid grid-cols-3 gap-2">
            {[
              { label: 'Concluidas', value: operational.importStatusCounts?.concluida || 0, tone: 'success' },
              { label: 'Processando', value: operational.importStatusCounts?.processando || 0, tone: 'processing' },
              { label: 'Erro', value: operational.importStatusCounts?.erro || 0, tone: 'danger' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-center">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-slate-50">{item.value}</p>
              </div>
            ))}
          </div>
          <OperationalStatusList
            items={(operational.recentImports || []).map((item) => ({
              ...item,
              title: item.arquivo || 'Importacao',
              detail: `${item.registros || 0} registro(s) • ${formatDate(item.data, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
              status: item.status === 'erro' ? 'danger' : item.status === 'processando' ? 'processing' : 'success',
              statusLabel: item.status || 'concluida',
            }))}
            empty={<OperationalStateView icon={Upload} title="Nenhuma importacao recente" description="As ultimas cargas e reprocessamentos aparecem nesta grade." compact />}
            toneResolver={(item) => item.status}
          />
        </OperationalPanel>

        <OperationalPanel title="Eventos recentes" subtitle="Feed consolidado de importacoes e disparos." className="xl:col-span-4">
          <OperationalEventFeed
            items={(operational.recentEvents || []).map((item) => ({
              ...item,
              badge: item.type === 'import' ? 'Importacao' : 'Envio',
            }))}
            emptyIcon={Clock3}
            emptyTitle="Sem eventos recentes"
            emptyDescription="Novas importacoes, envios e tratativas aparecem aqui."
            formatTimestamp={(value) => formatDate(value, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          />
        </OperationalPanel>

        <OperationalPanel title="Mensagens com falha" subtitle="Ultimas falhas que exigem retrabalho." className="xl:col-span-4">
          <OperationalStatusList
            items={(operational.failedMessages || []).map((item) => ({
              ...item,
              title: item.cliente || item.documento || 'Falha de envio',
              detail: item.failure_reason || 'Falha nao especificada',
              status: 'danger',
              statusLabel: 'Falha',
            }))}
            empty={<OperationalStateView icon={MessageSquareWarning} title="Sem falhas recentes" description="Nenhuma mensagem com erro no escopo atual." tone="success" compact />}
            renderMeta={(item) => <span className="font-mono text-[11px] text-slate-500">{formatDate(item.failed_at || item.created_at, { hour: '2-digit', minute: '2-digit' })}</span>}
            toneResolver={(item) => item.status}
          />
        </OperationalPanel>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <OperationalPanel
          title="Auditoria recente"
          subtitle={allCompanies ? 'Eventos operacionais de todas as empresas no escopo atual.' : 'Rastro recente de acoes e integracoes desta empresa.'}
          action={
            onNavigate ? (
              <button
                type="button"
                onClick={() => onNavigate('audit')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                Ver auditoria
                <ArrowRight size={12} />
              </button>
            ) : null
          }
          className="xl:col-span-8"
        >
          {auditLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-2xl bg-slate-900/70" />
              ))}
            </div>
          ) : recentAudit.length ? (
            <div className="space-y-1">
              {recentAudit.map((event) => (
                <AuditEventCard key={event.id} event={event} compact />
              ))}
            </div>
          ) : (
            <OperationalStateView icon={Clock3} title="Sem auditoria recente" description="Os proximos eventos de runtime, configuracao e envio aparecerao aqui." />
          )}
        </OperationalPanel>

        <OperationalPanel
          title="Checklist operacional"
          subtitle="Prontidao minima para manter a operacao financeiramente saudavel."
          action={
            onNavigate ? (
              <button
                type="button"
                onClick={() => onNavigate('production-checklist')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                Abrir checklist
                <ArrowRight size={12} />
              </button>
            ) : null
          }
          className="xl:col-span-4"
        >
          {(operational.checklist || []).length ? (
            <OperationalChecklist items={operational.checklist || []} />
          ) : (
            <OperationalStateView icon={CheckCircle2} title="Checklist indisponivel" description="As verificacoes de prontidao serao exibidas quando o tenant tiver dados operacionais." />
          )}
        </OperationalPanel>
      </section>

      {onboarding?.steps?.length ? (
        <OperationalPanel
          title="Onboarding operacional"
          subtitle="Pendencias de ativacao ainda abertas para o tenant atual."
          action={
            onNavigate ? (
              <button
                type="button"
                onClick={() => onNavigate('onboarding')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                Abrir onboarding
                <ArrowRight size={12} />
              </button>
            ) : null
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(onboarding.steps || []).slice(0, 4).map((step) => (
              <div key={step.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100">{step.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{step.description}</p>
                  </div>
                  <OperationalStatusPill tone={step.done ? 'success' : 'warning'}>{step.done ? 'Concluido' : 'Pendente'}</OperationalStatusPill>
                </div>
              </div>
            ))}
          </div>
        </OperationalPanel>
      ) : null}
    </PageShell>
  );
}
