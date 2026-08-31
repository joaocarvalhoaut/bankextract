import fs from 'node:fs';
import path from 'node:path';
import {
  createClient,
} from '@supabase/supabase-js';
import {
  getEnvValue,
  loadEnvironment,
  maskPhone,
  maskSecret,
  parseArgs,
} from './_shared/diagnostic-core.js';

function buildFunctionUrl(supabaseUrl, fnName) {
  return `${String(supabaseUrl || '').replace(/\/$/, '')}/functions/v1/${fnName}`;
}

function logCheck(state, label, details = '') {
  const suffix = details ? ` — ${details}` : '';
  console.log(`[${state}] ${label}${suffix}`);
}

function createClients(env) {
  const url = getEnvValue(env, 'SUPABASE_URL', ['VITE_SUPABASE_URL']);
  const anonKey = getEnvValue(env, 'SUPABASE_ANON_KEY', ['VITE_SUPABASE_ANON_KEY']);
  const serviceRoleKey = getEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY', ['SERVICE_ROLE_KEY']);
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY sao obrigatorios.');
  }

  return {
    url,
    anon: createClient(url, anonKey, { auth: { persistSession: false } }),
    admin: createClient(url, serviceRoleKey, { auth: { persistSession: false } }),
  };
}

async function invokeFunction(url, fnName, body, headers = {}) {
  const response = await fetch(buildFunctionUrl(url, fnName), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { ok: false, raw_text: text };
  }
  return { response, data, text };
}

async function ensureTestUser(admin, email, password) {
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = existing?.users?.find((user) => String(user.email || '').toLowerCase() === email.toLowerCase()) || null;
  if (found) {
    await admin.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
      user_metadata: { role: 'e2e_whatsapp' },
    });
    return found;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'e2e_whatsapp' },
  });
  if (error || !data?.user) {
    throw new Error(error?.message || 'Falha ao criar usuario de teste.');
  }
  return data.user;
}

async function ensureSystemAdmin(admin, userId, email) {
  const { error } = await admin
    .from('system_admins')
    .upsert({ user_id: userId, email }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message || 'Falha ao registrar system_admin.');
}

async function ensureMembership(admin, userId, companyId) {
  const { error } = await admin
    .from('usuarios_empresas')
    .upsert({ user_id: userId, company_id: companyId }, { onConflict: 'user_id,company_id' });
  if (error) throw new Error(error.message || 'Falha ao registrar membership de teste.');
}

async function signIn(anon, email, password) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    throw new Error(error?.message || 'Falha ao autenticar usuario de teste.');
  }
  return data.session;
}

async function bootstrapGateway(url, options = {}) {
  const headers = {};
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.gatewaySecret) headers['x-gateway-admin-secret'] = options.gatewaySecret;
  const { response, data } = await invokeFunction(url, 'billing-automation', {
    action: 'init_global_whatsapp_gateway',
  }, headers);

  if (!response.ok || !(data?.ok === true || data?.success === true)) {
    throw new Error(String(data?.error || 'Falha ao inicializar o gateway global.'));
  }

  return data;
}

async function getGatewayStatus(url, options = {}) {
  const headers = {};
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.gatewaySecret) headers['x-gateway-admin-secret'] = options.gatewaySecret;
  const { response, data } = await invokeFunction(url, 'billing-automation', {
    action: 'get_global_whatsapp_connection_status',
  }, headers);

  if (!response.ok || !(data?.ok === true || data?.success === true)) {
    throw new Error(String(data?.error || 'Falha ao consultar status do gateway global.'));
  }

  return data;
}

async function getPlatformIntegration(admin) {
  const { data, error } = await admin
    .from('platform_integrations')
    .select('provider, instance_id, token, client_token, connected, phone_number, updated_at')
    .eq('provider', 'zapi')
    .maybeSingle();
  if (error) throw new Error(error.message || 'Falha ao carregar platform_integrations.');
  return data || null;
}

