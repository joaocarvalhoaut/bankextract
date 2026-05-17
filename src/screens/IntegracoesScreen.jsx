import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleX,
  HelpCircle,
  Loader2,
  PencilLine,
  MessageCircleMore,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import GoogleSheetsConfig from '../components/GoogleSheetsConfig';
import DriveBoletoConfig from '../components/DriveBoletoConfig';
import { getDriveBoletosConfig } from '../services/googleDriveService';
import { normalizeUserRole } from '../security/permissions';
import {
  getCompanyIntegration,
  getCompanyIntegrationQrCode,
  getCompanyIntegrationStatus,
  saveCompanyIntegration,
  validateCompanyIntegration,
} from '../services/companyIntegrationService';

function formatRelativeTimeLabel(value, emptyLabel = 'Nunca validado') {
  if (!value) return emptyLabel;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return 'Agora mesmo';
  if (diffMinutes < 60) return `ha ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `ha ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  return `ha ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
}

function maskSensitiveValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Nao informado';
  if (raw.length <= 8) return '••••••••';
  return `${raw.slice(0, 4)}••••••${raw.slice(-4)}`;
}

function CredentialSummaryItem({ label, value, sensitive = false, status }) {
  const statusTone =
    status === 'Salvo'
      ? 'border-blue-700/40 bg-blue-900/20 text-blue-700'
      : status === 'Pendente'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-700 bg-slate-800/60 text-slate-300';

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-slate-50">
          {sensitive ? maskSensitiveValue(value) : value || 'Nao informado'}
        </p>
      </div>
      <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusTone}`}>
        {status}
      </span>
    </div>
  );
}

