import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import EmpresaModal from './components/EmpresaModal';
import ErrorBoundary from './components/ErrorBoundary';
import MessagePreviewModal from './components/MessagePreviewModal';
import Sidebar from './components/Sidebar';
import { useEmpresa } from './hooks/useEmpresa';
import { useSupabaseAuth } from './hooks/useSupabaseAuth';
import { financeService, sanitizeSpreadsheetCell } from './services/financeService.ts';
import LoginScreen from './screens/LoginScreen';
import { GLOBAL_COMPANY_ID } from './services/companyService';
import { auditLog } from './services/auditService';
import { canUserPerformAction } from './security/permissions';

const DashboardScreen = lazy(() => import('./screens/DashboardScreen'));
const ImportacaoScreen = lazy(() => import('./screens/ImportacaoScreen'));
const VisaoGeralScreen = lazy(() => import('./screens/VisaoGeralScreen'));
const HistoricoScreen = lazy(() => import('./screens/HistoricoScreen'));
const CobrancasScreen = lazy(() => import('./screens/CobrancasScreen'));
const CentralCobrancaScreen = lazy(() => import('./screens/CentralCobrancaScreen'));
const HistoricoCobrancaScreen = lazy(() => import('./screens/HistoricoCobrancaScreen'));
const InconsistenciasCobrancaScreen = lazy(() => import('./screens/InconsistenciasCobrancaScreen'));
const ChecklistEnvioRealScreen = lazy(() => import('./screens/ChecklistEnvioRealScreen'));
const AutomacoesScreen = lazy(() => import('./screens/AutomacoesScreen'));
const IntegracoesScreen = lazy(() => import('./screens/IntegracoesScreen'));
const ConfiguracoesScreen = lazy(() => import('./screens/ConfiguracoesScreen'));
const SystemStatusScreen = lazy(() => import('./screens/SystemStatusScreen'));
const LandingPage = lazy(() => import('./screens/LandingPage'));
const OnboardingScreen = lazy(() => import('./screens/OnboardingScreen'));
const PlanosScreen = lazy(() => import('./screens/PlanosScreen'));
const BillingScreen = lazy(() => import('./screens/BillingScreen'));

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

const sleep = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const formatCurrencyValue = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

const formatDateValue = (value) => {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
};

const buildChargeMessage = (row, companyName) => {
  const dueDate = row?.vencimento ? new Date(`${row.vencimento}T00:00:00`) : null;
  const today = new Date();
  const daysLate = dueDate ? Math.max(0, Math.floor((today - dueDate) / 86400000)) : 0;

  const template = `Olá, {{cliente}},

Entramos em contato para confirmar o pagamento da duplicata abaixo:

Documento: {{documento}}
Vencimento: {{vencimento}}
Valor: {{valor}}

Até o momento, identificamos {{dias_atraso}} dia(s) de atraso em nosso sistema.

Solicitamos, por gentileza, a regularização do título ou o envio do comprovante de pagamento, caso já tenha sido quitado.

Após 5 dias do vencimento, o boleto poderá estar sujeito a protesto e encargos adicionais.

Ficamos à disposição.

Caso o pagamento já tenha sido efetuado, desconsidere esta mensagem.`;

  return template
    .replaceAll('{{cliente}}', row?.cliente || '')
    .replaceAll('{{documento}}', row?.documento || '')
    .replaceAll('{{vencimento}}', formatDateValue(row?.vencimento))
    .replaceAll('{{valor}}', formatCurrencyValue(row?.valor))
    .replaceAll('{{telefone}}', row?.telefone || '')
    .replaceAll('{{dias_atraso}}', String(daysLate))
    .replaceAll('{{empresa}}', companyName || '');
};

const emptyMetrics = {
  kpis: [],
  charts: { aging: [], importacoes: [] },
};

const emptyAutomation = {
  active: false,
  horario: '08:00',
  canal: 'WhatsApp',
  rules: [
    { day: 'D+1', active: false },
    { day: 'D+3', active: false },
    { day: 'D+5', active: false },
    { day: 'D+10', active: false },
    { day: 'D+15', active: false },
  ],
};

