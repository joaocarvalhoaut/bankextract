/**
 * BankExtract Pro — Edge Function: sync-google-sheets
 *
 * Sincroniza os registros financeiros de uma empresa com uma planilha
 * Google Sheets configurada pela própria empresa.
 *
 * Secrets necessários (configurar via Supabase Dashboard > Edge Functions > Secrets):
 *   GOOGLE_CLIENT_EMAIL  — e-mail da Service Account
 *   GOOGLE_PRIVATE_KEY   — chave privada RSA (com \n real, não escapado)
 *   GOOGLE_PROJECT_ID    — project ID do Google Cloud (opcional, mas recomendado)
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface SyncRequest {
  empresa_id: string;
  test_only?: boolean; // Se true, apenas valida acesso sem escrever dados
}

interface GoogleSheetsConfig {
  id: string;
  empresa_id: string;
  spreadsheet_id: string;
  sheet_name: string;
  ativo: boolean;
}

interface RegistroFinanceiro {
  id: string;
  nome: string;
  numero_boleto: string | null;
  data_vencimento: string | null;
  valor: number;
  representante_nome?: string | null;
  telefone: string | null;
  observacao: string | null;
  status: string;
  liquidado_em: string | null;
  empresa_nome?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

// ---------------------------------------------------------------------------
// Google Auth — Service Account JWT + OAuth2 token
// ---------------------------------------------------------------------------
async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Importar chave privada PEM para CryptoKey
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');

  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const jwt = `${signingInput}.${signatureB64}`;

  // Trocar JWT por access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Falha ao obter token Google: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

// ---------------------------------------------------------------------------
// Google Sheets API helpers
// ---------------------------------------------------------------------------

/**
 * Escapa o nome da aba para uso em ranges da Sheets API.
 * Nomes com espaços, acentos ou caracteres especiais precisam de aspas simples.
 * Aspas simples internas são duplicadas conforme a especificação do Google.
 * Exemplo: "Página 1" → "'Página 1'"  |  "O'Neil" → "'O''Neil'"
 */
function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

async function clearSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  const safeSheetName = quoteSheetName(sheetName);
  const range = encodeURIComponent(`${safeSheetName}!A:M`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Falha ao limpar aba "${sheetName}": ${err}`);
  }
}

async function writeSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  values: (string | number | null)[][]
): Promise<void> {
  const safeSheetName = quoteSheetName(sheetName);
  const range = encodeURIComponent(`${safeSheetName}!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Falha ao escrever dados na aba "${sheetName}": ${err}`);
  }
}

async function getSheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<{ title: string; sheets: string[] }> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Planilha não encontrada ou sem permissão: ${err}`);
  }

  const data = await res.json();
  return {
    title: data.properties?.title ?? '',
    sheets: (data.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title),
  };
}

// ---------------------------------------------------------------------------
// Formatação dos dados
// ---------------------------------------------------------------------------
const HEADERS = [
  'Nome',
  'NumeroBoleto',
  'DataVencimento',
  'Valor',
  'Juros',
  'Multa',
  'ValorAtualizado',
  'Telefone',
  'Observacao',
  'Representante',
  'Status',
  'DataPagamento',
  'Empresa',
];

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcJurosMulta(
  valor: number,
  dataVencimento: string | null,
  status: string,
  multaPercentual: number,
  jurosPercentualDia: number
): { juros: number; multa: number; valorAtualizado: number } {
  const hoje = new Date();
  const venc = dataVencimento ? new Date(dataVencimento) : null;
  const vencido = venc && venc < hoje && status !== 'liquidado';

  if (!vencido) {
    return { juros: 0, multa: 0, valorAtualizado: valor };
  }

  const diasAtraso = Math.max(0, Math.floor((hoje.getTime() - venc!.getTime()) / 86_400_000));
  const multa = valor * (multaPercentual / 100);
  const juros = valor * (jurosPercentualDia / 100) * diasAtraso;
  return { juros, multa, valorAtualizado: valor + juros + multa };
}

