import {
  getFallbackTenantIds,
  getSupabaseConfigStatus,
  getSupabaseSessionUser,
  hasSupabaseConfig,
  supabase
} from './supabaseClient';
import { GLOBAL_COMPANY_ID } from './companyService';

const mockUserId = 'user_demo_1';
const mockDefaultCompanyId = 'emp1';
const isProduction = import.meta.env.PROD;
const isDevelopment = import.meta.env.DEV;

const fallbackTenantIds = getFallbackTenantIds();

const currentUserId = fallbackTenantIds.userId || mockUserId;
const defaultCompanyId = fallbackTenantIds.companyId || mockDefaultCompanyId;

const empresas = [
  { id: 'emp1', nome: 'Construtora Vale Ltda', cnpj: '12.345.678/0001-90', invite_code: 'VALE-2026', user_id: currentUserId },
  { id: 'emp2', nome: 'Comercial Horizonte SA', cnpj: '98.765.432/0001-10', invite_code: 'HORIZ-2026', user_id: currentUserId },
  { id: 'emp3', nome: 'Servicos Integrados ME', cnpj: '55.444.333/0001-22', invite_code: 'SERV-2026', user_id: currentUserId }
];

const representantes = [
  { id: 'r1', company_id: 'emp1', user_id: currentUserId, nome: 'Carlos Mendes', telefone: '(77) 99111-2233', email: 'carlos@vale.com.br', observacao: 'Regiao Sul', ativo: true },
  { id: 'r2', company_id: 'emp1', user_id: currentUserId, nome: 'Juliana Prado', telefone: '(77) 99222-3344', email: 'juliana@vale.com.br', observacao: 'Grandes contas', ativo: true },
  { id: 'r3', company_id: 'emp1', user_id: currentUserId, nome: 'Rogerio Lima', telefone: '(77) 99333-4455', email: 'rogerio@vale.com.br', observacao: '', ativo: false },
  { id: 'r4', company_id: 'emp2', user_id: currentUserId, nome: 'Beatriz Martins', telefone: '(11) 98877-6655', email: 'bia@horizonte.com', observacao: 'Varejo', ativo: true },
  { id: 'r5', company_id: 'emp2', user_id: currentUserId, nome: 'Thiago Araujo', telefone: '(11) 97766-5544', email: 'thiago@horizonte.com', observacao: '', ativo: true },
  { id: 'r6', company_id: 'emp3', user_id: currentUserId, nome: 'Patricia Nogueira', telefone: '(31) 99988-7766', email: 'patricia@si.com.br', observacao: 'Atendimento unico', ativo: true }
];

