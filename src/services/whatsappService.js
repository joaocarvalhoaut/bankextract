/**
 * BankExtract Pro — WhatsApp Service (Frontend)
 *
 * IMPORTANTE: Este serviço NUNCA armazena ou expõe tokens Z-API.
 * Todo o envio acontece na Edge Function (backend seguro).
 * O frontend apenas chama supabase.functions.invoke().
 */

import { supabase } from './supabaseClient';

const buildError = (err, fallback) => {
  if (err instanceof Error) return err;
  return new Error(err?.message || err?.error || fallback);
};

// ---------------------------------------------------------------------------
// getWhatsAppConfig
// Busca configuração WhatsApp de uma empresa.
// ---------------------------------------------------------------------------
export async function getWhatsAppConfig(empresaId) {
  if (!empresaId || !supabase) return null;

  const { data, error } = await supabase
    .from('whatsapp_config')
    .select('id, empresa_id, ativo, sender_name, mensagem_template, updated_at')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (error) throw buildError(error, 'Falha ao buscar configuração WhatsApp.');
  return data || null;
}

// ---------------------------------------------------------------------------
// saveWhatsAppConfig
// Cria ou atualiza configuração WhatsApp de uma empresa (upsert).
// ---------------------------------------------------------------------------
export async function saveWhatsAppConfig(empresaId, config) {
  if (!supabase) throw new Error('Supabase não configurado.');
  if (!empresaId) throw new Error('Nenhuma empresa ativa selecionada.');

  const { data, error } = await supabase
    .from('whatsapp_config')
    .upsert(
      { empresa_id: empresaId, ...config },
      { onConflict: 'empresa_id' }
    )
    .select()
    .single();

  if (error) throw buildError(error, 'Falha ao salvar configuração WhatsApp.');
  return data;
}

// ---------------------------------------------------------------------------
// sendWhatsAppCharges
// Chama a Edge Function send-whatsapp-charge para enviar as cobranças.
// Os tokens Z-API ficam APENAS no backend (Edge Function + Supabase Secrets).
// ---------------------------------------------------------------------------
export async function sendWhatsAppCharges(empresaId, charges) {
  if (!supabase) throw new Error('Supabase não configurado.');
  if (!empresaId) throw new Error('Nenhuma empresa ativa selecionada.');
  if (!charges?.length) throw new Error('Nenhuma cobrança informada.');

  const { data, error } = await supabase.functions.invoke('send-whatsapp-charge', {
    body: { empresa_id: empresaId, charges },
  });

  if (error) throw buildError(error, 'Falha ao chamar Edge Function de WhatsApp.');
  if (!data?.ok) throw new Error(data?.error || 'Resposta inesperada da Edge Function.');

  return data; // { ok, results, summary }
}
