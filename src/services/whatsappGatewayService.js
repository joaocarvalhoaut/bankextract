import { supabase } from './supabaseClient';
import { buildZapiErrorInfo, ZAPI_ERROR_KINDS } from '../shared/zapiErrorMapping.js';
import { normalizeWhatsappConnectionState } from '../utils/whatsappConnectionState.js';

const buildError = (err, fallback) => {
  const sourceError = err instanceof Error ? err : new Error(err?.message || err?.error || fallback);
  const mapped = buildZapiErrorInfo({
    message: sourceError.message,
    name: sourceError.name,
  });

  if (mapped.kind === ZAPI_ERROR_KINDS.UNKNOWN) {
    return sourceError;
  }

  return new Error(mapped.userMessage);
};

const buildZapiUxError = (value, fallbackMessage) => {
  const mapped = buildZapiErrorInfo({
    message: String(value || fallbackMessage || '').trim(),
  });

  if (mapped.kind === ZAPI_ERROR_KINDS.UNKNOWN) {
    return new Error(String(value || fallbackMessage || 'Falha ao processar o gateway WhatsApp.'));
  }

  return new Error(mapped.userMessage);
};

const sanitizePayload = (payload = {}) => ({
  provider: 'zapi',
  instance_id: String(payload?.instance_id || '').trim(),
  token: String(payload?.token || '').trim(),
  client_token: String(payload?.client_token || '').trim(),
  connected: Boolean(payload?.connected),
  phone_number: String(payload?.phone_number || '').trim() || null,
  connected_at: payload?.connected_at || null,
  last_healthcheck_at: payload?.last_healthcheck_at || null,
  metadata: payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
});

export async function getGlobalWhatsappGateway() {
  if (!supabase) throw new Error('Supabase nao configurado.');

  const { data, error } = await supabase
    .from('platform_integrations')
    .select('id, provider, instance_id, token, client_token, connected, phone_number, connected_at, last_healthcheck_at, metadata, created_at, updated_at')
    .eq('provider', 'zapi')
    .maybeSingle();

  if (error) throw buildError(error, 'Falha ao carregar o gateway WhatsApp global.');
  return data || null;
}

export async function saveGlobalWhatsappGateway(payload) {
  if (!supabase) throw new Error('Supabase nao configurado.');

  const normalized = sanitizePayload(payload);
  const { data, error } = await supabase
    .from('platform_integrations')
    .upsert(normalized, { onConflict: 'provider' })
    .select('id, provider, instance_id, token, client_token, connected, phone_number, connected_at, last_healthcheck_at, metadata, created_at, updated_at')
    .single();

  if (error) throw buildError(error, 'Falha ao salvar o gateway WhatsApp global.');
  return data;
}

async function invokeGatewayAction(action, payload) {
  if (!supabase) throw new Error('Supabase nao configurado.');

  const { data, error } = await supabase.functions.invoke('billing-automation', {
    body: {
      action,
      config: {
        instance_id: String(payload?.instance_id || '').trim(),
        token: String(payload?.token || '').trim(),
        client_token: String(payload?.client_token || '').trim(),
      },
    },
  });

  if (error) throw buildError(error, 'Falha ao consultar o gateway WhatsApp.');
  if (!(data?.ok === true || data?.success === true)) {
    throw buildZapiUxError(data?.error, 'Falha ao consultar o gateway WhatsApp.');
  }

  return normalizeWhatsappConnectionState(data);
}

export async function validateGlobalWhatsappGateway(payload) {
  return invokeGatewayAction('validate_global_whatsapp_connection', payload);
}

export async function getGlobalWhatsappGatewayQrCode(payload) {
  return invokeGatewayAction('get_global_whatsapp_qr_code', payload);
}

export async function getGlobalWhatsappGatewayStatus(payload) {
  return invokeGatewayAction('get_global_whatsapp_connection_status', payload);
}
