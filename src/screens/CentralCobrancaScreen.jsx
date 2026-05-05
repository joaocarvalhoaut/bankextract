import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PhoneOff,
  Receipt,
  RefreshCcw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import DataTable from '../components/DataTable';
import {
  getBillingCenter,
  simulateChargeItem,
  syncBillingDrive,
  updateChargeStatus,
} from '../services/billingAutomationService';
import { canUserPerformAction } from '../security/permissions';
import { formatCurrencyBRL } from '../utils/format';

function CenterCard({ label, value, tone = 'slate' }) {
  const palette = {
    slate: 'from-slate-400 to-slate-500 text-slate-950',
    emerald: 'from-emerald-400 to-emerald-600 text-emerald-700',
    blue: 'from-blue-400 to-blue-600 text-blue-700',
    amber: 'from-amber-400 to-orange-400 text-amber-700',
    red: 'from-red-400 to-red-600 text-red-700',
  };

  return (
    <article className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${palette[tone]?.split(' text-')[0] || 'from-slate-400 to-slate-500'} opacity-80`} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${palette[tone]?.split(' ').pop() || 'text-slate-950'}`}>{value}</p>
    </article>
  );
}

const toneByStatus = {
  pendente: 'bg-slate-100 text-slate-700 ring-slate-200',
  pago: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  negociado: 'bg-blue-50 text-blue-700 ring-blue-200',
  suspenso: 'bg-amber-50 text-amber-700 ring-amber-200',
};

