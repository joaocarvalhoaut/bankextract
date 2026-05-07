import { financeService as legacyFinanceService } from './financeService.js';
import { GLOBAL_COMPANY_ID } from './companyService.js';
import { supabase, hasSupabaseConfig } from './supabaseClient.js';
import { canUserPerformAction } from '../security/permissions';
import { buildPlanCatalogForUi, getPlanMeta, normalizePlanId } from '../constants/plans.js';
import { buildCompanyNameMap, normalizeRepresentativeList, toUiHistoryRow } from './financeAdapters.js';
import { normalizeMoney, normalizeText, toDate } from './financeNormalizers.js';
import { tenantContext } from './tenantContext.js';
import {
  defaultWhatsAppAutoConfig,
  getWhatsAppAutoConfig,
  saveWhatsAppAutoConfig,
} from './whatsappAutoService.js';

export { tenantContext } from './tenantContext.js';

const isProduction = import.meta.env.PROD;
const isDevelopment = import.meta.env.DEV;

const defaultRuntimeContext = {
  userId: tenantContext.currentUserId || '',
  companyId: tenantContext.defaultCompanyId || '',
  isSystemAdmin: false,
  userRole: 'operador',
  companyName: '',
  companies: [],
};

const runtimeContext = {
  ...defaultRuntimeContext,
};

const chargeMessageDrafts = new Map();

const OCR_FUNCTION_NAME = 'process-import-ocr';
const allowImportMock = isDevelopment && String(import.meta.env.VITE_ENABLE_IMPORT_MOCK || '').trim() === 'true';
const blockedMockNames = new Set([
  'VALERIA CORDEIRO DE SOUZA',
  'DIOCLECIO XAVIER',
  'CONSTRUTORA PARQUE REAL',
  'CLINICA SANTA LUZIA',
  'LOJAS CENTRO SUL LTDA',
  'MERCADO BOM PRECO',
  'REALCE ESTOFADOS',
  'ORTHOMAX COLCHOES',
]);

const normalizeImportRecord = (row = {}, index = 0, tipo = 'vencidos', companyId = '') => {
  const nome = row.nome || row.cliente || row.customer_name || row.pagador || row.sacado || '';
  const documento = row.documento || row.numero_documento || row.doc || row.titulo || '';
  const numeroBoleto = row.numero_boleto || row.boleto_numero || row.nosso_numero || '';
  const dueDate = row.data_vencimento || row.vencimento || row.due_date || '';
  const status = row.status || (tipo === 'liquidacao' ? 'liquidado' : 'pendente');
  const telefone = row.telefone || row.phone || row.celular || '';
  const observacoes = row.observacoes || row.observacao || row.notes || '';

  return {
    ...row,
    id: row.id || `preview-${index + 1}-${makeUuid().slice(0, 8)}`,
    nome: String(nome || ''),
    documento: String(documento || ''),
    numero_boleto: String(numeroBoleto || ''),
    data_vencimento: dueDate ? toIsoDate(dueDate) : '',
    valor: normalizeMoney(row.valor ?? row.amount ?? row.valor_original ?? row.valor_boleto ?? 0),
    status: String(status || 'pendente').toLowerCase(),
    telefone: String(telefone || ''),
    observacoes: String(observacoes || ''),
    selected: row.selected !== false,
    company_id: row.company_id || companyId,
  };
};

const isClearlyMockImportRow = (row = {}) => {
  const nome = String(row.nome || '').trim().toUpperCase();
  const documento = String(row.documento || '').trim().toUpperCase();
  const valor = Number(row.valor || 0);

  return (
    blockedMockNames.has(nome) ||
    /^DOC-\d{4,}/.test(documento) ||
    /^LQ-\d{4,}/.test(documento) ||
    (!nome && /^DOC-/.test(documento)) ||
    valor === 10109.8
  );
};

const isValidImportRow = (row = {}) => {
  const nome = String(row.nome || '').trim();
  const documento = String(row.documento || '').trim();
  const vencimento = String(row.data_vencimento || '').trim();
  const valor = Number(row.valor || 0);

  return Boolean((nome || row.sacado || row.cliente) && documento && vencimento && Number.isFinite(valor) && valor > 0);
};

const extractImportRows = (result = {}) => {
  const candidates = [
    result?.records,
    result?.rows,
    result?.data?.records,
    result?.data?.rows,
    result?.data,
    result?.registros,
  ];

  return candidates.find((item) => Array.isArray(item)) || [];
};

const buildImportPreview = (result, file, tipo, companyId) => {
  const normalizedRows = extractImportRows(result).map((row, index) =>
    normalizeImportRecord(row, index, tipo, companyId)
  );

  const hasInvalidShape = normalizedRows.some((row) => !isValidImportRow(row));
  if (hasInvalidShape) {
    throw new Error('A resposta do OCR veio em formato invalido.');
  }

  const hasMockedRows = normalizedRows.some((row) => isClearlyMockImportRow(row));
  if (hasMockedRows) {
    throw new Error('OCR nao configurado ou indisponivel. Nenhum dado foi importado.');
  }

  return {
    fileName: result?.fileName || result?.file_name || file?.name || 'importacao_ocr.pdf',
    tipo: result?.tipo || result?.tipo_importacao || tipo,
    rows: normalizedRows,
  };
};

const emptyMetrics = {
  kpis: [],
  charts: {
    aging: [],
    importacoes: [],
  },
  operational: {
    autoChargeActive: false,
    whatsappMockMode: true,
    lastAutoExecution: 'Nunca executada',
    nextRunHint: 'Sem empresa ativa',
  },
};

const makeUuid = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const toIsoDate = (date) => {
  if (!date) return '';
  return new Date(date).toISOString().slice(0, 10);
};

