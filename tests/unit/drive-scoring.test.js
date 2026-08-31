import test from 'node:test';
import assert from 'node:assert/strict';

function toAsciiUpper(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function cleanAlnum(value) {
  return toAsciiUpper(value).replace(/[^A-Z0-9]/g, '');
}

function stripLeadingZeros(value) {
  if (!/^\d+$/.test(value)) return value;
  const stripped = value.replace(/^0+(?=\d)/, '');
  return stripped || '0';
}

function unique(values) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeFinancialId(value) {
  const raw = toAsciiUpper(value).replace(/\.PDF$/i, '').trim();
  const compact = cleanAlnum(raw);
  const digitsOnly = compact.replace(/\D/g, '');
  const rawParts = raw.split(/[\s/_.-]+/).filter(Boolean);
  const separatedTokens = rawParts.map((part) => cleanAlnum(part)).filter(Boolean);
  const segments = rawParts.map((part) => cleanAlnum(part)).filter(Boolean);

  let primary = compact;
  if (segments.length >= 2 && /^\d+$/.test(segments[0]) && /^\d+$/.test(segments[1]) && segments[0].length >= 4 && segments[1].length <= 2) {
    primary = segments[0];
  } else if (segments.length >= 1) {
    primary = segments[0];
  }

  const familyVariants = [];
  const baseSource = compact || primary;
  for (let trim = 1; trim <= 2; trim += 1) {
    if (baseSource.length - trim >= 4) {
      familyVariants.push(baseSource.slice(0, baseSource.length - trim));
    }
  }
  if (primary && primary.length >= 4) {
    familyVariants.push(primary);
    if (/^\d+$/.test(primary)) {
      familyVariants.push(stripLeadingZeros(primary));
    }
  }

  const variants = unique([
    compact,
    digitsOnly,
    primary,
    stripLeadingZeros(primary),
    ...segments,
    ...segments.map((segment) => stripLeadingZeros(segment)),
    ...familyVariants,
  ]);

  return {
    raw,
    compact,
    digitsOnly,
    primary,
    segments,
    variants,
    familyVariants: unique(familyVariants),
    separatedTokens,
  };
}

function extractFinancialIdsFromText(value) {
  const raw = toAsciiUpper(value).replace(/\.PDF$/i, '');
  const matches = raw.match(/[A-Z]*\d+(?:[/._-]\d+)*/g) || [];
  const variants = matches
    .map((item) => normalizeFinancialId(item))
    .filter((item) => item.compact.length >= 3 || item.digitsOnly.length >= 3);

  if (variants.length > 0) return variants;

  const fallback = normalizeFinancialId(raw);
  return fallback.compact ? [fallback] : [];
}

function compareFinancialIdVariants(left, right) {
  const exactLeft = new Set(unique([
    left.compact,
    left.digitsOnly,
    ...left.segments,
    ...left.segments.map((segment) => stripLeadingZeros(segment)),
  ]));
  const exactRight = new Set(unique([
    right.compact,
    right.digitsOnly,
    ...right.segments,
    ...right.segments.map((segment) => stripLeadingZeros(segment)),
  ]));
  const exactShared = unique([...exactLeft].filter((value) => exactRight.has(value)));
  const exact = exactShared.length > 0;

  const commonPrefixLength = (() => {
    const a = left.compact;
    const b = right.compact;
    const max = Math.min(a.length, b.length);
    let idx = 0;
    while (idx < max && a[idx] === b[idx]) idx += 1;
    return idx;
  })();

  const family =
    !exact &&
    Boolean(
      (left.primary && right.primary && left.primary === right.primary && left.primary.length >= 4) ||
      left.familyVariants.some((variant) => variant.length >= 4 && (right.compact.startsWith(variant) || right.variants.includes(variant))) ||
      right.familyVariants.some((variant) => variant.length >= 4 && (left.compact.startsWith(variant) || left.variants.includes(variant))) ||
      commonPrefixLength >= 4
    );

  return {
    exact,
    family,
  };
}

function normalize(s) {
  return s
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const GENERIC_NON_BOLETO_TOKENS = [
  'RELATORIO',
  'RECIBO',
  'RECIBOS',
  'NOTA',
  'COMPROVANTE',
  'CONTRATO',
  'PLANILHA',
  'MOBILAR NOTA',
];

function normalizePathForMatch(value) {
  return toAsciiUpper(value).replace(/\s+/g, ' ').trim();
}

function tokenListForMatch(value) {
  return normalizePathForMatch(value).split(/\s+/).filter((token) => token.length >= 3);
}

function countStrongTokenMatches(source, targetTokens) {
  const sourceTokens = new Set(tokenListForMatch(source));
  return targetTokens.filter((token) => sourceTokens.has(token)).length;
}

function containsGenericNonBoletoName(value) {
  const upper = normalizePathForMatch(value);
  return GENERIC_NON_BOLETO_TOKENS.some((token) => upper.includes(token));
}

function detectDriveNamingSignals(filename, folderHint, primaryFinancialId, clientName) {
  const upperFilename = normalizePathForMatch(filename);
  const upperFolder = normalizePathForMatch(folderHint);
  const compactId = normalizeFinancialId(primaryFinancialId).compact;
  const clientTokens = tokenListForMatch(clientName).slice(0, 4);
  const strongFileNameMatches = countStrongTokenMatches(filename, clientTokens);
  const strongFolderMatches = countStrongTokenMatches(folderHint, clientTokens);
  const normalizedId = normalizeFinancialId(compactId);
  const fileHasFinancialId = compactId
    ? extractFinancialIdsFromText(filename || '').some((candidate) => {
      const comparison = compareFinancialIdVariants(candidate, normalizedId);
      return comparison.exact || comparison.family;
    })
    : false;

  const escapedCompact = compactId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boletoPrefix = compactId
    ? new RegExp(`\\bBOLETO\\b[\\s_-]*[A-Z0-9]*${escapedCompact}`, 'i').test(upperFilename.replace(/\s+/g, ''))
      || /^BOLETO[\s_-]/i.test(String(filename || ''))
    : /^BOLETO[\s_-]/i.test(String(filename || ''));
  const numberDashClient = compactId
    ? new RegExp(`${escapedCompact}[\\s_-]*-[\\s_-]*[A-Z]`, 'i').test(upperFilename.replace(/\s+/g, ''))
    : false;

  return {
    boletoPrefix,
    numberDashClient,
    clientFolder: strongFolderMatches >= 2 || (strongFolderMatches >= 1 && upperFolder.length >= 8),
    genericDocument: containsGenericNonBoletoName(filename),
    strongFileNameMatches,
    strongFolderMatches,
    fileHasFinancialId,
  };
}

function scoreFileAgainstQueryV2(filename, parentFolderName, numberTokens, nameTokens, folderPathHint = parentFolderName) {
  const fnNorm = normalize(filename);
  const folderNorm = normalize(parentFolderName);
  const pathNorm = normalize(folderPathHint);
  const fileIds = extractFinancialIdsFromText(filename);
  const folderIds = extractFinancialIdsFromText(parentFolderName);
  const pathIds = extractFinancialIdsFromText(folderPathHint);
  const namingSignals = detectDriveNamingSignals(filename, folderPathHint, numberTokens[0] || numberTokens[1] || '', nameTokens.join(' '));

  const matched = [];
  const reasons = [];
  let score = 0;
  let exactMatch = false;
  let numMatchedCount = 0;

  for (const [idx, nt] of numberTokens.entries()) {
    const tokenId = normalizeFinancialId(nt);
    const tNorm = normalize(nt);
    if (!tNorm || !tokenId.compact) continue;

    const exactInFile = fnNorm.includes(tNorm)
      || fileIds.some((candidate) => compareFinancialIdVariants(tokenId, candidate).exact);
    const exactInFolder = !exactInFile && (
      folderNorm.includes(tNorm)
      || folderIds.some((candidate) => compareFinancialIdVariants(tokenId, candidate).exact)
    );
    const exactInPath = !exactInFile && !exactInFolder && (
      pathNorm.includes(tNorm)
      || pathIds.some((candidate) => compareFinancialIdVariants(tokenId, candidate).exact)
    );
    const familyInFile = !exactInFile && !exactInFolder && !exactInPath
      && fileIds.some((candidate) => compareFinancialIdVariants(tokenId, candidate).family);
    const familyInFolder = !exactInFile && !exactInFolder && !exactInPath && !familyInFile
      && folderIds.some((candidate) => compareFinancialIdVariants(tokenId, candidate).family);
    const familyInPath = !exactInFile && !exactInFolder && !exactInPath && !familyInFile && !familyInFolder
      && pathIds.some((candidate) => compareFinancialIdVariants(tokenId, candidate).family);

    if (!(exactInFile || exactInFolder || exactInPath || familyInFile || familyInFolder || familyInPath)) continue;

    numMatchedCount += 1;
    matched.push(nt);

    const location = exactInFile || familyInFile ? 'file' : exactInPath || familyInPath ? 'path' : 'folder';
    const matchKind = exactInFile || exactInFolder || exactInPath ? 'exact' : 'family';
    let pts = 0;

    if (idx === 0) {
      if (matchKind === 'exact') {
        pts = location === 'file' ? 100 : 90;
        exactMatch = true;
      } else {
        pts = location === 'file' ? 84 : 74;
      }
    } else if (idx === 1) {
      pts = matchKind === 'exact'
        ? (location === 'file' ? 30 : 20)
        : (location === 'file' ? 24 : 18);
    } else {
      pts = matchKind === 'exact'
        ? (location === 'file' ? 20 : 15)
        : (location === 'file' ? 14 : 10);
    }

    score += pts;
    reasons.push(`financial_${matchKind}_${location}:${nt}`);
  }

  if (numberTokens.length > 0 && numMatchedCount === 0) {
    return { score: 0, matched: [], reasons: ['rejected:no_number_match'], exact_match: false };
  }

  if (numberTokens.length > 0 && numMatchedCount === numberTokens.length) {
    score += 15;
    reasons.push('bonus:all_numbers_matched');
  }

  let nameMatchedCount = 0;
  for (const nt of nameTokens) {
    const tNorm = normalize(nt);
    if (!tNorm) continue;
    const inFile = fnNorm.includes(tNorm);
    const inFolder = folderNorm.includes(tNorm);
    const inPath = !inFile && !inFolder && pathNorm.includes(tNorm);
    if (!inFile && !inFolder && !inPath) continue;
    nameMatchedCount += 1;
    matched.push(nt);
    score += inFile ? 15 : inFolder ? 10 : 8;
    reasons.push(`name${inFile ? '_file' : inFolder ? '_folder' : '_path'}:${nt}`);
  }

  if (namingSignals.boletoPrefix && namingSignals.fileHasFinancialId) {
    score += 18;
    reasons.push('pattern:boleto_prefix');
  }
  if (namingSignals.numberDashClient && namingSignals.fileHasFinancialId) {
    score += 16;
    reasons.push('pattern:number_dash_client');
  }
  if (namingSignals.clientFolder && numMatchedCount > 0) {
    score += 14;
    reasons.push('pattern:client_folder');
  }
  if (namingSignals.strongFileNameMatches >= 2 && numMatchedCount > 0) {
    score += 12;
    reasons.push('pattern:client_tokens_in_filename');
  }
  if (namingSignals.strongFolderMatches >= 2 && numMatchedCount > 0) {
    score += 8;
    reasons.push('pattern:client_tokens_in_folder');
  }
  if (namingSignals.genericDocument) {
    score = Math.max(0, score - 45);
    reasons.push('penalty:generic_document');
  }

  if (nameTokens.length >= 2 && nameMatchedCount === 1 && numMatchedCount === 0) {
    return { score: 0, matched: [], reasons: ['rejected:single_name_no_number'], exact_match: false };
  }

  if (nameTokens.length >= 2 && nameMatchedCount === nameTokens.length) {
    score += 10;
    reasons.push('bonus:all_names_matched');
  }

  if (score === 0 || matched.length === 0) {
    return { score: 0, matched: [], reasons: ['no_match'], exact_match: false };
  }

  if (namingSignals.genericDocument && !exactMatch && score < 80) {
    return { score: 0, matched: [], reasons: ['rejected:generic_document'], exact_match: false };
  }

  return { score, matched, reasons, exact_match: exactMatch };
}

test('normaliza IDs financeiros comuns do ERP', () => {
  assert.equal(normalizeFinancialId('4240-2').compact, '42402');
  assert.equal(normalizeFinancialId('1244/002').compact, '1244002');
  assert.equal(normalizeFinancialId('F01-3').compact, 'F013');
});

test('4254-2 encontra 42541_0.pdf como family match forte', () => {
  const result = scoreFileAgainstQueryV2(
    'IDERLANDIOJESUSDEOLIVEIRA_42541_0.pdf',
    'ORTHOMAX',
    ['42542', '4254'],
    ['IDERLANDIO', 'OLIVEIRA'],
  );
  assert.ok(result.score >= 110, `score esperado >= 110, veio ${result.score}`);
  assert.equal(result.exact_match, false);
  assert.ok(result.reasons.some((reason) => reason.includes('financial_family_file:42542')));
});

test('1243/002 encontra 1243002_0.pdf como exact match', () => {
  const result = scoreFileAgainstQueryV2(
    'COLCHOESECIADEBRASILANDIALTDA_1243002_0.pdf',
    'ORTHOMAX',
    ['1243002', '1244'],
    ['COLCHOES', 'BRASILANDIA'],
  );
  assert.ok(result.score >= 135, `score esperado >= 135, veio ${result.score}`);
  assert.equal(result.exact_match, true);
});

test('1244/002 continua aceitando variacao ERP 1244001_0.pdf sem auto exact', () => {
  const result = scoreFileAgainstQueryV2(
    'RAMOSMOVEISEELETROLTDA_1244001_0.pdf',
    'ORTHOMAX',
    ['1244002', '1244'],
    ['RAMOS', 'ELETRO'],
  );
  assert.ok(result.score >= 100, `score esperado >= 100, veio ${result.score}`);
  assert.equal(result.exact_match, false);
  assert.ok(result.reasons.some((reason) => reason.includes('financial_family_file:1244002')));
});

test('BOLETO 2430-4 CLIENTE vence documento generico do mesmo cliente', () => {
  const boleto = scoreFileAgainstQueryV2(
    'BOLETO 2430-4 SUPER MOVEIS DA VOVO LTDA.pdf',
    'SUPER MOVEIS DA VOVO LTDA',
    ['24304', '2430'],
    ['SUPER', 'MOVEIS', 'VOVO'],
    'ORTHOMAX / CLIENTES / SUPER MOVEIS DA VOVO LTDA',
  );
  const relatorio = scoreFileAgainstQueryV2(
    'RELATORIO SUPER MOVEIS DA VOVO LTDA.pdf',
    'SUPER MOVEIS DA VOVO LTDA',
    ['24304', '2430'],
    ['SUPER', 'MOVEIS', 'VOVO'],
    'ORTHOMAX / CLIENTES / SUPER MOVEIS DA VOVO LTDA',
  );
  assert.ok(boleto.score > relatorio.score, `boleto deveria vencer relatorio (${boleto.score} vs ${relatorio.score})`);
  assert.ok(relatorio.score === 0 || relatorio.reasons.includes('rejected:generic_document'));
});

test('1234 - CLIENTE bate com titulo 1234-0', () => {
  const result = scoreFileAgainstQueryV2(
    '1234 - COLCHOES E CIA DE BRASILANDIA LTDA.pdf',
    'COLCHOES E CIA DE BRASILANDIA LTDA',
    ['12340', '1234'],
    ['COLCHOES', 'BRASILANDIA'],
    'ORTHOMAX / CLIENTES / COLCHOES E CIA DE BRASILANDIA LTDA',
  );
  assert.ok(result.score >= 120, `score esperado >= 120, veio ${result.score}`);
});

test('pasta com nome do cliente aumenta score', () => {
  const withFolder = scoreFileAgainstQueryV2(
    'BOLETO 2430-4.pdf',
    'SUPER MOVEIS DA VOVO LTDA',
    ['24304', '2430'],
    ['SUPER', 'MOVEIS', 'VOVO'],
    'ORTHOMAX / CLIENTES / SUPER MOVEIS DA VOVO LTDA',
  );
  const genericFolder = scoreFileAgainstQueryV2(
    'BOLETO 2430-4.pdf',
    'CLIENTES',
    ['24304', '2430'],
    ['SUPER', 'MOVEIS', 'VOVO'],
    'ORTHOMAX / CLIENTES',
  );
  assert.ok(withFolder.score > genericFolder.score, `pasta do cliente deveria aumentar score (${withFolder.score} vs ${genericFolder.score})`);
});

test('F01-3 encontra F013.pdf como exact match', () => {
  const result = scoreFileAgainstQueryV2(
    'GILMOVEISEELETRODOMESTICOSLTDA_F013.pdf',
    'ORTHOMAX',
    ['F013'],
    ['GIL', 'MOVEIS'],
  );
  assert.ok(result.score >= 125, `score esperado >= 125, veio ${result.score}`);
  assert.equal(result.exact_match, true);
});

test('nome parecido sem identificador financeiro suficiente nao passa', () => {
  const result = scoreFileAgainstQueryV2(
    'MENEZESEBATISTALTDAME_3006.pdf',
    'CLIENTES',
    ['42402', '4240'],
    ['MENEZES', 'BATISTA'],
  );
  assert.equal(result.score, 0);
  assert.ok(result.reasons.some((reason) => reason.includes('rejected')));
});
