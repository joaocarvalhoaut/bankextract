/**
 * BankExtract Pro — Google Sheets Service (Frontend)
 *
 * IMPORTANTE: Este serviço NUNCA armazena ou expõe credenciais do Google.
 * Toda autenticação com o Google acontece na Edge Function (backend).
 * O frontend apenas chama a Edge Function via supabase.functions.invoke().
 */

import { supabase } from './supabaseClient';

const buildError = (err, fallback) => {
  if (err instanceof Error) return err;
  return new Error(err?.message || err?.error || fallback);
};

// ---------------------------------------------------------------------------
// getGoogleSheetsConfig
// Busca a configuração Google Sheets de uma empresa.
// Retorna null se não houver config cadastrada.
// ---------------------------------------------------------------------------
export async function getGoogleSheetsConfig(empresaId) {
  if (!empresaId || !supabase) return null;

  const { data, error } = await supabase
    .from('google_sheets_config')
    .select('id, empresa_id, spreadsheet_id, sheet_name, ativo, updated_at')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (error) {
    throw buildError(error, 'Falha ao carregar configuração do Google Sheets.');
  }

  return data || null;
}

// ---------------------------------------------------------------------------
// saveGoogleSheetsConfig
// Cria ou atualiza a configuração Google Sheets de uma empresa (upsert).
// ---------------------------------------------------------------------------
export async function saveGoogleSheetsConfig(empresaId, spreadsheetId, sheetName) {
  if (!supabase) {
    throw new Error('Supabase não configurado.');
  }

  const trimmedSpreadsheetId = String(spreadsheetId || '').trim();
  const trimmedSheetName = String(sheetName || '').trim() || 'Página1';

  if (!trimmedSpreadsheetId) {
    throw new Error('Informe o ID da planilha Google Sheets.');
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
    .select('id, empresa_id, spreadsheet_id, sheet_name, ativo, updated_at')
    .single();

  if (error) {
    throw buildError(error, 'Falha ao salvar configuração do Google Sheets.');
  }

  return data;
}

// ---------------------------------------------------------------------------
// testGoogleSheetsConnection
// Chama a Edge Function em modo de teste (test_only: true).
// Não escreve dados — apenas valida se a planilha e aba são acessíveis.
// ---------------------------------------------------------------------------
export async function testGoogleSheetsConnection(empresaId) {
  if (!supabase) {
    throw new Error('Supabase não configurado.');
  }

  if (!empresaId) {
    throw new Error('Nenhuma empresa ativa selecionada.');
  }

  const { data, error } = await supabase.functions.invoke('sync-google-sheets', {
    body: { empresa_id: empresaId, test_only: true },
  });

  if (error) {
    throw buildError(error, 'Falha ao testar conexão com Google Sheets.');
  }

  if (!data?.ok) {
    throw new Error(data?.error || 'Resposta inesperada da Edge Function.');
  }

  return data;
}

// ---------------------------------------------------------------------------
// syncGoogleSheets
// Sincroniza os registros financeiros da empresa com a planilha configurada.
// Limpa a aba e reescreve todos os dados.
// ---------------------------------------------------------------------------
export async function syncGoogleSheets(empresaId) {
  if (!supabase) {
    throw new Error('Supabase não configurado.');
  }

  if (!empresaId) {
    throw new Error('Nenhuma empresa ativa selecionada para sincronizar.');
  }

  const { data, error } = await supabase.functions.invoke('sync-google-sheets', {
    body: { empresa_id: empresaId },
  });

  if (error) {
    throw buildError(error, 'Falha ao sincronizar com Google Sheets.');
  }

  if (!data?.ok) {
    throw new Error(data?.error || 'Sincronização retornou resposta inesperada.');
  }

  return data;
}
