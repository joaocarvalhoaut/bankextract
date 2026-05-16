import { supabase } from './supabaseClient';
import { createScopedLogger } from './loggerService';
import { withRetryMetadata } from './retryService';
import { normalizeDriveLookupResults } from '../utils/driveLookupResults.js';

const logger = createScopedLogger('whatsapp-billing');

const buildError = (err, fallback) => {
  if (err instanceof Error) return err;
  return new Error(err?.message || err?.error || fallback);
};

const formatEdgeError = (data, fallbackMessage) => {
  const mainMessage = data?.error || data?.message || fallbackMessage;
  const details = data?.details;

  if (!details) {
    return new Error(mainMessage);
  }

  if (typeof details === 'string') {
    return new Error(`${mainMessage} | details: ${details}`);
  }

  try {
    return new Error(`${mainMessage} | details: ${JSON.stringify(details)}`);
  } catch {
    return new Error(mainMessage);
  }
};

const invokeBillingAutomation = async (body, fallbackMessage) => {
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const { data, error } = await supabase.functions.invoke('billing-automation', { body });

  if (error) {
    throw buildError(error, fallbackMessage);
  }

  const isSuccess = data?.ok === true || data?.success === true;
  const isFailure = data?.ok === false || data?.success === false;

  if (isFailure) {
    throw formatEdgeError(data, fallbackMessage);
  }

  if (!isSuccess) {
    throw formatEdgeError(data, fallbackMessage);
  }

  return data;
};

const getNumeroBoletoEfetivo = (registro = {}) =>
  String(registro?.documento || registro?.numero_nf || registro?.numero_boleto || '').trim();

const getClienteEfetivo = (registro = {}) =>
  String(registro?.cliente_nome || registro?.cliente || '').trim();

const temBoletoEncontrado = (registro = {}) => {
  const numero = getNumeroBoletoEfetivo(registro);
  return Boolean(numero && numero !== '-');
};

const normalizeBillingPayload = (payload = {}) => {
  const numeroBoletoEfetivo = getNumeroBoletoEfetivo(payload);
  const clienteEfetivo = getClienteEfetivo(payload);
  const boletoEncontrado = temBoletoEncontrado(payload);


  return {
    ...payload,
    cliente: clienteEfetivo || payload?.cliente || '',
    cliente_nome: clienteEfetivo || payload?.cliente_nome || '',
    documento: payload?.documento || '',
    numero_nf: payload?.numero_nf || '',
    numero_boleto: numeroBoletoEfetivo || payload?.numero_boleto || '',
    boleto_encontrado: boletoEncontrado,
    boleto_status: boletoEncontrado ? 'encontrado' : 'sem_boleto',
    boleto_match_confidence: boletoEncontrado
      ? Math.max(Number(payload?.boleto_match_confidence || 0), 100)
      : Number(payload?.boleto_match_confidence || 0),
  };
};

const normalizeBillingCenterResponse = (data) => {
  const mapped = Array.isArray(data?.items) ? data.items.map((item) => normalizeBillingPayload(item)) : [];
  return {
    ...data,
    items: mapped,
  };
};

export async function getBillingAutomationOverview(companyId) {
  if (!companyId) {
    return {
      company_id: '',
      summary: {
        enviados_hoje: 0,
        preventivos: 0,
        vencimento: 0,
        atraso: 0,
        erros: 0,
        boletos_nao_encontrados: 0,
      },
      rows: [],
      sync: null,
    };
  }

  return invokeBillingAutomation(
    {
      action: 'overview',
      company_id: companyId,
    },
    'Falha ao carregar o painel de cobranca automatica.'
  );
}

export async function runBillingAutomationNow(companyId, options = {}) {
  const simulate = options.simulate === true ? true : false;

  if (!companyId) {
    throw new Error('Selecione uma empresa especifica para enviar as cobrancas.');
  }

  if (!simulate) {
    const gate = await checkSendPermission(companyId, 'automatic', 1);
    if (gate?.allowed === false) {
      throw new Error(gate.message || 'A assinatura da empresa nao permite envios automaticos reais agora.');
    }
  }

  const body = {
    action: 'run_now',
    companyId,
    company_id: companyId,
    manual: true,
    simulate,
  };


  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const { data, error } = await supabase.functions.invoke('billing-automation', { body });

  if (error) {
    throw buildError(error, 'Falha ao executar a regua de cobranca.');
  }

  const isSuccess = data?.ok === true || data?.success === true;
  const isFailure = data?.ok === false || data?.success === false;

  if (isFailure) {
    throw formatEdgeError(data, 'Falha ao executar a regua de cobranca.');
  }

  if (!isSuccess) {
    throw formatEdgeError(data, 'Falha ao executar a regua de cobranca.');
  }

  return data;
}

