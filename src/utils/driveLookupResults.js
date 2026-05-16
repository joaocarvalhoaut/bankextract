function normalizeReasons(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

export function normalizeDriveLookupResult(item = {}) {
  const file = item.file && typeof item.file === 'object' ? item.file : {};
  const fileId = item.file_id || item.fileId || file.id || null;
  const fileName =
    item.file_name ||
    item.fileName ||
    file.name ||
    file.fileName ||
    null;
  const viewUrl =
    item.view_url ||
    item.viewUrl ||
    file.webViewLink ||
    file.viewUrl ||
    (fileId ? `https://drive.google.com/file/d/${fileId}/view` : null);
  const reasons = normalizeReasons(item.reasons);

  return {
    ...item,
    file_id: fileId,
    file_name: fileName,
    fileName,
    score: Number(item.score || 0),
    reasons,
    match_origin: item.match_origin || item.matchOrigin || reasons[0] || null,
    view_url: viewUrl,
    viewUrl,
    file: {
      ...file,
      id: fileId,
      name: fileName,
      fileName,
      webViewLink: viewUrl,
      viewUrl,
    },
  };
}

export function normalizeDriveLookupResults(results = []) {
  if (!Array.isArray(results)) return [];
  return results.map((item) => normalizeDriveLookupResult(item));
}
