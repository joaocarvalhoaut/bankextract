import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
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
  saveGoogleSheetsConfig,
  syncGoogleSheets,
  testGoogleSheetsConnection,
} from '../services/googleSheetsService';

function extractSpreadsheetId(input) {
  const match = String(input || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : String(input || '').trim();
}

function StatusBadge({ type, message }) {
  if (!message) return null;
  const styles = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    error: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
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

export default function GoogleSheetsConfig({
  empresaId,
  empresaNome,
  globalMode = false,
  onSaved,
  variant = 'default',
  canManage = true,
  googleMeta = null,
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
    setSaving(true);
    setStatus(null);
    try {
      const cleanId = extractSpreadsheetId(spreadsheetId);
      await saveGoogleSheetsConfig(empresaId, cleanId, sheetName);
      setSpreadsheetId(cleanId);
      setConnectionState('conectado');
      try {
        await refreshGoogleMetadata();
      } catch {}
      setStatus({ type: 'success', message: 'Configuracao salva com sucesso.' });
      onSaved?.();
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Erro ao salvar configuracao.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!empresaId) return;
    setTesting(true);
    setStatus(null);
    try {
      const result = await refreshGoogleMetadata();
      setStatus({ type: 'success', message: result.message || 'Conexao testada com sucesso.' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Falha no teste de conexao.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    if (!empresaId) return;
    setSyncing(true);
    setStatus(null);
    try {
      const result = await syncGoogleSheets(empresaId);
      setLastSync(new Date().toISOString());
      setConnectionState('conectado');
      setStatus({
        type: 'success',
        message: result.message || `Sincronizacao concluida para ${empresaNome}.`,
      });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Falha ao sincronizar com Google Sheets.' });
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectSpreadsheet = () => {
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
      <div className="card-hover rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-soft backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Sheet size={18} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-950">Integracao Google Sheets</h3>
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
      <div className="card-hover rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-soft backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Sheet size={18} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-950">Integracao Google Sheets</h3>
            <p className="text-sm text-slate-500">Selecione uma empresa para habilitar a sincronizacao.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 shadow-sm">
          Nenhuma empresa ativa selecionada para esta integracao.
        </div>
      </div>
    );
  }

  const anyLoading = saving || testing || syncing || loadingConfig;
  const hasConfig = Boolean(spreadsheetId.trim());
  const canSync = Boolean(hasConfig && canManage);
  const resolvedGoogleEmail = String(
    googleMeta?.service_account_email ||
      googleMeta?.google_email ||
      googleMeta?.connected_email ||
      ''
  ).trim();
  const resolvedSpreadsheetName = spreadsheetTitle || (hasConfig ? `Planilha ${extractSpreadsheetId(spreadsheetId).slice(0, 10)}...` : 'Nenhuma planilha selecionada');
  const resolvedSheetName = sheetName || 'Nenhuma aba selecionada';
  const effectiveLastSync = googleMeta?.last_source_sync_at || lastSync;
  const resolvedStatus =
    connectionState === 'erro'
      ? { label: 'Erro na conexao', tone: 'border-red-200 bg-red-50 text-red-700' }
      : hasConfig
        ? { label: 'Conectado', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
        : { label: 'Desconectado', tone: 'border-slate-200 bg-slate-100 text-slate-600' };
  const sheetsUrl = hasConfig
    ? `https://docs.google.com/spreadsheets/d/${extractSpreadsheetId(spreadsheetId)}/edit`
    : null;

  if (isHubVariant) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-blue-50 text-blue-700">
            <Sheet size={22} />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Google Drive / Google Sheets</h3>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${resolvedStatus.tone}`}>
                {resolvedStatus.label}
              </span>
              {!canManage ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  <Lock size={12} />
                  Somente visualizacao
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Conecte a planilha operacional da empresa <span className="font-semibold text-slate-900">{empresaNome || 'ativa'}</span> e acompanhe a sincronizacao com a credencial segura do ambiente.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{resolvedStatus.label}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Email Google conectado</p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-900">{resolvedGoogleEmail || 'Credencial tecnica do ambiente'}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Planilha selecionada</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{resolvedSpreadsheetName}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Aba selecionada</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{resolvedSheetName}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ultima sincronizacao</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(effectiveLastSync)}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-sm">
          Use a credencial tecnica do Google compartilhada com esta empresa para sincronizar planilhas sem expor segredos no frontend.
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <Label>ID da planilha</Label>
            <input
              ref={spreadsheetInputRef}
              type="text"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="Cole o ID ou a URL completa da planilha"
              disabled={anyLoading || !canManage}
              className="input-premium w-full disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-2 text-xs text-slate-500">
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
              className="input-premium w-full disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-2 text-xs text-slate-500">Informe o nome exato da aba que recebera a sincronizacao.</p>
          </label>
        </div>

        {status ? <div className="mt-4"><StatusBadge type={status.type} message={status.message} /></div> : null}

        {!canManage ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Seu perfil pode apenas visualizar o status desta integracao. Solicite acesso de financeiro, admin ou system admin para editar.
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={anyLoading || !spreadsheetId.trim() || !canManage}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? 'Conectando...' : 'Conectar Google'}
          </button>

          <button
            type="button"
            onClick={handleSelectSpreadsheet}
            disabled={anyLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FolderOpen size={14} />
            Selecionar planilha
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={anyLoading || !hasConfig}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
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
    <div className="card-hover overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="hero-mesh border-b border-slate-200/80 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm">
              <Sheet size={18} />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                <Sparkles size={12} />
                Integracao viva
              </div>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">Google Sheets</h3>
              <p className="mt-1 text-sm text-slate-600">{empresaNome}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-full border px-3 py-2 text-xs font-semibold shadow-sm ${
                hasConfig
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white/80 text-slate-600'
              }`}
            >
              {hasConfig ? 'Planilha conectada' : 'Aguardando configuracao'}
            </span>
            {sheetsUrl ? (
              <a
                href={sheetsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
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
              <div className="rounded-3xl border border-slate-200/80 bg-slate-50/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Conexao</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{hasConfig ? 'Configurada' : 'Pendente'}</p>
                <p className="mt-1 text-sm text-slate-500">Use o ID da planilha ou cole a URL completa.</p>
              </div>
              <div className="rounded-3xl border border-blue-200/80 bg-blue-50/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-blue-700">Sincronizacao</p>
                <p className="mt-2 text-base font-semibold text-blue-950">{lastSync ? 'Atualizada' : 'Nunca sincronizada'}</p>
                <p className="mt-1 text-sm text-blue-700/80">A integracao nunca expone credenciais no frontend.</p>
              </div>
              <div className="rounded-3xl border border-emerald-200/80 bg-emerald-50/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-700">Ultima sincronizacao</p>
                <p className="mt-2 text-base font-semibold text-emerald-950">
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
                  Encontre na URL: .../spreadsheets/d/<span className="font-semibold text-slate-700">ID_AQUI</span>/edit
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

            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-sm">
              Compartilhe a planilha com a credencial tecnica configurada do sistema para permitir escrita segura durante a sincronizacao.
            </div>

            {status ? <StatusBadge type={status.type} message={status.message} /> : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-4">
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
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Wifi size={14} />
                {testing ? 'Testando...' : 'Testar conexao'}
              </button>

              <button
                type="button"
                onClick={handleSync}
                disabled={anyLoading || !hasConfig}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(14,159,110,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_34px_rgba(14,159,110,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
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
