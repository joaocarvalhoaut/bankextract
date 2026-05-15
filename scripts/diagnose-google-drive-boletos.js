import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import {
  RESULT_LEVELS,
  asArray,
  createResult,
  createSupabaseClients,
  extractDriveFolderId,
  fetchJson,
  getEnvValue,
  loadEnvironment,
  maskSecret,
  parseArgs,
  printReport,
  sanitizeErrorMessage,
  toBoolean,
} from './_shared/diagnostic-core.js';

async function getGoogleAccessToken(env) {
  const clientEmail = getEnvValue(env, 'GOOGLE_CLIENT_EMAIL', ['GOOGLE_SERVICE_ACCOUNT_EMAIL']);
  const privateKey = getEnvValue(env, 'GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY nao configurados.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encode = (value) =>
    Buffer.from(JSON.stringify(value))
      .toString('base64url');

  const signingInput = `${encode(header)}.${encode(payload)}`;
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(
      privateKey
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s+/g, ''),
      'base64',
    ),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const assertion = `${signingInput}.${Buffer.from(signature).toString('base64url')}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    throw new Error(`Falha na autenticacao Google: ${response.status} ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function listDriveFiles(token, folderId, recursive, maxDepth, currentDepth = 0, collector = []) {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=1000&fields=files(id,name,mimeType,size,parents)`;
  const response = await fetchJson(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Falha ao listar pasta ${folderId}: ${response.status} ${response.text}`);
  }

  const files = asArray(response.data?.files);
  for (const file of files) {
    collector.push(file);
    if (recursive && file.mimeType === 'application/vnd.google-apps.folder' && currentDepth < maxDepth - 1) {
      await listDriveFiles(token, file.id, recursive, maxDepth, currentDepth + 1, collector);
    }
  }
  return collector;
}

async function probePdfHeader(token, fileId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Range: 'bytes=0-4',
      },
    },
  );
  if (!response.ok) {
    return { ok: false, reason: `falha_download_header_${response.status}` };
  }
  const header = Buffer.from(await response.arrayBuffer()).toString('latin1');
  return {
    ok: header.startsWith('%PDF'),
    reason: header.startsWith('%PDF') ? 'pdf_header_ok' : 'pdf_header_invalido',
  };
}

