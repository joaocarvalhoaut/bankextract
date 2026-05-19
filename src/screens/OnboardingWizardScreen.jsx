/**
 * OnboardingWizardScreen.jsx — ETAPA 11
 *
 * Wizard de 7 etapas para configurar uma empresa do zero sem suporte manual.
 * Persiste progresso em onboarding_wizard_progress via onboardingService.
 *
 * Passos:
 *   1. welcome            — Visao geral e boas-vindas
 *   2. connect_whatsapp   — Configurar Z-API (Instance ID + Token)
 *   3. connect_drive      — Configurar Google Drive (pasta de boletos)
 *   4. validate_env       — Validacao automatica do ambiente completo
 *   5. configure_messages — Selecionar preset de tom de mensagens
 *   6. test_dispatch      — Conferir quotas e saude do scheduler
 *   7. complete           — Conclusao com checklist e links
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  FolderOpen,
  Gauge,
  HelpCircle,
  Layers,
  Loader2,
  MessageSquare,
  PartyPopper,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  getWizardProgress,
  saveWizardProgress,
  markWizardComplete,
  WIZARD_STEPS,
  TEMPLATE_PRESETS,
} from '../services/onboardingService';
import {
  getCompanyIntegration,
  saveCompanyIntegration,
  validateCompanyIntegration,
} from '../services/companyIntegrationService';
import {
  testDriveConnection,
  getDriveConfig,
  saveDriveConfig,
  getBillingConfig,
  saveBillingConfig,
  extractFolderIdFromUrl,
} from '../services/billingAutomationService';
import {
  getTenantLimits,
  getProviderHealth,
} from '../services/dispatchQueueService';

// ── Constantes ──────────────────────────────────────────────────────────────

const STEP_IDS = WIZARD_STEPS.map((s) => s.id);

const TONE_COLORS = {
  amigavel: 'emerald',
  neutro:   'blue',
  firme:    'amber',
  juridico: 'red',
};

const TONE_BG = {
  emerald: 'border-emerald-700/60 bg-emerald-900/20',
  blue:    'border-blue-700/60   bg-blue-900/20',
  amber:   'border-amber-700/60  bg-amber-900/20',
  red:     'border-red-700/60    bg-red-900/20',
};

const TONE_BADGE = {
  emerald: 'bg-emerald-900/40 text-emerald-300',
  blue:    'bg-blue-900/40   text-blue-300',
  amber:   'bg-amber-900/40  text-amber-300',
  red:     'bg-red-900/40    text-red-300',
};

// ── Sub-componentes utilitários ──────────────────────────────────────────────

function StepIndicator({ steps, currentIndex, completedSteps }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const done = completedSteps.includes(step.id);
        const active = idx === currentIndex;
        const reachable = idx <= currentIndex || done;

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all
                ${done
                  ? 'bg-emerald-600 text-white'
                  : active
                    ? 'ring-2 ring-blue-500 bg-blue-600 text-white'
                    : reachable
                      ? 'bg-slate-700 text-slate-300'
                      : 'bg-slate-800 text-slate-600'
                }
              `}
              title={step.title}
            >
              {done ? <CheckCircle2 size={14} /> : idx + 1}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`h-0.5 w-6 transition-colors
                  ${done ? 'bg-emerald-600' : 'bg-slate-700'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ValidationRow({ label, status, detail }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <div className="flex items-center gap-2 text-xs">
        {status === 'pending'  && <Loader2 size={14} className="animate-spin text-blue-400" />}
        {status === 'ok'       && <CheckCircle2 size={14} className="text-emerald-400" />}
        {status === 'error'    && <XCircle size={14} className="text-red-400" />}
        {status === 'skip'     && <HelpCircle size={14} className="text-slate-500" />}
        <span className={
          status === 'ok'    ? 'text-emerald-400' :
          status === 'error' ? 'text-red-400'     :
          status === 'skip'  ? 'text-slate-500'   :
          'text-blue-400'
        }>
          {detail || (status === 'pending' ? 'Verificando...' : status === 'skip' ? 'Nao configurado' : '')}
        </span>
      </div>
    </div>
  );
}

function QuotaMiniMeter({ label, used, limit }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'emerald';
  const barClass = tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className={tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-400' : 'text-slate-300'}>
          {used}/{limit}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder, type = 'text', hint }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/30"
      />
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function OnboardingWizardScreen({ companyId, companyName, onToast, onNavigate }) {
  // ── State ──
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [wizardMetadata, setWizardMetadata] = useState({});
  const [loadingWizard, setLoadingWizard] = useState(true);
  const [savingProgress, setSavingProgress] = useState(false);

  // Z-API step state
  const [zapiInstanceId, setZapiInstanceId] = useState('');
  const [zapiToken, setZapiToken] = useState('');
  const [zapiTesting, setZapiTesting] = useState(false);
  const [zapiResult, setZapiResult] = useState(null); // null | 'ok' | 'error'
  const [zapiError, setZapiError] = useState('');

  // Drive step state
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [driveTesting, setDriveTesting] = useState(false);
  const [driveResult, setDriveResult] = useState(null);
  const [driveError, setDriveError] = useState('');

  // Validate env step state
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState({
    zapi:  { status: 'skip', detail: '' },
    drive: { status: 'skip', detail: '' },
    quota: { status: 'skip', detail: '' },
  });
  const [allValidationsPassed, setAllValidationsPassed] = useState(false);

  // Message presets step state
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [previewPresetId, setPreviewPresetId] = useState(null);
  const [savingPreset, setSavingPreset] = useState(false);

  // Test dispatch step state
  const [tenantLimits, setTenantLimits] = useState(null);
  const [quotaUsage, setQuotaUsage]     = useState(null);
  const [providerHealth, setProviderHealth] = useState(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);

  const saveTimerRef = useRef(null);

  // ── Load saved progress on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!companyId) {
      setLoadingWizard(false);
      return;
    }

    let alive = true;
    setLoadingWizard(true);

    Promise.all([
      getWizardProgress(companyId),
      getCompanyIntegration(companyId, 'zapi').catch(() => null),
      getDriveConfig(companyId).catch(() => null),
      getBillingConfig(companyId).catch(() => null),
    ]).then(([progress, zapiIntegration, driveConfig, billingConfig]) => {
      if (!alive) return;

      // Restore wizard state
      if (progress?.current_step) {
        const savedIdx = STEP_IDS.indexOf(progress.current_step);
        if (savedIdx >= 0) setCurrentStepIndex(savedIdx);
      }
      if (Array.isArray(progress?.completed_steps)) {
        setCompletedSteps(progress.completed_steps);
      }
      if (progress?.metadata) {
        setWizardMetadata(progress.metadata);
      }

      // Pre-fill Z-API fields if already configured
      if (zapiIntegration?.instance_id) setZapiInstanceId(zapiIntegration.instance_id);
      if (zapiIntegration?.connected) setZapiResult('ok');

      // Pre-fill Drive field if already configured
      if (driveConfig?.folder_id) {
        setDriveFolderUrl(driveConfig.folder_id);
        setDriveResult('ok');
      }

      // Restore selected preset
      if (billingConfig?.preset_id) setSelectedPreset(billingConfig.preset_id);

    }).catch((err) => {
      if (!alive) return;
      console.warn('[OnboardingWizard] load progress error:', err.message);
    }).finally(() => {
      if (alive) setLoadingWizard(false);
    });

    return () => { alive = false; };
  }, [companyId]);

  // ── Load dispatch data when on step 5 ─────────────────────────────────────
  useEffect(() => {
    if (STEP_IDS[currentStepIndex] !== 'test_dispatch') return;
    if (!companyId) return;

    let alive = true;
    setDispatchLoading(true);

    Promise.all([
      getTenantLimits(companyId).catch(() => null),
      getProviderHealth(companyId).catch(() => null),
    ]).then(([limits, health]) => {
      if (!alive) return;
      if (limits?.limits) setTenantLimits(limits.limits);
      if (limits?.usage)  setQuotaUsage(limits.usage);
      setProviderHealth(health);
    }).finally(() => {
      if (alive) setDispatchLoading(false);
    });

    return () => { alive = false; };
  }, [companyId, currentStepIndex]);

  // ── Persist progress (debounced) ───────────────────────────────────────────
  const persistProgress = useCallback((stepIdx, completed, meta) => {
    if (!companyId) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveWizardProgress(companyId, STEP_IDS[stepIdx], completed, meta).catch(() => {});
    }, 600);
  }, [companyId]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const advanceStep = useCallback(async () => {
    const currentId = STEP_IDS[currentStepIndex];
    const nextIdx = currentStepIndex + 1;
    const nextCompletedSteps = completedSteps.includes(currentId)
      ? completedSteps
      : [...completedSteps, currentId];

    setSavingProgress(true);
    try {
      if (nextIdx >= STEP_IDS.length) {
        await markWizardComplete(companyId, wizardMetadata);
        setCompletedSteps(WIZARD_STEPS.map((s) => s.id));
        setCurrentStepIndex(STEP_IDS.length - 1);
        onToast?.('sucesso', 'Wizard de onboarding concluido!');
        return;
      }
      setCompletedSteps(nextCompletedSteps);
      setCurrentStepIndex(nextIdx);
      persistProgress(nextIdx, nextCompletedSteps, wizardMetadata);
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao salvar progresso.');
    } finally {
      setSavingProgress(false);
    }
  }, [companyId, completedSteps, currentStepIndex, persistProgress, wizardMetadata, onToast]);

  const goBack = useCallback(() => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      persistProgress(prevIdx, completedSteps, wizardMetadata);
    }
  }, [completedSteps, currentStepIndex, persistProgress, wizardMetadata]);

  // ── Z-API test ─────────────────────────────────────────────────────────────
  const handleTestZapi = useCallback(async () => {
    if (!zapiInstanceId.trim() || !zapiToken.trim()) {
      setZapiError('Preencha o Instance ID e o Token antes de testar.');
      return;
    }

    setZapiTesting(true);
    setZapiResult(null);
    setZapiError('');

    try {
      await saveCompanyIntegration(companyId, {
        instance_id: zapiInstanceId.trim(),
        token: zapiToken.trim(),
      }, 'zapi');

      await validateCompanyIntegration(companyId, {
        instance_id: zapiInstanceId.trim(),
        token: zapiToken.trim(),
      });

      setZapiResult('ok');
      setWizardMetadata((prev) => ({ ...prev, zapi_connected: true, zapi_instance: zapiInstanceId.trim() }));
      onToast?.('sucesso', 'WhatsApp Z-API conectado com sucesso!');
    } catch (err) {
      setZapiResult('error');
      setZapiError(err.message || 'Falha na conexao com Z-API.');
    } finally {
      setZapiTesting(false);
    }
  }, [companyId, zapiInstanceId, zapiToken, onToast]);

  // ── Drive test ────────────────────────────────────────────────────────────
  const handleTestDrive = useCallback(async () => {
    if (!driveFolderUrl.trim()) {
      setDriveError('Informe a URL ou ID da pasta do Google Drive.');
      return;
    }

    setDriveTesting(true);
    setDriveResult(null);
    setDriveError('');

    try {
      // Try to extract folder ID from URL first
      let folderId = driveFolderUrl.trim();
      try {
        const extracted = await extractFolderIdFromUrl(companyId, driveFolderUrl.trim());
        if (extracted?.folder_id) folderId = extracted.folder_id;
      } catch {
        // If extraction fails, use raw value — might already be an ID
      }

      await saveDriveConfig(companyId, folderId);
      await testDriveConnection(companyId);

      setDriveResult('ok');
      setWizardMetadata((prev) => ({ ...prev, drive_connected: true, drive_folder_id: folderId }));
      onToast?.('sucesso', 'Google Drive conectado com sucesso!');
    } catch (err) {
      setDriveResult('error');
      setDriveError(err.message || 'Falha ao conectar com o Google Drive.');
    } finally {
      setDriveTesting(false);
    }
  }, [companyId, driveFolderUrl, onToast]);

  // ── Validate environment ───────────────────────────────────────────────────
  const handleValidateAll = useCallback(async () => {
    setValidating(true);
    setAllValidationsPassed(false);
    setValidationResults({
      zapi:  { status: 'pending', detail: 'Verificando...' },
      drive: { status: 'pending', detail: 'Verificando...' },
      quota: { status: 'pending', detail: 'Verificando...' },
    });

    const results = { zapi: {}, drive: {}, quota: {} };

    // Z-API
    try {
      const zapiIntegration = await getCompanyIntegration(companyId, 'zapi');
      if (!zapiIntegration?.connected && !zapiIntegration?.instance_id) {
        results.zapi = { status: 'skip', detail: 'Nao configurado — volte ao passo 2.' };
      } else {
        await validateCompanyIntegration(companyId, {
          instance_id: zapiIntegration?.instance_id || '',
          token: zapiIntegration?.token || '',
        });
        results.zapi = { status: 'ok', detail: 'Conexao ativa' };
      }
    } catch (err) {
      results.zapi = { status: 'error', detail: err.message || 'Falha Z-API' };
    }

    setValidationResults((prev) => ({ ...prev, zapi: results.zapi }));

    // Google Drive
    try {
      const driveConfig = await getDriveConfig(companyId);
      if (!driveConfig?.folder_id) {
        results.drive = { status: 'skip', detail: 'Nao configurado — volte ao passo 3.' };
      } else {
        await testDriveConnection(companyId);
        results.drive = { status: 'ok', detail: 'Acesso confirmado' };
      }
    } catch (err) {
      results.drive = { status: 'error', detail: err.message || 'Falha Drive' };
    }

    setValidationResults((prev) => ({ ...prev, drive: results.drive }));

    // Quota
    try {
      const limitsData = await getTenantLimits(companyId);
      const enabled = limitsData?.limits?.enabled !== false;
      const usage = limitsData?.usage;
      const msg = enabled
        ? `${usage?.daily_messages ?? 0}/${limitsData?.limits?.max_daily_messages ?? 500} msgs/dia`
        : 'Empresa suspensa';
      results.quota = {
        status: enabled ? 'ok' : 'error',
        detail: msg,
      };
    } catch (err) {
      results.quota = { status: 'error', detail: err.message || 'Falha quota' };
    }

    setValidationResults((prev) => ({ ...prev, quota: results.quota }));

    const passed = (
      (results.zapi.status  === 'ok' || results.zapi.status  === 'skip') &&
      (results.drive.status === 'ok' || results.drive.status === 'skip') &&
       results.quota.status === 'ok'
    );

    setAllValidationsPassed(passed);
    setWizardMetadata((prev) => ({ ...prev, validation_passed: passed, validation_at: new Date().toISOString() }));
    setValidating(false);
  }, [companyId]);

  // ── Save preset ────────────────────────────────────────────────────────────
  const handleSelectPreset = useCallback(async (presetId) => {
    setSelectedPreset(presetId);
    const preset = TEMPLATE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setSavingPreset(true);
    try {
      await saveBillingConfig(companyId, {
        preset_id: presetId,
        mensagem_template: preset.template_atraso,
        template_preventiva: preset.template_preventiva,
        template_vencimento: preset.template_vencimento,
        template_atraso: preset.template_atraso,
      });
      setWizardMetadata((prev) => ({ ...prev, preset_id: presetId }));
      onToast?.('sucesso', `Preset "${preset.label}" aplicado.`);
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao salvar preset.');
    } finally {
      setSavingPreset(false);
    }
  }, [companyId, onToast]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast?.('sucesso', 'Copiado para a area de transferencia.');
    } catch {
      onToast?.('aviso', 'Nao foi possivel copiar. Copie manualmente.');
    }
  }, [onToast]);

  // ── Can advance check ──────────────────────────────────────────────────────
  const canAdvance = useCallback(() => {
    const stepId = STEP_IDS[currentStepIndex];
    if (stepId === 'connect_whatsapp') {
      // Allow advancing even without testing — user may skip
      return true;
    }
    if (stepId === 'connect_drive') {
      return true; // Skip allowed
    }
    if (stepId === 'validate_env') {
      return allValidationsPassed;
    }
    if (stepId === 'configure_messages') {
      return Boolean(selectedPreset);
    }
    return true;
  }, [currentStepIndex, allValidationsPassed, selectedPreset]);

  // ── Render loading ─────────────────────────────────────────────────────────
  if (loadingWizard) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-blue-500" />
      </div>
    );
  }

  const currentStep = WIZARD_STEPS[currentStepIndex];
  const isCompleteStep = currentStep?.id === 'complete';

  // ── Step renderers ─────────────────────────────────────────────────────────

  const renderStepContent = () => {
    switch (currentStep?.id) {

      // ── 1. Welcome ─────────────────────────────────────────────────────────
      case 'welcome':
        return (
          <div className="space-y-6">
            <div className="hero-mesh overflow-hidden rounded-2xl border border-slate-700/60 px-8 py-10 text-center shadow-soft">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/20 ring-1 ring-blue-500/30">
                <Rocket size={26} className="text-blue-400" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-50">
                Bem-vindo, {companyName ? companyName : 'ao NC Finance'}!
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Este wizard configura sua empresa em {WIZARD_STEPS.length - 1} etapas rapidas — sem suporte manual.
              </p>
            </div>

            <div className="surface-card rounded-2xl p-6 shadow-soft">
              <h3 className="mb-4 text-sm font-semibold text-slate-200">O que vamos configurar</h3>
              <ul className="space-y-3">
                {[
                  { icon: Smartphone,   label: 'WhatsApp Z-API',      detail: 'Token de acesso para envio real de cobranças' },
                  { icon: FolderOpen,   label: 'Google Drive',         detail: 'Pasta com boletos PDF para leitura automatica' },
                  { icon: ShieldCheck,  label: 'Validacao do ambiente', detail: 'Checklist automatico de integracoes e quotas' },
                  { icon: MessageSquare,label: 'Tom de mensagens',      detail: 'Preset pronto para amigavel, neutro, firme ou juridico' },
                  { icon: Layers,       label: 'Fila de dispatch',      detail: 'Quotas, health do provider e scheduler ativo' },
                ].map(({ icon: Icon, label, detail }) => (
                  <li key={label} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-800/30 px-4 py-3">
                    <Icon size={15} className="mt-0.5 flex-shrink-0 text-blue-400" />
                    <div>
                      <span className="text-sm font-medium text-slate-200">{label}</span>
                      <p className="text-xs text-slate-500">{detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );

      // ── 2. Connect WhatsApp ────────────────────────────────────────────────
      case 'connect_whatsapp':
        return (
          <div className="space-y-5">
            <div className="surface-card rounded-2xl p-6 shadow-soft">
              <div className="mb-4 flex items-center gap-2">
                <Smartphone size={16} className="text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-200">Credenciais Z-API</h3>
              </div>
              <div className="space-y-4">
                <FieldInput
                  label="Instance ID"
                  value={zapiInstanceId}
                  onChange={setZapiInstanceId}
                  placeholder="Ex: 3A5E79B1C2D..."
                  hint="Encontrado no painel Z-API → Instancia → ID"
                />
                <FieldInput
                  label="Token"
                  value={zapiToken}
                  onChange={setZapiToken}
                  placeholder="Cole o token aqui"
                  type="password"
                  hint="Painel Z-API → Instancia → Security → Client Token"
                />

                <button
                  type="button"
                  onClick={handleTestZapi}
                  disabled={zapiTesting || !zapiInstanceId.trim() || !zapiToken.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {zapiTesting
                    ? <><Loader2 size={14} className="animate-spin" /> Testando conexao...</>
                    : <><Zap size={14} /> Testar conexao</>
                  }
                </button>

                {zapiResult === 'ok' && (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-900/20 px-4 py-3 text-sm text-emerald-300 border border-emerald-700/40">
                    <CheckCircle2 size={15} /> WhatsApp conectado com sucesso!
                  </div>
                )}
                {zapiResult === 'error' && (
                  <div className="flex items-start gap-2 rounded-xl bg-red-900/20 px-4 py-3 text-sm text-red-300 border border-red-700/40">
                    <XCircle size={15} className="mt-0.5 flex-shrink-0" />
                    <span>{zapiError || 'Falha na conexao. Verifique as credenciais.'}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 px-4 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Como obter</p>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-400">
                <li>Acesse <span className="text-blue-400">app.z-api.io</span> e faca login.</li>
                <li>Abra a instancia desejada e copie o <strong className="text-slate-300">Instance ID</strong>.</li>
                <li>Va em <strong className="text-slate-300">Security → Client Token</strong> e copie o token.</li>
                <li>Cole os dados acima e clique em Testar conexao.</li>
              </ol>
            </div>
          </div>
        );

      // ── 3. Connect Drive ───────────────────────────────────────────────────
      case 'connect_drive':
        return (
          <div className="space-y-5">
            <div className="surface-card rounded-2xl p-6 shadow-soft">
              <div className="mb-4 flex items-center gap-2">
                <FolderOpen size={16} className="text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-200">Pasta de boletos no Google Drive</h3>
              </div>
              <div className="space-y-4">
                <FieldInput
                  label="URL ou ID da pasta"
                  value={driveFolderUrl}
                  onChange={setDriveFolderUrl}
                  placeholder="https://drive.google.com/drive/folders/1ABC... ou ID direto"
                  hint="A conta de servico deve ter acesso de leitura a esta pasta."
                />

                <button
                  type="button"
                  onClick={handleTestDrive}
                  disabled={driveTesting || !driveFolderUrl.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {driveTesting
                    ? <><Loader2 size={14} className="animate-spin" /> Testando acesso...</>
                    : <><FolderOpen size={14} /> Testar acesso ao Drive</>
                  }
                </button>

                {driveResult === 'ok' && (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-900/20 px-4 py-3 text-sm text-emerald-300 border border-emerald-700/40">
                    <CheckCircle2 size={15} /> Google Drive conectado com sucesso!
                  </div>
                )}
                {driveResult === 'error' && (
                  <div className="flex items-start gap-2 rounded-xl bg-red-900/20 px-4 py-3 text-sm text-red-300 border border-red-700/40">
                    <XCircle size={15} className="mt-0.5 flex-shrink-0" />
                    <span>{driveError || 'Falha no acesso. Verifique as permissoes da pasta.'}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 px-4 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Permissao necessaria</p>
              <p className="text-xs text-slate-400">
                Compartilhe a pasta com a conta de servico do NC Finance (
                <button
                  type="button"
                  onClick={() => copyToClipboard('nc-finance@seu-projeto.iam.gserviceaccount.com')}
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                >
                  ver email <ClipboardCopy size={11} />
                </button>
                ) com papel de <strong className="text-slate-300">Leitor</strong>.
              </p>
            </div>
          </div>
        );

      // ── 4. Validate Environment ────────────────────────────────────────────
      case 'validate_env':
        return (
          <div className="space-y-5">
            <div className="surface-card rounded-2xl p-6 shadow-soft">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck size={16} className="text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-200">Checklist automatico do ambiente</h3>
              </div>
              <div className="space-y-2">
                <ValidationRow label="WhatsApp Z-API" status={validationResults.zapi.status}  detail={validationResults.zapi.detail} />
                <ValidationRow label="Google Drive"   status={validationResults.drive.status} detail={validationResults.drive.detail} />
                <ValidationRow label="Quotas / Tenant" status={validationResults.quota.status} detail={validationResults.quota.detail} />
              </div>

              <button
                type="button"
                onClick={handleValidateAll}
                disabled={validating}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {validating
                  ? <><Loader2 size={14} className="animate-spin" /> Validando ambiente...</>
                  : <><ShieldCheck size={14} /> Validar ambiente</>
                }
              </button>

              {!validating && allValidationsPassed && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-900/20 px-4 py-3 text-sm text-emerald-300 border border-emerald-700/40">
                  <CheckCircle2 size={15} /> Ambiente validado! Pode avancar.
                </div>
              )}
              {!validating && !allValidationsPassed && validationResults.quota.status !== 'skip' && (
                <p className="mt-3 text-center text-xs text-slate-500">
                  Itens com erro precisam ser corrigidos antes de avancar.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 px-4 py-3">
              <p className="text-xs text-slate-500">
                <strong className="text-slate-400">Dica:</strong> Itens marcados como &quot;nao configurado&quot; podem ser pulados agora e configurados depois — voce conseguira avancar mesmo assim.
              </p>
            </div>
          </div>
        );

      // ── 5. Configure Messages ──────────────────────────────────────────────
      case 'configure_messages':
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Selecione o tom das mensagens de cobranca. Voce pode ajustar os templates depois em <strong className="text-slate-300">Automacoes</strong>.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TEMPLATE_PRESETS.map((preset) => {
                const color = TONE_COLORS[preset.id] || 'blue';
                const isSelected = selectedPreset === preset.id;
                const isPreviewing = previewPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    disabled={savingPreset}
                    className={`w-full rounded-2xl border p-4 text-left transition-all
                      ${isSelected
                        ? `ring-2 ring-offset-2 ring-offset-[#060d19] ring-blue-500 ${TONE_BG[color]}`
                        : `border-slate-700/60 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/60`
                      }
                    `}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">{preset.label}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE_BADGE[color]}`}>
                            {preset.tone}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{preset.description}</p>
                      </div>
                      {isSelected && <CheckCircle2 size={16} className="flex-shrink-0 text-emerald-400" />}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPreviewPresetId(isPreviewing ? null : preset.id); }}
                      className="mt-2 text-[11px] text-blue-400 hover:text-blue-300"
                    >
                      {isPreviewing ? 'Ocultar' : 'Ver exemplo de atraso'} ↓
                    </button>

                    {isPreviewing && (
                      <div className="mt-2 rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2 text-xs text-slate-400 whitespace-pre-wrap">
                        {preset.template_atraso}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {!selectedPreset && (
              <p className="text-center text-xs text-amber-400">
                <AlertTriangle size={12} className="mr-1 inline" />
                Selecione um preset para continuar.
              </p>
            )}
          </div>
        );

      // ── 6. Test Dispatch ───────────────────────────────────────────────────
      case 'test_dispatch':
        return (
          <div className="space-y-5">
            <div className="surface-card rounded-2xl p-6 shadow-soft">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gauge size={16} className="text-blue-400" />
                  <h3 className="text-sm font-semibold text-slate-200">Quotas da empresa</h3>
                </div>
                {dispatchLoading && <Loader2 size={14} className="animate-spin text-slate-500" />}
              </div>

              {tenantLimits && quotaUsage ? (
                <div className="space-y-3">
                  <QuotaMiniMeter
                    label="Mensagens hoje"
                    used={quotaUsage.daily_messages ?? 0}
                    limit={tenantLimits.max_daily_messages ?? 500}
                  />
                  <QuotaMiniMeter
                    label="Jobs ativos"
                    used={quotaUsage.active_jobs ?? 0}
                    limit={tenantLimits.max_active_jobs ?? 3}
                  />
                  <QuotaMiniMeter
                    label="Retries / hora"
                    used={quotaUsage.retries_last_hour ?? 0}
                    limit={tenantLimits.max_retries_per_hour ?? 30}
                  />
                </div>
              ) : !dispatchLoading ? (
                <p className="text-xs text-slate-500">Dados de quota nao disponiveis.</p>
              ) : null}
            </div>

            {providerHealth && (
              <div className="surface-card rounded-2xl p-5 shadow-soft">
                <div className="mb-3 flex items-center gap-2">
                  <Zap size={15} className="text-blue-400" />
                  <h3 className="text-sm font-semibold text-slate-200">Saude do provider WhatsApp</h3>
                </div>
                <div className="flex items-center gap-2">
                  {providerHealth.state === 'healthy'   && <span className="rounded-full bg-emerald-900/30 px-3 py-1 text-xs font-medium text-emerald-400">✓ Saudavel</span>}
                  {providerHealth.state === 'degraded'  && <span className="rounded-full bg-amber-900/30  px-3 py-1 text-xs font-medium text-amber-400">~ Degradado</span>}
                  {providerHealth.state === 'unhealthy' && <span className="rounded-full bg-red-900/30    px-3 py-1 text-xs font-medium text-red-400">✗ Inoperante</span>}
                  {!providerHealth.state && <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">Sem dados ainda</span>}
                </div>
                {(providerHealth.consecutive_failures ?? 0) > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {providerHealth.consecutive_failures} falha(s) consecutiva(s) registrada(s).
                  </p>
                )}
              </div>
            )}

            <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 px-4 py-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proximos passos</p>
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-blue-400" />
                  Acesse <strong className="text-slate-300">Fila Dispatch</strong> para criar o primeiro job real.
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-blue-400" />
                  Va em <strong className="text-slate-300">Automacoes</strong> para ativar a cadencia automatica.
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-blue-400" />
                  Importe a carteira em <strong className="text-slate-300">Importacao</strong> para habilitar as cobranças.
                </li>
              </ul>
              <button
                type="button"
                onClick={() => onNavigate?.('dispatch-queue')}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300"
              >
                <ExternalLink size={12} /> Abrir Fila Dispatch agora
              </button>
            </div>
          </div>
        );

      // ── 7. Complete ────────────────────────────────────────────────────────
      case 'complete':
        return (
          <div className="space-y-6">
            <div className="hero-mesh overflow-hidden rounded-2xl border border-emerald-700/30 bg-emerald-900/10 px-8 py-10 text-center shadow-soft">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600/20 ring-1 ring-emerald-500/30">
                <PartyPopper size={26} className="text-emerald-400" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-50">
                {companyName ? `${companyName} esta pronta!` : 'Empresa configurada!'}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Todas as etapas foram concluidas. O sistema esta pronto para operar.
              </p>
            </div>

            <div className="surface-card rounded-2xl p-6 shadow-soft">
              <h3 className="mb-4 text-sm font-semibold text-slate-200">Checklist de implantacao</h3>
              <ul className="space-y-2">
                {[
                  { label: 'WhatsApp Z-API',        done: Boolean(wizardMetadata.zapi_connected) },
                  { label: 'Google Drive',           done: Boolean(wizardMetadata.drive_connected) },
                  { label: 'Ambiente validado',      done: Boolean(wizardMetadata.validation_passed) },
                  { label: 'Preset de mensagens',    done: Boolean(wizardMetadata.preset_id) },
                  { label: 'Quotas conferidas',      done: Boolean(tenantLimits) },
                ].map(({ label, done }) => (
                  <li key={label} className="flex items-center gap-3 text-sm">
                    {done
                      ? <CheckCircle2 size={15} className="flex-shrink-0 text-emerald-400" />
                      : <AlertTriangle size={15} className="flex-shrink-0 text-amber-400" />
                    }
                    <span className={done ? 'text-slate-200' : 'text-slate-400'}>{label}</span>
                    {!done && <span className="text-xs text-slate-600">(opcional)</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="surface-card rounded-2xl p-5 shadow-soft">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">Ir para</h3>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Fila Dispatch',  tab: 'dispatch-queue', icon: Layers },
                  { label: 'Automacoes',     tab: 'automacoes',     icon: Sparkles },
                  { label: 'Importacao',     tab: 'importacao',     icon: BadgeCheck },
                  { label: 'Dashboard',      tab: 'dashboard',      icon: Gauge },
                ].map(({ label, tab, icon: Icon }) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => onNavigate?.(tab)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
                  >
                    <Icon size={12} className="text-blue-400" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Progress header */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4 shadow-soft">
        <div>
          <h1 className="text-base font-semibold text-slate-100">
            {currentStep?.title || 'Wizard'}
          </h1>
          <p className="text-xs text-slate-500">
            Passo {currentStepIndex + 1} de {WIZARD_STEPS.length}
          </p>
        </div>
        <StepIndicator
          steps={WIZARD_STEPS}
          currentIndex={currentStepIndex}
          completedSteps={completedSteps}
        />
      </div>

      {/* Step content */}
      {renderStepContent()}

      {/* Navigation */}
      {!isCompleteStep && (
        <div className="flex items-center justify-between gap-3 pb-4">
          <button
            type="button"
            onClick={goBack}
            disabled={currentStepIndex === 0 || savingProgress}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft size={14} /> Voltar
          </button>

          <button
            type="button"
            onClick={advanceStep}
            disabled={!canAdvance() || savingProgress}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingProgress
              ? <><Loader2 size={14} className="animate-spin" /> Salvando...</>
              : currentStepIndex === WIZARD_STEPS.length - 2
                ? <><PartyPopper size={14} /> Concluir wizard</>
                : <>{currentStep?.id === 'connect_whatsapp' && !zapiResult
                    ? 'Pular por agora'
                    : currentStep?.id === 'connect_drive' && !driveResult
                      ? 'Pular por agora'
                      : 'Continuar'
                  } <ArrowRight size={14} /></>
            }
          </button>
        </div>
      )}
    </div>
  );
}
