import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { financeService, tenantContext } from '../services/financeService';
import { GLOBAL_COMPANY_ID } from '../services/companyService';
import { useAutoGoogleSheetsSync } from './useAutoGoogleSheetsSync';
import { sendWhatsAppCharges as zapiSendCharges } from '../services/whatsappService';
import { auditLog } from '../services/auditService';
import {
  detectProblems,
  filterRows,
  parseBankReport,
  recalculateRows,
  sortRows
} from '../utils/calculations';

const historyDate = () => new Date().toISOString();

const makeUuid = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const sanitizeSpreadsheetCell = (value) => {
  if (value === null || typeof value === 'undefined') return '';
  const raw = String(value);
  return /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
};

const normalizeRecord = (row, companyId, userId) => ({
  company_id: companyId,
  user_id: userId,
  telefone: '',
  observacao: '',
  status: 'pendente',
  representanteId: null,
  ...row
});

// ---------------------------------------------------------------------------
// Gerador de mensagem padrão de cobrança WhatsApp
// ---------------------------------------------------------------------------
function generateWhatsAppMessage(row, empresaNome) {
  const today   = new Date();
  const venc    = new Date((row.dataVencimento || '') + 'T00:00:00');
  const diffMs  = today - venc;
  const diasAtraso = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;

  const fmtBRL  = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d) => {
    if (!d) return '';
    const parts = d.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
  };

  const empresa = empresaNome || 'nossa empresa';

  return [
    `Olá, ${row.nome || 'Cliente'}!`,
    '',
    `Aqui é do setor de cobrança da ${empresa}.`,
    'Estou entrando em contato para confirmar o pagamento do título abaixo:',
    '',
    `Documento: ${row.numeroBoleto || 'N/A'}`,
    `Vencimento: ${fmtDate(row.dataVencimento)}`,
    `Valor original: ${fmtBRL(row.valor)}`,
    `Valor atualizado: ${fmtBRL(row.valorAtualizado)}`,
    `Dias em atraso: ${diasAtraso}`,
    '',
    'Informamos que, após 5 dias do vencimento, o título pode estar sujeito a protesto e encargos adicionais.',
    '',
    'Aguardamos seu retorno.',
    'Caso já tenha efetuado o pagamento, desconsidere esta mensagem.',
  ].join('\n');
}

