import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eraser, FileSpreadsheet, Search, SlidersHorizontal, WalletCards } from 'lucide-react';
import ClearOverviewModal from '../components/ClearOverviewModal';
import ConfiguracaoJurosMulta from '../components/ConfiguracaoJurosMulta';
import FinanceTable from '../components/FinanceTable';
import RepresentanteModal from '../components/RepresentanteModal';
import { financeService } from '../services/financeService.ts';
import { auditLog } from '../services/auditService';
import { canUserPerformAction } from '../security/permissions';

const emptyRepresentative = {
  id: '',
  nome: '',
  telefone: '',
  email: '',
  observacao: '',
  ativo: true,
};

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const cleanPhone = (value) => String(value || '').replace(/\D+/g, '');

const money = (value) => Number(Number(value || 0).toFixed(2));

const calculateUpdatedValues = (row, config) => {
  const dueDate = row.dataVencimento ? new Date(`${row.dataVencimento}T00:00:00`) : null;
  const today = new Date();
  const isOverdue = dueDate && dueDate < today && row.status !== 'liquidado';
  const daysLate = isOverdue ? Math.max(0, Math.floor((today - dueDate) / 86400000)) : 0;
  const multaPercentual = Number(config?.multaPercentual || 0);
  const jurosPercentualDia = Number(config?.jurosPercentualDia || 0);
  const multa = isOverdue ? money((Number(row.valor || 0) * multaPercentual) / 100) : 0;
  const juros = isOverdue ? money((Number(row.valor || 0) * jurosPercentualDia * daysLate) / 100) : 0;
  const valorAtualizado = money(Number(row.valor || 0) + multa + juros);

  return {
    juros,
    multa,
    valorAtualizado,
  };
};

const toTableRow = (row, config) => {
  const baseRow = {
    id: row.id,
    company_id: row.company_id,
    empresaNome: row.empresa_nome || 'Empresa',
    nome: row.nome || '',
    numeroBoleto: row.numero_boleto || '',
    dataVencimento: row.data_vencimento || '',
    valor: Number(row.valor || 0),
    telefone: row.telefone || '',
    observacao: row.observacao || row.observacoes || '',
    status: row.status || 'pendente',
    tipo: row.tipo || 'vencidos',
    representanteId: row.representante_id || null,
    batchId: row.batch_id || null,
  };

  return {
    ...baseRow,
    ...calculateUpdatedValues(baseRow, config),
  };
};

