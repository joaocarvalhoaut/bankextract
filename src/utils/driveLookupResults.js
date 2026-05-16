/**
 * driveLookupResults.js
 *
 * Normalizes Drive boleto lookup result items returned by the
 * billing-automation Edge Function action `test_boleto_lookup`.
 *
 * Edge Function shape (canonical):
 *   { file_id, file_name, score, reasons[], view_url }
 *
 * Legacy/alternative shape (nested file object):
 *   { file: { id, name, webViewLink }, score, reasons[] }
 */

/**
 * Normalizes a single Drive boleto lookup result item.
 *
 * @param {object} item - Raw item from the API response.
 * @returns {{ file_id: string, file_name: string, score: number, reasons: string[], view_url: string }}
 */
export function normalizeLookupItem(item = {}) {
  // Support both the flat Edge Function shape and the legacy nested-file shape.
  const nested = item.file || {};

  const file_id = item.file_id || nested.id || '';
  const file_name = item.file_name || nested.name || nested.fileName || '';
  const score = Number(item.score ?? nested.score ?? 0);
  const reasons = Array.isArray(item.reasons)
    ? item.reasons
    : Array.isArray(nested.reasons)
      ? nested.reasons
      : [];
  const view_url =
    item.view_url ||
    nested.webViewLink ||
    (file_id ? `https://drive.google.com/file/d/${file_id}/view` : '');

  return { file_id, file_name, score, reasons, view_url };
}

/**
 * Normalizes an array of Drive boleto lookup result items.
 *
 * @param {unknown} results - Raw results array from the API response.
 * @returns {Array<ReturnType<normalizeLookupItem>>}
 */
export function normalizeLookupResults(results = []) {
  if (!Array.isArray(results)) return [];
  return results.map(normalizeLookupItem);
}
