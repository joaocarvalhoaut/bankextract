import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  FileCheck,
  FileX,
  GitMerge,
  Loader2,
  Phone,
  RefreshCcw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import DataTable from '../components/DataTable';
import {
  getBillingInconsistencies,
  getBoletoSyncReport,
  reprocessBoletoDriveSingle,
  updateChargeStatus,
  updateFinancialPhone,
} from '../services/billingAutomationService';
import { canUserPerformAction } from '../security/permissions';
import { formatCurrencyBRL, formatDateBR } from '../utils/format';

const IGNORED_PREFIX = 'bankextract_ignored_inconsistencies_';

function InconsistencyCard({ label, value, tone = 'slate' }) {
  const palette = {
    slate:  'from-slate-400 to-slate-500 text-slate-50',
    emerald:'from-emerald-400 to-emerald-600 text-emerald-300',
    blue:   'from-blue-400 to-blue-600 text-blue-300',
    amber:  'from-amber-400 to-orange-400 text-amber-300',
    red:    'from-red-400 to-red-600 text-red-300',
  };

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5 shadow-card">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${palette[tone]?.split(' text-')[0] || 'from-slate-400 to-slate-500'} opacity-80`} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${palette[tone]?.split(' ').pop() || 'text-slate-50'}`}>{value}</p>
    </article>
  );
}

