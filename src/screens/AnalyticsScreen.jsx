import { useEffect, useState } from 'react';
import { Activity, BarChart3, Building2, Receipt, Users } from 'lucide-react';
import PlanLimitNotice from '../components/PlanLimitNotice';
import { checkFeatureAccess } from '../services/subscriptionService';
import { getCompanyAnalytics } from '../services/analyticsService';
import { getUsageSummary } from '../services/usageService';
import { formatCurrencyBRL } from '../utils/format';

function MetricCard({ label, value, tone = 'slate', suffix = '' }) {
  const palette = {
    slate: 'text-slate-950 bg-slate-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    blue: 'text-blue-700 bg-blue-50',
    red: 'text-red-700 bg-red-50',
  };

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className={`mt-3 inline-flex rounded-2xl px-4 py-3 ${palette[tone] || palette.slate}`}>
        <p className="text-2xl font-bold">
          {typeof value === 'number' ? formatCurrencyBRL(value) : value}
          {suffix}
        </p>
      </div>
    </article>
  );
}

function AgingBars({ items = [] }) {
  const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">{item.label}</span>
            <span className="font-semibold text-slate-900">{formatCurrencyBRL(item.value || 0)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max((Number(item.value || 0) / max) * 100, 4)}%`,
                backgroundColor: item.color || '#10b981',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsScreen({ companyId, companyName, onToast }) {
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [advancedLocked, setAdvancedLocked] = useState(false);
  const [usageSummary, setUsageSummary] = useState(null);

  const usageCards = [
    usageSummary?.metrics?.charges_month,
    usageSummary?.metrics?.imports_month,
    usageSummary?.metrics?.automations_month,
    usageSummary?.metrics?.users_count,
  ].filter(Boolean);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!companyId) {
        if (alive) setAnalytics(null);
        return;
      }

      setLoading(true);
      try {
        const [analyticsResponse, usageResponse] = await Promise.all([
          getCompanyAnalytics(companyId),
          getUsageSummary(companyId),
        ]);
        if (alive) {
          setAnalytics(analyticsResponse);
          setUsageSummary(usageResponse);
        }
      } catch (error) {
        if (alive) {
          setAnalytics(null);
          setUsageSummary(null);
        }
        onToast?.('erro', error.message || 'Falha ao carregar analytics.');
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [companyId, onToast]);

  useEffect(() => {
    let alive = true;

    const loadAccess = async () => {
      if (!companyId) {
        if (alive) setAdvancedLocked(false);
        return;
      }

      try {
        const access = await checkFeatureAccess(companyId, 'analytics');
        if (alive) setAdvancedLocked(!access.allowed);
      } catch {
        if (alive) setAdvancedLocked(false);
      }
    };

    loadAccess();
    return () => {
      alive = false;
    };
  }, [companyId]);

  if (!companyId) {
    return (
      <div className="rounded-[32px] border border-dashed border-slate-300 bg-white p-12 text-center shadow-soft">
        <BarChart3 className="mx-auto mb-4 text-slate-300" size={30} />
        <h2 className="text-xl font-semibold text-slate-900">Selecione uma empresa para abrir o analytics</h2>
        <p className="mt-2 text-sm text-slate-500">As metricas financeiras e operacionais sao calculadas por company_id.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {advancedLocked ? (
        <PlanLimitNotice
          type="info"
          title="Analytics avancado disponivel nos planos Pro e Business"
          message="Voce continua vendo as metricas basicas da carteira. Recursos executivos e comparativos mais profundos ficam liberados nos planos superiores."
        />
      ) : null}
      {usageSummary?.highestAlert ? (
        <PlanLimitNotice
          type={usageSummary.highestAlert.level === 'warning' ? 'warning' : 'danger'}
          title={usageSummary.highestAlert.title}
          message={usageSummary.highestAlert.message}
        />
      ) : null}
      <section className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Analytics interno</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Leituras operacionais de {companyName || 'uma empresa ativa'}</h2>
            <p className="mt-2 text-sm text-slate-500">
              Acompanhe importacoes, recebiveis, simulacoes e sinais de cobranca sem depender de integracoes pagas.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
            <Activity size={14} />
            {loading ? 'Atualizando metricas...' : 'Atualizado com fallback seguro'}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(analytics?.cards || []).map((card) => (
          <MetricCard key={card.id} label={card.label} value={card.value} tone={card.tone} />
        ))}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-slate-900">Uso do plano no ciclo atual</h3>
          <p className="text-sm text-slate-500">Medicao real por empresa para importacoes, cobrancas, automacoes e usuarios.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {usageCards.map((metric) => (
            <article key={metric.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">
                    {metric.used} / {metric.limit || 'sem limite'}
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-soft">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">% consumido</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{metric.percent}%</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all ${
                    metric.percent >= 100 ? 'bg-red-500' : metric.percent >= 95 ? 'bg-orange-500' : metric.percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(metric.percent, 100)}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>Restante: {metric.remaining}</span>
                <span>Projecao: {metric.projected}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-900">Aging da carteira</h3>
            <p className="text-sm text-slate-500">Visual rapido dos recebiveis por faixa de atraso.</p>
          </div>
          <AgingBars items={analytics?.aging || []} />
        </article>

        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-900">Indicadores SaaS</h3>
            <p className="text-sm text-slate-500">Base interna para acompanhamento comercial e operacional.</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <Building2 size={16} />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">Empresas ativas</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{analytics?.activeCompanies || 0}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <Users size={16} />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">Usuarios ativos</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{analytics?.activeUsers || 0}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <Receipt size={16} />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">Cobrancas simuladas</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{analytics?.billing?.simulatedCharges || 0}</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