const registros = [
  { id: '1', company_id: 'emp1', user_id: currentUserId, batchId: 'batch-h1', nome: 'DIOCLECIO XAVIER', numeroBoleto: '2056-3', dataVencimento: '2026-03-18', valor: 1755.77, representanteId: 'r1', telefone: '(77) 99111-2233', observacao: 'Cliente priorizado', status: 'pendente', importadoEm: '2026-04-15T10:00:00Z', liquidadoEm: null },
  { id: '2', company_id: 'emp1', user_id: currentUserId, batchId: 'batch-h1', nome: 'VALERIA CORDEIRO DE SOUZA', numeroBoleto: '2057-8', dataVencimento: '2026-03-18', valor: 771.4, representanteId: 'r2', telefone: '(77) 99222-3344', observacao: '', status: 'pendente', importadoEm: '2026-04-15T10:00:00Z', liquidadoEm: null },
  { id: '3', company_id: 'emp1', user_id: currentUserId, batchId: 'batch-h1', nome: 'MARCOS ANTONIO PEREIRA', numeroBoleto: '2058-1', dataVencimento: '2026-04-22', valor: 2340.5, representanteId: 'r1', telefone: '', observacao: 'Aguardando retorno', status: 'negociacao', importadoEm: '2026-04-15T10:00:00Z', liquidadoEm: null },
  { id: '4', company_id: 'emp1', user_id: currentUserId, batchId: 'batch-h1', nome: 'ANA CAROLINA SANTOS', numeroBoleto: '2059-5', dataVencimento: '2026-04-10', valor: 890, representanteId: null, telefone: '', observacao: '', status: 'pendente', importadoEm: '2026-04-15T10:00:00Z', liquidadoEm: null },
  { id: '5', company_id: 'emp1', user_id: currentUserId, batchId: 'batch-h1', nome: 'JOSE RIBEIRO DA SILVA', numeroBoleto: '2060-7', dataVencimento: '2026-05-05', valor: 4521.3, representanteId: 'r2', telefone: '', observacao: '', status: 'pendente', importadoEm: '2026-04-15T10:00:00Z', liquidadoEm: null },
  { id: '6', company_id: 'emp1', user_id: currentUserId, batchId: 'batch-h1', nome: 'FERNANDA OLIVEIRA COSTA', numeroBoleto: '2061-2', dataVencimento: '2026-04-28', valor: 1200, representanteId: null, telefone: '(77) 99999-0000', observacao: 'Sem retorno', status: 'pendente', importadoEm: '2026-04-15T10:00:00Z', liquidadoEm: null },
  { id: '7', company_id: 'emp1', user_id: currentUserId, batchId: 'batch-h1', nome: 'ROBERTO ALMEIDA LIMA', numeroBoleto: '2062-9', dataVencimento: '2026-03-30', valor: 3150.8, representanteId: 'r1', telefone: '', observacao: '', status: 'pendente', importadoEm: '2026-04-15T10:00:00Z', liquidadoEm: null },
  { id: '8', company_id: 'emp1', user_id: currentUserId, batchId: 'batch-h1', nome: 'PATRICIA GOMES FERREIRA', numeroBoleto: '2063-4', dataVencimento: '2026-05-15', valor: 675.45, representanteId: null, telefone: '', observacao: '', status: 'pendente', importadoEm: '2026-04-15T10:00:00Z', liquidadoEm: null },
  { id: '9', company_id: 'emp2', user_id: currentUserId, batchId: 'batch-emp2-1', nome: 'LOJAS CENTRO SUL LTDA', numeroBoleto: '8801-1', dataVencimento: '2026-05-10', valor: 12450, representanteId: 'r4', telefone: '(11) 98877-6655', observacao: '', status: 'pendente', importadoEm: '2026-04-10T09:00:00Z', liquidadoEm: null },
  { id: '10', company_id: 'emp2', user_id: currentUserId, batchId: 'batch-emp2-1', nome: 'MERCADO BOM PRECO', numeroBoleto: '8802-6', dataVencimento: '2026-04-30', valor: 3890.5, representanteId: 'r5', telefone: '', observacao: '', status: 'pendente', importadoEm: '2026-04-10T09:00:00Z', liquidadoEm: null },
  { id: '11', company_id: 'emp3', user_id: currentUserId, batchId: 'batch-emp3-1', nome: 'CLIENTE SERVICOS UNICO', numeroBoleto: '1001-5', dataVencimento: '2026-05-20', valor: 2500, representanteId: 'r6', telefone: '(31) 99988-7766', observacao: '', status: 'pendente', importadoEm: '2026-04-12T14:30:00Z', liquidadoEm: null }
];

const importacoes = [
  { id: 'h1', company_id: 'emp1', user_id: currentUserId, batchId: 'batch-h1', arquivo: 'sicoob_marco_2026.pdf', tipo: 'vencidos', registros: 8, status: 'concluida', created_at: '2026-04-15T10:00:00Z' }
];

const configuracoes = {
  emp1: { company_id: 'emp1', user_id: currentUserId, multaPercentual: 2, jurosPercentualDia: 0.033 },
  emp2: { company_id: 'emp2', user_id: currentUserId, multaPercentual: 2, jurosPercentualDia: 0.033 },
  emp3: { company_id: 'emp3', user_id: currentUserId, multaPercentual: 2, jurosPercentualDia: 0.033 }
};

const cobrancasWhatsapp = [];
const whatsappCobrancaConfig = {};

