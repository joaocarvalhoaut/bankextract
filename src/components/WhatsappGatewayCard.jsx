import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  getGlobalWhatsappGateway,
  getGlobalWhatsappGatewayQrCode,
  getGlobalWhatsappGatewayStatus,
  saveGlobalWhatsappGateway,
  validateGlobalWhatsappGateway,
} from '../services/whatsappGatewayService';
import { normalizeWhatsappConnectionState } from '../utils/whatsappConnectionState';

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

function StatusBadge({ tone = 'idle', children }) {
  const tones = {
    ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    error: 'border-red-500/30 bg-red-500/10 text-red-300',
    info: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    idle: 'border-slate-700 bg-slate-800/50 text-slate-300',
  };
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function ActionButton({ tone = 'default', className = '', ...props }) {
  const toneClass =
    tone === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-500'
      : tone === 'success'
        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
        : 'border border-slate-700 bg-slate-900/70 text-slate-100 hover:bg-slate-800/70';

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${className}`}
    />
  );
}

export default function WhatsappGatewayCard({ onToast }) {
  const [form, setForm] = useState({
    instance_id: '',
    token: '',
    client_token: '',
    phone_number: '',
    connected: false,
  });
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [gatewayRow, setGatewayRow] = useState(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autosaving, setAutosaving] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [qrError, setQrError] = useState('');
  const [qrExpired, setQrExpired] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const pollingRef = useRef(null);
  const qrExpiryRef = useRef(null);
  const autosaveRef = useRef(null);
  const pollingActiveRef = useRef(false);
  const formRef = useRef(form);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const connectionState = useMemo(
    () => normalizeWhatsappConnectionState({
      connected: form.connected,
      phone_number: form.phone_number,
      message,
      status,
    }),
    [form.connected, form.phone_number, message, status]
  );

  const stopPolling = useCallback(() => {
    pollingActiveRef.current = false;
    if (pollingRef.current) {
      window.clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    if (qrExpiryRef.current) {
      window.clearTimeout(qrExpiryRef.current);
      qrExpiryRef.current = null;
    }
  }, []);

  const persistDraft = useCallback(async (options = {}) => {
    const payload = options.payload || formRef.current;
    const silent = options.silent === true;
    const instanceId = String(payload.instance_id || '').trim();
    const token = String(payload.token || '').trim();
    const clientToken = String(payload.client_token || '').trim();

    if (!instanceId || !token || !clientToken) {
      return null;
    }

    if (silent) {
      setAutosaving(true);
    } else {
      setSaving(true);
    }

    try {
      const saved = await saveGlobalWhatsappGateway({
        instance_id: instanceId,
        token,
        client_token: clientToken,
        connected: Boolean(payload.connected),
        phone_number: String(payload.phone_number || '').trim(),
        connected_at: payload.connected ? new Date().toISOString() : null,
        last_healthcheck_at: options.touchHealthcheck ? new Date().toISOString() : null,
        metadata: {
          source: 'admin_gateway',
          connected_pending_phone: Boolean(payload.connected && !String(payload.phone_number || '').trim()),
        },
      });
      setGatewayRow(saved);
      setForm((current) => ({
        ...current,
        phone_number: String(saved?.phone_number || payload.phone_number || '').trim(),
        connected: Boolean(saved?.connected ?? payload.connected),
      }));
      return saved;
    } finally {
      if (silent) {
        setAutosaving(false);
      } else {
        setSaving(false);
      }
    }
  }, []);

  const startPolling = useCallback((draftArg) => {
    const draft = draftArg || formRef.current;
    stopPolling();
    pollingActiveRef.current = true;
    setQrExpired(false);

    qrExpiryRef.current = window.setTimeout(() => {
      if (!pollingActiveRef.current) return;
      setQrExpired(true);
      stopPolling();
    }, 40000);

    const pollOnce = async () => {
      if (!pollingActiveRef.current) return;
      try {
        const result = normalizeWhatsappConnectionState(await getGlobalWhatsappGatewayStatus(draft));
        const phoneNumber = String(result.phone_number || '').trim();
        setForm((current) => ({
          ...current,
          connected: result.connected,
          phone_number: phoneNumber || current.phone_number,
        }));
        setGatewayRow((current) => (
          current
            ? {
                ...current,
                connected: result.connected,
                phone_number: phoneNumber || current.phone_number || '',
                last_healthcheck_at: new Date().toISOString(),
              }
            : current
        ));
        setStatus(result.connected ? (result.connected_pending_phone ? 'connected_pending_phone' : 'connected') : 'awaiting_qr');
        setMessage(
          result.connected
            ? (result.connected_pending_phone
              ? 'WhatsApp conectado. Aguardando sincronizacao do numero.'
              : 'WhatsApp conectado com sucesso.')
            : 'Instancia aguardando leitura do QR Code.'
        );
        setQrError('');

        await persistDraft({
          payload: {
            ...draft,
            connected: result.connected,
            phone_number: phoneNumber,
          },
          silent: true,
          touchHealthcheck: true,
        });

        if (result.connected && !result.connected_pending_phone) {
          stopPolling();
          setQrCodeDataUrl('');
          return;
        }
      } catch (error) {
        setMessage(error.message || 'Falha ao atualizar o gateway WhatsApp.');
      } finally {
        if (pollingActiveRef.current) {
          pollingRef.current = window.setTimeout(pollOnce, 5000);
        }
      }
    };

    pollingRef.current = window.setTimeout(pollOnce, 5000);
  }, [persistDraft, stopPolling]);

  useEffect(() => {
    let active = true;
    setLoadingInitial(true);
    getGlobalWhatsappGateway()
      .then((row) => {
        if (!active || !row) return;
        setGatewayRow(row);
        setForm({
          instance_id: row.instance_id || '',
          token: row.token || '',
          client_token: row.client_token || '',
          phone_number: row.phone_number || '',
          connected: Boolean(row.connected),
        });
        const normalized = normalizeWhatsappConnectionState({
          connected: row.connected,
          phone_number: row.phone_number,
          connected_pending_phone: Boolean(row.connected && !String(row.phone_number || '').trim()),
        });
        setStatus(normalized.connected ? (normalized.connected_pending_phone ? 'connected_pending_phone' : 'connected') : 'idle');
        setMessage(
          normalized.connected
            ? (normalized.connected_pending_phone ? 'WhatsApp conectado. Aguardando sincronizacao do numero.' : 'WhatsApp conectado com sucesso.')
            : 'Credenciais prontas para validacao.'
        );
      })
      .catch((error) => {
        if (active) {
          onToast?.('erro', error.message || 'Falha ao carregar o gateway WhatsApp global.');
        }
      })
      .finally(() => {
        if (active) setLoadingInitial(false);
      });

    return () => {
      active = false;
      stopPolling();
      if (autosaveRef.current) {
        window.clearTimeout(autosaveRef.current);
      }
    };
  }, [onToast, stopPolling]);

  useEffect(() => {
    const filled = [form.instance_id, form.token, form.client_token].every((value) => String(value || '').trim());
    if (!filled) return undefined;

    autosaveRef.current = window.setTimeout(() => {
      persistDraft({ silent: true }).catch(() => {});
    }, 700);

    return () => {
      if (autosaveRef.current) {
        window.clearTimeout(autosaveRef.current);
      }
    };
  }, [form.client_token, form.instance_id, form.token, persistDraft]);

  useEffect(() => {
    if (connectionState.connected_pending_phone) {
      startPolling(formRef.current);
      return undefined;
    }

    if (!qrLoading) {
      stopPolling();
    }

    return undefined;
  }, [connectionState.connected_pending_phone, qrLoading, startPolling, stopPolling]);

  const handleValidate = useCallback(async () => {
    setValidating(true);
    setQrError('');
    setQrExpired(false);
    setMessage('Validando conexao...');
    setStatus('validating');

    try {
      const saved = await persistDraft({
        payload: {
          ...formRef.current,
          connected: false,
          phone_number: formRef.current.phone_number,
        },
        touchHealthcheck: true,
      });
      const draft = {
        instance_id: saved?.instance_id || formRef.current.instance_id,
        token: saved?.token || formRef.current.token,
        client_token: saved?.client_token || formRef.current.client_token,
      };
      const result = normalizeWhatsappConnectionState(await validateGlobalWhatsappGateway(draft));
      const phoneNumber = String(result.phone_number || '').trim();

      setForm((current) => ({
        ...current,
        connected: result.connected,
        phone_number: phoneNumber || current.phone_number,
      }));
      setStatus(result.connected ? (result.connected_pending_phone ? 'connected_pending_phone' : 'connected') : 'awaiting_qr');
      setMessage(
        result.connected
          ? (result.connected_pending_phone
            ? 'WhatsApp conectado - aguardando sincronizacao do numero.'
            : 'WhatsApp conectado.')
          : 'Conexao validada. QR Code gerado automaticamente.'
      );

      await persistDraft({
        payload: {
          ...draft,
          connected: result.connected,
          phone_number: phoneNumber,
        },
        touchHealthcheck: true,
      });

      if (result.connected) {
        setQrCodeDataUrl('');
        setQrError('');
        if (result.connected_pending_phone) {
          startPolling(draft);
        } else {
          stopPolling();
        }
      } else {
        const qrResult = normalizeWhatsappConnectionState(await getGlobalWhatsappGatewayQrCode(draft));
        setQrCodeDataUrl(qrResult.qrCode || qrResult.image_data_url || '');
        setStatus('awaiting_qr');
        setMessage('Conexao validada. QR Code gerado automaticamente.');
        startPolling(draft);
      }
    } catch (error) {
      setStatus('error');
      setMessage(error.message || 'Falha ao validar a conexao do gateway.');
      setQrError(error.message || 'Falha ao validar a conexao do gateway.');
      onToast?.('erro', error.message || 'Falha ao validar a conexao do gateway.');
    } finally {
      setValidating(false);
    }
  }, [onToast, persistDraft, startPolling, stopPolling]);

  const handleGenerateQr = useCallback(async () => {
    setQrLoading(true);
    setQrError('');
    setQrExpired(false);
    setMessage('Gerando QR Code...');

    try {
      const saved = await persistDraft({
        payload: {
          ...formRef.current,
          connected: false,
        },
        touchHealthcheck: true,
      });
      const draft = {
        instance_id: saved?.instance_id || formRef.current.instance_id,
        token: saved?.token || formRef.current.token,
        client_token: saved?.client_token || formRef.current.client_token,
      };
      const result = normalizeWhatsappConnectionState(await getGlobalWhatsappGatewayQrCode(draft));
      const phoneNumber = String(result.phone_number || '').trim();

      if (result.connected) {
        setForm((current) => ({
          ...current,
          connected: true,
          phone_number: phoneNumber || current.phone_number,
        }));
        setStatus(result.connected_pending_phone ? 'connected_pending_phone' : 'connected');
        setMessage(
          result.connected_pending_phone
            ? 'WhatsApp conectado. Aguardando sincronizacao do numero.'
            : 'WhatsApp conectado com sucesso.'
        );
        setQrCodeDataUrl('');
        await persistDraft({
          payload: {
            ...draft,
            connected: true,
            phone_number: phoneNumber,
          },
          touchHealthcheck: true,
        });
        if (result.connected_pending_phone) {
          startPolling(draft);
        } else {
          stopPolling();
        }
        return;
      }

      const nextQr = result.qrCode || result.image_data_url || '';
      setQrCodeDataUrl(nextQr);
      setStatus('awaiting_qr');
      setMessage('QR Code pronto para leitura.');
      startPolling(draft);
    } catch (error) {
      setStatus('error');
      setMessage(error.message || 'Nao foi possivel gerar o QR Code.');
      setQrError(error.message || 'Nao foi possivel gerar o QR Code.');
      onToast?.('erro', error.message || 'Nao foi possivel gerar o QR Code.');
    } finally {
      setQrLoading(false);
    }
  }, [onToast, persistDraft, startPolling, stopPolling]);

  const handleSave = useCallback(async () => {
    try {
      await persistDraft({ touchHealthcheck: true });
      setStatus(connectionState.connected ? 'connected' : status);
      setMessage('Credenciais globais salvas com sucesso.');
      onToast?.('sucesso', 'Credenciais globais salvas com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao salvar o gateway WhatsApp.');
    }
  }, [connectionState.connected, onToast, persistDraft, status]);

  const connectionTone = connectionState.connected
    ? 'ok'
    : status === 'error'
      ? 'error'
      : status === 'validating'
        ? 'info'
        : 'idle';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-50">Gateway WhatsApp / Z-API global</h3>
          <p className="text-sm text-slate-400">Uma unica instancia compartilhada por toda a plataforma, com QR automatico, polling seguro e healthcheck visual.</p>
        </div>
        {gatewayRow?.last_healthcheck_at ? (
          <StatusBadge tone="info">Ultimo healthcheck {new Date(gatewayRow.last_healthcheck_at).toLocaleTimeString('pt-BR')}</StatusBadge>
        ) : null}
      </div>

      {loadingInitial ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-4 text-sm text-slate-300">
          <Loader2 size={16} className="animate-spin text-blue-400" />
          Carregando gateway global...
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Instance ID">
          <BaseInput
            value={form.instance_id}
            onChange={(event) => setForm((current) => ({ ...current, instance_id: event.target.value, connected: false }))}
            placeholder="Cole o Instance ID da Z-API"
          />
        </Field>
        <Field label="Token">
          <BaseInput
            type="password"
            value={form.token}
            onChange={(event) => setForm((current) => ({ ...current, token: event.target.value, connected: false }))}
            placeholder="Cole o token da instancia"
          />
        </Field>
        <Field label="Client Token">
          <BaseInput
            type="password"
            value={form.client_token}
            onChange={(event) => setForm((current) => ({ ...current, client_token: event.target.value, connected: false }))}
            placeholder="Cole o client token"
          />
        </Field>
        <Field label="Numero sincronizado">
          <BaseInput value={form.phone_number} disabled placeholder="Preenchido automaticamente" />
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <ActionButton tone="primary" onClick={handleValidate} disabled={validating || autosaving}>
          {validating ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          Testar conexao
        </ActionButton>
        {!connectionState.connected ? (
          <ActionButton onClick={handleGenerateQr} disabled={qrLoading || autosaving}>
            {qrLoading ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
            Gerar QR automaticamente
          </ActionButton>
        ) : null}
        <ActionButton tone="success" onClick={handleSave} disabled={saving || autosaving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Salvar credenciais
        </ActionButton>
        <ActionButton onClick={() => startPolling(formRef.current)} disabled={!connectionState.connected_pending_phone}>
          <RefreshCw size={16} />
          Atualizar status
        </ActionButton>
        {autosaving ? (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
            <Loader2 size={14} className="animate-spin text-blue-400" />
            Salvando credenciais...
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={connectionTone}>
              {connectionState.connected
                ? 'WhatsApp conectado'
                : status === 'awaiting_qr'
                  ? 'Aguardando leitura do QR'
                  : status === 'validating'
                    ? 'Validando conexao...'
                    : 'Gateway aguardando configuracao'}
            </StatusBadge>
            {connectionState.connected_pending_phone ? <StatusBadge tone="warning">Aguardando sincronizacao do numero</StatusBadge> : null}
          </div>
          <p className="mt-4 text-sm text-slate-300">
            {message || 'Assim que a Z-API reportar connected=true, a plataforma considera a conexao valida imediatamente e continua sincronizando o numero em segundo plano.'}
          </p>

          {qrError && !connectionState.connected ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {qrError}
            </div>
          ) : null}

          {connectionState.connected_pending_phone ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 size={16} />
                WhatsApp conectado
              </div>
              <p className="mt-1 text-emerald-100/80">Aguardando sincronizacao do numero. O polling segue em segundo plano, sem erro vermelho.</p>
            </div>
          ) : null}

          {connectionState.connected && !connectionState.connected_pending_phone ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 size={16} />
                Gateway operacional
              </div>
              <p className="mt-1 text-emerald-100/80">Numero sincronizado: {form.phone_number || 'Nao informado'}.</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-5">
          <p className="text-sm font-semibold text-slate-100">QR e healthcheck</p>
          {qrLoading ? (
            <div className="mt-4 flex h-48 items-center justify-center rounded-3xl border border-slate-700 bg-slate-950/70">
              <Loader2 size={24} className="animate-spin text-blue-400" />
            </div>
          ) : qrCodeDataUrl ? (
            <div className="mt-4">
              <div className="inline-flex rounded-3xl border border-slate-700 bg-white p-3">
                <img src={qrCodeDataUrl} alt="QR Code Z-API global" className="h-56 w-56 rounded-2xl object-contain" />
              </div>
              <p className="mt-3 text-xs text-slate-400">Abra o WhatsApp, entre em Dispositivos conectados e escaneie o QR Code. O status atualiza sozinho.</p>
            </div>
          ) : qrExpired ? (
            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              QR expirado. Gere um novo se ainda estiver aguardando a leitura.
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
              O QR aparece aqui apenas se a instancia global ainda nao estiver conectada.
            </div>
          )}
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Healthcheck</p>
              <p className="mt-1">{gatewayRow?.connected ? 'Instancia com sinal de conexao salvo.' : 'Aguardando primeira validacao de conexao.'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
