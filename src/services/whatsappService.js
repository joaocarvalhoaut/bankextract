/**
 * NC Finance - WhatsApp Service (Frontend)
 *
 * Pipeline oficial: billing-automation (action: send_real / send_single_charge)
 * A edge function send-whatsapp-charge está DEPRECIADA e não deve ser invocada
 * diretamente pelo frontend. Toda chamada de envio passa por billing-automation.
 *
 * Tokens da Z-API continuam exclusivamente no backend.
 * O frontend apenas invoca a Edge Function e registra observabilidade local.
 */

import { supabase } from './supabaseClient';
import { createScopedLogger } from './loggerService';

const logger = createScopedLogger('billing-automation.send');

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

  const { data, error } = await supabase.functions.invoke('billing-automation', {
    body: {
      action: 'send_real',
      company_id: empresaId,
      items: charges,
    },
  });

  // billing-automation.send_real retorna { ok, sent, failed }
  // Normaliza para o shape esperado pelo caller: { ok, mocked, summary, results }
  const sentCount = Number(data?.sent ?? data?.summary?.sent ?? 0);
  const failedCount = Number(data?.failed ?? data?.summary?.failed ?? 0);

  logger.info('batch_send_response', {
    company_id: empresaId,
    mocked: data?.mocked === true,
    sent: sentCount,
    failed: failedCount,
    total: sentCount + failedCount,
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
    logger.error('batch_send_failed', responseError, { company_id: empresaId });
    throw responseError;
  }

  return {
    ok: data.ok,
    mocked: data?.mocked || false,
    request_id: data?.request_id || '',
    results: data?.results || [],
    summary: { sent: sentCount, failed: failedCount, total: sentCount + failedCount },
  };
}