const db = {
  empresas,
  representantes,
  registros,
  importacoes,
  configuracoes,
  cobrancasWhatsapp,
  whatsappCobrancaConfig
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const localDelay = async (payload) => {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return clone(payload);
};

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const requireSupabase = () => {
  const { hasSupabaseConfig: configured, supabaseConfigError } = getSupabaseConfigStatus();
  if (!configured || !supabase) {
    throw new Error(isProduction ? 'Supabase não configurado para produção.' : (supabaseConfigError || 'Supabase nao configurado.'));
  }

  return supabase;
};

const ensureMockAllowed = () => {
  if (!isDevelopment) {
    throw new Error('Supabase não configurado para produção.');
  }
};

const buildError = (error, fallback) => {
  if (error instanceof Error) return error;
  return new Error(error?.message || fallback);
};

const isSystemAdminUser = async (userId) => {
  if (!hasSupabaseConfig || !userId) {
    return false;
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from('system_admins')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw buildError(error, 'Falha ao verificar permissao de administrador geral.');
  }

  return Boolean(data?.id);
};

const getSupabaseSessionState = async () => {
  if (!hasSupabaseConfig) {
    if (isProduction) {
      throw new Error('Supabase não configurado para produção.');
    }
    return {
      enabled: false,
      user: null
    };
  }

  const user = await getSupabaseSessionUser().catch(() => null);
  return {
    enabled: Boolean(user?.id),
    user
  };
};

const getEffectiveTenant = async ({ userId, companyId } = {}) => {
  const sessionState = await getSupabaseSessionState();
  const sessionUser = sessionState.user;
  const resolvedUserId = userId || sessionUser?.id || fallbackTenantIds.userId || mockUserId;
  const configuredCompanyId =
    (companyId && String(companyId).trim()) ||
    (fallbackTenantIds.companyId && String(fallbackTenantIds.companyId).trim()) ||
    defaultCompanyId;

  if (sessionState.enabled) {
    if (companyId === GLOBAL_COMPANY_ID) {
      return {
        useSupabase: true,
        userId: resolvedUserId,
        companyId,
        isGlobalMode: true,
        isSystemAdmin: await isSystemAdminUser(resolvedUserId)
      };
    }

    if (!companyId || !isUuid(companyId)) {
      throw new Error('Nenhuma empresa ativa selecionada para a sessao autenticada.');
    }

    return {
      useSupabase: true,
      userId: resolvedUserId,
      companyId,
      isGlobalMode: false,
      isSystemAdmin: await isSystemAdminUser(resolvedUserId)
    };
  }

  if (!sessionState.enabled && isProduction) {
    throw new Error('Supabase não configurado para produção.');
  }

  return {
    useSupabase: false,
    userId: resolvedUserId,
    companyId: configuredCompanyId,
    isGlobalMode: companyId === GLOBAL_COMPANY_ID,
    isSystemAdmin: false
  };
};

const mapEmpresaToApp = (row) => ({
  id: row.id,
  nome: row.nome,
  cnpj: row.cnpj || '',
  inviteCode: row.invite_code || ''
});

const mapRepresentanteToApp = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  nome: row.nome,
  telefone: row.telefone || '',
  email: row.email || '',
  observacao: row.observacao || '',
  ativo: row.ativo !== false
});

const mapRepresentanteToDb = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  nome: row.nome,
  telefone: row.telefone || '',
  email: row.email || '',
  observacao: row.observacao || '',
  ativo: row.ativo !== false
});

const mapRegistroToApp = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  batchId: row.batch_id ?? row.batchId ?? null,
  nome: row.nome,
  empresaNome: row.empresaNome || row.empresa_nome || '',
  numeroBoleto: row.numero_boleto ?? row.numeroBoleto ?? '',
  dataVencimento: row.data_vencimento ?? row.dataVencimento ?? '',
  valor: Number(row.valor || 0),
  representanteId: row.representante_id ?? row.representanteId ?? null,
  telefone: row.telefone || '',
  observacao: row.observacao || '',
  status: row.status || 'pendente',
  importadoEm: row.importado_em ?? row.importadoEm ?? null,
  liquidadoEm: row.liquidado_em ?? row.liquidadoEm ?? null
});

const mapRegistroToDb = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  batch_id: row.batchId ?? row.batch_id ?? null,
  nome: row.nome,
  numero_boleto: row.numeroBoleto ?? row.numero_boleto ?? '',
  data_vencimento: row.dataVencimento ?? row.data_vencimento ?? null,
  valor: Number(row.valor || 0),
  representante_id: row.representanteId ?? row.representante_id ?? null,
  telefone: row.telefone || '',
  observacao: row.observacao || '',
  status: row.status || 'pendente',
  importado_em: row.importadoEm ?? row.importado_em ?? null,
  liquidado_em: row.liquidadoEm ?? row.liquidado_em ?? null
});

const mapConfiguracaoToApp = (row) => ({
  company_id: row.company_id,
  user_id: row.user_id,
  multaPercentual: Number(row.multa_percentual ?? row.multaPercentual ?? 2),
  jurosPercentualDia: Number(row.juros_percentual_dia ?? row.jurosPercentualDia ?? 0.033)
});