export async function sendSingleCharge(companyId, registroId, options = {}) {
  const simulate = options.simulate === true ? true : false;
  const customMessage = String(options.custom_message || options.message || '').trim();
  const forceResend = options.force_resend === true;

  if (!companyId) {
    throw new Error('Selecione uma empresa especifica para enviar a cobranca.');
  }

  if (!registroId) {
    throw new Error('Nenhum titulo valido foi informado para envio individual.');
  }

  if (!simulate) {
    const gate = await checkSendPermission(companyId, 'manual', 1);
    if (gate?.allowed === false) {
      throw new Error(gate.message || 'A assinatura da empresa nao permite envios manuais reais agora.');
    }
  }

  const payload = {
    action: 'send_single_charge',
    companyId,
    company_id: companyId,
    registro_id: registroId,
    charge_id: registroId,
    simulate,
    force_resend: forceResend,
    ...(customMessage ? { custom_message: customMessage, message: customMessage } : {}),
  };


  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  logger.info('send_single_requested', {
    company_id: companyId,
    registro_id: registroId,
    simulate,
    force_resend: forceResend,
    has_custom_message: Boolean(customMessage),
  });

  const { data, error } = await supabase.functions.invoke('billing-automation', { body: payload });

  if (error) {
    logger.error('send_single_failed_transport', error, { company_id: companyId, registro_id: registroId });
    throw buildError(error, 'Falha ao enviar a cobranca individual.');
  }

  const isSuccess = data?.ok === true || data?.success === true;
  const isFailure = data?.ok === false || data?.success === false;

  if (isFailure) {
    const errorResult = formatEdgeError(data, 'Falha ao enviar a cobranca individual.');
    errorResult.duplicate = data?.duplicate === true;
    errorResult.raw = data;
    errorResult.retry = withRetryMetadata(errorResult, Number(data?.retry_count || 0));
    logger.error('send_single_failed_response', errorResult, {
      company_id: companyId,
      registro_id: registroId,
      duplicate: errorResult.duplicate,
      retry: errorResult.retry,
    });
    throw errorResult;
  }

  if (!isSuccess) {
    const errorResult = formatEdgeError(data, 'Falha ao enviar a cobranca individual.');
    errorResult.duplicate = data?.duplicate === true;
    errorResult.raw = data;
    errorResult.retry = withRetryMetadata(errorResult, Number(data?.retry_count || 0));
    logger.error('send_single_failed_unknown', errorResult, {
      company_id: companyId,
      registro_id: registroId,
      retry: errorResult.retry,
    });
    throw errorResult;
  }

  logger.info('send_single_succeeded', {
    company_id: companyId,
    registro_id: registroId,
    simulated: data?.simulated === true,
  });
  return data;
}

export async function reprocessBillingFailures(companyId) {
  return invokeBillingAutomation(
    {
      action: 'reprocess_failures',
      company_id: companyId,
    },
    'Falha ao reprocessar falhas da cobranca.'
  );
}

export async function syncBillingDrive(companyId) {
  return invokeBillingAutomation(
    {
      action: 'sync_drive',
      company_id: companyId,
    },
    'Falha ao sincronizar boletos do Google Drive.'
  );
}

export async function syncBoletoDriveIntelligent(companyId, limit = 50) {
  return invokeBillingAutomation(
    {
      action: 'sync_boleto_drive_intelligent',
      company_id: companyId,
      limit,
    },
    'Falha ao executar a varredura inteligente de boletos.'
  );
}

export async function getBoletoSyncReport(companyId) {
  return invokeBillingAutomation(
    {
      action: 'get_boleto_sync_report',
      company_id: companyId,
    },
    'Falha ao carregar o relatorio do motor de boletos.'
  );
}

export async function reprocessBoletoDriveSingle(companyId, registroId) {
  if (!companyId) throw new Error('Selecione uma empresa para reprocessar.');
  if (!registroId) throw new Error('ID do registro nao informado.');
  return invokeBillingAutomation(
    {
      action: 'reprocess_boleto_drive_single',
      company_id: companyId,
      registro_id: registroId,
    },
    'Falha ao reprocessar o boleto no Google Drive.'
  );
}

