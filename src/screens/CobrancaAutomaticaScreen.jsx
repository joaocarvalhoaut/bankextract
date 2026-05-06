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
  UploadCloud,
} from 'lucide-react';
import DataTable from '../components/DataTable';
import LimitWarningModal from '../components/plans/LimitWarningModal';
import UpgradeBanner from '../components/plans/UpgradeBanner';
import {
  getBillingConfig,
  getDriveConfig,
  getBillingAutomationOverview,
  getPlanCapabilities,
  previewBillingTemplate,
  reprocessBillingFailures,
  runBillingAutomationNow,
  saveBillingConfig,
  saveDriveConfig,
  syncBillingDrive,
  syncBillingSheet,
  testDriveConnection,
} from '../services/billingAutomationService';
import { canUserPerformAction } from '../security/permissions';
import { getUpgradeRecommendation, normalizePlanId } from '../constants/plans';

const statusTone = {
  sucesso: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  sucesso_simulado: 'bg-blue-50 text-blue-700 ring-blue-200',
  simulado: 'bg-blue-50 text-blue-700 ring-blue-200',
  erro: 'bg-red-50 text-red-700 ring-red-200',
  ignorado: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const tabItems = [
  { id: 'regras', label: 'Regras', icon: Settings2 },
  { id: 'mensagens', label: 'Mensagens', icon: MessageSquareText },
  { id: 'integracoes', label: 'Integracoes', icon: FolderKanban },
  { id: 'execucoes', label: 'Execucoes', icon: Clock3 },
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
    slate: 'from-slate-400 to-slate-500 text-slate-950',
    emerald: 'from-emerald-400 to-emerald-600 text-emerald-700',
    blue: 'from-blue-400 to-blue-600 text-blue-700',
    red: 'from-red-400 to-red-600 text-red-700',
    amber: 'from-amber-400 to-orange-400 text-amber-700',
  };

  return (
    <article className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft">
      <div
        className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${
          palette[tone]?.split(' text-')[0] || 'from-slate-400 to-slate-500'
        } opacity-80`}
      />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${palette[tone]?.split(' ').pop() || 'text-slate-950'}`}>{value}</p>
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </article>
  );
}

