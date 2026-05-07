import { normalizeMoney, normalizeText } from './financeNormalizers.js';

export const buildCompanyNameMap = (companies = []) =>
  new Map((companies || []).filter(Boolean).map((company) => [company.id, company.nome]));

export const normalizeRepresentativeList = (items = []) => {
  const unique = new Map();

  (items || []).forEach((item) => {
    const rawName = item?.nome ?? item?.name ?? item?.representante ?? item?.representative ?? '';
    const nome = String(rawName || '').trim();
    if (!nome) return;

    const normalizedKey = normalizeText(nome);
    const id = item?.id || normalizedKey;
    if (!unique.has(normalizedKey)) {
      unique.set(normalizedKey, {
        id,
        nome,
        telefone: item?.telefone || '',
        observacao: item?.observacao || '',
        ativo: item?.ativo !== false,
      });
    }
  });

  return Array.from(unique.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

export const mapRepresentanteToApp = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  nome: row.nome,
  telefone: row.telefone || '',
  email: row.email || '',
  observacao: row.observacao || '',
  ativo: row.ativo !== false,
});

export const mapRepresentanteToDb = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  nome: row.nome,
  telefone: row.telefone || '',
  email: row.email || '',
  observacao: row.observacao || '',
  ativo: row.ativo !== false,
});

export const mapRegistroToApp = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  batchId: row.batch_id ?? row.batchId ?? null,
  nome: row.nome,
  empresaNome: row.empresaNome || row.empresa_nome || '',
  numeroBoleto: row.numero_boleto ?? row.numeroBoleto ?? '',
  documento: row.documento ?? row.numero_boleto ?? row.numeroBoleto ?? '',
  numero_nf: row.numero_nf ?? row.numeroNf ?? '',
  dataVencimento: row.data_vencimento ?? row.dataVencimento ?? '',
  valor: Number(row.valor || 0),
  representanteId: row.representante_id ?? row.representanteId ?? null,
  telefone: row.telefone || '',
  observacao: row.observacao || '',
  status: row.status || 'pendente',
  importadoEm: row.importado_em ?? row.importadoEm ?? null,
  liquidadoEm: row.liquidado_em ?? row.liquidadoEm ?? null,
});

export const mapRegistroToDb = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  batch_id: row.batchId ?? row.batch_id ?? null,
  nome: row.nome,
  documento: row.documento ?? row.numero_boleto ?? row.numeroBoleto ?? row.numero_nf ?? '',
  numero_boleto: row.numeroBoleto ?? row.numero_boleto ?? '',
  numero_nf: row.numero_nf ?? row.numeroNf ?? null,
  data_vencimento: row.dataVencimento ?? row.data_vencimento ?? null,
  valor: Number(row.valor || 0),
  representante_id: row.representanteId ?? row.representante_id ?? null,
  telefone: row.telefone || '',
  observacao: row.observacao || '',
  status: row.status || 'pendente',
  importado_em: row.importadoEm ?? row.importado_em ?? null,
  liquidado_em: row.liquidadoEm ?? row.liquidado_em ?? null,
});

export const mapConfiguracaoToApp = (row) => ({
  company_id: row.company_id,
  user_id: row.user_id,
  multaPercentual: Number(row.multa_percentual ?? row.multaPercentual ?? 2),
  jurosPercentualDia: Number(row.juros_percentual_dia ?? row.jurosPercentualDia ?? 0.033),
});

export const mapConfiguracaoToDb = (row) => ({
  company_id: row.company_id,
  user_id: row.user_id,
  multa_percentual: Number(row.multaPercentual ?? row.multa_percentual ?? 2),
  juros_percentual_dia: Number(row.jurosPercentualDia ?? row.juros_percentual_dia ?? 0.033),
});

export const mapImportacaoToApp = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  batchId: row.batch_id ?? row.batchId ?? null,
  arquivo: row.arquivo,
  empresaNome: row.empresaNome || row.empresa_nome || '',
  tipo: row.tipo || 'vencidos',
  registros: Number(row.registros || 0),
  status: row.status || 'concluida',
  data: row.created_at ?? row.data ?? new Date().toISOString(),
});

export const mapImportacaoToDb = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  batch_id: row.batchId ?? row.batch_id ?? null,
  arquivo: row.arquivo,
  tipo: row.tipo || row.status || 'vencidos',
  registros: Number(row.registros || 0),
  status: row.status === 'erro' ? 'erro' : 'concluida',
  created_at: row.data || row.created_at || new Date().toISOString(),
});

export const toUiHistoryRow = (row, companies = []) => {
  const companyNames = buildCompanyNameMap(companies);
  const companyId = row.company_id ?? row.companyId ?? '';
  const batchId = row.batch_id ?? row.batchId ?? null;

  return {
    id: row.id,
    company_id: companyId,
    companyId,
    batch_id: batchId,
    batchId,
    user_id: row.user_id ?? row.userId ?? null,
    arquivo: row.arquivo || '',
    empresa_nome: row.empresa_nome || row.empresaNome || companyNames.get(companyId) || 'Empresa',
    tipo: row.tipo || 'vencidos',
    quantidade_registros: Number(row.quantidade_registros ?? row.registros ?? 0),
    valor_total: normalizeMoney(row.valor_total ?? row.valorTotal ?? 0),
    status: row.status || 'concluida',
    created_at: row.created_at ?? row.data ?? new Date().toISOString(),
  };
};
