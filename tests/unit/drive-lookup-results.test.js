import { describe, it, expect } from 'vitest';
import { normalizeLookupItem, normalizeLookupResults } from '../../src/utils/driveLookupResults.js';

// ── normalizeLookupItem ───────────────────────────────────────────────────────

describe('normalizeLookupItem', () => {
  it('handles the canonical Edge Function flat shape', () => {
    const item = {
      file_id: 'abc123',
      file_name: 'boleto-joao-silva.pdf',
      score: 85,
      reasons: ['filename_boleto_match', 'value_match'],
      view_url: 'https://drive.google.com/file/d/abc123/view',
    };
    const result = normalizeLookupItem(item);
    expect(result.file_id).toBe('abc123');
    expect(result.file_name).toBe('boleto-joao-silva.pdf');
    expect(result.score).toBe(85);
    expect(result.reasons).toEqual(['filename_boleto_match', 'value_match']);
    expect(result.view_url).toBe('https://drive.google.com/file/d/abc123/view');
  });

  it('handles the legacy nested-file shape (file.name, file.webViewLink)', () => {
    const item = {
      file: {
        id: 'def456',
        name: 'boleto-empresa.pdf',
        webViewLink: 'https://drive.google.com/file/d/def456/view',
      },
      score: 60,
      reasons: ['value_match'],
    };
    const result = normalizeLookupItem(item);
    expect(result.file_id).toBe('def456');
    expect(result.file_name).toBe('boleto-empresa.pdf');
    expect(result.score).toBe(60);
    expect(result.view_url).toBe('https://drive.google.com/file/d/def456/view');
  });

  it('handles legacy shape with file.fileName instead of file.name', () => {
    const item = {
      file: { id: 'ghi789', fileName: 'nota-fiscal.pdf' },
      score: 55,
      reasons: [],
    };
    const result = normalizeLookupItem(item);
    expect(result.file_name).toBe('nota-fiscal.pdf');
  });

  it('returns empty string for file_name when no name field exists', () => {
    const item = { file_id: 'xyz', score: 40, reasons: [] };
    const result = normalizeLookupItem(item);
    expect(result.file_name).toBe('');
  });

  it('generates view_url from file_id when view_url is absent', () => {
    const item = { file_id: 'jkl000', file_name: 'boleto.pdf', score: 70, reasons: [] };
    const result = normalizeLookupItem(item);
    expect(result.view_url).toBe('https://drive.google.com/file/d/jkl000/view');
  });

  it('returns empty view_url when file_id is also absent', () => {
    const item = { file_name: 'boleto.pdf', score: 30, reasons: [] };
    const result = normalizeLookupItem(item);
    expect(result.view_url).toBe('');
  });

  it('coerces score to a number', () => {
    const item = { file_id: 'x', file_name: 'y.pdf', score: '90', reasons: [] };
    const result = normalizeLookupItem(item);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBe(90);
  });

  it('defaults score to 0 when absent', () => {
    const result = normalizeLookupItem({ file_id: 'a', file_name: 'b.pdf' });
    expect(result.score).toBe(0);
  });

  it('defaults reasons to empty array when absent', () => {
    const result = normalizeLookupItem({ file_id: 'a', file_name: 'b.pdf', score: 10 });
    expect(result.reasons).toEqual([]);
  });

  it('handles an empty object without throwing', () => {
    expect(() => normalizeLookupItem({})).not.toThrow();
    const result = normalizeLookupItem({});
    expect(result.file_id).toBe('');
    expect(result.file_name).toBe('');
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
    expect(result.view_url).toBe('');
  });

  it('does NOT fall back to "Arquivo sem nome" — returns empty string so UI decides the fallback', () => {
    const result = normalizeLookupItem({ file_id: 'z', score: 20 });
    expect(result.file_name).toBe('');
    expect(result.file_name).not.toBe('Arquivo sem nome');
  });
});

// ── normalizeLookupResults ────────────────────────────────────────────────────

describe('normalizeLookupResults', () => {
  it('returns an empty array for null input', () => {
    expect(normalizeLookupResults(null)).toEqual([]);
  });

  it('returns an empty array for undefined input', () => {
    expect(normalizeLookupResults(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array input', () => {
    expect(normalizeLookupResults('string')).toEqual([]);
    expect(normalizeLookupResults(42)).toEqual([]);
    expect(normalizeLookupResults({})).toEqual([]);
  });

  it('returns an empty array for an empty array', () => {
    expect(normalizeLookupResults([])).toEqual([]);
  });

  it('normalizes all items in an array', () => {
    const items = [
      {
        file_id: 'a1',
        file_name: 'boleto-a.pdf',
        score: 95,
        reasons: ['numero_match'],
        view_url: 'https://drive.google.com/file/d/a1/view',
      },
      {
        file_id: 'b2',
        file_name: 'boleto-b.pdf',
        score: 40,
        reasons: [],
        view_url: 'https://drive.google.com/file/d/b2/view',
      },
    ];
    const results = normalizeLookupResults(items);
    expect(results).toHaveLength(2);
    expect(results[0].file_name).toBe('boleto-a.pdf');
    expect(results[0].score).toBe(95);
    expect(results[1].file_name).toBe('boleto-b.pdf');
    expect(results[1].score).toBe(40);
  });

  it('mixes flat and nested shapes in the same array without error', () => {
    const items = [
      { file_id: 'flat1', file_name: 'flat.pdf', score: 80, reasons: [] },
      { file: { id: 'nested1', name: 'nested.pdf' }, score: 50, reasons: ['value_match'] },
    ];
    const results = normalizeLookupResults(items);
    expect(results[0].file_name).toBe('flat.pdf');
    expect(results[1].file_name).toBe('nested.pdf');
  });
});
