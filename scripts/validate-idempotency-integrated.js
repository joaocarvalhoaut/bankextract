import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildFinancialRecordIdempotencyKey } from '../src/utils/financialRecordIdempotency.js';

const rootDir = process.cwd();

function readEnvFile(fileName) {
  const filePath = path.join(rootDir, fileName);
  if (!fs.existsSync(filePath)) return {};

  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return acc;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^"(.*)"$/, '$1');
    acc[key] = value;
    return acc;
  }, {});
}

const env = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local'),
  ...readEnvFile('.env.secrets'),
  ...process.env,
};

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
const companyId = env.VITE_SUPABASE_COMPANY_ID;
const userId = env.VITE_SUPABASE_USER_ID || null;

if (!supabaseUrl || !serviceRoleKey || !companyId) {
  throw new Error('Variaveis de ambiente insuficientes para validacao integrada.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const now = new Date();
const baseStamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const testPrefix = `INTEG-IDEM-${baseStamp}`;
const firstBatchId = crypto.randomUUID();
const secondBatchId = crypto.randomUUID();
const raceBatchId = crypto.randomUUID();

const todayIso = now.toISOString().slice(0, 10);
const futureDate = new Date(now.getTime() + 5 * 86400000).toISOString().slice(0, 10);
const pastDate = new Date(now.getTime() - 5 * 86400000).toISOString().slice(0, 10);

function buildPayload({ suffix, documento, vencimento, valor, batchId }) {
  return {
    company_id: companyId,
    user_id: userId,
    batch_id: batchId,
    nome: `Validacao Integrada ${suffix}`,
    documento,
    numero_boleto: documento,
    numero_nf: null,
    data_vencimento: vencimento,
    valor,
    telefone: '11999990000',
    observacao: 'Validacao integrada de idempotencia',
    status: 'pendente',
    importado_em: new Date().toISOString(),
    idempotency_key: buildFinancialRecordIdempotencyKey({
      numero_boleto: documento,
      documento,
      nome: `Validacao Integrada ${suffix}`,
      telefone: '11999990000',
      data_vencimento: vencimento,
      valor,
    }),
  };
}

const duplicateRows = [
  buildPayload({
    suffix: 'Vencido',
    documento: `${testPrefix}-VENC`,
    vencimento: pastDate,
    valor: 101.25,
    batchId: firstBatchId,
  }),
  buildPayload({
    suffix: 'AVencer',
    documento: `${testPrefix}-FUT`,
    vencimento: futureDate,
    valor: 202.5,
    batchId: firstBatchId,
  }),
];

const secondPassRows = duplicateRows.map((row) => ({
  ...row,
  batch_id: secondBatchId,
}));

const raceRow = buildPayload({
  suffix: 'Race',
  documento: `${testPrefix}-RACE`,
  vencimento: pastDate,
  valor: 303.75,
  batchId: raceBatchId,
});

async function cleanupTestRows() {
  const { error } = await supabase
    .from('registros_financeiros')
    .delete()
    .eq('company_id', companyId)
    .or(`documento.like.${testPrefix}%,numero_boleto.like.${testPrefix}%`);

  if (error) {
    throw error;
  }
}

async function run() {
  await cleanupTestRows();

  const firstInsert = await supabase
    .from('registros_financeiros')
    .upsert(duplicateRows, {
      onConflict: 'company_id,idempotency_key',
      ignoreDuplicates: true,
    })
    .select('id, documento, numero_boleto, data_vencimento, valor, idempotency_key');

  if (firstInsert.error) throw firstInsert.error;

  const secondInsert = await supabase
    .from('registros_financeiros')
    .upsert(secondPassRows, {
      onConflict: 'company_id,idempotency_key',
      ignoreDuplicates: true,
    })
    .select('id, documento, idempotency_key');

  if (secondInsert.error) throw secondInsert.error;

  const raceResults = await Promise.all([
    supabase
      .from('registros_financeiros')
      .upsert([raceRow], {
        onConflict: 'company_id,idempotency_key',
        ignoreDuplicates: true,
      })
      .select('id, documento, idempotency_key'),
    supabase
      .from('registros_financeiros')
      .upsert([{ ...raceRow, batch_id: crypto.randomUUID() }], {
        onConflict: 'company_id,idempotency_key',
        ignoreDuplicates: true,
      })
      .select('id, documento, idempotency_key'),
  ]);

  for (const result of raceResults) {
    if (result.error) throw result.error;
  }

  const insertedDocs = [
    ...duplicateRows.map((row) => row.documento),
    raceRow.documento,
  ];

  const insertedRowsRes = await supabase
    .from('registros_financeiros')
    .select('id, documento, numero_boleto, data_vencimento, valor, idempotency_key, created_at')
    .eq('company_id', companyId)
    .in('documento', insertedDocs)
    .order('created_at', { ascending: true });

  if (insertedRowsRes.error) throw insertedRowsRes.error;

  const futureRowsRes = await supabase
    .from('registros_financeiros')
    .select('id, documento, data_vencimento, idempotency_key')
    .eq('company_id', companyId)
    .eq('documento', duplicateRows[1].documento)
    .gt('data_vencimento', todayIso);

  if (futureRowsRes.error) throw futureRowsRes.error;

  const legacyNullKeysRes = await supabase
    .from('registros_financeiros')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('idempotency_key', null);

  if (legacyNullKeysRes.error) throw legacyNullKeysRes.error;

  const summary = {
    companyId,
    duplicateImport: {
      firstInserted: firstInsert.data?.length || 0,
      secondInserted: secondInsert.data?.length || 0,
      ignoredOnSecondPass: duplicateRows.length - (secondInsert.data?.length || 0),
    },
    concurrency: {
      parallelInsertResults: raceResults.map((result) => result.data?.length || 0),
      finalRaceRowCount: (insertedRowsRes.data || []).filter((row) => row.documento === raceRow.documento).length,
    },
    remoteRows: {
      totalInsertedForValidation: insertedRowsRes.data?.length || 0,
      rowsWithIdempotencyKey: (insertedRowsRes.data || []).filter((row) => Boolean(row.idempotency_key)).length,
      futureDueRowsFound: futureRowsRes.data?.length || 0,
      legacyRowsWithoutIdempotencyKey: legacyNullKeysRes.count || 0,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
  await cleanupTestRows();
}

run().catch(async (error) => {
  try {
    await cleanupTestRows();
  } catch {
    // Mantem o erro original como causa principal da falha de validacao.
  }
  console.error(error);
  process.exit(1);
});
