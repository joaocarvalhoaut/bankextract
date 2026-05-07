import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import EmpresaModal from './components/EmpresaModal';
import ErrorBoundary from './components/ErrorBoundary';
import MessagePreviewModal from './components/MessagePreviewModal';
import Sidebar from './components/Sidebar';
import { buildDashboardFinancialData } from './services/analyticsService';
import { getCollectionToneMeta } from './services/collectionMessageService';
import { useEmpresa } from './hooks/useEmpresa';
import { useSupabaseAuth } from './hooks/useSupabaseAuth';
import { getOnboardingStatus, markOnboardingStep } from './services/onboardingService';
import { createNotification, syncTrialEndingNotification } from './services/notificationService';
import { getPlans, getUsageLimits, updateCompanyPlan } from './services/subscriptionService';
import { incrementUsage } from './services/usageService';
import { financeService, sanitizeSpreadsheetCell } from './services/financeService.ts';
import LoginScreen from './screens/LoginScreen';
import { GLOBAL_COMPANY_ID } from './services/companyService';
import { auditLog } from './services/auditService';
import { createAuditEvent } from './services/auditTimelineService';
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
const AnalyticsScreen = lazy(() => import('./screens/AnalyticsScreen'));
const AdminSaasScreen = lazy(() => import('./screens/AdminSaasScreen'));
const NotificationsScreen = lazy(() => import('./screens/NotificationsScreen'));
const AuditTimelineScreen = lazy(() => import('./screens/AuditTimelineScreen'));
const HelpCenterScreen = lazy(() => import('./screens/HelpCenterScreen'));
const ProductionChecklistScreen = lazy(() => import('./screens/ProductionChecklistScreen'));

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
  analytics: {
    title: 'Analytics interno',
    subtitle: 'Indicadores financeiros, cobrancas simuladas e leituras operacionais por empresa.',
  },
  audit: {
    title: 'Auditoria visual',
    subtitle: 'Timeline operacional com eventos financeiros, comerciais e administrativos por empresa.',
  },
  notifications: {
    title: 'Centro de notificacoes',
    subtitle: 'Eventos operacionais, alertas de plano e sinais comerciais por empresa.',
  },
  help: {
    title: 'Central de ajuda',
    subtitle: 'Guias praticos, onboarding rico e perguntas frequentes para operar o BankExtract.',
  },
  'production-checklist': {
    title: 'Checklist de producao',
    subtitle: 'Validacao interna para garantir que o BankExtract esta pronto para cliente piloto.',
  },
  'admin-saas': {
    title: 'Admin SaaS',
    subtitle: 'Painel master para acompanhar empresas, assinaturas internas, uso e auditoria.',
  },
};

const companyDependentTabs = new Set(['importacao', 'visao-geral', 'historico', 'cobrancas', 'central-cobranca', 'historico-cobranca', 'inconsistencias', 'pronto-envio', 'automacoes', 'integracoes', 'analytics', 'notifications', 'audit', 'production-checklist']);

const tabPathMap = {
  dashboard: '/dashboard',
  onboarding: '/onboarding',
  importacao: '/importacao',
  'visao-geral': '/visao-geral',
  historico: '/historico',
  analytics: '/analytics',
  notifications: '/notifications',
  audit: '/audit',
  help: '/help',
  'production-checklist': '/production-checklist',
  cobrancas: '/cobrancas',
  'central-cobranca': '/central-cobranca',
  'historico-cobranca': '/historico-cobranca',
  inconsistencias: '/inconsistencias',
  'pronto-envio': '/pronto-envio',
  automacoes: '/automacoes',
  integracoes: '/integracoes',
  configuracoes: '/configuracoes',
  'status-sistema': '/status-sistema',
  planos: '/planos',
  billing: '/billing',
  'admin-saas': '/admin-saas',
};

const pathTabMap = Object.fromEntries(Object.entries(tabPathMap).map(([tab, path]) => [path, tab]));

const getCurrentPathname = () => (typeof window !== 'undefined' ? window.location.pathname || '/' : '/');

const resolveTabFromPath = (pathname) => pathTabMap[pathname] || 'dashboard';