export default function VisaoGeralScreen({
  companies,
  activeCompanyId,
  activeCompanyName,
  globalMode,
  filters,
  setFilters,
  rows,
  config,
  onConfigChange,
  onExportCsv,
  onExportExcel,
  onOpenClearOverview,
  clearOverviewModalOpen,
  clearOverviewLoading,
  onCloseClearOverview,
  onConfirmClearOverview,
  userRole = 'operador',
  onToast,
  onRequestRefresh,
  currentUserId = '',
}) {
  const canExport = canUserPerformAction(userRole, 'export_data');
  const canClearView = canUserPerformAction(userRole, 'clear_overview');
  const canCreateRepresentative = canUserPerformAction(userRole, 'edit_financial_records');
  const canEditRecords = canUserPerformAction(userRole, 'edit_financial_records');
  const canDeleteRecords = canUserPerformAction(userRole, 'delete_financial_records');

  const [representatives, setRepresentatives] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [tableSearch, setTableSearch] = useState('');
  const [tableFilters, setTableFilters] = useState({});
  const [sortBy, setSortBy] = useState({ campo: 'dataVencimento', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingCell, setSavingCell] = useState(null);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
  const [openRepresentativeDropdown, setOpenRepresentativeDropdown] = useState(null);
  const [representativeSearch, setRepresentativeSearch] = useState('');
  const [representativeModal, setRepresentativeModal] = useState(null);

  useEffect(() => {
    setTableRows((rows || []).map((row) => toTableRow(row, config)));
  }, [rows, config]);

  const loadRepresentatives = useCallback(async () => {
    if (!activeCompanyId || globalMode) {
      setRepresentatives([]);
      return;
    }

    try {
      const result = await financeService.getRepresentatives(activeCompanyId);
      setRepresentatives(result || []);
    } catch (error) {
      onToast?.('erro', error.message || 'Não foi possível carregar representantes.');
    }
  }, [activeCompanyId, globalMode, onToast]);

  useEffect(() => {
    loadRepresentatives();
  }, [loadRepresentatives]);

  useEffect(() => {
    setSelectedRows(new Set());
    setPage(1);
  }, [tableRows]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!event.target.closest('[data-filter-dropdown]')) {
        setOpenFilterDropdown(null);
      }

      if (!event.target.closest('[data-representante-dropdown]')) {
        setOpenRepresentativeDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const representativesFiltered = useMemo(() => {
    const term = normalizeText(representativeSearch);
    if (!term) return representatives;
    return representatives.filter((item) =>
      normalizeText(`${item.nome} ${item.email} ${item.telefone}`).includes(term)
    );
  }, [representatives, representativeSearch]);

  const allTableRows = useMemo(() => {
    const baseRows = tableRows.filter((row) => {
      const searchHaystack = normalizeText(
        `${row.empresaNome} ${row.nome} ${row.numeroBoleto} ${row.telefone} ${row.observacao} ${row.status} ${row.tipo}`
      );

      if (tableSearch && !searchHaystack.includes(normalizeText(tableSearch))) {
        return false;
      }

      return Object.entries(tableFilters).every(([field, values]) => {
        if (!values?.length) return true;

        const representativeName =
          field === 'representanteId'
            ? representatives.find((item) => item.id === row.representanteId)?.nome || ''
            : null;

        const currentValue =
          field === 'representanteId'
            ? representativeName
            : row[field] === null || typeof row[field] === 'undefined'
              ? ''
              : String(row[field]);

        return values.includes(currentValue);
      });
    });

    const sortedRows = [...baseRows].sort((left, right) => {
      const leftValue = left[sortBy.campo];
      const rightValue = right[sortBy.campo];

      if (sortBy.campo === 'valor' || sortBy.campo === 'juros' || sortBy.campo === 'multa' || sortBy.campo === 'valorAtualizado') {
        const diff = Number(leftValue || 0) - Number(rightValue || 0);
        return sortBy.direction === 'asc' ? diff : -diff;
      }

      if (sortBy.campo === 'dataVencimento') {
        const leftDate = leftValue ? new Date(`${leftValue}T00:00:00`).getTime() : 0;
        const rightDate = rightValue ? new Date(`${rightValue}T00:00:00`).getTime() : 0;
        const diff = leftDate - rightDate;
        return sortBy.direction === 'asc' ? diff : -diff;
      }

      const normalizedLeft = normalizeText(leftValue);
      const normalizedRight = normalizeText(rightValue);
      if (normalizedLeft < normalizedRight) return sortBy.direction === 'asc' ? -1 : 1;
      if (normalizedLeft > normalizedRight) return sortBy.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return sortedRows;
  }, [representatives, sortBy, tableFilters, tableRows, tableSearch]);

  const itemsPerPage = 12;
  const totalPages = Math.max(1, Math.ceil(allTableRows.length / itemsPerPage));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return allTableRows.slice(start, start + itemsPerPage);
  }, [allTableRows, page]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const getUniqueColumnValues = useCallback(
    (field) => {
      const values = new Set();
      allTableRows.forEach((row) => {
        if (field === 'representanteId') {
          const representativeName =
            representatives.find((item) => item.id === row.representanteId)?.nome || '';
          values.add(representativeName);
          return;
        }

        const value = row[field];
        values.add(value === null || typeof value === 'undefined' ? '' : String(value));
      });

      return Array.from(values).sort((left, right) => left.localeCompare(right, 'pt-BR'));
    },
    [allTableRows, representatives]
  );

  const toggleSort = useCallback((campo) => {
    setSortBy((prev) => ({
      campo,
      direction: prev.campo === campo && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const toggleFilter = useCallback((field, value) => {
    setTableFilters((prev) => {
      const current = prev[field] || [];
      const nextValues = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];

      return {
        ...prev,
        [field]: nextValues,
      };
    });
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setTableSearch('');
    setTableFilters({});
    setPage(1);
  }, []);

  const toggleRowSelection = useCallback((rowId) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const toggleAllPageRows = useCallback(() => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      const pageIds = pagedRows.map((row) => row.id);
      const allSelected = pageIds.every((id) => next.has(id));

      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }

      return next;
    });
  }, [pagedRows]);

  const updateLocalRow = useCallback((rowId, patch) => {
    setTableRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const nextRow = { ...row, ...patch };
        return {
          ...nextRow,
          ...calculateUpdatedValues(nextRow, config),
        };
      })
    );
  }, [config]);

  const startCellEdit = useCallback((rowId, campo, currentValue) => {
    setEditingCell({ id: rowId, campo });
    setEditingValue(currentValue ?? '');
    setSaveFeedback(null);
  }, []);

  const cancelCellEdit = useCallback(() => {
    setEditingCell(null);
    setEditingValue('');
    setSavingCell(null);
  }, []);

  const saveCellEdit = useCallback(async () => {
    if (!editingCell) return;
    if (!canEditRecords) {
      onToast?.('erro', 'Seu perfil atual nao pode editar registros financeiros.');
      return;
    }

    const currentRow = tableRows.find((row) => row.id === editingCell.id);
    if (!currentRow) {
      cancelCellEdit();
      return;
    }

    let nextValue = editingValue;
    const patch = {};

    if (editingCell.campo === 'telefone') {
      nextValue = cleanPhone(editingValue);
      patch.telefone = nextValue;
    } else if (editingCell.campo === 'valor') {
      patch.valor = Number(editingValue || 0);
      nextValue = patch.valor;
    } else if (editingCell.campo === 'numeroBoleto') {
      patch.numeroBoleto = String(editingValue || '').trim();
      nextValue = patch.numeroBoleto;
    } else if (editingCell.campo === 'dataVencimento') {
      patch.dataVencimento = String(editingValue || '').trim();
      nextValue = patch.dataVencimento;
    } else if (editingCell.campo === 'observacao') {
      patch.observacao = String(editingValue || '');
      nextValue = patch.observacao;
    } else if (editingCell.campo === 'status') {
      patch.status = String(editingValue || 'pendente');
      nextValue = patch.status;
    } else if (editingCell.campo === 'tipo') {
      patch.tipo = String(editingValue || 'vencidos');
      nextValue = patch.tipo;
    } else if (editingCell.campo === 'nome') {
      patch.nome = String(editingValue || '').trim();
      nextValue = patch.nome;
    } else {
      patch[editingCell.campo] = editingValue;
    }

    setSavingCell(editingCell);
    setSaveFeedback(null);
    updateLocalRow(editingCell.id, { [editingCell.campo]: nextValue });

    try {
      const saved = await financeService.updateFinancialRecord(editingCell.id, patch, {
        companyId: currentRow.company_id,
      });
      await auditLog.financialRecordEdited(
        currentRow.company_id,
        editingCell.id,
        { field: editingCell.campo, newValue: nextValue },
        currentUserId
      );

      updateLocalRow(editingCell.id, {
        nome: saved.nome,
        numeroBoleto: saved.numero_boleto,
        dataVencimento: saved.data_vencimento,
        valor: Number(saved.valor || 0),
        telefone: saved.telefone || '',
        observacao: saved.observacao || saved.observacoes || '',
        status: saved.status || 'pendente',
        tipo: saved.tipo || 'vencidos',
        representanteId: saved.representante_id || null,
      });

      setSaveFeedback({ id: editingCell.id, campo: editingCell.campo, type: 'sucesso' });
      await onRequestRefresh?.();
    } catch (error) {
      setSaveFeedback({ id: editingCell.id, campo: editingCell.campo, type: 'erro' });
      await onRequestRefresh?.();
      onToast?.('erro', error.message || 'Nao foi possivel salvar a edicao.');
    } finally {
      setSavingCell(null);
      setEditingCell(null);
      setEditingValue('');
      window.setTimeout(() => setSaveFeedback(null), 1800);
    }
  }, [cancelCellEdit, canEditRecords, currentUserId, editingCell, editingValue, onRequestRefresh, onToast, tableRows, updateLocalRow]);

  const assignRepresentative = useCallback(
    async (rowId, representativeId) => {
      const currentRow = tableRows.find((row) => row.id === rowId);
      if (!currentRow) return;
      if (!canEditRecords) {
        onToast?.('erro', 'Seu perfil atual nao pode alterar representantes.');
        return;
      }

      updateLocalRow(rowId, { representanteId: representativeId || null });
      setOpenRepresentativeDropdown(null);

      try {
        await financeService.updateFinancialRecord(
          rowId,
          { representanteId: representativeId || null },
          { companyId: currentRow.company_id }
        );
        await auditLog.financialRecordEdited(
          currentRow.company_id,
          rowId,
          { field: 'representante_id', newValue: representativeId || null },
          currentUserId
        );
        await onRequestRefresh?.();
      } catch (error) {
        await onRequestRefresh?.();
        onToast?.('erro', error.message || 'Nao foi possivel vincular o representante.');
      }
    },
    [canEditRecords, currentUserId, onRequestRefresh, onToast, tableRows, updateLocalRow]
  );

  const openNewRepresentativeModal = useCallback((rowId = null) => {
    setRepresentativeModal({
      modo: 'novo',
      targetRowId: rowId,
      rep: { ...emptyRepresentative },
    });
  }, []);

  const openEditRepresentativeModal = useCallback((rep) => {
    setRepresentativeModal({
      modo: 'editar',
      targetRowId: null,
      rep: {
        id: rep.id,
        nome: rep.nome || '',
        telefone: rep.telefone || '',
        email: rep.email || '',
        observacao: rep.observacao || '',
        ativo: rep.ativo !== false,
      },
    });
  }, []);

  const handleRepresentativeChange = useCallback((field, value) => {
    setRepresentativeModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rep: {
          ...prev.rep,
          [field]: value,
        },
      };
    });
  }, []);

  const handleSaveRepresentative = useCallback(async () => {
    if (!representativeModal) return;
    if (!canEditRecords) {
      onToast?.('erro', 'Seu perfil atual nao pode salvar representantes.');
      return;
    }

    try {
      const saved = await financeService.saveRepresentative(activeCompanyId, {
        ...representativeModal.rep,
        telefone: cleanPhone(representativeModal.rep.telefone),
      });

      await loadRepresentatives();

      if (representativeModal.modo === 'novo' && representativeModal.targetRowId) {
        await assignRepresentative(representativeModal.targetRowId, saved.id);
      }

      await auditLog.representativeChanged(
        activeCompanyId,
        saved.id,
        { mode: representativeModal.modo, nome: saved.nome },
        currentUserId
      );

      setRepresentativeModal(null);
      onToast?.('sucesso', 'Representante salvo com sucesso.');
      await onRequestRefresh?.();
    } catch (error) {
      onToast?.('erro', error.message || 'Nao foi possivel salvar o representante.');
    }
  }, [activeCompanyId, assignRepresentative, canEditRecords, currentUserId, loadRepresentatives, onRequestRefresh, onToast, representativeModal]);

  const handleDeleteRepresentative = useCallback(async (representativeId) => {
    if (!canDeleteRecords) {
      onToast?.('erro', 'Seu perfil atual nao pode excluir representantes.');
      return;
    }

    try {
      await financeService.deleteRepresentative(activeCompanyId, representativeId);
      setTableRows((prev) => prev.map((row) => (row.representanteId === representativeId ? { ...row, representanteId: null } : row)));
      await loadRepresentatives();
      setRepresentativeModal(null);
      await auditLog.representativeChanged(
        activeCompanyId,
        representativeId,
        { mode: 'delete' },
        currentUserId
      );
      onToast?.('sucesso', 'Representante removido com sucesso.');
      await onRequestRefresh?.();
    } catch (error) {
      onToast?.('erro', error.message || 'Nao foi possivel excluir o representante.');
    }
  }, [activeCompanyId, canDeleteRecords, currentUserId, loadRepresentatives, onRequestRefresh, onToast]);

  const deleteSelectedRows = useCallback(async (idsOverride) => {
    const ids =
      idsOverride instanceof Set
        ? Array.from(idsOverride)
        : Array.from(selectedRows);

    if (!ids.length) return;
    if (!canDeleteRecords) {
      onToast?.('erro', 'Seu perfil atual nao pode excluir registros financeiros.');
      return;
    }

    try {
      const rowsToDelete = tableRows.filter((row) => ids.includes(row.id));
      const groupedByCompany = rowsToDelete.reduce((acc, row) => {
        acc[row.company_id] = acc[row.company_id] || [];
        acc[row.company_id].push(row.id);
        return acc;
      }, {});

      await Promise.all(
        Object.entries(groupedByCompany).map(([companyId, recordIds]) =>
          financeService.deleteFinancialRecords(recordIds, { companyId })
        )
      );

      setSelectedRows(new Set());
      await onRequestRefresh?.();
      onToast?.('sucesso', 'Registro(s) excluido(s) com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Nao foi possivel excluir os registros selecionados.');
    }
  }, [canDeleteRecords, onRequestRefresh, onToast, selectedRows, tableRows]);

  return (
    <div className="space-y-6">
      <section className="hero-mesh text-crisp border-brand overflow-hidden rounded-[32px] border p-6 shadow-lifted lg:p-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="notice-info mb-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]">
              <WalletCards size={13} />
              Carteira financeira
            </div>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-50 lg:text-4xl">
              Visao consolidada da carteira para operar, exportar e limpar com seguranca.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 lg:text-base">
              Esta tela concentra registros reais, filtros comerciais e acoes operacionais com company_id, batch_id e
              permissoes por role.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="surface-elevated rounded-2xl p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">Escopo atual</p>
              <p className="text-on-light mt-2 text-sm font-semibold">
                {globalMode ? 'Todas as empresas' : activeCompanyName || 'Nenhuma empresa ativa'}
              </p>
            </div>
            <div className="surface-elevated rounded-2xl p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">Registros visiveis</p>
              <p className="text-on-light mt-2 text-2xl font-semibold">{rows.length}</p>
            </div>
            <div className="surface-elevated rounded-2xl p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">Acoes destrutivas</p>
              <p className="text-on-light mt-2 text-sm font-semibold">
                {globalMode ? 'Bloqueadas no modo global' : canClearView ? 'Controladas por role' : 'Restritas'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <ConfiguracaoJurosMulta
        config={config}
        onChange={onConfigChange}
        disabled={globalMode}
        notice={globalMode ? 'Selecione uma empresa especifica para editar juros e multa.' : ''}
        title="Configuracao financeira"
        subtitle="Esses percentuais recalculam automaticamente valores atualizados, cobrancas e sincronizacao."
        showRealtimeBadge
        saveLabel="Salvar configuracao"
      />

      <section className="accent-bar text-crisp surface-card rounded-[28px] p-5">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-50">Carteira financeira</h3>
            <p className="text-sm text-slate-300">Visao principal dos registros importados por empresa e lote.</p>
            {!canExport || !canClearView ? (
              <p className="notice-warning mt-2 rounded-xl px-3 py-2 text-xs">
                Algumas acoes desta tela estao bloqueadas para o seu perfil atual.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {canExport ? (
              <button
                type="button"
                onClick={onExportCsv}
                className="btn-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
              >
                <Download size={14} />
                Exportar CSV
              </button>
            ) : null}
            {canExport ? (
              <button
                type="button"
                onClick={onExportExcel}
                className="btn-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
              >
                <FileSpreadsheet size={14} />
                Exportar Excel
              </button>
            ) : null}
            {canClearView ? (
              <button
                type="button"
                onClick={onOpenClearOverview}
                className="notice-danger inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold"
              >
                <Eraser size={14} />
                Limpar visao
              </button>
            ) : null}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-6">
          <label className="surface-panel rounded-2xl px-4 py-3 shadow-soft">
            <span className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              <SlidersHorizontal size={13} />
              Empresa
            </span>
            <select
              value={filters.companyFilter}
              onChange={(event) => setFilters((prev) => ({ ...prev, companyFilter: event.target.value }))}
              className="input-premium w-full bg-transparent text-sm outline-none"
            >
              {globalMode ? <option value="">Todas as empresas</option> : null}
              {!globalMode ? <option value={activeCompanyId}>{activeCompanyName || 'Empresa ativa'}</option> : null}
              {globalMode
                ? companies
                    .filter((company) => company.id !== activeCompanyId)
                    .map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.nome}
                      </option>
                    ))
                : null}
            </select>
          </label>

          <input
            type="date"
            value={filters.dateStart}
            onChange={(event) => setFilters((prev) => ({ ...prev, dateStart: event.target.value }))}
            className="input-premium rounded-2xl border border-slate-700 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          />
          <input
            type="date"
            value={filters.dateEnd}
            onChange={(event) => setFilters((prev) => ({ ...prev, dateEnd: event.target.value }))}
            className="input-premium rounded-2xl border border-slate-700 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          />
          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            className="input-premium rounded-2xl border border-slate-700 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          >
            <option value="todos">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="aberto">Aberto</option>
            <option value="vencido">Vencido</option>
            <option value="negociacao">Negociacao</option>
            <option value="liquidado">Liquidado</option>
          </select>
          <select
            value={filters.tipo}
            onChange={(event) => setFilters((prev) => ({ ...prev, tipo: event.target.value }))}
            className="input-premium rounded-2xl border border-slate-700 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          >
            <option value="todos">Todos os tipos</option>
            <option value="vencidos">Vencidos</option>
            <option value="liquidacao">Liquidacao</option>
          </select>
          <div className="surface-panel flex items-center gap-2 rounded-2xl px-4 py-3 shadow-soft">
            <Search size={14} className="text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Buscar cliente ou documento"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <FinanceTable
          rows={pagedRows}
          allRows={allTableRows}
          representatives={representatives}
          search={tableSearch}
          setSearch={setTableSearch}
          filters={tableFilters}
          toggleFilter={toggleFilter}
          clearFilters={clearFilters}
          sortBy={sortBy}
          toggleSort={toggleSort}
          getUniqueColumnValues={getUniqueColumnValues}
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          selectedRows={selectedRows}
          toggleRowSelection={toggleRowSelection}
          toggleAllPageRows={toggleAllPageRows}
          deleteSelectedRows={deleteSelectedRows}
          editingCell={editingCell}
          editingValue={editingValue}
          setEditingValue={setEditingValue}
          startCellEdit={startCellEdit}
          saveCellEdit={saveCellEdit}
          cancelCellEdit={cancelCellEdit}
          openFilterDropdown={openFilterDropdown}
          setOpenFilterDropdown={setOpenFilterDropdown}
          openRepresentativeDropdown={openRepresentativeDropdown}
          setOpenRepresentativeDropdown={setOpenRepresentativeDropdown}
          representativeSearch={representativeSearch}
          setRepresentativeSearch={setRepresentativeSearch}
          representativesFiltered={representativesFiltered}
          assignRepresentative={assignRepresentative}
          openNewRepresentativeModal={openNewRepresentativeModal}
          openEditRepresentativeModal={openEditRepresentativeModal}
          exportRows={(format) => (format === 'csv' ? onExportCsv() : onExportExcel())}
          clearOverview={onOpenClearOverview}
          showCompanyColumn={globalMode}
          globalMode={globalMode}
          userRole={userRole}
          showPrimaryActions={false}
          onCreateRepresentative={canCreateRepresentative ? openNewRepresentativeModal : null}
          savingCell={savingCell}
          saveFeedback={saveFeedback}
        />
      </section>

      <ClearOverviewModal
        isOpen={clearOverviewModalOpen}
        companyName={activeCompanyName}
        loading={clearOverviewLoading}
        onClose={onCloseClearOverview}
        onConfirm={onConfirmClearOverview}
      />

      <RepresentanteModal
        modalData={representativeModal}
        companyName={activeCompanyName}
        onClose={() => setRepresentativeModal(null)}
        onChange={handleRepresentativeChange}
        onSave={handleSaveRepresentative}
        onDelete={handleDeleteRepresentative}
      />
    </div>
  );
}
