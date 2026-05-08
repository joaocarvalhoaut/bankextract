/**
 * BankExtract Pro - Google Sheets Service (Frontend)
 *
 * IMPORTANTE: Este servico nunca armazena ou expoe credenciais do Google.
 * Toda autenticacao com o Google continua acontecendo nas Edge Functions.
 */

import { supabase } from './supabaseClient';
import { getDriveBoletosConfig } from './googleDriveService';

const buildError = (err, fallback) => {
  if (err instanceof Error) return err;
  return new Error(err?.message || err?.error || fallback);
};

const getStartOfTodayIso = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
};

function toFriendlyGoogleSheetsError(err, fallback) {
  const error = buildError(err, fallback);
  const rawMessage = String(error?.message || fallback || '').trim();
  const normalized = rawMessage
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  let code = 'UNKNOWN_ERROR';
  let userMessage = fallback || 'Falha ao processar a integracao com Google Sheets.';

  if (
    normalized.includes('credenciais do google nao configuradas') ||
    normalized.includes('falha de autenticacao com google') ||
    normalized.includes('google_client_email') ||
    normalized.includes('google_private_key')
  ) {
    code = 'GOOGLE_NOT_CONFIGURED';
    userMessage = 'Google nao configurado no servidor.';
  } else if (
    normalized.includes('nenhuma configuracao google sheets encontrada') ||
    normalized.includes('id da planilha google sheets') ||
    normalized.includes('nenhuma planilha foi selecionada') ||
    normalized.includes('configure a integracao primeiro')
  ) {
    code = 'SPREADSHEET_NOT_SELECTED';
    userMessage = 'Nenhuma planilha foi selecionada.';
  } else if (
    normalized.includes('aba') &&
    (normalized.includes('nao existe') || normalized.includes('nao foi encontrada'))
  ) {
    code = 'SHEET_NOT_FOUND';
    userMessage = 'A aba informada nao existe na planilha.';
  } else if (
    normalized.includes('sem permissao') ||
    normalized.includes('nao tem permissao') ||
    normalized.includes('planilha nao encontrada ou sem permissao') ||
    normalized.includes('voce nao tem permissao')
  ) {
    code = 'PERMISSION_DENIED';
    userMessage = 'A conta tecnica nao tem permissao para acessar essa planilha.';
  }

  const friendlyError = new Error(userMessage);
  friendlyError.code = code;
  friendlyError.rawMessage = rawMessage;
  friendlyError.userMessage = userMessage;
  return friendlyError;
}

function normalizeGoogleSheetsStatus(config = {}) {
  if (!config) {
    return { status: 'not_configured', label: 'Nao configurado' };
  }

  if (!config.spreadsheet_id) {
    return { status: 'missing_spreadsheet', label: 'Planilha nao selecionada' };
  }

  if (!config.sheet_name) {
    return { status: 'missing_sheet', label: 'Aba nao selecionada' };
  }

  if (config.syncing) {
    return { status: 'syncing', label: 'Sincronizando' };
  }

  if (config.last_source_sync_status === 'error' || config.last_source_sync_error) {
    return { status: 'error', label: 'Erro de conexao' };
  }

  if (config.ativo) {
    return { status: 'connected', label: 'Conectado' };
  }

  return { status: 'not_configured', label: 'Nao configurado' };
}

export async function getGoogleSheetsConfig(empresaId) {
  if (!empresaId || !supabase) return null;

  const { data, error } = await supabase
    .from('google_sheets_config')
    .select('id, empresa_id, spreadsheet_id, sheet_name, ativo, created_at, updated_at, last_source_sync_at, last_source_sync_status, last_source_sync_error')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (error) {
    throw toFriendlyGoogleSheetsError(error, 'Falha ao carregar configuracao do Google Sheets.');
  }

  return data || null;
}

