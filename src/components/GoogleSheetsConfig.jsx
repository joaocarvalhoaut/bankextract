import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FolderOpen,
  Lock,
  RefreshCw,
  Save,
  Sheet,
  Sparkles,
  Wifi,
} from 'lucide-react';
import {
  getGoogleSheetsConfig,
  getGoogleSheetsStatus,
  normalizeGoogleSheetsStatus,
  saveGoogleSheetsConfig,
  syncGoogleSheetsNow,
  syncGoogleSheets,
  testGoogleSheetsConnection,
  toFriendlyGoogleSheetsError,
} from '../services/googleSheetsService';

function extractSpreadsheetId(input) {
  const match = String(input || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : String(input || '').trim();
}

function StatusBadge({ type, message }) {
  if (!message) return null;
  const styles = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    error: 'border-red-500/30 bg-red-500/10 text-red-300',
    info: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  };
  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertCircle : Sparkles;
  return (
    <div className={`flex items-start gap-2 rounded-2xl border px-3.5 py-3 text-sm shadow-sm ${styles[type] || styles.info}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Label({ children }) {
  return <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{children}</span>;
}

function formatDateTime(value) {
  if (!value) return 'Ainda nao sincronizada';

  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function formatRelativeSyncTime(value) {
  if (!value) {
    return {
      label: 'Nunca',
      tone: 'neutral',
      icon: '⚪',
      health: 'Aguardando sincronizacao',
    };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      label: 'Sincronizacao sem horario valido',
      tone: 'success',
      icon: '🟡',
      health: 'Saudavel',
    };
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 10) {
    return {
      label: `ha ${Math.max(diffMinutes, 1)} min`,
      tone: 'success',
      icon: '🟢',
      health: 'Saudavel',
    };
  }

  if (diffMinutes < 60) {
    return {
      label: `ha ${diffMinutes} min`,
      tone: 'warning',
      icon: '🟡',
      health: 'Atencao',
    };
  }

  const diffHoursRounded = Math.max(1, Math.floor(diffMinutes / 60));
  if (diffHoursRounded < 24) {
    return {
      label: `ha ${diffHoursRounded} h`,
      tone: 'warning',
      icon: '🟡',
      health: 'Atencao',
    };
  }

  const diffDays = Math.max(1, Math.floor(diffHoursRounded / 24));
  return {
    label: `ha ${diffDays} dia${diffDays > 1 ? 's' : ''}`,
    tone: 'warning',
    icon: '🟡',
    health: 'Atencao',
  };

  return {
    label: `Ultima sincronizacao ha ${diffHours}h`,
    tone: 'warning',
    icon: '🔴',
    health: 'Atencao',
  };
}

export default function GoogleSheetsConfig({
  empresaId,
  empresaNome,
  globalMode = false,
  onSaved,
  variant = 'default',
  canManage = true,
  googleMeta = null,
  onToast,
  onStatusChange,
}) {
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('Pagina1');
  const [lastSync, setLastSync] = useState(null);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState(null);
  const [connectionState, setConnectionState] = useState('desconectado');
  const [statusSnapshot, setStatusSnapshot] = useState(null);
  const abortRef = useRef(false);
  const spreadsheetInputRef = useRef(null);

  const isHubVariant = variant === 'hub';

  const loadConfig = useCallback(async () => {
    if (!empresaId || globalMode) return;
    setLoadingConfig(true);
    setStatus(null);
    abortRef.current = false;
    try {
      const config = await getGoogleSheetsConfig(empresaId);
      if (abortRef.current) return;
      if (config) {
        setSpreadsheetId(config.spreadsheet_id || '');
        setSheetName(config.sheet_name || 'Pagina1');
        setLastSync(config.updated_at || null);
        setConnectionState(config.ativo && config.spreadsheet_id ? 'conectado' : 'desconectado');
      } else {
        setSpreadsheetId('');
        setSheetName('Pagina1');
        setLastSync(null);
        setSpreadsheetTitle('');
        setConnectionState('desconectado');
      }
    } catch (err) {
      if (!abortRef.current) {
        setStatus({ type: 'error', message: err.message || 'Erro ao carregar configuracao.' });
      }
    } finally {
      if (!abortRef.current) setLoadingConfig(false);
    }
  }, [empresaId, globalMode]);

  useEffect(() => {
    loadConfig();
    return () => {
      abortRef.current = true;
    };
  }, [loadConfig]);

  const loadStatusSnapshot = useCallback(async () => {
    if (!empresaId || globalMode) return null;

    const snapshot = await getGoogleSheetsStatus(empresaId);
    if (abortRef.current || !snapshot) return snapshot;

    setStatusSnapshot(snapshot);
    setConnectionState(snapshot.status || 'desconectado');
    setLastSync(snapshot.last_source_sync_at || snapshot.updated_at || null);

    if (snapshot.spreadsheet_id) {
      setSpreadsheetId(snapshot.spreadsheet_id);
    }

    if (snapshot.sheet_name) {
      setSheetName(snapshot.sheet_name);
    }

    return snapshot;
  }, [empresaId, globalMode]);

  useEffect(() => {
    loadStatusSnapshot().catch(() => {});
  }, [loadStatusSnapshot]);

  const refreshGoogleMetadata = useCallback(async () => {
    if (!empresaId) return null;

    try {
      const result = await testGoogleSheetsConnection(empresaId);
      if (abortRef.current) return result;
      setSpreadsheetTitle(result?.spreadsheet_title || '');
      setConnectionState(result?.sheet_exists ? 'conectado' : 'desconectado');
      return result;
    } catch (error) {
      if (!abortRef.current) {
        setConnectionState('erro');
        setSpreadsheetTitle('');
      }
      throw error;
    }
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId || globalMode) return;
    if (!spreadsheetId.trim()) {
      setSpreadsheetTitle('');
      return;
    }

    refreshGoogleMetadata().catch(() => {});
  }, [empresaId, globalMode, refreshGoogleMetadata, spreadsheetId]);

  const handleSave = async () => {
    if (!empresaId) return;
    if (!canManage) {
      onToast?.('erro', 'Seu perfil nao pode alterar a integracao Google.');
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const cleanId = extractSpreadsheetId(spreadsheetId);
      await saveGoogleSheetsConfig(empresaId, cleanId, sheetName);
      setSpreadsheetId(cleanId);
      setConnectionState(normalizeGoogleSheetsStatus({ ativo: true, spreadsheet_id: cleanId, sheet_name: sheetName }).status);
      try {
        await refreshGoogleMetadata();
      } catch {}
      await loadStatusSnapshot().catch(() => {});
      setStatus({ type: 'success', message: 'Configuracao salva com sucesso.' });
      onSaved?.();
      onToast?.('sucesso', 'Configuracao Google Sheets salva com sucesso.');
    } catch (err) {
      const friendly = toFriendlyGoogleSheetsError(err, 'Falha ao salvar configuracao do Google Sheets.');
      setStatus({ type: 'error', message: friendly.userMessage || friendly.message });
      onToast?.('erro', friendly.userMessage || friendly.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!empresaId) return;
    if (!canManage) {
      onToast?.('erro', 'Seu perfil nao pode testar a conexao Google.');
      return;
    }
    setTesting(true);
    setStatus(null);
    setConnectionState('syncing');
    try {
      const result = await refreshGoogleMetadata();
      await loadStatusSnapshot().catch(() => {});
      const successMessage = 'Conexao com Google Sheets validada com sucesso.';
      setStatus({ type: 'success', message: result.message || successMessage });
      onToast?.('sucesso', successMessage);
    } catch (err) {
      const friendly = toFriendlyGoogleSheetsError(err, 'Falha ao testar conexao.');
      setStatus({ type: 'error', message: friendly.userMessage || friendly.message });
      onToast?.('erro', friendly.userMessage || friendly.message);
      await loadStatusSnapshot().catch(() => {});
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    if (!empresaId) return;
    if (!canManage) {
      onToast?.('erro', 'Seu perfil nao pode sincronizar o Google Sheets.');
      return;
    }
    setSyncing(true);
    setStatus(null);
    setConnectionState('syncing');
    try {
      const result = await syncGoogleSheetsNow(empresaId);
      setLastSync(new Date().toISOString());
      await loadStatusSnapshot().catch(() => {});
      const successMessage = result.message || `Sincronizacao concluida para ${empresaNome}.`;
      setStatus({
        type: 'success',
        message: successMessage,
      });
      onToast?.('sucesso', successMessage);
    } catch (err) {
      const friendly = toFriendlyGoogleSheetsError(err, 'Falha ao sincronizar com Google Sheets.');
      setStatus({ type: 'error', message: friendly.userMessage || friendly.message });
      onToast?.('erro', friendly.userMessage || friendly.message);
      await loadStatusSnapshot().catch(() => {});
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectSpreadsheet = () => {
    if (!canManage) {
      onToast?.('erro', 'Seu perfil nao pode alterar a planilha desta integracao.');
      return;
    }
    if (sheetsUrl) {
      window.open(sheetsUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    spreadsheetInputRef.current?.focus();
    setStatus({
      type: 'info',
      message: 'Cole o ID ou a URL da planilha para selecionar a planilha desta empresa.',
    });
  };

  if (globalMode) {
    return (
      <div className="card-hover rounded-[30px] border border-white/70 bg-slate-900/70 p-5 shadow-soft backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
            <Sheet size={18} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-50">Integracao Google Sheets</h3>
            <p className="text-sm text-slate-500">Selecione uma empresa especifica para sincronizar.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          A sincronizacao global nao e permitida. Escolha uma empresa especifica antes de conectar ou sincronizar a planilha.
        </div>
      </div>
    );
  }

  if (!empresaId) {
    return (
      <div className="card-hover rounded-[30px] border border-white/70 bg-slate-900/70 p-5 shadow-soft backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
            <Sheet size={18} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-50">Integracao Google Sheets</h3>
            <p className="text-sm text-slate-500">Selecione uma empresa para habilitar a sincronizacao.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-4 text-sm text-slate-300 shadow-sm">
          Nenhuma empresa ativa selecionada para esta integracao.
        </div>
      </div>
    );
  }

  const anyLoading = saving || testing || syncing || loadingConfig;
  const hasConfig = Boolean(spreadsheetId.trim());
  const canSync = Boolean(hasConfig && canManage);
  const resolvedGoogleEmail = String(
    statusSnapshot?.service_account_email ||
      googleMeta?.service_account_email ||
      googleMeta?.google_email ||
      googleMeta?.connected_email ||
      ''
  ).trim();
  const resolvedSpreadsheetName =
    spreadsheetTitle ||
    statusSnapshot?.last_import_file ||
    (hasConfig ? `Planilha ${extractSpreadsheetId(spreadsheetId).slice(0, 10)}...` : 'Nenhuma planilha selecionada');
  const resolvedSheetName = statusSnapshot?.source_sheet_name || sheetName || 'Nenhuma aba selecionada';
  const effectiveLastSync = statusSnapshot?.last_source_sync_at || googleMeta?.last_source_sync_at || lastSync;
  const effectiveLastImportAt = statusSnapshot?.last_import_at || '';
  const syncMeta = formatRelativeSyncTime(effectiveLastSync);
  const importMeta = formatRelativeSyncTime(effectiveLastImportAt);
  const hasRealSyncError = Boolean(statusSnapshot?.last_source_sync_error);
  const isConfigured = Boolean(hasConfig && resolvedSheetName && resolvedSheetName !== 'Nenhuma aba selecionada');
  const syncHealthMeta =
    connectionState === 'syncing'
      ? { ...syncMeta, health: 'Atencao', tone: 'warning', icon: '🟡' }
      : connectionState === 'error' ||
          connectionState === 'erro' ||
          connectionState === 'missing_spreadsheet' ||
          connectionState === 'missing_sheet' ||
          statusSnapshot?.last_source_sync_error
        ? { ...syncMeta, health: 'Erro', tone: 'danger', icon: '🔴' }
        : syncMeta;
  const effectiveSyncHealthMeta =
    connectionState === 'syncing'
      ? { ...syncMeta, health: 'Aguardando sincronizacao', tone: 'neutral', icon: '⚪' }
      : connectionState === 'error' || connectionState === 'erro' || hasRealSyncError
        ? { ...syncMeta, health: 'Erro', tone: 'danger', icon: '🔴' }
        : !isConfigured ||
            connectionState === 'missing_spreadsheet' ||
            connectionState === 'missing_sheet' ||
            !effectiveLastSync
          ? { ...syncMeta, health: 'Aguardando sincronizacao', tone: 'neutral', icon: '⚪' }
          : syncMeta;
  const resolvedStatus =
    connectionState === 'syncing'
      ? { label: 'Sincronizando', tone: 'border-blue-700/40 bg-blue-900/20 text-blue-700' }
      : connectionState === 'error' || connectionState === 'erro'
        ? { label: 'Erro na conexao', tone: 'border-red-200 bg-red-50 text-red-700' }
        : connectionState === 'missing_spreadsheet'
          ? { label: 'Planilha nao selecionada', tone: 'border-amber-200 bg-amber-50 text-amber-700' }
          : connectionState === 'missing_sheet'
            ? { label: 'Aba nao selecionada', tone: 'border-amber-200 bg-amber-50 text-amber-700' }
            : hasConfig
              ? { label: 'Conectado', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
              : { label: 'Nao configurado', tone: 'border-slate-700 bg-slate-800/60 text-slate-300' };
  const sheetsUrl = hasConfig
    ? `https://docs.google.com/spreadsheets/d/${extractSpreadsheetId(spreadsheetId)}/edit`
    : null;

  useEffect(() => {
    const isActive = Boolean(
      (statusSnapshot?.spreadsheet_id || spreadsheetId) &&
      (statusSnapshot?.sheet_name || sheetName) &&
      (statusSnapshot?.status === 'connected' || statusSnapshot?.ativo || hasConfig)
    );
    onStatusChange?.(isActive);
  }, [hasConfig, onStatusChange, sheetName, spreadsheetId, statusSnapshot]);

  if (isHubVariant) {
    const healthStyles = {
      success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      warning: 'border-amber-200 bg-amber-50 text-amber-700',
      danger: 'border-red-200 bg-red-50 text-red-700',
      neutral: 'border-slate-700 bg-slate-800/40 text-slate-300',
    };
    const syncToneClass = healthStyles[effectiveSyncHealthMeta.tone] || healthStyles.neutral;

    return (
      <section className="group rounded-[32px] border border-slate-700/90 bg-slate-900/60 p-7 shadow-[0_22px_70px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_90px_rgba(15,23,42,0.1)] lg:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[24px] bg-blue-900/20 text-blue-700 shadow-sm ring-1 ring-blue-100">
            <Sheet size={22} />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-semibold tracking-tight text-slate-50">Google Sheets</h3>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${resolvedStatus.tone}`}>
                {resolvedStatus.label}
              </span>
              {!canManage ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/40 px-3 py-1 text-xs font-semibold text-slate-300">
                  <Lock size={12} />
                  Somente visualizacao
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
              Conecte a planilha operacional da empresa <span className="font-semibold text-slate-50">{empresaNome || 'ativa'}</span> e acompanhe a sincronizacao automatica dos dados com seguranca.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="surface-elevated rounded-[28px] bg-slate-800/40 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.16em]">Conexao</p>
                <p className="text-slate-400 mt-1 text-xs">Visao da configuracao ativa da planilha.</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900/60 text-slate-200 shadow-sm ring-1 ring-slate-700">
                <Wifi size={16} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="surface-elevated rounded-2xl bg-slate-900/70 px-4 py-4 shadow-sm ring-1 ring-slate-700/40">
                <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.16em]">Status</p>
                <p className="text-slate-50 mt-2 text-sm font-semibold">{resolvedStatus.label}</p>
              </div>
              <div className="surface-elevated rounded-2xl bg-slate-900/70 px-4 py-4 shadow-sm ring-1 ring-slate-700/40">
                <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.16em]">Email Google conectado</p>
                <p
                  title={resolvedGoogleEmail || 'Credencial tecnica do ambiente'}
                  className="text-slate-50 mt-2 max-w-full truncate text-xs font-semibold"
                >
                  {resolvedGoogleEmail || 'Credencial tecnica do ambiente'}
                </p>
              </div>
              <div className="surface-elevated rounded-2xl bg-slate-900/70 px-4 py-4 shadow-sm ring-1 ring-slate-700/40">
                <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.16em]">Planilha selecionada</p>
                <p className="text-slate-50 mt-2 truncate text-xs font-semibold">{resolvedSpreadsheetName}</p>
              </div>
              <div className="surface-elevated rounded-2xl bg-slate-900/70 px-4 py-4 shadow-sm ring-1 ring-slate-700/40">
                <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.16em]">Aba selecionada</p>
                <p className="text-slate-50 mt-2 text-sm font-semibold">{resolvedSheetName}</p>
              </div>
            </div>
          </div>

          <div className="surface-elevated rounded-[28px] bg-slate-800/40 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.16em]">Operacao</p>
                <p className="text-slate-400 mt-1 text-xs">Indicadores operacionais e saude da sincronizacao.</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900/60 text-slate-200 shadow-sm ring-1 ring-slate-700">
                <Activity size={16} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className={`rounded-2xl px-4 py-4 shadow-sm ring-1 ring-inset ${syncToneClass}`}>
                <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.16em]">Ultima sincronizacao</p>
                <p className="mt-2 text-sm font-semibold">{`${effectiveSyncHealthMeta.icon} ${syncMeta.label}`}</p>
                <p className="mt-1 text-xs opacity-80">{formatDateTime(effectiveLastSync)}</p>
              </div>

              <div className="surface-elevated rounded-2xl bg-slate-900/70 px-4 py-4 shadow-sm ring-1 ring-slate-700/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800/60 text-slate-200">
                    <Database size={16} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.16em]">Registros hoje</p>
                    <p className="text-slate-50 mt-1 text-sm font-semibold leading-snug">{statusSnapshot?.records_today ?? googleMeta?.records_today ?? 0} registros</p>
                  </div>
                </div>
              </div>

              <div className="surface-elevated rounded-2xl bg-slate-900/70 px-4 py-4 shadow-sm ring-1 ring-slate-700/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-900/20 text-blue-700">
                    <Clock3 size={16} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.16em]">Ultima importacao</p>
                    <p className="text-slate-50 mt-1 text-sm font-semibold leading-snug">{`${importMeta.icon} ${importMeta.label}`}</p>
                    <p className="text-slate-400 mt-1 text-xs">{statusSnapshot?.last_import_file || 'Nenhuma importacao recente'}</p>
                  </div>
                </div>
              </div>

              <div className="surface-elevated rounded-2xl bg-slate-900/70 px-4 py-4 shadow-sm ring-1 ring-slate-700/40">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${effectiveSyncHealthMeta.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : effectiveSyncHealthMeta.tone === 'warning' ? 'bg-amber-50 text-amber-700' : effectiveSyncHealthMeta.tone === 'danger' ? 'bg-red-50 text-red-700' : 'bg-slate-800/60 text-slate-200'}`}>
                    <Activity size={16} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.16em]">Saude conexao</p>
                    <p className="text-slate-50 mt-1 text-sm font-semibold leading-snug">{effectiveSyncHealthMeta.health}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
          statusSnapshot?.last_source_sync_error
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-blue-700/40 bg-blue-900/20 text-blue-800'
        }`}>
          {statusSnapshot?.last_source_sync_error ||
            'Use a credencial tecnica do Google compartilhada com esta empresa para sincronizar planilhas sem expor segredos no frontend.'}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <Label>ID da planilha</Label>
            <input
              ref={spreadsheetInputRef}
              type="text"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="Cole o ID ou a URL completa da planilha"
              disabled={anyLoading || !canManage}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-slate-50 placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="text-on-light-muted mt-2 text-xs">
              Cole a URL da planilha ou apenas o ID do Google Sheets.
            </p>
          </label>

          <label className="block">
            <Label>Nome da aba</Label>
            <input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Pagina1"
              disabled={anyLoading || !canManage}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-slate-50 placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="text-on-light-muted mt-2 text-xs">Informe o nome exato da aba que recebera a sincronizacao.</p>
          </label>
        </div>

        {status ? <div className="mt-5"><StatusBadge type={status.type} message={status.message} /></div> : null}

        {!canManage ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
            Seu perfil pode apenas visualizar o status desta integracao. Solicite acesso de financeiro, admin ou system admin para editar.
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={anyLoading || !spreadsheetId.trim() || !canManage}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? 'Salvando...' : hasConfig ? 'Gerenciar conexao' : 'Conectar Google'}
          </button>

          <button
            type="button"
            onClick={handleSelectSpreadsheet}
            disabled={anyLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FolderOpen size={14} />
            Selecionar planilha
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={anyLoading || !hasConfig}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Wifi size={14} />
            {testing ? 'Testando...' : 'Testar conexao'}
          </button>

          <button
            type="button"
            onClick={handleSync}
            disabled={anyLoading || !canSync}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(37,99,235,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_34px_rgba(37,99,235,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>

          {sheetsUrl ? (
            <a
              href={sheetsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800/40"
            >
              <ExternalLink size={14} />
              Abrir planilha
            </a>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className="card-hover overflow-hidden rounded-[32px] border border-white/70 bg-slate-900/70 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="hero-mesh border-b border-slate-700/50 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 shadow-sm">
            <Sheet size={18} />
          </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-700/40 bg-slate-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">
                <Sparkles size={12} />
                Integracao viva
              </div>
              <h3 className="mt-3 text-xl font-semibold text-slate-50">Google Sheets</h3>
              <p className="mt-1 text-sm text-slate-300">{empresaNome}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-full border px-3 py-2 text-xs font-semibold shadow-sm ${
                hasConfig
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-700 bg-slate-900/60 text-slate-300'
              }`}
            >
              {hasConfig ? 'Planilha conectada' : 'Aguardando configuracao'}
            </span>
            {sheetsUrl ? (
              <a
                href={sheetsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-900/60/85 px-3 py-2 text-xs font-semibold text-slate-300 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800/40"
              >
                <ExternalLink size={12} />
                Abrir planilha
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {loadingConfig ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="skeleton h-24 rounded-3xl" />
            <div className="skeleton h-24 rounded-3xl" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="rounded-3xl border border-slate-700/50 bg-slate-800/40 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Conexao</p>
                <p className="mt-2 text-base font-semibold text-slate-50">{hasConfig ? 'Configurada' : 'Pendente'}</p>
                <p className="mt-1 text-sm text-slate-500">Use o ID da planilha ou cole a URL completa.</p>
              </div>
              <div className="rounded-3xl border border-blue-700/40/80 bg-blue-900/20/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-blue-700">Sincronizacao</p>
                <p className="mt-2 text-base font-semibold text-blue-950">{lastSync ? 'Atualizada' : 'Nunca sincronizada'}</p>
                <p className="mt-1 text-sm text-blue-700/80">A integracao nunca expone credenciais no frontend.</p>
              </div>
              <div className="rounded-3xl border border-blue-700/40/80 bg-blue-900/20/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-blue-700">Ultima sincronizacao</p>
                <p className="mt-2 text-base font-semibold text-blue-950">
                  {lastSync
                    ? new Date(lastSync).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Aguardando primeira execucao'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <Label>ID da planilha</Label>
                <input
                  type="text"
                  value={spreadsheetId}
                  onChange={(e) => setSpreadsheetId(e.target.value)}
                  placeholder="Cole o ID ou a URL completa da planilha"
                  disabled={anyLoading}
                  className="input-premium w-full"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Encontre na URL: .../spreadsheets/d/<span className="font-semibold text-slate-200">ID_AQUI</span>/edit
                </p>
              </label>

              <label className="block">
                <Label>Nome da aba</Label>
                <input
                  type="text"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder="Pagina1"
                  disabled={anyLoading}
                  className="input-premium w-full"
                />
                <p className="mt-2 text-xs text-slate-500">Informe exatamente o nome da aba de destino.</p>
              </label>
            </div>

            <div className="rounded-2xl border border-blue-700/40 bg-blue-900/20 px-4 py-3 text-sm text-blue-800 shadow-sm">
              Compartilhe a planilha com a credencial tecnica configurada do sistema para permitir escrita segura durante a sincronizacao.
            </div>

            {status ? <StatusBadge type={status.type} message={status.message} /> : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-700/50 pt-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={anyLoading || !spreadsheetId.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? 'Salvando...' : 'Salvar configuracao'}
              </button>

              <button
                type="button"
                onClick={handleTest}
                disabled={anyLoading || !hasConfig}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Wifi size={14} />
                {testing ? 'Testando...' : 'Testar conexao'}
              </button>

              <button
                type="button"
                onClick={handleSync}
                disabled={anyLoading || !hasConfig}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(37,99,235,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_34px_rgba(37,99,235,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
