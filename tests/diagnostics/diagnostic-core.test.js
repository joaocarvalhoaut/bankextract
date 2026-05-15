import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDriveFolderId,
  maskPhone,
  maskSecret,
  summarizeResults,
  createResult,
  RESULT_LEVELS,
} from '../../scripts/_shared/diagnostic-core.js';

test('extractDriveFolderId supports plain id and Drive URLs', () => {
  assert.equal(extractDriveFolderId('abc123XYZ_987'), 'abc123XYZ_987');
  assert.equal(
    extractDriveFolderId('https://drive.google.com/drive/folders/abc123XYZ_987?usp=sharing'),
    'abc123XYZ_987',
  );
  assert.equal(
    extractDriveFolderId('https://drive.google.com/open?id=abc123XYZ_987'),
    'abc123XYZ_987',
  );
});

test('maskSecret and maskPhone redact sensitive values', () => {
  assert.equal(maskSecret('1234567890abcdef'), '1234***cdef');
  assert.equal(maskPhone('+55 (11) 99999-1234'), '5511***34');
});

test('summarizeResults computes overall status', () => {
  const results = [
    createResult(RESULT_LEVELS.OK, 'ok', 'none'),
    createResult(RESULT_LEVELS.WARNING, 'warn', 'check'),
    createResult(RESULT_LEVELS.ERROR, 'err', 'fix'),
  ];
  const summary = summarizeResults(results);
  assert.equal(summary.ok, 1);
  assert.equal(summary.warning, 1);
  assert.equal(summary.error, 1);
  assert.equal(summary.overall, RESULT_LEVELS.ERROR);
});