async function getCandidateRecords(admin, companyId, limit = 3) {
  const { data, error } = await admin
    .from('registros_financeiros')
    .select('id, company_id, nome, cliente_nome, cliente_numero, telefone, documento, numero_boleto, numero_nf, valor, data_vencimento, drive_file_id, boleto_url, boleto_match_confidence, boleto_match_strategy')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(limit * 10);

  if (error) throw new Error(error.message || 'Falha ao consultar registros financeiros.');

  const rows = (data || []).filter((row) => row?.id).slice(0, limit);
  if (rows.length < limit) {
    throw new Error(`Registros insuficientes para o E2E (necessario >= ${limit}, encontrado ${rows.length}).`);
  }
  return rows;
}

async function sendCharges(url, accessToken, companyId, charges) {
  return invokeFunction(url, 'send-whatsapp-charge', {
    empresa_id: companyId,
    charges,
  }, {
    Authorization: `Bearer ${accessToken}`,
  });
}

async function waitForWebhookUpdate(admin, providerMessageId, timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await admin
      .from('cobrancas_whatsapp')
      .select('id, status, provider_message_id, delivered_at, read_at, failed_at, updated_at')
      .eq('provider_message_id', providerMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Falha ao consultar status do webhook.');
    if (data?.status && !['sent', 'sent_pending_provider_id', 'queued'].includes(String(data.status))) {
      return data;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return null;
}

function buildCharge(record, phone, message) {
  return {
    registro_id: record.id,
    customer_id: record.cliente_numero || null,
    telefone: phone,
    mensagem: message,
    documento: record.documento || null,
    numero_boleto: record.numero_boleto || null,
    due_date: record.data_vencimento || null,
    amount: Number(record.valor || 0),
  };
}

async function runReport(env) {
  const { admin, anon, url } = createClients(env);
  const companyId = getEnvValue(env, 'VITE_SUPABASE_COMPANY_ID');
  const gatewaySecret = getEnvValue(env, 'GATEWAY_ADMIN_SECRET');
  const email = getEnvValue(env, 'E2E_TEST_EMAIL') || 'e2e.whatsapp@ncfinance.local';
  const password = getEnvValue(env, 'E2E_TEST_PASSWORD') || 'NcFinance!2026';
  const checks = [];

  const push = (ok, label, details = '') => {
    checks.push({ ok, label, details });
    logCheck(ok ? 'PASS' : 'FAIL', label, details);
  };

  const user = await ensureTestUser(admin, email, password);
  push(Boolean(user?.id), 'Usuario de teste criado/atualizado', maskSecret(user.id));

  await ensureSystemAdmin(admin, user.id, email);
  push(true, 'Usuario de teste registrado em system_admins');

  await ensureMembership(admin, user.id, companyId);
  push(true, 'Usuario de teste vinculado ao tenant de cobranca');

  const session = await signIn(anon, email, password);
  push(Boolean(session?.access_token), 'Login Supabase do usuario de teste', maskSecret(session.user.id));

  const bootstrap = await bootstrapGateway(url, { accessToken: session.access_token, gatewaySecret });
  push(Boolean(bootstrap?.ok), 'Bootstrap seguro do gateway global', String(bootstrap.config_source || ''));

  const status = await getGatewayStatus(url, { accessToken: session.access_token, gatewaySecret });
  push(Boolean(status?.connected), 'Status global conectado', String(status.status || ''));
  push(Boolean(String(status?.phone_number || '').trim()), 'Gateway conectado com numero', maskPhone(status.phone_number));

  const platform = await getPlatformIntegration(admin);
  push(Boolean(platform?.instance_id && platform?.token && platform?.client_token), 'platform_integrations preenchida', maskSecret(platform?.instance_id));
  push(Boolean(platform?.connected), 'platform_integrations marcada como conectada');

  const records = await getCandidateRecords(admin, companyId, 3);
  push(records.length >= 3, 'Registros financeiros suficientes para o live', `encontrados=${records.length}`);

  const sendFnSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/send-whatsapp-charge/index.ts'), 'utf8');
  push(/status:\s*409|DUPLICATE_CHARGE/.test(sendFnSource), 'Protecao de duplicidade 409 presente no envio individual');

  const runtimeSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/runtime.ts'), 'utf8');
  push(/maskPhone/.test(runtimeSource) && /maskSecret/.test(runtimeSource), 'Mascaramento de logs presente no runtime');

  const passed = checks.filter((item) => item.ok).length;
  const failed = checks.length - passed;
  console.log(`summary: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0 || passed !== 11) {
    process.exitCode = 1;
  }
}

async function runLive(env) {
  const { admin, anon, url } = createClients(env);
  const companyId = getEnvValue(env, 'VITE_SUPABASE_COMPANY_ID');
  const gatewaySecret = getEnvValue(env, 'GATEWAY_ADMIN_SECRET');
  const email = getEnvValue(env, 'E2E_TEST_EMAIL') || 'e2e.whatsapp@ncfinance.local';
  const password = getEnvValue(env, 'E2E_TEST_PASSWORD') || 'NcFinance!2026';
  const phone = getEnvValue(env, 'TEST_RECIPIENT_PHONE');

  if (!phone) {
    throw new Error('TEST_RECIPIENT_PHONE e obrigatorio para o live.');
  }

  const user = await ensureTestUser(admin, email, password);
  await ensureSystemAdmin(admin, user.id, email);
  await ensureMembership(admin, user.id, companyId);
  const session = await signIn(anon, email, password);
  await bootstrapGateway(url, { accessToken: session.access_token, gatewaySecret });
  const records = await getCandidateRecords(admin, companyId, 3);

  const singleCharge = buildCharge(
    records[0],
    phone,
    `[E2E LIVE] Cobranca individual de teste ${new Date().toISOString()}`,
  );

  const firstSend = await sendCharges(url, session.access_token, companyId, [singleCharge]);
  if (!firstSend.response.ok || !(firstSend.data?.ok === true)) {
    throw new Error(`Falha no envio individual: ${JSON.stringify(firstSend.data)}`);
  }

  const firstResult = firstSend.data?.results?.[0];
  console.log('single_send_result:', JSON.stringify({
    ok: firstResult?.ok,
    provider_message_id: firstResult?.provider_message_id || null,
    pdf_sent: firstResult?.pdf_sent ?? null,
    zapi_status: firstResult?.zapi_status || null,
    phone_masked: maskPhone(phone),
  }, null, 2));

  const duplicateSend = await sendCharges(url, session.access_token, companyId, [singleCharge]);
  if (duplicateSend.response.status !== 409) {
    throw new Error(`Duplicidade nao retornou 409. HTTP=${duplicateSend.response.status} body=${JSON.stringify(duplicateSend.data)}`);
  }
  console.log('duplicate_result:', JSON.stringify(duplicateSend.data, null, 2));

  const batchCharges = [
    buildCharge(records[1], phone, `[E2E LIVE] Lote 1 ${new Date().toISOString()}`),
    buildCharge(records[2], phone, `[E2E LIVE] Lote 2 ${new Date().toISOString()}`),
  ];
  const batchSend = await sendCharges(url, session.access_token, companyId, batchCharges);
  if (!batchSend.response.ok || !(batchSend.data?.ok === true)) {
    throw new Error(`Falha no lote pequeno: ${JSON.stringify(batchSend.data)}`);
  }
  console.log('batch_summary:', JSON.stringify(batchSend.data?.summary || {}, null, 2));

  const providerMessageId = String(firstResult?.provider_message_id || '').trim();
  if (providerMessageId) {
    const webhookRow = await waitForWebhookUpdate(admin, providerMessageId);
    if (!webhookRow) {
      throw new Error('Webhook nao atualizou status no banco dentro da janela de espera.');
    }
    console.log('webhook_status:', JSON.stringify({
      status: webhookRow.status,
      provider_message_id: webhookRow.provider_message_id,
      updated_at: webhookRow.updated_at,
    }, null, 2));
  }
}

async function main() {
  const args = parseArgs();
  const env = loadEnvironment({ cwd: process.cwd() });
  if (args.report === 'true') {
    await runReport(env);
    return;
  }
  if (args.live === 'true') {
    await runLive(env);
    return;
  }
  throw new Error('Use --report ou --live.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
