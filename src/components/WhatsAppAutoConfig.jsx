import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  MessageSquare,
  Save,
  Sparkles,
} from 'lucide-react';
import {
  defaultWhatsAppAutoConfig,
  getWhatsAppAutoConfig,
  runScheduledWhatsAppChargesTest,
  saveWhatsAppAutoConfig,
} from '../services/whatsappAutoService';

function StatusNotice({ status }) {
  if (!status) return null;
  const palette = {
    success: 'notice-success',
    error: 'notice-danger',
    info: 'notice-info',
  };
  const Icon = status.type === 'success' ? CheckCircle2 : status.type === 'error' ? AlertCircle : Sparkles;
  return (
    <div className={`flex items-start gap-2 rounded-2xl border px-3.5 py-3 text-sm shadow-sm ${palette[status.type] || palette.info}`}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span>{status.message}</span>
    </div>
  );
}

function DebugItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-50">{value}</p>
    </div>
  );
}

function SimulationDebug({ summary }) {
  const rawDebug = Array.isArray(summary?.debug) ? summary.debug[0] : summary?.debug;
  const fallbackDebug = Array.isArray(summary?.results) && summary.results.length > 0 ? summary.results[0]?.debug : null;
  const debug = rawDebug || fallbackDebug;

  if (!debug) return null;

  const descartados = debug.descartados || {};
  const exemplos = Array.isArray(debug.exemplos_descartados) ? debug.exemplos_descartados : [];

  return (
    <div className="surface-panel mt-4 space-y-4 rounded-[28px] p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-slate-50">Debug da simulacao</p>
        <p className="mt-1 text-xs text-slate-500">Visibilidade completa para entender por que cada titulo entrou ou ficou fora da regra.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DebugItem label="Empresa ID recebido" value={debug.empresa_id_recebido || '-'} />
        <DebugItem label="Coluna usada" value={debug.coluna_empresa_usada || '-'} />
        <DebugItem label="Registros sem filtro" value={debug.total_registros_sem_filtro ?? 0} />
        <DebugItem label="Registros da query" value={debug.total_registros_buscados ?? 0} />
        <DebugItem label="Elegiveis" value={debug.elegiveis ?? 0} />
        <DebugItem label="Sem telefone" value={descartados.sem_telefone ?? 0} />
        <DebugItem label="Liquidado" value={descartados.liquidado ?? 0} />
        <DebugItem label="Nao vencido" value={descartados.nao_vencido ?? 0} />
        <DebugItem label="Intervalo" value={descartados.intervalo ?? 0} />
        <DebugItem label="Limite" value={descartados.limite ?? 0} />
        <DebugItem label="Parse invalido" value={descartados.parse_invalido ?? 0} />
        <DebugItem label="Empresa diferente" value={descartados.empresa_diferente ?? 0} />
      </div>

      {Array.isArray(debug.amostra_registros_sem_filtro) && debug.amostra_registros_sem_filtro.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Amostra de registros</p>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {debug.amostra_registros_sem_filtro.map((item) => (
              <div key={item.id} className="surface-panel-muted rounded-2xl px-4 py-3 text-xs text-slate-300">
                <p className="font-semibold text-slate-50">{item.nome || 'Registro sem nome'}</p>
                <p className="mt-1">ID: {item.id}</p>
                <p>company_id: {item.company_id || '-'} - empresa_id: {item.empresa_id || '-'}</p>
                <p>Vencimento: {item.data_vencimento || '-'} - Telefone: {item.telefone || '-'} - Status: {item.status || '-'}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {exemplos.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Exemplos descartados</p>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {exemplos.map((item) => (
              <div key={`${item.registro_id}-${item.motivo}`} className="surface-panel-muted rounded-2xl px-4 py-3 text-xs text-slate-300">
                <p className="font-semibold text-slate-50">{item.nome || 'Registro sem nome'} - {item.motivo}</p>
                <p className="mt-1">ID: {item.registro_id} - Status: {item.status || '-'} - Telefone: {item.telefone || '-'}</p>
                <p>Vencimento: {item.data_vencimento || '-'} - Empresa: {item.company_id || '-'}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FieldLabel({ children }) {
  return <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{children}</span>;
}

export default function WhatsAppAutoConfig({ empresaId, empresaNome, globalMode = false }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(defaultWhatsAppAutoConfig);
  const [lastTestSummary, setLastTestSummary] = useState(null);

  const blockedMessage = useMemo(() => {
    if (globalMode) {
      return 'Selecione uma empresa especifica para configurar cobranca automatica por WhatsApp.';
    }
    if (!empresaId) {
      return 'Selecione uma empresa para configurar cobranca automatica por WhatsApp.';
    }
    return '';
  }, [empresaId, globalMode]);

  const updateField = useCallback((field, value) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const loadConfig = useCallback(async () => {
    if (!empresaId || globalMode) {
      setConfig(defaultWhatsAppAutoConfig);
      setLastTestSummary(null);
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const nextConfig = await getWhatsAppAutoConfig(empresaId);
      setConfig(nextConfig);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.message || 'Falha ao carregar configuracao de cobranca automatica.',
      });
    } finally {
      setLoading(false);
    }
  }, [empresaId, globalMode]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    if (!empresaId || globalMode) return;

    setSaving(true);
    setStatus(null);
    setLastTestSummary(null);

    try {
      const saved = await saveWhatsAppAutoConfig(empresaId, config);
      setConfig(saved);
      window.dispatchEvent(new CustomEvent('bankextract:dashboard-refresh'));
      setStatus({
        type: 'success',
        message: saved.ativo
          ? 'Configuracao salva. O envio automatico permanece sob suas regras definidas.'
          : 'Configuracao salva com cobranca automatica inativa.',
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.message || 'Falha ao salvar configuracao de cobranca automatica.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!empresaId || globalMode) return;

    setTesting(true);
    setStatus(null);

    try {
      const result = await runScheduledWhatsAppChargesTest(empresaId);
      setLastTestSummary(result);
      setStatus({
        type: 'info',
        message: result.message || 'Simulacao executada com sucesso.',
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.message || 'Falha ao simular cobrancas automaticas.',
      });
    } finally {
      setTesting(false);
    }
  };

  if (blockedMessage) {
    return (
      <div className="surface-card rounded-[30px] p-5 shadow-soft">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
            <MessageSquare size={18} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-50">Cobranca automatica WhatsApp</h3>
            <p className="text-sm text-slate-500">Esse painel precisa de uma empresa especifica.</p>
          </div>
        </div>
        <div className="notice-warning rounded-2xl px-4 py-3 text-sm shadow-sm">
          {blockedMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card overflow-hidden rounded-[32px] shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="hero-mesh border-b border-slate-700/50 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300 shadow-sm">
              <MessageSquare size={18} />
            </div>
            <div>
              <div className="notice-success inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]">
                <FlaskConical size={12} />
                Modo teste
              </div>
              <h3 className="mt-3 text-xl font-semibold text-slate-50">Cobranca automatica WhatsApp</h3>
              <p className="mt-1 text-sm text-slate-300">{empresaNome}</p>
            </div>
          </div>

          <span
            className={`inline-flex self-start rounded-full border px-3 py-2 text-xs font-semibold shadow-sm ${
              config.ativo
                ? 'notice-success'
                : 'surface-panel-muted text-slate-300'
            }`}
          >
            {config.ativo ? 'Automacao ativa' : 'Automacao desativada'}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="skeleton h-24 rounded-3xl" />
            <div className="skeleton h-24 rounded-3xl" />
            <div className="skeleton h-24 rounded-3xl" />
            <div className="skeleton h-24 rounded-3xl" />
          </div>
        ) : (
          <>
            <div className="notice-info rounded-2xl px-4 py-3 text-sm shadow-sm">
              A cobranca automatica nunca fica ativa por padrao. Revise a cadencia e o template antes de ligar o envio.
            </div>

            <label className="surface-panel flex items-center justify-between gap-4 rounded-3xl px-4 py-4 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-slate-50">Ativar cobranca automatica</p>
                <p className="text-xs text-slate-500">O cron considera as regras somente quando esta chave estiver ligada.</p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(config.ativo)}
                onChange={(event) => updateField('ativo', event.target.checked)}
                className="h-4 w-4 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <FieldLabel>Comecar a cobrar apos X dias vencido</FieldLabel>
                <input
                  type="number"
                  min="0"
                  value={config.cobrar_apos_dias_vencido}
                  onChange={(event) => updateField('cobrar_apos_dias_vencido', event.target.value)}
                  className="input-premium w-full"
                />
              </label>

              <label className="block">
                <FieldLabel>Repetir cobranca a cada X dias</FieldLabel>
                <input
                  type="number"
                  min="1"
                  value={config.intervalo_dias}
                  onChange={(event) => updateField('intervalo_dias', event.target.value)}
                  className="input-premium w-full"
                />
              </label>

              <label className="block">
                <FieldLabel>Horario do envio</FieldLabel>
                <input
                  type="time"
                  value={config.hora_envio}
                  onChange={(event) => updateField('hora_envio', event.target.value)}
                  className="input-premium w-full"
                />
              </label>

              <label className="block">
                <FieldLabel>Canal de envio</FieldLabel>
                <select
                  value={config.canal_envio || 'WhatsApp'}
                  onChange={(event) => updateField('canal_envio', event.target.value)}
                  className="input-premium w-full"
                >
                  <option value="WhatsApp">WhatsApp</option>
                </select>
              </label>

              <label className="block">
                <FieldLabel>Limite maximo de cobrancas por titulo</FieldLabel>
                <input
                  type="number"
                  min="1"
                  value={config.limite_cobrancas_por_titulo}
                  onChange={(event) => updateField('limite_cobrancas_por_titulo', event.target.value)}
                  className="input-premium w-full"
                />
              </label>
            </div>

            <label className="surface-panel flex items-center justify-between gap-4 rounded-3xl px-4 py-4 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-slate-50">Aplicar aviso de protesto após 5 dias</p>
                <p className="text-xs text-slate-500">Inclui o aviso comercial no texto padrão da cobrança.</p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(config.protesto_apos_5_dias)}
                onChange={(event) => updateField('protesto_apos_5_dias', event.target.checked)}
                className="h-4 w-4 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            <label className="block">
              <FieldLabel>Modelo da mensagem</FieldLabel>
              <textarea
                rows={10}
                value={config.mensagem_template || ''}
                onChange={(event) => updateField('mensagem_template', event.target.value)}
                className="input-premium min-h-[220px] w-full"
              />
              <p className="mt-2 text-xs text-slate-500">
                Variáveis: {'{{cliente}}'}, {'{{documento}}'}, {'{{vencimento}}'}, {'{{valor}}'}, {'{{telefone}}'}, {'{{dias_atraso}}'}, {'{{empresa}}'}.
              </p>
            </label>

            {status ? <StatusNotice status={status} /> : null}

            {lastTestSummary ? (
              <div className="surface-panel-muted rounded-[28px] px-4 py-4 text-sm text-slate-200 shadow-sm">
                <p className="font-semibold text-slate-50">Resultado da simulacao</p>
                <p className="mt-1">
                  Empresas processadas: {lastTestSummary.processed_companies ?? 0} - Enviaria: {lastTestSummary.sent ?? 0} - Ignorados: {lastTestSummary.skipped ?? 0} - Erros: {lastTestSummary.errors ?? 0}
                </p>
                {Array.isArray(lastTestSummary.results) && lastTestSummary.results.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Ultima simulacao considerou {lastTestSummary.results[0]?.eligible_titles ?? 0} titulo(s) elegivel(is) para esta empresa.
                  </p>
                ) : null}
                <SimulationDebug summary={lastTestSummary} />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-700/50 pt-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || testing}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Salvando...' : 'Salvar configuracao'}
              </button>

              <button
                type="button"
                onClick={handleTest}
                disabled={saving || testing}
                className="btn-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                {testing ? 'Simulando...' : 'Testar regras / Simular elegiveis'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