export async function runDiagnostic(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const env = loadEnvironment({ cwd: rootDir });
  const dryRun = toBoolean(options['dry-run'] ?? options.dryRun ?? env.DIAGNOSTIC_DRY_RUN, true);
  const recursive = toBoolean(options.recursive ?? 'true', true);
  const maxDepth = Math.max(1, Number(options['max-depth'] || options.maxDepth || 3));
  const folderSource = options['folder-url'] || options.folderUrl || options['folder-id'] || options.folderId || getEnvValue(env, 'GOOGLE_DRIVE_FOLDER_ID');
  const folderId = extractDriveFolderId(folderSource);
  const companyId = String(options['company-id'] || options.companyId || env.DIAGNOSTIC_COMPANY_ID || '').trim();
  const results = [];
  const { admin } = createSupabaseClients(env);

  if (!folderSource) {
    results.push(
      createResult(
        RESULT_LEVELS.ERROR,
        'Nenhuma pasta Google Drive foi informada para diagnostico.',
        'Definir GOOGLE_DRIVE_FOLDER_ID ou usar --folder-url/--folder-id.',
      ),
    );
    return printReport('Diagnostico Google Drive Boletos', results, { dry_run: dryRun, company_id: companyId || null });
  }

  if (!folderId) {
    results.push(
      createResult(
        RESULT_LEVELS.ERROR,
        'Falha ao extrair o folder ID do Google Drive.',
        'Revisar o link informado e garantir formato valido de pasta.',
        { folder_source: folderSource },
      ),
    );
    return printReport('Diagnostico Google Drive Boletos', results, { dry_run: dryRun, company_id: companyId || null });
  }

  results.push(
    createResult(
      RESULT_LEVELS.OK,
      `Folder ID extraido com sucesso: ${maskSecret(folderId)}.`,
      'Prosseguir com autenticacao Google.',
      { folder_id_masked: maskSecret(folderId) },
    ),
  );

  let token = '';
  try {
    token = await getGoogleAccessToken(env);
    results.push(
      createResult(
        RESULT_LEVELS.OK,
        'Autenticacao Google Drive concluida com sucesso.',
        'Validar permissao e listagem da pasta.',
        { client_email: getEnvValue(env, 'GOOGLE_CLIENT_EMAIL', ['GOOGLE_SERVICE_ACCOUNT_EMAIL']) },
      ),
    );
  } catch (error) {
    results.push(
      createResult(
        RESULT_LEVELS.ERROR,
        `Falha de autenticacao Google: ${sanitizeErrorMessage(error)}`,
        'Conferir GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY e compartilhamento da pasta com a service account.',
      ),
    );
    return printReport('Diagnostico Google Drive Boletos', results, { dry_run: dryRun, company_id: companyId || null });
  }

  try {
    const folderMeta = await fetchJson(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,capabilities,owners`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!folderMeta.ok) {
      throw new Error(`${folderMeta.status} ${folderMeta.text}`);
    }
    const canList = folderMeta.data?.capabilities?.canListChildren !== false;
    results.push(
      createResult(
        canList ? RESULT_LEVELS.OK : RESULT_LEVELS.WARNING,
        `Pasta acessivel: ${folderMeta.data?.name || '(sem nome)'} com MIME ${folderMeta.data?.mimeType || 'desconhecido'}.`,
        canList ? 'Prosseguir com leitura recursiva.' : 'Revisar permissoes da pasta no Google Drive.',
      ),
    );

    const files = await listDriveFiles(token, folderId, recursive, maxDepth);
    const pdfs = files.filter((file) => file.mimeType === 'application/pdf');
    const folders = files.filter((file) => file.mimeType === 'application/vnd.google-apps.folder');
    const emptyPdfs = pdfs.filter((file) => Number(file.size || 0) <= 0);

    results.push(
      createResult(
        pdfs.length ? RESULT_LEVELS.OK : RESULT_LEVELS.WARNING,
        `Leitura ${recursive ? 'recursiva' : 'simples'} retornou ${files.length} item(ns), ${folders.length} pasta(s) e ${pdfs.length} PDF(s).`,
        pdfs.length ? 'Revisar amostra de PDFs e MIME types.' : 'Validar se a pasta correta foi configurada e se ha boletos PDF no Drive.',
        {
          recursive,
          max_depth: maxDepth,
          boleto_count: pdfs.length,
        },
      ),
    );

    if (emptyPdfs.length) {
      results.push(
        createResult(
          RESULT_LEVELS.WARNING,
          `${emptyPdfs.length} PDF(s) vazio(s) ou sem tamanho informado foram encontrados.`,
          'Revisar arquivos potencialmente corrompidos no Drive.',
        ),
      );
    } else {
      results.push(
        createResult(
          RESULT_LEVELS.OK,
          'Nenhum PDF vazio foi detectado pela listagem do Drive.',
          'Prosseguir com validacao de cabecalho PDF.',
        ),
      );
    }

    if (pdfs.length && !dryRun) {
      const sample = pdfs.slice(0, Math.min(3, pdfs.length));
      let invalidHeaders = 0;
      for (const item of sample) {
        const probe = await probePdfHeader(token, item.id);
        if (!probe.ok) invalidHeaders += 1;
      }
      results.push(
        createResult(
          invalidHeaders === 0 ? RESULT_LEVELS.OK : RESULT_LEVELS.WARNING,
          `Amostra de ${sample.length} PDF(s) verificada; ${invalidHeaders} com cabecalho suspeito.`,
          invalidHeaders === 0 ? 'Nenhuma acao imediata.' : 'Revisar PDFs corrompidos ou nao padronizados.',
        ),
      );
    } else {
      results.push(
        createResult(
          RESULT_LEVELS.WARNING,
          'Validacao de cabecalho PDF nao executada porque dry-run=true.',
          'Executar novamente com --dry-run=false para checar cabecalho de PDF sem baixar arquivos completos.',
        ),
      );
    }
  } catch (error) {
    results.push(
      createResult(
        RESULT_LEVELS.ERROR,
        `Falha ao validar pasta/arquivos do Drive: ${sanitizeErrorMessage(error)}`,
        'Revisar permissoes da service account e acessibilidade da pasta.',
      ),
    );
  }

  if (companyId && admin) {
    try {
      const { data, error } = await admin
        .from('google_sheets_config')
        .select('empresa_id, drive_root_folder_id, drive_recursive_scan, drive_max_depth, ativo')
        .eq('empresa_id', companyId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        results.push(
          createResult(
            RESULT_LEVELS.WARNING,
            `Nenhuma configuracao Drive/Sheets encontrada para company_id ${companyId}.`,
            'Salvar configuracao da empresa antes do piloto real.',
          ),
        );
      } else if (String(data.drive_root_folder_id || '').trim() !== folderId) {
        results.push(
          createResult(
            RESULT_LEVELS.WARNING,
            `O folder ID configurado na empresa difere do folder auditado.`,
            'Alinhar drive_root_folder_id em google_sheets_config com a pasta validada.',
          ),
        );
      } else {
        results.push(
          createResult(
            RESULT_LEVELS.OK,
            `Isolamento por tenant validado para company_id ${companyId}.`,
            'Nenhuma acao imediata.',
          ),
        );
      }
    } catch (error) {
      results.push(
        createResult(
          RESULT_LEVELS.WARNING,
          `Falha ao validar isolamento por tenant no Supabase: ${sanitizeErrorMessage(error)}`,
          'Revisar acesso do service role e a configuracao da tabela google_sheets_config.',
        ),
      );
    }
  } else {
    results.push(
      createResult(
        RESULT_LEVELS.WARNING,
        'Isolamento por tenant nao foi validado runtime porque company_id ou service role nao foram informados.',
        'Usar --company-id com SUPABASE_SERVICE_ROLE_KEY para validar a configuracao por empresa.',
      ),
    );
  }

  return printReport('Diagnostico Google Drive Boletos', results, {
    dry_run: dryRun,
    company_id: companyId || null,
    folder_id_masked: maskSecret(folderId),
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
