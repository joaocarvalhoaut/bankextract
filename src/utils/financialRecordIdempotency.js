const normalizeAscii = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizeIdentifier = (value) =>
  normalizeAscii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const normalizeName = (value) =>
  normalizeAscii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const normalizePhone = (value) => String(value || '').replace(/\D+/g, '');

const normalizeDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const normalizeValueCents = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 100);
};

export function buildFinancialRecordIdempotencyKey(record = {}) {
  const numeroBoleto = normalizeIdentifier(record.numero_boleto ?? record.numeroBoleto);
  const documento = normalizeIdentifier(record.documento);
  const numeroNf = normalizeIdentifier(record.numero_nf ?? record.numeroNf);
  const nome = normalizeName(record.nome ?? record.cliente_nome ?? record.clienteNome);
  const telefone = normalizePhone(record.telefone);
  const dataVencimento = normalizeDate(record.data_vencimento ?? record.dataVencimento ?? record.vencimento);
  const valorCents = normalizeValueCents(record.valor);

  if (!dataVencimento || !valorCents) return null;

  if (numeroBoleto) return `boleto|${numeroBoleto}|${dataVencimento}|${valorCents}`;
  if (documento) return `documento|${documento}|${dataVencimento}|${valorCents}`;
  if (numeroNf) return `nf|${numeroNf}|${dataVencimento}|${valorCents}`;
  if (!nome) return null;

  return `fallback|${nome}|${telefone || 'semtelefone'}|${dataVencimento}|${valorCents}`;
}

export function isFinancialRecordConflictError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();

  return (
    code === '23505' ||
    message.includes('duplicate key') ||
    message.includes('idempotency_key') ||
    details.includes('idempotency_key')
  );
}