export async function previewChargePayload(companyId, registroId) {
  const data = await invokeBillingAutomation(
    {
      action: 'preview_charge_payload',
      company_id: companyId,
      registro_id: registroId,
    },
    'Falha ao montar a previa do payload de cobranca.'
  );
  return {
    ...data,
    payload: normalizeBillingPayload(data?.payload || {}),
  };
}

export async function prepareManualCharge(companyId, registroId) {
  const data = await invokeBillingAutomation(
    {
      action: 'prepare_manual_charge',
      company_id: companyId,
      registro_id: registroId,
    },
    'Falha ao preparar o envio manual assistido.'
  );
  return {
    ...data,
    payload: normalizeBillingPayload(data?.payload || {}),
  };
}

export async function sendRealCharge(companyId, items = []) {
  const gate = await checkSendPermission(companyId, 'batch_manual', Math.max(1, items.length || 1));
  if (gate?.allowed === false) {
    throw new Error(gate.message || 'A assinatura da empresa nao permite envio em lote real neste momento.');
  }

  const data = await invokeBillingAutomation(
    {
      action: 'send_real',
      company_id: companyId,
      items,
    },
    'Falha ao enviar a cobranca real pelo WhatsApp.'
  );

  return {
    ...data,
    sent: Array.isArray(data?.sent) ? data.sent.map((item) => normalizeBillingPayload(item || {})) : [],
    failed: Array.isArray(data?.failed) ? data.failed.map((item) => normalizeBillingPayload(item || {})) : [],
  };
}

export async function syncBillingSheet(companyId) {
  return invokeBillingAutomation(
    {
      action: 'sync_sheet',
      company_id: companyId,
    },
    'Falha ao sincronizar a planilha financeira.'
  );
}

export async function getDriveConfig(companyId) {
  return invokeBillingAutomation(
    {
      action: 'get_drive_config',
      company_id: companyId,
    },
    'Falha ao carregar a configuracao do Google Drive.'
  );
}

export async function getBillingConfig(companyId) {
  return invokeBillingAutomation(
    {
      action: 'get_billing_rules',
      company_id: companyId,
    },
    'Falha ao carregar a configuracao da regua.'
  );
}

export async function saveBillingConfig(companyId, config) {
  return invokeBillingAutomation(
    {
      action: 'save_billing_rules',
      company_id: companyId,
      config,
    },
    'Falha ao salvar a configuracao da regua.'
  );
}

export async function getBillingRules(companyId) {
  return getBillingConfig(companyId);
}

export async function saveBillingRules(companyId, config) {
  return saveBillingConfig(companyId, config);
}

export async function saveDriveConfig(companyId, driveRootFolderId) {
  return invokeBillingAutomation(
    {
      action: 'save_drive_config',
      company_id: companyId,
      drive_root_folder_id: driveRootFolderId,
    },
    'Falha ao salvar a pasta do Google Drive.'
  );
}

export async function saveDriveConfigFull(companyId, config = {}) {
  return invokeBillingAutomation(
    {
      action: 'save_drive_config',
      company_id: companyId,
      drive_root_folder_id: config.drive_root_folder_id || '',
      drive_recursive_scan: config.drive_recursive_scan ?? false,
      drive_matching_strategy: config.drive_matching_strategy || 'auto',
      drive_max_depth: config.drive_max_depth ?? 2,
      drive_folder_name: config.drive_folder_name || '',
    },
    'Falha ao salvar a configuracao do Google Drive.'
  );
}

export async function testDriveConnection(companyId) {
  return invokeBillingAutomation(
    {
      action: 'test_drive_connection',
      company_id: companyId,
    },
    'Falha ao testar a conexao com o Google Drive.'
  );
}

export async function testBoletoLookup(companyId, query) {
  const data = await invokeBillingAutomation(
    {
      action: 'test_boleto_lookup',
      company_id: companyId,
      query,
    },
    'Falha ao testar a busca de boleto no Drive.'
  );

  return {
    ...data,
    results: normalizeDriveLookupResults(data?.results || data || []),
  };
}

export async function getDriveFolderStructure(companyId) {
  return invokeBillingAutomation(
    {
      action: 'get_drive_folder_structure',
      company_id: companyId,
    },
    'Falha ao carregar a estrutura de pastas do Drive.'
  );
}

