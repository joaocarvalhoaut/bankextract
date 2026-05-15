/**
 * NC Finance - WhatsApp Service (Frontend)
 *
 * Mantem compatibilidade com o modal legado, mas roteia o envio
 * para o pipeline principal de cobranca via billing-automation.
 */

import { sendRealCharge } from './billingAutomationService';
import { createScopedLogger } from './loggerService';

const logger = createScopedLogger('send-whatsapp-charge');

const buildError = (err, fallback) => {
  if (err instanceof Error) return err;
  return new Error(err?.message || err?.error || fallback);
};

const normalizeBatchResponse = (data = {}) => {
  const sent = Array.isArray(data?.sent) ? data.sent : [];
  const failed = Array.isArray(data?.failed) ? data.failed : [];
  const results = [
    ...sent.map((item) => ({
      registro_id: item?.registro_id || item?.id || '',
      ok: true,
      error: '',
      mocked: false,
      duplicate: false,
      provider_message_id: item?.provider_message_id || null,
      status: item?.status || 'sent',
    })),
    ...failed.map((item) => ({
      registro_id: item?.registro_id || item?.id || '',
      ok: false,
      error: item?.error || 'Falha ao enviar cobranca por WhatsApp.',
      mocked: false,
      duplicate: item?.duplicate === true,
      provider_message_id: null,
      status: item?.status || 'failed',
    })),
  ];

  return {
    ok: true,
    mocked: false,
    sent,
    failed,
    results,
    summary: {
      sent: sent.length,
      failed: failed.length,
      total: sent.length + failed.length,
    },
  };
};

export async function getWhatsAppConfig() {
  return null;
}

export async function saveWhatsAppConfig() {
  throw new Error('A configuracao legado do WhatsApp nao esta mais disponivel nesta interface.');
}

export async function sendWhatsAppCharges(empresaId, charges) {
  if (!empresaId) throw new Error('Nenhuma empresa ativa selecionada.');
  if (!charges?.length) throw new Error('Nenhuma cobranca informada.');

  logger.info('batch_send_requested', {
    company_id: empresaId,
    charges_count: charges.length,
    registro_ids: charges.map((item) => item?.registro_id || item?.id).filter(Boolean),
  });

  try {
    const data = await sendRealCharge(empresaId, charges);
    const normalized = normalizeBatchResponse(data);

    logger.info('batch_send_response', {
      company_id: empresaId,
      sent: normalized.summary.sent,
      failed: normalized.summary.failed,
      total: normalized.summary.total,
    });

    return normalized;
  } catch (error) {
    logger.error('batch_send_failed', error, {
      company_id: empresaId,
      charges_count: charges.length,
    });
    throw buildError(error, 'Falha ao enviar cobrancas por WhatsApp.');
  }
}