const mapConfiguracaoToDb = (row) => ({
  company_id: row.company_id,
  user_id: row.user_id,
  multa_percentual: Number(row.multaPercentual ?? row.multa_percentual ?? 2),
  juros_percentual_dia: Number(row.jurosPercentualDia ?? row.juros_percentual_dia ?? 0.033)
});

const mapImportacaoToApp = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  batchId: row.batch_id ?? row.batchId ?? null,
  arquivo: row.arquivo,
  empresaNome: row.empresaNome || row.empresa_nome || '',
  tipo: row.tipo || 'vencidos',
  registros: Number(row.registros || 0),
  status: row.status || 'concluida',
  data: row.created_at ?? row.data ?? new Date().toISOString()
});

const mapImportacaoToDb = (row) => ({
  id: row.id,
  company_id: row.company_id,
  user_id: row.user_id,
  batch_id: row.batchId ?? row.batch_id ?? null,
  arquivo: row.arquivo,
  tipo: row.tipo || row.status || 'vencidos',
  registros: Number(row.registros || 0),
  status: row.status === 'erro' ? 'erro' : 'concluida',
  created_at: row.data || row.created_at || new Date().toISOString()
});

const normalizeIsoDate = (value) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const mapDbPatchToRegistroPatch = (payload) => {
  const nextPayload = { ...payload };

  if (Object.prototype.hasOwnProperty.call(nextPayload, 'numeroBoleto')) {
    nextPayload.numero_boleto = nextPayload.numeroBoleto;
    delete nextPayload.numeroBoleto;
  }

  if (Object.prototype.hasOwnProperty.call(nextPayload, 'dataVencimento')) {
    nextPayload.data_vencimento = nextPayload.dataVencimento;
    delete nextPayload.dataVencimento;
  }

  if (Object.prototype.hasOwnProperty.call(nextPayload, 'representanteId')) {
    nextPayload.representante_id = nextPayload.representanteId;
    delete nextPayload.representanteId;
  }

  if (Object.prototype.hasOwnProperty.call(nextPayload, 'importadoEm')) {
    nextPayload.importado_em = nextPayload.importadoEm;
    delete nextPayload.importadoEm;
  }

  if (Object.prototype.hasOwnProperty.call(nextPayload, 'batchId')) {
    nextPayload.batch_id = nextPayload.batchId;
    delete nextPayload.batchId;
  }

  if (Object.prototype.hasOwnProperty.call(nextPayload, 'liquidadoEm')) {
    nextPayload.liquidado_em = nextPayload.liquidadoEm;
    delete nextPayload.liquidadoEm;
  }

  return nextPayload;
};