export default function CentralCobrancaScreen({
  companyId,
  activeCompanyId,
  activeCompany,
  selectedCompany,
  company,
  companyName,
  globalMode,
  userRole = 'operador',
  onToast,
}) {
  const resolvedCompanyId =
    companyId ||
    activeCompanyId ||
    activeCompany?.id ||
    selectedCompany?.id ||
    company?.id ||
    null;

  const [loading, setLoading] = useState(false);
  const [runningAction, setRunningAction] = useState('');
  const [center, setCenter] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);

  const canManageCharges = canUserPerformAction(userRole, 'manage_charges');

  const loadCenter = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      setCenter(null);
      return;
    }

    setLoading(true);
    try {
      const data = await getBillingCenter(resolvedCompanyId);
      setCenter(data);
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao carregar a central de cobranca.');
    } finally {
      setLoading(false);
    }
  }, [globalMode, onToast, resolvedCompanyId]);

  useEffect(() => {
    loadCenter();
  }, [loadCenter]);

  const runRowAction = useCallback(
    async (actionKey, fn, successMessage) => {
      if (!resolvedCompanyId || globalMode) {
        onToast?.('erro', 'Selecione uma empresa especifica para operar a central.');
        return;
      }

      setRunningAction(actionKey);
      try {
        const result = await fn();
        await loadCenter();
        if (result?.mensagem_gerada) {
          setSimulationResult(result);
        }
        onToast?.('sucesso', result?.message || successMessage);
      } catch (error) {
        onToast?.('erro', error.message || 'Falha ao executar a acao da central.');
      } finally {
        setRunningAction('');
      }
    },
    [globalMode, loadCenter, onToast, resolvedCompanyId]
  );

  const cards = center?.cards || {
    vencendo_amanha: 0,
    vencem_hoje: 0,
    em_atraso: 0,
    sem_boleto_encontrado: 0,
    sem_telefone_valido: 0,
    simulacoes_realizadas_hoje: 0,
    erros: 0,
    total_em_aberto: 0,
  };

  const rows = center?.rows || [];

  const columns = useMemo(
    () => [
      {
        key: 'cliente_nome',
        label: 'Cliente',
        render: (row) => <span className="font-medium text-slate-900">{row.cliente_nome}</span>,
      },
      {
        key: 'numero_boleto',
        label: 'NumeroBoleto',
      },
      {
        key: 'vencimento',
        label: 'Vencimento',
        render: (row) => (row.vencimento ? new Date(`${row.vencimento}T00:00:00`).toLocaleDateString('pt-BR') : '-'),
      },
      {
        key: 'valor',
        label: 'Valor',
        render: (row) => <span className="font-semibold text-slate-900">{formatCurrencyBRL(row.valor)}</span>,
      },
      {
        key: 'telefone',
        label: 'Telefone',
        render: (row) => row.telefone || <span className="text-slate-400">Sem telefone</span>,
      },
      {
        key: 'status',
        label: 'Status',
        render: (row) => (
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${toneByStatus[row.status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
            {row.status}
          </span>
        ),
      },
      {
        key: 'etapa_regua',
        label: 'Etapa da regua',
      },
      {
        key: 'boleto_encontrado',
        label: 'Boleto encontrado',
        render: (row) =>
          row.boleto_encontrado ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 size={12} />
              Sim
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
              <AlertCircle size={12} />
              Nao
            </span>
          ),
      },
      {
        key: 'ultima_cobranca',
        label: 'Ultima cobranca',
        render: (row) =>
          row.ultima_cobranca
            ? new Date(row.ultima_cobranca).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '-',
      },
      {
        key: 'actions',
        label: 'Acoes',
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canManageCharges || Boolean(runningAction)}
              onClick={() =>
                runRowAction(
                  `simulate-${row.id}`,
                  () => simulateChargeItem(resolvedCompanyId, row.id),
                  'Simulacao registrada com sucesso.'
                )
              }
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {runningAction === `simulate-${row.id}` ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Simular cobranca
            </button>
            <button
              type="button"
              disabled={!row.boleto_url}
              onClick={() => window.open(row.boleto_url, '_blank', 'noopener,noreferrer')}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <ExternalLink size={12} />
              Abrir boleto
            </button>
            <button
              type="button"
              disabled={!canManageCharges || Boolean(runningAction)}
              onClick={() =>
                runRowAction(
                  `paid-${row.id}`,
                  () => updateChargeStatus(resolvedCompanyId, row.id, 'pago'),
                  'Titulo marcado como pago.'
                )
              }
              className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              <CheckCircle2 size={12} />
              Marcar como pago
            </button>
            <button
              type="button"
              disabled={!canManageCharges || Boolean(runningAction)}
              onClick={() =>
                runRowAction(
                  `negotiated-${row.id}`,
                  () => updateChargeStatus(resolvedCompanyId, row.id, 'negociado'),
                  'Titulo marcado como negociado.'
                )
              }
              className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
            >
              <Receipt size={12} />
              Marcar como negociado
            </button>
            <button
              type="button"
              disabled={!canManageCharges || Boolean(runningAction)}
              onClick={() =>
                runRowAction(
                  `suspend-${row.id}`,
                  () => updateChargeStatus(resolvedCompanyId, row.id, 'suspenso'),
                  'Cobranca suspensa para este titulo.'
                )
              }
              className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
            >
              <PhoneOff size={12} />
              Suspender cobranca
            </button>
            <button
              type="button"
              disabled={Boolean(runningAction)}
              onClick={() =>
                runRowAction(
                  `drive-${row.id}`,
                  () => syncBillingDrive(resolvedCompanyId),
                  'Busca de boletos reprocessada com sucesso.'
                )
              }
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCcw size={12} />
              Reprocessar boleto
            </button>
          </div>
        ),
      },
    ],
    [canManageCharges, resolvedCompanyId, runRowAction, runningAction]
  );

  if (globalMode || !resolvedCompanyId) {
    return (
      <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-soft">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5" size={18} />
          <div>
            <p className="font-semibold">Selecione uma empresa especifica</p>
            <p className="mt-1 text-xs text-amber-700">
              A central de cobranca trabalha por empresa para manter isolamento por company_id.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <Receipt size={13} />
              Central de cobranca
            </div>
            <h3 className="mt-4 text-2xl font-semibold text-slate-950">Operacao da regua por titulo</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Visao consolidada da carteira da empresa <span className="font-semibold text-slate-900">{companyName}</span> com etapa da regua, boleto encontrado e ultimas simulacoes.
            </p>
          </div>
          <button
            type="button"
            onClick={loadCenter}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            Atualizar central
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CenterCard label="Vencendo amanha" value={cards.vencendo_amanha} tone="blue" />
        <CenterCard label="Vencem hoje" value={cards.vencem_hoje} tone="emerald" />
        <CenterCard label="Em atraso" value={cards.em_atraso} tone="amber" />
        <CenterCard label="Sem boleto encontrado" value={cards.sem_boleto_encontrado} tone="red" />
        <CenterCard label="Sem telefone valido" value={cards.sem_telefone_valido} tone="amber" />
        <CenterCard label="Simulacoes hoje" value={cards.simulacoes_realizadas_hoje} tone="blue" />
        <CenterCard label="Erros" value={cards.erros} tone="red" />
        <CenterCard label="Total em aberto" value={cards.total_em_aberto} tone="slate" />
      </section>

      {simulationResult ? (
        <section className="rounded-[28px] border border-blue-200 bg-blue-50/70 p-6 shadow-soft">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 text-blue-700" size={18} />
            <div className="w-full">
              <p className="text-sm font-semibold text-blue-900">Ultima simulacao</p>
              <p className="mt-1 text-xs text-blue-700">
                Arquivo encontrado: {simulationResult.arquivo_encontrado ? 'sim' : 'nao'}.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-2xl border border-blue-100 bg-white p-4 text-xs leading-relaxed text-slate-700">
                {simulationResult.mensagem_gerada || 'Nenhuma mensagem gerada.'}
              </pre>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="Nenhum titulo monitorado nesta empresa."
          emptyDescription="Assim que houver registros sincronizados, a central mostrara a etapa da regua e o status do boleto."
        />
      </section>
    </div>
  );
}
