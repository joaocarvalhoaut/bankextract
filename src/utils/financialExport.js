const FRIENDLY_TIPO_LABELS = {
  vencidos: 'Vencidos',
  a_vencer: 'A vencer',
  liquidacao: 'Liquidacao',
};

const sanitizeCell = (value) => {
  if (value === null || typeof value === 'undefined') return '';

  const raw = String(value);
  return /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
};

const titleCaseFromSlug = (value) =>
  String(value || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(' ');

export function getFinancialTipoLabel(tipo) {
  const normalized = String(tipo || '').trim().toLowerCase();
  if (!normalized) return FRIENDLY_TIPO_LABELS.vencidos;
  return FRIENDLY_TIPO_LABELS[normalized] || titleCaseFromSlug(normalized);
}

export function buildFinancialExportRows(rows = []) {
  const header = ['Cliente', 'Documento', 'Vencimento', 'Valor', 'Telefone', 'Status', 'Tipo', 'batch_id'];
  const lines = rows.map((row) =>
    [
      sanitizeCell(row.nome),
      sanitizeCell(row.documento || row.numero_boleto || row.numeroBoleto || ''),
      sanitizeCell(row.data_vencimento),
      sanitizeCell(String(row.valor).replace('.', ',')),
      sanitizeCell(row.telefone || ''),
      sanitizeCell(row.status),
      sanitizeCell(getFinancialTipoLabel(row.tipo)),
      sanitizeCell(row.batch_id || row.batchId || ''),
    ]
  );

  return { header, lines };
}