const getContext = (overrides = {}) => ({
  ...runtimeContext,
  ...overrides,
});

const ensureSupabaseOrDevelopmentMock = () => {
  if (!hasSupabaseConfig && isProduction) {
    throw new Error('Supabase não configurado para produção.');
  }
};

const normalizeRecordStatus = (row) => {
  const dueDate = toDate(row.data_vencimento);
  const currentStatus = String(row.status || '').trim().toLowerCase();

  if (currentStatus === 'liquidado') {
    return 'liquidado';
  }

  if (dueDate && dueDate < new Date()) {
    if (currentStatus === 'negociacao') return 'negociacao';
  return currentStatus === 'aberto' ? 'aberto' : 'vencido';
  }

  if (currentStatus === 'negociacao') return 'negociacao';
  if (currentStatus === 'aberto') return 'aberto';
  return 'pendente';
};

const formatDateTimeLabel = (value) => {
  if (!value) return 'Nunca executada';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'Nunca executada';
  }
};

const calcNextRunHint = (horaEnvio = '08:00') => {
  try {
    const brNow = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());

    const [currentHour, currentMinute] = brNow.split(':').map(Number);
    const [targetHour, targetMinute] = String(horaEnvio || '08:00').split(':').map(Number);

    if (currentHour * 60 + currentMinute < targetHour * 60 + targetMinute) {
      return `Hoje as ${horaEnvio}`;
    }

    return `Amanhã as ${horaEnvio}`;
  } catch {
    return `Próxima janela: ${horaEnvio}`;
  }
};

const buildScopedQuery = (query, context, companyColumn = 'company_id') => {
  if (context.companyId === GLOBAL_COMPANY_ID) {
    return query;
  }

  return query.eq(companyColumn, context.companyId);
};

const safeSupabaseSelect = async (buildQuery, fallback = []) => {
  if (!hasSupabaseConfig || !supabase) {
    return fallback;
  }

  try {
    const { data, error } = await buildQuery();
    if (error) return fallback;
    return data || fallback;
  } catch {
    return fallback;
  }
};

const toUiRecord = (row, companies = []) => {
  const companyNames = buildCompanyNameMap(companies);
  const batchId = row.batch_id ?? row.batchId ?? null;
  const companyId = row.company_id ?? row.companyId ?? '';
  const dueDate = row.data_vencimento ?? row.dataVencimento ?? '';

  return {
    id: row.id,
    company_id: companyId,
    companyId,
    user_id: row.user_id ?? row.userId ?? null,
    batch_id: batchId,
    batchId,
    nome: row.nome || '',
    empresa_nome: row.empresa_nome || row.empresaNome || companyNames.get(companyId) || 'Empresa',
    numero_boleto: row.numero_boleto ?? row.numeroBoleto ?? row.documento ?? '',
    documento: row.documento ?? row.numero_boleto ?? row.numeroBoleto ?? '',
    data_vencimento: dueDate,
    valor: normalizeMoney(row.valor),
    representante_id: row.representante_id ?? row.representanteId ?? null,
    telefone: row.telefone || '',
    observacoes: row.observacoes ?? row.observacao ?? '',
    observacao: row.observacao ?? row.observacoes ?? '',
    status: normalizeRecordStatus({
      data_vencimento: dueDate,
      status: row.status,
    }),
    tipo: row.tipo || 'vencidos',
    importado_em: row.importado_em ?? row.importadoEm ?? null,
    liquidado_em: row.liquidado_em ?? row.liquidadoEm ?? null,
  };
};

const toLegacyRecord = (row, context) => ({
  id: row.id || makeUuid(),
  company_id: context.companyId,
  user_id: context.userId || null,
  batchId: row.batch_id ?? row.batchId ?? null,
  nome: row.nome || '',
  numeroBoleto: row.numero_boleto ?? row.documento ?? row.numeroBoleto ?? '',
  dataVencimento: row.data_vencimento ?? row.dataVencimento ?? '',
  valor: normalizeMoney(row.valor),
  representanteId: row.representante_id ?? row.representanteId ?? null,
  telefone: row.telefone || '',
  observacao: row.observacoes ?? row.observacao ?? '',
  status: row.status || 'pendente',
  importadoEm: row.importado_em ?? row.importadoEm ?? null,
  liquidadoEm: row.liquidado_em ?? row.liquidadoEm ?? null,
});

const toLegacyImportEntry = (entry, context) => ({
  id: entry.id || makeUuid(),
  company_id: context.companyId,
  user_id: context.userId || null,
  batchId: entry.batch_id ?? entry.batchId ?? null,
  arquivo: entry.arquivo || 'importacao_ocr.pdf',
  tipo: entry.tipo || 'vencidos',
  registros: Number(entry.quantidade_registros ?? entry.registros ?? 0),
  status: entry.status || 'concluida',
  data: entry.created_at || entry.data || new Date().toISOString(),
});

const buildChargeRows = (records) =>
  records
    .filter((record) => record.status !== 'liquidado')
    .map((record) => {
      const messageKey = `${record.company_id}:${record.id}`;
      const draft = chargeMessageDrafts.get(messageKey);
      return {
        id: record.id,
        company_id: record.company_id,
        registro_id: record.id,
        batch_id: record.batch_id,
        cliente: record.nome,
        documento: record.numero_boleto,
        valor: record.valor,
        vencimento: record.data_vencimento,
        telefone: record.telefone,
        status: record.telefone ? 'pendente' : 'sem telefone',
        origem: 'manual',
        mensagem:
          draft ||
          `Olá, ${record.nome}. Identificamos o título ${record.numero_boleto} em aberto no BankExtract. Poderia nos confirmar a programação de pagamento?`,
      };
    });

