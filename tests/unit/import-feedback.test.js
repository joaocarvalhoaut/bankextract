import test from 'node:test';
import assert from 'node:assert/strict';

import { buildImportCompletionFeedback } from '../../src/utils/importFeedback.js';

test('gera feedback especifico quando ha duplicados ignorados', () => {
  const result = buildImportCompletionFeedback({
    importedCount: 3,
    skippedDuplicates: 2,
    fileName: 'maio.csv',
  });

  assert.equal(result.kind, 'duplicates_ignored');
  assert.equal(result.toastMessage, '3 registro(s) importado(s) e 2 duplicado(s) ignorado(s).');
  assert.match(result.notificationMessage, /2 duplicado\(s\) foram ignorado\(s\)/);
});

test('gera feedback simples quando nao ha duplicados', () => {
  const result = buildImportCompletionFeedback({
    importedCount: 4,
    skippedDuplicates: 0,
    fileName: 'junho.csv',
  });

  assert.equal(result.kind, 'import_success');
  assert.equal(result.toastMessage, '4 registro(s) importado(s) com sucesso.');
});

test('gera feedback de lote totalmente duplicado', () => {
  const result = buildImportCompletionFeedback({
    importedCount: 0,
    skippedDuplicates: 5,
    fileName: 'duplicado.csv',
  });

  assert.equal(result.kind, 'all_duplicates_ignored');
  assert.match(result.toastMessage, /apenas duplicatas ja existentes/);
});
