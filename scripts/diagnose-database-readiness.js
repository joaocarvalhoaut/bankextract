import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  RESULT_LEVELS,
  createResult,
  createSupabaseClients,
  loadEnvironment,
  parseArgs,
  printReport,
  sanitizeErrorMessage,
} from './_shared/diagnostic-core.js';

const REQUIRED_TABLES = [
  'automation_audit_logs',
  'zapi_circuit_state',
  'collection_events',
  'collection_intelligence_scores',
];

const TABLE_EXPECTATIONS = {
  automation_audit_logs: {
    companyIndex: /idx_automation_audit_logs_company_created_at/i,
    createdAtIndex: /idx_automation_audit_logs_company_created_at/i,
    statusIndex: /idx_automation_audit_logs_status/i,
    correlationIndex: /idx_automation_audit_logs_correlation_id/i,
  },
  zapi_circuit_state: {
    companyIndex: /idx_zapi_circuit_state_company_provider/i,
    createdAtIndex: /idx_zapi_circuit_state_created_at/i,
    statusIndex: /idx_zapi_circuit_state_state/i,
    correlationIndex: /idx_zapi_circuit_state_correlation_id/i,
  },
  collection_events: {
    companyIndex: /idx_collection_events_company_created_at/i,
    createdAtIndex: /idx_collection_events_company_created_at/i,
    statusIndex: /idx_collection_events_status/i,
    correlationIndex: /idx_collection_events_correlation_id/i,
  },
  collection_intelligence_scores: {
    companyIndex: /idx_collection_intelligence_scores_company_created_at/i,
    createdAtIndex: /idx_collection_intelligence_scores_company_created_at/i,
    statusIndex: null,
    correlationIndex: /idx_collection_intelligence_scores_correlation_id/i,
  },
};

function collectMigrationText(rootDir) {
  const dir = path.join(rootDir, 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql'));
  const text = files
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
    .join('\n');
  return { dir, files, text };
}

function verifyStaticTable(sql, tableName) {
  const expected = TABLE_EXPECTATIONS[tableName];
  const checks = {
    table: new RegExp(`create table if not exists public\\.${tableName}\\b`, 'i').test(sql),
    companyIndex: expected.companyIndex.test(sql),
    createdAtIndex: expected.createdAtIndex.test(sql),
    statusIndex: expected.statusIndex ? expected.statusIndex.test(sql) : true,
    correlationIndex: expected.correlationIndex.test(sql),
    rls: new RegExp(`alter table public\\.${tableName} enable row level security`, 'i').test(sql),
    selectPolicy: new RegExp(`create policy ".*${tableName}.*select`, 'i').test(sql),
  };
  return checks;
}

async function verifyRuntimeTable(client, tableName) {
  const { error } = await client.from(tableName).select('*', { count: 'exact', head: true });
  if (!error) return { ok: true };
  return { ok: false, error };
}

export async function runDiagnostic(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const env = loadEnvironment({ cwd: rootDir });
  const { admin } = createSupabaseClients(env);
  const { text, files } = collectMigrationText(rootDir);
  const results = [];

  results.push(
    createResult(
      RESULT_LEVELS.OK,
      `${files.length} migration(s) localizadas para auditoria estatica.`,
      'Manter migrations versionadas junto com o deploy.',
    ),
  );

  for (const tableName of REQUIRED_TABLES) {
    const checks = verifyStaticTable(text, tableName);
    const failures = Object.entries(checks)
      .filter(([, value]) => value === false)
      .map(([key]) => key);

    if (failures.length) {
      results.push(
        createResult(
          RESULT_LEVELS.ERROR,
          `Migration incompleta para ${tableName}: faltando ${failures.join(', ')}.`,
          `Completar migration e revisar RLS/indices de ${tableName}.`,
          { table: tableName, checks },
        ),
      );
    } else {
      results.push(
        createResult(
          RESULT_LEVELS.OK,
          `Migration local de ${tableName} possui tabela, indices essenciais e RLS.`,
          'Seguir para validacao runtime da tabela.',
          { table: tableName, checks },
        ),
      );
    }

    if (!admin) {
      results.push(
        createResult(
          RESULT_LEVELS.WARNING,
          `Sem SUPABASE_SERVICE_ROLE_KEY; runtime de ${tableName} nao foi validado via banco.`,
          'Configurar SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para verificacao runtime.',
          { table: tableName },
        ),
      );
      continue;
    }

    try {
      const runtime = await verifyRuntimeTable(admin, tableName);
      if (runtime.ok) {
        results.push(
          createResult(
            RESULT_LEVELS.OK,
            `Tabela ${tableName} acessivel no runtime Supabase.`,
            'Nenhuma acao imediata.',
            { table: tableName },
          ),
        );
      } else {
        results.push(
          createResult(
            RESULT_LEVELS.ERROR,
            `Tabela ${tableName} nao validada no runtime: ${runtime.error.message || runtime.error}`,
            `Aplicar migrations no banco alvo e reexecutar o diagnostico para ${tableName}.`,
            { table: tableName },
          ),
        );
      }
    } catch (error) {
      results.push(
        createResult(
          RESULT_LEVELS.ERROR,
          `Falha ao validar runtime de ${tableName}: ${sanitizeErrorMessage(error)}`,
          'Verificar conectividade com Supabase e acesso da service role.',
          { table: tableName },
        ),
      );
    }
  }

  return printReport('Diagnostico Database Readiness', results, {
    required_tables: REQUIRED_TABLES,
    has_admin_client: Boolean(admin),
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
