export const EMPTY_COBRANCA_DASHBOARD_META = {
  totalWhatsAppCharges: 0,
  manualWhatsAppCharges: 0,
  autoWhatsAppCharges: 0,
  autoChargeActive: false,
  activeAutoConfigsCount: 0,
  recordsCount: 0,
};

const toSafeNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoDateOnly = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

export function normalizeCobrancaDashboardMeta(meta = {}) {
  if (!meta || typeof meta !== 'object') {
    return { ...EMPTY_COBRANCA_DASHBOARD_META };
  }

  return {
    totalWhatsAppCharges: toSafeNumber(meta.totalWhatsAppCharges),
    manualWhatsAppCharges: toSafeNumber(meta.manualWhatsAppCharges),
    autoWhatsAppCharges: toSafeNumber(meta.autoWhatsAppCharges),
    autoChargeActive: Boolean(meta.autoChargeActive),
    activeAutoConfigsCount: toSafeNumber(meta.activeAutoConfigsCount),
    recordsCount: toSafeNumber(meta.recordsCount),
  };
}

export function deriveCobrancaIndicatorMetrics(rows = [], { todayIso } = {}) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const today = todayIso || new Date().toISOString().slice(0, 10);

  const openRows = normalizedRows.filter((row) => String(row?.status || '').trim().toLowerCase() !== 'liquidado');
  const overdueRows = openRows.filter((row) => {
    const dueDate = toIsoDateOnly(row?.dataVencimento || row?.data_vencimento);
    return dueDate && dueDate < today;
  });
  const futureRows = openRows.filter((row) => {
    const dueDate = toIsoDateOnly(row?.dataVencimento || row?.data_vencimento);
    return dueDate && dueDate >= today;
  });
  const eligibleChargeRows = overdueRows.filter((row) => String(row?.telefone || '').trim());
  const olderThanFiveDays = overdueRows.filter((row) => {
    const dueDate = toIsoDateOnly(row?.dataVencimento || row?.data_vencimento);
    if (!dueDate) return false;
    const dueDateMs = new Date(`${dueDate}T00:00:00`).getTime();
    if (Number.isNaN(dueDateMs)) return false;
    const todayMs = new Date(`${today}T00:00:00`).getTime();
    return Math.floor((todayMs - dueDateMs) / 86400000) > 5;
  });

  return {
    totalVencido: overdueRows.reduce((sum, row) => sum + toSafeNumber(row?.valorAtualizado ?? row?.valor), 0),
    totalAVencer: futureRows.reduce((sum, row) => sum + toSafeNumber(row?.valorAtualizado ?? row?.valor), 0),
    valorPotencial: eligibleChargeRows.reduce((sum, row) => sum + toSafeNumber(row?.valorAtualizado ?? row?.valor), 0),
    clientesSemTelefone: overdueRows.filter((row) => !String(row?.telefone || '').trim()).length,
    titulosProtesto: olderThanFiveDays.length,
  };
}
