import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Loader2,
  MessageSquare,
  PartyPopper,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  getWizardProgress,
  markWizardComplete,
  saveWizardProgress,
  TEMPLATE_PRESETS,
  WIZARD_STEPS,
} from '../services/onboardingService';
import {
  getBillingCenter,
  getBillingConfig,
  getDriveConfig,
  previewBillingTemplate,
  saveBillingConfig,
  saveDriveConfigFull,
  sendSingleCharge,
  testBoletoLookup,
  testDriveConnection,
  updateFinancialPhone,
} from '../services/billingAutomationService';
import {
  getProviderHealth,
  getSchedulerStatus,
  getTenantLimits,
} from '../services/dispatchQueueService';
import {
  getGlobalWhatsappGateway,
  getGlobalWhatsappGatewayStatus,
} from '../services/whatsappGatewayService';

const STEP_IDS = WIZARD_STEPS.map((step) => step.id);
const STEP_CONFIG = {
  welcome: { icon: Rocket, accent: 'from-blue-500/30 to-cyan-500/10' },
  connect_drive: { icon: FolderOpen, accent: 'from-amber-500/30 to-orange-500/10' },
  test_lookup: { icon: Search, accent: 'from-fuchsia-500/30 to-purple-500/10' },
  configure_messages: { icon: MessageSquare, accent: 'from-violet-500/30 to-blue-500/10' },
  validate_env: { icon: ShieldCheck, accent: 'from-sky-500/30 to-cyan-500/10' },
  test_dispatch: { icon: Send, accent: 'from-emerald-500/30 to-lime-500/10' },
  complete: { icon: PartyPopper, accent: 'from-emerald-500/30 to-cyan-500/10' },
};

const STATUS_TONES = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-300',
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  idle: 'border-slate-700 bg-slate-800/50 text-slate-300',
};

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function extractDriveFolderIdLocal(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return match[1];
  return raw;
}

function pickTestRecord(items = []) {
  const rows = Array.isArray(items) ? items : [];
  return (
    rows.find((item) => item?.boleto_encontrado && (item?.telefone || item?.cliente_numero)) ||
    rows.find((item) => item?.telefone || item?.cliente_numero) ||
    rows[0] ||
    null
  );
}

function prettyNumber(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('pt-BR').format(num);
}

