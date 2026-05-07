export const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const normalizeMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

export const firstDefined = (...values) => values.find((value) => value !== null && typeof value !== 'undefined' && value !== '');

export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00`);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/');
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toNumber = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.-]/g, '');
    return Number(normalized || 0);
  }
  return Number(value || 0);
};

export const diffInDays = (future, base = new Date()) => {
  const target = toDate(future);
  if (!target) return null;
  const cleanBase = new Date(base);
  cleanBase.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - cleanBase.getTime()) / 86400000);
};

export function normalizeFinancialRecord(row = {}) {
  const amount = normalizeMoney(
    toNumber(firstDefined(row.valor, row.amount, row.valor_original, row.valor_boleto)),
  );
  const dueDate = firstDefined(row.data_vencimento, row.vencimento, row.due_date) || null;
  const status = String(firstDefined(row.status, row.situacao, row.payment_status, 'pendente') || 'pendente')
    .trim()
    .toLowerCase();
  const clientName = firstDefined(
    row.nome,
    row.cliente,
    row.nome_cliente,
    row.pagador,
    row.sacado,
    row.customer_name,
    '',
  );
  const documentNumber = firstDefined(
    row.documento,
    row.numero_documento,
    row.boleto_numero,
    row.nosso_numero,
    row.numero_boleto,
    '',
  );

  return {
    id: row.id || '',
    company_id: row.company_id || row.companyId || '',
    valor: amount,
    status,
    cliente: String(clientName || '').trim(),
    documento: String(documentNumber || '').trim(),
    numero_boleto: String(firstDefined(row.numero_boleto, row.boleto_numero, documentNumber, '') || '').trim(),
    vencimento: dueDate,
    telefone: String(row.telefone || '').trim(),
    importado_em: firstDefined(row.importado_em, row.created_at, null),
    liquidado_em: firstDefined(row.liquidado_em, row.updated_at, null),
    raw: row,
  };
}
