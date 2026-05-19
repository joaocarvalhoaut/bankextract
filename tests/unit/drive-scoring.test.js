/**
 * drive-scoring.test.js
 *
 * JS mirror of the scoreFileAgainstQuery function from the Edge Function.
 * Validates the weighted scoring algorithm:
 *   - exact number (idx=0)  → 100 in file / 90 in folder
 *   - base number  (idx=1)  →  30 in file / 20 in folder
 *   - name tokens            →  15 in file / 10 in folder
 *   - all numbers bonus: +15 | all names bonus: +10
 *   - score NOT capped — exact matches reach 185+, base-only ~70
 *   - exact_match=true when numberTokens[0] matched
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ── Mirror of scoreFileAgainstQuery from index.ts ────────────────────────────

function normalize(s) {
  return s
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function scoreFileAgainstQuery(filename, parentFolderName, numberTokens, nameTokens) {
  const fnNorm = normalize(filename);
  const folderNorm = normalize(parentFolderName);

  const matched = [];
  const reasons = [];
  let score = 0;
  let exactMatch = false;

  // ── Number tokens ────────────────────────────────────────────────────────────
  let numMatchedCount = 0;
  numberTokens.forEach((nt, idx) => {
    const tNorm = normalize(nt);
    if (!tNorm) return;
    const inFile = fnNorm.includes(tNorm);
    const inFolder = folderNorm.includes(tNorm);
    if (inFile || inFolder) {
      numMatchedCount++;
      matched.push(nt);
      let pts;
      if (idx === 0) {
        pts = inFile ? 100 : 90;
        exactMatch = true;
      } else if (idx === 1) {
        pts = inFile ? 30 : 20;
      } else {
        pts = inFile ? 20 : 15;
      }
      score += pts;
      reasons.push(`num${inFile ? '_file' : '_folder'}:${nt}`);
    }
  });

  // HARD REJECTION: query has number tokens but NONE matched
  if (numberTokens.length > 0 && numMatchedCount === 0) {
    return { score: 0, matched: [], reasons: ['rejected:no_number_match'], exact_match: false };
  }

  // Bonus: all number tokens matched
  if (numberTokens.length > 0 && numMatchedCount === numberTokens.length) {
    score += 15;
    reasons.push('bonus:all_numbers_matched');
  }

  // ── Name tokens ──────────────────────────────────────────────────────────────
  let nameMatchedCount = 0;
  for (const nt of nameTokens) {
    const tNorm = normalize(nt);
    if (!tNorm) continue;
    const inFile = fnNorm.includes(tNorm);
    const inFolder = folderNorm.includes(tNorm);
    if (inFile || inFolder) {
      nameMatchedCount++;
      matched.push(nt);
      score += inFile ? 15 : 10;
      reasons.push(`name${inFile ? '_file' : '_folder'}:${nt}`);
    }
  }

  // HARD REJECTION: 2+ name tokens but only 1 matched AND no number matched
  if (nameTokens.length >= 2 && nameMatchedCount === 1 && numMatchedCount === 0) {
    return { score: 0, matched: [], reasons: ['rejected:single_name_no_number'], exact_match: false };
  }

  // Bonus: all name tokens matched
  if (nameTokens.length >= 2 && nameMatchedCount === nameTokens.length) {
    score += 10;
    reasons.push('bonus:all_names_matched');
  }

  // NOTE: score is NOT capped — exact matches reach 185+

  if (score === 0 || matched.length === 0) {
    return { score: 0, matched: [], reasons: ['no_match'], exact_match: false };
  }

  return { score, matched, reasons, exact_match: exactMatch };
}

// ── Query: "menezes e batista, 4239-2" ────────────────────────────────────────
// tokens: numbers=["42392","4239"]  names=["menezes","batista"]
const numTokens  = ['42392', '4239'];
const nameTokens = ['menezes', 'batista'];

// ── Expected scores with new scheme ──────────────────────────────────────────
// MENEZESEBATISTALTDAME_42392_4.pdf (exact match):
//   "42392" in file → 100 | "4239" in file → 30 | both → +15
//   "menezes" in file → 15 | "batista" in file → 15 | both → +10 = 185
const EXACT_EXPECTED = 185;

// MENEZESEBATISTALTDAME_42391_0.pdf (base-only):
//   "42392" NOT in file | "4239" in file → 30
//   "menezes" in file → 15 | "batista" in file → 15 | both → +10 = 70
const BASE_ONLY_EXPECTED = 70;

const MIN_RESULT = 50; // MIN_SCORE used by the edge function

// ── Tests ─────────────────────────────────────────────────────────────────────

test('arquivo com match exato (42392) deve receber score 185 e exact_match=true', () => {
  const { score, matched, exact_match } = scoreFileAgainstQuery(
    'MENEZESEBATISTALTDAME_42392_4.pdf',
    '4239',
    numTokens,
    nameTokens,
  );
  assert.equal(score, EXACT_EXPECTED, `score foi ${score}, esperado ${EXACT_EXPECTED}`);
  assert.equal(exact_match, true, 'deve ter exact_match=true');
  assert.ok(matched.includes('42392'), 'deve ter matched token 42392');
  assert.ok(matched.includes('menezes'), 'deve ter matched token menezes');
  assert.ok(matched.includes('batista'), 'deve ter matched token batista');
});

test('arquivo base-only (42391) deve receber score 70 e exact_match=false', () => {
  const { score, exact_match } = scoreFileAgainstQuery(
    'MENEZESEBATISTALTDAME_42391_0.pdf',
    '4239',
    numTokens,
    nameTokens,
  );
  assert.equal(score, BASE_ONLY_EXPECTED, `score foi ${score}, esperado ${BASE_ONLY_EXPECTED}`);
  assert.equal(exact_match, false, 'deve ter exact_match=false');
});

test('arquivo exato deve superar todos os arquivos base-only na ordenação', () => {
  const files = [
    'MENEZESEBATISTALTDAME_42395_1.pdf',
    'MENEZESEBATISTALTDAME_42394_2.pdf',
    'MENEZESEBATISTALTDAME_42393_3.pdf',
    'MENEZESEBATISTALTDAME_42392_4.pdf',  // alvo
    'MENEZESEBATISTALTDAME_42391_0.pdf',
  ].map((name) => ({ name, ...scoreFileAgainstQuery(name, '4239', numTokens, nameTokens) }));

  const sorted = files.sort((a, b) => b.score - a.score);
  assert.equal(sorted[0].name, 'MENEZESEBATISTALTDAME_42392_4.pdf',
    `primeiro resultado deve ser 42392, foi: ${sorted[0].name}`);
  assert.equal(sorted[0].exact_match, true, 'primeiro deve ter exact_match=true');
  // Todos os outros devem ter exact_match=false
  for (const f of sorted.slice(1)) {
    assert.equal(f.exact_match, false, `${f.name} deveria ter exact_match=false`);
  }
});

test('SEBASTIAO BATISTA.pdf DEVE ser rejeitado (sem match numérico)', () => {
  const { score, reasons } = scoreFileAgainstQuery(
    'SEBASTIAO BATISTA.pdf',
    'CLIENTES',
    numTokens,
    nameTokens,
  );
  assert.equal(score, 0, `score foi ${score}, esperado 0 — falso positivo`);
  assert.ok(
    reasons.some((r) => r.includes('rejected')),
    `deve ter razão de rejeição, teve: ${reasons.join(', ')}`,
  );
});

test('arquivo com apenas token batista e sem número não passa MIN_SCORE', () => {
  const { score } = scoreFileAgainstQuery(
    'JOAO BATISTA SILVA.pdf',
    'OUTROS',
    numTokens,
    nameTokens,
  );
  assert.equal(score, 0, `score foi ${score}, deve ser 0 por falta de número`);
});

test('arquivo com número correto e nome parcial ainda pode aparecer', () => {
  // "4239" está no nome do arquivo mas não "menezes" — porém pasta "MENEZES E BATISTA" cobre ambos
  const { score, exact_match } = scoreFileAgainstQuery(
    'BATISTA_4239_2.pdf',          // fnNorm = "batista42392" → "42392" presente → exact!
    'MENEZES E BATISTA',
    numTokens,
    nameTokens,
  );
  // "42392" in "batista42392" → YES → exact_match=true
  assert.ok(score >= MIN_RESULT, `score foi ${score}, esperado >= ${MIN_RESULT}`);
  assert.equal(exact_match, true, 'BATISTA_4239_2 normaliza para batista42392 que contém 42392');
});

test('score máximo para match perfeito (arquivo + pasta + todos os tokens)', () => {
  // 100 (exact file) + 30 (base file) + 15 (all num bonus) + 15 (menezes) + 15 (batista) + 10 (all name bonus) = 185
  const { score } = scoreFileAgainstQuery(
    'MENEZESEBATISTA_42392_4.pdf',
    '4239',
    numTokens,
    nameTokens,
  );
  assert.equal(score, EXACT_EXPECTED, `score foi ${score}, esperado ${EXACT_EXPECTED}`);
});

test('query sem números: arquivo com match de nome deve aparecer', () => {
  const { score, matched } = scoreFileAgainstQuery(
    'JOAO SILVA.pdf',
    'CLIENTES',
    [],            // no number tokens
    ['joao', 'silva'],
  );
  // 15+15+10 = 40 ≥ MIN_SCORE_NAMES_ONLY(20)
  assert.ok(score >= 20, `score foi ${score}, esperado >= 20`);
  assert.ok(matched.includes('joao'), 'deve ter matched joao');
  assert.ok(matched.includes('silva'), 'deve ter matched silva');
});

test('query sem números: arquivo com apenas 1/2 tokens deve ser rejeitado', () => {
  const { score, reasons } = scoreFileAgainstQuery(
    'PEDRO SILVA.pdf',
    'OUTROS',
    [],
    ['joao', 'silva'],
  );
  assert.equal(score, 0, `score foi ${score}, esperado 0`);
  assert.ok(reasons.some((r) => r.includes('rejected')), `esperado rejeição, recebeu: ${reasons.join(', ')}`);
});

test('pasta pai contribui com pontos quando o nome do arquivo não cobre o token', () => {
  // Arquivo genérico em pasta "4239" — pasta cobre base number
  const { score, matched } = scoreFileAgainstQuery(
    'BOLETO_MENEZESEBATISTA.pdf',
    '4239',
    numTokens,
    nameTokens,
  );
  // "42392" not in "boletomenezesebatista", not in "4239" → exact_match=false
  // "4239" not in "boletomenezesebatista", YES in "4239" → 20 pts (folder idx=1)
  // "menezes" in file → 15, "batista" in file → 15, all names → 10
  // Total = 20+15+15+10 = 60
  assert.ok(score > 0, `score foi ${score}, esperado > 0 pois pasta cobre o número`);
  assert.ok(matched.some((t) => t === '4239' || t === '42392'), 'deve ter matched algum número');
});