const filterRecords = (records, filters = {}) =>
  records.filter((row) => {
    if (filters.status && filters.status !== 'todos' && row.status !== filters.status) return false;
    if (filters.tipo && filters.tipo !== 'todos' && (row.tipo || 'vencidos') !== filters.tipo) return false;
    if (filters.dateStart && row.data_vencimento < filters.dateStart) return false;
    if (filters.dateEnd && row.data_vencimento > filters.dateEnd) return false;
    if (filters.search) {
      const haystack = normalizeText(`${row.nome} ${row.numero_boleto}`);
      if (!haystack.includes(normalizeText(filters.search))) return false;
    }
    return true;
  });

const deriveDashboardMetrics = (records, history, extras = {}) => {
  if (!records.length && !history.length) {
    return emptyMetrics;
  }

  const today = new Date();
  const openRows = records.filter((item) => item.status !== 'liquidado');
  const vencidos = openRows.filter((item) => {
    const dueDate = toDate(item.data_vencimento);
    return dueDate && dueDate < today;
  });
  const aVencer = openRows.filter((item) => {
    const dueDate = toDate(item.data_vencimento);
    return dueDate && dueDate >= today;
  });
  const liquidado = records.filter((item) => item.status === 'liquidado');
  const importedThisMonth = history.filter((item) => {
    const createdAt = new Date(item.created_at);
    return createdAt.getMonth() === today.getMonth() && createdAt.getFullYear() === today.getFullYear();
  });
  const importedRowsThisMonth = importedThisMonth.reduce((sum, item) => sum + Number(item.quantidade_registros || 0), 0);
  const phoneCoverage = records.length
    ? `${Math.round((records.filter((item) => String(item.telefone || '').trim()).length / records.length) * 100)}%`
    : '0%';
  const totalChargesSent = Number(extras.totalChargesSent || 0);

  return {
    kpis: [
      { title: 'Total em aberto', value: openRows.reduce((sum, item) => sum + item.valor, 0), tone: 'green', hint: 'Carteira ativa por empresa' },
      { title: 'Total vencido', value: vencidos.reduce((sum, item) => sum + item.valor, 0), tone: 'red', hint: `${vencidos.length} titulos vencidos` },
      { title: 'Valor liquidado', value: liquidado.reduce((sum, item) => sum + item.valor, 0), tone: 'blue', hint: 'Baixas registradas no periodo' },
      { title: 'Registros importados no mes', value: importedRowsThisMonth, tone: 'slate', hint: `${importedThisMonth.length} lote(s) no periodo` },
      { title: 'Cobrancas mock/enviadas', value: totalChargesSent, tone: 'gold', hint: 'WhatsApp manual + automatico' },
      { title: 'Clientes sem telefone', value: records.filter((item) => !String(item.telefone || '').trim()).length, tone: 'amber', hint: 'Necessitam enriquecimento cadastral' },
      { title: 'Taxa com telefone', value: phoneCoverage, tone: 'blue', hint: 'Cobertura cadastral da carteira' },
      { title: 'Ultima execucao automatica', value: extras.lastAutoExecution || 'Nunca executada', tone: 'slate', hint: extras.nextRunHint || 'Sem agendamento ativo' },
    ],
    charts: {
      aging: [
        { label: 'A vencer', value: aVencer.reduce((sum, item) => sum + item.valor, 0), color: '#1E3A8A' },
        {
          label: 'Vencido ate 5d',
          value: vencidos
            .filter((item) => {
              const dueDate = toDate(item.data_vencimento);
              if (!dueDate) return false;
              return (today.getTime() - dueDate.getTime()) / 86400000 <= 5;
            })
            .reduce((sum, item) => sum + item.valor, 0),
          color: '#D4A017',
        },
        {
          label: 'Vencido > 5d',
          value: vencidos
            .filter((item) => {
              const dueDate = toDate(item.data_vencimento);
              if (!dueDate) return false;
              return (today.getTime() - dueDate.getTime()) / 86400000 > 5;
            })
            .reduce((sum, item) => sum + item.valor, 0),
          color: '#DC2626',
        },
      ],
      importacoes: history.slice(0, 6).map((item) => ({
        label: new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        value: item.quantidade_registros,
      })),
    },
    notes: {
      source: 'supabase-or-mock-facade',
      supabaseReady: 'A fachada usa company_id e batch_id em todas as operacoes reais.',
    },
    operational: {
      autoChargeActive: Boolean(extras.autoChargeActive),
      whatsappMockMode: Boolean(extras.whatsappMockMode),
      lastAutoExecution: extras.lastAutoExecution || 'Nunca executada',
      nextRunHint: extras.nextRunHint || 'Sem agendamento ativo',
      recentAuditAction: extras.recentAuditAction || 'Sem atividade recente',
    },
  };
};

export const sanitizeSpreadsheetCell = (value) => {
  if (value === null || typeof value === 'undefined') return '';

  const raw = String(value);
  return /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
};

const inferChecklistStatus = (condition, pendingDetail, readyDetail, attentionDetail = pendingDetail) => {
  if (condition === true) {
    return { status: 'pronto', detail: readyDetail };
  }

  if (condition === 'attention') {
    return { status: 'atencao', detail: attentionDetail };
  }

  return { status: 'pendente', detail: pendingDetail };
};

const resolvePlanTier = (companyCount = 1, importedRows = 0) => {
  if (companyCount > 5 || importedRows > 5000) return 'business';
  if (companyCount > 1 || importedRows > 500) return 'pro';
  return 'starter';
};