export const financeService = {
  async fetchBootstrap({ userId } = {}) {
    const tenant = await getEffectiveTenant({ userId, companyId: defaultCompanyId });

    if (tenant.useSupabase) {
      return {
        empresas: [],
        registros: [],
        representantes: [],
        historico: [],
        configuracoes: []
      };
    }

    return localDelay({
      empresas: db.empresas.filter((item) => item.user_id === tenant.userId).map(mapEmpresaToApp),
      registros: db.registros.filter((item) => item.user_id === tenant.userId),
      representantes: db.representantes.filter((item) => item.user_id === tenant.userId),
      historico: db.importacoes.filter((item) => item.user_id === tenant.userId).map(mapImportacaoToApp),
      configuracoes: Object.values(db.configuracoes).filter((item) => item.user_id === tenant.userId)
    });
  },

  async fetchCompanyDataset({ companyId, userId } = {}) {
    const tenant = await getEffectiveTenant({ companyId, userId });

    if (tenant.useSupabase) {
      const client = requireSupabase();
      const globalMode = tenant.companyId === GLOBAL_COMPANY_ID;

      if (globalMode && !tenant.isSystemAdmin) {
        throw new Error('A visao global esta disponivel apenas para o administrador geral.');
      }

      const { data: companiesData, error: companiesError } = await client
        .from('empresas')
        .select('id, nome, cnpj, invite_code, created_at');

      if (companiesError) throw buildError(companiesError, 'Falha ao carregar empresas.');

      const companyMap = new Map((companiesData || []).map((company) => [company.id, mapEmpresaToApp(company)]));
      const registrosQuery = client.from('registros_financeiros').select('*').order('data_vencimento', { ascending: true });
      const representantesQuery = client.from('representantes').select('*').order('nome', { ascending: true });
      const importacoesQuery = client.from('importacoes').select('*').order('created_at', { ascending: false });
      const configuracoesQuery = client.from('configuracoes_financeiras').select('*');

      const [registrosRes, representantesRes, importacoesRes, configuracaoRes] = await Promise.all([
        globalMode ? registrosQuery : registrosQuery.eq('company_id', tenant.companyId),
        globalMode ? representantesQuery : representantesQuery.eq('company_id', tenant.companyId),
        globalMode ? importacoesQuery : importacoesQuery.eq('company_id', tenant.companyId),
        globalMode ? configuracoesQuery : configuracoesQuery.eq('company_id', tenant.companyId).maybeSingle()
      ]);

      if (registrosRes.error) throw buildError(registrosRes.error, 'Falha ao carregar registros financeiros.');
      if (representantesRes.error) throw buildError(representantesRes.error, 'Falha ao carregar representantes.');
      if (importacoesRes.error) throw buildError(importacoesRes.error, 'Falha ao carregar importacoes.');
      if (configuracaoRes.error) throw buildError(configuracaoRes.error, 'Falha ao carregar configuracoes financeiras.');

      return {
        companies: (companiesData || []).map(mapEmpresaToApp),
        records: (registrosRes.data || []).map((row) =>
          mapRegistroToApp({
            ...row,
            empresa_nome: companyMap.get(row.company_id)?.nome || 'Empresa desconhecida'
          })
        ),
        representatives: (representantesRes.data || []).map(mapRepresentanteToApp),
        history: (importacoesRes.data || []).map((row) =>
          mapImportacaoToApp({
            ...row,
            empresa_nome: companyMap.get(row.company_id)?.nome || 'Empresa desconhecida'
          })
        ),
        config: globalMode
          ? {
              company_id: GLOBAL_COMPANY_ID,
              user_id: tenant.userId,
              multaPercentual: 2,
              jurosPercentualDia: 0.033
            }
          : configuracaoRes.data
          ? mapConfiguracaoToApp(configuracaoRes.data)
          : {
              company_id: tenant.companyId,
              user_id: tenant.userId,
              multaPercentual: 2,
              jurosPercentualDia: 0.033
            },
        configs: globalMode ? (configuracaoRes.data || []).map(mapConfiguracaoToApp) : []
      };
    }

    const globalMode = tenant.companyId === GLOBAL_COMPANY_ID;
    const selectedCompanyIds = globalMode ? db.empresas.map((item) => item.id) : [tenant.companyId];
    const companyMap = new Map(db.empresas.map((company) => [company.id, mapEmpresaToApp(company)]));

    return localDelay({
      companies: db.empresas.map(mapEmpresaToApp),
      records: db.registros
        .filter((item) => selectedCompanyIds.includes(item.company_id) && item.user_id === tenant.userId)
        .map((item) => ({
          ...item,
          empresaNome: companyMap.get(item.company_id)?.nome || 'Empresa desconhecida'
        })),
      representatives: db.representantes.filter((item) => selectedCompanyIds.includes(item.company_id) && item.user_id === tenant.userId),
      history: db.importacoes
        .filter((item) => selectedCompanyIds.includes(item.company_id) && item.user_id === tenant.userId)
        .map((item) => mapImportacaoToApp({
          ...item,
          empresa_nome: companyMap.get(item.company_id)?.nome || 'Empresa desconhecida'
        })),
      config: globalMode ? {
        company_id: GLOBAL_COMPANY_ID,
        user_id: tenant.userId,
        multaPercentual: 2,
        jurosPercentualDia: 0.033
      } : (db.configuracoes[tenant.companyId] || {
        company_id: tenant.companyId,
        user_id: tenant.userId,
        multaPercentual: 2,
        jurosPercentualDia: 0.033
      })
    });
  },

  async fetchRegistros({ companyId, userId } = {}) {
    const dataset = await this.fetchCompanyDataset({ companyId, userId });
    return dataset.records;
  },

  async insertRegistros(items, tenantOptions = {}) {
    const tenant = await getEffectiveTenant({
      userId: tenantOptions.userId || items[0]?.user_id,
      companyId: tenantOptions.companyId || items[0]?.company_id
    });

    if (!tenant.companyId) {
      throw new Error('Nenhuma empresa ativa selecionada para inserir registros.');
    }

    if (tenant.useSupabase) {
      const client = requireSupabase();
      const payload = items.map((item) =>
        mapRegistroToDb({
          ...item,
          company_id: tenant.companyId,
          user_id: tenant.userId
        })
      );

      const { data, error } = await client.from('registros_financeiros').insert(payload).select();
      if (error) throw buildError(error, 'Falha ao inserir registros.');
      return (data || []).map(mapRegistroToApp);
    }

    db.registros.push(...clone(items));
    return localDelay(items);
  },

  async updateRegistro(recordId, payload, tenantOptions = {}) {
    const tenant = await getEffectiveTenant(tenantOptions);

    if (tenant.useSupabase) {
      const client = requireSupabase();
      const dbPayload = mapDbPatchToRegistroPatch(payload);
      const { data, error } = await client
        .from('registros_financeiros')
        .update(dbPayload)
        .eq('id', recordId)
        .eq('company_id', tenant.companyId)
        .select()
        .single();

      if (error) throw buildError(error, 'Falha ao atualizar registro.');
      return mapRegistroToApp(data);
    }

    const index = db.registros.findIndex((item) => item.id === recordId && item.company_id === tenant.companyId);
    if (index === -1) throw new Error('Registro nao encontrado.');

    db.registros[index] = {
      ...db.registros[index],
      ...payload
    };

    return localDelay(db.registros[index]);
  },

  async deleteRegistros(ids, tenantOptions = {}) {
    const tenant = await getEffectiveTenant(tenantOptions);

    if (tenant.useSupabase) {
      const client = requireSupabase();
      const { error } = await client
        .from('registros_financeiros')
        .delete()
        .in('id', ids)
        .eq('company_id', tenant.companyId);

      if (error) throw buildError(error, 'Falha ao excluir registros.');
      return true;
    }

    db.registros = db.registros.filter((item) => !(item.company_id === tenant.companyId && ids.includes(item.id)));
    return localDelay(true);
  },

  async confirmLiquidacaoManual(rows, tenantOptions = {}) {
    const now = new Date().toISOString();
    const updates = rows.map((row) => ({
      ...row,
      status: 'liquidado',
      observacao: row.observacao || 'Liquidacao confirmada manualmente',
      liquidadoEm: now
    }));

    const tenant = await getEffectiveTenant({
      userId: tenantOptions.userId || rows[0]?.user_id,
      companyId: tenantOptions.companyId || rows[0]?.company_id
    });

    if (tenant.useSupabase) {
      await Promise.all(
        updates.map((row) =>
          this.updateRegistro(
            row.id,
            {
              status: row.status,
              observacao: row.observacao,
              liquidadoEm: row.liquidadoEm
            },
            tenant
          )
        )
      );

      return updates;
    }

    db.registros = db.registros.map((item) => {
      const update = updates.find((row) => row.id === item.id && row.company_id === item.company_id);
      return update ? { ...item, ...update } : item;
    });

    return localDelay(updates);
  },

  async fetchRepresentantes({ companyId, userId } = {}) {
    const dataset = await this.fetchCompanyDataset({ companyId, userId });
    return dataset.representatives;
  },

  async upsertRepresentante(payload, tenantOptions = {}) {
    const tenant = await getEffectiveTenant({
      userId: tenantOptions.userId || payload.user_id,
      companyId: tenantOptions.companyId || payload.company_id
    });

    if (!tenant.companyId) {
      throw new Error('Nenhuma empresa ativa selecionada para salvar representantes.');
    }

    if (tenant.useSupabase) {
      const client = requireSupabase();
      const { data, error } = await client
        .from('representantes')
        .upsert(
          mapRepresentanteToDb({
            ...payload,
            company_id: tenant.companyId,
            user_id: tenant.userId
          })
        )
        .select()
        .single();

      if (error) throw buildError(error, 'Falha ao salvar representante.');
      return mapRepresentanteToApp(data);
    }

    const index = db.representantes.findIndex((item) => item.id === payload.id);

    if (index >= 0) {
      db.representantes[index] = { ...db.representantes[index], ...clone(payload) };
      return localDelay(db.representantes[index]);
    }

    db.representantes.push(clone(payload));
    return localDelay(payload);
  },

  async deleteRepresentante(representanteId, tenantOptions = {}) {
    const tenant = await getEffectiveTenant(tenantOptions);

    if (tenant.useSupabase) {
      const client = requireSupabase();
      const { error } = await client
        .from('representantes')
        .delete()
        .eq('id', representanteId)
        .eq('company_id', tenant.companyId);

      if (error) throw buildError(error, 'Falha ao excluir representante.');
      return true;
    }

    db.representantes = db.representantes.filter((item) => !(item.company_id === tenant.companyId && item.id === representanteId));
    db.registros = db.registros.map((item) =>
      item.company_id === tenant.companyId && item.representanteId === representanteId
        ? { ...item, representanteId: null }
        : item
    );

    return localDelay(true);
  },

  async appendImportacao(entry, tenantOptions = {}) {
    const tenant = await getEffectiveTenant({
      userId: tenantOptions.userId || entry.user_id,
      companyId: tenantOptions.companyId || entry.company_id
    });

    if (!tenant.companyId) {
      throw new Error('Nenhuma empresa ativa selecionada para salvar a importacao.');
    }

    if (tenant.useSupabase) {
      const client = requireSupabase();
      const { data, error } = await client
        .from('importacoes')
        .insert(
          mapImportacaoToDb({
            ...entry,
            company_id: tenant.companyId,
            user_id: tenant.userId
          })
        )
        .select()
        .single();

      if (error) throw buildError(error, 'Falha ao salvar importacao.');
      return mapImportacaoToApp(data);
    }

    db.importacoes.unshift(mapImportacaoToDb(entry));
    return localDelay(mapImportacaoToApp(entry));
  },

  async appendHistorico(entry, tenantOptions = {}) {
    return this.appendImportacao(entry, tenantOptions);
  },

  async deleteImportacoes(ids, empresaAtiva, isAdminGeral = false, tenantOptions = {}) {
    const tenant = await getEffectiveTenant({
      userId: tenantOptions.userId,
      companyId: empresaAtiva?.id || tenantOptions.companyId
    });

    if (!ids?.length) {
      return true;
    }

    if (tenant.useSupabase) {
      const client = requireSupabase();
      const targetCompanyId = isAdminGeral && empresaAtiva?.id === GLOBAL_COMPANY_ID
        ? null
        : tenant.companyId;

      for (const historyId of ids) {
        const payload = {
          p_company_id: targetCompanyId,
          p_history_id: historyId,
        };

        const { error } = await client.rpc('delete_import_batch', payload);

        if (error) {
          throw buildError(error, 'Falha ao excluir itens do historico via RPC transacional.');
        }
      }

      return true;
    }

    ensureMockAllowed();

    const selectedImportacoes = db.importacoes.filter((item) => {
      if (!ids.includes(item.id)) return false;
      if (isAdminGeral && empresaAtiva?.id === GLOBAL_COMPANY_ID) return true;
      return item.company_id === tenant.companyId;
    });

    const selectedBatchKeys = new Set(
      selectedImportacoes
        .filter((item) => item.tipo !== 'liquidacao' && item.batchId)
        .map((item) => `${item.company_id}::${item.batchId}`)
    );

    const fallbackPairs = new Set(
      selectedImportacoes
        .filter((item) => item.tipo !== 'liquidacao' && !item.batchId)
        .map((item) => {
          const normalizedDate = normalizeIsoDate(item.created_at);
          return normalizedDate ? `${item.company_id}::${normalizedDate}` : null;
        })
        .filter(Boolean)
    );

    db.registros = db.registros.filter((item) => {
      const batchKey = item.batchId ? `${item.company_id}::${item.batchId}` : null;
      if (batchKey && selectedBatchKeys.has(batchKey)) return false;

      const fallbackKey = `${item.company_id}::${normalizeIsoDate(item.importadoEm)}`;
      if (fallbackPairs.has(fallbackKey)) return false;

      return true;
    });

    if (isAdminGeral && empresaAtiva?.id === GLOBAL_COMPANY_ID) {
      db.importacoes = db.importacoes.filter((item) => !ids.includes(item.id));
      return localDelay(true);
    }

    db.importacoes = db.importacoes.filter(
      (item) => !(item.company_id === tenant.companyId && ids.includes(item.id))
    );
    return localDelay(true);
  },


  async importSelectedRows(rows, batchId, companyId, options = {}) {
    const tenant = await getEffectiveTenant({ companyId });

    if (!tenant.companyId) {
      throw new Error('Nenhuma empresa ativa selecionada para importar registros.');
    }

    const selectedRows = (rows || []).filter((row) => row.selected !== false);

    if (!selectedRows.length) {
      throw new Error('Nenhuma linha selecionada para importar.');
    }

    const timestamp = new Date().toISOString();
    const tipo = options.tipo || 'vencidos';

    const importacaoEntry = {
      company_id: tenant.companyId,
      user_id: tenant.userId,
      batchId,
      arquivo: options.fileName || 'importacao_ocr.pdf',
      tipo,
      registros: selectedRows.length,
      status: 'concluida',
      data: timestamp,
    };

    if (tipo === 'liquidacao') {
      const liquidacaoRows = selectedRows.map((row) => ({
        ...row,
        company_id: tenant.companyId,
        user_id: tenant.userId,
        batchId,
        status: 'liquidado',
        liquidadoEm: timestamp,
      }));

      await this.confirmLiquidacaoManual(liquidacaoRows, {
        userId: tenant.userId,
        companyId: tenant.companyId,
      });

      await this.appendImportacao(importacaoEntry, {
        userId: tenant.userId,
        companyId: tenant.companyId,
      });

      return { imported: [], historySaved: true, batch_id: batchId };
    }

    const payload = selectedRows.map((row) => ({
      id: row.id,
      company_id: tenant.companyId,
      user_id: tenant.userId,
      batchId,
      nome: row.nome || '',
      numeroBoleto: row.numero_boleto ?? row.documento ?? row.numeroBoleto ?? '',
      dataVencimento: row.data_vencimento ?? row.dataVencimento ?? '',
      valor: Number(row.valor || 0),
      representanteId: row.representante_id ?? row.representanteId ?? null,
      telefone: row.telefone || '',
      observacao: row.observacoes ?? row.observacao ?? '',
      status: row.status || 'pendente',
      importadoEm: row.importado_em ?? row.importadoEm ?? timestamp,
      liquidadoEm: null,
    }));

    const inserted = await this.insertRegistros(payload, {
      userId: tenant.userId,
      companyId: tenant.companyId,
    });

    await this.appendImportacao(importacaoEntry, {
      userId: tenant.userId,
      companyId: tenant.companyId,
    });

    return { imported: inserted || [], historySaved: true, batch_id: batchId };
  },

  async updateConfiguracao(payload, tenantOptions = {}) {
    const tenant = await getEffectiveTenant({
      userId: tenantOptions.userId || payload.user_id,
      companyId: tenantOptions.companyId || payload.company_id,
    });

    if (!tenant.companyId || tenant.companyId === GLOBAL_COMPANY_ID) {
      throw new Error('Selecione uma empresa especifica para salvar a configuracao financeira.');
    }

    if (tenant.useSupabase) {
      const client = requireSupabase();
      const { data, error } = await client
        .from('configuracoes_financeiras')
        .upsert(mapConfiguracaoToDb({
          ...payload,
          company_id: tenant.companyId,
          user_id: tenant.userId,
        }))
        .select()
        .single();

      if (error) throw buildError(error, 'Falha ao salvar configuracao financeira.');
      return mapConfiguracaoToApp(data);
    }

    ensureMockAllowed();
    db.configuracoes[tenant.companyId] = {
      company_id: tenant.companyId,
      user_id: tenant.userId,
      multaPercentual: Number(payload.multaPercentual ?? 2),
      jurosPercentualDia: Number(payload.jurosPercentualDia ?? 0.033),
    };
    return localDelay(db.configuracoes[tenant.companyId]);
  },

  async clearOverview(companyId, tenantOptions = {}) {
    const tenant = await getEffectiveTenant({
      userId: tenantOptions.userId,
      companyId: tenantOptions.companyId || companyId,
    });

    if (!tenant.companyId || tenant.companyId === GLOBAL_COMPANY_ID) {
      throw new Error('Selecione uma empresa especifica para limpar a visao geral.');
    }

    if (tenant.useSupabase) {
      const client = requireSupabase();
      const { error } = await client
        .from('registros_financeiros')
        .delete()
        .eq('company_id', tenant.companyId);

      if (error) throw buildError(error, 'Falha ao limpar a visao geral.');
      return true;
    }

    ensureMockAllowed();
    db.registros = db.registros.filter((item) => item.company_id !== tenant.companyId);
    return localDelay(true);
  },
};

export const tenantContext = {
  get currentUserId() { return currentUserId; },
  get defaultCompanyId() { return defaultCompanyId; },
};