function FilterField({ label, children }) {
  return (
    <label className="space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function severityTone(level) {
  if (level === 'alta') return 'bg-red-500/10 text-red-300 ring-red-500/25';
  if (level === 'media') return 'bg-amber-500/10 text-amber-300 ring-amber-500/25';
  return 'bg-slate-800/40 text-slate-300 ring-slate-700/60';
}

function readIgnored(companyId) {
  try {
    const raw = window.localStorage.getItem(`${IGNORED_PREFIX}${companyId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIgnored(companyId, values) {
  try {
    window.localStorage.setItem(`${IGNORED_PREFIX}${companyId}`, JSON.stringify(values));
  } catch {
    // Ignored on purpose: local persistence is best-effort only.
  }
}

export default function InconsistenciasCobrancaScreen({
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

  const canManageCharges = canUserPerformAction(userRole, 'manage_charges');
  const canEditRecords = canUserPerformAction(userRole, 'edit_financial_records');

  const [loading, setLoading] = useState(false);
  const [runningAction, setRunningAction] = useState('');
  const [reprocessingId, setReprocessingId] = useState('');
  const [cards, setCards] = useState({
    sem_telefone: 0,
    telefone_invalido: 0,
    sem_boleto: 0,
    status_invalido: 0,
    vencimento_ausente: 0,
    valor_zerado: 0,
    duplicados: 0,
    suspensos: 0,
  });
  const [driveCards, setDriveCards] = useState({
    baixa_confianca: 0,
    conflitos: 0,
    nao_encontrados: 0,
    erros: 0,
    encontrados: 0,
  });
  const [driveLoading, setDriveLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({
    cliente: '',
    tipo_problema: '',
    severidade: '',
    status: '',
    mostrar_ignoradas: 'nao',
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [ignoredIds, setIgnoredIds] = useState([]);
  const [phoneModal, setPhoneModal] = useState(null);
  const [phoneValue, setPhoneValue] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);

  useEffect(() => {
    if (!resolvedCompanyId) {
      setIgnoredIds([]);
      return;
    }
    setIgnoredIds(readIgnored(resolvedCompanyId));
  }, [resolvedCompanyId]);

  const loadInconsistencies = useCallback(async (currentFilters = appliedFilters) => {
    if (!resolvedCompanyId || globalMode) {
      setItems([]);
      setCards({
        sem_telefone: 0,
        telefone_invalido: 0,
        sem_boleto: 0,
        status_invalido: 0,
        vencimento_ausente: 0,
        valor_zerado: 0,
        duplicados: 0,
        suspensos: 0,
      });
      return;
    }

    setLoading(true);
    try {
      const response = await getBillingInconsistencies(resolvedCompanyId, currentFilters);
      const allItems = Array.isArray(response?.items) ? response.items : [];
      const visibleItems = currentFilters.mostrar_ignoradas === 'sim'
        ? allItems
        : allItems.filter((item) => !ignoredIds.includes(item.id));
      const visibleCards = visibleItems.reduce((acc, item) => {
        const key = item.tipo_problema === 'duplicado' ? 'duplicados' : item.tipo_problema;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {
        sem_telefone: 0,
        telefone_invalido: 0,
        sem_boleto: 0,
        status_invalido: 0,
        vencimento_ausente: 0,
        valor_zerado: 0,
        duplicados: 0,
        suspensos: 0,
      });
      setCards(visibleCards);
      setItems(visibleItems);
    } catch (error) {
      setItems([]);
      onToast?.('erro', error.message || 'Falha ao carregar as inconsistencias.');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, globalMode, ignoredIds, onToast, resolvedCompanyId]);

  useEffect(() => {
    loadInconsistencies(appliedFilters);
  }, [loadInconsistencies, appliedFilters]);

  const loadDriveReport = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) return;
    setDriveLoading(true);
    try {
      const report = await getBoletoSyncReport(resolvedCompanyId);
      if (report?.cards) {
        const total = Number(report.cards.total_titulos || 0);
        const found = Number(report.cards.boletos_encontrados || 0);
        const baixa = Number(report.cards.baixa_confianca || 0);
        const conf = Number(report.cards.conflitos || 0);
        const erros = Number(report.cards.erros || 0);
        setDriveCards({
          encontrados: found,
          baixa_confianca: baixa,
          conflitos: conf,
          erros,
          nao_encontrados: Math.max(0, total - found - baixa - conf - erros),
        });
      }
    } catch {
      // Drive report is informational; silent fail.
    } finally {
      setDriveLoading(false);
    }
  }, [globalMode, resolvedCompanyId]);

  useEffect(() => {
    loadDriveReport();
  }, [loadDriveReport]);

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters(filters);
  }, [filters]);

  const handleClearFilters = useCallback(() => {
    const empty = {
      cliente: '',
      tipo_problema: '',
      severidade: '',
      status: '',
      mostrar_ignoradas: 'nao',
    };
    setFilters(empty);
    setAppliedFilters(empty);
  }, []);

  const handleIgnore = useCallback((row) => {
    if (!resolvedCompanyId) return;
    const next = Array.from(new Set([...ignoredIds, row.id]));
    setIgnoredIds(next);
    writeIgnored(resolvedCompanyId, next);
    setItems((prev) => prev.filter((item) => item.id !== row.id));
    onToast?.('sucesso', 'Inconsistencia ignorada nesta empresa.');
  }, [ignoredIds, onToast, resolvedCompanyId]);

  const runStatusAction = useCallback(async (row, nextStatus, successMessage) => {
    if (!canManageCharges) {
      onToast?.('erro', 'Seu perfil atual nao pode alterar o status da cobranca.');
      return;
    }

    setRunningAction(`${nextStatus}-${row.id}`);
    try {
      await updateChargeStatus(resolvedCompanyId, row.registro_id, nextStatus);
      onToast?.('sucesso', successMessage);
      await loadInconsistencies(appliedFilters);
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao atualizar o status.');
    } finally {
      setRunningAction('');
    }
  }, [appliedFilters, canManageCharges, loadInconsistencies, onToast, resolvedCompanyId]);

  const columns = useMemo(() => [
    {
      key: 'nome',
      label: 'Cliente',
      render: (row) => <span className="font-medium text-slate-50">{row.nome || '-'}</span>,
    },
    {
      key: 'numero_boleto',
      label: 'Boleto',
      render: (row) => row.numero_boleto || '-',
    },
    {
      key: 'data_vencimento',
      label: 'Vencimento',
      render: (row) => row.data_vencimento ? formatDateBR(row.data_vencimento) : '-',
    },
    {
      key: 'valor',
      label: 'Valor',
      render: (row) => <span className="font-semibold text-slate-50">{formatCurrencyBRL(row.valor || 0)}</span>,
    },
    {
      key: 'telefone',
      label: 'Telefone',
      render: (row) => row.telefone || <span className="text-slate-400">Sem telefone</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => row.status || 'pendente',
    },
    {
      key: 'problema_label',
      label: 'Problema encontrado',
    },
    {
      key: 'severidade',
      label: 'Severidade',
      render: (row) => (
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${severityTone(row.severidade)}`}>
          {row.severidade}
        </span>
      ),
    },
    {
      key: 'acao_sugerida',
      label: 'Acao sugerida',
    },
    {
      key: 'actions',
      label: 'Acoes',
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canEditRecords}
            onClick={() => {
              setPhoneModal(row);
              setPhoneValue(String(row.telefone || ''));
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
          >
            <Phone size={12} />
            Editar telefone
          </button>
          <button
            type="button"
            disabled={Boolean(reprocessingId) || !canEditRecords}
            onClick={async () => {
              if (!resolvedCompanyId || !row.registro_id) return;
              setReprocessingId(row.registro_id);
              try {
                const result = await reprocessBoletoDriveSingle(resolvedCompanyId, row.registro_id);
                const status = result?.result?.status || 'nao_encontrado';
                const confidence = Number(result?.result?.confidence || 0);
                const msg = status === 'encontrado'
                  ? `Boleto localizado com ${confidence.toFixed(0)}% de confianca.`
                  : status === 'baixa_confianca'
                  ? `Boleto encontrado com baixa confianca (${confidence.toFixed(0)}%). Revise manualmente.`
                  : 'Nenhum boleto encontrado no Drive para este registro.';
                onToast?.(status === 'encontrado' ? 'sucesso' : 'aviso', msg);
                await loadInconsistencies(appliedFilters);
                await loadDriveReport();
              } catch (err) {
                onToast?.('erro', err.message || 'Falha ao reprocessar boleto no Drive.');
              } finally {
                setReprocessingId('');
              }
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
          >
            {reprocessingId === row.registro_id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
            Reprocessar boleto
          </button>
          <button
            type="button"
            disabled={!canManageCharges || Boolean(runningAction)}
            onClick={() => runStatusAction(row, 'pendente', 'Registro marcado como pendente.')}
            className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {runningAction === `pendente-${row.id}` ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Marcar como pendente
          </button>
          <button
            type="button"
            disabled={!canManageCharges || Boolean(runningAction)}
            onClick={() => runStatusAction(row, 'suspenso', 'Registro marcado como suspenso.')}
            className="inline-flex items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
          >
            {runningAction === `suspenso-${row.id}` ? <Loader2 size={12} className="animate-spin" /> : <AlertCircle size={12} />}
            Marcar como suspenso
          </button>
          <button
            type="button"
            onClick={() => handleIgnore(row)}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800/40"
          >
            Ignorar inconsistência
          </button>
        </div>
      ),
    },
  ], [appliedFilters, canEditRecords, canManageCharges, handleIgnore, loadDriveReport, loadInconsistencies, onToast, reprocessingId, resolvedCompanyId, runStatusAction, runningAction]);

  if (globalMode || !resolvedCompanyId) {
    return (
      <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-6 text-sm text-amber-300">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5" size={18} />
          <div>
            <p className="font-semibold">Selecione uma empresa especifica</p>
            <p className="mt-1 text-xs text-amber-400">
              O painel de inconsistencias funciona por empresa para manter isolamento por company_id.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.10em] text-red-300">
              <AlertCircle size={13} />
              Inconsistencias de cobranca
            </div>
            <h3 className="mt-4 text-2xl font-semibold text-slate-50">Painel preventivo da regua</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              Problemas que podem impedir ou prejudicar a cobranca automatica da empresa <span className="font-semibold text-slate-50">{companyName}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadInconsistencies(appliedFilters)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-soft transition hover:bg-slate-800/40 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            Atualizar inconsistencias
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InconsistencyCard label="Sem telefone" value={cards.sem_telefone || 0} tone="red" />
        <InconsistencyCard label="Telefone invalido" value={cards.telefone_invalido || 0} tone="red" />
        <InconsistencyCard label="Sem boleto" value={cards.sem_boleto || 0} tone="amber" />
        <InconsistencyCard label="Status invalido" value={cards.status_invalido || 0} tone="amber" />
        <InconsistencyCard label="Vencimento ausente" value={cards.vencimento_ausente || 0} tone="red" />
        <InconsistencyCard label="Valor zerado" value={cards.valor_zerado || 0} tone="red" />
        <InconsistencyCard label="Duplicados" value={cards.duplicados || 0} tone="blue" />
        <InconsistencyCard label="Suspensos" value={cards.suspensos || 0} tone="slate" />
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-700/40 bg-blue-900/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              <FileCheck size={13} />
              Status dos boletos no Google Drive
            </div>
            <p className="mt-2 text-sm text-slate-400">Resultado da ultima varredura inteligente de PDFs no Drive.</p>
          </div>
          <button
            type="button"
            onClick={loadDriveReport}
            disabled={driveLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
          >
            {driveLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
            Atualizar
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <div className="flex flex-col gap-1 rounded-2xl border border-emerald-700/30 bg-emerald-900/15 px-4 py-3">
            <div className="flex items-center gap-2">
              <FileCheck size={14} className="text-emerald-400" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500">Encontrados</span>
            </div>
            <p className="text-2xl font-semibold text-emerald-300">{driveCards.encontrados}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl border border-amber-700/30 bg-amber-900/15 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-500">Baixa confianca</span>
            </div>
            <p className="text-2xl font-semibold text-amber-300">{driveCards.baixa_confianca}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl border border-red-700/30 bg-red-900/15 px-4 py-3">
            <div className="flex items-center gap-2">
              <GitMerge size={14} className="text-red-400" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-red-500">Conflitos</span>
            </div>
            <p className="text-2xl font-semibold text-red-300">{driveCards.conflitos}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <FileX size={14} className="text-slate-400" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Nao encontrados</span>
            </div>
            <p className="text-2xl font-semibold text-slate-300">{driveCards.nao_encontrados}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl border border-red-900/30 bg-red-950/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="text-red-500" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-red-600">Erros Drive</span>
            </div>
            <p className="text-2xl font-semibold text-red-400">{driveCards.erros}</p>
          </div>
        </div>
        {(driveCards.conflitos > 0 || driveCards.baixa_confianca > 0) ? (
          <div className="mt-4 rounded-2xl border border-amber-700/30 bg-amber-900/10 px-4 py-3 text-xs text-amber-300">
            <strong>
              {driveCards.conflitos > 0 ? `${driveCards.conflitos} conflito(s)` : ''}
              {driveCards.conflitos > 0 && driveCards.baixa_confianca > 0 ? ' e ' : ''}
              {driveCards.baixa_confianca > 0 ? `${driveCards.baixa_confianca} registro(s) com baixa confianca` : ''}
            </strong>
            {' '}detectado(s). Use o botao &quot;Reprocessar boleto&quot; na tabela abaixo para reanalise individual.
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 shadow-card">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <FilterField label="Cliente">
            <input
              type="text"
              value={filters.cliente}
              onChange={(e) => setFilters((prev) => ({ ...prev, cliente: e.target.value }))}
              placeholder="Nome do cliente"
              className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </FilterField>
          <FilterField label="Tipo de problema">
            <select
              value={filters.tipo_problema}
              onChange={(e) => setFilters((prev) => ({ ...prev, tipo_problema: e.target.value }))}
              className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Todos</option>
              <option value="sem_telefone">Sem telefone</option>
              <option value="telefone_invalido">Telefone inválido</option>
              <option value="sem_boleto">Sem boleto</option>
              <option value="status_invalido">Status inválido</option>
              <option value="vencimento_ausente">Vencimento ausente</option>
              <option value="valor_zerado">Valor zerado</option>
              <option value="duplicado">Duplicado</option>
              <option value="suspenso">Suspenso</option>
            </select>
          </FilterField>
          <FilterField label="Severidade">
            <select
              value={filters.severidade}
              onChange={(e) => setFilters((prev) => ({ ...prev, severidade: e.target.value }))}
              className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Todas</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </FilterField>
          <FilterField label="Status">
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="negociado">Negociado</option>
              <option value="suspenso">Suspenso</option>
              <option value="cancelado">Cancelado</option>
              <option value="liquidado">Liquidado</option>
            </select>
          </FilterField>
          <FilterField label="Mostrar ignoradas">
            <select
              value={filters.mostrar_ignoradas}
              onChange={(e) => setFilters((prev) => ({ ...prev, mostrar_ignoradas: e.target.value }))}
              className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </FilterField>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApplyFilters}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            <Search size={15} />
            Aplicar filtros
          </button>
          <button
            type="button"
            onClick={handleClearFilters}
            className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/40"
          >
            Limpar filtros
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 shadow-card">
        <DataTable
          columns={columns}
          rows={items}
          emptyTitle="Nenhuma inconsistencia encontrada."
          emptyDescription="Quando houver problemas de cobrança na empresa ativa, eles aparecerão aqui para revisão."
        />
      </section>

      {phoneModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1b2e] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-700/60 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Editar telefone</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-50">{phoneModal.nome || 'Cliente'}</h3>
                <p className="mt-1 text-sm text-slate-500">Atualize o telefone para corrigir a inconsistência deste título.</p>
              </div>
              <button
                type="button"
                onClick={() => (phoneSaving ? null : setPhoneModal(null))}
                className="rounded-2xl border border-slate-700 bg-slate-900/60 p-2 text-slate-500 transition hover:bg-slate-800/40 hover:text-slate-50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 px-6 py-6">
              <FilterField label="Telefone">
                <input
                  type="text"
                  value={phoneValue}
                  onChange={(e) => setPhoneValue(e.target.value)}
                  placeholder="Somente numeros ou telefone formatado"
                  className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </FilterField>
              <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-300">
                O telefone será salvo no registro financeiro da empresa ativa respeitando o company_id atual.
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-700/60 px-6 py-4">
              <button
                type="button"
                onClick={() => setPhoneModal(null)}
                disabled={phoneSaving}
                className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={phoneSaving || !canEditRecords}
                onClick={async () => {
                  setPhoneSaving(true);
                  try {
                    await updateFinancialPhone(resolvedCompanyId, phoneModal.registro_id, phoneValue);
                    onToast?.('sucesso', 'Telefone atualizado com sucesso.');
                    setPhoneModal(null);
                    await loadInconsistencies(appliedFilters);
                  } catch (error) {
                    onToast?.('erro', error.message || 'Falha ao atualizar o telefone.');
                  } finally {
                    setPhoneSaving(false);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {phoneSaving ? <Loader2 size={15} className="animate-spin" /> : <Edit3 size={15} />}
                Salvar telefone
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
