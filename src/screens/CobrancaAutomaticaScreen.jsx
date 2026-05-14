import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Loader2,
  MessageSquareText,
  RefreshCcw,
  Settings2,
  Sheet,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import CollectionMessagePreview from '../components/CollectionMessagePreview';
import DataTable from '../components/DataTable';
import GoogleSheetsConfig from '../components/GoogleSheetsConfig';
import LimitWarningModal from '../components/plans/LimitWarningModal';
import UpgradeBanner from '../components/plans/UpgradeBanner';
import {
  getBoletoSyncReport,
  getBillingConfig,
  getDriveConfig,
  getBillingAutomationOverview,
  getPlanCapabilities,
  previewBillingTemplate,
  reprocessBillingFailures,
  runBillingAutomationNow,
  sendSingleCharge,
  saveBillingConfig,
  saveDriveConfig,
  syncBoletoDriveIntelligent,
  syncBillingDrive,
  syncBillingSheet,
  testDriveConnection,
} from '../services/billingAutomationService';
import { canUserPerformAction } from '../security/permissions';
import { getUpgradeRecommendation, normalizePlanId } from '../constants/plans';
import { createNotification } from '../services/notificationService';
import { createAuditEvent } from '../services/auditTimelineService';
import { getCollectionToneMeta } from '../services/collectionMessageService';
import { incrementUsage } from '../services/usageService';

const statusTone = {
  sucesso: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  sucesso_simulado: 'bg-blue-900/20 text-blue-700 ring-blue-200',
  simulado: 'bg-blue-900/20 text-blue-700 ring-blue-200',
  erro: 'bg-red-50 text-red-700 ring-red-200',
  ignorado: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const tabItems = [
  { id: 'regras', label: 'Configuracao', icon: Settings2 },
  { id: 'mensagens', label: 'Templates', icon: MessageSquareText },
  { id: 'integracoes', label: 'Integracoes', icon: FolderKanban },
  { id: 'execucoes', label: 'Monitoramento', icon: Clock3 },
];

const templateTabs = [
  {
    id: 'preventiva',
    label: 'Preventiva',
    title: 'Template preventiva',
    description: 'Mensagem usada antes do vencimento para antecipar a cobranca.',
    field: 'template_preventiva',
  },
  {
    id: 'vencimento',
    label: 'Vencimento',
    title: 'Template vencimento',
    description: 'Mensagem usada no dia exato do vencimento do titulo.',
    field: 'template_vencimento',
  },
  {
    id: 'atraso',
    label: 'Atraso',
    title: 'Template atraso',
    description: 'Mensagem usada nos marcos D+1, D+3, D+5, D+10, D+15 e D+30.',
    field: 'template_atraso',
  },
];

const delaySteps = [1, 3, 5, 10, 15, 30];

function StatCard({ label, value, helper, tone = 'slate' }) {
  const palette = {
    slate: 'from-slate-400 to-slate-500 text-slate-50',
    emerald: 'from-emerald-400 to-emerald-600 text-emerald-700',
    blue: 'from-blue-400 to-blue-600 text-blue-700',
    red: 'from-red-400 to-red-600 text-red-700',
    amber: 'from-amber-400 to-orange-400 text-amber-700',
  };

  return (
    <article className="relative overflow-hidden rounded-[24px] border border-slate-700 bg-slate-900/60 p-5 shadow-soft">
      <div
        className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${
          palette[tone]?.split(' text-')[0] || 'from-slate-400 to-slate-500'
        } opacity-80`}
      />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${palette[tone]?.split(' ').pop() || 'text-slate-50'}`}>{value}</p>
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </article>
  );
}

function SmallSummaryCard({ label, value, helper }) {
  return (
    <article className="rounded-[20px] border border-slate-700 bg-slate-900/60 p-4 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-50">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </article>
  );
}

function TabButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-soft'
          : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/40 hover:text-slate-50'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function SectionCard({ title, description, children, aside = null }) {
  return (
    <section className="rounded-[24px] border border-slate-700 bg-slate-800/40/80 p-5 shadow-soft">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-50">{title}</p>
          {description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function CobrancaAutomaticaScreen({
  companyId,
  activeCompanyId,
  activeCompany,
  selectedCompany,
  company,
  companyName,
  globalMode,
  userRole = 'operador',
  billingExecutionMode = 'simulate',
  onBillingExecutionModeChange,
  onToast,
}) {
  const resolvedCompanyId =
    companyId ||
    activeCompanyId ||
    activeCompany?.id ||
    selectedCompany?.id ||
    company?.id ||
    null;

  const [activeTab, setActiveTab] = useState('regras');
  const [activeTemplateTab, setActiveTemplateTab] = useState('preventiva');
  const [loading, setLoading] = useState(false);
  const [executingAction, setExecutingAction] = useState('');
  const [overview, setOverview] = useState(null);
  const [driveConfig, setDriveConfig] = useState({
    drive_root_folder_id: '',
    service_account_email: '',
    folder_name: '',
    status: '',
    quantidade_arquivos_pdf: 0,
    mensagem_erro: '',
    spreadsheet_id: '',
    sheet_name: '',
    source_spreadsheet_id: '',
    source_sheet_name: '',
    last_source_sync_at: '',
    last_source_sync_status: '',
    last_source_sync_error: '',
  });
  const [driveFolderInput, setDriveFolderInput] = useState('');
  const [driveSaving, setDriveSaving] = useState(false);
  const [driveTesting, setDriveTesting] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);
  const [planInfo, setPlanInfo] = useState(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [boletoSyncReport, setBoletoSyncReport] = useState(null);
  const [boletoSyncSummary, setBoletoSyncSummary] = useState(null);
  const [rowSendingId, setRowSendingId] = useState('');
  const [billingConfig, setBillingConfig] = useState({
    ativo: false,
    hora_execucao: '08:00',
    mensagem_template: '',
    template_preventiva: '',
    template_vencimento: '',
    template_atraso: '',
    intervalo_dias: 5,
    cobrar_apos_dias_vencido: 1,
    limite_cobrancas_por_titulo: 6,
    preventiva_dias_antes: 1,
    enviar_no_vencimento: true,
    permitir_envio_sem_boleto: false,
    regua_atraso: [1, 3, 5, 10, 15, 30],
  });
  const [billingTemplateBaseline, setBillingTemplateBaseline] = useState({
    mensagem_template: '',
    template_preventiva: '',
    template_vencimento: '',
    template_atraso: '',
  });

  const canManage = canUserPerformAction(userRole, 'manage_automations');
  const canSendSingle = canUserPerformAction(userRole, 'manage_charges');
  const simulationMode = billingExecutionMode !== 'real';

  const loadOverview = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      setOverview(null);
      return;
    }

    setLoading(true);
    try {
      const data = await getBillingAutomationOverview(resolvedCompanyId);
      setOverview(data);
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao carregar cobranca automatica.');
    } finally {
      setLoading(false);
    }
  }, [globalMode, onToast, resolvedCompanyId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const loadDriveConfig = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      setDriveConfig({
        drive_root_folder_id: '',
        service_account_email: '',
        folder_name: '',
        status: '',
        quantidade_arquivos_pdf: 0,
        mensagem_erro: '',
        spreadsheet_id: '',
        sheet_name: '',
        source_spreadsheet_id: '',
        source_sheet_name: '',
        last_source_sync_at: '',
        last_source_sync_status: '',
        last_source_sync_error: '',
      });
      setDriveFolderInput('');
      return;
    }

    try {
      const data = await getDriveConfig(resolvedCompanyId);
      setDriveConfig({
        drive_root_folder_id: data?.drive_root_folder_id || '',
        service_account_email: data?.service_account_email || '',
        folder_name: data?.folder_name || '',
        status: data?.status || '',
        quantidade_arquivos_pdf: data?.quantidade_arquivos_pdf || 0,
        mensagem_erro: data?.mensagem_erro || '',
        spreadsheet_id: data?.spreadsheet_id || '',
        sheet_name: data?.sheet_name || '',
        source_spreadsheet_id: data?.source_spreadsheet_id || '',
        source_sheet_name: data?.source_sheet_name || '',
        last_source_sync_at: data?.last_source_sync_at || '',
        last_source_sync_status: data?.last_source_sync_status || '',
        last_source_sync_error: data?.last_source_sync_error || '',
      });
      setDriveFolderInput(data?.drive_root_folder_id || '');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao carregar a configuracao do Google Drive.');
    }
  }, [globalMode, onToast, resolvedCompanyId]);

  useEffect(() => {
    loadDriveConfig();
  }, [loadDriveConfig]);

  const loadBillingConfig = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      setBillingConfig({
        ativo: false,
        hora_execucao: '08:00',
        mensagem_template: '',
        template_preventiva: '',
        template_vencimento: '',
        template_atraso: '',
        intervalo_dias: 5,
        cobrar_apos_dias_vencido: 1,
        limite_cobrancas_por_titulo: 6,
        preventiva_dias_antes: 1,
        enviar_no_vencimento: true,
        permitir_envio_sem_boleto: false,
        regua_atraso: [1, 3, 5, 10, 15, 30],
      });
      setBillingTemplateBaseline({
        mensagem_template: '',
        template_preventiva: '',
        template_vencimento: '',
        template_atraso: '',
      });
      return;
    }

    try {
      const data = await getBillingConfig(resolvedCompanyId);
      const nextConfig = {
        ativo: Boolean(data?.config?.ativo),
        hora_execucao: data?.config?.hora_execucao || data?.config?.hora_envio || '08:00',
        mensagem_template: data?.config?.mensagem_template || '',
        template_preventiva: data?.config?.template_preventiva || '',
        template_vencimento: data?.config?.template_vencimento || '',
        template_atraso: data?.config?.template_atraso || '',
        intervalo_dias: Number(data?.config?.intervalo_dias || 5),
        cobrar_apos_dias_vencido: Number(data?.config?.cobrar_apos_dias_vencido || 1),
        limite_cobrancas_por_titulo: Number(data?.config?.limite_cobrancas_por_titulo || 6),
        preventiva_dias_antes: Number(data?.config?.preventiva_dias_antes || 1),
        enviar_no_vencimento: Boolean(data?.config?.enviar_no_vencimento ?? true),
        permitir_envio_sem_boleto: Boolean(data?.config?.permitir_envio_sem_boleto ?? false),
        regua_atraso: Array.isArray(data?.config?.regua_atraso)
          ? data.config.regua_atraso.map((item) => Number(item))
          : [1, 3, 5, 10, 15, 30],
      };
      setBillingConfig(nextConfig);
      setBillingTemplateBaseline({
        mensagem_template: nextConfig.mensagem_template,
        template_preventiva: nextConfig.template_preventiva,
        template_vencimento: nextConfig.template_vencimento,
        template_atraso: nextConfig.template_atraso,
      });
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao carregar a configuracao da regua.');
    }
  }, [globalMode, onToast, resolvedCompanyId]);

  useEffect(() => {
    loadBillingConfig();
  }, [loadBillingConfig]);

  const loadPlanInfo = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      setPlanInfo(null);
      return;
    }

    try {
      const data = await getPlanCapabilities(resolvedCompanyId);
      setPlanInfo(data);
    } catch {
      setPlanInfo(null);
    }
  }, [globalMode, resolvedCompanyId]);

  useEffect(() => {
    loadPlanInfo();
  }, [loadPlanInfo]);

  const loadBoletoSyncReport = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      setBoletoSyncReport(null);
      return;
    }

    try {
      const data = await getBoletoSyncReport(resolvedCompanyId);
      setBoletoSyncReport(data);
    } catch {
      setBoletoSyncReport(null);
    }
  }, [globalMode, resolvedCompanyId]);

  useEffect(() => {
    loadBoletoSyncReport();
  }, [loadBoletoSyncReport]);

  const rows = overview?.rows || [];
  const normalizedPlanId = normalizePlanId(planInfo?.plan);
  const upgradeRecommendation = getUpgradeRecommendation(normalizedPlanId, {
    monthly_send_limit: Number(planInfo?.limits?.monthly_send_limit || 0),
    extra_send_credits: Number(planInfo?.limits?.extra_send_credits || 0),
    used_real_sends: Number(planInfo?.limits?.used_real_sends || 0),
  });
  const summary = overview?.summary || {
    enviados_hoje: 0,
    preventivos: 0,
    vencimento: 0,
    atraso: 0,
    erros: 0,
    boletos_nao_encontrados: 0,
  };
  const boletoCards = boletoSyncReport?.cards || {
    total_titulos: 0,
    boletos_encontrados: 0,
    pendentes: 0,
    baixa_confianca: 0,
    conflitos: 0,
    erros: 0,
    sem_linha_digitavel: 0,
    com_linha_digitavel: 0,
  };
  const boletoRows = Array.isArray(boletoSyncReport?.items) ? boletoSyncReport.items : [];
  const visibleBoletoSummary = boletoSyncSummary || {
    pdfs_analisados: 0,
    vinculados: boletoCards.boletos_encontrados,
    baixa_confianca: boletoCards.baixa_confianca,
    conflitos: boletoCards.conflitos,
    nao_encontrados: boletoCards.pendentes,
    erros: boletoCards.erros,
  };

  const ruleSummaryCards = [
    { label: 'Automacao', value: billingConfig.ativo ? 'Ativa' : 'Inativa', helper: 'Status atual da regua' },
    { label: 'Horario', value: billingConfig.hora_execucao || '08:00', helper: 'Horario programado' },
    { label: 'Canal', value: 'WhatsApp', helper: 'Canal operacional atual' },
    { label: 'Limite por titulo', value: billingConfig.limite_cobrancas_por_titulo || 0, helper: 'Tentativas maximas' },
    { label: 'Envio sem boleto', value: billingConfig.permitir_envio_sem_boleto ? 'Sim' : 'Nao', helper: 'Controle de risco' },
    {
      label: 'Plano atual',
      value: planInfo?.plan ? String(planInfo.plan).toUpperCase() : 'Starter',
      helper: planInfo?.capabilities?.automatic_send ? 'Automacao futura liberada' : 'Automacao real bloqueada',
    },
  ];

  const handleSendSingleCharge = useCallback(
    async (row) => {
      if (!resolvedCompanyId || globalMode) {
        onToast?.('erro', 'Selecione uma empresa especifica para enviar a cobranca.');
        return;
      }

      if (!canSendSingle) {
        onToast?.('erro', 'Seu perfil atual nao pode enviar cobrancas individuais.');
        return;
      }

      const registroId = String(row?.financeiro_id || row?.registro_id || row?.id || '').trim();
      if (!registroId) {
        onToast?.('erro', 'Esta linha nao possui um titulo financeiro associado para envio.');
        return;
      }

      setRowSendingId(registroId);

      try {
        const result = await sendSingleCharge(resolvedCompanyId, registroId, { simulate: simulationMode });
        await loadOverview();
        onToast?.(
          simulationMode ? 'aviso' : 'sucesso',
          result?.message ||
            (simulationMode
              ? 'Simulacao executada, nenhuma mensagem real enviada.'
              : 'Mensagem enviada via WhatsApp')
        );
      } catch (error) {
        onToast?.('erro', error.message || 'Falha ao enviar a cobranca individual.');
      } finally {
        setRowSendingId('');
      }
    },
    [canSendSingle, globalMode, loadOverview, onToast, resolvedCompanyId, simulationMode]
  );

  const columns = useMemo(
    () => [
      {
        key: 'cliente_nome',
        label: 'Cliente',
        render: (row) => <span className="font-medium text-slate-50">{row.cliente_nome || 'Sem nome'}</span>,
      },
      { key: 'documento', label: 'Documento', render: (row) => row.documento || row.numero_boleto || '-' },
      { key: 'tipo_cobranca', label: 'Tipo', render: (row) => row.tipo_cobranca || '-' },
      { key: 'telefone', label: 'Telefone', render: (row) => row.telefone || '-' },
      {
        key: 'status_envio',
        label: 'Status',
        render: (row) => (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              statusTone[row.status_envio] || 'bg-slate-800/60 text-slate-200 ring-slate-700'
            }`}
          >
            {row.status_envio || '-'}
          </span>
        ),
      },
      {
        key: 'data_hora',
        label: 'Hora',
        render: (row) =>
          row.data_hora
            ? new Date(row.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '-',
      },
      { key: 'erro', label: 'Erro', render: (row) => row.erro || '-' },
      {
        key: 'acoes',
        label: 'Acao',
        render: (row) => {
          const registroId = String(row?.financeiro_id || row?.registro_id || row?.id || '').trim();
          const sending = rowSendingId === registroId;
          const disabled = !canSendSingle || !resolvedCompanyId || globalMode || !registroId || Boolean(rowSendingId);

          return (
            <button
              type="button"
              onClick={() => handleSendSingleCharge(row)}
              disabled={disabled}
              title={
                !canSendSingle
                  ? 'Seu perfil nao pode enviar cobrancas individuais.'
                  : !resolvedCompanyId || globalMode
                    ? 'Selecione uma empresa especifica para enviar.'
                    : !registroId
                      ? 'Esta linha nao possui um titulo financeiro associado.'
                      : ''
              }
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <MessageSquareText size={14} />}
              Enviar
            </button>
          );
        },
      },
    ],
    [canSendSingle, globalMode, handleSendSingleCharge, resolvedCompanyId, rowSendingId]
  );

  const boletoColumns = useMemo(
    () => [
      { key: 'pdf', label: 'PDF', render: (row) => row.pdf || '-' },
      { key: 'cliente', label: 'Cliente', render: (row) => row.cliente || '-' },
      { key: 'boleto', label: 'Numero boleto', render: (row) => row.boleto || '-' },
      { key: 'linha_digitavel', label: 'Linha digitavel', render: (row) => row.linha_digitavel || '-' },
      { key: 'valor', label: 'Valor', render: (row) => (Number.isFinite(Number(row.valor)) ? `R$ ${Number(row.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-') },
      { key: 'vencimento', label: 'Vencimento', render: (row) => row.vencimento ? new Date(`${row.vencimento}T00:00:00`).toLocaleDateString('pt-BR') : '-' },
      { key: 'confidence', label: 'Confianca', render: (row) => `${Number(row.confidence || 0).toFixed(0)}%` },
      {
        key: 'status',
        label: 'Status',
        render: (row) => (
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
            row.status === 'encontrado'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : row.status === 'baixa_confianca'
                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                : row.status === 'conflito' || row.status === 'erro'
                  ? 'bg-red-50 text-red-700 ring-red-200'
                  : 'bg-slate-800/60 text-slate-200 ring-slate-700'
          }`}>
            {row.status || '-'}
          </span>
        ),
      },
    ],
    []
  );

  const runAction = useCallback(
    async (action, fn, successMessage) => {
      if (!resolvedCompanyId || globalMode) {
        onToast?.('erro', 'Selecione uma empresa especifica para operar a cobranca automatica.');
        return;
      }
      if (!canManage) {
        onToast?.('erro', 'Seu perfil atual nao pode operar automacoes.');
        return;
      }

      setExecutingAction(action);
      try {
        const result = await fn(resolvedCompanyId);
        const isSimulationExecution = action === 'simulate' || (action === 'run' && simulationMode);
        if (action === 'simulate' || action === 'run') {
          await incrementUsage(resolvedCompanyId, 'automations_month', 1);
          await createAuditEvent(resolvedCompanyId, {
            action: isSimulationExecution ? 'automation_simulated' : 'automation_executed',
            entity_type: 'automacoes_cobranca',
            title: isSimulationExecution ? 'Simulacao de automacao executada' : 'Automacao executada',
            description:
              isSimulationExecution
                ? 'A simulacao da regua automatica foi executada com sucesso.'
                : 'A regua automatica foi executada com sucesso.',
            metadata: {
              action,
              simulate: isSimulationExecution,
              hora_execucao: billingConfig.hora_execucao || '',
              ativo: Boolean(billingConfig.ativo),
            },
            severity: isSimulationExecution ? 'info' : 'success',
          });
          try {
            await createNotification(resolvedCompanyId, {
              type: isSimulationExecution ? 'automation_simulated' : 'automation_executed',
              title: isSimulationExecution ? 'Simulacao executada' : 'Automacao executada',
              message:
                isSimulationExecution
                  ? 'Uma simulacao da automacao de cobranca foi executada com sucesso.'
                  : 'A automacao de cobranca foi executada com sucesso.',
              severity: isSimulationExecution ? 'info' : 'success',
              metadata: {
                action,
                simulate: isSimulationExecution,
              },
            });
          } catch {
            // Mantem a automacao principal mesmo se a notificacao falhar.
          }
        }
        await loadOverview();
        if (action === 'drive') {
          await loadDriveConfig();
        }
        if (action === 'boleto-intelligent' || action === 'drive') {
          await loadBoletoSyncReport();
        }
        if (action === 'run') {
          onToast?.(
            isSimulationExecution ? 'aviso' : 'sucesso',
            isSimulationExecution
              ? 'Simulacao executada, nenhuma mensagem real enviada.'
              : 'Mensagem enviada via WhatsApp'
          );
        } else {
          onToast?.('sucesso', result?.message || successMessage);
        }
      } catch (error) {
        onToast?.('erro', error.message || 'Falha ao executar a acao.');
      } finally {
        setExecutingAction('');
      }
    },
    [billingConfig.ativo, billingConfig.hora_execucao, canManage, globalMode, loadBoletoSyncReport, loadDriveConfig, loadOverview, onToast, resolvedCompanyId, simulationMode]
  );

  const handleRunBoletoIntelligent = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      onToast?.('erro', 'Selecione uma empresa especifica para executar a varredura inteligente.');
      return;
    }

    setExecutingAction('boleto-intelligent');
    try {
      const result = await syncBoletoDriveIntelligent(resolvedCompanyId, 50);
      setBoletoSyncSummary(result?.summary || null);
      await loadBoletoSyncReport();
      onToast?.('sucesso', 'Varredura inteligente concluida com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao executar a varredura inteligente.');
    } finally {
      setExecutingAction('');
    }
  }, [globalMode, loadBoletoSyncReport, onToast, resolvedCompanyId]);

  const handleSaveDriveFolder = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      onToast?.('erro', 'Selecione uma empresa especifica para configurar a pasta do Google Drive.');
      return;
    }
    if (!canManage) {
      onToast?.('erro', 'Seu perfil atual nao pode gerenciar automacoes.');
      return;
    }

    setDriveSaving(true);
    try {
      const data = await saveDriveConfig(resolvedCompanyId, driveFolderInput);
      setDriveConfig({
        drive_root_folder_id: data?.drive_root_folder_id || '',
        service_account_email: data?.service_account_email || '',
        folder_name: data?.folder_name || '',
        status: data?.status || '',
        quantidade_arquivos_pdf: data?.quantidade_arquivos_pdf || 0,
        mensagem_erro: data?.mensagem_erro || '',
        spreadsheet_id: data?.spreadsheet_id || '',
        sheet_name: data?.sheet_name || '',
        source_spreadsheet_id: data?.source_spreadsheet_id || '',
        source_sheet_name: data?.source_sheet_name || '',
        last_source_sync_at: data?.last_source_sync_at || '',
        last_source_sync_status: data?.last_source_sync_status || '',
        last_source_sync_error: data?.last_source_sync_error || '',
      });
      setDriveFolderInput(data?.drive_root_folder_id || '');
      onToast?.('sucesso', data?.message || 'Pasta salva com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao salvar a pasta do Google Drive.');
    } finally {
      setDriveSaving(false);
    }
  }, [canManage, driveFolderInput, globalMode, onToast, resolvedCompanyId]);

  const handleTestDrive = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      onToast?.('erro', 'Selecione uma empresa especifica para testar o Google Drive.');
      return;
    }

    setDriveTesting(true);
    try {
      const data = await testDriveConnection(resolvedCompanyId);
      setDriveConfig((current) => ({
        ...current,
        service_account_email: data?.service_account_email || current.service_account_email,
        folder_name: data?.folder_name || '',
        status: data?.status || '',
        quantidade_arquivos_pdf: data?.quantidade_arquivos_pdf || 0,
        mensagem_erro: data?.mensagem_erro || '',
      }));
      onToast?.(data?.status === 'sucesso' ? 'sucesso' : 'erro', data?.mensagem_erro || 'Conexao testada com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao testar a conexao com o Google Drive.');
    } finally {
      setDriveTesting(false);
    }
  }, [globalMode, onToast, resolvedCompanyId]);

  const handleSaveBillingConfig = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      onToast?.('erro', 'Selecione uma empresa especifica para configurar a regua.');
      return;
    }
    if (!canManage) {
      onToast?.('erro', 'Seu perfil atual nao pode gerenciar automacoes.');
      return;
    }

    setBillingSaving(true);
    try {
      const data = await saveBillingConfig(resolvedCompanyId, billingConfig);
      const nextConfig = {
        ativo: Boolean(data?.config?.ativo),
        hora_execucao: data?.config?.hora_execucao || data?.config?.hora_envio || '08:00',
        mensagem_template: data?.config?.mensagem_template || '',
        template_preventiva: data?.config?.template_preventiva || '',
        template_vencimento: data?.config?.template_vencimento || '',
        template_atraso: data?.config?.template_atraso || '',
        intervalo_dias: Number(data?.config?.intervalo_dias || 5),
        cobrar_apos_dias_vencido: Number(data?.config?.cobrar_apos_dias_vencido || 1),
        limite_cobrancas_por_titulo: Number(data?.config?.limite_cobrancas_por_titulo || 6),
        preventiva_dias_antes: Number(data?.config?.preventiva_dias_antes || 1),
        enviar_no_vencimento: Boolean(data?.config?.enviar_no_vencimento ?? true),
        permitir_envio_sem_boleto: Boolean(data?.config?.permitir_envio_sem_boleto ?? false),
        regua_atraso: Array.isArray(data?.config?.regua_atraso)
          ? data.config.regua_atraso.map((item) => Number(item))
          : [1, 3, 5, 10, 15, 30],
      };
      setBillingConfig(nextConfig);
      setBillingTemplateBaseline({
        mensagem_template: nextConfig.mensagem_template,
        template_preventiva: nextConfig.template_preventiva,
        template_vencimento: nextConfig.template_vencimento,
        template_atraso: nextConfig.template_atraso,
      });
      await loadOverview();
      onToast?.('sucesso', data?.message || 'Configuracao da regua salva com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao salvar a configuracao da regua.');
    } finally {
      setBillingSaving(false);
    }
  }, [billingConfig, canManage, globalMode, loadOverview, onToast, resolvedCompanyId]);

  const toggleDelayRule = useCallback((day) => {
    setBillingConfig((current) => {
      const currentRules = Array.isArray(current.regua_atraso) ? current.regua_atraso.map((item) => Number(item)) : [];
      const exists = currentRules.includes(day);
      return {
        ...current,
        regua_atraso: exists ? currentRules.filter((item) => item !== day) : [...currentRules, day].sort((a, b) => a - b),
      };
    });
  }, []);

  const handlePreviewTemplate = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      onToast?.('erro', 'Selecione uma empresa especifica para testar o template.');
      return;
    }

    setTemplatePreviewLoading(true);
    try {
      const selectedTemplate = templateTabs.find((item) => item.id === activeTemplateTab);
      const data = await previewBillingTemplate(
        resolvedCompanyId,
        billingConfig?.[selectedTemplate?.field] || billingConfig.mensagem_template,
        {
          nome: companyName || 'Cliente Exemplo',
          numero_boleto: '3001-2',
          vencimento: '2026-05-10',
          valor: 1250.5,
          dias_atraso: 3,
          telefone: '77999990000',
          empresa: companyName || 'Empresa Exemplo',
          linha_digitavel: '34191.79001 01043.510047 91020.150008 8 92820000129990',
          codigo_barras: '34198928200001299901790010104351004791020150',
          link_boleto: 'https://drive.google.com/file/d/exemplo/view',
        }
      );
      onToast?.('sucesso', data?.message || 'Template testado com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao testar o template.');
    } finally {
      setTemplatePreviewLoading(false);
    }
  }, [activeTemplateTab, billingConfig, companyName, globalMode, onToast, resolvedCompanyId]);

  const selectedTemplate = templateTabs.find((item) => item.id === activeTemplateTab) || templateTabs[0];

  const handleCollectionMessageGenerated = useCallback(
    async (tone) => {
      const toneMeta = getCollectionToneMeta(tone);
      await createAuditEvent(resolvedCompanyId, {
        action: 'collection_ai_generated',
        entity_type: 'templates_cobranca',
        entity_id: selectedTemplate.field,
        title: 'Mensagem inteligente gerada',
        description: `IA local gerou um template com tom ${toneMeta.label.toLowerCase()}.`,
        metadata: {
          tone,
          tone_label: toneMeta.label,
          template: selectedTemplate.field,
        },
        severity: toneMeta.severity === 'danger' ? 'danger' : toneMeta.severity === 'warning' ? 'warning' : 'info',
      });

      if (tone === 'firme' || tone === 'juridico') {
        await createNotification(resolvedCompanyId, {
          type: 'collection_ai_tone',
          title: `Tom ${toneMeta.label} usado na automacao`,
          message: `Um template da regua foi gerado com tom ${toneMeta.label.toLowerCase()}.`,
          severity: tone === 'juridico' ? 'danger' : 'warning',
          metadata: {
            tone,
            template: selectedTemplate.field,
          },
        });
      }
    },
    [resolvedCompanyId, selectedTemplate.field]
  );

  if (globalMode || !resolvedCompanyId) {
    return (
      <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-soft">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5" size={18} />
          <div>
            <p className="font-semibold">Selecione uma empresa especifica</p>
            <p className="mt-1 text-xs text-amber-700">
              A cobranca automatica financeira opera por empresa para evitar qualquer vazamento entre carteiras.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-[28px] border border-slate-700 bg-slate-900/60 p-6 shadow-soft">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            <CheckCircle2 size={13} />
            Cobranca automatica
          </div>
          <h3 className="mt-3 text-xl font-semibold text-slate-50">Cobranca automatica com boletos do Google Drive</h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-300">
            Painel operacional da empresa <span className="font-semibold text-slate-50">{companyName}</span> com
            sincronizacao da planilha financeira, localizacao automatica do boleto e envio auditavel por WhatsApp.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-2 shadow-soft">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <ShieldCheck size={12} />
              Modo de envio
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onBillingExecutionModeChange?.('simulate')}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  simulationMode
                    ? 'bg-amber-500 text-white shadow-soft'
                    : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                Simulacao
              </button>
              <button
                type="button"
                onClick={() => onBillingExecutionModeChange?.('real')}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  simulationMode
                    ? 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/40'
                    : 'bg-emerald-600 text-white shadow-soft'
                }`}
              >
                Envio real
              </button>
            </div>
          </div>

          {simulationMode ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Simulacao ativa — nenhuma mensagem real sera enviada.
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Envio real ativo — a execucao chamara a Edge Function com simulate: false.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              runAction(
                'run',
                (id) => runBillingAutomationNow(id, { simulate: simulationMode }),
                simulationMode ? 'Simulacao executada, nenhuma mensagem real enviada.' : 'Mensagem enviada via WhatsApp'
              )
            }
            disabled={Boolean(executingAction)}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-soft transition disabled:opacity-50 ${
              simulationMode
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {executingAction === 'run' ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
            {simulationMode ? 'Executar simulacao' : 'Enviar agora'}
          </button>
          <button
            type="button"
            onClick={() => runAction('reprocess', reprocessBillingFailures, 'Falhas reprocessadas com sucesso.')}
            disabled={Boolean(executingAction)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-soft transition hover:bg-slate-800/40 disabled:opacity-50"
          >
            {executingAction === 'reprocess' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            Reprocessar falhas
          </button>
          <button
            type="button"
            onClick={() => runAction('sheet', syncBillingSheet, 'Planilha sincronizada com sucesso.')}
            disabled={Boolean(executingAction)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-soft transition hover:bg-slate-800/40 disabled:opacity-50"
          >
            {executingAction === 'sheet' ? <Loader2 size={15} className="animate-spin" /> : <Sheet size={15} />}
            Sincronizar planilha
          </button>
          </div>
        </div>
      </div>

      {planInfo?.plan === 'starter' && upgradeRecommendation?.target ? (
        <UpgradeBanner
          currentPlan={upgradeRecommendation.current}
          targetPlan={upgradeRecommendation.target}
          reason="Seu plano atual permite simulacao, configuracao da regua e operacao assistida. Para automacao programada de envio real, o upgrade para Pro sera necessario."
          actionLabel="Ver planos"
          onAction={() => setUpgradeModalOpen(true)}
        />
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-4">
        {tabItems.map((tab) => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            icon={tab.icon}
            label={tab.label}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      {activeTab === 'regras' ? (
        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ruleSummaryCards.map((card) => (
              <SmallSummaryCard key={card.label} label={card.label} value={card.value} helper={card.helper} />
            ))}
          </section>

          {upgradeRecommendation?.target ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Ver planos
                <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : null}

          <SectionCard
            title="Configuracao principal"
            description="Ajuste a regua operacional, mantendo os mesmos dados e o mesmo salvamento ja existentes."
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <label className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ativar cobranca automatica</span>
                <div className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                  <span className="text-sm font-medium text-slate-200">{billingConfig.ativo ? 'Ativa' : 'Desativada'}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(billingConfig.ativo)}
                    onChange={(event) => setBillingConfig((current) => ({ ...current, ativo: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                  />
                </div>
              </label>

              <label className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Horario de execucao</span>
                <input
                  type="time"
                  value={billingConfig.hora_execucao}
                  onChange={(event) => setBillingConfig((current) => ({ ...current, hora_execucao: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-50 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Preventiva dias antes</span>
                <input
                  type="number"
                  min="0"
                  value={billingConfig.preventiva_dias_antes}
                  onChange={(event) => setBillingConfig((current) => ({ ...current, preventiva_dias_antes: Number(event.target.value || 0) }))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-50 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Enviar no dia do vencimento</span>
                <div className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                  <span className="text-sm font-medium text-slate-200">{billingConfig.enviar_no_vencimento ? 'Sim' : 'Nao'}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(billingConfig.enviar_no_vencimento)}
                    onChange={(event) => setBillingConfig((current) => ({ ...current, enviar_no_vencimento: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                  />
                </div>
              </label>

              <label className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Permitir envio sem boleto</span>
                <div className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                  <span className="text-sm font-medium text-slate-200">{billingConfig.permitir_envio_sem_boleto ? 'Sim' : 'Nao'}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(billingConfig.permitir_envio_sem_boleto)}
                    onChange={(event) => setBillingConfig((current) => ({ ...current, permitir_envio_sem_boleto: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                  />
                </div>
              </label>

              <label className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Limite por titulo</span>
                <input
                  type="number"
                  min="1"
                  value={billingConfig.limite_cobrancas_por_titulo}
                  onChange={(event) => setBillingConfig((current) => ({ ...current, limite_cobrancas_por_titulo: Number(event.target.value || 1) }))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-50 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </label>
            </div>
          </SectionCard>

          <SectionCard
            title="Regua de atraso visual"
            description="Ative ou desative cada marco da cobranca por atraso sem alterar o array regua_atraso existente."
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {delaySteps.map((day, index) => {
                const active = Array.isArray(billingConfig.regua_atraso) && billingConfig.regua_atraso.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDelayRule(day)}
                    className={`relative rounded-[22px] border p-4 text-left transition ${
                      active
                        ? 'border-emerald-200 bg-emerald-50 shadow-soft'
                        : 'border-slate-700 bg-slate-900/60 hover:bg-slate-800/40'
                    }`}
                  >
                    {index < delaySteps.length - 1 ? (
                      <span className="pointer-events-none absolute left-[calc(100%-8px)] top-1/2 hidden h-px w-4 -translate-y-1/2 bg-slate-200 xl:block" />
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-lg font-semibold ${active ? 'text-emerald-700' : 'text-slate-50'}`}>D+{day}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-800/60 text-slate-500'
                      }`}>
                        {active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Marco da timeline de atraso da operacao.</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveBillingConfig}
                disabled={billingSaving || !canManage}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {billingSaving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Salvar configuracao da regua
              </button>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === 'mensagens' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {templateTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTemplateTab(tab.id)}
                className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                  activeTemplateTab === tab.id
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-soft'
                    : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <SectionCard
            title={selectedTemplate.title}
            description={selectedTemplate.description}
            aside={
              <button
                type="button"
                onClick={handlePreviewTemplate}
                disabled={templatePreviewLoading}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-soft transition hover:bg-slate-800/40 disabled:opacity-50"
              >
                {templatePreviewLoading ? <Loader2 size={15} className="animate-spin" /> : <Sheet size={15} />}
                Testar template
              </button>
            }
          >
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <textarea
                  rows={14}
                  value={billingConfig[selectedTemplate.field] || ''}
                  onChange={(event) =>
                    setBillingConfig((current) => ({
                      ...current,
                      [selectedTemplate.field]: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-50 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Variaveis disponiveis</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['{nome}', '{numero_boleto}', '{vencimento}', '{valor}', '{dias_atraso}', '{empresa}', '{telefone}', '{linha_digitavel}', '{codigo_barras}', '{link_boleto}'].map((item) => (
                      <span key={item} className="rounded-full border border-slate-700 bg-slate-800/40 px-3 py-1 text-xs font-medium text-slate-300">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <CollectionMessagePreview
                  title="IA de cobranca para templates"
                  context={{
                    nome: companyName || 'Cliente Exemplo',
                    valor: 1250.5,
                    vencimento: '2026-05-10',
                    diasAtraso: activeTemplateTab === 'preventiva' ? 0 : activeTemplateTab === 'vencimento' ? 1 : 7,
                    documento: 'NF-3001',
                    telefone: '77999990000',
                    empresa: companyName || 'Empresa Exemplo',
                    linha_digitavel: '34191.79001 01043.510047 91020.150008 8 92820000129990',
                    codigo_barras: '34198928200001299901790010104351004791020150',
                    link_boleto: 'https://drive.google.com/file/d/exemplo/view',
                    historico: activeTemplateTab === 'atraso' ? 'Contato anterior sem retorno' : '',
                  }}
                  initialMessage={billingConfig[selectedTemplate.field] || ''}
                  restoreMessage={billingTemplateBaseline[selectedTemplate.field] || ''}
                  onMessageChange={(value) =>
                    setBillingConfig((current) => ({
                      ...current,
                      [selectedTemplate.field]: value,
                    }))
                  }
                  onGenerated={(result) => {
                    handleCollectionMessageGenerated(result.tone).catch(() => {});
                    setBillingConfig((current) => ({
                      ...current,
                      [selectedTemplate.field]: result.message,
                    }));
                  }}
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveBillingConfig}
                disabled={billingSaving || !canManage}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {billingSaving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Salvar configuracao
              </button>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === 'integracoes' ? (
        <div className="space-y-6">
          <SectionCard
            title="Google Drive dos boletos"
            description="Configure a pasta da empresa, valide a conexao e mantenha a busca dos boletos isolada por company_id."
            aside={
              <div
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                  driveConfig.status === 'sucesso'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : driveConfig.status === 'erro'
                      ? 'bg-red-50 text-red-700 ring-red-200'
                      : 'bg-slate-800/60 text-slate-300 ring-slate-700'
                }`}
              >
                {driveConfig.status === 'sucesso' ? 'Conectado' : driveConfig.status === 'erro' ? 'Com erro' : 'Pendente'}
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/60 text-emerald-700 shadow-soft">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Credencial Google Drive</p>
                    <p className="mt-1 text-sm font-semibold text-slate-50">Configurada com seguranca</p>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 size={13} />
                      Conectada
                    </div>
                  </div>
                </div>
              </div>

              <label className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ID da pasta do Google Drive</span>
                <input
                  type="text"
                  value={driveFolderInput}
                  onChange={(event) => setDriveFolderInput(event.target.value)}
                  placeholder="Cole aqui o ID da pasta compartilhada"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-50 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nome da pasta</p>
                <p className="mt-2 text-sm font-medium text-slate-50">{driveConfig.folder_name || 'Ainda nao identificado'}</p>
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status da conexao</p>
                <p className="mt-2 text-sm font-medium text-slate-50">
                  {driveConfig.status === 'sucesso'
                    ? `Conexao valida com ${driveConfig.quantidade_arquivos_pdf} PDF(s).`
                    : driveConfig.mensagem_erro || 'Configure a pasta e teste a conexao.'}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveDriveFolder}
                disabled={driveSaving || !canManage}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {driveSaving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Salvar pasta
              </button>
              <button
                type="button"
                onClick={handleTestDrive}
                disabled={driveTesting}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-soft transition hover:bg-slate-800/40 disabled:opacity-50"
              >
                {driveTesting ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
                Testar conexao
              </button>
              <button
                type="button"
                onClick={() => runAction('drive', syncBillingDrive, 'Drive sincronizado com sucesso.')}
                disabled={Boolean(executingAction)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-soft transition hover:bg-slate-800/40 disabled:opacity-50"
              >
                {executingAction === 'drive' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
                Sincronizar Drive
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="Google Sheets / Planilha financeira"
            description="Campos operacionais restaurados para acompanhar a planilha conectada e continuar usando a sincronizacao atual."
            aside={
              <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                driveConfig.last_source_sync_status === 'success'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : driveConfig.last_source_sync_status === 'error'
                    ? 'bg-red-50 text-red-700 ring-red-200'
                    : 'bg-slate-800/60 text-slate-300 ring-slate-700'
              }`}>
                {driveConfig.last_source_sync_status === 'success'
                  ? 'Sincronizacao ok'
                  : driveConfig.last_source_sync_status === 'error'
                    ? 'Sincronizacao com erro'
                    : 'Pendente'}
              </div>
            }
          >
            <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ID da planilha</span>
                <input
                  type="text"
                  value={driveConfig.source_spreadsheet_id || driveConfig.spreadsheet_id || ''}
                  readOnly
                  placeholder="Nao configurado"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-200 outline-none"
                />
              </label>

              <label className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nome da planilha / aba</span>
                <input
                  type="text"
                  value={driveConfig.source_sheet_name || driveConfig.sheet_name || ''}
                  readOnly
                  placeholder="Nao configurado"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-200 outline-none"
                />
              </label>

              <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ultima sincronizacao</p>
                <p className="mt-2 text-sm font-medium text-slate-50">
                  {driveConfig.last_source_sync_at
                    ? new Date(driveConfig.last_source_sync_at).toLocaleString('pt-BR')
                    : 'Ainda nao sincronizada'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status operacional</p>
                <p className="mt-2 text-sm font-medium text-slate-50">
                  {driveConfig.last_source_sync_error || 'Pronto para sincronizacao manual.'}
                </p>
              </div>
            </div>

            <GoogleSheetsConfig
              empresaId={resolvedCompanyId}
              empresaNome={companyName}
              globalMode={globalMode}
              onSaved={loadOverview}
            />

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runAction('sheet', syncBillingSheet, 'Planilha sincronizada com sucesso.')}
                disabled={Boolean(executingAction)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-soft transition hover:bg-slate-800/40 disabled:opacity-50"
              >
                {executingAction === 'sheet' ? <Loader2 size={15} className="animate-spin" /> : <Sheet size={15} />}
                Sincronizar planilha
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="Motor de boletos"
            description="Varredura inteligente dos PDFs da pasta da empresa para extrair linha digitavel, codigo de barras e vincular automaticamente aos titulos."
            aside={
              <button
                type="button"
                onClick={handleRunBoletoIntelligent}
                disabled={Boolean(executingAction)}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {executingAction === 'boleto-intelligent' ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                Executar varredura inteligente
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <StatCard label="PDFs analisados" value={visibleBoletoSummary.pdfs_analisados} helper="Ultima varredura inteligente" tone="slate" />
              <StatCard label="Vinculados" value={visibleBoletoSummary.vinculados} helper="Match automatico confirmado" tone="emerald" />
              <StatCard label="Pendentes" value={visibleBoletoSummary.nao_encontrados} helper="Ainda sem vinculo validado" tone="blue" />
              <StatCard label="Baixa confianca" value={visibleBoletoSummary.baixa_confianca} helper="Exigem revisao" tone="amber" />
              <StatCard label="Conflitos" value={visibleBoletoSummary.conflitos} helper="Mais de um titulo semelhante" tone="red" />
              <StatCard label="Erros" value={visibleBoletoSummary.erros} helper="Falhas na leitura ou no match" tone="red" />
            </div>

            <div className="mt-5 rounded-[22px] border border-slate-700 bg-slate-900/60 p-4 shadow-sm">
              <DataTable
                columns={boletoColumns}
                rows={boletoRows}
                emptyTitle="Nenhum PDF analisado ainda."
                emptyDescription="Execute a varredura inteligente para extrair e vincular boletos da pasta configurada."
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Z-API"
            description="Envio real via WhatsApp ainda esta bloqueado. Configure e valide a Z-API apenas quando o produto estiver pronto para envio real."
            aside={
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                <ShieldAlert size={13} />
                Pendente / bloqueado
              </div>
            }
          >
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-5">
              <p className="text-sm leading-relaxed text-slate-300">
                A estrutura comercial e a simulacao continuam funcionando normalmente. O envio real continuara bloqueado ate a fase de configuracao da Z-API.
              </p>
              <button
                type="button"
                onClick={() => onToast?.('aviso', 'Configuracao de Z-API sera liberada em breve.')}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800/60"
              >
                Configurar Z-API em breve
              </button>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === 'execucoes' ? (
        <div className="space-y-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="skeleton h-28 rounded-[24px]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Enviados hoje" value={summary.enviados_hoje} helper="Mensagens processadas hoje." tone="emerald" />
              <StatCard label="Preventivos" value={summary.preventivos} helper="Etapa antes do vencimento." tone="blue" />
              <StatCard label="Vencimento" value={summary.vencimento} helper="Etapa no dia do titulo." tone="slate" />
              <StatCard label="Atraso" value={summary.atraso} helper="Marcos de atraso ativos." tone="amber" />
              <StatCard label="Erros" value={summary.erros} helper="Falhas de envio ou integracao." tone="red" />
              <StatCard label="Boletos nao encontrados" value={summary.boletos_nao_encontrados} helper="Titulos bloqueados no Drive." tone="amber" />
            </div>
          )}

          <SectionCard
            title="Ultimas execucoes"
            description="Cliente, documento, tipo, telefone, status final e o motivo do erro quando existir."
          >
            <DataTable
              columns={columns}
              rows={rows}
              emptyTitle="Nenhuma execucao registrada."
              emptyDescription="Assim que a regua rodar ou as sincronizacoes forem disparadas, os eventos aparecerao aqui."
            />
          </SectionCard>
        </div>
      ) : null}

      <LimitWarningModal
        open={upgradeModalOpen}
        currentPlan={upgradeRecommendation?.current}
        targetPlan={upgradeRecommendation?.target}
        description="Simulacoes continuam liberadas. O upgrade prepara automacao programada, retries e maior limite mensal quando o envio real for ativado."
        onUpgrade={() => {
          setUpgradeModalOpen(false);
          onToast?.('aviso', 'Checkout sera liberado em breve. Enquanto isso, continue usando simulacao e regua assistida.');
        }}
        onClose={() => setUpgradeModalOpen(false)}
      />
    </section>
  );
}
