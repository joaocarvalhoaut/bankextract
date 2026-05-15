import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  RESULT_LEVELS,
  createResult,
  loadEnvironment,
  parseArgs,
  printReport,
} from './_shared/diagnostic-core.js';

const CRITICAL_CHECKS = [
  {
    name: 'billingAutomationService sendSingleCharge',
    file: 'src/services/billingAutomationService.js',
    patterns: [/action:\s*'send_single_charge'/, /company_id:\s*companyId/],
  },
  {
    name: 'billingAutomationService sendRealCharge',
    file: 'src/services/billingAutomationService.js',
    patterns: [/action:\s*'send_real'/, /company_id:\s*companyId/],
  },
  {
    name: 'auditTimelineService list',
    file: 'src/services/auditTimelineService.js',
    patterns: [/from\('audit_logs'\)/, /query = query\.eq\('company_id', companyId\)/],
  },
  {
    name: 'analyticsService financial rows',
    file: 'src/services/analyticsService.js',
    patterns: [/from\('registros_financeiros'\)/, /\.eq\('company_id', companyId\)/],
  },
  {
    name: 'analyticsService logs cobranca',
    file: 'src/services/analyticsService.js',
    patterns: [/from\('logs_cobranca'\)/, /\.eq\('company_id', companyId\)/],
  },
  {
    name: 'companyIntegrationService tenant scope',
    file: 'src/services/companyIntegrationService.js',
    patterns: [/from\('company_integrations'\)/, /\.eq\('company_id', companyId\)/],
  },
  {
    name: 'financeService runtime tenant filter',
    file: 'src/services/financeService.js',
    patterns: [/from\('registros_financeiros'\)/, /eq\('company_id', tenant\.companyId\)/],
  },
];

const REQUIRED_RLS_TABLES = [
  'automation_audit_logs',
  'zapi_circuit_state',
  'collection_events',
  'collection_intelligence_scores',
];

function readFile(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function hasAllPatterns(content, patterns) {
  return patterns.every((pattern) => pattern.test(content));
}

export async function runDiagnostic(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  loadEnvironment({ cwd: rootDir });
  const results = [];

  for (const check of CRITICAL_CHECKS) {
    const content = readFile(rootDir, check.file);
    if (hasAllPatterns(content, check.patterns)) {
      results.push(
        createResult(
          RESULT_LEVELS.OK,
          `${check.name} possui indicios de isolamento por company_id.`,
          'Nenhuma acao imediata.',
          { file: check.file },
        ),
      );
    } else {
      results.push(
        createResult(
          RESULT_LEVELS.ERROR,
          `${check.name} precisa de revisao manual de tenant isolation.`,
          `Auditar ${check.file} e garantir filtro explicito por company_id.`,
          { file: check.file },
        ),
      );
    }
  }

  const migrationText = fs
    .readdirSync(path.join(rootDir, 'supabase', 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', file), 'utf8'))
    .join('\n');

  for (const tableName of REQUIRED_RLS_TABLES) {
    const rlsOk = new RegExp(`alter table public\\.${tableName} enable row level security`, 'i').test(migrationText);
    const selectPolicyOk = new RegExp(`create policy ".*${tableName}.*select`, 'i').test(migrationText);
    if (rlsOk && selectPolicyOk) {
      results.push(
        createResult(
          RESULT_LEVELS.OK,
          `RLS e politica de select encontrados para ${tableName}.`,
          'Nenhuma acao imediata.',
          { table: tableName },
        ),
      );
    } else {
      results.push(
        createResult(
          RESULT_LEVELS.ERROR,
          `RLS/politicas incompletas para ${tableName}.`,
          `Completar RLS e policies para ${tableName}.`,
          { table: tableName },
        ),
      );
    }
  }

  return printReport('Diagnostico Tenant Isolation', results, {
    critical_checks: CRITICAL_CHECKS.length,
    required_rls_tables: REQUIRED_RLS_TABLES,
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
