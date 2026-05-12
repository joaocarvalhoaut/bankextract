/**
 * NC Finance - WhatsApp Service (Frontend)
 *
 * Tokens da Z-API continuam exclusivamente no backend.
 * O frontend apenas invoca a Edge Function e registra observabilidade local.
 */

import { supabase } from './supabaseClient';
import { createScopedLogger } from './loggerService';

const logger = createScopedLogger('send-whatsapp-charge');

const buildError = (err, fallback) => {
  if (err instanceof Error) return err;
  return new Error(err?.message || err?.error || fallback);
};

export async function getWhatsAppConfig(empresaId) {
  if (!empresaId || !supabase) return null;

  const { data, error } = await supabase
    .from('whatsapp_config')
    .select('id, empresa_id, ativo, sender_name, mensagem_template, updated_at')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (error) throw buildError(error, 'Falha ao buscar configuracao WhatsApp.');
  return data || null;
}

export async function saveWhatsAppConfig(empresaId, config) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!empresaId) throw new Error('Nenhuma empresa ativa selecionada.');

  const { data, error } = await supabase
    .from('whatsapp_config')
    .upsert(
      { empresa_id: empresaId, ...config },
      { onConflict: 'empresa_id' },
    )
    .select()
    .single();

  if (error) throw buildError(error, 'Falha ao salvar configuracao WhatsApp.');
  return data;
}

export async function sendWhatsAppCharges(empresaId, charges) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!empresaId) throw new Error('Nenhuma empresa ativa selecionada.');
  if (!charges?.length) throw new Error('Nenhuma cobranca informada.');

  logger.info('batch_send_requested', {
    company_id: empresaId,
    charges_count: charges.length,
    registro_ids: charges.map((item) => item?.registro_id).filter(Boolean),
  });

  const { data, error } = await supabase.functions.invoke('send-whatsapp-charge', {
    body: { empresa_id: empresaId, charges },
  });

  logger.info('batch_send_response', {
    company_id: empresaId,
    request_id: data?.request_id || '',
    mocked: data?.mocked === true,
    sent: Number(data?.summary?.sent || 0),
    failed: Number(data?.summary?.failed || 0),
    total: Number(data?.summary?.total || 0),
  });

  if (error) {
    logger.error('batch_send_transport_failed', error, {
      company_id: empresaId,
      charges_count: charges.length,
    });
    throw buildError(error, 'Falha ao chamar Edge Function de WhatsApp.');
  }

  if (!data?.ok) {
    const responseError = new Error(data?.error || 'Resposta inesperada da Edge Function.');
    logger.error('batch_send_failed', responseError, {
      company_id: empresaId,
      request_id: data?.request_id || '',
      details: data?.details || null,
    });
    throw responseError;
  }

  return data;
}

