import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
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

export default function GoogleSheetsConfig({ empresaId, empresaNome, globalMode = false, onSaved }) {
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('Pagina1');
  const [lastSync, setLastSync] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState(null);
  const abortRef = useRef(false);

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
      } else {
        setSpreadsheetId('');
        setSheetName('Pagina1');
        setLastSync(null);
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

  const handleSave = async () => {
    if (!empresaId) return;
    setSaving(true);
    setStatus(null);
    try {
      const cleanId = extractSpreadsheetId(spreadsheetId);
      await saveGoogleSheetsConfig(empresaId, cleanId, sheetName);
      setSpreadsheetId(cleanId);
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
      const result = await testGoogleSheetsConnection(empresaId);
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
  const sheetsUrl = hasConfig
    ? `https://docs.google.com/spreadsheets/d/${extractSpreadsheetId(spreadsheetId)}/edit`
    : null;

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
