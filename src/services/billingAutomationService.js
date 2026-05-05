import { supabase } from './supabaseClient';

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
  return invokeBillingAutomation(
    {
      action: 'run',
      company_id: companyId,
      manual: true,
      simulate: options.simulate === true,
    },
    'Falha ao executar a regua de cobranca.'
  );
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

export async function testDriveConnection(companyId) {
  return invokeBillingAutomation(
    {
      action: 'test_drive_connection',
      company_id: companyId,
    },
    'Falha ao testar a conexao com o Google Drive.'
  );
}

export async function getBillingCenter(companyId) {
  return invokeBillingAutomation(
    {
      action: 'get_billing_center',
      company_id: companyId,
    },
    'Falha ao carregar a central de cobranca.'
  );
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
