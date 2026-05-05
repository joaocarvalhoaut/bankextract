import { createClient } from 'jsr:@supabase/supabase-js@2';

type AdminClient = ReturnType<typeof createClient>;

interface BillingConfigRow {
  empresa_id: string;
  ativo: boolean;
  hora_execucao: string | null;
  mensagem_template: string | null;
  template_preventiva: string | null;
  template_vencimento: string | null;
  template_atraso: string | null;
  regua_atraso: unknown;
}

interface SheetsConfigRow {
  empresa_id: string;
  spreadsheet_id: string | null;
  sheet_name: string | null;
  source_spreadsheet_id: string | null;
  source_sheet_name: string | null;
  drive_root_folder_id: string | null;
  last_source_sync_at: string | null;
  last_source_sync_status: string | null;
  last_source_sync_error: string | null;
}

interface FinancialRow {
  id: string;
  company_id: string;
  nome: string;
  cliente_nome: string | null;
  cliente_numero: string | null;
  telefone: string | null;
  documento: string | null;
  numero_boleto: string | null;
  numero_nf: string | null;
  valor: number;
  data_vencimento: string;
  status: string;
  drive_file_id: string | null;
  preventiva_enviada: boolean | null;
  data_envio_preventiva: string | null;
  cobranca_vencimento_enviada: boolean | null;
  data_envio_vencimento: string | null;
  ultima_cobranca: string | null;
  tentativas_cobranca: number | null;
}