const resolvePublicScreenFromPath = (pathname) => {
  if (pathname === '/') return 'landing';
  if (pathname === '/planos') return 'planos';
  if (pathname === '/login') return 'login';
  return 'login';
};

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

  const initialPath = getCurrentPathname();
  const [activeTab, setActiveTab] = useState(() => resolveTabFromPath(initialPath));
  const [publicScreen, setPublicScreen] = useState(() => resolvePublicScreenFromPath(initialPath));
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
  const [markingOnboardingStepId, setMarkingOnboardingStepId] = useState('');
  const [skippedOnboardingStepIds, setSkippedOnboardingStepIds] = useState([]);

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
  const onboardingSkipStorageKey = `bankextract.onboarding.skipped.${currentCompanyId || 'sem-empresa'}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(onboardingSkipStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setSkippedOnboardingStepIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSkippedOnboardingStepIds([]);
    }
  }, [onboardingSkipStorageKey]);

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

    getPlans().then((plans) => {
      if (alive) {
        setPlansCatalog(plans || []);
      }
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      const pathname = getCurrentPathname();
      setActiveTab(resolveTabFromPath(pathname));

      if (!auth.user) {
        setPublicScreen(resolvePublicScreenFromPath(pathname));
        return;
      }

      if (pathname === '/') {
        setPublicScreen('public-landing-auth');
      } else if (pathname === '/planos') {
        setPublicScreen('public-planos-auth');
      } else {
        setPublicScreen('app');
      }
    };

    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, [auth.user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let nextPath = '/dashboard';
    if (!auth.user) {
      nextPath = publicScreen === 'planos' ? '/planos' : publicScreen === 'login' ? '/login' : '/';
    } else if (publicScreen === 'public-landing-auth') {
      nextPath = '/';
    } else if (publicScreen === 'public-planos-auth') {
      nextPath = '/planos';
    } else {
      nextPath = tabPathMap[activeTab] || '/dashboard';
    }

    if (window.location.pathname !== nextPath) {
      window.history.replaceState({}, '', nextPath);
    }
  }, [activeTab, auth.user, publicScreen]);

  const showToast = useCallback((type, text) => {
    setToast({ type, text });
    window.clearTimeout(window.__bankextractToastTimeout);
    window.__bankextractToastTimeout = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const handleViewPublicSite = useCallback(() => {
    setPublicScreen('public-landing-auth');
  }, []);

  const handleOpenNotifications = useCallback(() => {
    setPublicScreen('app');
    setActiveTab('notifications');
  }, []);

  const handleHeaderNavigation = useCallback((nextTab) => {
    if (nextTab === 'notifications') {
      handleOpenNotifications();
      return;
    }

    if (nextTab) {
      setPublicScreen('app');
      setActiveTab(nextTab);
    }
  }, [handleOpenNotifications]);

  const handleOpenEmpresaModal = useCallback((mode = 'criar') => {
    empresa.openCompanyModal?.(mode);
  }, [empresa]);

  const handleSignOut = useCallback(async () => {
    try {
      await auth.signOut();
      setPublicScreen('landing');
      setActiveTab('dashboard');
      setPreview(null);
      setChargePreviewModal(null);
      showToast('sucesso', 'Sessao encerrada com sucesso.');
    } catch (error) {
      showToast('erro', error.message || 'Nao foi possivel sair da conta.');
    }
  }, [auth, showToast]);

  const refreshAllData = useCallback(async () => {
    if (empresa.loading) return;

    if (!currentCompanyId) {
      setDashboardMetrics(emptyMetrics);
      setFinancialRecords([]);
      setHistoryRows([]);
      setChargeRows([]);
      setSettingsOverview(null);
      setSystemStatus(null);
      setOnboardingData(await getOnboardingStatus(''));
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
          getOnboardingStatus(currentCompanyId),
          getPlans(),
          getUsageLimits(currentCompanyId),
        ]);

      const dashboardFinancial = buildDashboardFinancialData(records || []);
      setDashboardMetrics({
        ...(metrics || {}),
        kpis: dashboardFinancial.kpis,
        charts: {
          aging: dashboardFinancial.charts?.aging || [],
          importacoes: dashboardFinancial.charts?.importacoes || [],
          statusDistribution: dashboardFinancial.charts?.statusDistribution || [],
        },
        financialSummary: dashboardFinancial.summary,
        nextDueRows: dashboardFinancial.nextDueRows || [],
        biggestOpenRows: dashboardFinancial.biggestOpenRows || [],
        hasFinancialData: dashboardFinancial.hasData,
        operational: {
          autoChargeActive: metrics?.autoChargeActive || false,
          whatsappMockMode: metrics?.whatsappMockMode || false,
          lastAutoExecution: metrics?.lastAutoExecution || 'Nunca executada',
          nextRunHint: metrics?.autoChargeHour ? `Janela ${metrics.autoChargeHour}` : 'Automacao inativa',
          recentAuditAction: metrics?.recentAuditLogs?.[0]?.action || 'Sem atividade',
        },
      });
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

      const overdueCount = (records || []).filter((row) => {
        const dueDate = row?.data_vencimento || row?.vencimento || row?.due_date;
        const statusValue = String(row?.status || '').toLowerCase();
        if (!dueDate || statusValue === 'liquidado' || statusValue === 'pago') return false;
        return new Date(`${dueDate}T00:00:00`).getTime() < Date.now();
      }).length;

      if (currentCompanyId && overdueCount > 0) {
        try {
          await createNotification(currentCompanyId, {
            type: 'boleto_overdue',
            title: 'Titulos vencidos em acompanhamento',
            message: `Existem ${overdueCount} boleto(s) vencido(s) aguardando acao na empresa ativa.`,
            severity: overdueCount >= 10 ? 'danger' : 'warning',
            metadata: {
              overdue_count: overdueCount,
              dedupe_key: `overdue:${currentCompanyId}:${new Date().toISOString().slice(0, 10)}`,
            },
          });
        } catch {
          // Nao interrompe o carregamento principal por falha no centro de notificacoes.
        }
      }

      if (currentCompanyId && billing) {
        try {
          await syncTrialEndingNotification(currentCompanyId, billing);
        } catch {
          // Nao interrompe o carregamento principal por falha no centro de notificacoes.
        }
      }
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
      createAuditEvent(currentCompanyId, {
        action: 'import_created',
        entity_type: 'importacoes',
        title: 'Previa de importacao criada',
        description: `Arquivo ${selectedFile?.name || 'sem nome'} processado para revisao antes da confirmacao.`,
        metadata: {
          arquivo: selectedFile?.name || '',
          tipo: importType,
        },
        userId: currentUserId,
        severity: 'info',
      }).catch(() => {});
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
      try {
        await createNotification(currentCompanyId, {
          type: 'import_completed',
          title: 'Importacao concluida',
          message: `${(preview?.rows || []).filter((row) => row.selected !== false).length} registro(s) foram confirmados no lote ${preview.fileName || 'sem nome'}.`,
          severity: 'success',
          metadata: {
            import_type: importType,
            file_name: preview.fileName || '',
          },
        });
      } catch {
        // Mantem a importacao concluida mesmo sem persistir a notificacao.
      }
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
        originalMessage: message,
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
        if (result?.mocked) {
          await createAuditEvent(payload.company_id || currentCompanyId, {
            action: 'whatsapp_simulated',
            entity_type: 'cobrancas_whatsapp',
            entity_id: result?.chargeId || payload.registro_id || payload.id,
            title: 'Cobranca simulada',
            description: `Cobranca simulada para ${payload.cliente || 'cliente selecionado'}.`,
            metadata: {
              mocked: true,
              status: result?.status,
              mode: 'manual',
              documento: payload.documento || payload.numero_boleto || '',
            },
            severity: 'info',
          });
        } else {
          await auditLog.whatsappSent(
            payload.company_id || currentCompanyId,
            result?.chargeId || payload.registro_id || payload.id,
            { mocked: false, status: result?.status, mode: 'manual' },
            currentUserId
          );
        }
        const nextCharges = await financeService.getCharges(currentCompanyId);
        setChargeRows(nextCharges);
        await refreshAllData();
        if (result?.mocked) {
          await incrementUsage(payload.company_id || currentCompanyId, 'charges_month', 1);
          try {
            await createNotification(payload.company_id || currentCompanyId, {
              type: 'charge_sent',
              title: 'Cobranca registrada',
              message: `A cobranca do documento ${payload.documento || payload.numero_boleto || 'sem identificacao'} foi registrada em modo simulacao.`,
              severity: 'info',
              metadata: {
                registro_id: payload.registro_id || payload.id || null,
                mocked: true,
              },
            });
          } catch {
            // Nao interrompe o fluxo principal de cobranca.
          }
          showToast('aviso', 'Cobranca registrada em modo teste (mock_enviado). Configure os secrets Z-API para envio real.');
        } else if (result?.status === 'sem telefone') {
          showToast('aviso', 'Registro sem telefone - cobranca nao enviada.');
        } else {
          await incrementUsage(payload.company_id || currentCompanyId, 'charges_month', 1);
          try {
            await createNotification(payload.company_id || currentCompanyId, {
              type: 'charge_sent',
              title: 'Cobranca enviada',
              message: `A cobranca do documento ${payload.documento || payload.numero_boleto || 'sem identificacao'} foi enviada com sucesso.`,
              severity: 'success',
              metadata: {
                registro_id: payload.registro_id || payload.id || null,
                mocked: false,
              },
            });
          } catch {
            // Nao interrompe o fluxo principal de cobranca.
          }
          showToast('sucesso', 'Cobranca enviada com sucesso via WhatsApp.');
        }
      } catch (error) {
        await auditLog.whatsappFailed(
          row.company_id || currentCompanyId,
          row.registro_id || row.id || null,
          {
            error: error.message || 'Falha ao enviar a cobranca via WhatsApp.',
            mode: 'manual',
            documento: row.documento || row.numero_boleto || '',
          },
          currentUserId
        );
        try {
          await createNotification(row.company_id || currentCompanyId, {
            type: 'charge_failed',
            title: 'Falha no envio da cobranca',
            message: error.message || 'Falha ao enviar a cobranca via WhatsApp.',
            severity: 'danger',
            metadata: {
              registro_id: row.registro_id || row.id || null,
            },
          });
        } catch {
          // Nao sobrescreve o erro principal de cobranca.
        }
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

  const handleChargePreviewCollectionGenerated = useCallback(
    async (result) => {
      const toneMeta = getCollectionToneMeta(result.tone);
      const row = chargePreviewModal?.row;
      if (!row) return;

      await createAuditEvent(row.company_id || currentCompanyId, {
        action: 'collection_ai_generated',
        entity_type: 'cobrancas_whatsapp',
        entity_id: row.registro_id || row.id || null,
        title: 'Mensagem inteligente gerada',
        description: `IA local gerou uma mensagem com tom ${toneMeta.label.toLowerCase()}.`,
        metadata: {
          tone: result.tone,
          tone_label: toneMeta.label,
          documento: row.documento || row.numero_boleto || '',
        },
        severity: toneMeta.severity === 'danger' ? 'danger' : toneMeta.severity === 'warning' ? 'warning' : 'info',
      });

      if (result.tone === 'firme' || result.tone === 'juridico') {
        await createNotification(row.company_id || currentCompanyId, {
          type: 'collection_ai_tone',
          title: `Tom ${toneMeta.label} usado no modal principal`,
          message: `Uma mensagem de cobranca foi gerada com tom ${toneMeta.label.toLowerCase()}.`,
          severity: result.tone === 'juridico' ? 'danger' : 'warning',
          metadata: {
            tone: result.tone,
            documento: row.documento || row.numero_boleto || '',
          },
        });
      }
    },
    [chargePreviewModal?.row, currentCompanyId]
  );

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
    createAuditEvent(currentCompanyId, {
      action: 'automation_scheduled',
      entity_type: 'automacoes',
      title: 'Automação salva',
      description: 'Regras de cobrança automática atualizadas',
      userId: currentUserId,
      severity: 'info',
    }).catch(() => {});
    await refreshAllData();
    showToast('sucesso', 'Regras de automacao salvas.');
  }, [automationRules, currentCompanyId, currentUserRole, refreshAllData, showToast]);

  const handleOpenOnboardingStep = useCallback((step) => {
    if (step?.actionTab) {
      setActiveTab(step.actionTab);
    }
  }, []);

  const handleOpenHelpArticle = useCallback((articleId) => {
    setActiveTab('help');
    if (articleId && typeof window !== 'undefined') {
      window.setTimeout(() => {
        const element = document.getElementById(`help-article-${articleId}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, []);

  const handleMarkOnboardingStep = useCallback(
    async (step) => {
      if (!currentCompanyId) {
        showToast('erro', 'Selecione uma empresa antes de marcar uma etapa do onboarding.');
        return;
      }

      if (!step?.id) return;

      setMarkingOnboardingStepId(step.id);
      try {
        await markOnboardingStep(currentCompanyId, step.id);
        setSkippedOnboardingStepIds((current) => {
          const next = current.filter((item) => item !== step.id);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(onboardingSkipStorageKey, JSON.stringify(next));
          }
          return next;
        });
        const refreshed = await getOnboardingStatus(currentCompanyId);
        setOnboardingData(refreshed);
        showToast('sucesso', 'Etapa do onboarding marcada como concluida.');
      } catch (error) {
        showToast('erro', error.message || 'Nao foi possivel marcar a etapa do onboarding.');
      } finally {
        setMarkingOnboardingStepId('');
      }
    },
    [currentCompanyId, onboardingSkipStorageKey, showToast]
  );

  const handleSkipOnboardingStep = useCallback((step) => {
    if (!step?.id) return;
    setSkippedOnboardingStepIds((current) => {
      if (current.includes(step.id)) return current;
      const next = [...current, step.id];
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(onboardingSkipStorageKey, JSON.stringify(next));
      }
      return next;
    });
    showToast('aviso', 'Etapa pulada por enquanto. Voce pode retoma-la a qualquer momento na Central de Ajuda ou no Onboarding.');
  }, [onboardingSkipStorageKey, showToast]);

  const handleChoosePlan = useCallback(
    async (plan) => {
      if (!plan?.id) return;
      if (!currentCompanyId) {
        showToast('erro', 'Selecione uma empresa antes de alterar o plano.');
        return;
      }

      await updateCompanyPlan(currentCompanyId, plan.id);
      createAuditEvent(currentCompanyId, {
        action: 'plan_changed',
        entity_type: 'empresas',
        title: 'Plano alterado',
        description: `Plano atualizado para ${plan.name}`,
        metadata: { to: plan.id, plan_name: plan.name },
        userId: currentUserId,
        severity: 'info',
      }).catch(() => {});
      await refreshAllData();
      showToast('sucesso', `Plano ${plan.name} atualizado na estrutura interna do SaaS.`);
      setActiveTab('billing');
    },
    [currentCompanyId, currentUserId, refreshAllData, showToast]
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
        currentContent = <DashboardScreen metrics={dashboardMetrics} errorMessage={pageError} onRetry={refreshAllData} companyId={globalMode ? null : currentCompanyId} allCompanies={globalMode && empresa.isSystemAdmin} onNavigate={setActiveTab} onboarding={onboardingData} />;
        break;
      case 'onboarding':
        currentContent = (
          <OnboardingScreen
            onboarding={onboardingData}
            companyName={currentCompanyName}
            companyId={currentCompanyId}
            onOpenStep={handleOpenOnboardingStep}
            onMarkStep={handleMarkOnboardingStep}
            onSkipStep={handleSkipOnboardingStep}
            onOpenArticle={handleOpenHelpArticle}
            markingStepId={markingOnboardingStepId}
            skippedStepIds={skippedOnboardingStepIds}
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
            onOpenPlans={() => setActiveTab('planos')}
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
      case 'analytics':
        currentContent = (
          <AnalyticsScreen
            companyId={globalMode ? null : currentCompanyId}
            companyName={currentCompanyName}
            onToast={showToast}
          />
        );
        break;
      case 'notifications':
        currentContent = (
          <NotificationsScreen
            companyId={globalMode ? null : currentCompanyId}
            companyName={currentCompanyName}
            onToast={showToast}
          />
        );
        break;
      case 'audit':
        currentContent = (
          <AuditTimelineScreen
            companyId={globalMode ? null : currentCompanyId}
            companyName={currentCompanyName}
            onToast={showToast}
            allCompanies={globalMode && empresa.isSystemAdmin}
          />
        );
        break;
      case 'help':
        currentContent = (
          <HelpCenterScreen
            onboarding={onboardingData}
            companyId={currentCompanyId}
            onOpenTab={setActiveTab}
            onOpenStep={handleOpenOnboardingStep}
            onMarkStep={handleMarkOnboardingStep}
            onSkipStep={handleSkipOnboardingStep}
            onOpenArticle={handleOpenHelpArticle}
            markingStepId={markingOnboardingStepId}
            skippedStepIds={skippedOnboardingStepIds}
          />
        );
        break;
      case 'production-checklist':
        currentContent = (
          <ProductionChecklistScreen
            companyId={globalMode ? null : currentCompanyId}
            companyName={currentCompanyName}
            onToast={showToast}
            currentUserLabel={auth.user?.email || auth.user?.user_metadata?.name || ''}
            onOpenTab={setActiveTab}
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
            companyId={currentCompanyId}
            onToast={showToast}
          />
        );
        break;
      case 'billing':
        currentContent = (
          <BillingScreen
            billing={billingOverview}
            onOpenPlans={() => setActiveTab('planos')}
            companyId={currentCompanyId}
            onToast={showToast}
          />
        );
        break;
      case 'admin-saas':
        currentContent = (
          <AdminSaasScreen
            user={auth.user}
            isSystemAdminUser={empresa.isSystemAdmin}
            onToast={showToast}
          />
        );
        break;
      default:
        currentContent = <DashboardScreen metrics={dashboardMetrics} errorMessage={pageError} onRetry={refreshAllData} companyId={globalMode ? null : currentCompanyId} allCompanies={globalMode && empresa.isSystemAdmin} onNavigate={setActiveTab} />;
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
              <PlanosScreen
                plans={plansCatalog}
                currentPlanId={null}
                onChoosePlan={() => setPublicScreen('login')}
                companyId={null}
                onToast={showToast}
              />
            </Suspense>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-4">
        <Suspense fallback={<ScreenFallback />}>
          <LoginScreen
            onSignIn={auth.signIn}
            onSignUp={auth.signUp}
            loading={auth.submitting || auth.loading}
            error={auth.error || auth.configError}
            onBackToLanding={() => setPublicScreen('landing')}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <div className="flex flex-col lg:flex-row">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeCompanyId={currentCompanyId}
          setActiveCompanyId={empresa.setActiveCompanyId}
          companies={empresa.companies}
          activeCompany={empresa.activeCompany}
          stats={sidebarStats}
          isSystemAdmin={empresa.isSystemAdmin}
          onOpenCompanyModal={handleOpenEmpresaModal}
          onOpenPlans={() => setActiveTab('planos')}
        />

        <div className="flex-1 px-4 py-6 lg:px-6">
          <div className="mx-auto max-w-7xl space-y-6">
            <Header
              title={sectionHeader.title}
              subtitle={sectionHeader.subtitle}
              userEmail={auth.user?.email || ''}
              onSignOut={auth.signOut}
              companyName={currentCompanyName}
              companyId={currentCompanyId}
              onNavigate={handleHeaderNavigation}
              onOpenNotifications={handleOpenNotifications}
            />

            {toast && (
              <div
                className={`rounded-2xl px-5 py-4 text-sm font-medium shadow-soft ${
                  toast.type === 'erro'
                    ? 'border border-red-200 bg-red-50 text-red-700'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}
              >
                {toast.message}
              </div>
            )}

            <ErrorBoundary>
              <Suspense fallback={<ScreenFallback />}>
                {currentContent}
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {empresa.modalOpen && (
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
      )}

      {chargePreviewModal && (
        <MessagePreviewModal
          modal={chargePreviewModal}
          onClose={() => setChargePreviewModal(null)}
          onChangeMessage={handleChargePreviewMessageChange}
          onCopy={handleCopyChargeMessage}
          onCollectionGenerated={(result) => {
            handleChargePreviewCollectionGenerated(result).catch(() => {});
          }}
          onSend={handleSendChargeFromPreview}
          sending={chargePreviewSending}
        />
      )}
    </div>
  );
}
