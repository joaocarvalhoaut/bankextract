export interface FinancialIdVariantSet {
  raw: string;
  compact: string;
  digitsOnly: string;
  primary: string;
  segments: string[];
  variants: string[];
  familyVariants: string[];
  separatedTokens: string[];
}

function toAsciiUpper(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function cleanAlnum(value: string | null | undefined) {
  return toAsciiUpper(value).replace(/[^A-Z0-9]/g, '');
}

function stripLeadingZeros(value: string) {
  if (!/^\d+$/.test(value)) return value;
  const stripped = value.replace(/^0+(?=\d)/, '');
  return stripped || '0';
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

export function normalizeFinancialId(value: string | null | undefined): FinancialIdVariantSet {
  const raw = toAsciiUpper(value).replace(/\.PDF$/i, '').trim();
  const compact = cleanAlnum(raw);
  const digitsOnly = compact.replace(/\D/g, '');
  const rawParts = raw.split(/[\s/_\-.]+/).filter(Boolean);
  const separatedTokens = rawParts.map((part) => cleanAlnum(part)).filter(Boolean);
  const segments = rawParts.map((part) => cleanAlnum(part)).filter(Boolean);

  let primary = compact;
  if (segments.length >= 2 && /^\d+$/.test(segments[0]) && /^\d+$/.test(segments[1]) && segments[0].length >= 4 && segments[1].length <= 2) {
    primary = segments[0];
  } else if (segments.length >= 1) {
    primary = segments[0];
  }

  const familyVariants: string[] = [];
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

export function extractFinancialIdsFromText(value: string | null | undefined): FinancialIdVariantSet[] {
  const raw = toAsciiUpper(value).replace(/\.PDF$/i, '');
  const matches = raw.match(/[A-Z]*\d+(?:[\/._-]\d+)*/g) || [];
  const variants = matches
    .map((item) => normalizeFinancialId(item))
    .filter((item) => item.compact.length >= 3 || item.digitsOnly.length >= 3);

  if (variants.length > 0) return variants;

  const fallback = normalizeFinancialId(raw);
  return fallback.compact ? [fallback] : [];
}

export function compareFinancialIdVariants(
  left: FinancialIdVariantSet,
  right: FinancialIdVariantSet,
): { exact: boolean; family: boolean; shared: string[]; matchedBy: string[] } {
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
  const leftSet = new Set(left.variants);
  const rightSet = new Set(right.variants);
  const exactShared = unique([...exactLeft].filter((value) => exactRight.has(value)));
  const shared = unique([...leftSet].filter((value) => rightSet.has(value)));
  const exact = exactShared.length > 0;

  const matchedBy: string[] = [];
  if (exact) {
    matchedBy.push('financial_id_normalized');
  }

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
      commonPrefixLength >= 4,
    );

  if (family) {
    matchedBy.push('financial_id_family');
  }

  return {
    exact,
    family,
    shared,
    matchedBy,
  };
}

export function buildFinancialLookupVariants(value: string | null | undefined) {
  const normalized = normalizeFinancialId(value);
  return unique([
    normalized.compact,
    normalized.primary,
    ...normalized.familyVariants,
    ...normalized.separatedTokens,
  ]).filter((item) => item.length >= 3);
}
