import { createScopedLogger } from './loggerService';
import { supabase } from './supabaseClient';

const logger = createScopedLogger('operational-ai');

const buildError = (err, fallback) => {
  if (err instanceof Error) return err;
  return new Error(err?.message || err?.error || fallback);
};

async function invokeOperationalAi(body, fallbackMessage) {
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  logger.info('invoke_requested', {
    action: body?.action || 'unknown',
    company_id: body?.company_id || body?.companyId || '',
  });

  const { data, error } = await supabase.functions.invoke('operational-ai', { body });

  if (error) {
    logger.error('invoke_failed', error, { action: body?.action || 'unknown' });
    throw buildError(error, fallbackMessage);
  }

  if (data?.success === false) {
    const normalized = new Error(data?.error || fallbackMessage);
    logger.error('invoke_failed_response', normalized, { action: body?.action || 'unknown', data });
    throw normalized;
  }

  logger.info('invoke_succeeded', { action: body?.action || 'unknown' });
  return data;
}

export async function getOperationalInsights(companyId, analytics = {}) {
  return invokeOperationalAi(
    {
      action: 'build_operational_insights',
      company_id: companyId,
      analytics,
    },
    'Falha ao gerar insights operacionais por IA.',
  );
}

export async function suggestChargeTone(companyId, payload = {}) {
  return invokeOperationalAi(
    {
      action: 'suggest_charge_tone',
      company_id: companyId,
      payload,
    },
    'Falha ao sugerir o tom ideal de cobranca.',
  );
}

export default {
  getOperationalInsights,
  suggestChargeTone,
};