const headerMap = {
  landing: {
    title: 'Landing Page comercial',
    subtitle: 'Posicionamento SaaS premium para apresentar o BankExtract antes do login e preparar a venda.',
  },
  dashboard: {
    title: 'Dashboard executivo',
    subtitle: 'Indicadores financeiros e comerciais preparados para serem conectados ao Supabase por empresa.',
  },
  onboarding: {
    title: 'Onboarding guiado',
    subtitle: 'Etapas praticas para ativar empresa, integracoes, cobranca automatica e primeira importacao.',
  },
  importacao: {
    title: 'Importacao OCR',
    subtitle: 'Envie documentos, revise a previa extraida e importe somente as linhas aprovadas para a carteira.',
  },
  'visao-geral': {
    title: 'Visao Geral financeira',
    subtitle: 'Carteira consolidada por empresa com filtros, batch_id e acoes operacionais seguras.',
  },
  historico: {
    title: 'Historico de importacoes',
    subtitle: 'Auditoria por lote usando batch_id como identidade semantica da importacao.',
  },
  cobrancas: {
    title: 'Cobrancas',
    subtitle: 'Fila operacional de WhatsApp com status, telefone e geracao de mensagem por titulo.',
  },
  'central-cobranca': {
    title: 'Central de Cobranca',
    subtitle: 'Operacao por titulo com etapa da regua, status do boleto e simulacao individual por empresa.',
  },
  'historico-cobranca': {
    title: 'Historico de Cobrancas',
    subtitle: 'Auditoria detalhada das simulacoes e eventos registrados em logs_cobranca por empresa.',
  },
  inconsistencias: {
    title: 'Inconsistencias de Cobranca',
    subtitle: 'Painel preventivo com problemas que podem bloquear ou prejudicar a cobranca automatica.',
  },
  'pronto-envio': {
    title: 'Pronto para Envio',
    subtitle: 'Checklist pre-envio real com status operacional, dados e bloqueios de integracao.',
  },
  automacoes: {
    title: 'Automacoes',
    subtitle: 'Cadencias de cobranca e motor automatico por atraso configuravel por empresa.',
  },
  integracoes: {
    title: 'Integracoes',
    subtitle: 'Conecte Google Sheets, WhatsApp e demais servicos sem perder a visao multiempresa.',
  },
  configuracoes: {
    title: 'Configuracoes',
    subtitle: 'Dados da empresa, usuarios, permissoes e preferencias operacionais do BankExtract.',
  },
  'status-sistema': {
    title: 'Status do Sistema',
    subtitle: 'Checklist operacional, integracoes ativas e sinais de prontidao para venda.',
  },
  planos: {
    title: 'Planos comerciais',
    subtitle: 'Estrutura de oferta pronta para venda antes de conectar billing real.',
  },
  billing: {
    title: 'Billing comercial',
    subtitle: 'Plano atual, consumo e proxima cobranca em modo mock.',
  },
};

const companyDependentTabs = new Set(['importacao', 'visao-geral', 'historico', 'cobrancas', 'central-cobranca', 'historico-cobranca', 'inconsistencias', 'pronto-envio', 'automacoes', 'integracoes']);

function ScreenFallback() {
  return (
    <div className="space-y-4">
      <div className="hero-mesh overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/90 px-6 py-8 shadow-soft">
        <div className="skeleton h-5 w-40 rounded-full" />
        <div className="mt-4 skeleton h-10 w-72 rounded-2xl" />
        <div className="mt-3 skeleton h-4 w-full max-w-2xl rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="skeleton h-52 rounded-[28px]" />
        <div className="skeleton h-52 rounded-[28px]" />
        <div className="skeleton h-52 rounded-[28px]" />
      </div>
      <div className="skeleton h-[360px] rounded-[32px]" />
    </div>
  );
}

