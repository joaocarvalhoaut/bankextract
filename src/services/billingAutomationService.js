import { supabase } from './supabaseClient';

const buildError = (err, fallback) => {
  if (err instanceof Error) return err;
  return new Error(err?.message || err?.error || fallback);
};

const invokeBillingAutomation = async (body, fallbackMessage) => {
  if (!supabase) {
    throw new Error('Supabase não configurado.');
  }

  const { data, error } = await supabase.functions.invoke('billing-automation', { body });

  if (error) {
    throw buildError(error, fallbackMessage);
  }

  if (!data?.ok) {
    throw new Error(data?.error || fallbackMessage);
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
    'Falha ao carregar o painel de cobrança automática.'
  );
}

export async function runBillingAutomationNow(companyId) {
  return invokeBillingAutomation(
    {
      action: 'run',
      company_id: companyId,
    },
    'Falha ao executar a régua de cobrança.'
  );
}

export async function reprocessBillingFailures(companyId) {
  return invokeBillingAutomation(
    {
      action: 'reprocess_failures',
      company_id: companyId,
    },
    'Falha ao reprocessar falhas da cobrança.'
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
    'Falha ao carregar a configuração do Google Drive.'
  );
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
    'Falha ao testar a conexão com o Google Drive.'
  );
}
