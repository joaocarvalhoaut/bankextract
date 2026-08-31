import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  RESULT_LEVELS,
  createResult,
  getEnvValue,
  loadEnvironment,
  maskPhone,
  maskSecret,
  parseArgs,
  printReport,
  sanitizeErrorMessage,
  toBoolean,
} from './_shared/diagnostic-core.js';

function buildFunctionUrl(supabaseUrl, fnName) {
  return `${String(supabaseUrl || '').replace(/\/$/, '')}/functions/v1/${fnName}`;
}

function createClients(env) {
  const supabaseUrl = getEnvValue(env, 'SUPABASE_URL', ['VITE_SUPABASE_URL']);
  const anonKey = getEnvValue(env, 'SUPABASE_ANON_KEY', ['VITE_SUPABASE_ANON_KEY']);
  const serviceRoleKey = getEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY', ['SERVICE_ROLE_KEY']);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY sao obrigatorios para o diagnostico.');
  }
  return {
    admin: createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } }),
    anon: createClient(supabaseUrl, anonKey, { auth: { persistSession: false } }),
  };
}

async function invokeGatewayAction(env, action, extraBody = {}) {
  const supabaseUrl = getEnvValue(env, 'SUPABASE_URL', ['VITE_SUPABASE_URL']);
  const gatewaySecret = getEnvValue(env, 'GATEWAY_ADMIN_SECRET');
  const accessToken = String(extraBody.__access_token || '').trim();
  delete extraBody.__access_token;
  if (!supabaseUrl || (!gatewaySecret && !accessToken)) {
    throw new Error('SUPABASE_URL/VITE_SUPABASE_URL e autenticacao (GATEWAY_ADMIN_SECRET ou JWT admin) sao obrigatorios para o diagnostico global.');
  }

  const response = await fetch(buildFunctionUrl(supabaseUrl, 'billing-automation'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(gatewaySecret ? { 'x-gateway-admin-secret': gatewaySecret } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      action,
      ...extraBody,
    }),
  });

  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Resposta invalida da function billing-automation: ${text.slice(0, 200)}`);
  }

  if (!response.ok || !(data?.ok === true || data?.success === true)) {
    throw new Error(String(data?.error || `Falha ao executar ${action}.`));
  }

  return data;
}

async function getPlatformRow(admin) {
  if (!admin) return null;
  const { data, error } = await admin
    .from('platform_integrations')
    .select('provider, instance_id, token, client_token, connected, phone_number, connected_at, last_healthcheck_at, metadata')
    .eq('provider', 'zapi')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function ensureDiagnosticAdminSession(env, admin, anon) {
  const email = getEnvValue(env, 'E2E_TEST_EMAIL') || 'e2e.whatsapp@ncfinance.local';
  const password = getEnvValue(env, 'E2E_TEST_PASSWORD') || 'NcFinance!2026';
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = existing?.users?.find((row) => String(row.email || '').toLowerCase() === email.toLowerCase()) || null;
  const authUser = user
    ? await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true }).then(() => user)
    : await admin.auth.admin.createUser({ email, password, email_confirm: true }).then(({ data, error }) => {
      if (error || !data?.user) throw new Error(error?.message || 'Falha ao criar usuario diagnostico.');
      return data.user;
    });

  const { error: adminError } = await admin
    .from('system_admins')
    .upsert({ user_id: authUser.id, email }, { onConflict: 'user_id' });
  if (adminError) throw new Error(adminError.message || 'Falha ao registrar diagnostico em system_admins.');

  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !signInData?.session?.access_token) {
    throw new Error(signInError?.message || 'Falha ao autenticar usuario diagnostico.');
  }
  return signInData.session.access_token;
}

function buildMockPdfBase64() {
  const content = '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF';
  return Buffer.from(content, 'utf8').toString('base64');
}

function buildDocumentPayload(mockNumber, fileName, base64) {
  return {
    phone: mockNumber,
    fileName,
    mimeType: 'application/pdf',
    caption: 'Diagnostico Z-API - dry run',
    base64,
  };
}

export async function runDiagnostic(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const env = loadEnvironment({ cwd: rootDir });
  const dryRun = toBoolean(options['dry-run'] ?? options.dryRun ?? env.DIAGNOSTIC_DRY_RUN, true);
  const mockNumber = String(options['mock-number'] || options.mockNumber || env.TEST_RECIPIENT_PHONE || '5511999999999').replace(/\D/g, '');
  const maxBytes = Math.max(1024, Number(options['max-bytes'] || env.ZAPI_DOCUMENT_MAX_BYTES || 10485760));
  const { admin, anon } = createClients(env);
  const results = [];
  let accessToken = '';

  try {
    accessToken = await ensureDiagnosticAdminSession(env, admin, anon);
  } catch (error) {
    results.push(
      createResult(
        RESULT_LEVELS.ERROR,
        `Falha ao preparar sessao admin para diagnostico: ${sanitizeErrorMessage(error)}`,
        'Revisar credenciais locais e disponibilidade do Supabase Auth.',
      ),
    );
  }

  let initPayload = null;
  try {
    initPayload = await invokeGatewayAction(env, 'init_global_whatsapp_gateway', { __access_token: accessToken });
    results.push(
      createResult(
        RESULT_LEVELS.OK,
        `Gateway global inicializado com fonte ${String(initPayload.config_source || 'desconhecida')}.`,
        'Prosseguir para validacao de conexao e payload.',
      ),
    );
  } catch (error) {
    results.push(
      createResult(
        RESULT_LEVELS.ERROR,
        `Falha ao inicializar o gateway global: ${sanitizeErrorMessage(error)}`,
        'Configurar GATEWAY_ADMIN_SECRET local e a secret remota correspondente antes do smoke.',
      ),
    );
  }

  let platformRow = null;
  try {
    platformRow = await getPlatformRow(admin);
  } catch (error) {
    results.push(
      createResult(
        RESULT_LEVELS.WARNING,
        `Falha ao ler platform_integrations: ${sanitizeErrorMessage(error)}`,
        'Revisar SERVICE_ROLE_KEY/SUPABASE_URL locais.',
      ),
    );
  }

  const instanceId = String(platformRow?.instance_id || '').trim();
  const token = String(platformRow?.token || '').trim();
  const clientToken = String(platformRow?.client_token || '').trim();
  const phoneNumber = String(initPayload?.phone_number || platformRow?.phone_number || '').trim();
  const connected = Boolean(initPayload?.connected ?? platformRow?.connected);
  const connectedPendingPhone = Boolean(initPayload?.connected_pending_phone ?? (connected && !phoneNumber));
  const stateLabel = connected
    ? (phoneNumber ? 'CONECTADO_COM_NUMERO' : 'CONECTADO_AGUARDANDO_NUMERO')
    : 'DESCONECTADO';

  results.push(
    createResult(
      instanceId && token && clientToken ? RESULT_LEVELS.OK : RESULT_LEVELS.ERROR,
      instanceId && token && clientToken
        ? `Credenciais Z-API globais localizadas para instancia ${maskSecret(instanceId)}.`
        : 'Credenciais Z-API globais incompletas em platform_integrations.',
      instanceId && token && clientToken
        ? 'Credenciais prontas para handshake.'
        : 'Bootstrap do gateway nao preencheu instance/token/client token.',
    ),
  );

  results.push(
    createResult(
      connected ? RESULT_LEVELS.OK : RESULT_LEVELS.ERROR,
      `Estado de conexao do gateway: ${stateLabel}.`,
      connected
        ? (connectedPendingPhone ? 'Aguardar sincronizacao do numero ou validar endpoint secundario de status.' : 'Instancia pronta para piloto.')
        : 'Reconectar a instancia Z-API antes do E2E live.',
      {
        connected_pending_phone: connectedPendingPhone,
        phone_number_masked: maskPhone(phoneNumber),
      },
    ),
  );

  const base64 = buildMockPdfBase64();
  buildDocumentPayload(mockNumber, 'diagnostico-boleto.pdf', base64);
  const estimatedBytes = Buffer.byteLength(base64, 'base64');
  results.push(
    createResult(
      estimatedBytes <= maxBytes ? RESULT_LEVELS.OK : RESULT_LEVELS.ERROR,
      `Payload de documento montado com ${estimatedBytes} byte(s) e numero mock ${maskPhone(mockNumber)}.`,
      estimatedBytes <= maxBytes
        ? 'Payload dentro do limite configurado.'
        : `Reduzir anexo ou aumentar ZAPI_DOCUMENT_MAX_BYTES (atual ${maxBytes}).`,
    ),
  );

  results.push(
    createResult(
      base64.length > 0 ? RESULT_LEVELS.OK : RESULT_LEVELS.ERROR,
      'Geracao base64 de PDF sintetico concluida.',
      'Nenhuma acao imediata.',
    ),
  );

  if (dryRun) {
    results.push(
      createResult(
        RESULT_LEVELS.OK,
        'dry-run=true: nenhum envio real foi executado; somente bootstrap, handshake e montagem de payload.',
        'Desligar dry-run apenas apos o report E2E ficar limpo.',
      ),
    );
  }

  return printReport('Diagnostico WhatsApp Z-API', results, {
    dry_run: dryRun,
    config_source: String(initPayload?.config_source || platformRow?.metadata?.source || 'desconhecida'),
    mock_number: maskPhone(mockNumber),
    state: stateLabel,
    phone_number_masked: maskPhone(phoneNumber),
  });
}

const isCli = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const args = parseArgs();
  runDiagnostic({ rootDir: process.cwd(), ...args }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
