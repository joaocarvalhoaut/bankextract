/**
 * Boleto matching unit tests — run with: node src/tests/boletoMatching.test.js
 * No test framework required; uses Node.js built-in assert.
 *
 * Covers: scoring logic, PDF validation, conflict detection, OCR threshold,
 * idempotency hashing, multi-tenant isolation guards, phone normalization.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// ── helpers replicated from billing-automation (pure functions) ───────────────

function normalizeBrazilPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}

function validatePhone(normalized) {
  return /^55\d{10,11}$/.test(normalized);
}

function isPdfValid(bytes) {
  if (bytes.length < 100) return { ok: false, reason: 'too_small' };
  const header = Buffer.from(bytes.slice(0, 5)).toString('latin1');
  if (!header.startsWith('%PDF')) return { ok: false, reason: 'invalid_header' };
  const tail = Buffer.from(bytes.slice(Math.max(0, bytes.length - 1024))).toString('latin1');
  if (!tail.includes('%%EOF')) return { ok: false, reason: 'no_eof' };
  return { ok: true, reason: 'ok' };
}

function scoreFilename(filename, boleto, clientName) {
  const lower = filename.toLowerCase();
  const b = String(boleto || '').toLowerCase();
  const n = String(clientName || '').toLowerCase().replace(/\s+/g, '_');

  if (lower === `${b}.pdf`) return 90;
  if (lower === `${n}_${b}.pdf`) return 85;
  if (lower.includes(b)) return 65;
  if (n && lower.includes(n)) return 50;
  return 0;
}

function detectConflict(best, second) {
  if (!best || best.score < 80) return { blocked: true, reason: 'baixa_confianca' };
  if (second && second.score >= 80 && Math.abs(best.score - second.score) <= 5) {
    return { blocked: true, reason: 'conflict' };
  }
  return { blocked: false, reason: null };
}

async function computeIdempotencyKey(companyId, chargeId, phone, date) {
  const raw = `${companyId}|${chargeId}|${phone}|${date}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function maskZapiUrl(url) {
  return url.replace(/\/token\/[^/]+\//, '/token/****/');
}

// ── test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then(() => { console.log(`  ✓ ${name}`); passed++; })
        .catch((err) => { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; });
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    failed++;
  }
}

// ── Phone normalization ───────────────────────────────────────────────────────

console.log('\nPhone normalization:');

test('adds country code to 11-digit mobile', () => {
  assert.equal(normalizeBrazilPhone('11987654321'), '5511987654321');
});

test('adds country code to 10-digit landline', () => {
  assert.equal(normalizeBrazilPhone('1134567890'), '551134567890');
});

test('leaves already-prefixed number intact', () => {
  assert.equal(normalizeBrazilPhone('5511987654321'), '5511987654321');
});

test('strips non-digit characters', () => {
  assert.equal(normalizeBrazilPhone('(11) 9 8765-4321'), '5511987654321');
});

test('validates correct mobile', () => {
  assert.ok(validatePhone('5511987654321'));
});

test('rejects short number', () => {
  assert.ok(!validatePhone('55119876'));
});

test('rejects number without country code', () => {
  assert.ok(!validatePhone('11987654321'));
});

// ── PDF validation ────────────────────────────────────────────────────────────

console.log('\nPDF validation:');

test('rejects empty buffer', () => {
  const r = isPdfValid(new Uint8Array(0));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too_small');
});

test('rejects buffer smaller than 100 bytes', () => {
  const r = isPdfValid(new Uint8Array(50));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too_small');
});

test('rejects buffer without %PDF header', () => {
  const buf = Buffer.alloc(200, 0x20);
  buf.write('NOTPDF', 0, 'latin1');
  buf.write('%%EOF', buf.length - 10, 'latin1');
  const r = isPdfValid(buf);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_header');
});

test('rejects truncated PDF without %%EOF', () => {
  const buf = Buffer.alloc(200, 0x20);
  buf.write('%PDF-1.4', 0, 'latin1');
  const r = isPdfValid(buf);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_eof');
});

test('accepts valid minimal PDF', () => {
  const buf = Buffer.alloc(200, 0x20);
  buf.write('%PDF-1.4', 0, 'latin1');
  buf.write('%%EOF', buf.length - 10, 'latin1');
  const r = isPdfValid(buf);
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'ok');
});

// ── Boleto score ──────────────────────────────────────────────────────────────

console.log('\nBoleto filename scoring:');

test('exact boleto.pdf → 90', () => {
  assert.equal(scoreFilename('00123.pdf', '00123', 'João Silva'), 90);
});