interface DriveCandidate {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPEN_STATUSES = new Set(['em_aberto', 'aberto', 'pendente', 'vencido']);
const CLOSED_STATUSES = new Set(['pago', 'liquidado', 'cancelado', 'negociado', 'negociacao']);
const DEFAULT_RULES = [1, 3, 5, 10, 15, 30];
const DEFAULT_EXECUTION_TIME = '08:00';
function normalizeFinancialStatus(value: string | null | undefined) {
  const status = normalizeText(value);
  if (status === 'pago') return 'liquidado';
  if (status === 'negociado') return 'negociacao';
  if (status === 'em_aberto') return 'pendente';
  if (status === 'cancelado') return 'cancelado';
  if (status === 'liquidado') return 'liquidado';
  if (status === 'aberto') return 'aberto';
  if (status === 'vencido') return 'vencido';
  if (status === 'negociacao') return 'negociacao';
  return 'pendente';
}

const DEFAULT_PREVENTIVA_TEMPLATE = `Olá, {cliente_nome},

Aqui é Lucas, do setor de cobrança da Orthomax.

Passando para lembrar que o boleto referente ao documento {documento} vence amanhã ({vencimento}), no valor de R$ {valor}.

Segue o boleto anexo para facilitar o pagamento.

Caso já tenha efetuado o pagamento, desconsidere esta mensagem.

Atenciosamente,
Setor de Cobrança Orthomax`;

const DEFAULT_VENCIMENTO_TEMPLATE = `Olá, {cliente_nome},

Aqui é Lucas, do setor de cobrança da Orthomax.

Passando para lembrar que hoje é o vencimento do documento {documento}, no valor de R$ {valor}.

Segue novamente o boleto anexo.

Caso já tenha realizado o pagamento, desconsidere esta mensagem.

Atenciosamente,
Setor de Cobrança Orthomax`;

const DEFAULT_ATRASO_TEMPLATE = `Olá, {cliente_nome},

Aqui é Lucas, do setor de cobrança da Orthomax.

Estou entrando em contato para confirmar o pagamento do documento abaixo:

Documento: {documento}
Vencimento: {vencimento}
Valor: R$ {valor}

Este boleto está com {dias_atraso} dia(s) de atraso.

Informamos que após 5 dias do vencimento poderá haver protesto e encargos adicionais.

Segue boleto anexo.

Caso já tenha efetuado o pagamento, desconsidere esta mensagem.

Atenciosamente,
Setor de Cobrança Orthomax`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeDriveName(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .toUpperCase();
}

function normalizePhone(raw: string | null | undefined) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function validatePhone(phone: string) {
  return /^55\d{10,11}$/.test(phone);
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDate(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function formatDateBR(value: string | null | undefined) {
  const date = parseDate(value);
  if (!date) return String(value || '');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function currentTimeInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('hour')}:${get('minute')}`;
}

function isoDaysDiff(target: string, baseIso: string) {
  const base = parseDate(baseIso);
  const date = parseDate(target);
  if (!base || !date) return null;
  return Math.floor((date.getTime() - base.getTime()) / 86400000);
}

function extractRuleDays(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_RULES;
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0);
}

function resolveTemplate(config: BillingConfigRow | null, type: 'preventiva' | 'vencimento' | 'atraso') {
  const generic = config?.mensagem_template || '';
  if (type === 'preventiva') return config?.template_preventiva || generic || DEFAULT_PREVENTIVA_TEMPLATE;
  if (type === 'vencimento') return config?.template_vencimento || generic || DEFAULT_VENCIMENTO_TEMPLATE;
  return config?.template_atraso || generic || DEFAULT_ATRASO_TEMPLATE;
}

function fillTemplate(template: string, record: FinancialRow, diasAtraso: number) {
  return template
    .replaceAll('{cliente_nome}', record.cliente_nome || record.nome || 'Cliente')
    .replaceAll('{documento}', record.documento || record.numero_boleto || '-')
    .replaceAll('{vencimento}', formatDateBR(record.data_vencimento))
    .replaceAll('{valor}', formatCurrency(record.valor))
    .replaceAll('{dias_atraso}', String(diasAtraso))
    .replaceAll('{numero_boleto}', record.numero_boleto || '-')
    .replaceAll('{numero_nf}', record.numero_nf || '-');
}

async function sha256Hex(value: string) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function getGoogleAccessToken() {
  const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || '';
  const privateKey = (Deno.env.get('GOOGLE_PRIVATE_KEY') || '').replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error('Google API não configurada. Defina GOOGLE_CLIENT_EMAIL e GOOGLE_PRIVATE_KEY.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const pemBody = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binaryDer = Uint8Array.from(atob(pemBody), (char) => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signatureB64}`,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Falha ao autenticar Google API: ${await tokenRes.text()}`);
  }

  const tokenData = await tokenRes.json();
  return String(tokenData.access_token || '');
}

function requireEnvSecret(name: string) {
  const value = Deno.env.get(name) || '';
  if (!value) {
    throw new Error(`Secret ${name} não configurado`);
  }
  return value;
}

function requireCompanyId(companyId: string | null) {
  if (!companyId) {
    throw new Error('company_id é obrigatório');
  }
  return companyId;
}

function requireDriveFolderId(folderId: string | null | undefined) {
  const value = String(folderId || '').trim();
  if (!value) {
    throw new Error('drive_root_folder_id não configurado para esta empresa');
  }
  return value;
}

async function googleJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.json() as T;
}

async function getDriveFileMetadata(token: string, fileId: string) {
  return await googleJson<DriveCandidate>(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,parents`,
    token,
  );
}

async function ensureConfiguredFolderId(
  folderId: string | null | undefined,
  companyId: string,
) {
  if (folderId) return folderId;
  throw new Error(`Nenhuma pasta do Google Drive configurada para a empresa ${companyId}.`);
}

async function getDriveFolderInfo(token: string, folderId: string) {
  const folder = await getDriveFileMetadata(token, folderId);
  if (folder.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('O ID informado não pertence a uma pasta do Google Drive.');
  }
  return folder;
}

async function countPdfFilesInFolder(token: string, folderId: string) {
  const query = encodeURIComponent(`'${folderId}' in parents and mimeType='application/pdf' and trashed=false`);
  const data = await googleJson<{ files?: DriveCandidate[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1000`,
    token,
  );
  return data.files?.length || 0;
}

async function searchDriveFiles(token: string, folderId: string, record: FinancialRow) {
  if (record.drive_file_id) {
    const file = await getDriveFileMetadata(token, record.drive_file_id).catch(() => null);
    if (file?.id && file.parents?.includes(folderId)) {
      return [file];
    }
  }

  const boleto = String(record.numero_boleto || '').trim();
  const normalizedName = normalizeDriveName(record.cliente_nome || record.nome || '');
  const candidates = [
    boleto ? `${boleto}.pdf` : '',
    boleto && normalizedName ? `${normalizedName}_${boleto}.pdf` : '',
  ].filter(Boolean);

  const results: DriveCandidate[] = [];

  for (const candidateName of candidates) {
    const escapedName = candidateName.replace(/'/g, "\\'");
    const queryParts = [`name='${escapedName}'`, 'trashed=false'];
    queryParts.push(`'${folderId}' in parents`);
    const query = encodeURIComponent(queryParts.join(' and '));
    const data = await googleJson<{ files?: DriveCandidate[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType)&pageSize=5`,
      token,
    );
    if (data.files?.length) {
      return data.files;
    }
  }

  const fuzzySearches = [
    boleto ? [`fullText contains '${boleto.replace(/'/g, "\\'")}'`] : [],
    normalizedName ? [`fullText contains '${normalizedName.replace(/'/g, "\\'")}'`] : [],
  ].filter((parts) => parts.length);

  for (const queryParts of fuzzySearches) {
    queryParts.push(`'${folderId}' in parents`);
    queryParts.push('trashed=false');
    const data = await googleJson<{ files?: DriveCandidate[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(queryParts.join(' and '))}&fields=files(id,name,mimeType)&pageSize=10`,
      token,
    );
    if (data.files?.length) {
      results.push(...data.files);
      break;
    }
  }

  return results;
}

async function downloadDriveFileBase64(token: string, fileId: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function readSheetRows(token: string, spreadsheetId: string, sheetName: string) {
  const safeRange = encodeURIComponent(`${sheetName}!A:Z`);
  const data = await googleJson<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${safeRange}`,
    token,
  );
  return data.values || [];
}

function mapSheetRows(values: string[][]) {
  if (!values.length) return [];
  const headers = values[0].map((header) => normalizeText(header));

  const read = (row: string[], aliases: string[]) => {
    const index = headers.findIndex((header) => aliases.includes(header));
    return index >= 0 ? row[index] || '' : '';
  };

  return values.slice(1).map((row) => ({
    cliente_nome: read(row, ['cliente_nome', 'cliente', 'nome']),
    telefone: read(row, ['telefone', 'celular']),
    cliente_numero: read(row, ['cliente_numero', 'codigo_cliente', 'cliente_num']),
    documento: read(row, ['documento', 'numero_documento']),
    numero_boleto: read(row, ['numero_boleto', 'boleto']),
    numero_nf: read(row, ['numero_nf', 'nf', 'nota_fiscal']),
    valor: read(row, ['valor', 'valor_titulo']),
    vencimento: read(row, ['vencimento', 'data_vencimento']),
    status: read(row, ['status']),
  })).filter((row) => row.documento || row.numero_boleto || row.cliente_numero);
}

function toIsoDateString(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
}

async function syncSheetForCompany(supabaseAdmin: AdminClient, companyId: string, token: string) {
  try {
    const { data: config } = await supabaseAdmin
      .from('google_sheets_config')
      .select('empresa_id, spreadsheet_id, sheet_name, source_spreadsheet_id, source_sheet_name')
      .eq('empresa_id', companyId)
      .maybeSingle();

    const spreadsheetId = config?.source_spreadsheet_id || config?.spreadsheet_id;
    const sheetName = config?.source_sheet_name || config?.sheet_name;

    if (!spreadsheetId || !sheetName) {
      throw new Error('Configure a planilha financeira em google_sheets_config antes de sincronizar.');
    }

    const rawRows = await readSheetRows(token, spreadsheetId, sheetName);
    const mappedRows = mapSheetRows(rawRows);

    const existingRows = await supabaseAdmin
      .from('registros_financeiros')
      .select('id, company_id, cliente_numero, documento, numero_boleto')
      .eq('company_id', companyId);

    const existingMap = new Map(
      (existingRows.data || []).map((row) => [
        `${row.company_id}:${row.cliente_numero || ''}:${row.documento || ''}`,
        row.id,
      ]),
    );

    let imported = 0;
    let updated = 0;

    for (const row of mappedRows) {
      const dataVencimento = toIsoDateString(row.vencimento);
      if (!dataVencimento) continue;

      const key = `${companyId}:${row.cliente_numero || ''}:${row.documento || ''}`;
      const payload = {
        company_id: companyId,
        nome: row.cliente_nome || 'Cliente',
        cliente_nome: row.cliente_nome || 'Cliente',
        cliente_numero: row.cliente_numero || null,
        telefone: row.telefone || '',
        documento: row.documento || null,
        numero_boleto: row.numero_boleto || null,
        numero_nf: row.numero_nf || null,
        valor: Number(String(row.valor || '0').replace(/\./g, '').replace(',', '.')) || 0,
        data_vencimento: dataVencimento,
        status: normalizeFinancialStatus(row.status),
      };

      const existingId = existingMap.get(key);
      if (existingId) {
        const { error } = await supabaseAdmin
          .from('registros_financeiros')
          .update(payload)
          .eq('id', existingId)
          .eq('company_id', companyId);
        if (error) throw new Error(error.message);
        updated += 1;
      } else {
        const { error } = await supabaseAdmin.from('registros_financeiros').insert(payload);
        if (error) throw new Error(error.message);
        imported += 1;
      }
    }

    await supabaseAdmin
      .from('google_sheets_config')
      .update({
        last_source_sync_at: new Date().toISOString(),
        last_source_sync_status: 'success',
        last_source_sync_error: null,
      })
      .eq('empresa_id', companyId);

    return { imported, updated, total_rows: mappedRows.length };
  } catch (error) {
    await supabaseAdmin
      .from('google_sheets_config')
      .update({
        last_source_sync_at: new Date().toISOString(),
        last_source_sync_status: 'error',
        last_source_sync_error: error instanceof Error ? error.message : 'Falha ao sincronizar planilha.',
      })
      .eq('empresa_id', companyId);

    throw error;
  }
}

async function getSheetsDriveConfig(supabaseAdmin: AdminClient, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from('google_sheets_config')
    .select('empresa_id, spreadsheet_id, sheet_name, source_spreadsheet_id, source_sheet_name, drive_root_folder_id, last_source_sync_at, last_source_sync_status, last_source_sync_error')
    .eq('empresa_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as SheetsConfigRow | null;
}

async function saveDriveConfigForCompany(
  supabaseAdmin: AdminClient,
  companyId: string,
  driveRootFolderId: string,
) {
  requireCompanyId(companyId);
  const folderId = String(driveRootFolderId || '').trim();
  if (!folderId) {
    throw new Error('Informe o ID da pasta do Google Drive.');
  }

  const existingConfig = await getSheetsDriveConfig(supabaseAdmin, companyId);

  const payload = {
    empresa_id: companyId,
    drive_root_folder_id: folderId,
    spreadsheet_id: existingConfig?.spreadsheet_id ?? null,
    sheet_name: existingConfig?.sheet_name ?? null,
    source_spreadsheet_id: existingConfig?.source_spreadsheet_id ?? null,
    source_sheet_name: existingConfig?.source_sheet_name ?? null,
    ativo: true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('google_sheets_config')
    .upsert(payload, { onConflict: 'empresa_id' });

  if (error) throw new Error(error.message);

  return await getSheetsDriveConfig(supabaseAdmin, companyId);
}

async function getBillingConfigForCompany(
  supabaseAdmin: AdminClient,
  companyId: string,
) {
  requireCompanyId(companyId);
  const { data, error } = await supabaseAdmin
    .from('whatsapp_cobranca_config')
    .select('empresa_id, ativo, hora_execucao, hora_envio, mensagem_template, template_preventiva, template_vencimento, template_atraso, regua_atraso, intervalo_dias, cobrar_apos_dias_vencido, limite_cobrancas_por_titulo')
    .eq('empresa_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function saveBillingConfigForCompany(
  supabaseAdmin: AdminClient,
  companyId: string,
  payload: Record<string, unknown>,
) {
  requireCompanyId(companyId);
  const existing = await getBillingConfigForCompany(supabaseAdmin, companyId);
  const horario = String(payload?.hora_execucao || payload?.hora_envio || existing?.hora_execucao || existing?.hora_envio || DEFAULT_EXECUTION_TIME).trim() || DEFAULT_EXECUTION_TIME;

  const upsertPayload = {
    empresa_id: companyId,
    ativo: Boolean(payload?.ativo ?? existing?.ativo ?? false),
    hora_execucao: horario,
    hora_envio: horario,
    mensagem_template: String(payload?.mensagem_template ?? existing?.mensagem_template ?? DEFAULT_ATRASO_TEMPLATE),
    template_preventiva: String(payload?.template_preventiva ?? existing?.template_preventiva ?? DEFAULT_PREVENTIVA_TEMPLATE),
    template_vencimento: String(payload?.template_vencimento ?? existing?.template_vencimento ?? DEFAULT_VENCIMENTO_TEMPLATE),
    template_atraso: String(payload?.template_atraso ?? existing?.template_atraso ?? DEFAULT_ATRASO_TEMPLATE),
    regua_atraso: Array.isArray(payload?.regua_atraso) ? payload.regua_atraso : (existing?.regua_atraso ?? DEFAULT_RULES),
    intervalo_dias: Number(payload?.intervalo_dias ?? existing?.intervalo_dias ?? 5) || 5,
    cobrar_apos_dias_vencido: Number(payload?.cobrar_apos_dias_vencido ?? existing?.cobrar_apos_dias_vencido ?? 1) || 1,
    limite_cobrancas_por_titulo: Number(payload?.limite_cobrancas_por_titulo ?? existing?.limite_cobrancas_por_titulo ?? 4) || 4,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('whatsapp_cobranca_config')
    .upsert(upsertPayload, { onConflict: 'empresa_id' });

  if (error) throw new Error(error.message);
  return await getBillingConfigForCompany(supabaseAdmin, companyId);
}

async function testDriveConnectionForCompany(
  supabaseAdmin: AdminClient,
  companyId: string,
  token: string,
) {
  requireCompanyId(companyId);
  const config = await getSheetsDriveConfig(supabaseAdmin, companyId);
  const folderId = String(config?.drive_root_folder_id || '').trim();

  if (!folderId) {
    return {
      status: 'erro',
      folder_name: null,
      quantidade_arquivos_pdf: 0,
      mensagem_erro: 'Configure o ID da pasta do Google Drive antes de testar a conexão.',
      service_account_email: Deno.env.get('GOOGLE_CLIENT_EMAIL') || '',
      drive_root_folder_id: null,
    };
  }

  try {
    const folder = await getDriveFolderInfo(token, folderId);
    const pdfCount = await countPdfFilesInFolder(token, folderId);
    return {
      status: 'sucesso',
      folder_name: folder.name || null,
      quantidade_arquivos_pdf: pdfCount,
      mensagem_erro: null,
      service_account_email: Deno.env.get('GOOGLE_CLIENT_EMAIL') || '',
      drive_root_folder_id: folderId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao acessar a pasta do Google Drive.';
    const friendly = /File not found|insufficientFilePermissions|notFound|403|404/i.test(message)
      ? 'A pasta não está acessível. Compartilhe com a Service Account.'
      : message;
    return {
      status: 'erro',
      folder_name: null,
      quantidade_arquivos_pdf: 0,
      mensagem_erro: friendly,
      service_account_email: Deno.env.get('GOOGLE_CLIENT_EMAIL') || '',
      drive_root_folder_id: folderId,
    };
  }
}

async function syncDriveForCompany(supabaseAdmin: AdminClient, companyId: string, token: string) {
  requireCompanyId(companyId);
  const config = await getSheetsDriveConfig(supabaseAdmin, companyId);
  const folderId = requireDriveFolderId(await ensureConfiguredFolderId(config?.drive_root_folder_id, companyId));
  await getDriveFolderInfo(token, folderId).catch((error) => {
    const message = error instanceof Error ? error.message : 'Falha ao acessar pasta do Google Drive.';
    if (/File not found|insufficientFilePermissions|notFound|403|404/i.test(message)) {
      throw new Error('A pasta não está acessível. Compartilhe com a Service Account.');
    }
    throw error;
  });

  const { data: rows, error } = await supabaseAdmin
    .from('registros_financeiros')
    .select('id, company_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, status, drive_file_id')
    .eq('company_id', companyId)
    .is('drive_file_id', null);

  if (error) throw new Error(error.message);

  let linked = 0;
  let notFound = 0;

  for (const record of rows || []) {
    const candidates = await searchDriveFiles(token, folderId, {
      ...record,
      preventiva_enviada: false,
      data_envio_preventiva: null,
      cobranca_vencimento_enviada: false,
      data_envio_vencimento: null,
      ultima_cobranca: null,
      tentativas_cobranca: 0,
    } as FinancialRow);
    const file = candidates[0];
    if (!file?.id) {
      notFound += 1;
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from('registros_financeiros')
      .update({ drive_file_id: file.id })
      .eq('id', record.id)
      .eq('company_id', companyId);

    if (!updateError) linked += 1;
  }

  return { linked, not_found: notFound, folder_id: folderId };
}

async function sendZapiDocument(phone: string, caption: string, fileName: string, base64: string) {
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID') || '';
  const token = Deno.env.get('ZAPI_TOKEN') || '';
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';
  const documentEndpoint =
    Deno.env.get('ZAPI_DOCUMENT_ENDPOINT') ||
    (instanceId && token ? `https://api.z-api.io/instances/${instanceId}/token/${token}/send-file-base64` : '');

  if (!instanceId || !token || !clientToken || !documentEndpoint) {
    throw new Error('WhatsApp API não configurada. Defina ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN e, se necessário, ZAPI_DOCUMENT_ENDPOINT.');
  }

  const response = await fetch(documentEndpoint, {
    method: 'POST',
    headers: {
      'Client-Token': clientToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone,
      fileName,
      mimeType: 'application/pdf',
      caption,
      base64,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(String(data?.message || data?.error || `HTTP ${response.status}`));
  }

  return {
    provider_id: String(data?.zaapId || data?.messageId || ''),
    raw: data,
  };
}

async function insertLog(
  supabaseAdmin: AdminClient,
  payload: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin.from('logs_cobranca').insert(payload);
  if (error) throw new Error(error.message);
}

async function processChargeForRecord(
  supabaseAdmin: AdminClient,
  record: FinancialRow,
  config: BillingConfigRow | null,
  token: string,
  folderId: string,
  todayIso: string,
  force = false,
) {
  const normalizedStatus = normalizeText(record.status);
  if (CLOSED_STATUSES.has(normalizedStatus)) {
    return { status: 'ignorado', reason: 'status_fechado' };
  }

  if (!OPEN_STATUSES.has(normalizedStatus)) {
    return { status: 'ignorado', reason: 'status_fora_da_regua' };
  }

  const phone = normalizePhone(record.telefone);
  if (!validatePhone(phone)) {
    return { status: 'ignorado', reason: 'telefone_invalido' };
  }

  const diff = isoDaysDiff(record.data_vencimento, todayIso);
  if (diff === null) {
    return { status: 'ignorado', reason: 'vencimento_invalido' };
  }

  let tipo: 'preventiva' | 'vencimento' | 'atraso' | null = null;
  if (diff === 1 && !record.preventiva_enviada) tipo = 'preventiva';
  if (diff === 0 && !record.cobranca_vencimento_enviada) tipo = 'vencimento';
  if (diff < 0) {
    const atraso = Math.abs(diff);
    const rules = extractRuleDays(config?.regua_atraso);
    if (rules.includes(atraso)) tipo = 'atraso';
  }

  if (!tipo) {
    return { status: 'ignorado', reason: 'fora_da_regua' };
  }

  const diasAtraso = diff < 0 ? Math.abs(diff) : 0;
  const hash = await sha256Hex(`${record.cliente_numero || ''}|${record.documento || record.numero_boleto || ''}|${tipo}|${todayIso}`);

  if (!force) {
    const { data: duplicate } = await supabaseAdmin
      .from('logs_cobranca')
      .select('id')
      .eq('company_id', record.company_id)
      .eq('envio_hash', hash)
      .maybeSingle();

    if (duplicate?.id) {
      return { status: 'ignorado', reason: 'duplicado_no_dia' };
    }
  }

  const candidates = await searchDriveFiles(token, folderId, record);
  const file = candidates[0];

  if (!file?.id) {
    await insertLog(supabaseAdmin, {
      financeiro_id: record.id,
      company_id: record.company_id,
      cliente_nome: record.cliente_nome || record.nome,
      cliente_numero: record.cliente_numero,
      telefone: record.telefone,
      documento: record.documento,
      numero_boleto: record.numero_boleto,
      numero_nf: record.numero_nf,
      valor: record.valor,
      vencimento: record.data_vencimento,
      tipo_cobranca: tipo,
      dias_atraso: diasAtraso,
      arquivo_encontrado: false,
      drive_file_id: null,
      status_envio: 'erro',
      erro: 'boleto_nao_encontrado',
      payload: { company_id: record.company_id, record_id: record.id },
      envio_hash: hash,
    });
    return { status: 'erro', reason: 'boleto_nao_encontrado' };
  }

  const base64 = await downloadDriveFileBase64(token, file.id);
  const message = fillTemplate(resolveTemplate(config, tipo), record, diasAtraso);
  const sendResult = await sendZapiDocument(phone, message, file.name || `${record.numero_boleto || record.documento || record.id}.pdf`, base64);

  await supabaseAdmin.from('cobrancas_whatsapp').insert({
    empresa_id: record.company_id,
    registro_id: record.id,
    telefone: phone,
    mensagem: message,
    status: 'enviado',
    zapi_message_id: sendResult.provider_id || null,
    erro: null,
  });

  const updatePayload: Record<string, unknown> = {
    drive_file_id: record.drive_file_id || file.id,
  };

  if (tipo === 'preventiva') {
    updatePayload.preventiva_enviada = true;
    updatePayload.data_envio_preventiva = new Date().toISOString();
  } else if (tipo === 'vencimento') {
    updatePayload.cobranca_vencimento_enviada = true;
    updatePayload.data_envio_vencimento = new Date().toISOString();
  } else {
    updatePayload.ultima_cobranca = new Date().toISOString();
    updatePayload.tentativas_cobranca = Number(record.tentativas_cobranca || 0) + 1;
  }

  await supabaseAdmin
    .from('registros_financeiros')
    .update(updatePayload)
    .eq('id', record.id)
    .eq('company_id', record.company_id);

  await insertLog(supabaseAdmin, {
    financeiro_id: record.id,
    company_id: record.company_id,
    cliente_nome: record.cliente_nome || record.nome,
    cliente_numero: record.cliente_numero,
    telefone: phone,
    documento: record.documento,
    numero_boleto: record.numero_boleto,
    numero_nf: record.numero_nf,
    valor: record.valor,
    vencimento: record.data_vencimento,
    tipo_cobranca: tipo,
    dias_atraso: diasAtraso,
    arquivo_encontrado: true,
    drive_file_id: file.id,
    status_envio: 'sucesso',
    erro: null,
    payload: {
      company_id: record.company_id,
      record_id: record.id,
      provider_message_id: sendResult.provider_id,
      stage: tipo,
    },
    envio_hash: hash,
  });

  return { status: 'sucesso', tipo, fileId: file.id };
}

function explainRecordEligibility(
  record: FinancialRow,
  config: BillingConfigRow | null,
  todayIso: string,
) {
  const normalizedStatus = normalizeText(record.status);
  const phone = normalizePhone(record.telefone);
  const diff = isoDaysDiff(record.data_vencimento, todayIso);
  const rules = extractRuleDays(config?.regua_atraso);

  let etapa: 'preventiva' | 'vencimento' | 'atraso' | null = null;
  let motivo = '';

  if (CLOSED_STATUSES.has(normalizedStatus)) {
    motivo = 'status_fechado';
  } else if (!OPEN_STATUSES.has(normalizedStatus)) {
    motivo = 'status_fora_da_regua';
  } else if (!validatePhone(phone)) {
    motivo = 'telefone_invalido';
  } else if (diff === null) {
    motivo = 'vencimento_invalido';
  } else if (diff === 1 && record.preventiva_enviada) {
    motivo = 'preventiva_ja_enviada';
  } else if (diff === 0 && record.cobranca_vencimento_enviada) {
    motivo = 'vencimento_ja_enviado';
  } else if (diff === 1 && !record.preventiva_enviada) {
    etapa = 'preventiva';
  } else if (diff === 0 && !record.cobranca_vencimento_enviada) {
    etapa = 'vencimento';
  } else if (diff < 0) {
    const atraso = Math.abs(diff);
    if (rules.includes(atraso)) etapa = 'atraso';
    else motivo = 'fora_da_regua';
  } else {
    motivo = 'fora_da_regua';
  }

  return {
    etapa,
    motivo_nao_elegivel: motivo || null,
    dias_para_vencer: diff,
    dias_atraso: diff !== null && diff < 0 ? Math.abs(diff) : 0,
    status_aberto: OPEN_STATUSES.has(normalizedStatus) && !CLOSED_STATUSES.has(normalizedStatus),
    telefone_valido: validatePhone(phone),
    vencimento_parseado: diff !== null,
  };
}

async function getOverview(supabaseAdmin: AdminClient, companyId: string, todayIso: string) {
  const start = `${todayIso}T00:00:00-03:00`;
  const end = `${todayIso}T23:59:59-03:00`;

  const { data: rows, error } = await supabaseAdmin
    .from('logs_cobranca')
    .select('id, cliente_nome, documento, numero_boleto, telefone, tipo_cobranca, status_envio, erro, data_hora, arquivo_encontrado, created_at')
    .eq('company_id', companyId)
    .gte('data_hora', start)
    .lte('data_hora', end)
    .order('data_hora', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  const allRows = rows || [];
  return {
    summary: {
      enviados_hoje: allRows.filter((row) => row.status_envio === 'sucesso').length,
      preventivos: allRows.filter((row) => row.tipo_cobranca === 'preventiva' && row.status_envio === 'sucesso').length,
      vencimento: allRows.filter((row) => row.tipo_cobranca === 'vencimento' && row.status_envio === 'sucesso').length,
      atraso: allRows.filter((row) => row.tipo_cobranca === 'atraso' && row.status_envio === 'sucesso').length,
      erros: allRows.filter((row) => row.status_envio === 'erro').length,
      boletos_nao_encontrados: allRows.filter((row) => row.erro === 'boleto_nao_encontrado').length,
    },
    rows: allRows,
  };
}

async function assertCompanyAccess(
  admin: AdminClient,
  authClient: AdminClient,
  companyId: string | null,
  authHeader: string | null,
  cronSecret: string | null,
) {
  const expectedCronSecret = Deno.env.get('BILLING_CRON_SECRET') || '';
  if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
    return { userId: null, bypass: true };
  }

  if (!authHeader) {
    throw new Error('Nao autorizado.');
  }

  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData?.user) {
    throw new Error('Usuario nao autenticado.');
  }

  if (!companyId) {
    throw new Error('company_id e obrigatorio.');
  }

  const { data: adminRow } = await admin
    .from('system_admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (!adminRow?.user_id) {
    const { data: membership } = await admin
      .from('usuarios_empresas')
      .select('company_id')
      .eq('user_id', userData.user.id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!membership?.company_id) {
      throw new Error('Sem permissao para esta empresa.');
    }
  }

  return { userId: userData.user.id, bypass: false };
}

async function resolveTargetCompanies(admin: AdminClient, companyId: string | null, bypass: boolean) {
  if (companyId) return [companyId];
  if (!bypass) throw new Error('company_id e obrigatorio.');

  const { data, error } = await admin
    .from('whatsapp_cobranca_config')
    .select('empresa_id')
    .eq('ativo', true);

  if (error) throw new Error(error.message);
  return Array.from(new Set((data || []).map((row) => row.empresa_id).filter(Boolean)));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Metodo nao permitido.' }, 405);

  let action = 'overview';
  let companyId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = requireEnvSecret('SERVICE_ROLE_KEY');
    const authHeader = req.headers.get('Authorization');
    const cronSecret = req.headers.get('x-cron-secret');

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    });

    const body = await req.json().catch(() => ({}));
    action = String(body?.action || 'overview');
    companyId = body?.company_id ? String(body.company_id) : null;
    console.log('billing-automation request', { action, company_id: companyId });

    if (action === 'get_drive_config' || action === 'save_drive_config' || action === 'test_drive_connection' || action === 'sync_drive') {
      requireCompanyId(companyId);
      requireEnvSecret('GOOGLE_CLIENT_EMAIL');
      requireEnvSecret('GOOGLE_PRIVATE_KEY');
    }

    if (action === 'get_billing_config' || action === 'save_billing_config') {
      requireCompanyId(companyId);
    }

    const auth = await assertCompanyAccess(admin, authClient, companyId, authHeader, cronSecret);
    const todayIso = todayInSaoPaulo();
    const needsGoogleToken = [
      'get_drive_config',
      'save_drive_config',
      'test_drive_connection',
      'sync_drive',
      'sync_sheet',
      'run',
      'reprocess_failures',
    ].includes(action);
    const googleToken = needsGoogleToken ? await getGoogleAccessToken() : '';

    if (action === 'overview') {
      const overview = await getOverview(admin, companyId || '', todayIso);
      const sync = await getSheetsDriveConfig(admin, companyId || '');

      return jsonResponse({
        ok: true,
        company_id: companyId,
        ...overview,
        sync,
      });
    }

    if (action === 'get_drive_config') {
      requireCompanyId(companyId);
      const config = await getSheetsDriveConfig(admin, companyId || '');
      const connection = await testDriveConnectionForCompany(admin, companyId || '', googleToken);
      return jsonResponse({
        ok: true,
        company_id: companyId,
        drive_root_folder_id: config?.drive_root_folder_id || null,
        service_account_email: Deno.env.get('GOOGLE_CLIENT_EMAIL') || '',
        folder_name: connection.folder_name,
        status: connection.status,
        quantidade_arquivos_pdf: connection.quantidade_arquivos_pdf,
        mensagem_erro: connection.mensagem_erro,
      });
    }

    if (action === 'get_billing_config') {
      requireCompanyId(companyId);
      const config = await getBillingConfigForCompany(admin, companyId || '');
      return jsonResponse({
        ok: true,
        company_id: companyId,
        config: {
          ativo: Boolean(config?.ativo),
          hora_execucao: config?.hora_execucao || config?.hora_envio || DEFAULT_EXECUTION_TIME,
          hora_envio: config?.hora_envio || config?.hora_execucao || DEFAULT_EXECUTION_TIME,
          mensagem_template: config?.mensagem_template || DEFAULT_ATRASO_TEMPLATE,
          intervalo_dias: Number(config?.intervalo_dias || 5),
          cobrar_apos_dias_vencido: Number(config?.cobrar_apos_dias_vencido || 1),
          limite_cobrancas_por_titulo: Number(config?.limite_cobrancas_por_titulo || 4),
        },
      });
    }

    if (action === 'save_billing_config') {
      requireCompanyId(companyId);
      const savedConfig = await saveBillingConfigForCompany(admin, companyId || '', body?.config || {});

      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: auth.userId,
        action: 'billing_config_saved',
        entity: 'whatsapp_cobranca_config',
        metadata: {
          ativo: Boolean(savedConfig?.ativo),
          hora_execucao: savedConfig?.hora_execucao || savedConfig?.hora_envio || DEFAULT_EXECUTION_TIME,
        },
      }).then(() => {}).catch(() => {});

      return jsonResponse({
        ok: true,
        company_id: companyId,
        message: 'Configuração da régua salva com sucesso.',
        config: {
          ativo: Boolean(savedConfig?.ativo),
          hora_execucao: savedConfig?.hora_execucao || savedConfig?.hora_envio || DEFAULT_EXECUTION_TIME,
          hora_envio: savedConfig?.hora_envio || savedConfig?.hora_execucao || DEFAULT_EXECUTION_TIME,
          mensagem_template: savedConfig?.mensagem_template || DEFAULT_ATRASO_TEMPLATE,
          intervalo_dias: Number(savedConfig?.intervalo_dias || 5),
          cobrar_apos_dias_vencido: Number(savedConfig?.cobrar_apos_dias_vencido || 1),
          limite_cobrancas_por_titulo: Number(savedConfig?.limite_cobrancas_por_titulo || 4),
        },
      });
    }

    if (action === 'save_drive_config') {
      requireCompanyId(companyId);
      const driveRootFolderId = String(body?.drive_root_folder_id || '').trim();
      const savedConfig = await saveDriveConfigForCompany(admin, companyId || '', driveRootFolderId);
      const connection = await testDriveConnectionForCompany(admin, companyId || '', googleToken);

      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: auth.userId,
        action: 'billing_drive_config_saved',
        entity: 'google_sheets_config',
        metadata: {
          drive_root_folder_id: savedConfig?.drive_root_folder_id || null,
          status: connection.status,
        },
      }).then(() => {}).catch(() => {});

      return jsonResponse({
        ok: true,
        message: 'Pasta do Google Drive salva com sucesso.',
        company_id: companyId,
        drive_root_folder_id: savedConfig?.drive_root_folder_id || null,
        service_account_email: Deno.env.get('GOOGLE_CLIENT_EMAIL') || '',
        folder_name: connection.folder_name,
        status: connection.status,
        quantidade_arquivos_pdf: connection.quantidade_arquivos_pdf,
        mensagem_erro: connection.mensagem_erro,
      });
    }

    if (action === 'test_drive_connection') {
      requireCompanyId(companyId);
      const existingConfig = await getSheetsDriveConfig(admin, companyId || '');
      requireDriveFolderId(existingConfig?.drive_root_folder_id);
      const result = await testDriveConnectionForCompany(admin, companyId || '', googleToken);
      return jsonResponse({
        ok: true,
        company_id: companyId,
        ...result,
      });
    }

    if (action === 'sync_sheet') {
      const result = await syncSheetForCompany(admin, companyId || '', googleToken);
      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: auth.userId,
        action: 'billing_sheet_sync',
        entity: 'google_sheets_config',
        metadata: result,
      }).then(() => {}).catch(() => {});
      return jsonResponse({ ok: true, message: 'Planilha sincronizada com sucesso.', result });
    }

    if (action === 'sync_drive') {
      const result = await syncDriveForCompany(admin, companyId || '', googleToken);
      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: auth.userId,
        action: 'billing_drive_sync',
        entity: 'registros_financeiros',
        metadata: result,
      }).then(() => {}).catch(() => {});
      return jsonResponse({ ok: true, message: 'Drive sincronizado com sucesso.', result });
    }

    if (action === 'send_preview') {
      const payload = body?.payload || {};
      const phone = normalizePhone(payload.phone || payload.telefone);
      if (!validatePhone(phone)) {
        return jsonResponse({ ok: false, error: 'Telefone invalido.' }, 400);
      }
      if (body?.mode === 'text') {
        return jsonResponse({ ok: true, message: 'Preview validado. Use a régua ou o envio manual com mídia no backend.' });
      }
      return jsonResponse({ ok: true, message: 'Preview de mídia validado. O envio real acontece no backend da régua.' });
    }

    if (action === 'run' || action === 'reprocess_failures') {
      const companies = await resolveTargetCompanies(admin, companyId, auth.bypass);
      const nowTime = currentTimeInSaoPaulo();
      let sent = 0;
      let ignored = 0;
      let errors = 0;
      const companyResults: Array<{ company_id: string; sent: number; ignored: number; errors: number }> = [];
      const debugByCompany: Array<Record<string, unknown>> = [];

      for (const targetCompanyId of companies) {
        if (action === 'run') {
          await syncSheetForCompany(admin, targetCompanyId, googleToken).catch(() => null);
          await syncDriveForCompany(admin, targetCompanyId, googleToken).catch(() => null);
        }

        const { data: config } = await admin
          .from('whatsapp_cobranca_config')
          .select('empresa_id, ativo, hora_execucao, mensagem_template, template_preventiva, template_vencimento, template_atraso, regua_atraso')
          .eq('empresa_id', targetCompanyId)
          .maybeSingle();

        if (!config?.ativo && action === 'run') {
          companyResults.push({ company_id: targetCompanyId, sent: 0, ignored: 0, errors: 0 });
          debugByCompany.push({
            company_id: targetCompanyId,
            total_registros_encontrados: 0,
            total_status_aberto: 0,
            total_com_telefone: 0,
            total_com_vencimento: 0,
            total_preventiva: 0,
            total_vencimento: 0,
            total_atraso: 0,
            primeiros_registros: [],
            motivo_execucao: 'config_inativa',
          });
          continue;
        }

        const driveConfig = await getSheetsDriveConfig(admin, targetCompanyId);
        const folderId = String(driveConfig?.drive_root_folder_id || '').trim();
        if (!folderId) {
          companyResults.push({ company_id: targetCompanyId, sent: 0, ignored: 0, errors: 1 });
          debugByCompany.push({
            company_id: targetCompanyId,
            total_registros_encontrados: 0,
            total_status_aberto: 0,
            total_com_telefone: 0,
            total_com_vencimento: 0,
            total_preventiva: 0,
            total_vencimento: 0,
            total_atraso: 0,
            primeiros_registros: [],
            motivo_execucao: 'sem_drive_root_folder_id',
          });
          await admin.from('audit_logs').insert({
            company_id: targetCompanyId,
            user_id: auth.userId,
            action: 'billing_automation_skipped_no_drive_folder',
            entity: 'google_sheets_config',
            metadata: { company_id: targetCompanyId },
          }).then(() => {}).catch(() => {});
          errors += 1;
          continue;
        }
        try {
          await getDriveFolderInfo(googleToken, folderId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Falha ao acessar a pasta do Google Drive.';
          companyResults.push({ company_id: targetCompanyId, sent: 0, ignored: 0, errors: 1 });
          debugByCompany.push({
            company_id: targetCompanyId,
            total_registros_encontrados: 0,
            total_status_aberto: 0,
            total_com_telefone: 0,
            total_com_vencimento: 0,
            total_preventiva: 0,
            total_vencimento: 0,
            total_atraso: 0,
            primeiros_registros: [],
            motivo_execucao: 'drive_access_error',
          });
          await admin.from('audit_logs').insert({
            company_id: targetCompanyId,
            user_id: auth.userId,
            action: 'billing_automation_skipped_drive_access_error',
            entity: 'google_sheets_config',
            metadata: {
              company_id: targetCompanyId,
              error: /File not found|insufficientFilePermissions|notFound|403|404/i.test(message)
                ? 'A pasta não está acessível. Compartilhe com a Service Account.'
                : message,
            },
          }).then(() => {}).catch(() => {});
          errors += 1;
          continue;
        }

        const scheduledTime = config?.hora_execucao || DEFAULT_EXECUTION_TIME;
        if (action === 'run' && nowTime.slice(0, 2) !== scheduledTime.slice(0, 2)) {
          companyResults.push({ company_id: targetCompanyId, sent: 0, ignored: 0, errors: 0 });
          debugByCompany.push({
            company_id: targetCompanyId,
            total_registros_encontrados: 0,
            total_status_aberto: 0,
            total_com_telefone: 0,
            total_com_vencimento: 0,
            total_preventiva: 0,
            total_vencimento: 0,
            total_atraso: 0,
            primeiros_registros: [],
            motivo_execucao: 'hora_fora_da_janela',
          });
          continue;
        }

        const { data: records, error } = await admin
          .from('registros_financeiros')
          .select('id, company_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, status, drive_file_id, preventiva_enviada, data_envio_preventiva, cobranca_vencimento_enviada, data_envio_vencimento, ultima_cobranca, tentativas_cobranca')
          .eq('company_id', targetCompanyId)
          .order('data_vencimento', { ascending: true });

        if (error) throw new Error(error.message);

        let companySent = 0;
        let companyIgnored = 0;
        let companyErrors = 0;
        const explainedRecords = (records || []).map((record) => {
          const eligibility = explainRecordEligibility(record as FinancialRow, config as BillingConfigRow | null, todayIso);
          return {
            id: record.id,
            cliente_nome: record.cliente_nome || null,
            nome: record.nome || null,
            numero_boleto: record.numero_boleto || null,
            vencimento: record.data_vencimento || null,
            data_vencimento: record.data_vencimento || null,
            status: record.status || null,
            telefone: record.telefone || null,
            dias_para_vencer: eligibility.dias_para_vencer,
            dias_atraso: eligibility.dias_atraso,
            motivo_nao_elegivel: eligibility.motivo_nao_elegivel,
            etapa: eligibility.etapa,
            status_aberto: eligibility.status_aberto,
            telefone_valido: eligibility.telefone_valido,
            vencimento_parseado: eligibility.vencimento_parseado,
          };
        });

        debugByCompany.push({
          company_id: targetCompanyId,
          total_registros_encontrados: (records || []).length,
          total_status_aberto: explainedRecords.filter((row) => row.status_aberto).length,
          total_com_telefone: explainedRecords.filter((row) => row.telefone_valido).length,
          total_com_vencimento: explainedRecords.filter((row) => row.vencimento_parseado).length,
          total_preventiva: explainedRecords.filter((row) => row.etapa === 'preventiva').length,
          total_vencimento: explainedRecords.filter((row) => row.etapa === 'vencimento').length,
          total_atraso: explainedRecords.filter((row) => row.etapa === 'atraso').length,
          primeiros_registros: explainedRecords.slice(0, 10),
        });

        for (const record of records || []) {
          const outcome = await processChargeForRecord(
            admin,
            record as FinancialRow,
            config as BillingConfigRow | null,
            googleToken,
            folderId,
            todayIso,
            action === 'reprocess_failures',
          );
          if (outcome.status === 'sucesso') companySent += 1;
          else if (outcome.status === 'erro') companyErrors += 1;
          else companyIgnored += 1;
        }

        sent += companySent;
        ignored += companyIgnored;
        errors += companyErrors;
        companyResults.push({ company_id: targetCompanyId, sent: companySent, ignored: companyIgnored, errors: companyErrors });

        await admin.from('audit_logs').insert({
          company_id: targetCompanyId,
          user_id: auth.userId,
          action: action === 'run' ? 'billing_automation_run' : 'billing_automation_reprocess',
          entity: 'logs_cobranca',
          metadata: { sent: companySent, ignored: companyIgnored, errors: companyErrors, company_id: targetCompanyId },
        }).then(() => {}).catch(() => {});
      }

      const overview = companyId ? await getOverview(admin, companyId, todayIso) : null;

      return jsonResponse({
        ok: true,
        message: action === 'run' ? 'Régua executada com sucesso.' : 'Falhas reprocessadas com sucesso.',
        result: { sent, ignored, errors, companies: companyResults },
        debug: companyId
          ? (debugByCompany.find((item) => item.company_id === companyId) || null)
          : debugByCompany[0] || null,
        debug_by_company: debugByCompany,
        ...(overview || {}),
      });
    }

    return jsonResponse({ ok: false, error: 'Acao nao suportada.' }, 400);
  } catch (error) {
    console.error('billing-automation fatal error', {
      action,
      company_id: companyId,
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return jsonResponse(
      {
        ok: false,
        action,
        company_id: companyId,
        error: error instanceof Error ? error.message : 'Erro interno na billing-automation',
      },
      500,
    );
  }
});
