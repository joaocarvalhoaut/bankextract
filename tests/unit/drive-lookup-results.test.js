import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDriveLookupResult, normalizeDriveLookupResults } from '../../src/utils/driveLookupResults.js';

test('normaliza resultado de lookup do Drive com payload snake_case do backend', () => {
  const result = normalizeDriveLookupResult({
    file_id: 'drive-123',
    file_name: 'Boleto_4254-2_IDERLANDIO.pdf',
    score: 92,
    reasons: ['fulltext_match'],
    view_url: 'https://drive.google.com/file/d/drive-123/view',
  });

  assert.equal(result.file.id, 'drive-123');
  assert.equal(result.file.name, 'Boleto_4254-2_IDERLANDIO.pdf');
  assert.equal(result.file.webViewLink, 'https://drive.google.com/file/d/drive-123/view');
  assert.equal(result.match_origin, 'fulltext_match');
});

test('normaliza lista de lookup com shape heterogeneo sem gerar arquivo sem nome', () => {
  const results = normalizeDriveLookupResults([
    {
      file: {
        id: 'drive-456',
        name: 'Boleto_5000.pdf',
        webViewLink: 'https://drive.google.com/file/d/drive-456/view',
      },
      score: 80,
      reasons: ['filename_match'],
    },
    {
      file_id: 'drive-789',
      file_name: 'Boleto_6000.pdf',
      score: 50,
      reasons: ['fulltext_match'],
      view_url: 'https://drive.google.com/file/d/drive-789/view',
    },
  ]);

  assert.equal(results[0].file.name, 'Boleto_5000.pdf');
  assert.equal(results[1].file.name, 'Boleto_6000.pdf');
  assert.equal(results[1].viewUrl, 'https://drive.google.com/file/d/drive-789/view');
});