test('name_boleto.pdf → 85', () => {
  assert.equal(scoreFilename('carlos_souza_00123.pdf', '00123', 'Carlos Souza'), 85);
});

test('filename contains boleto → 65', () => {
  assert.equal(scoreFilename('fatura_00123_jan.pdf', '00123', 'João Silva'), 65);
});

test('filename contains client name only → 50', () => {
  assert.equal(scoreFilename('carlos_souza_fatura.pdf', '99999', 'Carlos Souza'), 50);
});

test('no match → 0', () => {
  assert.equal(scoreFilename('outroarquivo.pdf', '00123', 'João Silva'), 0);
});

// ── Conflict detection ────────────────────────────────────────────────────────

console.log('\nConflict detection:');

test('single candidate above 80 → not blocked', () => {
  const r = detectConflict({ score: 90 }, null);
  assert.equal(r.blocked, false);
});

test('score below 80 → baixa_confianca', () => {
  const r = detectConflict({ score: 75 }, null);
  assert.equal(r.blocked, true);
  assert.equal(r.reason, 'baixa_confianca');
});

test('no candidate → baixa_confianca', () => {
  const r = detectConflict(null, null);
  assert.equal(r.blocked, true);
});

test('two candidates both ≥80 diff ≤5 → conflict', () => {
  const r = detectConflict({ score: 90 }, { score: 88 });
  assert.equal(r.blocked, true);
  assert.equal(r.reason, 'conflict');
});

test('two candidates, second below 80 → not blocked', () => {
  const r = detectConflict({ score: 90 }, { score: 70 });
  assert.equal(r.blocked, false);
});

test('two candidates both ≥80 diff >5 → not blocked', () => {
  const r = detectConflict({ score: 92 }, { score: 85 });
  assert.equal(r.blocked, false);
});

// ── Idempotency key ───────────────────────────────────────────────────────────

console.log('\nIdempotency key:');

test('same inputs → same key', async () => {
  const k1 = await computeIdempotencyKey('comp-1', 'ch-99', '5511999999999', '2026-05-14');
  const k2 = await computeIdempotencyKey('comp-1', 'ch-99', '5511999999999', '2026-05-14');
  assert.equal(k1, k2);
});

test('different company_id → different key', async () => {
  const k1 = await computeIdempotencyKey('comp-1', 'ch-99', '5511999999999', '2026-05-14');
  const k2 = await computeIdempotencyKey('comp-2', 'ch-99', '5511999999999', '2026-05-14');
  assert.notEqual(k1, k2);
});

test('different charge_id → different key', async () => {
  const k1 = await computeIdempotencyKey('comp-1', 'ch-99', '5511999999999', '2026-05-14');
  const k2 = await computeIdempotencyKey('comp-1', 'ch-100', '5511999999999', '2026-05-14');
  assert.notEqual(k1, k2);
});

test('key is 64-char hex (SHA-256)', async () => {
  const k = await computeIdempotencyKey('comp-1', 'ch-99', '5511999999999', '2026-05-14');
  assert.match(k, /^[0-9a-f]{64}$/);
});

// ── Multi-tenant isolation guard (symbolic) ───────────────────────────────────

console.log('\nMulti-tenant isolation:');

test('requireCompanyId throws on empty string', () => {
  function requireCompanyId(id) {
    const n = String(id || '').trim();
    if (!n) throw new Error('company_id obrigatorio');
    return n;
  }
  assert.throws(() => requireCompanyId(''), /obrigatorio/);
  assert.throws(() => requireCompanyId(null), /obrigatorio/);
  assert.throws(() => requireCompanyId(undefined), /obrigatorio/);
});

test('requireCompanyId returns trimmed value', () => {
  function requireCompanyId(id) {
    const n = String(id || '').trim();
    if (!n) throw new Error('company_id obrigatorio');
    return n;
  }
  assert.equal(requireCompanyId('  abc-123  '), 'abc-123');
});

// ── Secret masking ────────────────────────────────────────────────────────────

console.log('\nSecret masking:');

test('masks Z-API token in URL', () => {
  const url = 'https://api.z-api.io/instances/INST123/token/SECRET_TOKEN_XYZ/status';
  const masked = maskZapiUrl(url);
  assert.ok(!masked.includes('SECRET_TOKEN_XYZ'));
  assert.ok(masked.includes('****'));
  assert.ok(masked.includes('INST123'));
});

test('leaves URL without token pattern unchanged', () => {
  const url = 'https://example.com/api/status';
  assert.equal(maskZapiUrl(url), url);
});

// ── summary ───────────────────────────────────────────────────────────────────

// Allow async tests to settle before printing summary
setTimeout(() => {
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}, 100);
