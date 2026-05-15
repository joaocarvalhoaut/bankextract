import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createResult,
  RESULT_LEVELS,
  loadEnvironment,
  parseArgs,
  printReport,
  writeMarkdownReport,
} from './_shared/diagnostic-core.js';
import { runDiagnostic as runDatabaseReadiness } from './diagnose-database-readiness.js';
import { runDiagnostic as runTenantIsolation } from './diagnose-tenant-isolation.js';
import { runDiagnostic as runGoogleDrive } from './diagnose-google-drive-boletos.js';
import { runDiagnostic as runWhatsappZapi } from './diagnose-whatsapp-zapi.js';

export async function runDiagnostic(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const env = loadEnvironment({ cwd: rootDir });
  const reports = await Promise.all([
    runDatabaseReadiness({ rootDir }),
    runTenantIsolation({ rootDir }),
    runGoogleDrive({ rootDir, 'dry-run': options['dry-run'] ?? 'true', companyId: env.DIAGNOSTIC_COMPANY_ID || '' }),
    runWhatsappZapi({ rootDir, 'dry-run': options['dry-run'] ?? 'true', companyId: env.DIAGNOSTIC_COMPANY_ID || '' }),
  ]);

  const results = [];
  for (const report of reports) {
    const overall = report.summary.overall;
    results.push(
      createResult(
        overall === RESULT_LEVELS.ERROR
          ? RESULT_LEVELS.ERROR
          : overall === RESULT_LEVELS.WARNING
            ? RESULT_LEVELS.WARNING
            : RESULT_LEVELS.OK,
        `${report.title}: ${overall}.`,
        overall === RESULT_LEVELS.OK
          ? 'Nenhuma acao imediata.'
          : 'Abrir o relatorio detalhado deste diagnostico e tratar os itens pendentes.',
      ),
    );
  }

  const flagChecks = [
    ['ENABLE_MOCK_WHATSAPP', env.ENABLE_MOCK_WHATSAPP || ''],
    ['ENABLE_GOOGLE_VISION_OCR', env.ENABLE_GOOGLE_VISION_OCR || ''],
    ['GOOGLE_CLIENT_EMAIL', env.GOOGLE_CLIENT_EMAIL || ''],
    ['GOOGLE_PRIVATE_KEY', env.GOOGLE_PRIVATE_KEY || ''],
    ['ZAPI_INSTANCE_ID', env.ZAPI_INSTANCE_ID || ''],
    ['ZAPI_TOKEN', env.ZAPI_TOKEN || ''],
    ['ZAPI_CLIENT_TOKEN', env.ZAPI_CLIENT_TOKEN || ''],
    ['TEST_ZAPI_INSTANCE_ID', env.TEST_ZAPI_INSTANCE_ID || ''],
    ['TEST_ZAPI_TOKEN', env.TEST_ZAPI_TOKEN || ''],
    ['TEST_ZAPI_CLIENT_TOKEN', env.TEST_ZAPI_CLIENT_TOKEN || ''],
  ];

  const missingFlags = flagChecks.filter(([, value]) => !String(value || '').trim()).map(([key]) => key);
  results.push(
    createResult(
      missingFlags.length ? RESULT_LEVELS.WARNING : RESULT_LEVELS.OK,
      missingFlags.length
        ? `Flags/segredos ausentes para go-live: ${missingFlags.join(', ')}.`
        : 'Flags principais de runtime estao mapeadas no ambiente local auditado.',
      missingFlags.length
        ? 'Preencher secrets faltantes no ambiente integrado antes do smoke test real.'
        : 'Nenhuma acao imediata.',
    ),
  );

  const report = printReport('Diagnostico Go-live Readiness', results, {
    diagnostics: reports.map((item) => ({ title: item.title, summary: item.summary })),
  });

  if (String(options['write-report'] || options.writeReport || '').trim() === 'true') {
    const fileName = `go-live-readiness-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    const outputPath = path.join(rootDir, 'reports', fileName);
    writeMarkdownReport(outputPath, report);
    console.log(`report_file: ${outputPath}`);
  }

  return report;
}

const isCli = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const args = parseArgs();
  runDiagnostic({ rootDir: process.cwd(), ...args }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