export const useFinance = ({
  authUserId = null,
  activeCompanyId = '',
  activeCompany = null,
  companies = [],
  isSystemAdmin = false,
  enabled = true
}) => {
  const { currentUserId: tenantUserId } = tenantContext;
  const currentUserId = authUserId || tenantUserId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(null);

  const [activeTab, setActiveTab] = useState('importacao');
  const [importType, setImportType] = useState('vencidos');

  const [records, setRecords] = useState([]);
  const [representatives, setRepresentatives] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeConfig, setActiveConfig] = useState({
    company_id: activeCompanyId,
    user_id: currentUserId,
    multaPercentual: 2,
    jurosPercentualDia: 0.033
  });

  const [processingFiles, setProcessingFiles] = useState([]);
  const [pastedText, setPastedText] = useState('');

  const [preview, setPreview] = useState(null);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewFilter, setPreviewFilter] = useState('todos');
  const [editingPreviewCell, setEditingPreviewCell] = useState(null);
  const [editingPreviewValue, setEditingPreviewValue] = useState('');

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState({ campo: 'dataVencimento', direcao: 'asc' });
  const [page, setPage] = useState(1);
  const [selectedHistoryRows, setSelectedHistoryRows] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);

  const [openRepresentativeDropdown, setOpenRepresentativeDropdown] = useState(null);
  const [representativeSearch, setRepresentativeSearch] = useState('');
  const [representativeModal, setRepresentativeModal] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [whatsappModal, setWhatsappModal] = useState(null); // { records, messages, sending, results }
  const [clearOverviewModalOpen, setClearOverviewModalOpen] = useState(false);
  const [clearingOverview, setClearingOverview] = useState(false);

  const inputTimeoutRef = useRef(null);
  const isGlobalView = isSystemAdmin && activeCompanyId === GLOBAL_COMPANY_ID;

  // ── Sincronização automática com Google Sheets ─────────────────────────
  const {
    syncStatus,
    syncMessage: googleSyncMessage,
    triggerSync,
    invalidateConfigCache,
  } = useAutoGoogleSheetsSync({
    activeCompanyId,
    isGlobalView,
    enabled: enabled && Boolean(activeCompanyId),
  });

  const showMessage = useCallback((tipo, texto) => {
    setMessage({ tipo, texto });
    window.clearTimeout(inputTimeoutRef.current);
    inputTimeoutRef.current = window.setTimeout(() => setMessage(null), 3500);
  }, []);

  const clearCompanyScopedState = useCallback(() => {
    setRecords([]);
    setRepresentatives([]);
    setHistory([]);
    setActiveConfig({
      company_id: activeCompanyId,
      user_id: currentUserId,
      multaPercentual: 2,
      jurosPercentualDia: 0.033
    });
    setPreview(null);
    setProcessingFiles([]);
    setPastedText('');
    setRepresentativeModal(null);
  }, [activeCompanyId, currentUserId]);

  const ensureActiveCompany = useCallback(() => {
    if (!activeCompanyId) {
      showMessage('erro', 'Selecione uma empresa ativa antes de continuar.');
      return false;
    }

    return true;
  }, [activeCompanyId, showMessage]);

  const ensureSpecificCompany = useCallback((messageText) => {
    if (!activeCompanyId) {
      showMessage('erro', 'Selecione uma empresa ativa antes de continuar.');
      return false;
    }

    if (isGlobalView) {
      showMessage('erro', messageText || 'Selecione uma empresa especifica antes de continuar.');
      return false;
    }

    return true;
  }, [activeCompanyId, isGlobalView, showMessage]);

  const loadCompanyData = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (!activeCompanyId) {
      clearCompanyScopedState();
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    clearCompanyScopedState();

    try {
      const data = await financeService.fetchCompanyDataset({
        companyId: activeCompanyId,
        userId: currentUserId
      });

      setRecords(data.records.map((row) => normalizeRecord(row, activeCompanyId, currentUserId)));
      setRepresentatives(data.representatives);
      setHistory(data.history);
      setActiveConfig(
        data.config || {
          company_id: activeCompanyId,
          user_id: currentUserId,
          multaPercentual: 2,
          jurosPercentualDia: 0.033
        }
      );
    } catch (err) {
      setError(err.message || 'Nao foi possivel carregar os dados da empresa ativa.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, clearCompanyScopedState, currentUserId, enabled]);

  useEffect(() => {
    loadCompanyData();
    return () => window.clearTimeout(inputTimeoutRef.current);
  }, [loadCompanyData]);

  useEffect(() => {
    setSelectedRows(new Set());
    setSelectedHistoryRows(new Set());
    setPage(1);
    setFilters({});
    setSearch('');
    setEditingCell(null);
    setOpenRepresentativeDropdown(null);
    setOpenFilterDropdown(null);
  }, [activeCompanyId]);

  useEffect(() => {
    const closeHandler = (event) => {
      if (openRepresentativeDropdown && !event.target.closest('[data-representante-dropdown]')) {
        setOpenRepresentativeDropdown(null);
        setRepresentativeSearch('');
      }
      if (openFilterDropdown && !event.target.closest('[data-filter-dropdown]')) {
        setOpenFilterDropdown(null);
      }
    };

    document.addEventListener('mousedown', closeHandler);
    return () => document.removeEventListener('mousedown', closeHandler);
  }, [openFilterDropdown, openRepresentativeDropdown]);

  const computedConfig = useMemo(
    () => activeConfig || {
      company_id: activeCompanyId,
      user_id: currentUserId,
      multaPercentual: 2,
      jurosPercentualDia: 0.033
    },
    [activeCompanyId, activeConfig, currentUserId]
  );

  const activeRecords = useMemo(
    () => recalculateRows(records, computedConfig),
    [computedConfig, records]
  );

  const activeRepresentatives = useMemo(
    () => representatives,
    [representatives]
  );

  const companyHistory = useMemo(
    () => history,
    [history]
  );

  const historyRowsByScope = useMemo(() => {
    if (!activeCompanyId) return [];
    if (isGlobalView) return companyHistory;
    return companyHistory.filter((item) => item.company_id === activeCompanyId);
  }, [activeCompanyId, companyHistory, isGlobalView]);

  const updateConfig = useCallback(async (payload) => {
    if (!ensureSpecificCompany('Selecione uma empresa especifica para alterar juros e multa.')) return;

    const nextConfig = {
      ...computedConfig,
      ...payload,
      company_id: activeCompanyId,
      user_id: currentUserId
    };

    setActiveConfig(nextConfig);

    try {
      await financeService.updateConfiguracao(nextConfig, {
        companyId: activeCompanyId,
        userId: currentUserId
      });
      triggerSync('updateConfig');
    } catch (err) {
      setError(err.message || 'Falha ao salvar configuracao.');
    }
  }, [activeCompanyId, computedConfig, currentUserId, ensureSpecificCompany, triggerSync]);

  const processFile = useCallback(async (file) => {
    if (!ensureSpecificCompany('Selecione uma empresa especifica antes de importar dados.')) return;

    const processId = makeUuid();
    setProcessingFiles((prev) => [...prev, { id: processId, nome: file.name, progresso: 0, status: 'lendo' }]);

    try {
      for (let progress = 0; progress <= 100; progress += 20) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setProcessingFiles((prev) =>
          prev.map((item) =>
            item.id === processId
              ? {
                  ...item,
                  progresso: progress,
                  status: progress < 50 ? 'lendo' : progress < 100 ? 'extraindo' : 'finalizado'
                }
              : item
          )
        );
      }

      let extractedText = '';
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        extractedText = await file.text();
      } else {
        extractedText = `Relatorio de Titulos por Periodo - SICOOB
Cooperativa: 3287 - Agencia: 4001 - Conta: 12345-6

Sacado                          Nosso Numero    Vencimento    Valor (R$)
DIOCLECIO XAVIER                2056-3          18/03/2026    1.755,77
VALERIA CORDEIRO DE SOUZA       2057-8          18/03/2026      771,40
MARCOS ANTONIO PEREIRA          2058-1          22/04/2026    2.340,50
NOVO CLIENTE TESTE LTDA         2064-1          20/05/2026    3.200,00
EMPRESA INOVADORA MEI           2065-8          25/05/2026    1.450,75
JOAO BATISTA SILVA              2066-2          10/06/2026    2.800,00
MARIA CLARA SANTOS              2067-7          15/06/2026      560,90
CONSTRUCOES ALVES LTDA          2068-3          22/06/2026    7.250,00
CARLOS EDUARDO PEREIRA          2064-1          25/06/2026    1.200,00
LUCAS RODRIGUES FERNANDES       2070-5          30/06/2026    3.450,00

Total Geral: 24.479,32`;
      }

      const parsed = parseBankReport(extractedText).map((row) => normalizeRecord(row, activeCompanyId, currentUserId));
      setProcessingFiles((prev) => prev.filter((item) => item.id !== processId));

      if (!parsed.length) {
        showMessage('erro', `Nao foi possivel extrair dados de "${file.name}".`);
        return;
      }

      const selected = new Set();
      parsed.forEach((row) => {
        const problems = detectProblems(row, activeRecords, parsed);
        const hasCritical = problems.some((item) => item.tipo === 'erro');
        if (!hasCritical) selected.add(row.id);
      });

      setPreview({
        origem: file.name,
        tipo: importType,
        registros: parsed,
        selecionados: selected,
        empresaDestino: activeCompanyId
      });
      setPreviewFilter('todos');
      setPreviewSearch('');
    } catch (err) {
      setProcessingFiles((prev) =>
        prev.map((item) => (item.id === processId ? { ...item, status: 'erro', erro: err.message } : item))
      );
      showMessage('erro', `Erro ao processar "${file.name}".`);
    }
  }, [activeCompanyId, activeRecords, currentUserId, ensureSpecificCompany, importType, showMessage]);

  const handleFiles = useCallback((files) => {
    Array.from(files || []).forEach((file) => {
      if (!file.name.match(/\.(pdf|png|jpg|jpeg|txt)$/i)) {
        showMessage('erro', `Tipo de arquivo invalido: ${file.name}`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showMessage('erro', `Arquivo muito grande: ${file.name} (max. 10MB)`);
        return;
      }
      processFile(file);
    });
  }, [processFile, showMessage]);

  const processPastedText = useCallback(() => {
    if (!ensureSpecificCompany('Selecione uma empresa especifica antes de importar dados.')) return;

    if (!pastedText.trim()) {
      showMessage('erro', 'Cole o texto do relatorio antes de processar.');
      return;
    }

    const parsed = parseBankReport(pastedText).map((row) => normalizeRecord(row, activeCompanyId, currentUserId));
    if (!parsed.length) {
      showMessage('erro', 'Nenhum registro identificado no texto.');
      return;
    }

    const selected = new Set();
    parsed.forEach((row) => {
      const problems = detectProblems(row, activeRecords, parsed);
      if (!problems.some((item) => item.tipo === 'erro')) selected.add(row.id);
    });

    setPreview({
      origem: 'Texto colado',
      tipo: importType,
      registros: parsed,
      selecionados: selected,
      empresaDestino: activeCompanyId
    });
    setPastedText('');
    setPreviewFilter('todos');
    setPreviewSearch('');
  }, [activeCompanyId, activeRecords, currentUserId, ensureSpecificCompany, importType, pastedText, showMessage]);

  const analyzedPreviewRows = useMemo(() => {
    if (!preview) return [];
    return preview.registros.map((row) => ({
      ...row,
      problemas: detectProblems(row, activeRecords, preview.registros)
    }));
  }, [activeRecords, preview]);

  const visiblePreviewRows = useMemo(
    () =>
      filterRows({
        rows: analyzedPreviewRows,
        search: previewSearch,
        previewMode: true,
        previewFilter
      }),
    [analyzedPreviewRows, previewFilter, previewSearch]
  );

  const previewStats = useMemo(() => {
    if (!preview) {
      return { total: 0, selecionados: 0, problemas: 0, duplicados: 0, valorSelecionado: 0 };
    }

    const withProblems = analyzedPreviewRows.filter((row) => row.problemas.length > 0).length;
    const duplicated = analyzedPreviewRows.filter((row) =>
      row.problemas.some((item) => item.msg.toLowerCase().includes('duplic'))
    ).length;
    const selectedTotal = preview.registros
      .filter((row) => preview.selecionados.has(row.id))
      .reduce((sum, row) => sum + Number(row.valor || 0), 0);

    return {
      total: preview.registros.length,
      selecionados: preview.selecionados.size,
      problemas: withProblems,
      duplicados: duplicated,
      valorSelecionado: selectedTotal
    };
  }, [analyzedPreviewRows, preview]);

  const confirmImport = useCallback(async () => {
    if (!ensureSpecificCompany('Selecione uma empresa especifica antes de importar dados.')) return;

    if (!preview || !preview.selecionados.size) {
      showMessage(
        'erro',
        preview?.tipo === 'liquidacao'
          ? 'Selecione ao menos um registro para liquidar.'
          : 'Selecione ao menos um registro para importar.'
      );
      return;
    }

    setSaving(true);
    try {
      const selectedPreviewRows = preview.registros.filter((row) => preview.selecionados.has(row.id));
      const invalidRows = selectedPreviewRows.filter((row) =>
        detectProblems(row, activeRecords, preview.registros).some((item) => item.tipo === 'erro')
      );

      if (invalidRows.length > 0) {
        const proceed = window.confirm(`${invalidRows.length} registro(s) selecionado(s) possuem erros criticos. Deseja seguir mesmo assim?`);
        if (!proceed) {
          setSaving(false);
          return;
        }
      }

      if (preview.tipo === 'liquidacao') {
        const rowsByBoleto = new Map(selectedPreviewRows.map((row) => [row.numeroBoleto, row]));
        const rowsToUpdate = activeRecords.filter((row) => row.numeroBoleto && rowsByBoleto.has(row.numeroBoleto));

        await financeService.confirmLiquidacaoManual(rowsToUpdate, {
          companyId: activeCompanyId,
          userId: currentUserId
        });

        setRecords((prev) =>
          prev.map((row) =>
            rowsByBoleto.has(row.numeroBoleto)
              ? {
                  ...row,
                  status: 'liquidado',
                  observacao: row.observacao || 'Liquidacao confirmada manualmente',
                  liquidadoEm: historyDate()
                }
              : row
          )
        );

        const historyEntry = {
          id: makeUuid(),
          company_id: activeCompanyId,
          user_id: currentUserId,
          batchId: makeUuid(),
          arquivo: preview.origem,
          data: historyDate(),
          registros: rowsToUpdate.length,
          status: 'liquidacao'
        };

        await financeService.appendImportacao(
          {
            ...historyEntry,
            tipo: 'liquidacao',
            status: 'concluida'
          },
          {
            companyId: activeCompanyId,
            userId: currentUserId
          }
        );

        setHistory((prev) => [historyEntry, ...prev]);
        showMessage('sucesso', `${rowsToUpdate.length} registro(s) baixado(s) manualmente.`);
        triggerSync('confirmLiquidacao');
      } else {
        const importTimestamp = historyDate();
        const batchId = makeUuid();
        const existingBoletos = new Set(activeRecords.map((row) => row.numeroBoleto));
        const historyEntry = {
          id: makeUuid(),
          company_id: activeCompanyId,
          user_id: currentUserId,
          batchId,
          arquivo: preview.origem,
          data: importTimestamp,
          status: 'vencidos'
        };
        const newRows = selectedPreviewRows
          .filter((row) => !row.numeroBoleto || !existingBoletos.has(row.numeroBoleto))
          .map((row) => ({
            ...row,
            id: makeUuid(),
            company_id: activeCompanyId,
            user_id: currentUserId,
            batchId,
            numeroBoleto: row.numeroBoleto || `SN-${Date.now()}`,
            importadoEm: importTimestamp
          }));

        await financeService.appendImportacao(
          {
            ...historyEntry,
            registros: newRows.length,
            tipo: 'vencidos',
            status: 'concluida'
          },
          {
            companyId: activeCompanyId,
            userId: currentUserId
          }
        );

        if (newRows.length) {
          await financeService.insertRegistros(newRows, {
            companyId: activeCompanyId,
            userId: currentUserId
          });
          setRecords((prev) => [...prev, ...newRows]);
        }

        setHistory((prev) => [
          {
            ...historyEntry,
            registros: newRows.length
          },
          ...prev
        ]);
        showMessage('sucesso', `${newRows.length} registro(s) enviado(s) para Visao Geral.`);
        triggerSync('confirmImportVencidos');
        auditLog.importConfirmed(activeCompanyId, { arquivo: preview?.arquivo || '', registros: newRows.length, tipo: preview?.tipo || 'vencidos' });
      }

      setPreview(null);
      setEditingPreviewCell(null);
      setActiveTab('visao');
    } catch (err) {
      setError(err.message || 'Nao foi possivel concluir a operacao.');
    } finally {
      setSaving(false);
    }
  }, [activeCompanyId, activeRecords, currentUserId, ensureSpecificCompany, preview, showMessage, triggerSync]);

  const filteredRows = useMemo(() => {
    const sorted = sortRows(activeRecords, sortBy, activeRepresentatives);
    return filterRows({
      rows: sorted,
      search,
      filters,
      representatives: activeRepresentatives
    });
  }, [activeRecords, activeRepresentatives, filters, search, sortBy]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredRows.length / 10)), [filteredRows.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedRows = useMemo(
    () => filteredRows.slice((page - 1) * 10, page * 10),
    [filteredRows, page]
  );

  const stats = useMemo(() => {
    const total = activeRecords.reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const today = new Date().toISOString().split('T')[0];
    const vencidos = activeRecords.filter((row) => row.dataVencimento < today).reduce((sum, row) => sum + row.valor, 0);
    const aVencer = activeRecords.filter((row) => row.dataVencimento >= today).reduce((sum, row) => sum + row.valor, 0);
    const semRepresentante = activeRecords.filter((row) => !row.representanteId).length;
    const emAberto = activeRecords
      .filter((row) => row.status !== 'liquidado')
      .reduce((sum, row) => sum + row.valorAtualizado, 0);
    const liquidado = activeRecords
      .filter((row) => row.status === 'liquidado')
      .reduce((sum, row) => sum + row.valorAtualizado, 0);
    const valorAtualizado = activeRecords.reduce((sum, row) => sum + row.valorAtualizado, 0);
    return {
      total,
      vencidos,
      aVencer,
      emAberto,
      liquidado,
      valorAtualizado,
      semRepresentante,
      qtdTotal: activeRecords.length,
      qtdRepresentantes: activeRepresentatives.length,
      totalEmpresas: companies.filter((company) => company.id !== GLOBAL_COMPANY_ID).length
    };
  }, [activeRecords, activeRepresentatives.length, companies]);

  const toggleSort = useCallback((campo) => {
    setSortBy((prev) =>
      prev.campo === campo
        ? { campo, direcao: prev.direcao === 'asc' ? 'desc' : 'asc' }
        : { campo, direcao: 'asc' }
    );
  }, []);

  const toggleFilter = useCallback((campo, valor) => {
    setFilters((prev) => {
      const currentValues = prev[campo] || [];
      const nextValues = currentValues.includes(valor)
        ? currentValues.filter((item) => item !== valor)
        : [...currentValues, valor];
      return { ...prev, [campo]: nextValues };
    });
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setSearch('');
    setPage(1);
  }, []);

  const startCellEdit = useCallback((id, campo, value) => {
    setEditingCell({ id, campo });
    setEditingValue(String(value ?? ''));
  }, []);

  const saveCellEdit = useCallback(async () => {
    if (!editingCell || !ensureActiveCompany()) return;
    const currentRow = activeRecords.find((row) => row.id === editingCell.id);
    const targetCompanyId = isGlobalView ? currentRow?.company_id : activeCompanyId;
    if (!targetCompanyId) return;

    const payload = {
      [editingCell.campo]:
        editingCell.campo === 'valor'
          ? parseFloat(editingValue) || 0
          : editingValue
    };

    if (editingCell.campo === 'status' && editingValue === 'liquidado') {
      showMessage('erro', 'Use o fluxo de Liquidacao para dar baixa manualmente.');
      return;
    }

    try {
      await financeService.updateRegistro(editingCell.id, payload, {
        companyId: targetCompanyId,
        userId: currentUserId
      });
      setRecords((prev) =>
        prev.map((row) => (row.id === editingCell.id ? { ...row, ...payload } : row))
      );
      auditLog.recordEdited(targetCompanyId, { id: editingCell.id, field: editingCell.campo, oldValue: currentRow?.[editingCell.campo], newValue: editingValue });
      setEditingCell(null);
      setEditingValue('');
      showMessage('sucesso', 'Celula atualizada.');
      triggerSync('saveCellEdit');
    } catch (err) {
      setError(err.message || 'Nao foi possivel atualizar a celula.');
    }
  }, [activeCompanyId, activeRecords, currentUserId, editingCell, editingValue, ensureActiveCompany, isGlobalView, showMessage, triggerSync]);

  const cancelCellEdit = useCallback(() => {
    setEditingCell(null);
    setEditingValue('');
  }, []);

  const toggleRowSelection = useCallback((id) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleHistorySelection = useCallback((id) => {
    setSelectedHistoryRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllHistoryRows = useCallback(() => {
    if (!historyRowsByScope.length) {
      setSelectedHistoryRows(new Set());
      return;
    }

    if (selectedHistoryRows.size === historyRowsByScope.length) {
      setSelectedHistoryRows(new Set());
      return;
    }

    setSelectedHistoryRows(new Set(historyRowsByScope.map((item) => item.id)));
  }, [historyRowsByScope, selectedHistoryRows.size]);

  const toggleAllPageRows = useCallback(() => {
    if (selectedRows.size === paginatedRows.length) {
      setSelectedRows(new Set());
      return;
    }
    setSelectedRows(new Set(paginatedRows.map((row) => row.id)));
  }, [paginatedRows, selectedRows.size]);

  const deleteSelectedRows = useCallback(async (idsOverride) => {
    if (!ensureActiveCompany()) return;

    const ids = idsOverride ? [...idsOverride] : [...selectedRows];
    if (!ids.length) return;
    const shouldDelete = window.confirm(`Excluir ${ids.length} registro(s)?`);
    if (!shouldDelete) return;

    try {
      if (isGlobalView) {
        const rowsByCompany = ids.reduce((accumulator, id) => {
          const row = activeRecords.find((item) => item.id === id);
          if (!row?.company_id) return accumulator;
          accumulator[row.company_id] = accumulator[row.company_id] || [];
          accumulator[row.company_id].push(id);
          return accumulator;
        }, {});

        await Promise.all(
          Object.entries(rowsByCompany).map(([companyId, groupedIds]) =>
            financeService.deleteRegistros(groupedIds, {
              companyId,
              userId: currentUserId
            })
          )
        );
      } else {
        await financeService.deleteRegistros(ids, {
          companyId: activeCompanyId,
          userId: currentUserId
        });
      }
      const idSet = new Set(ids);
      setRecords((prev) => prev.filter((row) => !idSet.has(row.id)));
      setSelectedRows((prev) => new Set([...prev].filter((id) => !idSet.has(id))));
      auditLog.recordsDeleted(activeCompanyId, { count: ids.length, ids });
      showMessage('sucesso', 'Registros excluidos.');
      triggerSync('deleteSelectedRows');
    } catch (err) {
      setError(err.message || 'Falha ao excluir registros.');
    }
  }, [activeCompanyId, activeRecords, currentUserId, ensureActiveCompany, isGlobalView, selectedRows, showMessage, triggerSync]);

  const deleteSelectedHistory = useCallback(async (idsOverride) => {
    if (!ensureActiveCompany()) return;

    const ids = idsOverride ? [...idsOverride] : [...selectedHistoryRows];
    if (!ids.length) return;

    const shouldDelete = window.confirm('Tem certeza que deseja excluir os itens selecionados do historico? Esta acao nao pode ser desfeita.');
    if (!shouldDelete) return;

    try {
      await financeService.deleteImportacoes(
        ids,
        activeCompany,
        isSystemAdmin,
        {
          companyId: activeCompanyId,
          userId: currentUserId
        }
      );

      await loadCompanyData();
      setSelectedHistoryRows(new Set());
      auditLog.historyDeleted(activeCompanyId, { count: ids.length, ids });
      showMessage('sucesso', 'Itens do historico excluidos.');
      triggerSync('deleteSelectedHistory');
    } catch (err) {
      setError(err.message || 'Falha ao excluir itens do historico.');
    }
  }, [activeCompany, activeCompanyId, currentUserId, ensureActiveCompany, isSystemAdmin, loadCompanyData, selectedHistoryRows, showMessage, triggerSync]);

  const openClearOverviewModal = useCallback(() => {
    if (!ensureSpecificCompany('Selecione uma empresa especifica para limpar a visao geral.')) return;
    setClearOverviewModalOpen(true);
  }, [ensureSpecificCompany]);

  const closeClearOverviewModal = useCallback(() => {
    if (clearingOverview) return;
    setClearOverviewModalOpen(false);
  }, [clearingOverview]);

  const confirmClearOverview = useCallback(async () => {
    if (!ensureSpecificCompany('Selecione uma empresa especifica para limpar a visao geral.')) return;

    setClearingOverview(true);
    try {
      await financeService.clearOverview(activeCompanyId, {
        companyId: activeCompanyId,
        userId: currentUserId,
      });

      await loadCompanyData();
      setSelectedRows(new Set());
      setSelectedHistoryRows(new Set());
      setPage(1);
      setFilters({});
      setSearch('');
      setEditingCell(null);
      setEditingValue('');
      setOpenFilterDropdown(null);
      setOpenRepresentativeDropdown(null);
      setRepresentativeSearch('');
      setClearOverviewModalOpen(false);
      window.dispatchEvent(new CustomEvent('bankextract:dashboard-refresh'));
      auditLog.viewCleared(activeCompanyId, { count: activeRecords.length });
      showMessage('sucesso', 'Visao geral limpa com sucesso.');
      triggerSync('clearOverview');
    } catch (err) {
      setError(err.message || 'Nao foi possivel limpar a visao geral.');
      showMessage('erro', 'Nao foi possivel limpar a visao geral.');
    } finally {
      setClearingOverview(false);
    }
  }, [activeCompanyId, currentUserId, ensureSpecificCompany, loadCompanyData, showMessage, triggerSync]);

  const assignRepresentative = useCallback(async (rowId, representativeId) => {
    if (!ensureSpecificCompany('Selecione uma empresa especifica para cadastrar representantes.')) return;

    const selectedRepresentative = activeRepresentatives.find((item) => item.id === representativeId);
    try {
      await financeService.updateRegistro(
        rowId,
        {
          representanteId: representativeId,
          telefone: selectedRepresentative?.telefone || ''
        },
        {
          companyId: activeCompanyId,
          userId: currentUserId
        }
      );
      setRecords((prev) =>
        prev.map((row) =>
          row.id === rowId
            ? {
                ...row,
                representanteId: representativeId,
                telefone: selectedRepresentative?.telefone || row.telefone || ''
              }
            : row
        )
      );
      setOpenRepresentativeDropdown(null);
      setRepresentativeSearch('');
      triggerSync('assignRepresentative');
    } catch (err) {
      setError(err.message || 'Falha ao atribuir representante.');
    }
  }, [activeCompanyId, activeRepresentatives, currentUserId, ensureSpecificCompany, triggerSync]);

  const openNewRepresentativeModal = useCallback((rowId) => {
    if (!ensureSpecificCompany('Selecione uma empresa especifica para cadastrar representantes.')) return;
    setRepresentativeModal({
      linhaId: rowId,
      modo: 'novo',
      rep: {
        nome: '',
        telefone: '',
        email: '',
        observacao: '',
        ativo: true
      }
    });
    setOpenRepresentativeDropdown(null);
  }, [ensureSpecificCompany]);

  const openEditRepresentativeModal = useCallback((representative) => {
    if (!ensureSpecificCompany('Selecione uma empresa especifica para cadastrar representantes.')) return;
    setRepresentativeModal({
      linhaId: null,
      modo: 'editar',
      rep: { ...representative }
    });
    setOpenRepresentativeDropdown(null);
  }, [ensureSpecificCompany]);

  const saveRepresentative = useCallback(async () => {
    if (!representativeModal || !ensureSpecificCompany('Selecione uma empresa especifica para cadastrar representantes.')) return;
    const rep = representativeModal.rep;

    if (!rep.nome || rep.nome.trim().length < 2) {
      showMessage('erro', 'Nome do representante e obrigatorio.');
      return;
    }

    if (rep.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rep.email)) {
      showMessage('erro', 'E-mail invalido.');
      return;
    }

    const representativeId = representativeModal.modo === 'novo' ? makeUuid() : rep.id;
    const payload = {
      ...rep,
      id: representativeId,
      company_id: activeCompanyId,
      user_id: currentUserId,
      nome: rep.nome.trim()
    };

    try {
      await financeService.upsertRepresentante(payload, {
        companyId: activeCompanyId,
        userId: currentUserId
      });
      setRepresentatives((prev) => {
        const hasCurrent = prev.some((item) => item.id === representativeId);
        return hasCurrent
          ? prev.map((item) => (item.id === representativeId ? payload : item))
          : [...prev, payload];
      });

      if (representativeModal.modo === 'novo' && representativeModal.linhaId) {
        await assignRepresentative(representativeModal.linhaId, representativeId);
      }

      setRepresentativeModal(null);
      showMessage('sucesso', representativeModal.modo === 'novo' ? 'Representante cadastrado.' : 'Representante atualizado.');
    } catch (err) {
      setError(err.message || 'Falha ao salvar representante.');
    }
  }, [activeCompanyId, assignRepresentative, currentUserId, ensureSpecificCompany, representativeModal, showMessage]);

  const deleteRepresentative = useCallback(async (representativeId) => {
    if (!ensureSpecificCompany('Selecione uma empresa especifica para cadastrar representantes.')) return;

    const shouldDelete = window.confirm('Excluir este representante? Ele sera removido das linhas atribuidas.');
    if (!shouldDelete) return;
    try {
      await financeService.deleteRepresentante(representativeId, {
        companyId: activeCompanyId,
        userId: currentUserId
      });
      setRepresentatives((prev) => prev.filter((item) => item.id !== representativeId));
      setRecords((prev) =>
        prev.map((row) => (row.representanteId === representativeId ? { ...row, representanteId: null } : row))
      );
      setRepresentativeModal(null);
      showMessage('sucesso', 'Representante excluido.');
    } catch (err) {
      setError(err.message || 'Falha ao excluir representante.');
    }
  }, [activeCompanyId, currentUserId, ensureSpecificCompany, showMessage]);

  const exportRows = useCallback((kind) => {
    const header = kind === 'csv'
      ? 'Nome;NumeroBoleto;DataVencimento;Valor;Juros;Multa;ValorAtualizado;Telefone;Observacao;Representante;Status'
      : 'Nome\tNumero do Boleto\tVencimento\tValor\tJuros\tMulta\tValor Atualizado\tTelefone\tObservacao\tRepresentante\tStatus';

    const body = filteredRows.map((row) => {
      const rep = activeRepresentatives.find((item) => item.id === row.representanteId);
      if (kind === 'csv') {
        return [
          sanitizeSpreadsheetCell(row.nome),
          sanitizeSpreadsheetCell(row.numeroBoleto),
          sanitizeSpreadsheetCell(row.dataVencimento),
          sanitizeSpreadsheetCell(row.valor.toFixed(2)),
          sanitizeSpreadsheetCell(row.juros.toFixed(2)),
          sanitizeSpreadsheetCell(row.multa.toFixed(2)),
          sanitizeSpreadsheetCell(row.valorAtualizado.toFixed(2)),
          sanitizeSpreadsheetCell(row.telefone || ''),
          sanitizeSpreadsheetCell(row.observacao || ''),
          sanitizeSpreadsheetCell(rep?.nome || ''),
          sanitizeSpreadsheetCell(row.status)
        ].join(';');
      }

      return [
        sanitizeSpreadsheetCell(row.nome),
        sanitizeSpreadsheetCell(row.numeroBoleto),
        sanitizeSpreadsheetCell(row.dataVencimento),
        sanitizeSpreadsheetCell(row.valor.toFixed(2).replace('.', ',')),
        sanitizeSpreadsheetCell(row.juros.toFixed(2).replace('.', ',')),
        sanitizeSpreadsheetCell(row.multa.toFixed(2).replace('.', ',')),
        sanitizeSpreadsheetCell(row.valorAtualizado.toFixed(2).replace('.', ',')),
        sanitizeSpreadsheetCell(row.telefone || ''),
        sanitizeSpreadsheetCell(row.observacao || ''),
        sanitizeSpreadsheetCell(rep?.nome || ''),
        sanitizeSpreadsheetCell(row.status)
      ].join('\t');
    });

    const content = kind === 'csv' ? [header, ...body].join('\n') : `\uFEFF${[header, ...body].join('\n')}`;
    const blob = new Blob([content], {
      type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/vnd.ms-excel;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = kind === 'csv' ? 'registros_financeiros.csv' : 'registros_financeiros.xls';
    anchor.click();
    URL.revokeObjectURL(url);
    auditLog.exportCsv(activeCompanyId, { count: filteredRows.length, filters });
    showMessage('sucesso', kind === 'csv' ? 'CSV exportado.' : 'Arquivo Excel exportado.');
  }, [activeCompanyId, activeRepresentatives, filteredRows, filters, showMessage]);

  const getUniqueColumnValues = useCallback((field) => {
    return [...new Set(activeRecords.map((row) => String(row[field] ?? '')))].sort();
  }, [activeRecords]);

  const startPreviewEdit = useCallback((id, campo, value) => {
    setEditingPreviewCell({ id, campo });
    setEditingPreviewValue(String(value ?? ''));
  }, []);

  const savePreviewEdit = useCallback(() => {
    if (!editingPreviewCell) return;
    setPreview((prev) => ({
      ...prev,
      registros: prev.registros.map((row) => {
        if (row.id !== editingPreviewCell.id) return row;
        const nextValue =
          editingPreviewCell.campo === 'valor'
            ? parseFloat(editingPreviewValue) || 0
            : editingPreviewCell.campo === 'nome'
              ? editingPreviewValue.toUpperCase()
              : editingPreviewValue;
        return { ...row, [editingPreviewCell.campo]: nextValue };
      })
    }));
    setEditingPreviewCell(null);
    setEditingPreviewValue('');
  }, [editingPreviewCell, editingPreviewValue]);

  const cancelPreviewEdit = useCallback(() => {
    setEditingPreviewCell(null);
    setEditingPreviewValue('');
  }, []);

  const removePreviewRow = useCallback((rowId) => {
    setPreview((prev) => {
      const nextSelected = new Set(prev.selecionados);
      nextSelected.delete(rowId);
      return {
        ...prev,
        registros: prev.registros.filter((row) => row.id !== rowId),
        selecionados: nextSelected
      };
    });
  }, []);

  const togglePreviewSelection = useCallback((rowId) => {
    setPreview((prev) => {
      const nextSelected = new Set(prev.selecionados);
      if (nextSelected.has(rowId)) nextSelected.delete(rowId);
      else nextSelected.add(rowId);
      return { ...prev, selecionados: nextSelected };
    });
  }, []);

  const selectAllPreview = useCallback(() => {
    setPreview((prev) => ({ ...prev, selecionados: new Set(visiblePreviewRows.map((row) => row.id)) }));
  }, [visiblePreviewRows]);

  const clearPreviewSelection = useCallback(() => {
    setPreview((prev) => ({ ...prev, selecionados: new Set() }));
  }, []);

  const selectPreviewWithoutProblems = useCallback(() => {
    setPreview((prev) => ({
      ...prev,
      selecionados: new Set(analyzedPreviewRows.filter((row) => row.problemas.length === 0).map((row) => row.id))
    }));
  }, [analyzedPreviewRows]);

  const cancelPreview = useCallback(() => {
    setPreview(null);
    setEditingPreviewCell(null);
  }, []);

  const representativesFiltered = useMemo(() => {
    if (!representativeSearch.trim()) return activeRepresentatives;
    return activeRepresentatives.filter((item) =>
      item.nome.toLowerCase().includes(representativeSearch.toLowerCase())
    );
  }, [activeRepresentatives, representativeSearch]);

  // ── WhatsApp charge modal ─────────────────────────────────────────────────
  const openWhatsAppChargeModal = useCallback((selectedIds) => {
    if (!ensureSpecificCompany('Selecione uma empresa específica para enviar cobranças por WhatsApp.')) return;
    const today = new Date().toISOString().split('T')[0];
    const eligible = activeRecords.filter((row) =>
      (selectedIds instanceof Set ? selectedIds.has(row.id) : false) &&
      row.status !== 'liquidado' &&
      row.dataVencimento < today &&
      row.telefone && row.telefone.trim()
    );

    if (!eligible.length) {
      showMessage('erro', 'Nenhum registro elegível. Verifique: deve estar vencido, não liquidado e com telefone preenchido.');
      return;
    }

    const messages = {};
    eligible.forEach((row) => {
      messages[row.id] = generateWhatsAppMessage(row, activeCompany?.nome || '');
    });

    setWhatsappModal({ records: eligible, messages, sending: false, results: null });
  }, [activeCompany, activeRecords, ensureSpecificCompany, showMessage]);

  const closeWhatsAppModal = useCallback(() => {
    setWhatsappModal(null);
  }, []);

  const updateWhatsAppMessage = useCallback((rowId, message) => {
    setWhatsappModal((prev) => {
      if (!prev) return null;
      return { ...prev, messages: { ...prev.messages, [rowId]: message } };
    });
  }, []);

  const doSendWhatsAppCharges = useCallback(async (charges) => {
    if (!activeCompanyId) return;
    setWhatsappModal((prev) => (prev ? { ...prev, sending: true } : null));
    try {
      const data = await zapiSendCharges(activeCompanyId, charges);
      const resultsMap = {};
      (data.results || []).forEach((r) => {
        resultsMap[r.registro_id] = { ok: r.ok, error: r.error, mocked: r.mocked || false };
      });
      setWhatsappModal((prev) => (prev ? { ...prev, sending: false, results: resultsMap, mocked: data.mocked || false } : null));
      if ((data.summary?.sent || 0) > 0) {
        auditLog.whatsappChargesSent(activeCompanyId, { count: data.summary.sent, mocked: data.mocked || false });
        window.dispatchEvent(new CustomEvent('bankextract:dashboard-refresh'));
        triggerSync('sendWhatsAppCharges');
      }
    } catch (err) {
      setWhatsappModal((prev) => (prev ? { ...prev, sending: false } : null));
      showMessage('erro', err.message || 'Falha ao enviar cobranças por WhatsApp.');
    }
  }, [activeCompanyId, triggerSync, showMessage]);


  return {
    loading,
    saving,
    error,
    setError,
    message,
    activeTab,
    setActiveTab,
    activeCompany,
    activeCompanyId,
    companies,
    isGlobalView,
    importType,
    setImportType,
    activeConfig: computedConfig,
    activeRecords,
    updateConfig,
    stats,
    processingFiles,
    pastedText,
    setPastedText,
    handleFiles,
    processPastedText,
    dragging,
    setDragging,
    preview,
    previewSearch,
    setPreviewSearch,
    previewFilter,
    setPreviewFilter,
    analyzedPreviewRows,
    visiblePreviewRows,
    previewStats,
    editingPreviewCell,
    editingPreviewValue,
    setEditingPreviewValue,
    startPreviewEdit,
    savePreviewEdit,
    cancelPreviewEdit,
    togglePreviewSelection,
    selectAllPreview,
    clearPreviewSelection,
    selectPreviewWithoutProblems,
    removePreviewRow,
    cancelPreview,
    confirmImport,
    filteredRows,
    paginatedRows,
    search,
    setSearch,
    filters,
    toggleFilter,
    clearFilters,
    sortBy,
    toggleSort,
    page,
    setPage,
    totalPages,
    historyRowsByScope,
    selectedRows,
    toggleRowSelection,
    toggleAllPageRows,
    deleteSelectedRows,
    selectedHistoryRows,
    toggleHistorySelection,
    toggleAllHistoryRows,
    deleteSelectedHistory,
    editingCell,
    editingValue,
    setEditingValue,
    startCellEdit,
    saveCellEdit,
    cancelCellEdit,
    openFilterDropdown,
    setOpenFilterDropdown,
    openRepresentativeDropdown,
    setOpenRepresentativeDropdown,
    representativeSearch,
    setRepresentativeSearch,
    representativesFiltered,
    activeRepresentatives,
    assignRepresentative,
    representativeModal,
    setRepresentativeModal,
    openNewRepresentativeModal,
    openEditRepresentativeModal,
    saveRepresentative,
    deleteRepresentative,
    exportRows,
    clearOverviewModalOpen,
    clearingOverview,
    openClearOverviewModal,
    closeClearOverviewModal,
    confirmClearOverview,
    getUniqueColumnValues,
    companyHistory,
    setRecords,
    showMessage,
    // WhatsApp Z-API
    whatsappModal,
    openWhatsAppChargeModal,
    closeWhatsAppModal,
    updateWhatsAppMessage,
    sendWhatsAppCharges: doSendWhatsAppCharges,
    // Google Sheets auto-sync
    syncStatus,
    googleSyncMessage,
    invalidateConfigCache,
  };
};
