import { useCallback, useEffect, useState } from 'react';
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Database,
  FileSpreadsheet,
  Loader2,
  MessageCircleMore,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import GoogleSheetsConfig from '../components/GoogleSheetsConfig';
import {
  getCompanyIntegration,
  getCompanyIntegrationQrCode,
  getCompanyIntegrationStatus,
  saveCompanyIntegration,
  validateCompanyIntegration,
} from '../services/companyIntegrationService';

function IntegrationCard({ icon: Icon, title, description, tone = 'slate', badge = null }) {
  const palette = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    blue: 'bg-blue-50 text-blue-800 border-blue-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    gold: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <div className="card-hover rounded-[26px] border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={`inline-flex rounded-2xl border p-3 ${palette[tone] || palette.slate}`}>
          <Icon size={18} />
        </div>
        {badge ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
    </div>
  );
}

function StepCard({ step, title, description, example = '' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Etapa {step}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      {example ? (
        <p className="mt-2 rounded-xl bg-slate-950 px-3 py-2 font-mono text-xs text-white">{example}</p>
      ) : null}
    </div>
  );
}

function ZapiIntegrationCard({
  companyId,
  companyName,
  globalMode,
  onSaved,
  onToast,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [status, setStatus] = useState('nao_configurado');
  const [form, setForm] = useState({
    instance_id: '',
    token: '',
    client_token: '',
    phone_number: '',
    connected: false,
  });

  const statusMap = {
    nao_configurado: { label: 'Nao configurado', tone: 'text-slate-700 border-slate-200 bg-slate-50' },
    aguardando_qr: { label: 'Aguardando leitura do QR Code', tone: 'text-amber-700 border-amber-200 bg-amber-50' },
    validando: { label: 'Validando...', tone: 'text-blue-700 border-blue-200 bg-blue-50' },
    conectado: { label: 'Conectado', tone: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
    erro: { label: 'Erro na validacao', tone: 'text-red-700 border-red-200 bg-red-50' },
    salvo: { label: 'Salvo', tone: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
  };

  const getStatusIcon = (value) => {
    if (value === 'validando') return <Loader2 size={16} className="animate-spin" />;
    if (value === 'conectado' || value === 'salvo') return <CircleCheck size={16} />;
    if (value === 'erro') return <CircleX size={16} />;
    if (value === 'aguardando_qr') return <QrCode size={16} />;
    return <CircleDashed size={16} />;
  };

  const validateLocalFields = useCallback(() => {
    const instanceId = String(form.instance_id || '').trim();
    const token = String(form.token || '').trim();
    const clientToken = String(form.client_token || '').trim();

    if (instanceId.includes('@') || instanceId.length < 20) {
      throw new Error('Instance ID invalido. Use o codigo da instancia, nao o e-mail.');
    }

    if (token.length < 15) {
      throw new Error('Token invalido. Copie o token/API token exibido na tela da instancia.');
    }

    if (clientToken.length < 20) {
      throw new Error('Client Token invalido. Verifique o menu Seguranca, API ou Tokens da Z-API.');
    }
  }, [form.client_token, form.instance_id, form.token]);

  const loadIntegration = useCallback(async () => {
    if (!companyId || globalMode) return;
    setLoading(true);
    try {
      const integration = await getCompanyIntegration(companyId, 'zapi');
      setForm({
        instance_id: integration?.instance_id || '',
        token: integration?.token || '',
        client_token: integration?.client_token || '',
        phone_number: integration?.phone_number || '',
        connected: Boolean(integration?.connected),
      });
      setQrCodeDataUrl('');
      setStatus(integration?.connected ? 'salvo' : 'nao_configurado');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao carregar integracao WhatsApp.');
    } finally {
      setLoading(false);
    }
  }, [companyId, globalMode, onToast]);

  useEffect(() => {
    loadIntegration();
  }, [loadIntegration]);

  const setField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field !== 'phone_number' ? { connected: false } : {}),
    }));

    if (field !== 'phone_number') {
      setStatus('nao_configurado');
      setQrCodeDataUrl('');
    }
  };

  const handleValidate = async () => {
    if (!companyId) {
      onToast?.('erro', 'Selecione uma empresa para validar a integracao.');
      return;
    }

    try {
      validateLocalFields();
    } catch (error) {
      setStatus('erro');
      onToast?.('erro', error.message || 'Campos invalidos para a integracao.');
      return;
    }

    setStatus('validando');
    setValidating(true);
    try {
      const result = await validateCompanyIntegration(companyId, form);
      const connected = Boolean(result?.connected);
      setForm((current) => ({
        ...current,
        connected,
        phone_number: result?.phone_number || current.phone_number,
      }));
      setStatus(connected ? 'conectado' : 'aguardando_qr');
      onToast?.('sucesso', result?.message || 'Integracao Z-API validada com sucesso.');
    } catch (error) {
      setForm((current) => ({ ...current, connected: false }));
      setStatus('erro');
      onToast?.('erro', error.message || 'Falha ao validar a integracao Z-API.');
    } finally {
      setValidating(false);
    }
  };

  const handleGenerateQrCode = async () => {
    if (!companyId) {
      onToast?.('erro', 'Selecione uma empresa para gerar o QR Code.');
      return;
    }

    try {
      validateLocalFields();
    } catch (error) {
      setStatus('erro');
      onToast?.('erro', error.message || 'Campos invalidos para a integracao.');
      return;
    }

    setQrLoading(true);
    try {
      const result = await getCompanyIntegrationQrCode(companyId, form);
      const qrImage = String(result?.image_data_url || result?.image_url || '');
      if (!qrImage) {
        throw new Error('Nao foi possivel gerar o QR Code. Confira se a instancia, token e client token estao corretos.');
      }
      setQrCodeDataUrl(qrImage);
      setStatus('aguardando_qr');
      onToast?.('sucesso', result?.message || 'QR Code carregado com sucesso.');
    } catch (error) {
      setStatus('erro');
      onToast?.('erro', error.message || 'Nao foi possivel gerar o QR Code. Confira se a instancia, token e client token estao corretos.');
    } finally {
      setQrLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!companyId) {
      onToast?.('erro', 'Selecione uma empresa para consultar o status da integracao.');
      return;
    }

    try {
      validateLocalFields();
    } catch (error) {
      setStatus('erro');
      onToast?.('erro', error.message || 'Campos invalidos para a integracao.');
      return;
    }

    setStatus('validando');
    setStatusLoading(true);
    try {
      const result = await getCompanyIntegrationStatus(companyId, form);
      const connected = Boolean(result?.connected);
      setForm((current) => ({
        ...current,
        connected,
        phone_number: result?.phone_number || current.phone_number,
      }));
      setStatus(connected ? 'conectado' : 'aguardando_qr');
      onToast?.('sucesso', result?.message || 'Status da integracao atualizado.');
    } catch (error) {
      setStatus('erro');
      onToast?.('erro', error.message || 'Falha ao atualizar o status da integracao.');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleSave = async () => {
    if (!companyId) {
      onToast?.('erro', 'Selecione uma empresa para salvar a integracao.');
      return;
    }

    try {
      validateLocalFields();
    } catch (error) {
      setStatus('erro');
      onToast?.('erro', error.message || 'Campos invalidos para a integracao.');
      return;
    }

    setSaving(true);
    try {
      await saveCompanyIntegration(companyId, form, 'zapi');
      setStatus('salvo');
      onSaved?.();
      onToast?.('sucesso', 'Integracao Z-API salva com sucesso.');
    } catch (error) {
      setStatus('erro');
      onToast?.('erro', error.message || 'Falha ao salvar a integracao Z-API.');
    } finally {
      setSaving(false);
    }
  };

  if (globalMode || !companyId) {
    return (
      <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-soft">
        Selecione uma empresa especifica para configurar a integracao WhatsApp Business (Z-API).
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
          <Smartphone size={22} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">WhatsApp Business (Z-API)</h3>
          <p className="mt-1 text-sm text-slate-500">
            Conecte o WhatsApp da empresa <span className="font-semibold text-slate-900">{companyName || 'ativa'}</span> sem expor credenciais no frontend.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StepCard
            step="1"
            title="Acesse sua conta Z-API"
            description="Acesse o painel da Z-API e entre na instancia que sera usada para cobrancas."
          />
          <StepCard
            step="2"
            title="Copie o ID da instancia"
            description="O ID da instancia e um codigo grande, nao e seu e-mail."
            example="ABC123DEF456GHI789JKL012MNO345"
          />
          <StepCard
            step="3"
            title="Copie o Token da instancia"
            description="Copie o token/API token exibido na tela da instancia."
          />
          <StepCard
            step="4"
            title="Copie o Client Token"
            description="O Client Token geralmente fica em Seguranca, API ou Tokens da Z-API."
          />
          <StepCard
            step="5"
            title="Gerar QR Code"
            description="Depois de validar as credenciais, gere o QR Code e escaneie com o WhatsApp da empresa."
          />
          <StepCard
            step="6"
            title="Atualizar status e salvar"
            description="Clique em Atualizar status. Se aparecer Conectado, clique em Salvar integracao."
          />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        As credenciais ficam vinculadas apenas a esta empresa e sao usadas somente para envio das cobrancas pelo WhatsApp.
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setHelperOpen((current) => !current)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ShieldCheck size={14} />
          Como encontrar minhas credenciais?
        </button>
        {helperOpen ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              <span className="font-semibold text-slate-900">ID da instancia:</span> tela principal da instancia.
            </p>
            <p className="mt-2">
              <span className="font-semibold text-slate-900">Token:</span> tela principal/API da instancia.
            </p>
            <p className="mt-2">
              <span className="font-semibold text-slate-900">Client Token:</span> menu Seguranca/API Tokens.
            </p>
            <p className="mt-2 font-medium text-amber-700">Nunca compartilhar essas credenciais publicamente.</p>
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-700">Instance ID</span>
          <input
            type="text"
            value={form.instance_id}
            onChange={(event) => setField('instance_id', event.target.value)}
            disabled={loading || saving || validating || qrLoading || statusLoading}
            placeholder="Ex: ABC123DEF456GHI789JKL012MNO345"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-emerald-500 focus:ring-2 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-700">Token</span>
          <input
            type="password"
            value={form.token}
            onChange={(event) => setField('token', event.target.value)}
            disabled={loading || saving || validating || qrLoading || statusLoading}
            placeholder="Ex: SEU_TOKEN_DA_INSTANCIA"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-emerald-500 focus:ring-2 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-700">Client Token</span>
          <input
            type="password"
            value={form.client_token}
            onChange={(event) => setField('client_token', event.target.value)}
            disabled={loading || saving || validating || qrLoading || statusLoading}
            placeholder="Ex: SEU_CLIENT_TOKEN"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-emerald-500 focus:ring-2 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-700">Numero conectado</span>
          <input
            type="text"
            value={form.phone_number}
            onChange={(event) => setField('phone_number', event.target.value)}
            disabled
            placeholder="Preenchido apos conectar"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none disabled:opacity-60"
          />
        </label>
      </div>

      <div className={`mt-4 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${statusMap[status]?.tone || statusMap.nao_configurado.tone}`}>
        {getStatusIcon(status)}
        <span>
          Status da integracao: <span className="font-semibold">{statusMap[status]?.label || statusMap.nao_configurado.label}</span>
        </span>
      </div>

      {qrCodeDataUrl ? (
        <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <QrCode size={16} />
            QR Code da instancia
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Escaneie este QR Code com o WhatsApp da empresa. Depois clique em Atualizar status para confirmar a conexao.
          </p>
          <div className="mt-4 inline-flex rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
            <img src={qrCodeDataUrl} alt="QR Code da Z-API" className="h-64 w-64 rounded-2xl object-contain" />
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleValidate}
          disabled={loading || saving || validating || qrLoading || statusLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {validating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          Validar conexao Z-API
        </button>
        <button
          type="button"
          onClick={handleGenerateQrCode}
          disabled={loading || saving || validating || qrLoading || statusLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {qrLoading ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
          Gerar QR Code
        </button>
        <button
          type="button"
          onClick={handleRefreshStatus}
          disabled={loading || saving || validating || qrLoading || statusLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {statusLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Atualizar status
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || saving || validating || qrLoading || statusLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <MessageCircleMore size={14} />}
          Salvar integracao desta empresa
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Fluxo recomendado: 1. Preencha credenciais 2. Validar conexao 3. Gerar QR Code 4. Escanear com WhatsApp 5. Atualizar status 6. Salvar integracao.
      </div>
    </section>
  );
}

export default function IntegracoesScreen({
  companyId,
  companyName,
  globalMode,
  onGoogleSheetsSaved,
  onToast,
}) {
  return (
    <div className="space-y-6">
      <section className="hero-mesh overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-lifted lg:p-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              <ShieldCheck size={13} />
              Integracoes
            </div>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 lg:text-4xl">
              Conecte o BankExtract a rotinas externas sem expor credenciais no frontend.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 lg:text-base">
              Esta area concentra Google Sheets, WhatsApp por empresa, exportacao e a base Supabase para operar com
              company_id e auditoria centralizada.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Escopo</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {globalMode ? 'Modo global bloqueia configuracoes por empresa' : companyName || 'Sem empresa ativa'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Credenciais</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">Seguras no backend</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status comercial</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">Pronto para multiempresa</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <IntegrationCard
          icon={Database}
          title="Supabase"
          description="Base multiempresa preparada para company_id, batch_id e automacoes."
          tone="blue"
          badge="Core"
        />
        <IntegrationCard
          icon={FileSpreadsheet}
          title="Google Sheets"
          description="Exportacao e sincronizacao operacional por empresa ativa."
          tone="green"
          badge="Live"
        />
        <IntegrationCard
          icon={MessageCircleMore}
          title="WhatsApp"
          description="Cada empresa conecta sua propria instancia Z-API para envios reais."
          tone="gold"
          badge="Multiempresa"
        />
        <IntegrationCard
          icon={ShieldCheck}
          title="Exportacao Excel"
          description="Estrutura pronta para relatorios financeiros, historicos e auditoria."
          tone="slate"
          badge="Ready"
        />
      </section>

      <ZapiIntegrationCard
        companyId={companyId}
        companyName={companyName}
        globalMode={globalMode}
        onSaved={onGoogleSheetsSaved}
        onToast={onToast}
      />

      <GoogleSheetsConfig
        empresaId={companyId}
        empresaNome={companyName}
        globalMode={globalMode}
        onSaved={onGoogleSheetsSaved}
      />
    </div>
  );
}
