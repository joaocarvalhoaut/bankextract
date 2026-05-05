import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCcw, Sheet, UploadCloud } from 'lucide-react';
import DataTable from '../components/DataTable';
import {
  getBillingConfig,
  getDriveConfig,
  getBillingAutomationOverview,
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

const statusTone = {
  sucesso: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  sucesso_simulado: 'bg-blue-50 text-blue-700 ring-blue-200',
  simulado: 'bg-blue-50 text-blue-700 ring-blue-200',
  erro: 'bg-red-50 text-red-700 ring-red-200',
  ignorado: 'bg-amber-50 text-amber-700 ring-amber-200',
};

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
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${palette[tone]?.split(' text-')[0] || 'from-slate-400 to-slate-500'} opacity-80`} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${palette[tone]?.split(' ').pop() || 'text-slate-950'}`}>{value}</p>
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </article>
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
      onToast?.('erro', error.message || 'Falha ao carregar cobrança automática.');
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
      onToast?.('erro', error.message || 'Falha ao carregar a configuração do Google Drive.');
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
      onToast?.('erro', error.message || 'Falha ao carregar a configuração da régua.');
    }
  }, [globalMode, onToast, resolvedCompanyId]);

  useEffect(() => {
    loadBillingConfig();
  }, [loadBillingConfig]);

  const rows = overview?.rows || [];
  const summary = overview?.summary || {
    enviados_hoje: 0,
    preventivos: 0,
    vencimento: 0,
    atraso: 0,
    erros: 0,
    boletos_nao_encontrados: 0,
  };

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
      { key: 'data_hora', label: 'Hora', render: (row) => row.data_hora ? new Date(row.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-' },
      { key: 'erro', label: 'Erro', render: (row) => row.erro || '-' },
    ],
    []
  );

  const runAction = useCallback(
    async (action, fn, successMessage) => {
      if (!resolvedCompanyId || globalMode) {
        onToast?.('erro', 'Selecione uma empresa específica para operar a cobrança automática.');
        return;
      }
      if (!canManage) {
        onToast?.('erro', 'Seu perfil atual não pode operar automações.');
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
        onToast?.('erro', error.message || 'Falha ao executar ação.');
      } finally {
        setExecutingAction('');
      }
    },
    [canManage, globalMode, loadDriveConfig, loadOverview, onToast, resolvedCompanyId]
  );

  const handleSaveDriveFolder = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      onToast?.('erro', 'Selecione uma empresa específica para configurar a pasta do Google Drive.');
      return;
    }
    if (!canManage) {
      onToast?.('erro', 'Seu perfil atual não pode gerenciar automações.');
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
      onToast?.('erro', 'Selecione uma empresa específica para testar o Google Drive.');
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
      onToast?.(data?.status === 'sucesso' ? 'sucesso' : 'erro', data?.mensagem_erro || 'Conexão testada com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao testar a conexão com o Google Drive.');
    } finally {
      setDriveTesting(false);
    }
  }, [globalMode, onToast, resolvedCompanyId]);

  const handleSaveBillingConfig = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      onToast?.('erro', 'Selecione uma empresa específica para configurar a régua.');
      return;
    }
    if (!canManage) {
      onToast?.('erro', 'Seu perfil atual não pode gerenciar automações.');
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
      onToast?.('sucesso', data?.message || 'Configuração da régua salva com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao salvar a configuração da régua.');
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
      const data = await previewBillingTemplate(
        resolvedCompanyId,
        billingConfig.template_atraso || billingConfig.mensagem_template,
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
  }, [billingConfig.mensagem_template, billingConfig.template_atraso, companyName, globalMode, onToast, resolvedCompanyId]);

  if (globalMode || !resolvedCompanyId) {
    return (
      <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-soft">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5" size={18} />
          <div>
            <p className="font-semibold">Selecione uma empresa específica</p>
            <p className="mt-1 text-xs text-amber-700">
              A cobrança automática financeira opera por empresa para evitar qualquer vazamento entre carteiras.
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
            Régua financeira
          </div>
          <h3 className="mt-4 text-2xl font-semibold text-slate-950">Cobrança automática com boletos do Google Drive</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            Painel operacional da empresa <span className="font-semibold text-slate-900">{companyName}</span> com
            sincronização da planilha financeira, localização automática do boleto e envio auditável por WhatsApp.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runAction('run', runBillingAutomationNow, 'Régua executada com sucesso.')}
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
            onClick={() => runAction('drive', syncBillingDrive, 'Drive sincronizado com sucesso.')}
            disabled={Boolean(executingAction)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
          >
            {executingAction === 'drive' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            Sincronizar Drive
          </button>
          <button
            type="button"
            onClick={() => runAction('sheet', syncBillingSheet, 'Planilha sincronizada com sucesso.')}
            disabled={Boolean(executingAction)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
          >
            {executingAction === 'sheet' ? <Loader2 size={15} className="animate-spin" /> : <Sheet size={15} />}
            Sincronizar Planilha
          </button>
          <button
            type="button"
            onClick={handlePreviewTemplate}
            disabled={templatePreviewLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
          >
            {templatePreviewLoading ? <Loader2 size={15} className="animate-spin" /> : <Sheet size={15} />}
            Testar template
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton h-28 rounded-[24px]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Enviados hoje" value={summary.enviados_hoje} helper="Mensagens com anexo processadas hoje." tone="emerald" />
          <StatCard label="Preventivos" value={summary.preventivos} helper="Cobranças enviadas 1 dia antes do vencimento." tone="blue" />
          <StatCard label="Vencimento" value={summary.vencimento} helper="Cobranças enviadas no dia do vencimento." tone="slate" />
          <StatCard label="Atraso" value={summary.atraso} helper="Régua D+1, D+3, D+5, D+10, D+15 e D+30." tone="amber" />
          <StatCard label="Erros" value={summary.erros} helper="Falhas de envio ou integração registradas em log." tone="red" />
          <StatCard label="Boletos não encontrados" value={summary.boletos_nao_encontrados} helper="Títulos bloqueados até o PDF ser localizado no Drive." tone="amber" />
        </div>
      )}

      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Últimas execuções</p>
        <p className="mt-1 text-xs text-slate-500">
          O log abaixo mostra cliente, tipo de cobrança, telefone, status final e o motivo do erro quando existir.
        </p>
      </div>

      <section className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 shadow-soft">
        <div className="mb-5">
          <p className="text-sm font-semibold text-slate-950">Configuracao da regua</p>
          <p className="mt-1 text-xs text-slate-500">
            Ajuste preventiva, vencimento, atraso, limite por titulo e o comportamento da simulacao.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ativar cobrança automática</span>
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
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Horário de execução</span>
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
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Enviar no vencimento</span>
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

        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Dias de atraso para cobranca</span>
          <div className="flex flex-wrap gap-2">
            {[1, 3, 5, 10, 15, 30].map((day) => {
              const active = Array.isArray(billingConfig.regua_atraso) && billingConfig.regua_atraso.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDelayRule(day)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                    active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  D+{day}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Template preventiva</span>
            <textarea
              rows={8}
              value={billingConfig.template_preventiva}
              onChange={(event) => setBillingConfig((current) => ({ ...current, template_preventiva: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
            />
          </label>
          <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Template vencimento</span>
            <textarea
              rows={8}
              value={billingConfig.template_vencimento}
              onChange={(event) => setBillingConfig((current) => ({ ...current, template_vencimento: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
            />
          </label>
          <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Template atraso</span>
            <textarea
              rows={8}
              value={billingConfig.template_atraso}
              onChange={(event) => setBillingConfig((current) => ({ ...current, template_atraso: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
            />
          </label>
        </div>

        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-500 shadow-sm">
          Variaveis disponiveis: {'{nome}'}, {'{numero_boleto}'}, {'{vencimento}'}, {'{valor}'}, {'{dias_atraso}'}, {'{empresa}'}, {'{telefone}'}.
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSaveBillingConfig}
            disabled={billingSaving || !canManage}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {billingSaving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            Salvar configuração da régua
          </button>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Google Drive dos boletos</p>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">
              1. Crie ou escolha uma pasta no Google Drive com os boletos. 2. Compartilhe essa pasta com o e-mail da Service Account do sistema.
              3. Cole aqui o ID da pasta. 4. Clique em Salvar e Testar conexão.
            </p>
          </div>
          <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
            driveConfig.status === 'sucesso'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : driveConfig.status === 'erro'
                ? 'bg-red-50 text-red-700 ring-red-200'
                : 'bg-slate-100 text-slate-600 ring-slate-200'
          }`}>
            {driveConfig.status === 'sucesso' ? 'Conectado' : driveConfig.status === 'erro' ? 'Com erro' : 'Não testado'}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">E-mail da Service Account</span>
            <input
              type="text"
              value={driveConfig.service_account_email}
              readOnly
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ID da pasta do Google Drive</span>
            <input
              type="text"
              value={driveFolderInput}
              onChange={(event) => setDriveFolderInput(event.target.value)}
              placeholder="Cole aqui o ID da pasta compartilhada"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
            />
          </label>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nome da pasta</p>
            <p className="mt-2 text-sm font-medium text-slate-900">{driveConfig.folder_name || 'Ainda não identificado'}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status da conexão</p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {driveConfig.status === 'sucesso'
                ? `Conexão válida com ${driveConfig.quantidade_arquivos_pdf} PDF(s).`
                : driveConfig.mensagem_erro || 'Configure a pasta e teste a conexão.'}
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
            Testar conexão
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
      </section>

      <DataTable
        columns={columns}
        rows={rows}
        emptyTitle="Nenhuma execução registrada."
        emptyDescription="Assim que a régua rodar ou as sincronizações forem disparadas, os eventos aparecerão aqui."
      />
    </section>
  );
}
