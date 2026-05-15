import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  RefreshCcw,
  Search,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import DataTable from '../components/DataTable';
import {
  getBillingHistory,
  simulateChargeItem,
} from '../services/billingAutomationService';
import { canUserPerformAction } from '../security/permissions';
import { formatCurrencyBRL, formatDateBR, formatDateTimeBR } from '../utils/format';

function HistoryCard({ label, value, tone = 'slate' }) {
  const palette = {
    slate: 'from-slate-400 to-slate-500 text-slate-50',
    emerald: 'from-emerald-400 to-emerald-600 text-emerald-300',
    blue: 'from-blue-400 to-blue-600 text-blue-300',
    amber: 'from-amber-400 to-orange-400 text-amber-300',
    red: 'from-red-400 to-red-600 text-red-300',
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

function statusTone(status) {
  const normalized = String(status || 'pendente').toLowerCase();
  if (['sucesso', 'sucesso_simulado', 'simulado'].includes(normalized)) return 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25';
  if (normalized === 'erro') return 'bg-red-500/10 text-red-300 ring-red-500/25';
  if (normalized === 'ignorado') return 'bg-amber-500/10 text-amber-300 ring-amber-500/25';
  return 'bg-slate-800/40 text-slate-300 ring-slate-700/60';
}

function getPayloadMessage(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return payload.message || payload.mensagem || payload.caption || payload.generated_message || payload.mensagem_gerada || '';
}

function toCsvValue(value) {
  const safe = String(value ?? '').replace(/"/g, '""');
  return `"${safe}"`;
}

export default function HistoricoCobrancaScreen({
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
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [runningAction, setRunningAction] = useState('');
  const [cards, setCards] = useState({
    simulacoes_hoje: 0,
    simulacoes_ultimos_7_dias: 0,
    sucesso: 0,
    erros: 0,
    com_boleto: 0,
    sem_boleto: 0,
    pendentes: 0,
    resolvidos: 0,
  });
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: 50, total: 0 });
  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    cliente: '',
    numero_boleto: '',
    tipo_cobranca: '',
    status_envio: '',
    arquivo_encontrado: '',
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [detailsRow, setDetailsRow] = useState(null);

  const loadHistory = useCallback(
    async (page = 1, currentFilters = appliedFilters) => {
      if (!resolvedCompanyId || globalMode) {
        setItems([]);
        setCards({
          simulacoes_hoje: 0,
          simulacoes_ultimos_7_dias: 0,
          sucesso: 0,
          erros: 0,
          com_boleto: 0,
          sem_boleto: 0,
          pendentes: 0,
          resolvidos: 0,
        });
        setPagination({ page: 1, page_size: 50, total: 0 });
        return;
      }

      setLoading(true);
      try {
        const response = await getBillingHistory(resolvedCompanyId, currentFilters, {
          page,
          page_size: 50,
        });
        setCards(response?.cards || {});
        setItems(Array.isArray(response?.items) ? response.items : []);
        setPagination(response?.pagination || { page, page_size: 50, total: 0 });
      } catch (error) {
        setItems([]);
        onToast?.('erro', error.message || 'Falha ao carregar o historico de cobrancas.');
      } finally {
        setLoading(false);
      }
    },
    [appliedFilters, globalMode, onToast, resolvedCompanyId]
  );

  useEffect(() => {
    loadHistory(1, appliedFilters);
  }, [loadHistory, appliedFilters]);

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters(filters);
  }, [filters]);

  const handleClearFilters = useCallback(() => {
    const empty = {
      date_from: '',
      date_to: '',
      cliente: '',
      numero_boleto: '',
      tipo_cobranca: '',
      status_envio: '',
      arquivo_encontrado: '',
    };
    setFilters(empty);
    setAppliedFilters(empty);
  }, []);

  const handleExportCsv = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      onToast?.('erro', 'Selecione uma empresa especifica para exportar o historico.');
      return;
    }

    setExporting(true);
    try {
      const response = await getBillingHistory(resolvedCompanyId, appliedFilters, {
        page: 1,
        page_size: Math.max(200, pagination.total || 200),
      });
      const exportRows = Array.isArray(response?.items) ? response.items : [];
      const header = 'DataHora;Cliente;Telefone;Documento;NumeroBoleto;NumeroNF;Valor;Vencimento;TipoCobranca;DiasAtraso;ArquivoEncontrado;StatusEnvio;Erro';
      const lines = exportRows.map((row) =>
        [
          toCsvValue(row.data_hora ? formatDateTimeBR(row.data_hora) : ''),
          toCsvValue(row.cliente_nome || ''),
          toCsvValue(row.telefone || ''),
          toCsvValue(row.documento || ''),
          toCsvValue(row.numero_boleto || ''),
          toCsvValue(row.numero_nf || ''),
          toCsvValue(formatCurrencyBRL(row.valor || 0)),
          toCsvValue(row.vencimento ? formatDateBR(row.vencimento) : ''),
          toCsvValue(row.tipo_cobranca || ''),
          toCsvValue(row.dias_atraso || 0),
          toCsvValue(row.arquivo_encontrado ? 'Sim' : 'Não'),
          toCsvValue(row.status_envio || 'pendente'),
          toCsvValue(row.erro || ''),
        ].join(';')
      );

      const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'historico_cobrancas_bankextract.csv';
      anchor.click();
      URL.revokeObjectURL(url);
      onToast?.('sucesso', 'Historico exportado com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao exportar o historico.');
    } finally {
      setExporting(false);
    }
  }, [appliedFilters, globalMode, onToast, pagination.total, resolvedCompanyId]);

  const handleRepeatSimulation = useCallback(async (row) => {
    if (!row?.financeiro_id) {
      onToast?.('aviso', 'Este log nao possui titulo financeiro vinculado para repetir a simulacao.');
      return;
    }
    if (!canManageCharges) {
      onToast?.('erro', 'Seu perfil atual nao pode repetir simulacoes de cobranca.');
      return;
    }

    setRunningAction(`simulate-${row.id}`);
    try {
      const result = await simulateChargeItem(resolvedCompanyId, row.financeiro_id);
      onToast?.('sucesso', result?.message || 'Simulacao repetida com sucesso.');
      await loadHistory(pagination.page, appliedFilters);
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao repetir a simulacao.');
    } finally {
      setRunningAction('');
    }
  }, [appliedFilters, canManageCharges, loadHistory, onToast, pagination.page, resolvedCompanyId]);

  const handleOpenBoleto = useCallback((row) => {
    if (!row?.drive_file_id) {
      onToast?.('aviso', 'Nenhum boleto vinculado a este log.');
      return;
    }
    window.open(`https://drive.google.com/file/d/${row.drive_file_id}/view`, '_blank', 'noopener,noreferrer');
  }, [onToast]);

  const handleExportRow = useCallback((row) => {
    const header = 'DataHora;Cliente;Telefone;Documento;NumeroBoleto;NumeroNF;Valor;Vencimento;TipoCobranca;DiasAtraso;ArquivoEncontrado;StatusEnvio;Erro';
    const line = [
      toCsvValue(row.data_hora ? formatDateTimeBR(row.data_hora) : ''),
      toCsvValue(row.cliente_nome || ''),
      toCsvValue(row.telefone || ''),
      toCsvValue(row.documento || ''),
      toCsvValue(row.numero_boleto || ''),
      toCsvValue(row.numero_nf || ''),
      toCsvValue(formatCurrencyBRL(row.valor || 0)),
      toCsvValue(row.vencimento ? formatDateBR(row.vencimento) : ''),
      toCsvValue(row.tipo_cobranca || ''),
      toCsvValue(row.dias_atraso || 0),
      toCsvValue(row.arquivo_encontrado ? 'Sim' : 'Não'),
      toCsvValue(row.status_envio || 'pendente'),
      toCsvValue(row.erro || ''),
    ].join(';');
    const blob = new Blob([[header, line].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `historico_cobranca_${row.id || 'linha'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const columns = useMemo(() => [
    {
      key: 'data_hora',
      label: 'Data/hora',
      render: (row) => row.data_hora ? formatDateTimeBR(row.data_hora) : '-',
    },
    {
      key: 'cliente_nome',
      label: 'Cliente',
      render: (row) => <span className="font-medium text-slate-50">{row.cliente_nome || '-'}</span>,
    },
    {
      key: 'documento',
      label: 'Documento',
      render: (row) => row.documento || '-',
    },
    {
      key: 'numero_boleto',
      label: 'Boleto',
      render: (row) => row.numero_boleto || '-',
    },
    {
      key: 'valor',
      label: 'Valor',
      render: (row) => <span className="font-mono tabular-nums font-semibold text-slate-50">{formatCurrencyBRL(row.valor || 0)}</span>,
    },
    {
      key: 'tipo_cobranca',
      label: 'Tipo cobranca',
      render: (row) => row.tipo_cobranca || '-',
    },
    {
      key: 'dias_atraso',
      label: 'Dias atraso',
      render: (row) => row.dias_atraso || 0,
    },
    {
      key: 'arquivo_encontrado',
      label: 'Arquivo encontrado',
      render: (row) => row.arquivo_encontrado ? 'Sim' : 'Não',
    },
    {
      key: 'status_envio',
      label: 'Status envio',
      render: (row) => (
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusTone(row.status_envio)}`}>
          {row.status_envio || 'pendente'}
        </span>
      ),
    },
    {
      key: 'erro',
      label: 'Erro',
      render: (row) => row.erro || '-',
    },
    {
      key: 'actions',
      label: 'Acoes',
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDetailsRow(row)}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800/40"
          >
            <Search size={12} />
            Ver mensagem/payload
          </button>
          <button
            type="button"
            disabled={!canManageCharges || Boolean(runningAction)}
            onClick={() => handleRepeatSimulation(row)}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
          >
            {runningAction === `simulate-${row.id}` ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Repetir simulacao
          </button>
          <button
            type="button"
            onClick={() => handleOpenBoleto(row)}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800/40"
          >
            <ExternalLink size={12} />
            Abrir boleto
          </button>
          <button
            type="button"
            onClick={() => handleExportRow(row)}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800/40"
          >
            <FileSpreadsheet size={12} />
            Exportar linha CSV
          </button>
        </div>
      ),
    },
  ], [canManageCharges, handleExportRow, handleOpenBoleto, handleRepeatSimulation, runningAction]);

  const payloadMessage = getPayloadMessage(detailsRow?.payload);
  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.page_size || 50)));

  if (globalMode || !resolvedCompanyId) {
    return (
      <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-6 text-sm text-amber-300">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5" size={18} />
          <div>
            <p className="font-semibold">Selecione uma empresa especifica</p>
            <p className="mt-1 text-xs text-amber-400">
              O historico de cobrancas trabalha por empresa para manter isolamento por company_id.
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
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.10em] text-blue-300">
              <FileSpreadsheet size={13} />
              Historico de cobrancas
            </div>
            <h3 className="mt-4 text-2xl font-semibold text-slate-50">Auditoria operacional da regua</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              Visao completa das simulacoes e eventos registrados para a empresa <span className="font-semibold text-slate-50">{companyName}</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loadHistory(pagination.page, appliedFilters)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-soft transition hover:bg-slate-800/40 disabled:opacity-50"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
              Atualizar historico
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800 disabled:opacity-50"
            >
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
              Exportar historico CSV
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <HistoryCard label="Simulacoes hoje" value={cards.simulacoes_hoje || 0} tone="blue" />
        <HistoryCard label="Simulacoes 7 dias" value={cards.simulacoes_ultimos_7_dias || 0} tone="emerald" />
        <HistoryCard label="Sucesso" value={cards.sucesso || 0} tone="emerald" />
        <HistoryCard label="Erros" value={cards.erros || 0} tone="red" />
        <HistoryCard label="Com boleto" value={cards.com_boleto || 0} tone="blue" />
        <HistoryCard label="Sem boleto" value={cards.sem_boleto || 0} tone="amber" />
        <HistoryCard label="Pendentes" value={cards.pendentes || 0} tone="amber" />
        <HistoryCard label="Resolvidos" value={cards.resolvidos || 0} tone="slate" />
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 shadow-card">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FilterField label="Data inicial">
            <input type="date" value={filters.date_from} onChange={(e) => setFilters((prev) => ({ ...prev, date_from: e.target.value }))} className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500" />
          </FilterField>
          <FilterField label="Data final">
            <input type="date" value={filters.date_to} onChange={(e) => setFilters((prev) => ({ ...prev, date_to: e.target.value }))} className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500" />
          </FilterField>
          <FilterField label="Cliente">
            <input type="text" value={filters.cliente} onChange={(e) => setFilters((prev) => ({ ...prev, cliente: e.target.value }))} placeholder="Nome do cliente" className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500" />
          </FilterField>
          <FilterField label="Numero boleto">
            <input type="text" value={filters.numero_boleto} onChange={(e) => setFilters((prev) => ({ ...prev, numero_boleto: e.target.value }))} placeholder="Ex: 3001-2" className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500" />
          </FilterField>
          <FilterField label="Tipo cobranca">
            <select value={filters.tipo_cobranca} onChange={(e) => setFilters((prev) => ({ ...prev, tipo_cobranca: e.target.value }))} className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">Todos</option>
              <option value="preventiva">Preventiva</option>
              <option value="vencimento">Vencimento</option>
              <option value="atraso">Atraso</option>
            </select>
          </FilterField>
          <FilterField label="Status envio">
            <select value={filters.status_envio} onChange={(e) => setFilters((prev) => ({ ...prev, status_envio: e.target.value }))} className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">Todos</option>
              <option value="sucesso">Sucesso</option>
              <option value="sucesso_simulado">Sucesso simulado</option>
              <option value="simulado">Simulado</option>
              <option value="erro">Erro</option>
              <option value="ignorado">Ignorado</option>
            </select>
          </FilterField>
          <FilterField label="Boleto encontrado">
            <select value={filters.arquivo_encontrado} onChange={(e) => setFilters((prev) => ({ ...prev, arquivo_encontrado: e.target.value }))} className="input-premium w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">Todos</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </FilterField>
          <div className="flex items-end gap-2">
            <button type="button" onClick={handleApplyFilters} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600">
              <Search size={15} />
              Aplicar filtros
            </button>
            <button type="button" onClick={handleClearFilters} className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/40">
              Limpar
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 shadow-card">
        <DataTable
          columns={columns}
          rows={items}
          emptyTitle="Nenhum log de cobranca encontrado."
          emptyDescription="Assim que houver simulacoes ou eventos registrados, eles aparecerao aqui para auditoria."
        />
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-700/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Mostrando {items.length} de {pagination.total || 0} registros filtrados.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || pagination.page <= 1}
              onClick={() => loadHistory(Math.max(1, pagination.page - 1), appliedFilters)}
              className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Pagina {pagination.page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={loading || pagination.page >= totalPages}
              onClick={() => loadHistory(pagination.page + 1, appliedFilters)}
              className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
            >
              Proxima
            </button>
          </div>
        </div>
      </section>

      {detailsRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1b2e] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-700/60 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Detalhes do log</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-50">{detailsRow.cliente_nome || 'Cliente'}</h3>
                <p className="mt-1 text-sm text-slate-500">Simulacao e payload registrados para auditoria operacional.</p>
              </div>
              <button type="button" onClick={() => setDetailsRow(null)} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-2 text-slate-500 transition hover:bg-slate-800/40 hover:text-slate-50">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.1fr_1.2fr]">
              <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-800/40 p-5">
                {[
                  ['Cliente', detailsRow.cliente_nome || '-'],
                  ['Telefone', detailsRow.telefone || '-'],
                  ['Documento', detailsRow.documento || '-'],
                  ['Numero boleto', detailsRow.numero_boleto || '-'],
                  ['Numero NF', detailsRow.numero_nf || '-'],
                  ['Valor', formatCurrencyBRL(detailsRow.valor || 0)],
                  ['Vencimento', detailsRow.vencimento ? formatDateBR(detailsRow.vencimento) : '-'],
                  ['Tipo cobranca', detailsRow.tipo_cobranca || '-'],
                  ['Dias atraso', detailsRow.dias_atraso || 0],
                  ['Status envio', detailsRow.status_envio || 'pendente'],
                  ['Arquivo encontrado', detailsRow.arquivo_encontrado ? 'Sim' : 'Não'],
                  ['Erro', detailsRow.erro || '-'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-700/40 pb-2 text-sm last:border-b-0 last:pb-0">
                    <span className="font-medium text-slate-500">{label}</span>
                    <span className="text-right font-semibold text-slate-50">{value}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                {payloadMessage ? (
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-emerald-400">Mensagem gerada</p>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-emerald-200">{payloadMessage}</pre>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-5 text-sm text-amber-300">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="mt-0.5" />
                      <div>
                        <p className="font-semibold">Payload sem mensagem destacada</p>
                        <p className="mt-1 text-xs text-amber-400">Este log nao possui mensagem gerada no payload. Veja o JSON completo abaixo.</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Payload formatado</p>
                  <pre className="mt-3 max-h-[360px] overflow-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                    {detailsRow.payload ? JSON.stringify(detailsRow.payload, null, 2) : 'Nenhum payload registrado para este log.'}
                  </pre>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-700/60 px-6 py-4">
              <button
                type="button"
                onClick={async () => {
                  if (!payloadMessage) {
                    onToast?.('aviso', 'Este log nao possui mensagem para copiar.');
                    return;
                  }
                  try {
                    await navigator.clipboard.writeText(payloadMessage);
                    onToast?.('sucesso', 'Mensagem copiada com sucesso.');
                  } catch {
                    onToast?.('erro', 'Nao foi possivel copiar a mensagem.');
                  }
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/40"
              >
                <Copy size={15} />
                Copiar mensagem
              </button>
              <button
                type="button"
                onClick={() => setDetailsRow(null)}
                className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
