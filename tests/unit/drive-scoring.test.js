/**
 * drive-scoring.test.js
 *
 * JS mirror of the scoreFileAgainstQuery function from the Edge Function.
 * Validates the weighted scoring algorithm: numbers mandatory, folder context,
 * and hard-rejection of false-positives like "SEBASTIAO BATISTA" when searching
 * for "menezes e batista, 4239-2".
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

  // ── Number tokens ────────────────────────────────────────────────────────────
  let numMatchedCount = 0;
  const numPts = [60, 35, 25];
  numberTokens.forEach((nt, idx) => {
    const tNorm = normalize(nt);
    if (!tNorm) return;
    const inFile = fnNorm.includes(tNorm);
    const inFolder = folderNorm.includes(tNorm);
    if (inFile || inFolder) {
      numMatchedCount++;
      matched.push(nt);
      const pts = numPts[idx] ?? 20;
      score += inFile ? pts : Math.round(pts * 0.8);
      reasons.push(`num${inFile ? '_file' : '_folder'}:${nt}`);
    }
  });

  // HARD REJECTION: query has number tokens but NONE matched
  if (numberTokens.length > 0 && numMatchedCount === 0) {
    return { score: 0, matched: [], reasons: ['rejected:no_number_match'] };
  }

  // Bonus: all number tokens matched
  if (numberTokens.length > 0 && numMatchedCount === numberTokens.length) {
    score += 20;
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
      score += inFile ? 25 : 15;
      reasons.push(`name${inFile ? '_file' : '_folder'}:${nt}`);
    }
  }

  // HARD REJECTION: 2+ name tokens but only 1 matched AND no number matched
  if (nameTokens.length >= 2 && nameMatchedCount === 1 && numMatchedCount === 0) {
    return { score: 0, matched: [], reasons: ['rejected:single_name_no_number'] };
  }

  // Bonus: all name tokens matched
  if (nameTokens.length >= 2 && nameMatchedCount === nameTokens.length) {
    score += 20;
    reasons.push('bonus:all_names_matched');
  }

  score = Math.min(100, score);

  if (score === 0 || matched.length === 0) {
    return { score: 0, matched: [], reasons: ['no_match'] };
  }

  return { score, matched, reasons };
}

// ── Tests ────────────────────────────────────────────────────────────────────

// Query: "menezes e batista, 4239-2"
// Expected tokens: numbers=["42392","4239"]  names=["menezes","batista"]
const numTokens = ['42392', '4239'];
const nameTokens = ['menezes', 'batista'];
const MIN_SCORE = 50;

test('MENEZESEBATISTALTDAME_42392_4.pdf na pasta 4239 deve receber score >= 50', () => {
  const { score, matched, reasons } = scoreFileAgainstQuery(
    'MENEZESEBATISTALTDAME_42392_4.pdf',
    '4239',
    numTokens,
    nameTokens,
  );
  assert.ok(score >= MIN_SCORE, `score foi ${score}, esperado >= ${MIN_SCORE}`);
  assert.ok(matched.includes('42392'), 'deve ter matched token 42392');
  assert.ok(matched.includes('menezes'), 'deve ter matched token menezes');
  assert.ok(matched.includes('batista'), 'deve ter matched token batista');
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
  // "4239" está no nome do arquivo mas não "menezes"
  const { score } = scoreFileAgainstQuery(
    'BATISTA_4239_2.pdf',
    'MENEZES E BATISTA',
    numTokens,
    nameTokens,
  );
  // Tem número → não é rejeitado, score pode ser baixo mas > 0
  // Folder "MENEZES E BATISTA" → normalisado → "menezesebatista" que contém "menezes" e "batista"
  assert.ok(score >= MIN_SCORE, `score foi ${score}, esperado >= ${MIN_SCORE} pois número e nomes estão na pasta`);
});

test('score máximo 100 para match perfeito (arquivo + pasta + todos os tokens)', () => {
  const { score } = scoreFileAgainstQuery(
    'MENEZESEBATISTA_42392_4.pdf',
    '4239',
    numTokens,
    nameTokens,
  );
  assert.equal(score, 100, `score foi ${score}, esperado 100 (capped)`);
});

test('query sem números: arquivo com match de nome deve aparecer', () => {
  const { score, matched } = scoreFileAgainstQuery(
    'JOAO SILVA.pdf',
    'CLIENTES',
    [],            // no number tokens
    ['joao', 'silva'],
  );
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
  // Arquivo genérico "BOLETO.pdf" mas pasta "4239" cobre o número
  const { score, matched } = scoreFileAgainstQuery(
    'BOLETO_MENEZESEBATISTA.pdf',
    '4239',
    numTokens,
    nameTokens,
  );
  // pasta cobre "4239" → deve ter num match → não é rejeitado
  assert.ok(score > 0, `score foi ${score}, esperado > 0 pois pasta cobre o número`);
  assert.ok(matched.some((t) => t === '4239' || t === '42392'), 'deve ter matched algum número');
});