export async function extractFolderIdFromUrl(companyId, url) {
  return invokeBillingAutomation(
    {
      action: 'extract_folder_id',
      company_id: companyId,
      url,
    },
    'Falha ao extrair o ID da pasta do Drive.'
  );
}

export async function getBillingCenter(companyId) {
  const data = await invokeBillingAutomation(
    {
      action: 'get_billing_center',
      company_id: companyId,
    },
    'Falha ao carregar a central de cobranca.'
  );
  return normalizeBillingCenterResponse(data);
}

export async function getBillingHistory(companyId, filters = {}, pagination = {}) {
  return invokeBillingAutomation(
    {
      action: 'get_billing_history',
      company_id: companyId,
      filters,
      page: pagination.page,
      page_size: pagination.page_size,
    },
    'Falha ao carregar o historico de cobrancas.'
  );
}

export async function getBillingInconsistencies(companyId, filters = {}) {
  return invokeBillingAutomation(
    {
      action: 'get_billing_inconsistencies',
      company_id: companyId,
      filters,
    },
    'Falha ao carregar o painel de inconsistencias.'
  );
}

export async function getPlanCapabilities(companyId) {
  return invokeBillingAutomation(
    {
      action: 'get_plan_capabilities',
      company_id: companyId,
    },
    'Falha ao carregar as capacidades do plano.'
  );
}

export async function getUsageSummary(companyId) {
  return invokeBillingAutomation(
    {
      action: 'get_usage_summary',
      company_id: companyId,
    },
    'Falha ao carregar o resumo de uso do plano.'
  );
}

export async function checkSendPermission(companyId, sendType, quantity = 1) {
  return invokeBillingAutomation(
    {
      action: 'check_send_permission',
      company_id: companyId,
      send_type: sendType,
      quantity,
    },
    'Falha ao validar a permissao de envio.'
  );
}

export async function getRealSendChecklist(companyId) {
  return invokeBillingAutomation(
    {
      action: 'get_real_send_checklist',
      company_id: companyId,
    },
    'Falha ao carregar o checklist pre-envio.'
  );
}

export async function simulateChargeBatch(companyId, limit = 10) {
  return invokeBillingAutomation(
    {
      action: 'simulate_charge_batch',
      company_id: companyId,
      limit,
    },
    'Falha ao rodar a simulacao geral da regua.'
  );
}

export async function simulateChargeItem(companyId, registroId) {
  return invokeBillingAutomation(
    {
      action: 'simulate_charge_item',
      company_id: companyId,
      registro_id: registroId,
    },
    'Falha ao simular a cobranca do titulo.'
  );
}

export async function updateChargeStatus(companyId, registroId, status) {
  return invokeBillingAutomation(
    {
      action: 'update_charge_status',
      company_id: companyId,
      registro_id: registroId,
      status,
    },
    'Falha ao atualizar o status da cobranca.'
  );
}

export async function updateFinancialPhone(companyId, registroId, telefone) {
  return invokeBillingAutomation(
    {
      action: 'update_financial_phone',
      company_id: companyId,
      registro_id: registroId,
      telefone,
    },
    'Falha ao atualizar o telefone do registro.'
  );
}

export async function previewBillingTemplate(companyId, template, sample = {}) {
  return invokeBillingAutomation(
    {
      action: 'preview_template',
      company_id: companyId,
      template,
      sample,
    },
    'Falha ao testar o template da regua.'
  );
}


export default {
  getBillingAutomationOverview,
  runBillingAutomationNow,
  sendSingleCharge,
  reprocessBillingFailures,
  syncBillingDrive,
  syncBoletoDriveIntelligent,
  getBoletoSyncReport,
  previewChargePayload,
  prepareManualCharge,
  sendRealCharge,
  syncBillingSheet,
  getDriveConfig,
  getBillingConfig,
  saveBillingConfig,
  getBillingRules,
  saveBillingRules,
  saveDriveConfig,
  testDriveConnection,
  getBillingCenter,
  getBillingHistory,
  getBillingInconsistencies,
  reprocessBoletoDriveSingle,
  getPlanCapabilities,
  getUsageSummary,
  checkSendPermission,
  updateChargeStatus,
  updateFinancialPhone,
  getRealSendChecklist,
  simulateChargeBatch,
  simulateChargeItem,
  previewBillingTemplate,
};