const getPlanCatalog = () => ([
  {
    id: 'starter',
    name: 'Starter',
    price: 'R$ 97/mês',
    emphasis: 'Operação enxuta para começar rápido',
    limits: '1 empresa • até 500 registros/mês',
    features: ['1 empresa', 'Até 500 registros/mês', 'Cobrança manual', 'Google Sheets'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'R$ 197/mês',
    emphasis: 'Automação e histórico para escalar a cobrança',
    limits: 'Até 5 empresas • até 5.000 registros/mês',
    features: ['Até 5 empresas', 'Até 5.000 registros/mês', 'Cobrança automática', 'Histórico completo', 'Audit logs'],
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Sob consulta',
    emphasis: 'Governança, volume alto e integrações sob medida',
    limits: 'Empresas ilimitadas • alto volume',
    features: ['Empresas ilimitadas', 'Alto volume', 'Suporte prioritário', 'Integrações personalizadas'],
  },
]);

const loadDataset = async (companyId, overrides = {}) => {
  ensureSupabaseOrDevelopmentMock();
  const context = getContext({
    companyId,
    ...overrides,
  });

  const dataset = await legacyFinanceService.fetchCompanyDataset({
    companyId: context.companyId,
    userId: context.userId,
  });

  const companies = dataset.companies || context.companies || [];

  return {
    context,
    companies,
    records: (dataset.records || []).map((row) => toUiRecord(row, companies)),
    history: (dataset.history || []).map((row) => toUiHistoryRow(row, companies)),
    representatives: dataset.representatives || [],
    config: dataset.config
      ? {
          company_id: dataset.config.company_id,
          multaPercentual: Number(dataset.config.multaPercentual ?? 2),
          jurosPercentualDia: Number(dataset.config.jurosPercentualDia ?? 0.033),
        }
      : {
          company_id: context.companyId,
          multaPercentual: 2,
          jurosPercentualDia: 0.033,
        },
  };
};

export async function getRepresentatives(companyId = runtimeContext.companyId, overrides = {}) {
  try {
    if (typeof legacyFinanceService.getRepresentatives === 'function') {
      const reps = await legacyFinanceService.getRepresentatives(companyId, {
        companyId,
        userId: overrides.userId || runtimeContext.userId || null,
      });
      if (Array.isArray(reps)) {
        return normalizeRepresentativeList(reps);
      }
    }

    const dataset = await loadDataset(companyId, overrides);
    if (Array.isArray(dataset.representatives) && dataset.representatives.length) {
      return normalizeRepresentativeList(dataset.representatives);
    }

    return normalizeRepresentativeList(
      (dataset.records || []).map((row) => ({
        id: row.representante_id ?? row.representanteId ?? null,
        nome: row.representante_nome ?? row.representanteNome ?? row.representante ?? '',
      })),
    );
  } catch {
    return [];
  }
}

export async function updateFinancialRecord(recordId, updates = {}, companyId = runtimeContext.companyId, options = {}) {
  try {
    if (!recordId) {
      throw new Error('recordId é obrigatório para atualizar o registro financeiro.');
    }

    const payload = updates && typeof updates === 'object' ? { ...updates } : {};
    const tenantOptions =
      companyId && typeof companyId === 'object' && !Array.isArray(companyId)
        ? companyId
        : {
            ...options,
            companyId: options.companyId || companyId,
            userId: options.userId || runtimeContext.userId || null,
          };

    if (!Object.keys(payload).length) {
      const dataset = await loadDataset(tenantOptions.companyId || runtimeContext.companyId, tenantOptions);
      return (dataset.records || []).find((row) => row.id === recordId) || { id: recordId, success: true };
    }

    const saved = await legacyFinanceService.updateFinancialRecord(
      recordId,
      payload,
      tenantOptions.companyId || runtimeContext.companyId,
      tenantOptions,
    );

    return saved ? toUiRecord(saved, runtimeContext.companies || []) : { id: recordId, success: true };
  } catch (error) {
    throw new Error(error?.message || 'Não foi possível atualizar o registro financeiro.');
  }
}

export async function saveRepresentative(companyId = runtimeContext.companyId, representative = {}, options = {}) {
  try {
    const saved = await legacyFinanceService.saveRepresentative(companyId, representative, {
      companyId,
      userId: options.userId || runtimeContext.userId || null,
    });
    return saved;
  } catch (error) {
    throw new Error(error?.message || 'Não foi possível salvar o representante.');
  }
}

export async function deleteRepresentative(companyId = runtimeContext.companyId, representativeId, options = {}) {
  try {
    if (!representativeId) {
      throw new Error('representativeId é obrigatório para excluir o representante.');
    }

    return await legacyFinanceService.deleteRepresentative(companyId, representativeId, {
      companyId,
      userId: options.userId || runtimeContext.userId || null,
    });
  } catch (error) {
    throw new Error(error?.message || 'Não foi possível excluir o representante.');
  }
}

export async function deleteFinancialRecords(recordIds = [], options = {}) {
  try {
    if (!Array.isArray(recordIds) || !recordIds.length) {
      return true;
    }

    return await legacyFinanceService.deleteFinancialRecords(recordIds, {
      companyId: options.companyId || runtimeContext.companyId,
      userId: options.userId || runtimeContext.userId || null,
    });
  } catch (error) {
    throw new Error(error?.message || 'Não foi possível excluir os registros financeiros.');
  }
}

export async function fetchCobrancaDashboardMeta({ companyId = runtimeContext.companyId, userId = runtimeContext.userId } = {}) {
  try {
    if (typeof legacyFinanceService.fetchCobrancaDashboardMeta === 'function') {
      return await legacyFinanceService.fetchCobrancaDashboardMeta({ companyId, userId });
    }

    const dataset = await loadDataset(companyId, { userId });
    const charges = await safeSupabaseSelect(() =>
      buildScopedQuery(
        supabase.from('cobrancas_whatsapp').select('id, empresa_id, status, origem'),
        getContext({ companyId, userId }),
        'empresa_id',
      ),
    []);
    const autoConfigs = await safeSupabaseSelect(() =>
      buildScopedQuery(
        supabase.from('whatsapp_cobranca_config').select('empresa_id, ativo'),
        getContext({ companyId, userId }),
        'empresa_id',
      ),
    []);

    const activeAutoConfigsCount = (autoConfigs || []).filter((item) => Boolean(item.ativo)).length;

    return {
      totalWhatsAppCharges: (charges || []).length,
      manualWhatsAppCharges: (charges || []).filter((item) => item.origem !== 'automatica').length,
      autoWhatsAppCharges: (charges || []).filter((item) => item.origem === 'automatica').length,
      autoChargeActive: activeAutoConfigsCount > 0,
      activeAutoConfigsCount,
      recordsCount: dataset.records?.length || 0,
    };
  } catch {
    return {
      totalWhatsAppCharges: 0,
      manualWhatsAppCharges: 0,
      autoWhatsAppCharges: 0,
      autoChargeActive: false,
      activeAutoConfigsCount: 0,
      recordsCount: 0,
    };
  }
}

export const financeService = {
  setRuntimeContext(nextContext = {}) {
    Object.assign(runtimeContext, {
      ...defaultRuntimeContext,
      ...runtimeContext,
      ...nextContext,
    });
    return runtimeContext;
  },

  async syncCompanyCatalog(companies = []) {
    runtimeContext.companies = Array.isArray(companies) ? companies : [];
    return true;
  },

  async getFinancialRecords(companyId = runtimeContext.companyId, filters = {}, overrides = {}) {
    try {
      const dataset = await loadDataset(companyId, overrides);
      return filterRecords(dataset.records || [], filters || {});
    } catch {
      return [];
    }
  },

  async getRepresentatives(companyId = runtimeContext.companyId, overrides = {}) {
    return getRepresentatives(companyId, overrides);
  },

  async fetchCobrancaDashboardMeta({ companyId = runtimeContext.companyId, userId = runtimeContext.userId } = {}) {
    return fetchCobrancaDashboardMeta({ companyId, userId });
  },

  async updateFinancialRecord(recordId, updates = {}, companyId = runtimeContext.companyId, options = {}) {
    return updateFinancialRecord(recordId, updates, companyId, options);
  },

  async saveRepresentative(companyId = runtimeContext.companyId, representative = {}, options = {}) {
    return saveRepresentative(companyId, representative, options);
  },

  async deleteRepresentative(companyId = runtimeContext.companyId, representativeId, options = {}) {
    return deleteRepresentative(companyId, representativeId, options);
  },

  async deleteFinancialRecords(recordIds = [], options = {}) {
    return deleteFinancialRecords(recordIds, options);
  },

  async getImportHistory(companyId = runtimeContext.companyId, filters = {}, overrides = {}) {
    try {
      const dataset = await loadDataset(companyId, overrides);
      const rows = dataset.history || [];

      return rows.filter((row) => {
        if (filters.status && filters.status !== 'todos' && row.status !== filters.status) return false;
        if (filters.tipo && filters.tipo !== 'todos' && row.tipo !== filters.tipo) return false;
        if (filters.search) {
          const haystack = normalizeText(`${row.arquivo || ''} ${row.empresa_nome || ''} ${row.tipo || ''}`);
          if (!haystack.includes(normalizeText(filters.search))) return false;
        }
        return true;
      });
    } catch {
      return [];
    }
  },

  async getDashboardMetrics(companyId = runtimeContext.companyId, overrides = {}) {
    const dataset = await loadDataset(companyId, overrides);
    const context = dataset.context;

    const [googleSheetsConfig, autoConfigs, auditLogs, recentCharges] = await Promise.all([
      safeSupabaseSelect(() =>
        buildScopedQuery(
          supabase.from('google_sheets_config').select('empresa_id, spreadsheet_id, sheet_name, ativo, updated_at'),
          context,
          'empresa_id'
        )
      ),
      safeSupabaseSelect(() =>
        buildScopedQuery(
          supabase.from('whatsapp_cobranca_config').select('empresa_id, ativo, hora_envio, updated_at'),
          context,
          'empresa_id'
        )
      ),
      safeSupabaseSelect(() =>
        buildScopedQuery(
          supabase.from('audit_logs').select('action, created_at, company_id').order('created_at', { ascending: false }).limit(8),
          context,
          'company_id'
        )
      ),
      safeSupabaseSelect(() =>
        buildScopedQuery(
          supabase.from('cobrancas_whatsapp').select('id, empresa_id, status, created_at').order('created_at', { ascending: false }).limit(5),
          context,
          'empresa_id'
        )
      ),
    ]);

    const sheetsConfig = googleSheetsConfig?.[0] || null;
    const activeAutoConfig = (autoConfigs || []).find((item) => item.ativo) || null;
    const lastCharge = recentCharges?.[0] || null;
    const mockWhatsappMode = (recentCharges || []).some((item) => item.status === 'mock_enviado');
    const checklist = [
      {
        id: 'supabase',
        label: 'Supabase configurado',
        ok: Boolean(hasSupabaseConfig && supabase),
        detail: hasSupabaseConfig ? 'Conexao do frontend ativa.' : 'Variaveis VITE_SUPABASE_* ausentes.',
      },
      {
        id: 'company',
        label: 'Empresa ativa',
        ok: Boolean(context.companyId),
        detail: context.companyId === GLOBAL_COMPANY_ID ? 'Modo global habilitado para admin geral.' : (context.companyName || 'Selecione uma empresa especifica.'),
      },
      {
        id: 'records',
        label: 'Carteira carregada',
        ok: dataset.records.length > 0,
        detail: `${dataset.records.length} registro(s) financeiro(s) no escopo atual.`,
      },
      {
        id: 'sheets',
        label: 'Google Sheets conectado',
        ok: Boolean(sheetsConfig?.ativo && sheetsConfig?.spreadsheet_id),
        detail: sheetsConfig?.spreadsheet_id ? `Planilha ${sheetsConfig.sheet_name || 'Pagina1'} conectada.` : 'Sem planilha configurada.',
      },
      {
        id: 'whatsapp',
        label: 'WhatsApp em modo teste',
        ok: mockWhatsappMode,
        detail: mockWhatsappMode ? 'ENABLE_MOCK_WHATSAPP ativo no backend.' : 'Sem execucao mock recente detectada.',
      },
      {
        id: 'audit',
        label: 'Audit logs recentes',
        ok: (auditLogs || []).length > 0,
        detail: (auditLogs || []).length ? `Ultima acao: ${auditLogs[0].action}.` : 'Sem logs recentes no escopo atual.',
      },
    ];

    return {
      companyMode: context.companyId === GLOBAL_COMPANY_ID ? 'global' : 'company',
      companyName: context.companyName || 'Nenhuma empresa ativa',
      userRole: context.userRole || 'operador',
      isSystemAdmin: Boolean(context.isSystemAdmin),
      googleSheetsConnected: Boolean(sheetsConfig?.ativo && sheetsConfig?.spreadsheet_id),
      googleSheetsSheetName: sheetsConfig?.sheet_name || '',
      googleSheetsLastSync: sheetsConfig?.updated_at || null,
      autoChargeActive: Boolean(activeAutoConfig?.ativo),
      autoChargeHour: activeAutoConfig?.hora_envio || '08:00',
      whatsappMockMode: mockWhatsappMode,
      lastAutoExecution: formatDateTimeLabel(lastCharge?.created_at),
      recentAuditLogs: auditLogs || [],
      checklist,
    };
  },

  async getOnboardingStatus(companyId = runtimeContext.companyId, overrides = {}) {
    const dataset = await loadDataset(companyId, overrides);
    const context = dataset.context;

    const [googleSheetsConfig, autoConfigs, systemStatus] = await Promise.all([
      safeSupabaseSelect(() =>
        buildScopedQuery(
          supabase.from('google_sheets_config').select('empresa_id, spreadsheet_id, sheet_name, ativo'),
          context,
          'empresa_id'
        )
      ),
      safeSupabaseSelect(() =>
        buildScopedQuery(
          supabase.from('whatsapp_cobranca_config').select('empresa_id, ativo, hora_envio'),
          context,
          'empresa_id'
        )
      ),
      this.getSystemStatus(companyId, overrides),
    ]);

    const activeAutoConfig = (autoConfigs || []).find((item) => item.ativo) || autoConfigs?.[0] || null;
    const sheetConfig = googleSheetsConfig?.[0] || null;
    const steps = [
      { id: 'empresa', title: 'Criar ou selecionar empresa', description: 'Defina a empresa ativa que vai receber a carteira financeira.', done: Boolean(context.companyId), actionTab: 'configuracoes' },
      { id: 'dados-empresa', title: 'Configurar dados da empresa', description: 'Revise nome, CNPJ, invite code e preferencias operacionais.', done: Boolean(runtimeContext.companyName), actionTab: 'configuracoes' },
      { id: 'google-sheets', title: 'Conectar Google Sheets', description: 'Salve uma planilha para exportacao e sincronizacao operacional.', done: Boolean(sheetConfig?.ativo && sheetConfig?.spreadsheet_id), actionTab: 'integracoes' },
      { id: 'cobranca-auto', title: 'Configurar cobranca automatica', description: 'Ative ou deixe preparado o fluxo automatico por WhatsApp.', done: Boolean(activeAutoConfig), actionTab: 'automacoes' },
      { id: 'horario', title: 'Escolher horario de cobranca', description: 'Defina a janela operacional do envio automatico.', done: Boolean(activeAutoConfig?.hora_envio), actionTab: 'automacoes' },
      { id: 'primeiro-arquivo', title: 'Importar primeiro arquivo', description: 'Envie um documento para popular a visao geral e o historico.', done: dataset.history.length > 0, actionTab: 'importacao' },
      { id: 'checklist', title: 'Ver checklist de prontidao', description: 'Revise status operacional, auditoria e integracoes antes de vender.', done: (systemStatus?.checklist || []).filter((item) => item.ok).length >= 4, actionTab: 'status-sistema' },
    ];

    const completed = steps.filter((step) => step.done).length;
    return {
      progress: Math.round((completed / steps.length) * 100),
      completed,
      total: steps.length,
      nextStep: steps.find((step) => !step.done) || null,
      steps,
    };
  },

  async getPlansCatalog() {
      return buildPlanCatalogForUi();
  },

  async getBillingOverview(companyId = runtimeContext.companyId, overrides = {}) {
    const dataset = await loadDataset(companyId, overrides);
    const companies = runtimeContext.companies || [];
    const importedRowsThisMonth = dataset.history.reduce((sum, item) => sum + Number(item.quantidade_registros || 0), 0);
    const planId = resolvePlanTier(companies.length || 1, importedRowsThisMonth);
      const currentPlan = getPlanMeta(normalizePlanId(planId));

    return {
      currentPlan,
      status: 'Ativa em modo comercial',
      nextCharge: '15/05/2026',
      usage: {
        companies: companies.length || (companyId ? 1 : 0),
        importedRowsThisMonth,
        records: dataset.records.length,
      },
        limits: {
          starter: { companies: 1, records: 500 },
          pro: { companies: 5, records: 5000 },
          business: { companies: 'Ilimitado', records: 'Alto volume' },
        },
        supportLabel: planId === 'business' ? 'Falar com time Business' : 'Falar com suporte',
      };
  },

  async getCharges(companyId = runtimeContext.companyId, overrides = {}) {
    try {
      const dataset = await loadDataset(companyId, overrides);
      const context = dataset.context;
      const rows = buildChargeRows(dataset.records || []);
      const latestCharges = await safeSupabaseSelect(() =>
        buildScopedQuery(
          supabase.from('cobrancas_whatsapp').select('id, registro_id, telefone, mensagem, status, created_at').order('created_at', { ascending: false }),
          context,
          'empresa_id'
        ),
      []);

      const byRecord = new Map();
      for (const item of latestCharges || []) {
        const key = item.registro_id || item.id;
        if (key && !byRecord.has(key)) byRecord.set(key, item);
      }

      return rows.map((row) => {
        const log = byRecord.get(row.registro_id || row.id);
        if (!log) return row;
        const draftKey = `${row.company_id}:${row.id}`;
        return {
          ...row,
          telefone: log.telefone || row.telefone,
          mensagem: chargeMessageDrafts.get(draftKey) || log.mensagem || row.mensagem,
          status: log.status === 'enviado' || log.status === 'mock_enviado' ? 'enviada' : row.status,
        };
      });
    } catch {
      return [];
    }
  },

  async getAutomationRules(companyId = runtimeContext.companyId) {
    try {
      const config = await getWhatsAppAutoConfig(companyId);
      return {
        active: Boolean(config.ativo),
        horario: config.hora_envio || '08:00',
        canal: config.canal_envio || 'WhatsApp',
        intervalo_dias: Number(config.intervalo_dias || 5),
        cobrar_apos_dias_vencido: Number(config.cobrar_apos_dias_vencido || 1),
        protesto_apos_5_dias: Boolean(config.protesto_apos_5_dias ?? true),
        mensagem_template: config.mensagem_template || '',
        rules: Array.isArray(config.regras) ? config.regras : [],
      };
    } catch {
      return {
        active: false,
        horario: '08:00',
        canal: 'WhatsApp',
        intervalo_dias: 5,
        cobrar_apos_dias_vencido: 1,
        protesto_apos_5_dias: true,
        mensagem_template: '',
        rules: [],
      };
    }
  },

  async saveAutomationRules(companyId = runtimeContext.companyId, payload = {}) {
    const saved = await saveWhatsAppAutoConfig(companyId, {
      ativo: Boolean(payload.active),
      hora_envio: payload.horario || '08:00',
      intervalo_dias: Number(payload.intervalo_dias || 5),
      cobrar_apos_dias_vencido: Number(payload.cobrar_apos_dias_vencido || 1),
      protesto_apos_5_dias: Boolean(payload.protesto_apos_5_dias ?? true),
      canal_envio: payload.canal || 'WhatsApp',
      mensagem_template: payload.mensagem_template || '',
      regras: Array.isArray(payload.rules) ? payload.rules : [],
    });
    return saved;
  },

  async getSettingsOverview(companyId = runtimeContext.companyId, companies = runtimeContext.companies || []) {
    const context = getContext({ companyId });
    const users = await safeSupabaseSelect(() =>
      buildScopedQuery(
        supabase.from('usuarios_empresas').select('id, user_id, role, company_id').order('created_at', { ascending: true }),
        context,
        'company_id'
      ),
    []);

    return {
      preferencias: {
        exportacao: 'CSV e Excel',
        timezone: 'America/Sao_Paulo',
      },
      usuarios: (users || []).length
        ? users.map((item, index) => ({
            id: item.id || `${item.user_id}-${index}`,
            nome: item.user_id === runtimeContext.userId ? 'Usuário atual' : `Usuário ${index + 1}`,
            perfil: item.role || 'operador',
          }))
        : [
            {
              id: runtimeContext.userId || 'local-user',
              nome: 'Usuário atual',
              perfil: runtimeContext.userRole || 'operador',
            },
          ],
      companies,
    };
  },

  async getFinancialConfig(companyId = runtimeContext.companyId, overrides = {}) {
    try {
      const dataset = await loadDataset(companyId, overrides);
      return dataset.config || {
        company_id: companyId,
        multaPercentual: 2,
        jurosPercentualDia: 0.033,
      };
    } catch {
      return {
        company_id: companyId,
        multaPercentual: 2,
        jurosPercentualDia: 0.033,
      };
    }
  },

  async saveFinancialConfig(companyId = runtimeContext.companyId, payload = {}) {
    const result = await legacyFinanceService.updateConfiguracao(
      {
        company_id: companyId,
        user_id: runtimeContext.userId || null,
        multaPercentual: Number(payload.multaPercentual ?? 2),
        jurosPercentualDia: Number(payload.jurosPercentualDia ?? 0.033),
      },
      {
        companyId,
        userId: runtimeContext.userId || null,
      },
    );

    return {
      company_id: result.company_id,
      multaPercentual: Number(result.multaPercentual ?? 2),
      jurosPercentualDia: Number(result.jurosPercentualDia ?? 0.033),
    };
  },

  async getSystemStatus(companyId = runtimeContext.companyId, overrides = {}) {
    const metrics = await this.getDashboardMetrics(companyId, overrides);
    return {
      companyMode: metrics.companyMode,
      companyName: metrics.companyName,
      userRole: metrics.userRole,
      isSystemAdmin: metrics.isSystemAdmin,
      googleSheetsConnected: metrics.googleSheetsConnected,
      googleSheetsSheetName: metrics.googleSheetsSheetName,
      googleSheetsLastSync: metrics.googleSheetsLastSync,
      autoChargeActive: metrics.autoChargeActive,
      autoChargeHour: metrics.autoChargeHour,
      whatsappMockMode: metrics.whatsappMockMode,
      lastAutoExecution: metrics.lastAutoExecution,
      recentAuditLogs: metrics.recentAuditLogs || [],
      checklist: metrics.checklist || [],
    };
  },

  async processImportFile(file, tipo = 'vencidos', companyId = runtimeContext.companyId) {
    if (!file || !(file instanceof File)) {
      throw new Error('Arquivo invalido para processamento OCR.');
    }

    if (!hasSupabaseConfig || !supabase) {
      if (!allowImportMock) {
        throw new Error('OCR nao configurado ou indisponivel. Nenhum dado foi importado.');
      }

      throw new Error('OCR nao configurado ou indisponivel. Nenhum dado foi importado.');
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo_importacao', tipo);
      formData.append('company_id', companyId || '');

      const { data, error } = await supabase.functions.invoke(OCR_FUNCTION_NAME, {
        body: formData,
      });

      if (error) {
        throw new Error(error.message || 'OCR nao configurado ou indisponivel. Nenhum dado foi importado.');
      }

      if (!data || typeof data !== 'object') {
        throw new Error('A resposta do OCR veio em formato invalido.');
      }

      const result = data;
      if (result?.success === false) {
        throw new Error(result?.message || 'OCR nao configurado ou indisponivel. Nenhum dado foi importado.');
      }

      const preview = buildImportPreview(result, file, tipo, companyId);
      return preview;
    } catch (error) {
      if (isDevelopment) {
        console.error('[IMPORTACAO] falha ao invocar OCR real', error);
      }
      throw error instanceof Error
        ? error
        : new Error('OCR nao configurado ou indisponivel. Nenhum dado foi importado.');
    }
  },

  async importSelectedRows(rows = [], batchId, companyId = runtimeContext.companyId, options = {}) {
    return legacyFinanceService.importSelectedRows(rows, batchId, companyId, options);
  },

  async fetchCompanyDataset({ companyId = runtimeContext.companyId, userId = runtimeContext.userId } = {}) {
    return legacyFinanceService.fetchCompanyDataset({ companyId, userId });
  },

  async updateConfiguracao(payload, tenantOptions = {}) {
    return legacyFinanceService.updateConfiguracao(payload, tenantOptions);
  },

  async confirmLiquidacaoManual(rows, tenantOptions = {}) {
    return legacyFinanceService.confirmLiquidacaoManual(rows, tenantOptions);
  },

  async appendImportacao(entry, tenantOptions = {}) {
    return legacyFinanceService.appendImportacao(entry, tenantOptions);
  },

  async insertRegistros(items, tenantOptions = {}) {
    return legacyFinanceService.insertRegistros(items, tenantOptions);
  },

  async updateRegistro(recordId, payload, tenantOptions = {}) {
    return legacyFinanceService.updateRegistro(recordId, payload, tenantOptions);
  },

  async deleteRegistros(ids, tenantOptions = {}) {
    return legacyFinanceService.deleteRegistros(ids, tenantOptions);
  },

  async deleteImportacoes(ids, empresaAtiva, isAdminGeral = false, tenantOptions = {}) {
    return legacyFinanceService.deleteImportacoes(ids, empresaAtiva, isAdminGeral, tenantOptions);
  },

  async upsertRepresentante(payload, tenantOptions = {}) {
    return legacyFinanceService.upsertRepresentante(payload, tenantOptions);
  },

  async deleteRepresentante(representanteId, tenantOptions = {}) {
    return legacyFinanceService.deleteRepresentante(representanteId, tenantOptions);
  },

  async deleteImportHistory(item) {
    return legacyFinanceService.deleteImportacoes(
      [item.id],
      {
        id: item.company_id || item.companyId,
        nome: item.empresa_nome || item.empresaNome || runtimeContext.companyName || 'Empresa',
      },
      Boolean(runtimeContext.isSystemAdmin),
      {
        companyId: item.company_id || item.companyId,
        userId: runtimeContext.userId || null,
      },
    );
  },

  async getBatchRows(companyId, batchId, overrides = {}) {
    try {
      const dataset = await loadDataset(companyId, overrides);
      return (dataset.records || []).filter((row) => row.company_id === companyId && row.batch_id === batchId);
    } catch {
      return [];
    }
  },

  async clearOverview(companyId = runtimeContext.companyId) {
    return legacyFinanceService.clearOverview(companyId, {
      companyId,
      userId: runtimeContext.userId || null,
    });
  },

  async sendWhatsAppCharge(payload, mode = 'manual') {
    const companyId = payload.company_id || runtimeContext.companyId;
    const chargeId = payload.registro_id || payload.id || makeUuid();
    const messageKey = `${companyId}:${payload.id || payload.registro_id || chargeId}`;
    if (payload.mensagem) {
      chargeMessageDrafts.set(messageKey, payload.mensagem);
    }

    const phone = String(payload.telefone || '').replace(/\D/g, '');
    if (!phone) {
      return {
        chargeId,
        status: 'sem telefone',
        mocked: true,
      };
    }

    if (hasSupabaseConfig && supabase) {
      try {
        const { data, error } = await supabase
          .from('cobrancas_whatsapp')
          .insert({
            empresa_id: companyId,
            registro_id: payload.registro_id || payload.id || null,
            telefone: phone,
            mensagem: payload.mensagem || '',
            status: 'mock_enviado',
            erro: null,
          })
          .select('id, status')
          .single();

        if (error) throw error;

        return {
          chargeId: data?.id || chargeId,
          status: data?.status || 'mock_enviado',
          mocked: true,
          mode,
        };
      } catch {
        return {
          chargeId,
          status: 'mock_enviado',
          mocked: true,
          mode,
        };
      }
    }

    return {
      chargeId,
      status: 'mock_enviado',
      mocked: true,
      mode,
    };
  },
};

export default financeService;
