import { supabase } from './supabaseClient';

export function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';

  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  return withCountry.length >= 12 && withCountry.length <= 13 ? withCountry : withCountry;
}

export function validatePhone(value) {
  const normalized = formatPhone(value);
  return /^55\d{10,11}$/.test(normalized);
}

const invokeBillingSend = async (body, fallbackMessage) => {
  if (!supabase) {
    throw new Error('Supabase não configurado.');
  }

  const { data, error } = await supabase.functions.invoke('billing-automation', { body });

  if (error) {
    throw new Error(error.message || fallbackMessage);
  }

  if (!data?.ok) {
    throw new Error(data?.error || fallbackMessage);
  }

  return data;
};

export async function sendMessage(payload) {
  return invokeBillingSend(
    {
      action: 'send_preview',
      mode: 'text',
      payload,
    },
    'Falha ao enviar mensagem de cobrança.'
  );
}

export async function sendMedia(payload) {
  return invokeBillingSend(
    {
      action: 'send_preview',
      mode: 'media',
      payload,
    },
    'Falha ao enviar mídia de cobrança.'
  );
}
