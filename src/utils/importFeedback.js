export function buildImportCompletionFeedback({
  importedCount = 0,
  skippedDuplicates = 0,
  fileName = '',
} = {}) {
  const safeImportedCount = Math.max(0, Number(importedCount || 0));
  const safeSkippedDuplicates = Math.max(0, Number(skippedDuplicates || 0));
  const safeFileName = String(fileName || 'sem nome');

  if (safeImportedCount > 0) {
    return {
      kind: safeSkippedDuplicates > 0 ? 'duplicates_ignored' : 'import_success',
      notificationMessage: safeSkippedDuplicates > 0
        ? `${safeImportedCount} registro(s) foram confirmados no lote ${safeFileName} e ${safeSkippedDuplicates} duplicado(s) foram ignorado(s).`
        : `${safeImportedCount} registro(s) foram confirmados no lote ${safeFileName}.`,
      toastMessage: safeSkippedDuplicates > 0
        ? `${safeImportedCount} registro(s) importado(s) e ${safeSkippedDuplicates} duplicado(s) ignorado(s).`
        : `${safeImportedCount} registro(s) importado(s) com sucesso.`,
    };
  }

  return {
    kind: 'all_duplicates_ignored',
    notificationMessage: `Nenhum novo registro foi inserido no lote ${safeFileName} porque todos os itens ja existiam na carteira.`,
    toastMessage: 'Nenhum novo registro foi inserido porque o lote continha apenas duplicatas ja existentes.',
  };
}