function Stepper({ currentStepIndex, completedSteps, onJump }) {
  return (
    <div className="grid gap-3 lg:grid-cols-7">
      {WIZARD_STEPS.map((step, index) => {
        const Icon = STEP_CONFIG[step.id]?.icon || Sparkles;
        const isCurrent = index === currentStepIndex;
        const isDone = completedSteps.includes(step.id);
        const isReachable = index <= currentStepIndex || isDone;

        return (
          <button
            key={step.id}
            type="button"
            onClick={() => isReachable && onJump(index)}
            className={`group rounded-2xl border px-4 py-3 text-left transition ${
              isCurrent
                ? 'border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                : isDone
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-900/70'
            } ${isReachable ? 'hover:border-slate-500' : 'opacity-60'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${
                isDone
                  ? 'bg-emerald-500 text-white'
                  : isCurrent
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-800 text-slate-400'
              }`}>
                {isDone ? <CheckCircle2 size={16} /> : <Icon size={16} />}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Etapa {index + 1}</p>
                <p className="truncate text-sm font-semibold text-slate-100">{step.title}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function StatusPill({ tone = 'idle', children }) {
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_TONES[tone]}`}>{children}</span>;
}

function InfoCard({ title, value, detail, tone = 'idle' }) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${STATUS_TONES[tone]}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] opacity-75">{title}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs opacity-80">{detail}</p> : null}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      {children}
      {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
    </label>
  );
}

function BaseInput(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 ${props.className || ''}`}
    />
  );
}

function BaseButton({ tone = 'default', className = '', ...props }) {
  const toneClass =
    tone === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-500'
      : tone === 'success'
        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
        : tone === 'warning'
          ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
          : 'border border-slate-700 bg-slate-900/70 text-slate-100 hover:bg-slate-800/70';

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${className}`}
    />
  );
}

export default function OnboardingWizardScreen({ companyId, companyName, onToast, onNavigate }) {
  const [loadingWizard, setLoadingWizard] = useState(true);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [wizardMetadata, setWizardMetadata] = useState({});

  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [driveStatus, setDriveStatus] = useState(null);
  const [driveTesting, setDriveTesting] = useState(false);

  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);

  const [selectedPreset, setSelectedPreset] = useState('');
  const [messagePreview, setMessagePreview] = useState('');
  const [messagePreviewLoading, setMessagePreviewLoading] = useState(false);
  const [messageSaving, setMessageSaving] = useState(false);

  const [envLoading, setEnvLoading] = useState(false);
  const [envStatus, setEnvStatus] = useState({
    gateway: { status: 'idle', detail: 'Pendente' },
    drive: { status: 'idle', detail: 'Pendente' },
    scheduler: { status: 'idle', detail: 'Pendente' },
    dispatch: { status: 'idle', detail: 'Pendente' },
    provider: { status: 'idle', detail: 'Pendente' },
    cron: { status: 'idle', detail: 'Pendente' },
    quotas: { status: 'idle', detail: 'Pendente' },
  });

  const [testPhone, setTestPhone] = useState('5577981376867');
  const [testRecord, setTestRecord] = useState(null);
  const [testDispatchLoading, setTestDispatchLoading] = useState(false);
  const [testDispatchResult, setTestDispatchResult] = useState(null);

  const autoAdvanceRef = useRef('');
  const currentStepId = STEP_IDS[currentStepIndex];

  const updateMetadata = useCallback((patch = {}) => {
    setWizardMetadata((current) => ({ ...current, ...patch }));
  }, []);

  const markStepCompleted = useCallback((stepId, metadata = {}) => {
    setCompletedSteps((current) => (current.includes(stepId) ? current : [...current, stepId]));
    if (Object.keys(metadata).length) {
      updateMetadata(metadata);
    }
  }, [updateMetadata]);

  const advanceStep = useCallback(async () => {
    if (currentStepIndex >= STEP_IDS.length - 1) return;
    const nextIndex = Math.min(STEP_IDS.length - 1, currentStepIndex + 1);
    setCurrentStepIndex(nextIndex);

    if (nextIndex === STEP_IDS.length - 1) {
      const metadata = {
        ...wizardMetadata,
        setup_completed_at: wizardMetadata.setup_completed_at || new Date().toISOString(),
      };
      setWizardMetadata(metadata);
      await markWizardComplete(companyId, metadata);
    }
  }, [companyId, currentStepIndex, wizardMetadata]);

  const goBack = useCallback(() => {
    setCurrentStepIndex((current) => Math.max(0, current - 1));
  }, []);

  useEffect(() => {
    if (!companyId) {
      setLoadingWizard(false);
      return;
    }

    let active = true;
    setLoadingWizard(true);

    Promise.all([
      getWizardProgress(companyId).catch(() => null),
      getDriveConfig(companyId).catch(() => null),
      getBillingConfig(companyId).catch(() => null),
      getBillingCenter(companyId).catch(() => null),
    ])
      .then(async ([savedWizard, driveConfig, billingConfig, billingCenter]) => {
        if (!active) return;

        const nextCompleted = Array.isArray(savedWizard?.completed_steps) ? savedWizard.completed_steps : [];
        const nextMetadata = savedWizard?.metadata || {};
        const currentStep = String(savedWizard?.current_step || 'welcome');
        const stepIndex = Math.max(0, STEP_IDS.indexOf(currentStep));

        setCompletedSteps(nextCompleted.filter((stepId) => STEP_IDS.includes(stepId)));
        setWizardMetadata(nextMetadata);
        setCurrentStepIndex(stepIndex >= 0 ? stepIndex : 0);

        const folderUrl = driveConfig?.drive_root_folder_url || driveConfig?.drive_root_folder_id || '';
        setDriveFolderUrl(folderUrl);
        if (driveConfig?.drive_root_folder_id) {
          setDriveStatus({
            ok: true,
            folder_name: driveConfig?.drive_folder_name || 'Configurado',
            pdf_count: driveConfig?.pdf_count || 0,
            subfolders_found: driveConfig?.subfolders_found || 0,
            recursive_enabled: driveConfig?.drive_recursive_scan !== false,
            matching_strategy: driveConfig?.drive_matching_strategy || 'auto',
            max_depth: driveConfig?.drive_max_depth ?? 2,
            service_account_email: driveConfig?.service_account_email || '',
          });
        }

        const presetId = billingConfig?.billing_rules?.preset_id || billingConfig?.preset_id || nextMetadata?.billing_preset_id || '';
        if (presetId) {
          setSelectedPreset(presetId);
        }

        const pickedRecord = pickTestRecord(billingCenter?.registros || billingCenter?.items || []);
        setTestRecord(pickedRecord);
        if (pickedRecord && !lookupQuery) {
          setLookupQuery(
            String(
              pickedRecord.documento ||
              pickedRecord.numero_boleto ||
              pickedRecord.numero_nf ||
              pickedRecord.cliente_nome ||
              pickedRecord.nome ||
              ''
            ).trim()
          );
        }

        const preset = TEMPLATE_PRESETS.find((item) => item.id === presetId);
        if (preset && pickedRecord) {
          setMessagePreviewLoading(true);
          try {
            const preview = await previewBillingTemplate(companyId, preset.template_atraso, pickedRecord);
            if (active) {
              setMessagePreview(preview?.message || preview?.preview || '');
            }
          } catch {
            if (active) {
              setMessagePreview(preset.template_atraso);
            }
          } finally {
            if (active) {
              setMessagePreviewLoading(false);
            }
          }
        }
      })
      .finally(() => {
        if (active) {
          setLoadingWizard(false);
        }
      });

    return () => {
      active = false;
    };
  }, [companyId, lookupQuery]);

  useEffect(() => {
    if (loadingWizard || !companyId || !currentStepId) return;
    saveWizardProgress(companyId, currentStepId, completedSteps, wizardMetadata).catch(() => {});
  }, [companyId, completedSteps, currentStepId, loadingWizard, wizardMetadata]);

  useEffect(() => {
    const autoAdvanceMap = {
      connect_drive: Boolean(driveStatus?.ok),
      test_lookup: Boolean(lookupResult?.results?.length),
      configure_messages: Boolean(selectedPreset),
      test_dispatch: Boolean(testDispatchResult?.success),
    };

    if (!autoAdvanceMap[currentStepId]) return;
    if (autoAdvanceRef.current === currentStepId) return;

    autoAdvanceRef.current = currentStepId;
    const timer = window.setTimeout(() => {
      advanceStep().catch((error) => onToast?.('erro', error.message || 'Falha ao avancar no wizard.'));
    }, 800);

    return () => window.clearTimeout(timer);
  }, [advanceStep, currentStepId, driveStatus?.ok, lookupResult?.results?.length, onToast, selectedPreset, testDispatchResult?.success]);

  const handleValidateDrive = useCallback(async () => {
    const folderId = extractDriveFolderIdLocal(driveFolderUrl);
    if (!folderId) {
      onToast?.('erro', 'Cole a URL ou o ID da pasta raiz do Google Drive.');
      return;
    }

    setDriveTesting(true);
    try {
      await saveDriveConfigFull(companyId, {
        drive_root_folder_id: folderId,
        drive_recursive_scan: true,
        drive_matching_strategy: 'auto',
        drive_max_depth: 2,
      });
      const result = await testDriveConnection(companyId);
      const nextStatus = {
        ok: true,
        folder_name: result?.folder_name || 'Pasta validada',
        pdf_count: result?.quantidade_arquivos_pdf || 0,
        subfolders_found: result?.subfolders_found || 0,
        recursive_enabled: true,
        matching_strategy: 'auto',
        max_depth: 2,
        service_account_email: result?.service_account_email || '',
      };
      setDriveStatus(nextStatus);
      markStepCompleted('connect_drive', {
        drive_connected: true,
        drive_folder_id: folderId,
        drive_validated_at: new Date().toISOString(),
      });
      onToast?.('sucesso', 'Google Drive validado e salvo com sucesso.');
    } catch (error) {
      setDriveStatus({
        ok: false,
        error: error.message || 'Falha ao validar o Google Drive.',
      });
      onToast?.('erro', error.message || 'Falha ao validar o Google Drive.');
    } finally {
      setDriveTesting(false);
    }
  }, [companyId, driveFolderUrl, markStepCompleted, onToast]);

  const handleLookup = useCallback(async () => {
    const query = String(lookupQuery || '').trim();
    if (!query) {
      onToast?.('erro', 'Informe um termo para testar a busca de boleto.');
      return;
    }

    setLookupLoading(true);
    try {
      const result = await testBoletoLookup(companyId, query);
      setLookupResult(result);
      markStepCompleted('test_lookup', {
        lookup_validated: true,
        lookup_strategy: result?.strategy || result?.match_origin || null,
        lookup_exact_match: Boolean(result?.exact_match),
      });
      onToast?.('sucesso', result?.exact_match ? 'Lookup validado com exact match.' : 'Lookup executado com sucesso.');
    } catch (error) {
      setLookupResult({ error: error.message || 'Falha ao testar o lookup.' });
      onToast?.('erro', error.message || 'Falha ao testar o lookup.');
    } finally {
      setLookupLoading(false);
    }
  }, [companyId, lookupQuery, markStepCompleted, onToast]);

  const handleSelectPreset = useCallback(async (presetId) => {
    const preset = TEMPLATE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;

    setSelectedPreset(presetId);
    setMessageSaving(true);
    try {
      await saveBillingConfig(companyId, {
        preset_id: presetId,
        mensagem_template: preset.template_atraso,
        template_preventiva: preset.template_preventiva,
        template_vencimento: preset.template_vencimento,
        template_atraso: preset.template_atraso,
      });

      if (testRecord) {
        setMessagePreviewLoading(true);
        try {
          const preview = await previewBillingTemplate(companyId, preset.template_atraso, testRecord);
          setMessagePreview(preview?.message || preview?.preview || preset.template_atraso);
        } finally {
          setMessagePreviewLoading(false);
        }
      } else {
        setMessagePreview(preset.template_atraso);
      }

      markStepCompleted('configure_messages', {
        messages_configured: true,
        billing_preset_id: presetId,
      });
      onToast?.('sucesso', `Mensagens configuradas no tom ${preset.label}.`);
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao salvar o preset de mensagens.');
    } finally {
      setMessageSaving(false);
    }
  }, [companyId, markStepCompleted, onToast, testRecord]);

  const handleValidateEnvironment = useCallback(async () => {
    setEnvLoading(true);
    const next = {
      gateway: { status: 'idle', detail: 'Pendente' },
      drive: { status: 'idle', detail: 'Pendente' },
      scheduler: { status: 'idle', detail: 'Pendente' },
      dispatch: { status: 'idle', detail: 'Pendente' },
      provider: { status: 'idle', detail: 'Pendente' },
      cron: { status: 'idle', detail: 'Pendente' },
      quotas: { status: 'idle', detail: 'Pendente' },
    };

    try {
      const [gatewayConfig, driveResult, schedulerStatus, tenantLimits, providerHealth] = await Promise.all([
        getGlobalWhatsappGateway().catch(() => null),
        testDriveConnection(companyId).catch(() => null),
        getSchedulerStatus().catch(() => null),
        getTenantLimits(companyId).catch(() => null),
        getProviderHealth(companyId).catch(() => null),
      ]);

      let gatewayStatus = null;
      if (gatewayConfig?.instance_id && gatewayConfig?.token && gatewayConfig?.client_token) {
        gatewayStatus = await getGlobalWhatsappGatewayStatus(gatewayConfig).catch(() => null);
      }

      next.gateway = gatewayStatus?.connected
        ? {
            status: gatewayStatus.connected_pending_phone ? 'warning' : 'ok',
            detail: gatewayStatus.connected_pending_phone
              ? 'Gateway global conectado, aguardando numero'
              : 'Gateway global conectado e operacional',
          }
        : gatewayConfig?.instance_id
          ? { status: 'warning', detail: 'Credenciais globais salvas, mas o gateway ainda nao esta conectado' }
          : { status: 'warning', detail: 'Gateway WhatsApp global ainda nao configurado no Admin Ops' };

      next.drive = driveResult
        ? { status: 'ok', detail: `${prettyNumber(driveResult?.quantidade_arquivos_pdf || 0)} PDFs encontrados` }
        : { status: 'error', detail: 'Drive nao validado' };

      next.scheduler = schedulerStatus?.worker_online
        ? { status: 'ok', detail: `Worker online${schedulerStatus?.active_jobs ? ` - ${schedulerStatus.active_jobs} job(s)` : ''}` }
        : { status: 'warning', detail: 'Worker sem sinal online recente' };

      next.dispatch = tenantLimits?.limits?.enabled !== false
        ? { status: 'ok', detail: `Batch max ${tenantLimits?.limits?.max_batch_size ?? 20}` }
        : { status: 'warning', detail: 'Dispatch pausado para este tenant' };

      next.provider = providerHealth
        ? { status: providerHealth?.status === 'healthy' ? 'ok' : 'warning', detail: providerHealth?.status || 'Sem status' }
        : { status: 'warning', detail: 'Sem leitura recente do provider' };

      next.cron = schedulerStatus?.last_tick_at
        ? { status: 'ok', detail: `Ultimo tick em ${new Date(schedulerStatus.last_tick_at).toLocaleString('pt-BR')}` }
        : { status: 'warning', detail: 'Cron ainda sem tick registrado' };

      next.quotas = tenantLimits?.usage
        ? {
            status: 'ok',
            detail: `${tenantLimits.usage.daily_messages ?? 0}/${tenantLimits?.limits?.max_daily_messages ?? 0} mensagens hoje`,
          }
        : { status: 'warning', detail: 'Uso de quota indisponivel' };

      setEnvStatus(next);
      markStepCompleted('validate_env', {
        gateway_validated: next.gateway.status === 'ok' || next.gateway.status === 'warning',
        scheduler_validated: true,
        scheduler_worker_online: Boolean(schedulerStatus?.worker_online),
        provider_health_status: providerHealth?.status || null,
        env_validated_at: new Date().toISOString(),
      });
      onToast?.('sucesso', 'Ambiente operacional validado.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao validar o ambiente.');
    } finally {
      setEnvLoading(false);
    }
  }, [companyId, markStepCompleted, onToast]);

  const handleSendTestDispatch = useCallback(async () => {
    if (!testRecord?.id) {
      onToast?.('erro', 'Nao encontramos um titulo elegivel para teste.');
      return;
    }

    const finalPhone = normalizePhone(testPhone);
    if (finalPhone.length < 12) {
      onToast?.('erro', 'Informe um telefone valido para o envio teste.');
      return;
    }

    setTestDispatchLoading(true);
    try {
      await updateFinancialPhone(companyId, testRecord.id, finalPhone);
      const result = await sendSingleCharge(companyId, testRecord.id, {
        simulate: false,
        force_resend: true,
      });
      const normalized = {
        success: true,
        phone: finalPhone,
        provider_message_id: result?.provider_message_id || result?.providerMessageId || null,
        attachment_sent: result?.whatsapp_attachment_sent === true || result?.attachment_sent === true || false,
        boleto_file_name: result?.boleto_file_name || result?.file_name || testRecord?.boleto_pdf_nome || null,
        status: result?.status_envio || result?.status || 'sent',
        raw: result,
      };
      setTestDispatchResult(normalized);
      markStepCompleted('test_dispatch', {
        test_dispatch_sent: true,
        test_dispatch_phone: finalPhone,
        test_dispatch_provider_message_id: normalized.provider_message_id,
        setup_completed_at: new Date().toISOString(),
      });
      onToast?.('sucesso', normalized.attachment_sent ? 'Envio teste com anexo concluido.' : 'Envio teste concluido.');
    } catch (error) {
      setTestDispatchResult({
        success: false,
        error: error.message || 'Falha no envio teste.',
      });
      onToast?.('erro', error.message || 'Falha no envio teste.');
    } finally {
      setTestDispatchLoading(false);
    }
  }, [companyId, markStepCompleted, onToast, testPhone, testRecord]);

  const completeSummary = [
    { label: 'Drive conectado', done: Boolean(wizardMetadata.drive_connected || driveStatus?.ok) },
    { label: 'Busca de boleto validada', done: Boolean(wizardMetadata.lookup_validated) },
    { label: 'Mensagens configuradas', done: Boolean(selectedPreset) },
    { label: 'Ambiente validado', done: Boolean(wizardMetadata.env_validated_at) },
    { label: 'Envio teste concluido', done: Boolean(wizardMetadata.test_dispatch_sent || testDispatchResult?.success) },
  ];

  const canAdvanceManually = {
    welcome: true,
    connect_drive: Boolean(driveStatus?.ok),
    test_lookup: Boolean(lookupResult?.results?.length),
    configure_messages: Boolean(selectedPreset),
    validate_env: Boolean(wizardMetadata.env_validated_at),
    test_dispatch: Boolean(testDispatchResult?.success),
    complete: true,
  }[currentStepId];

  if (loadingWizard) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/80 px-5 py-4 text-slate-200">
          <Loader2 size={18} className="animate-spin text-blue-400" />
          Preparando o Wizard Setup...
        </div>
      </div>
    );
  }

  const StepIcon = STEP_CONFIG[currentStepId]?.icon || Sparkles;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-700 bg-slate-950/80 shadow-2xl">
        <div className={`bg-gradient-to-r ${STEP_CONFIG[currentStepId]?.accent || 'from-blue-500/20 to-cyan-500/5'} p-8`}>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                <Sparkles size={13} />
                Wizard Setup
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-50 lg:text-4xl">
                Configure {companyName || 'sua empresa'} do zero sem tocar nas telas tecnicas
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 lg:text-base">
                O gateway WhatsApp agora e configurado globalmente no Admin Ops. Aqui o onboarding da empresa fica focado em Drive, lookup, mensagens, validacao operacional e envio teste.
              </p>
            </div>
            <div className="grid min-w-[280px] grid-cols-2 gap-3">
              <InfoCard title="Etapa atual" value={`${currentStepIndex + 1}/${WIZARD_STEPS.length}`} detail={WIZARD_STEPS[currentStepIndex]?.title} tone="info" />
              <InfoCard title="Concluidas" value={`${completedSteps.length}`} detail="com persistencia automatica" tone="ok" />
              <InfoCard title="Empresa" value={companyName || 'Nao selecionada'} detail={companyId || 'Sem company_id'} tone="idle" />
              <InfoCard title="Gateway" value="Global" detail="WhatsApp fora do onboarding" tone="warning" />
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800 p-6">
          <Stepper currentStepIndex={currentStepIndex} completedSteps={completedSteps} onJump={setCurrentStepIndex} />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-700 bg-slate-950/80 p-6 shadow-xl lg:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-900 text-slate-100 shadow-lg">
              <StepIcon size={24} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Etapa {currentStepIndex + 1}</p>
              <h2 className="text-2xl font-semibold text-slate-50">{WIZARD_STEPS[currentStepIndex]?.title}</h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {completedSteps.includes(currentStepId) ? <StatusPill tone="ok">Concluida</StatusPill> : <StatusPill tone="info">Em andamento</StatusPill>}
            {wizardMetadata.setup_completed_at ? <StatusPill tone="ok">Setup concluido</StatusPill> : null}
          </div>
        </div>

        {currentStepId === 'welcome' ? (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6">
                <h3 className="text-lg font-semibold text-slate-100">O que vamos configurar</h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-300">
                  <li>Google Drive para localizar boletos PDF com targeted lookup</li>
                  <li>Teste de busca real para validar exact match</li>
                  <li>Mensagens em quatro tons com preview imediato</li>
                  <li>Scheduler, dispatch queue, quotas e provider health</li>
                  <li>Envio teste com rastreabilidade operacional</li>
                </ul>
              </div>
              <div className="rounded-3xl border border-blue-500/20 bg-blue-500/10 p-6">
                <h3 className="text-lg font-semibold text-blue-100">Antes de avancar</h3>
                <p className="mt-3 text-sm leading-relaxed text-blue-100/80">
                  Se o gateway WhatsApp global ainda nao estiver configurado, isso agora acontece na Central Operacional em Admin Ops. O onboarding da empresa nao depende mais desse passo para seguir.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {currentStepId === 'connect_drive' ? (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <Field label="URL da pasta raiz do Drive" hint="O Wizard extrai o folder ID automaticamente e salva recursive scan, strategy e max depth.">
                <BaseInput value={driveFolderUrl} onChange={(e) => setDriveFolderUrl(e.target.value)} placeholder="Cole a URL da pasta CLIENTES ou o folder ID" />
              </Field>
              <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-5">
                <p className="text-sm font-semibold text-slate-100">Folder ID detectado</p>
                <p className="mt-3 break-all text-sm text-slate-300">{extractDriveFolderIdLocal(driveFolderUrl) || 'Aguardando URL da pasta'}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <BaseButton tone="primary" onClick={handleValidateDrive} disabled={driveTesting}>
                {driveTesting ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
                Validar acesso e salvar
              </BaseButton>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard title="Status" value={driveStatus?.ok ? 'Drive conectado' : 'Pendente'} detail={driveStatus?.folder_name || 'Aguardando validacao'} tone={driveStatus?.ok ? 'ok' : 'idle'} />
              <InfoCard title="PDFs encontrados" value={prettyNumber(driveStatus?.pdf_count)} detail="na pasta raiz e subpastas" tone={driveStatus?.ok ? 'ok' : 'idle'} />
              <InfoCard title="Subpastas" value={prettyNumber(driveStatus?.subfolders_found)} detail={driveStatus?.recursive_enabled ? 'recursive enabled' : 'scan simples'} tone={driveStatus?.ok ? 'ok' : 'idle'} />
              <InfoCard title="Strategy" value={driveStatus?.matching_strategy || 'auto'} detail={`max depth ${driveStatus?.max_depth ?? 2}`} tone="info" />
            </div>

            {driveStatus?.service_account_email ? (
              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                Service account validada: <span className="font-semibold text-slate-100">{driveStatus.service_account_email}</span>
              </div>
            ) : null}

            {driveStatus?.error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {driveStatus.error}
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStepId === 'test_lookup' ? (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
              <Field label="Consulta de teste" hint="Use nome do cliente, numero do documento ou numero do boleto para validar o targeted lookup.">
                <BaseInput value={lookupQuery} onChange={(e) => setLookupQuery(e.target.value)} placeholder="Ex: MENEZES E BATISTA ou 42402-1" />
              </Field>
              <div className="flex items-end">
                <BaseButton tone="primary" onClick={handleLookup} disabled={lookupLoading} className="w-full">
                  {lookupLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  Executar targeted lookup
                </BaseButton>
              </div>
            </div>

            {lookupResult?.error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {lookupResult.error}
              </div>
            ) : null}

            {lookupResult ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <StatusPill tone={lookupResult.exact_match ? 'ok' : 'warning'}>
                    {lookupResult.exact_match ? 'exact_match=true' : 'Sem exact match'}
                  </StatusPill>
                  <StatusPill tone="info">
                    strategy: {lookupResult.strategy || lookupResult.match_origin || lookupResult.first_result?.match_origin || 'n/a'}
                  </StatusPill>
                </div>

                <div className="grid gap-3">
                  {(lookupResult.results || []).slice(0, 5).map((item, index) => (
                    <div key={`${item.file_id || item.file_name || index}`} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-100">{item.file_name || 'Arquivo sem nome'}</p>
                          <p className="mt-1 text-xs text-slate-400">{item.match_origin || 'match'} - {item.score || 0} pts</p>
                        </div>
                        {item.view_url ? (
                          <a href={item.view_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800/80">
                            <ExternalLink size={12} />
                            Ver no Drive
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStepId === 'configure_messages' ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {TEMPLATE_PRESETS.map((preset) => {
                const active = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    disabled={messageSaving}
                    className={`rounded-3xl border p-5 text-left transition ${
                      active
                        ? 'border-blue-500/50 bg-blue-500/10 ring-2 ring-blue-500/30'
                        : 'border-slate-700 bg-slate-900/70 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">{preset.label}</p>
                      {active ? <CheckCircle2 size={16} className="text-blue-300" /> : null}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{preset.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-5">
                <p className="text-sm font-semibold text-slate-100">Preview em tempo real</p>
                <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm leading-relaxed text-slate-200">
                  {messagePreviewLoading ? (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Loader2 size={14} className="animate-spin" />
                      Gerando preview...
                    </div>
                  ) : (
                    messagePreview || 'Selecione um tom para ver o preview da mensagem.'
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-5">
                <p className="text-sm font-semibold text-slate-100">Cobertura dos templates</p>
                <ul className="mt-4 space-y-3 text-sm text-slate-300">
                  <li>Amigavel: relacionamento e proximidade</li>
                  <li>Neutro: padrao operacional equilibrado</li>
                  <li>Firme: cobranca objetiva sem perder cordialidade</li>
                  <li>Juridico: linguagem mais formal e contundente</li>
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {currentStepId === 'validate_env' ? (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-3">
              <BaseButton tone="primary" onClick={handleValidateEnvironment} disabled={envLoading}>
                {envLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                Validar ambiente completo
              </BaseButton>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(envStatus).map(([key, item]) => (
                <div key={key} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold capitalize text-slate-100">{key.replace('_', ' ')}</p>
                    <StatusPill tone={item.status === 'ok' ? 'ok' : item.status === 'warning' ? 'warning' : item.status === 'error' ? 'error' : 'idle'}>
                      {item.status}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {currentStepId === 'test_dispatch' ? (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-5">
                <p className="text-sm font-semibold text-slate-100">Telefone para envio teste</p>
                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
                  <Field label="WhatsApp de teste">
                    <BaseInput value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="5577981376867" />
                  </Field>
                  <div className="flex items-end">
                    <BaseButton tone="success" onClick={handleSendTestDispatch} disabled={testDispatchLoading || !testRecord} className="w-full">
                      {testDispatchLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      Enviar teste agora
                    </BaseButton>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-5">
                <p className="text-sm font-semibold text-slate-100">Titulo escolhido para teste</p>
                {testRecord ? (
                  <div className="mt-4 space-y-2 text-sm text-slate-300">
                    <p><span className="text-slate-500">Cliente:</span> {testRecord.cliente_nome || testRecord.nome || 'Nao informado'}</p>
                    <p><span className="text-slate-500">Documento:</span> {testRecord.documento || testRecord.numero_boleto || testRecord.numero_nf || 'Nao informado'}</p>
                    <p><span className="text-slate-500">Boleto:</span> {testRecord.boleto_pdf_nome || 'Nao informado'}</p>
                    <p><span className="text-slate-500">Telefone atual:</span> {testRecord.telefone || testRecord.cliente_numero || 'Nao informado'}</p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-400">Nenhum titulo elegivel foi carregado ainda.</p>
                )}
              </div>
            </div>

            {testDispatchResult ? (
              <div className={`rounded-3xl border p-5 ${testDispatchResult.success ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill tone={testDispatchResult.success ? 'ok' : 'error'}>
                    {testDispatchResult.success ? 'Envio teste concluido' : 'Falha no envio teste'}
                  </StatusPill>
                  {testDispatchResult.attachment_sent ? <StatusPill tone="ok">attachment_sent=true</StatusPill> : null}
                </div>
                {testDispatchResult.success ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <InfoCard title="Telefone" value={testDispatchResult.phone} tone="ok" />
                    <InfoCard title="Provider message ID" value={testDispatchResult.provider_message_id || 'Pendente'} tone={testDispatchResult.provider_message_id ? 'ok' : 'warning'} />
                    <InfoCard title="Arquivo PDF" value={testDispatchResult.boleto_file_name || 'Nao informado'} tone={testDispatchResult.attachment_sent ? 'ok' : 'warning'} />
                    <InfoCard title="Status" value={testDispatchResult.status || 'sent'} tone="ok" />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-red-100">{testDispatchResult.error}</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStepId === 'complete' ? (
          <div className="space-y-6">
            <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
              <div className="flex items-center gap-3">
                <PartyPopper size={22} className="text-emerald-300" />
                <div>
                  <h3 className="text-lg font-semibold text-emerald-100">Setup operacional concluido</h3>
                  <p className="text-sm text-emerald-100/80">A empresa esta pronta para operar cobranca automatica pelo fluxo oficial do Wizard.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {completeSummary.map((item) => (
                <InfoCard key={item.label} title={item.label} value={item.done ? 'OK' : 'Pendente'} tone={item.done ? 'ok' : 'warning'} />
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <BaseButton tone="primary" onClick={() => onNavigate?.('dashboard')}>
                Ir para Dashboard
              </BaseButton>
              <BaseButton onClick={() => onNavigate?.('dispatch-queue')}>
                Ir para Fila Dispatch
              </BaseButton>
              <BaseButton onClick={() => onNavigate?.('cobrancas')}>
                Ir para Cobranca Automatica
              </BaseButton>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-6">
          <BaseButton onClick={goBack} disabled={currentStepIndex === 0}>
            <ArrowLeft size={16} />
            Voltar
          </BaseButton>

          <div className="flex items-center gap-3">
            {!canAdvanceManually && currentStepId !== 'complete' ? (
              <div className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <AlertTriangle size={16} />
                Finalize esta etapa para continuar.
              </div>
            ) : null}

            {currentStepId !== 'complete' ? (
              <BaseButton tone="primary" onClick={() => advanceStep().catch((error) => onToast?.('erro', error.message || 'Falha ao avancar no wizard.'))} disabled={!canAdvanceManually}>
                Continuar
                <ArrowRight size={16} />
              </BaseButton>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