function SmallSummaryCard({ label, value, helper }) {
  return (
    <article className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
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
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function SectionCard({ title, description, children, aside = null }) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 shadow-soft">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">{title}</p>
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
  onToast,
}) {
  const resolvedCompanyId =
    companyId ||
    activeCompanyId ||
    activeCompany?.id ||
    selectedCompany?.id ||
    company?.id ||
    null;

  console.log('CobrancaAutomatica companyId', resolvedCompanyId);

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
  });
  const [driveFolderInput, setDriveFolderInput] = useState('');
  const [driveSaving, setDriveSaving] = useState(false);
  const [driveTesting, setDriveTesting] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);
  const [planInfo, setPlanInfo] = useState(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
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

  const canManage = canUserPerformAction(userRole, 'manage_automations');

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
      return;
    }

    try {
      const data = await getBillingConfig(resolvedCompanyId);
      setBillingConfig({
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

  const columns = useMemo(
    () => [
      {
        key: 'cliente_nome',
        label: 'Cliente',
        render: (row) => <span className="font-medium text-slate-900">{row.cliente_nome || 'Sem nome'}</span>,
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
              statusTone[row.status_envio] || 'bg-slate-100 text-slate-700 ring-slate-200'
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
        await loadOverview();
        if (action === 'drive') {
          await loadDriveConfig();
        }
        onToast?.('sucesso', result?.message || successMessage);
      } catch (error) {
        onToast?.('erro', error.message || 'Falha ao executar a acao.');
      } finally {
        setExecutingAction('');
      }
    },
    [canManage, globalMode, loadDriveConfig, loadOverview, onToast, resolvedCompanyId]
  );

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
      setBillingConfig({
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
    <section className="space-y-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            <CheckCircle2 size={13} />
            Regua financeira
          </div>
          <h3 className="mt-4 text-2xl font-semibold text-slate-950">Cobranca automatica com boletos do Google Drive</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            Painel operacional da empresa <span className="font-semibold text-slate-900">{companyName}</span> com
            sincronizacao da planilha financeira, localizacao automatica do boleto e envio auditavel por WhatsApp.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runAction('run', runBillingAutomationNow, 'Regua executada com sucesso.')}
            disabled={Boolean(executingAction)}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {executingAction === 'run' ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
            Executar agora
          </button>
          <button
            type="button"
            onClick={() => runAction('simulate', (id) => runBillingAutomationNow(id, { simulate: true }), 'Simulacao executada com sucesso.')}
            disabled={Boolean(executingAction)}
            className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-soft transition hover:bg-blue-100 disabled:opacity-50"
          >
            {executingAction === 'simulate' ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
            Executar simulacao
          </button>
          <button
            type="button"
            onClick={() => runAction('reprocess', reprocessBillingFailures, 'Falhas reprocessadas com sucesso.')}
            disabled={Boolean(executingAction)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
          >
            {executingAction === 'reprocess' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            Reprocessar falhas
          </button>
          <button
            type="button"
            onClick={() => runAction('sheet', syncBillingSheet, 'Planilha sincronizada com sucesso.')}
            disabled={Boolean(executingAction)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
          >
            {executingAction === 'sheet' ? <Loader2 size={15} className="animate-spin" /> : <Sheet size={15} />}
            Sincronizar planilha
          </button>
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

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
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

          <SectionCard
            title="Configuracao principal"
            description="Ajuste a regua operacional, mantendo os mesmos dados e o mesmo salvamento ja existentes."
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ativar cobranca automatica</span>
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">{billingConfig.ativo ? 'Ativa' : 'Desativada'}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(billingConfig.ativo)}
                    onChange={(event) => setBillingConfig((current) => ({ ...current, ativo: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </div>
              </label>

              <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Horario de execucao</span>
                <input
                  type="time"
                  value={billingConfig.hora_execucao}
                  onChange={(event) => setBillingConfig((current) => ({ ...current, hora_execucao: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Preventiva dias antes</span>
                <input
                  type="number"
                  min="0"
                  value={billingConfig.preventiva_dias_antes}
                  onChange={(event) => setBillingConfig((current) => ({ ...current, preventiva_dias_antes: Number(event.target.value || 0) }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Enviar no dia do vencimento</span>
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">{billingConfig.enviar_no_vencimento ? 'Sim' : 'Nao'}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(billingConfig.enviar_no_vencimento)}
                    onChange={(event) => setBillingConfig((current) => ({ ...current, enviar_no_vencimento: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </div>
              </label>

              <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Permitir envio sem boleto</span>
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">{billingConfig.permitir_envio_sem_boleto ? 'Sim' : 'Nao'}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(billingConfig.permitir_envio_sem_boleto)}
                    onChange={(event) => setBillingConfig((current) => ({ ...current, permitir_envio_sem_boleto: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </div>
              </label>

              <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Limite por titulo</span>
                <input
                  type="number"
                  min="1"
                  value={billingConfig.limite_cobrancas_por_titulo}
                  onChange={(event) => setBillingConfig((current) => ({ ...current, limite_cobrancas_por_titulo: Number(event.target.value || 1) }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
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
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {index < delaySteps.length - 1 ? (
                      <span className="pointer-events-none absolute left-[calc(100%-8px)] top-1/2 hidden h-px w-4 -translate-y-1/2 bg-slate-200 xl:block" />
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-lg font-semibold ${active ? 'text-emerald-700' : 'text-slate-900'}`}>D+{day}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
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
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
              >
                {templatePreviewLoading ? <Loader2 size={15} className="animate-spin" /> : <Sheet size={15} />}
                Testar template
              </button>
            }
          >
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <textarea
                  rows={14}
                  value={billingConfig[selectedTemplate.field] || ''}
                  onChange={(event) =>
                    setBillingConfig((current) => ({
                      ...current,
                      [selectedTemplate.field]: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Variaveis disponiveis</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['{nome}', '{numero_boleto}', '{vencimento}', '{valor}', '{dias_atraso}', '{empresa}', '{telefone}'].map((item) => (
                      <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Preview e teste</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Use o teste para validar placeholders, tom da mensagem e estrutura antes da simulacao em lote.
                  </p>
                </div>
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
                      : 'bg-slate-100 text-slate-600 ring-slate-200'
                }`}
              >
                {driveConfig.status === 'sucesso' ? 'Conectado' : driveConfig.status === 'erro' ? 'Com erro' : 'Pendente'}
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">E-mail da Service Account</span>
                <input
                  type="text"
                  value={driveConfig.service_account_email}
                  readOnly
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
                />
              </label>

              <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ID da pasta do Google Drive</span>
                <input
                  type="text"
                  value={driveFolderInput}
                  onChange={(event) => setDriveFolderInput(event.target.value)}
                  placeholder="Cole aqui o ID da pasta compartilhada"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nome da pasta</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{driveConfig.folder_name || 'Ainda nao identificado'}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status da conexao</p>
                <p className="mt-2 text-sm font-medium text-slate-900">
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
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
              >
                {driveTesting ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
                Testar conexao
              </button>
              <button
                type="button"
                onClick={() => runAction('drive', syncBillingDrive, 'Drive sincronizado com sucesso.')}
                disabled={Boolean(executingAction)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
              >
                {executingAction === 'drive' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
                Sincronizar Drive
              </button>
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
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
              <p className="text-sm leading-relaxed text-slate-600">
                A estrutura comercial e a simulacao continuam funcionando normalmente. O envio real continuara bloqueado ate a fase de configuracao da Z-API.
              </p>
              <button
                type="button"
                onClick={() => onToast?.('aviso', 'Configuracao de Z-API sera liberada em breve.')}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
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