export default function App() {
  const auth = useSupabaseAuth();
  const empresa = useEmpresa({
    user: auth.user,
    authEnabled: auth.authEnabled,
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [publicScreen, setPublicScreen] = useState('landing');
  const [appLoading, setAppLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [pageError, setPageError] = useState('');

  const [dashboardMetrics, setDashboardMetrics] = useState(emptyMetrics);
  const [financialRecords, setFinancialRecords] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [chargeRows, setChargeRows] = useState([]);
  const [chargePreviewModal, setChargePreviewModal] = useState(null);
  const [chargePreviewSending, setChargePreviewSending] = useState(false);
  const [automationRules, setAutomationRules] = useState(emptyAutomation);
  const [settingsOverview, setSettingsOverview] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [onboardingData, setOnboardingData] = useState(null);
  const [plansCatalog, setPlansCatalog] = useState([]);
  const [billingOverview, setBillingOverview] = useState(null);

  const [financialConfig, setFinancialConfig] = useState({
    multaPercentual: 2,
    jurosPercentualDia: 0.033,
  });

  const [viewFilters, setViewFilters] = useState({
    search: '',
    dateStart: '',
    dateEnd: '',
    status: 'todos',
    tipo: 'todos',
    companyFilter: '',
  });

  const [selectedFile, setSelectedFile] = useState(null);
  const [importType, setImportType] = useState('vencidos');
  const [processing, setProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [preview, setPreview] = useState(null);

  const [clearOverviewOpen, setClearOverviewOpen] = useState(false);
  const [clearOverviewLoading, setClearOverviewLoading] = useState(false);

  const currentCompanyId = empresa.activeCompanyId || '';
  const currentCompanyName = empresa.activeCompany?.nome || 'Nenhuma empresa ativa';
  const globalMode = empresa.isGlobalActive;
  const realCompanies = useMemo(
    () => empresa.companies.filter((company) => company.id !== GLOBAL_COMPANY_ID),
    [empresa.companies]
  );
  const currentUserRole = empresa.userRole;
  const currentUserId = auth.user?.id || '';

  useEffect(() => {
    financeService.setRuntimeContext({
      userId: auth.user?.id || '',
      companyId: currentCompanyId || '',
      isSystemAdmin: empresa.isSystemAdmin,
      userRole: empresa.userRole,
      companyName: currentCompanyName,
      companies: realCompanies,
    });
  }, [auth.user?.id, currentCompanyId, currentCompanyName, empresa.isSystemAdmin, empresa.userRole, realCompanies]);

  useEffect(() => {
    let alive = true;

    financeService.getPlansCatalog().then((plans) => {
      if (alive) {
        setPlansCatalog(plans || []);
      }
    });

    return () => {
      alive = false;
    };
  }, []);

  const showToast = useCallback((type, text) => {
    setToast({ type, text });
    window.clearTimeout(window.__bankextractToastTimeout);
    window.__bankextractToastTimeout = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshAllData = useCallback(async () => {
    if (empresa.loading) return;

    if (!currentCompanyId) {
      setDashboardMetrics(emptyMetrics);
      setFinancialRecords([]);
      setHistoryRows([]);
      setChargeRows([]);
      setSettingsOverview(null);
      setSystemStatus(null);
      setOnboardingData(null);
      setBillingOverview(null);
      return;
    }

    setAppLoading(true);
    setPageError('');

    try {
      await financeService.syncCompanyCatalog(realCompanies);

      const [metrics, records, history, charges, automation, settings, config, status, onboarding, plans, billing] =
        await Promise.all([
          financeService.getDashboardMetrics(currentCompanyId),
          financeService.getFinancialRecords(currentCompanyId, {}),
          financeService.getImportHistory(currentCompanyId),
          financeService.getCharges(currentCompanyId),
          financeService.getAutomationRules(currentCompanyId),
          financeService.getSettingsOverview(currentCompanyId, realCompanies),
          financeService.getFinancialConfig(currentCompanyId),
          financeService.getSystemStatus(currentCompanyId),
          financeService.getOnboardingStatus(currentCompanyId),
          financeService.getPlansCatalog(),
          financeService.getBillingOverview(currentCompanyId),
        ]);

      setDashboardMetrics(metrics);
      setFinancialRecords(records);
      setHistoryRows(history);
      setChargeRows(charges);
      setAutomationRules(automation);
      setSettingsOverview(settings);
      setFinancialConfig(config);
      setSystemStatus(status);
      setOnboardingData(onboarding);
      setPlansCatalog(plans || []);
      setBillingOverview(billing);
    } catch (error) {
      setPageError(error.message || 'Falha ao carregar os dados do frontend premium.');
    } finally {
      setAppLoading(false);
    }
  }, [currentCompanyId, empresa.loading, realCompanies]);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  useEffect(() => {
    const handleDashboardRefresh = () => {
      refreshAllData();
    };

    window.addEventListener('bankextract:dashboard-refresh', handleDashboardRefresh);
    return () => window.removeEventListener('bankextract:dashboard-refresh', handleDashboardRefresh);
  }, [refreshAllData]);

  useEffect(() => {
    setViewFilters({
      search: '',
      dateStart: '',
      dateEnd: '',
      status: 'todos',
      tipo: 'todos',
      companyFilter: globalMode ? '' : currentCompanyId,
    });
  }, [currentCompanyId, globalMode]);

  const filteredFinancialRows = useMemo(() => {
    return financialRecords.filter((row) => {
      if (viewFilters.companyFilter && row.company_id !== viewFilters.companyFilter) return false;
      if (viewFilters.status !== 'todos' && row.status !== viewFilters.status) return false;
      if (viewFilters.tipo !== 'todos' && (row.tipo || 'vencidos') !== viewFilters.tipo) return false;
      if (viewFilters.dateStart && row.data_vencimento < viewFilters.dateStart) return false;
      if (viewFilters.dateEnd && row.data_vencimento > viewFilters.dateEnd) return false;
      if (viewFilters.search) {
        const haystack = normalizeText(`${row.nome} ${row.numero_boleto}`);
        if (!haystack.includes(normalizeText(viewFilters.search))) return false;
      }
      return true;
    });
  }, [financialRecords, viewFilters]);

  const sidebarStats = useMemo(() => {
    const today = new Date();
    const aVencer = financialRecords
      .filter((row) => new Date(`${row.data_vencimento}T00:00:00`) >= today && row.status !== 'liquidado')
      .reduce((sum, row) => sum + row.valor, 0);
    const vencidos = financialRecords
      .filter((row) => new Date(`${row.data_vencimento}T00:00:00`) < today && row.status !== 'liquidado')
      .reduce((sum, row) => sum + row.valor, 0);
    const semTelefone = financialRecords.filter((row) => !String(row.telefone || '').trim()).length;
    return { aVencer, vencidos, semTelefone };
  }, [financialRecords]);

  const handleProcessImport = useCallback(async () => {
    if (!canUserPerformAction(currentUserRole, 'import_files')) {
      showToast('erro', 'Seu perfil atual nao pode processar importacoes.');
      return;
    }

    if (!currentCompanyId) {
      showToast('erro', 'Selecione uma empresa ativa para importar.');
      return;
    }
    if (globalMode) {
      showToast('erro', 'Selecione uma empresa especifica para importar dados.');
      return;
    }
    if (!selectedFile) {
      showToast('erro', 'Selecione um arquivo antes de processar.');
      return;
    }

    try {
      setProcessing(true);
      for (const stage of ['Enviando arquivo', 'Executando OCR', 'Estruturando dados', 'Validando registros']) {
        setProcessingStage(stage);
        await sleep(180);
      }

      const processed = await financeService.processImportFile(selectedFile, importType, currentCompanyId);
      setPreview(processed);
      showToast('sucesso', 'Previa gerada com sucesso.');
    } catch (error) {
      showToast('erro', error.message || 'Nao foi possivel processar o arquivo.');
    } finally {
      setProcessing(false);
      setProcessingStage('');
    }
  }, [currentCompanyId, currentUserRole, globalMode, importType, selectedFile, showToast]);

  const handleImportSelected = useCallback(async () => {
    if (!canUserPerformAction(currentUserRole, 'confirm_import')) {
      showToast('erro', 'Seu perfil atual nao pode confirmar importacoes.');
      return;
    }

    if (!preview) return;

    try {
      const batchId = makeUuid();
      await financeService.importSelectedRows(preview?.rows || [], batchId, currentCompanyId, {
        fileName: preview.fileName,
        tipo: importType,
        companyName: currentCompanyName,
      });
      await auditLog.importConfirmed(currentCompanyId, {
        arquivo: preview.fileName,
        registros: (preview?.rows || []).filter((row) => row.selected !== false).length,
        tipo: importType,
      }, currentUserId);
      setPreview(null);
      setSelectedFile(null);
      await refreshAllData();
      setActiveTab(importType === 'liquidacao' ? 'historico' : 'visao-geral');
      showToast('sucesso', 'Lote processado com batch_id e salvo com sucesso.');
    } catch (error) {
      showToast('erro', error.message || 'Nao foi possivel importar os registros selecionados.');
    }
  }, [currentCompanyId, currentCompanyName, currentUserRole, importType, preview, refreshAllData, showToast]);

  const handleUpdatePreviewField = useCallback((rowId, field, value) => {
    setPreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: (prev.rows || []).map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
      };
    });
  }, []);

  const handleTogglePreviewRow = useCallback((rowId) => {
    setPreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: (prev.rows || []).map((row) => (row.id === rowId ? { ...row, selected: row.selected === false } : row)),
      };
    });
  }, []);

  const handleToggleAllPreviewRows = useCallback(() => {
    setPreview((prev) => {
      if (!prev) return prev;
      const allSelected = (prev.rows || []).every((row) => row.selected !== false);
      return {
        ...prev,
        rows: (prev.rows || []).map((row) => ({ ...row, selected: allSelected ? false : true })),
      };
    });
  }, []);

  const handleDeleteHistory = useCallback(
    async (item) => {
      const confirmed = window.confirm(
        item.tipo === 'vencidos'
          ? 'Excluir este historico removera os registros financeiros do lote usando company_id + batch_id. Deseja continuar?'
          : 'Excluir este historico de liquidacao nao apagara registros financeiros. Deseja continuar?'
      );

      if (!confirmed) return;

      try {
        if (!canUserPerformAction(currentUserRole, 'delete_history')) {
          throw new Error('Seu perfil atual nao pode excluir historico.');
        }

        await financeService.deleteImportHistory(item);
        await auditLog.historyDeleted(item.company_id, { count: 1, ids: [item.id], batch_id: item.batch_id }, currentUserId);
        await refreshAllData();
        showToast('sucesso', 'Historico excluido com sucesso.');
      } catch (error) {
        showToast('erro', error.message || 'Falha ao excluir o historico.');
      }
    },
    [refreshAllData, showToast]
  );

  const handleViewBatch = useCallback(
    async (item) => {
      if (!item.batch_id) {
        showToast('erro', 'Este lote nao possui batch_id disponivel.');
        return;
      }

      const rows = await financeService.getBatchRows(item.company_id, item.batch_id);
      showToast(
        'sucesso',
        item.tipo === 'liquidacao'
          ? `Lote ${item.batch_id.slice(0, 8)} possui ${rows.length} registro(s) financeiro(s) associado(s).`
          : `Lote ${item.batch_id.slice(0, 8)} carregou ${rows.length} registro(s) na carteira.`
      );
    },
    [showToast]
  );

  const handleOpenClearOverview = useCallback(() => {
    if (!currentCompanyId) {
      showToast('erro', 'Selecione uma empresa ativa para limpar a visao geral.');
      return;
    }
    if (globalMode) {
      showToast('erro', 'Selecione uma empresa especifica para limpar a visao geral.');
      return;
    }
    setClearOverviewOpen(true);
  }, [currentCompanyId, globalMode, showToast]);

  const handleConfirmClearOverview = useCallback(async () => {
    try {
      if (!canUserPerformAction(currentUserRole, 'clear_overview')) {
        throw new Error('Seu perfil atual nao pode limpar a visao geral.');
      }

      setClearOverviewLoading(true);
      const affectedRecords = financialRecords.filter((row) => row.company_id === currentCompanyId).length;
      await financeService.clearOverview(currentCompanyId);
      await auditLog.viewCleared(currentCompanyId, { count: affectedRecords }, currentUserId);
      await refreshAllData();
      setClearOverviewOpen(false);
      showToast('sucesso', 'Visao geral limpa com sucesso.');
    } catch (error) {
      showToast('erro', error.message || 'Nao foi possivel limpar a visao geral.');
    } finally {
      setClearOverviewLoading(false);
    }
  }, [currentCompanyId, financialRecords, refreshAllData, showToast]);

  const handleFinancialConfigChange = useCallback(
    async (payload) => {
      setFinancialConfig((prev) => ({
        ...prev,
        ...payload,
      }));

      const shouldPersist =
        Object.prototype.hasOwnProperty.call(payload, 'multaPercentual') &&
        Object.prototype.hasOwnProperty.call(payload, 'jurosPercentualDia');

      if (!shouldPersist || !currentCompanyId || globalMode) {
        return;
      }

      try {
        if (!canUserPerformAction(currentUserRole, 'manage_company_settings')) {
          throw new Error('Seu perfil atual nao pode alterar configuracoes financeiras.');
        }

        const saved = await financeService.saveFinancialConfig(currentCompanyId, payload);
        setFinancialConfig(saved);
        await auditLog.financialConfigChanged(currentCompanyId, payload, currentUserId);
        await refreshAllData();
        showToast('sucesso', 'Configuracao financeira salva com sucesso.');
      } catch (error) {
        showToast('erro', error.message || 'Nao foi possivel salvar a configuracao financeira.');
      }
    },
    [currentCompanyId, globalMode, refreshAllData, showToast]
  );

  const handleExport = useCallback(
    (format) => {
      if (!canUserPerformAction(currentUserRole, 'export_data')) {
        showToast('erro', 'Seu perfil atual nao pode exportar dados.');
        return;
      }

      if (!filteredFinancialRows.length) {
        showToast('erro', 'Nao ha registros para exportar.');
        return;
      }

      const separator = format === 'csv' ? ';' : '\t';
      const header = ['Cliente', 'Documento', 'Vencimento', 'Valor', 'Telefone', 'Status', 'batch_id'];
      const lines = filteredFinancialRows.map((row) =>
        [
          sanitizeSpreadsheetCell(row.nome),
          sanitizeSpreadsheetCell(row.numero_boleto),
          sanitizeSpreadsheetCell(row.data_vencimento),
          sanitizeSpreadsheetCell(String(row.valor).replace('.', ',')),
          sanitizeSpreadsheetCell(row.telefone || ''),
          sanitizeSpreadsheetCell(row.status),
          sanitizeSpreadsheetCell(row.batch_id || ''),
        ].join(separator)
      );

      const blob = new Blob([[header.join(separator), ...lines].join('\n')], {
        type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `bankextract-${activeTab}.${format === 'csv' ? 'csv' : 'xls'}`;
      anchor.click();
      URL.revokeObjectURL(url);
      auditLog.exportData(currentCompanyId, { count: filteredFinancialRows.length, filters: viewFilters, format }, currentUserId);
    },
    [activeTab, currentCompanyId, currentUserId, currentUserRole, filteredFinancialRows, showToast, viewFilters]
  );

  const handleGenerateChargeMessage = useCallback(
    (row) => {
      const message = row?._editedMessage ? row.mensagem : buildChargeMessage(row, currentCompanyName);
      setChargeRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                mensagem: message,
                _editedMessage: Boolean(item._editedMessage),
              }
            : item
        )
      );
      setChargePreviewModal({
        open: true,
        row: {
          ...row,
          mensagem: message,
        },
        message,
      });
    },
    [currentCompanyName]
  );

  const handleSendCharge = useCallback(
    async (row) => {
      try {
        if (!canUserPerformAction(currentUserRole, 'manage_charges')) {
          throw new Error('Seu perfil atual nao pode enviar cobrancas.');
        }

        const latestRow =
          chargeRows.find((item) => item.id === row.id) ||
          chargeRows.find((item) => item.registro_id === (row.registro_id || row.id)) ||
          row;

        const payload = {
          ...latestRow,
          ...row,
          mensagem: row.mensagem || latestRow.mensagem,
          _editedMessage: Boolean(row._editedMessage || latestRow._editedMessage),
        };

        const result = await financeService.sendWhatsAppCharge(payload, 'manual');
        await auditLog.whatsappSent(
          payload.company_id || currentCompanyId,
          result?.chargeId || payload.registro_id || payload.id,
          { mocked: Boolean(result?.mocked), status: result?.status, mode: 'manual' },
          currentUserId
        );
        const nextCharges = await financeService.getCharges(currentCompanyId);
        setChargeRows(nextCharges);
        await refreshAllData();
        if (result?.mocked) {
          showToast('aviso', 'Cobranca registrada em modo teste (mock_enviado). Configure os secrets Z-API para envio real.');
        } else if (result?.status === 'sem telefone') {
          showToast('aviso', 'Registro sem telefone - cobranca nao enviada.');
        } else {
          showToast('sucesso', 'Cobranca enviada com sucesso via WhatsApp.');
        }
      } catch (error) {
        showToast('erro', error.message || 'Falha ao enviar cobranca via WhatsApp.');
      }
    },
    [chargeRows, currentCompanyId, currentUserId, currentUserRole, refreshAllData, showToast]
  );

  const handleChargePreviewMessageChange = useCallback((value) => {
    setChargePreviewModal((prev) => (prev ? { ...prev, message: value } : prev));
    setChargeRows((prev) =>
      prev.map((item) =>
        item.id === chargePreviewModal?.row?.id
          ? { ...item, mensagem: value, _editedMessage: true }
          : item
      )
    );
  }, [chargePreviewModal?.row?.id]);

  const handleCopyChargeMessage = useCallback(async () => {
    if (!chargePreviewModal?.message) return;

    try {
      await navigator.clipboard.writeText(chargePreviewModal.message);
      showToast('sucesso', 'Mensagem copiada com sucesso.');
    } catch {
      showToast('erro', 'Não foi possível copiar a mensagem.');
    }
  }, [chargePreviewModal, showToast]);

  const handleSendChargeFromPreview = useCallback(async () => {
    if (!chargePreviewModal?.row) return;

    const nextRow = {
      ...chargePreviewModal.row,
      mensagem: chargePreviewModal.message,
    };

    setChargePreviewSending(true);
    setChargeRows((prev) =>
      prev.map((item) => (item.id === nextRow.id ? { ...item, mensagem: nextRow.mensagem } : item))
    );

    try {
      await handleSendCharge(nextRow);
      setChargePreviewModal(null);
    } finally {
      setChargePreviewSending(false);
    }
  }, [chargePreviewModal, handleSendCharge]);

  const handleToggleAutomationRule = useCallback((day) => {
    setAutomationRules((prev) => ({
      ...prev,
      rules: prev.rules.map((rule, index) => {
        const ruleKey = rule.id || rule.day || `rule-${index}`;
        return ruleKey === day ? { ...rule, active: !rule.active } : rule;
      }),
    }));
  }, []);

  const handleSaveAutomationRules = useCallback(async (nextRules = null) => {
    if (!canUserPerformAction(currentUserRole, 'manage_automations')) {
      showToast('erro', 'Seu perfil atual nao pode alterar automacoes.');
      return;
    }

    const payload = nextRules || automationRules;
    await financeService.saveAutomationRules(currentCompanyId, payload);
    if (nextRules) {
      setAutomationRules((prev) => ({
        ...prev,
        ...nextRules,
      }));
    }
    await refreshAllData();
    showToast('sucesso', 'Regras de automacao salvas.');
  }, [automationRules, currentCompanyId, currentUserRole, refreshAllData, showToast]);

  const handleOpenOnboardingStep = useCallback((step) => {
    if (step?.actionTab) {
      setActiveTab(step.actionTab);
    }
  }, []);

  const handleChoosePlan = useCallback(
    (plan) => {
      if (!plan?.id) return;
      showToast('sucesso', `Plano ${plan.name} selecionado no modo comercial. Conecte o billing real depois.`);
      setActiveTab('billing');
    },
    [showToast]
  );

  const sectionHeader = headerMap[activeTab] || headerMap.dashboard;

  let currentContent = null;

  if (!currentCompanyId && empresa.isSystemAdmin && companyDependentTabs.has(activeTab)) {
    currentContent = (
      <div className="rounded-[32px] border border-slate-200 bg-white p-10 text-center shadow-soft">
        <h2 className="text-2xl font-semibold text-slate-900">Nenhuma empresa ativa selecionada</h2>
        <p className="mt-3 text-sm text-slate-500">
          O administrador geral pode continuar sem empresa, mas para operar importacoes, carteira e integracoes e
          preciso escolher uma empresa especifica ou o modo global.
        </p>
      </div>
    );
  } else {
    switch (activeTab) {
      case 'landing':
        currentContent = (
          <LandingPage
            isAuthenticated
            onStartNow={() => setActiveTab('dashboard')}
            onOpenPlans={() => setActiveTab('planos')}
          />
        );
        break;
      case 'dashboard':
        currentContent = <DashboardScreen metrics={dashboardMetrics} />;
        break;
      case 'onboarding':
        currentContent = (
          <OnboardingScreen
            onboarding={onboardingData}
            companyName={currentCompanyName}
            onOpenStep={handleOpenOnboardingStep}
          />
        );
        break;
      case 'importacao':
        currentContent = (
          <ImportacaoScreen
            companies={empresa.companies}
            activeCompanyId={currentCompanyId}
            setActiveCompanyId={empresa.setActiveCompanyId}
            importType={importType}
            setImportType={setImportType}
            selectedFile={selectedFile}
            onFileSelect={setSelectedFile}
            onProcess={handleProcessImport}
            processingStage={processingStage}
            processing={processing}
            preview={preview}
            onTogglePreviewRow={handleTogglePreviewRow}
            onToggleAllPreviewRows={handleToggleAllPreviewRows}
            onUpdatePreviewField={handleUpdatePreviewField}
            onDiscardPreview={() => setPreview(null)}
            onImportSelected={handleImportSelected}
            userRole={empresa.userRole}
          />
        );
        break;
      case 'visao-geral':
        currentContent = (
          <VisaoGeralScreen
            companies={empresa.companies}
            activeCompanyId={currentCompanyId}
            activeCompanyName={currentCompanyName}
            globalMode={globalMode}
            filters={viewFilters}
            setFilters={setViewFilters}
            rows={filteredFinancialRows}
            config={financialConfig}
            onConfigChange={handleFinancialConfigChange}
            onExportCsv={() => handleExport('csv')}
            onExportExcel={() => handleExport('excel')}
            onOpenClearOverview={handleOpenClearOverview}
            clearOverviewModalOpen={clearOverviewOpen}
            clearOverviewLoading={clearOverviewLoading}
            onCloseClearOverview={() => setClearOverviewOpen(false)}
            onConfirmClearOverview={handleConfirmClearOverview}
            userRole={empresa.userRole}
            onToast={showToast}
            onRequestRefresh={refreshAllData}
            currentUserId={currentUserId}
          />
        );
        break;
      case 'historico':
        currentContent = (
          <HistoricoScreen
            rows={historyRows}
            onViewBatch={handleViewBatch}
            onDeleteItem={handleDeleteHistory}
          />
        );
        break;
      case 'cobrancas':
        currentContent = (
          <CobrancasScreen
            rows={chargeRows}
            onGenerateMessage={handleGenerateChargeMessage}
            onSend={handleSendCharge}
            userRole={empresa.userRole}
          />
        );
        break;
      case 'central-cobranca':
        currentContent = (
          <CentralCobrancaScreen
            companyId={globalMode ? null : currentCompanyId}
            activeCompanyId={currentCompanyId}
            activeCompany={empresa.activeCompany}
            companyName={currentCompanyName}
            globalMode={globalMode}
            userRole={empresa.userRole}
            onToast={showToast}
          />
        );
        break;
      case 'historico-cobranca':
        currentContent = (
          <HistoricoCobrancaScreen
            companyId={globalMode ? null : currentCompanyId}
            activeCompanyId={currentCompanyId}
            activeCompany={empresa.activeCompany}
            companyName={currentCompanyName}
            globalMode={globalMode}
            userRole={empresa.userRole}
            onToast={showToast}
          />
        );
        break;
      case 'inconsistencias':
        currentContent = (
          <InconsistenciasCobrancaScreen
            companyId={globalMode ? null : currentCompanyId}
            activeCompanyId={currentCompanyId}
            activeCompany={empresa.activeCompany}
            companyName={currentCompanyName}
            globalMode={globalMode}
            userRole={empresa.userRole}
            onToast={showToast}
          />
        );
        break;
      case 'pronto-envio':
        currentContent = (
          <ChecklistEnvioRealScreen
            companyId={globalMode ? null : currentCompanyId}
            activeCompanyId={currentCompanyId}
            activeCompany={empresa.activeCompany}
            companyName={currentCompanyName}
            globalMode={globalMode}
            onToast={showToast}
          />
        );
        break;
      case 'automacoes':
        currentContent = (
          <AutomacoesScreen
            companyId={globalMode ? GLOBAL_COMPANY_ID : currentCompanyId}
            activeCompanyId={currentCompanyId}
            activeCompany={empresa.activeCompany}
            companyName={currentCompanyName}
            globalMode={globalMode}
            userRole={empresa.userRole}
            rules={automationRules}
            onToggleRule={handleToggleAutomationRule}
            onSaveRules={handleSaveAutomationRules}
            onToast={showToast}
          />
        );
        break;
      case 'integracoes':
        currentContent = (
          <IntegracoesScreen
            companyId={globalMode ? null : currentCompanyId}
            companyName={currentCompanyName}
            globalMode={globalMode}
            onGoogleSheetsSaved={async () => {
              await refreshAllData();
              showToast('sucesso', 'Integracao atualizada.');
            }}
          />
        );
        break;
      case 'configuracoes':
        currentContent = (
          <ConfiguracoesScreen
            companyName={currentCompanyName}
            activeCompany={empresa.activeCompany}
            settings={settingsOverview}
            isSystemAdmin={empresa.isSystemAdmin}
            userRole={empresa.userRole}
          />
        );
        break;
      case 'status-sistema':
        currentContent = <SystemStatusScreen status={systemStatus} />;
        break;
      case 'planos':
        currentContent = (
          <PlanosScreen
            plans={plansCatalog}
            currentPlanId={billingOverview?.currentPlan?.id}
            onChoosePlan={handleChoosePlan}
          />
        );
        break;
      case 'billing':
        currentContent = <BillingScreen billing={billingOverview} onOpenPlans={() => setActiveTab('planos')} />;
        break;
      default:
        currentContent = <DashboardScreen metrics={dashboardMetrics} companyId={currentCompanyId} />;
        break;
    }
  }

  if (auth.authEnabled && auth.loading && !auth.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-soft">
          Carregando sessao...
        </div>
      </div>
    );
  }

  if (auth.authEnabled && !auth.user) {
    if (publicScreen === 'landing') {
      return (
        <div className="min-h-screen bg-[#F7F9FC] px-4 py-6 lg:px-6">
          <div className="mx-auto max-w-7xl">
            <Suspense fallback={<ScreenFallback />}>
              <LandingPage
                onStartNow={() => setPublicScreen('login')}
                onOpenPlans={() => setPublicScreen('planos')}
              />
            </Suspense>
          </div>
        </div>
      );
    }

    if (publicScreen === 'planos') {
      return (
        <div className="min-h-screen bg-[#F7F9FC] px-4 py-6 lg:px-6">
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-soft">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Planos do BankExtract</h1>
                <p className="text-sm text-slate-500">Compare os pacotes comerciais antes do login.</p>
              </div>
            <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPublicScreen('landing')}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Voltar para landing
                </button>
                <button
                  type="button"
                  onClick={() => setPublicScreen('login')}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Comecar agora
                </button>
              </div>
            </div>
            <Suspense fallback={<ScreenFallback />}>
              <PlanosScreen plans={plansCatalog} currentPlanId={null} onChoosePlan={() => setPublicScreen('login')} />
            </Suspense>
          </div>
        </div>
      );
    }

    return (
      <LoginScreen
        onSignIn={auth.signIn}
        onSignUp={auth.signUp}
        loading={auth.submitting}
        error={auth.error}
        onBackToLanding={() => setPublicScreen('landing')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-slate-900">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeCompanyId={currentCompanyId}
          setActiveCompanyId={empresa.setActiveCompanyId}
          companies={empresa.companies}
          activeCompany={empresa.activeCompany}
          stats={sidebarStats}
          isSystemAdmin={empresa.isSystemAdmin}
          onOpenCompanyModal={empresa.openCompanyModal}
        />

        <main className="flex-1 p-4 lg:p-6">
          <Header title={sectionHeader.title} subtitle={sectionHeader.subtitle} companyName={currentCompanyName} />

          {auth.authEnabled && auth.user ? (
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-soft">
              Sessao ativa: <span className="font-medium text-slate-900">{auth.user.email}</span>
            </div>
          ) : null}

          {empresa.error ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {empresa.error}
            </div>
          ) : null}

          {pageError ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {pageError}
            </div>
          ) : null}

          {toast ? (
            <div className="mb-4">
              <div
                className={`inline-flex max-w-2xl items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-medium shadow-soft ${
                  toast.type === 'sucesso'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : toast.type === 'aviso'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-current/80" />
                <span>{toast.text}</span>
              </div>
            </div>
          ) : null}

          {empresa.loading || appLoading ? (
            <div className="rounded-[32px] border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-soft">
              {empresa.loading ? 'Carregando empresas e permissoes...' : 'Atualizando dados da tela...'}
            </div>
          ) : (
            <Suspense fallback={<ScreenFallback />}>
              <ErrorBoundary key={activeTab}>
                {currentContent}
              </ErrorBoundary>
            </Suspense>
          )}

          <MessagePreviewModal
            modal={chargePreviewModal}
            sending={chargePreviewSending}
            onClose={() => (chargePreviewSending ? null : setChargePreviewModal(null))}
            onChangeMessage={handleChargePreviewMessageChange}
            onCopy={handleCopyChargeMessage}
            onSend={handleSendChargeFromPreview}
          />
        </main>
      </div>

      <EmpresaModal
        isOpen={empresa.modalOpen}
        mode={empresa.modalMode}
          setMode={empresa.setModalMode}
          allowCreate={empresa.isSystemAdmin}
          onClose={empresa.closeModal}
          onContinueWithoutCompany={empresa.continueWithoutCompany}
          form={empresa.modalForm}
          setField={empresa.setModalField}
          error={empresa.modalError}
          saving={empresa.saving}
          onCreate={empresa.createCompany}
          onJoin={empresa.joinCompany}
        />
    </div>
  );
}