function buildRows(
  registros: RegistroFinanceiro[],
  empresaNome: string,
  multaPercentual: number,
  jurosPercentualDia: number
): (string | number)[][] {
  return registros.map((r) => {
    const { juros, multa, valorAtualizado } = calcJurosMulta(
      r.valor,
      r.data_vencimento,
      r.status,
      multaPercentual,
      jurosPercentualDia
    );

    return [
      r.nome ?? '',
      r.numero_boleto ?? '',
      formatDate(r.data_vencimento),
      formatCurrency(r.valor),
      formatCurrency(juros),
      formatCurrency(multa),
      formatCurrency(valorAtualizado),
      r.telefone ?? '',
      r.observacao ?? '',
      r.representante_nome ?? '',
      r.status ?? '',
      formatDate(r.liquidado_em),
      r.empresa_nome ?? empresaNome,
    ];
  });
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Método não permitido. Use POST.', 405);
  }

  // ── 1. Autenticação via JWT ──────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Token de autenticação ausente.', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Cliente com o JWT do usuário (respeita RLS)
  const userClient = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Cliente com service role (para queries globais e join com system_admins)
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  // Obter usuário autenticado
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return errorResponse('Usuário não autenticado.', 401);
  }

  // ── 2. Ler body ──────────────────────────────────────────────────────────
  let body: SyncRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Body JSON inválido.');
  }

  const { empresa_id, test_only = false } = body;

  if (!empresa_id || typeof empresa_id !== 'string') {
    return errorResponse('empresa_id é obrigatório.');
  }

  // ── 3. Verificar permissão ───────────────────────────────────────────────
  const { data: adminRow } = await adminClient
    .from('system_admins')
    .select('id')
    .or(`user_id.eq.${user.id},email.eq.${user.email}`)
    .maybeSingle();

  const isSystemAdmin = Boolean(adminRow?.id);

  if (!isSystemAdmin) {
    // Usuário comum: verificar vínculo com a empresa
    const { data: membership } = await adminClient
      .from('usuarios_empresas')
      .select('id')
      .eq('user_id', user.id)
      .eq('company_id', empresa_id)
      .maybeSingle();

    if (!membership) {
      return errorResponse('Você não tem permissão para sincronizar esta empresa.', 403);
    }
  }

  // ── 4. Buscar configuração Google Sheets da empresa ──────────────────────
  const { data: sheetsConfig, error: configError } = await adminClient
    .from('google_sheets_config')
    .select('*')
    .eq('empresa_id', empresa_id)
    .eq('ativo', true)
    .maybeSingle<GoogleSheetsConfig>();

  if (configError) {
    return errorResponse(`Falha ao buscar configuração: ${configError.message}`, 500);
  }

  if (!sheetsConfig) {
    return errorResponse('Nenhuma configuração Google Sheets encontrada para esta empresa. Configure a integração primeiro.', 404);
  }

  // ── 5. Carregar secrets do Google ─────────────────────────────────────────
  const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
  const privateKeyRaw = Deno.env.get('GOOGLE_PRIVATE_KEY');

  if (!clientEmail || !privateKeyRaw) {
    return errorResponse('Credenciais do Google não configuradas nos secrets da Edge Function.', 500);
  }

  // O Supabase secrets armazena \n como literal — precisamos converter para newlines reais
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  // ── 6. Obter access token do Google ──────────────────────────────────────
  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(clientEmail, privateKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Falha de autenticação com Google: ${msg}`, 502);
  }

  // ── 7. Modo teste — apenas validar acesso ────────────────────────────────
  if (test_only) {
    try {
      const meta = await getSheetMetadata(accessToken, sheetsConfig.spreadsheet_id);
      const sheetExists = meta.sheets.includes(sheetsConfig.sheet_name);
      return jsonResponse({
        ok: true,
        test_only: true,
        spreadsheet_title: meta.title,
        sheet_exists: sheetExists,
        available_sheets: meta.sheets,
        message: sheetExists
          ? `Conexão OK. Planilha "${meta.title}", aba "${sheetsConfig.sheet_name}" encontrada.`
          : `Planilha acessível, mas a aba "${sheetsConfig.sheet_name}" não existe. Crie-a ou altere o nome na configuração.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(`Teste de conexão falhou: ${msg}`, 502);
    }
  }

  // ── 8. Buscar dados da empresa ────────────────────────────────────────────
  const { data: empresaRow, error: empresaError } = await adminClient
    .from('empresas')
    .select('id, nome')
    .eq('id', empresa_id)
    .maybeSingle();

  if (empresaError || !empresaRow) {
    return errorResponse('Empresa não encontrada.', 404);
  }

  const empresaNome: string = empresaRow.nome;

  // Buscar configuração de juros/multa da empresa
  const { data: configFinanceiro } = await adminClient
    .from('configuracoes_financeiras')
    .select('multa_percentual, juros_percentual_dia')
    .eq('company_id', empresa_id)
    .maybeSingle();

  const multaPercentual = Number(configFinanceiro?.multa_percentual ?? 2);
  const jurosPercentualDia = Number(configFinanceiro?.juros_percentual_dia ?? 0.033);

  // Buscar registros financeiros com join de representante
  const { data: registrosData, error: registrosError } = await adminClient
    .from('registros_financeiros')
    .select(`
      id,
      nome,
      numero_boleto,
      data_vencimento,
      valor,
      telefone,
      observacao,
      status,
      liquidado_em,
      representante_id,
      representantes (nome)
    `)
    .eq('company_id', empresa_id)
    .order('data_vencimento', { ascending: true });

  if (registrosError) {
    return errorResponse(`Falha ao buscar registros: ${registrosError.message}`, 500);
  }

  // Mapear registros com nome do representante
  const registros: RegistroFinanceiro[] = (registrosData ?? []).map((r) => ({
    id: r.id,
    nome: r.nome,
    numero_boleto: r.numero_boleto,
    data_vencimento: r.data_vencimento,
    valor: Number(r.valor ?? 0),
    representante_nome: (r.representantes as { nome?: string } | null)?.nome ?? null,
    telefone: r.telefone,
    observacao: r.observacao,
    status: r.status ?? 'pendente',
    liquidado_em: r.liquidado_em,
    empresa_nome: empresaNome,
  }));

  // ── 9. Escrever na planilha ───────────────────────────────────────────────
  try {
    await clearSheet(accessToken, sheetsConfig.spreadsheet_id, sheetsConfig.sheet_name);

    const dataRows = buildRows(registros, empresaNome, multaPercentual, jurosPercentualDia);
    const allRows = [HEADERS, ...dataRows];

    await writeSheet(accessToken, sheetsConfig.spreadsheet_id, sheetsConfig.sheet_name, allRows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Falha ao escrever na planilha: ${msg}`, 502);
  }

  // ── 10. Atualizar updated_at da config ────────────────────────────────────
  await adminClient
    .from('google_sheets_config')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sheetsConfig.id);

  await adminClient
    .from('audit_logs')
    .insert({
      company_id: empresa_id,
      user_id: user.id,
      action: 'google_sheets_sync',
      entity: 'google_sheets_config',
      entity_id: sheetsConfig.id,
      metadata: {
        spreadsheet_id: sheetsConfig.spreadsheet_id,
        sheet_name: sheetsConfig.sheet_name,
        registros_enviados: registros.length,
      },
    })
    .then(() => {})
    .catch(() => {});

  return jsonResponse({
    ok: true,
    empresa: empresaNome,
    registros_enviados: registros.length,
    spreadsheet_id: sheetsConfig.spreadsheet_id,
    sheet_name: sheetsConfig.sheet_name,
    message: `${registros.length} registro(s) sincronizado(s) com sucesso na planilha de ${empresaNome}.`,
  });
});
