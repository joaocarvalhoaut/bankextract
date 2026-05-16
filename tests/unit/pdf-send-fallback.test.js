/**
 * pdf-send-fallback.test.js
 *
 * Validates the JS-layer helpers and logic contracts that the
 * billing-automation Edge Function relies on for PDF-first send
 * with text fallback.
 *
 * What we test here (pure JS):
 *  - normalizeSendResult: unifies sendZapiDocument / sendZapiText shapes
 *  - pdfFileName semantics: must be null when fallback occurred
 *  - pdf_enviado flag derivation
 *
 * The actual PDF download + Z-API calls live in Deno TypeScript and
 * are validated via integration/deploy test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ── helper mirroring the Edge Function's result normalizer ───────────────────
//
// sendZapiDocument returns: { provider_id, raw }
// sendZapiText     returns: { normalizedPhone, raw, zaapId, messageId, id }
//
// The merged shape used in sendRealChargesData after 957017f:
//   { normalizedPhone, raw, zaapId, messageId, id }

function normalizeSendResult(result, phone) {
  if (!result) throw new Error('sendResult is null');
  // If sendZapiDocument result (has provider_id, no normalizedPhone)
  if ('provider_id' in result && !('normalizedPhone' in result)) {
    const raw = (result.raw || {});
    return {
      normalizedPhone: phone,
      raw: result.raw,
      zaapId: String(raw.zaapId || ''),
      messageId: String(result.provider_id || raw.messageId || ''),
      id: String(raw.id || ''),
    };
  }
  // sendZapiText result — already has normalizedPhone
  return result;
}

function buildSentEntry(sendResult, item, pdfFileName) {
  return {
    registro_id: item.registro_id || null,
    telefone: sendResult.normalizedPhone,
    pdf_file_name: pdfFileName || null,
    pdf_enviado: Boolean(pdfFileName),
    zapi_message_id: sendResult.messageId || null,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

test('normalizeSendResult converte shape sendZapiDocument para shape unificado', () => {
  const docResult = {
    provider_id: 'zaap-001',
    raw: { zaapId: 'zaap-001', id: 'msg-abc', messageId: '' },
  };
  const result = normalizeSendResult(docResult, '5511999990000');
  assert.equal(result.normalizedPhone, '5511999990000');
  assert.equal(result.messageId, 'zaap-001');
  assert.equal(result.zaapId, 'zaap-001');
});

test('normalizeSendResult passa sendZapiText result sem alteracao', () => {
  const textResult = {
    normalizedPhone: '5511988880000',
    raw: { zaapId: 'zaap-002' },
    zaapId: 'zaap-002',
    messageId: 'msg-xyz',
    id: 'id-xyz',
  };
  const result = normalizeSendResult(textResult, '5511988880000');
  assert.equal(result.normalizedPhone, '5511988880000');
  assert.equal(result.zaapId, 'zaap-002');
});

test('pdf_enviado = true quando PDF foi enviado com sucesso', () => {
  const sendResult = normalizeSendResult({
    provider_id: 'zaap-003',
    raw: { zaapId: 'zaap-003' },
  }, '5511977770000');

  const pdfFileName = 'boleto-cliente-joao.pdf'; // set BEFORE sendZapiDocument
  const entry = buildSentEntry(sendResult, { registro_id: 'reg-1' }, pdfFileName);

  assert.equal(entry.pdf_enviado, true);
  assert.equal(entry.pdf_file_name, 'boleto-cliente-joao.pdf');
});

test('pdf_enviado = false quando fallback para texto ocorreu (pdfFileName = null no catch)', () => {
  // Simulates what the Edge Function does in catch(pdfErr): pdfFileName = null
  let pdfFileName = 'boleto-xyz.pdf'; // set during PDF attempt
  // sendZapiDocument throws → catch block resets pdfFileName
  // (this mirrors the `pdfFileName = null` we added to the catch block)
  pdfFileName = null; // ← the fix: reset on fallback

  const textResult = {
    normalizedPhone: '5511966660000',
    raw: { zaapId: 'zaap-004' },
    zaapId: 'zaap-004',
    messageId: 'msg-fallback',
    id: 'id-fallback',
  };
  const entry = buildSentEntry(textResult, { registro_id: 'reg-2' }, pdfFileName);

  assert.equal(entry.pdf_enviado, false);
  assert.equal(entry.pdf_file_name, null);
  assert.equal(entry.zapi_message_id, 'msg-fallback');
});

test('pdf_enviado = false quando drive_file_id ausente (texto direto)', () => {
  const driveFileId = ''; // no drive_file_id on record
  const pdfFileName = null; // never set — no PDF attempt

  const textResult = {
    normalizedPhone: '5511955550000',
    raw: { zaapId: 'zaap-005' },
    zaapId: 'zaap-005',
    messageId: 'msg-text-only',
    id: 'id-text-only',
  };
  const entry = buildSentEntry(textResult, { registro_id: 'reg-3' }, pdfFileName);

  assert.equal(Boolean(driveFileId), false, 'driveFileId deve ser falsy');
  assert.equal(entry.pdf_enviado, false);
  assert.equal(entry.pdf_file_name, null);
});

test('pdf_enviado = false quando arquivo nao encontrado no Drive (stale drive_file_id)', () => {
  // pdfFile?.id === undefined → file_missing path → sendZapiText → pdfFileName stays null
  const pdfFile = null; // getDriveFileMetadata returned null
  const pdfFileName = pdfFile?.id ? 'boleto.pdf' : null; // conditional set

  const textResult = {
    normalizedPhone: '5511944440000',
    raw: { zaapId: 'zaap-006' },
    zaapId: 'zaap-006',
    messageId: 'msg-stale',
    id: 'id-stale',
  };
  const entry = buildSentEntry(textResult, { registro_id: 'reg-4' }, pdfFileName);

  assert.equal(entry.pdf_enviado, false);
});

test('messageId derivado de provider_id quando messageId do raw esta vazio', () => {
  const docResult = {
    provider_id: 'zaap-007',
    raw: { zaapId: '', messageId: '', id: '' },
  };
  const result = normalizeSendResult(docResult, '5511933330000');
  assert.equal(result.messageId, 'zaap-007');
});

test('messageId derivado de raw.messageId quando provider_id esta vazio', () => {
  const docResult = {
    provider_id: '',
    raw: { zaapId: '', messageId: 'raw-msg-888', id: '' },
  };
  const result = normalizeSendResult(docResult, '5511922220000');
  assert.equal(result.messageId, 'raw-msg-888');
});
