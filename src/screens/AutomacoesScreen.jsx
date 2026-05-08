import { Clock3, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import PlanLimitNotice from '../components/PlanLimitNotice';
import { getUsageSummary } from '../services/usageService';
import CobrancaAutomaticaScreen from './CobrancaAutomaticaScreen';

function calcProximaExecucao(horaEnvio, ativo) {
  if (!ativo) return 'Aguardando ativacao';

  try {
    const brNow = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());

    const [hNow, mNow] = brNow.split(':').map(Number);
    const [hTarget, mTarget] = (horaEnvio || '08:00').split(':').map(Number);

    if (hNow * 60 + mNow < hTarget * 60 + mTarget) {
      return `Hoje as ${horaEnvio}`;
    }
    return `Amanha as ${horaEnvio}`;
  } catch {
    return `As ${horaEnvio}`;
  }
}

function HeaderPill({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export default function AutomacoesScreen({
  companyId,
  activeCompanyId,
  activeCompany,
  companyName,
  globalMode,
  userRole = 'operador',
  rules,
  billingExecutionMode = 'simulate',
  onBillingExecutionModeChange,
  onToast,
}) {
  const ativo = Boolean(rules?.active);
  const horario = rules?.horario || '08:00';
  const proximaJanela = calcProximaExecucao(horario, ativo);
  const [limitNotice, setLimitNotice] = useState(null);

  useEffect(() => {
    let alive = true;

    const loadUsage = async () => {
      if (!activeCompanyId || globalMode) {
        if (alive) setLimitNotice(null);
        return;
      }

      try {
        const summary = await getUsageSummary(activeCompanyId);
        const metric = summary?.metrics?.automations_month;

        if (!alive) return;
        if (metric?.alert) {
          setLimitNotice({
            type: metric.alert.level === 'warning' ? 'warning' : 'danger',
            title: metric.alert.title,
            message: metric.alert.message,
          });
        } else {
          setLimitNotice(null);
        }
      } catch {
        if (alive) setLimitNotice(null);
      }
    };

    loadUsage();
    return () => {
      alive = false;
    };
  }, [activeCompanyId, globalMode]);

  return (
    <div className="space-y-6">
      {limitNotice ? <PlanLimitNotice {...limitNotice} /> : null}
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <Sparkles size={13} />
              Automacoes
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Automações</h2>
            <p className="mt-1 text-sm text-slate-600">Motor de cobrança automática por empresa.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:min-w-[520px]">
            <HeaderPill label="Status" value={ativo ? 'Ativo' : 'Inativo'} />
            <HeaderPill label="Horario" value={horario} />
            <HeaderPill label="Proxima janela" value={globalMode ? 'Selecione uma empresa' : proximaJanela} />
          </div>
        </div>
      </section>

      <CobrancaAutomaticaScreen
        companyId={companyId}
        activeCompanyId={activeCompanyId}
        activeCompany={activeCompany}
        companyName={companyName}
        globalMode={globalMode}
        userRole={userRole}
        billingExecutionMode={billingExecutionMode}
        onBillingExecutionModeChange={onBillingExecutionModeChange}
        onToast={onToast}
      />
    </div>
  );
}
