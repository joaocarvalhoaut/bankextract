const NOT_INFORMED_LABEL = 'nao informado';

const formatCurrencyBRL = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

const toSafeText = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || NOT_INFORMED_LABEL;
};

const toSafeDate = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return NOT_INFORMED_LABEL;

  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;

  return new Intl.DateTimeFormat('pt-BR').format(parsed);
};

const calculateDaysLate = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const dueDate = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - dueDate.getTime();
  if (diffMs <= 0) return 0;

  return Math.floor(diffMs / 86400000);
};

export function buildChecklistPreviewContext({
  sampleCharge = null,
  companyName = '',
} = {}) {
  const source = sampleCharge || {};
  const documento =
    source.documento ||
    source.numero_nf ||
    source.numero_boleto ||
    source.numeroBoleto ||
    '';
  const numeroBoleto =
    source.numero_boleto ||
    source.numeroBoleto ||
    source.documento ||
    source.numero_nf ||
    '';
  const vencimento = source.data_vencimento || source.vencimento || '';

  return {
    nome: toSafeText(source.nome || source.cliente_nome || source.cliente),
    valor: Number(source.valor || 0),
    vencimento,
    diasAtraso: calculateDaysLate(vencimento),
    documento: toSafeText(documento),
    numero_boleto: toSafeText(numeroBoleto),
    telefone: toSafeText(source.telefone),
    empresa: toSafeText(companyName || source.empresa || 'NC Finance'),
    linha_digitavel: toSafeText(source.linha_digitavel),
    link_boleto: toSafeText(source.boleto_url || source.link_boleto),
    codigo_barras: toSafeText(source.codigo_barras),
    historico: '',
  };
}

export function buildChecklistPreviewSummary(context = {}) {
  return {
    documento: context.documento || NOT_INFORMED_LABEL,
    boleto: context.numero_boleto || NOT_INFORMED_LABEL,
    valor: formatCurrencyBRL(context.valor || 0),
    vencimento: toSafeDate(context.vencimento),
    telefone: context.telefone || NOT_INFORMED_LABEL,
    diasAtraso: Number(context.diasAtraso || 0),
    linhaDigitavel: context.linha_digitavel || NOT_INFORMED_LABEL,
    linkBoleto: context.link_boleto || NOT_INFORMED_LABEL,
    codigoBarras: context.codigo_barras || NOT_INFORMED_LABEL,
  };
}
