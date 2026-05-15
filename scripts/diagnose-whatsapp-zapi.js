import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';
import {
  RESULT_LEVELS,
  createResult,
  createSupabaseClients,
  fetchJson,
  getEnvValue,
  loadEnvironment,
  maskPhone,
  maskSecret,
  parseArgs,
  printReport,
  sanitizeErrorMessage,
  toBoolean,
} from './_shared/diagnostic-core.js';

function resolveConfigSource(env, companyIntegration = null) {
  if (companyIntegration?.instance_id && companyIntegration?.token && companyIntegration?.client_token) {
    return {
      source: 'company',
      instanceId: String(companyIntegration.instance_id || '').trim(),
      token: String(companyIntegration.token || '').trim(),
      clientToken: String(companyIntegration.client_token || '').trim(),
    };
  }

  const testInstanceId = getEnvValue(env, 'TEST_ZAPI_INSTANCE_ID');
  const testToken = getEnvValue(env, 'TEST_ZAPI_TOKEN');
  const testClientToken = getEnvValue(env, 'TEST_ZAPI_CLIENT_TOKEN');
  if (testInstanceId && testToken && testClientToken) {
    return {
      source: 'test',
      instanceId: testInstanceId,
      token: testToken,
      clientToken: testClientToken,
    };
  }

  return {
    source: 'global',
    instanceId: getEnvValue(env, 'ZAPI_INSTANCE_ID'),
    token: getEnvValue(env, 'ZAPI_TOKEN'),
    clientToken: getEnvValue(env, 'ZAPI_CLIENT_TOKEN'),
  };
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

function detectConnectionStatus(payload = {}) {
  const value = String(
    payload.connected ??
      payload.status ??
      payload.state ??
      payload.instanceStatus ??
      payload.session ??
      '',
  ).toLowerCase();

  return ['connected', 'true', 'online', 'open', 'ready'].some((item) => value.includes(item));
}

export async function runDiagnostic(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const env = loadEnvironment({ cwd: rootDir });
  const dryRun = toBoolean(options['dry-run'] ?? options.dryRun ?? env.DIAGNOSTIC_DRY_RUN, true);
  const companyId = String(options['company-id'] || options.companyId || env.DIAGNOSTIC_COMPANY_ID || '').trim();
  const mockNumber = String(options['mock-number'] || options.mockNumber || '5511999999999').replace(/\D/g, '');
  const maxBytes = Math.max(1024, Number(options['max-bytes'] || env.ZAPI_DOCUMENT_MAX_BYTES || 10485760));
  const { admin } = createSupabaseClients(env);
  const results = [];

  let companyIntegration = null;
  if (companyId && admin) {
    try {
      const { data, error } = await admin
        .from('company_integrations')
        .select('company_id, instance_id, token, client_token, connected')
        .eq('company_id', companyId)
        .eq('provider', 'zapi')
        .maybeSingle();
      if (error) throw error;
      companyIntegration = data || null;
    } catch (error) {
      results.push(
        createResult(
          RESULT_LEVELS.WARNING,
          `Falha ao carregar integracao Z-API da empresa: ${sanitizeErrorMessage(error)}`,
          'Revisar company_integrations e a service role do Supabase.',
        ),
      );
    }
  }

  const config = resolveConfigSource(env, companyIntegration);
  const hasCredentials = Boolean(config.instanceId && config.token && config.clientToken);
  results.push(
    createResult(
      hasCredentials ? RESULT_LEVELS.OK : RESULT_LEVELS.ERROR,
      hasCredentials
        ? `Credenciais Z-API localizadas (${config.source}) para instancia ${maskSecret(config.instanceId)}.`
        : 'Credenciais Z-API incompletas para diagnostico.',
      hasCredentials
        ? 'Prosseguir com handshake e validacao de payload.'
        : 'Configurar ZAPI_INSTANCE_ID/ZAPI_TOKEN/ZAPI_CLIENT_TOKEN ou TEST_*.',
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
      'Geracao base64 de PDF sintético concluida.',
      'Nenhuma acao imediata.',
    ),
  );

  if (hasCredentials) {
    try {
      const statusUrl = `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/status`;
      const response = await fetchJson(statusUrl, {
        method: 'GET',
        headers: {
          'Client-Token': config.clientToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        results.push(
          createResult(
            RESULT_LEVELS.ERROR,
            `Handshake Z-API falhou: HTTP ${response.status}.`,
            'Conferir instance/token/client token e conectividade da instancia.',
          ),
        );
      } else {
        const active = detectConnectionStatus(response.data);
        results.push(
          createResult(
            active ? RESULT_LEVELS.OK : RESULT_LEVELS.WARNING,
            `Handshake Z-API respondeu com status ${response.status}; instancia ${active ? 'ativa' : 'nao confirmada como ativa'}.`,
            active ? 'Nenhuma acao imediata.' : 'Escanear QR Code/reconectar instancia antes do piloto.',
          ),
        );
      }
    } catch (error) {
      results.push(
        createResult(
          RESULT_LEVELS.ERROR,
          `Falha ao consultar status da Z-API: ${sanitizeErrorMessage(error)}`,
          'Validar rede, firewall e credenciais da instancia.',
        ),
      );
    }
  }

  if (dryRun) {
    results.push(
      createResult(
        RESULT_LEVELS.OK,
        'dry-run=true: nenhum envio real foi executado; somente handshake e montagem de payload.',
        'Desligar dry-run apenas em janela controlada de smoke test integrado.',
      ),
    );
  } else {
    results.push(
      createResult(
        RESULT_LEVELS.WARNING,
        'dry-run=false solicitado; por seguranca o diagnostico continua sem enviar cobrancas reais.',
        'Use este script apenas para auditoria operacional, nao para disparo de mensagens.',
      ),
    );
  }

  const billingAutomationSource = fs.readFileSync(path.join(rootDir, 'supabase', 'functions', 'billing-automation', 'index.ts'), 'utf8');
  const hasIdempotency = /automation_dispatches/.test(billingAutomationSource) && /send_single_charge/.test(billingAutomationSource);
  results.push(
    createResult(
      hasIdempotency ? RESULT_LEVELS.OK : RESULT_LEVELS.WARNING,
      hasIdempotency
        ? 'Base de idempotencia localizada no fluxo de cobranca (automation_dispatches).'
        : 'Base de idempotencia nao localizada com confianca no fluxo auditado.',
      hasIdempotency ? 'Nenhuma acao imediata.' : 'Revisar o fluxo de deduplicacao antes do piloto.',
    ),
  );

  const hasCorrelation = /request_id/.test(billingAutomationSource) && /correlation_id/.test(billingAutomationSource);
  results.push(
    createResult(
      hasCorrelation ? RESULT_LEVELS.OK : RESULT_LEVELS.WARNING,
      hasCorrelation
        ? 'Request/correlation identifiers aparecem no codigo auditado.'
        : 'Nao foi possivel confirmar correlation_id/request_id em todo o fluxo auditado.',
      hasCorrelation ? 'Nenhuma acao imediata.' : 'Padronizar request_id e correlation_id nos eventos da cobranca.',
    ),
  );

  return printReport('Diagnostico WhatsApp Z-API', results, {
    dry_run: dryRun,
    company_id: companyId || null,
    config_source: config.source,
    mock_number: maskPhone(mockNumber),
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