export async function getGoogleSheetsStatus(empresaId) {
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  if (!empresaId) {
    throw new Error('Nenhuma empresa ativa selecionada.');
  }

  const startOfTodayIso = getStartOfTodayIso();

  const [configRes, todayRecordsRes, latestImportRes, driveMeta] = await Promise.all([
    supabase
      .from('google_sheets_config')
      .select('id, empresa_id, spreadsheet_id, sheet_name, ativo, created_at, updated_at, last_source_sync_at, last_source_sync_status, last_source_sync_error')
      .eq('empresa_id', empresaId)
      .maybeSingle(),
    supabase
      .from('registros_financeiros')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', empresaId)
      .gte('created_at', startOfTodayIso),
    supabase
      .from('importacoes')
      .select('id, arquivo, tipo, registros, valor_total, created_at')
      .eq('company_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getDriveBoletosConfig(empresaId).catch(() => null),
  ]);

  if (configRes.error) {
    throw toFriendlyGoogleSheetsError(configRes.error, 'Falha ao carregar o status do Google Sheets.');
  }

  if (todayRecordsRes.error) {
    throw toFriendlyGoogleSheetsError(todayRecordsRes.error, 'Falha ao carregar os registros do dia.');
  }

  if (latestImportRes.error) {
    throw toFriendlyGoogleSheetsError(latestImportRes.error, 'Falha ao carregar a ultima importacao.');
  }

  const config = configRes.data || null;
  const normalizedStatus = normalizeGoogleSheetsStatus(config);

  return {
    config,
    ...normalizedStatus,
    spreadsheet_id: config?.spreadsheet_id || '',
    sheet_name: config?.sheet_name || 'Pagina1',
    ativo: Boolean(config?.ativo),
    updated_at: config?.updated_at || '',
    created_at: config?.created_at || '',
    last_source_sync_at: config?.last_source_sync_at || '',
    last_source_sync_status: config?.last_source_sync_status || '',
    last_source_sync_error: config?.last_source_sync_error || '',
    records_today: todayRecordsRes.count || 0,
    last_import_at: latestImportRes.data?.created_at || '',
    last_import_file: latestImportRes.data?.arquivo || '',
    last_import_type: latestImportRes.data?.tipo || '',
    last_import_records: latestImportRes.data?.registros || 0,
    last_import_value: latestImportRes.data?.valor_total || 0,
    service_account_email: driveMeta?.service_account_email || '',
    source_spreadsheet_id: driveMeta?.source_spreadsheet_id || driveMeta?.spreadsheet_id || config?.spreadsheet_id || '',
    source_sheet_name: driveMeta?.source_sheet_name || driveMeta?.sheet_name || config?.sheet_name || '',
  };
}

export async function saveGoogleSheetsConfig(empresaId, spreadsheetId, sheetName) {
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const trimmedSpreadsheetId = String(spreadsheetId || '').trim();
  const trimmedSheetName = String(sheetName || '').trim() || 'Pagina1';

  if (!trimmedSpreadsheetId) {
    throw new Error('Nenhuma planilha foi selecionada.');
  }

  if (!empresaId) {
    throw new Error('Nenhuma empresa ativa selecionada.');
  }

  const { data, error } = await supabase
    .from('google_sheets_config')
    .upsert(
      {
        empresa_id: empresaId,
        spreadsheet_id: trimmedSpreadsheetId,
        sheet_name: trimmedSheetName,
        ativo: true,
      },
      { onConflict: 'empresa_id' }
    )
    .select('id, empresa_id, spreadsheet_id, sheet_name, ativo, created_at, updated_at, last_source_sync_at, last_source_sync_status, last_source_sync_error')
    .single();

  if (error) {
    throw toFriendlyGoogleSheetsError(error, 'Falha ao salvar configuracao do Google Sheets.');
  }

  return data;
}

export async function testGoogleSheetsConnection(empresaId) {
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  if (!empresaId) {
    throw new Error('Nenhuma empresa ativa selecionada.');
  }

  const { data, error } = await supabase.functions.invoke('sync-google-sheets', {
    body: { empresa_id: empresaId, test_only: true },
  });

  if (error) {
    throw toFriendlyGoogleSheetsError(error, 'Falha ao testar conexao.');
  }

  if (!data?.ok) {
    throw toFriendlyGoogleSheetsError(data, 'Falha ao testar conexao.');
  }

  return data;
}

export async function syncGoogleSheets(empresaId) {
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  if (!empresaId) {
    throw new Error('Nenhuma empresa ativa selecionada para sincronizar.');
  }

  const { data, error } = await supabase.functions.invoke('sync-google-sheets', {
    body: { empresa_id: empresaId },
  });

  if (error) {
    throw toFriendlyGoogleSheetsError(error, 'Falha ao sincronizar com Google Sheets.');
  }

  if (!data?.ok) {
    throw toFriendlyGoogleSheetsError(data, 'Falha ao sincronizar com Google Sheets.');
  }

  return data;
}

export async function syncGoogleSheetsNow(empresaId) {
  return syncGoogleSheets(empresaId);
}

export { normalizeGoogleSheetsStatus, toFriendlyGoogleSheetsError };