function ZapiIntegrationCard({
  companyId,
  companyName,
  globalMode,
  canManage,
  onSaved,
  onToast,
  onStatusChange,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [editingCredentials, setEditingCredentials] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [qrExpired, setQrExpired] = useState(false);
  const [qrError, setQrError] = useState('');
  // qrPanelEverOpened is a latch: once true it NEVER goes false automatically.
  // Only explicit actions clear it: "Fechar QR" button, successful connection,
  // company change, or credential edit.  This guarantees the card survives any
  // background state reset that we may have missed.
  const [qrPanelEverOpened, setQrPanelEverOpened] = useState(false);
  // qrDebug captures the raw API response shape for the debug panel.
  const [qrDebug, setQrDebug] = useState(null);
  const pollingRef = useRef(null);
  const expiryRef = useRef(null);
  // Stable ref so callbacks that need onToast never cause loadIntegration / startPolling to
  // be recreated on every render (which would re-run the useEffect and clear qrError).
  const onToastRef = useRef(onToast);
  useEffect(() => { onToastRef.current = onToast; });
  const [integrationMessage, setIntegrationMessage] = useState('');
  const [status, setStatus] = useState('nao_configurado');
  const [lastValidatedAt, setLastValidatedAt] = useState('');
  const [form, setForm] = useState({
    instance_id: '',
    token: '',
    client_token: '',
    phone_number: '',
    connected: false,
  });

  const statusMap = {
    nao_configurado: { label: 'Nao configurado', tone: 'text-slate-200 border-slate-700 bg-slate-800/40' },
    aguardando_qr: { label: 'Aguardando leitura do QR Code', tone: 'text-amber-700 border-amber-200 bg-amber-50' },
    validando: { label: 'Validando...', tone: 'text-blue-700 border-blue-700/40 bg-blue-900/20' },
    conectado: { label: 'Conectado', tone: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
    erro: { label: 'Erro na validacao', tone: 'text-red-700 border-red-200 bg-red-50' },
    salvo: { label: 'Salvo', tone: 'text-blue-700 border-blue-700/40 bg-blue-900/20' },
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

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (expiryRef.current) {
      clearTimeout(expiryRef.current);
      expiryRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    setQrExpired(false);

    pollingRef.current = setInterval(async () => {
      try {
        const result = await getCompanyIntegrationStatus(companyId, form);
        const connected = Boolean(result?.connected);
        if (connected) {
          stopPolling();
          const phoneNumber = String(result?.phone_number || '').trim();
          setQrCodeDataUrl('');
          setQrExpired(false);
          setQrPanelEverOpened(false);
          setQrDebug(null);
          setForm((current) => ({
            ...current,
            connected: true,
            phone_number: phoneNumber || current.phone_number,
          }));
          setStatus('conectado');
          setIntegrationMessage(String(result?.message || 'WhatsApp conectado com sucesso!'));
          setLastValidatedAt(new Date().toISOString());
          onToastRef.current?.('sucesso', result?.message || 'WhatsApp conectado com sucesso!');
          await saveCompanyIntegration(
            companyId,
            { ...form, connected: true, phone_number: phoneNumber },
            'zapi',
          ).catch(() => {});
        }
      } catch {
        // Silent — don't disrupt UX on transient poll error
      }
    }, 5000);

    // Z-API QR codes expire in ~30 s — mark expired and stop polling
    expiryRef.current = setTimeout(() => {
      setQrExpired(true);
      stopPolling();
    }, 40000);
  }, [companyId, form, stopPolling]);  // onToast intentionally omitted — use stable onToastRef

  // Clean up intervals/timeouts on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

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
      // ─── loadIntegration NEVER touches QR visual state (qrError / qrCodeDataUrl /
      //     qrExpired). Those are reset by the dedicated companyId-change effect below
      //     so that an unexpected re-run of loadIntegration cannot wipe a visible
      //     QR/error card mid-attempt.
      setIntegrationMessage('');
      setStatus(integration?.connected ? 'salvo' : 'nao_configurado');
      setLastValidatedAt(integration?.updated_at || integration?.created_at || '');
      setEditingCredentials(!integration);
    } catch (error) {
      onToastRef.current?.('erro', error.message || 'Falha ao carregar integracao WhatsApp.');
    } finally {
      setLoading(false);
    }
  }, [companyId, globalMode]);  // stopPolling / onToast intentionally omitted — stable refs

  // Reset ALL QR visual state ONLY when the active company changes.
  // Keeping this separate from loadIntegration guarantees that no unexpected
  // re-execution of loadIntegration can wipe qrError/qrCodeDataUrl mid-attempt.
  useEffect(() => {
    stopPolling();
    setQrCodeDataUrl('');
    setQrExpired(false);
    setQrError('');
    setQrPanelEverOpened(false);
    setQrDebug(null);
  }, [companyId, stopPolling]);

  useEffect(() => {
    loadIntegration();
  }, [loadIntegration]);

  useEffect(() => {
    onStatusChange?.(status === 'conectado' || status === 'salvo');
  }, [onStatusChange, status]);

  const setField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field !== 'phone_number' ? { connected: false } : {}),
    }));

    if (field !== 'phone_number') {
      setStatus('nao_configurado');
      stopPolling();
      setQrCodeDataUrl('');
      setQrExpired(false);
      setQrError('');
      setQrPanelEverOpened(false);
      setQrDebug(null);
      setIntegrationMessage('');
    }
  };

  const handleValidate = async () => {
    if (!companyId) {
      onToastRef.current?.('erro', 'Selecione uma empresa para validar a integracao.');
      return;
    }

    try {
      validateLocalFields();
    } catch (error) {
      setStatus('erro');
      onToastRef.current?.('erro', error.message || 'Campos invalidos para a integracao.');
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
      setIntegrationMessage(String(result?.message || ''));
      setLastValidatedAt(new Date().toISOString());
      onToastRef.current?.('sucesso', result?.message || 'Integracao Z-API validada com sucesso.');
    } catch (error) {
      setForm((current) => ({ ...current, connected: false }));
      setStatus('erro');
      setIntegrationMessage('');
      onToastRef.current?.('erro', error.message || 'Falha ao validar a integracao Z-API.');
    } finally {
      setValidating(false);
    }
  };

  const handleGenerateQrCode = async () => {
    const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

    if (!companyId) {
      onToastRef.current?.('erro', 'Selecione uma empresa para gerar o QR Code.');
      return;
    }

    try {
      validateLocalFields();
    } catch (error) {
      setStatus('erro');
      onToastRef.current?.('erro', error.message || 'Campos invalidos para a integracao.');
      return;
    }

    // Guard: if local state already shows connected, the Z-API /qr-code/image
    // endpoint will hang indefinitely — skip the call and inform the user.
    if (status === 'conectado') {
      setQrPanelEverOpened(false);
      setQrDebug({ lastAction: 'Bloqueado: WhatsApp ja esta conectado' });
      onToastRef.current?.('sucesso', 'WhatsApp ja esta conectado. Nao e necessario gerar QR Code.');
      return;
    }

    // Stop any previous polling before starting a new attempt
    stopPolling();

    // Open the panel latch — once true, the card stays visible regardless of
    // which background state setter clears qrError / qrCodeDataUrl.
    setQrPanelEverOpened(true);
    setQrLoading(true);
    setQrError('');
    setQrCodeDataUrl('');
    setQrExpired(false);
    setQrDebug({ lastAction: 'Aguardando resposta da API...' });

    if (isDev) console.log('[QR] generateQr:start', { companyId });

    // Client-side safety net: if invoke never resolves, surface a clear error after 35 s
    const timeoutId = { ref: null };
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId.ref = setTimeout(
        () => reject(new Error('QR Code nao retornou em tempo habil. Verifique a instancia e tente novamente.')),
        35000,
      );
    });

    try {
      const result = await Promise.race([
        getCompanyIntegrationQrCode(companyId, form),
        timeoutPromise,
      ]);
      clearTimeout(timeoutId.ref);

      const responseKeys = result ? Object.keys(result) : [];
      if (isDev) console.log('[QR] generateQr:response', {
        ok: result?.ok,
        connected: result?.connected,
        status: result?.status,
        hasQrCode: Boolean(result?.qrCode || result?.image_data_url),
        keys: responseKeys,
      });

      setQrDebug({ lastAction: 'Resposta recebida', responseKeys });

      const connected = Boolean(result?.connected) || String(result?.status || '').toLowerCase() === 'connected';
      if (connected) {
        setQrCodeDataUrl('');
        setQrError('');
        setQrPanelEverOpened(false); // connection success → close panel
        setQrDebug(null);
        setForm((current) => ({
          ...current,
          connected: true,
          phone_number: result?.phone_number || current.phone_number,
        }));
        setStatus('conectado');
        setIntegrationMessage(String(result?.message || 'WhatsApp ja conectado'));
        setLastValidatedAt(new Date().toISOString());
        onToastRef.current?.('sucesso', result?.message || 'WhatsApp ja conectado');
        return;
      }

      // Normalise: try every field name variant Z-API is known to use
      const qrImage = String(
        result?.qrCode ||
        result?.qrcode ||
        result?.qr_code ||
        result?.image_data_url ||
        result?.image_url ||
        result?.base64 ||
        result?.value ||
        ''
      );

      if (!qrImage) {
        if (isDev) console.warn('[QR] generateQr:no-image — full result:', result);
        setQrDebug({ lastAction: 'Resposta sem QR Code', responseKeys });
        throw new Error('Nao foi possivel gerar o QR Code. Confira se a instancia, token e client token estao corretos.');
      }

      setQrDebug({ lastAction: 'QR Code recebido', responseKeys });
      setQrCodeDataUrl(qrImage);
      setQrError('');
      setQrExpired(false);
      setStatus('aguardando_qr');
      setIntegrationMessage(String(result?.message || 'QR Code carregado com sucesso.'));
      setLastValidatedAt(new Date().toISOString());
      onToastRef.current?.('sucesso', result?.message || 'QR Code carregado com sucesso.');
      startPolling();
    } catch (error) {
      clearTimeout(timeoutId.ref);
      const msg = String(error?.message || 'Nao foi possivel gerar o QR Code. Confira se a instancia, token e client token estao corretos.');
      if (isDev) console.error('[QR] generateQr:error', { msg, error });
      setStatus('erro');
      setQrError(msg);
      setQrDebug((prev) => ({ ...(prev || {}), lastAction: 'Erro', rawError: msg }));
      setIntegrationMessage('');
      onToastRef.current?.('erro', msg);
    } finally {
      setQrLoading(false);
      if (isDev) console.log('[QR] generateQr:finally — qrLoading=false');
    }
  };

  const handleRefreshStatus = async () => {
    if (!companyId) {
      onToastRef.current?.('erro', 'Selecione uma empresa para consultar o status da integracao.');
      return;
    }

    try {
      validateLocalFields();
    } catch (error) {
      setStatus('erro');
      onToastRef.current?.('erro', error.message || 'Campos invalidos para a integracao.');
      return;
    }

    setStatus('validando');
    setStatusLoading(true);
    try {
      const result = await getCompanyIntegrationStatus(companyId, form);
      const connected = Boolean(result?.connected);
      const phoneNumber = String(result?.phone_number || '').trim();
      setForm((current) => ({
        ...current,
        connected,
        phone_number: phoneNumber || current.phone_number,
      }));
      setStatus(connected ? 'conectado' : 'aguardando_qr');
      setIntegrationMessage(String(result?.message || ''));
      setLastValidatedAt(new Date().toISOString());
      // Auto-persist phone_number when live check returns it
      if (connected && phoneNumber) {
        await saveCompanyIntegration(companyId, { ...form, connected, phone_number: phoneNumber }, 'zapi').catch(() => {});
      } else if (!connected) {
        await saveCompanyIntegration(companyId, { ...form, connected: false }, 'zapi').catch(() => {});
      }
      onToastRef.current?.('sucesso', result?.message || 'Status da integracao atualizado.');
    } catch (error) {
      setStatus('erro');
      setIntegrationMessage('');
      onToastRef.current?.('erro', error.message || 'Falha ao atualizar o status da integracao.');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleSave = async () => {
    if (!companyId) {
      onToastRef.current?.('erro', 'Selecione uma empresa para salvar a integracao.');
      return;
    }

    try {
      validateLocalFields();
    } catch (error) {
      setStatus('erro');
      onToastRef.current?.('erro', error.message || 'Campos invalidos para a integracao.');
      return;
    }

    setSaving(true);
    try {
      await saveCompanyIntegration(companyId, form, 'zapi');
      setStatus('salvo');
      setIntegrationMessage('Integracao salva com sucesso.');
      setLastValidatedAt(new Date().toISOString());
      setEditingCredentials(false);
      onSaved?.();
      onToastRef.current?.('sucesso', 'Integracao Z-API salva com sucesso.');
    } catch (error) {
      setStatus('erro');
      setIntegrationMessage('');
      onToastRef.current?.('erro', error.message || 'Falha ao salvar a integracao Z-API.');
    } finally {
      setSaving(false);
    }
  };

  if (globalMode || !companyId) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-soft">
        Selecione uma empresa especifica para configurar a integracao WhatsApp Business (Z-API).
      </section>
    );
  }

  return (
    <section className="text-crisp group rounded-2xl border border-slate-700/90 bg-slate-900/60 p-7 shadow-[0_22px_70px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_90px_rgba(15,23,42,0.1)] lg:p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-900/20 text-blue-700 shadow-sm ring-1 ring-blue-100">
          <Smartphone size={22} />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold tracking-tight text-slate-50">WhatsApp Business (Z-API)</h3>
            <span className="badge-brand inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
              Canal oficial
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
            Conecte o WhatsApp da empresa <span className="font-semibold text-slate-50">{companyName || 'ativa'}</span> sem expor credenciais no frontend.
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/50 shadow-inner">
        <button
          type="button"
          onClick={() => setHelperOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-900/60"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900/60 text-slate-200 shadow-sm ring-1 ring-slate-700">
              <HelpCircle size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-50">Como conectar minha Z-API</p>
              <p className="mt-1 text-xs text-slate-400">Passo a passo guiado para localizar credenciais e ativar o QR Code.</p>
            </div>
          </div>
          <ChevronDown
            size={18}
            className={`shrink-0 text-slate-500 transition-transform duration-300 ${helperOpen ? 'rotate-180' : ''}`}
          />
        </button>

        <div
          className={`grid transition-all duration-300 ease-out ${
            helperOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-t border-slate-700 px-5 py-5">
              <div className="mx-auto max-w-2xl space-y-3">
                {[
                  {
                    step: '1',
                    title: 'Acesse sua conta Z-API',
                    description: 'Entre no painel da instancia que sera usada pela operacao de cobrancas.',
                  },
                  {
                    step: '2',
                    title: 'Copie o ID da instancia',
                    description: 'Use o codigo da instancia. Nao utilize e-mail neste campo.',
                    example: 'ABC123DEF456GHI789JKL012MNO345',
                  },
                  {
                    step: '3',
                    title: 'Copie o Token da instancia',
                    description: 'Copie o token/API token exibido na tela principal da instancia.',
                  },
                  {
                    step: '4',
                    title: 'Copie o Client Token',
                    description: 'Localize o Client Token no menu de seguranca, API ou tokens da Z-API.',
                  },
                  {
                    step: '5',
                    title: 'Gere o QR Code e conecte o WhatsApp',
                    description: 'Depois da validacao, gere o QR Code e escaneie com o WhatsApp da empresa.',
                  },
                  {
                    step: '6',
                    title: 'Atualize o status e salve a integracao',
                    description: 'Quando aparecer Conectado, finalize clicando em Salvar integracao.',
                  },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-4 shadow-sm">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-900/20 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                      {item.step}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-50">{item.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-300">{item.description}</p>
                      {item.example ? (
                        <p className="mt-2 inline-flex rounded-xl bg-slate-950 px-3 py-2 font-mono text-xs text-white">{item.example}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-blue-700/40 bg-blue-900/20 px-4 py-3 text-sm text-blue-800">
        As credenciais ficam vinculadas apenas a esta empresa e sao usadas somente para envio das cobrancas pelo WhatsApp.
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-50">Credenciais e status da integracao</p>
            <p className="mt-1 text-sm text-slate-400">Visual executivo com status salvo, pendente ou nao informado.</p>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => setEditingCredentials((current) => !current)}
              className="control-surface inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-sm transition"
            >
              <PencilLine size={14} />
              {editingCredentials ? 'Fechar edicao' : 'Editar credenciais'}
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CredentialSummaryItem
            label="Instance ID"
            value={form.instance_id}
            sensitive
            status={form.instance_id ? 'Salvo' : 'Nao informado'}
          />
          <CredentialSummaryItem
            label="Token"
            value={form.token}
            sensitive
            status={form.token ? 'Salvo' : 'Nao informado'}
          />
          <CredentialSummaryItem
            label="Client Token"
            value={form.client_token}
            sensitive
            status={form.client_token ? 'Salvo' : 'Nao informado'}
          />
          <CredentialSummaryItem
            label="Numero conectado"
            value={form.phone_number || 'Nao conectado'}
            status={form.phone_number ? 'Salvo' : 'Pendente'}
          />
        </div>

        {editingCredentials ? (
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 p-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-200">Instance ID</span>
              <input
                type="text"
                value={form.instance_id}
                onChange={(event) => setField('instance_id', event.target.value)}
                disabled={loading || saving || validating || qrLoading || statusLoading || !canManage}
                placeholder="Ex: ABC123DEF456GHI789JKL012MNO345"
                className="w-full rounded-xl border border-slate-700 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2 disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-200">Token</span>
              <input
                type="password"
                value={form.token}
                onChange={(event) => setField('token', event.target.value)}
                disabled={loading || saving || validating || qrLoading || statusLoading || !canManage}
                placeholder="Ex: SEU_TOKEN_DA_INSTANCIA"
                className="w-full rounded-xl border border-slate-700 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2 disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-200">Client Token</span>
              <input
                type="password"
                value={form.client_token}
                onChange={(event) => setField('client_token', event.target.value)}
                disabled={loading || saving || validating || qrLoading || statusLoading || !canManage}
                placeholder="Ex: SEU_CLIENT_TOKEN"
                className="w-full rounded-xl border border-slate-700 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2 disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-200">Numero conectado</span>
              <input
                type="text"
                value={form.phone_number}
                onChange={(event) => setField('phone_number', event.target.value)}
                disabled
                placeholder="Preenchido apos conectar"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-2.5 text-sm outline-none disabled:opacity-60"
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className={`mt-5 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm shadow-sm ${statusMap[status]?.tone || statusMap.nao_configurado.tone}`}>
        {getStatusIcon(status)}
        <span>
          Status da integracao: <span className="font-semibold">{statusMap[status]?.label || statusMap.nao_configurado.label}</span>
        </span>
      </div>

      {form.connected && !form.phone_number && (
        <div className="mt-4 rounded-2xl border border-amber-700/50 bg-amber-950/30 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">Credenciais válidas, mas WhatsApp ainda não pareado</p>
              <p className="text-xs text-amber-400/80 mt-1">
                A instância Z-API está acessível, mas nenhum número foi vinculado. Gere o QR Code abaixo e escaneie com o WhatsApp para ativar os envios.
              </p>
              <button
                type="button"
                onClick={handleRefreshStatus}
                disabled={statusLoading}
                className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 disabled:opacity-50"
              >
                <RefreshCw size={11} className={statusLoading ? 'animate-spin' : ''} />
                Atualizar status agora
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={`rounded-2xl border px-4 py-4 text-sm shadow-sm ${form.connected && !form.phone_number ? 'border-amber-700/40 bg-amber-950/10' : 'border-slate-700 bg-slate-800/40'} text-slate-300`}>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Numero conectado</span>
          <span className={`mt-2 block font-semibold ${form.phone_number ? 'text-slate-50' : 'text-amber-300'}`}>
            {form.phone_number || 'Aguardando pareamento QR Code'}
          </span>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-4 text-sm text-slate-300 shadow-sm">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ultima validacao</span>
          <span className="mt-2 block font-semibold text-slate-50">
            {formatRelativeTimeLabel(lastValidatedAt)}
          </span>
        </div>
      </div>

      {integrationMessage ? (
        <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-200 shadow-sm">
          {integrationMessage}
        </div>
      ) : null}

      {!canManage ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          Seu perfil pode visualizar o status desta integracao, mas somente financeiro, admin ou system admin podem editar credenciais e gerar QR Code.
        </div>
      ) : null}

      {qrPanelEverOpened || qrLoading || qrCodeDataUrl || qrExpired || qrError ? (
        <div className="mt-5 rounded-3xl border border-slate-700 bg-slate-800/50 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-50">
            <QrCode size={16} />
            QR Code — Conectar WhatsApp
            {/* TEMP version marker — remove after confirming deploy in production */}
            <span className="ml-2 font-mono text-[10px] text-slate-600 select-none">v6541372+</span>
            <button
              type="button"
              onClick={() => {
                stopPolling();
                setQrPanelEverOpened(false);
                setQrCodeDataUrl('');
                setQrExpired(false);
                setQrError('');
                setQrDebug(null);
              }}
              className="ml-auto rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300 transition"
              title="Fechar painel QR"
            >
              Fechar QR ✕
            </button>
          </div>

          {/* ── DEBUG PANEL — remove after validating deploy ── */}
          <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-950/70 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-slate-400">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Debug State</p>
            <p>qrLoading: <span className={qrLoading ? 'text-blue-400' : 'text-slate-500'}>{String(qrLoading)}</span></p>
            <p>qrCodeDataUrl: <span className={qrCodeDataUrl ? 'text-green-400' : 'text-slate-500'}>{qrCodeDataUrl ? `sim (${qrCodeDataUrl.slice(0, 28)}...)` : 'vazio'}</span></p>
            <p>qrExpired: <span className={qrExpired ? 'text-amber-400' : 'text-slate-500'}>{String(qrExpired)}</span></p>
            <p>qrError: <span className={qrError ? 'text-red-400' : 'text-slate-500'}>{qrError || '(vazio)'}</span></p>
            <p>qrPanelEverOpened: <span className="text-blue-400">{String(qrPanelEverOpened)}</span></p>
            <p>status: <span className="text-slate-300">{status}</span></p>
            {qrDebug ? (
              <>
                <p>lastAction: <span className="text-slate-300">{qrDebug.lastAction}</span></p>
                {qrDebug.responseKeys ? <p>responseKeys: <span className="text-slate-300">[{qrDebug.responseKeys.join(', ')}]</span></p> : null}
                {qrDebug.rawError ? <p>rawError: <span className="text-red-400">{qrDebug.rawError}</span></p> : null}
              </>
            ) : null}
          </div>

          {qrLoading && !qrCodeDataUrl ? (
            /* ── Loading state ── */
            <div className="mt-4 flex h-64 w-64 items-center justify-center rounded-3xl border border-slate-700 bg-slate-900/60">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin text-blue-400" />
                <p className="text-xs text-slate-400">Gerando QR Code...</p>
              </div>
            </div>
          ) : qrExpired ? (
            /* ── Expired state ── */
            <div className="mt-4 flex flex-col items-center gap-3 rounded-3xl border border-amber-700/40 bg-amber-950/20 p-6 text-center">
              <AlertTriangle size={24} className="text-amber-400" />
              <p className="text-sm font-semibold text-amber-300">QR Code expirado</p>
              <p className="text-xs text-amber-400/80 max-w-xs">
                O QR Code expira em cerca de 30 segundos. Gere um novo para continuar a conexao.
              </p>
              <button
                type="button"
                onClick={handleGenerateQrCode}
                disabled={qrLoading || !canManage}
                className="mt-1 inline-flex items-center gap-2 rounded-xl border border-amber-700/40 bg-amber-950/30 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-950/50 hover:text-amber-200 disabled:opacity-50"
              >
                <RefreshCw size={13} />
                Gerar novo QR Code
              </button>
            </div>
          ) : qrError ? (
            /* ── Error state — keeps card visible, shows detail + retry ── */
            <div className="mt-4 flex flex-col items-center gap-3 rounded-3xl border border-red-700/40 bg-red-950/20 p-6 text-center">
              <CircleX size={24} className="text-red-400" />
              <p className="text-sm font-semibold text-red-300">Nao foi possivel gerar o QR Code</p>
              <p className="max-w-sm text-xs text-red-400/80">{qrError}</p>
              <button
                type="button"
                onClick={handleGenerateQrCode}
                disabled={qrLoading || !canManage}
                className="mt-1 inline-flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-950/30 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-950/50 hover:text-red-200 disabled:opacity-50"
              >
                <RefreshCw size={13} />
                Tentar novamente
              </button>
            </div>
          ) : qrCodeDataUrl ? (
            /* ── Active QR state ── */
            <>
              <p className="mt-2 text-sm text-slate-300">
                Abra o WhatsApp →{' '}
                <span className="font-semibold text-slate-200">Dispositivos conectados</span>{' '}
                → Conectar dispositivo e escaneie o codigo abaixo.
              </p>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="inline-flex shrink-0 rounded-3xl border border-slate-600 bg-white p-3 shadow-soft">
                  <img src={qrCodeDataUrl} alt="QR Code da Z-API" className="h-56 w-56 rounded-xl object-contain" />
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="rounded-2xl border border-blue-700/40 bg-blue-900/20 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-200">
                      <Loader2 size={12} className="animate-spin shrink-0" />
                      Aguardando conexao...
                    </div>
                    <p className="mt-1 text-xs text-blue-300/70">
                      Verificando automaticamente a cada 5 segundos. Quando o WhatsApp conectar, esta tela atualiza sozinha.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-xs text-slate-300">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Como escanear
                    </p>
                    <ol className="list-inside list-decimal space-y-1.5">
                      <li>Abra o WhatsApp no celular</li>
                      <li>
                        Toque em <span className="font-semibold text-slate-200">⋮ Menu</span> ou{' '}
                        <span className="font-semibold text-slate-200">Configuracoes</span>
                      </li>
                      <li>
                        Selecione{' '}
                        <span className="font-semibold text-slate-200">Dispositivos conectados</span>
                      </li>
                      <li>
                        Toque em{' '}
                        <span className="font-semibold text-slate-200">Conectar dispositivo</span>
                      </li>
                      <li>Aponte a camera para o QR Code</li>
                    </ol>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleValidate}
          disabled={loading || saving || validating || qrLoading || statusLoading || !canManage}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800/40 disabled:opacity-50"
        >
          {validating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          Validar conexao Z-API
        </button>
        <button
          type="button"
          onClick={handleGenerateQrCode}
          disabled={loading || saving || validating || qrLoading || statusLoading || !canManage}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800/40 disabled:opacity-50"
        >
          {qrLoading ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
          Gerar QR Code
        </button>
        <button
          type="button"
          onClick={handleRefreshStatus}
          disabled={loading || saving || validating || qrLoading || statusLoading || !canManage}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800/40 disabled:opacity-50"
        >
          {statusLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Atualizar status
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || saving || validating || qrLoading || statusLoading || !canManage}
          className="btn-brand inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <MessageCircleMore size={14} />}
          Salvar integracao desta empresa
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-300 shadow-sm">
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
  userRole = 'operador',
  isSystemAdmin = false,
}) {
  const normalizedRole = normalizeUserRole(userRole);
  const canManageIntegrations = isSystemAdmin || normalizedRole === 'admin' || normalizedRole === 'financeiro';
  const [zapiActive, setZapiActive] = useState(false);
  const [googleActive, setGoogleActive] = useState(false);
  const [googleMeta, setGoogleMeta] = useState({
    service_account_email: '',
    source_spreadsheet_id: '',
    source_sheet_name: '',
    last_source_sync_at: '',
    last_source_sync_status: '',
    last_source_sync_error: '',
  });

  const loadGoogleMeta = useCallback(async () => {
    if (!companyId || globalMode) {
      setGoogleMeta({
        service_account_email: '',
        source_spreadsheet_id: '',
        source_sheet_name: '',
        last_source_sync_at: '',
        last_source_sync_status: '',
        last_source_sync_error: '',
      });
      return;
    }

    try {
      const data = await getDriveBoletosConfig(companyId);
      const hasGoogleActive = Boolean(
        (data?.source_spreadsheet_id || data?.spreadsheet_id) &&
        (data?.source_sheet_name || data?.sheet_name)
      );
      setGoogleMeta({
        service_account_email: data?.service_account_email || '',
        source_spreadsheet_id: data?.source_spreadsheet_id || data?.spreadsheet_id || '',
        source_sheet_name: data?.source_sheet_name || data?.sheet_name || '',
        last_source_sync_at: data?.last_source_sync_at || '',
        last_source_sync_status: data?.last_source_sync_status || '',
        last_source_sync_error: data?.last_source_sync_error || '',
      });
      setGoogleActive(hasGoogleActive);
    } catch (error) {
      setGoogleActive(false);
      onToast?.('erro', error.message || 'Falha ao carregar o status do Google Sheets.');
    }
  }, [companyId, globalMode, onToast]);

  useEffect(() => {
    loadGoogleMeta();
  }, [loadGoogleMeta]);

  const activeIntegrations = Number(zapiActive) + Number(googleActive);

  return (
    <div className="space-y-6">
      <section className="hero-mesh overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60 p-6 shadow-lifted lg:p-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-700/40 bg-blue-900/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              <ShieldCheck size={13} />
              Integracoes
            </div>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-50 lg:text-4xl">
              Integracoes
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 lg:text-base">
              Conecte WhatsApp e Google Sheets para automatizar cobrancas e sincronizacoes.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="surface-elevated rounded-2xl border-blue-700/40 bg-blue-900/20 p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Ativacao</p>
              <p className="text-on-light mt-2 text-sm font-semibold">{activeIntegrations}/2 integracoes ativas</p>
            </div>
            <div className="surface-elevated rounded-2xl p-4 shadow-soft">
              <p className="text-on-light-muted text-[11px] font-semibold uppercase tracking-[0.18em]">Escopo</p>
              <p className="text-on-light mt-2 text-sm font-semibold">
                {globalMode ? 'Modo global bloqueia configuracoes por empresa' : companyName || 'Sem empresa ativa'}
              </p>
            </div>
            <div className="surface-elevated rounded-2xl p-4 shadow-soft">
              <p className="text-on-light-muted text-[11px] font-semibold uppercase tracking-[0.18em]">Perfil atual</p>
              <p className="text-on-light mt-2 text-sm font-semibold">
                {canManageIntegrations ? 'Pode gerenciar integracoes' : 'Somente visualiza status'}
              </p>
            </div>
            <div className="surface-elevated rounded-2xl p-4 shadow-soft">
              <p className="text-on-light-muted text-[11px] font-semibold uppercase tracking-[0.18em]">Credenciais</p>
              <p className="text-on-light mt-2 text-sm font-semibold">Seguras no backend</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ZapiIntegrationCard
          companyId={companyId}
          companyName={companyName}
          globalMode={globalMode}
          canManage={canManageIntegrations}
          onStatusChange={setZapiActive}
          onSaved={onGoogleSheetsSaved}
          onToast={onToast}
        />

        <GoogleSheetsConfig
          empresaId={companyId}
          empresaNome={companyName}
          globalMode={globalMode}
          onSaved={async () => {
            await loadGoogleMeta();
            await onGoogleSheetsSaved?.();
          }}
          variant="hub"
          canManage={canManageIntegrations}
          googleMeta={googleMeta}
          onToast={onToast}
          onStatusChange={setGoogleActive}
        />
      </section>

      {!globalMode && companyId ? (
        <section className="rounded-2xl border border-slate-700/90 bg-slate-900/60 p-7 shadow-card">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-amber-500/10 text-amber-400 shadow-soft">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-50">Boletos no Google Drive</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">
                Configure a pasta do Drive para localizar e enviar PDFs de boleto automaticamente via WhatsApp.
              </p>
            </div>
          </div>
          <DriveBoletoConfig
            empresaId={companyId}
            canManage={canManageIntegrations}
            onToast={onToast}
            onSaved={onGoogleSheetsSaved}
          />
        </section>
      ) : null}
    </div>
  );
}
