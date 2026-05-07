import { currentTenantUserId as currentUserId } from './tenantContext.js';
import { mapImportacaoToApp } from './financeAdapters.js';

export const sampleNames = [
  'VALERIA CORDEIRO DE SOUZA',
  'DIOCLECIO XAVIER',
  'CONSTRUTORA PARQUE REAL',
  'CLINICA SANTA LUZIA',
  'LOJAS CENTRO SUL LTDA',
  'MERCADO BOM PRECO',
  'REALCE ESTOFADOS',
  'ORTHOMAX COLCHOES',
];

export const samplePhones = [
  '77981376867',
  '77991112233',
  '11988776655',
  '31999887766',
  '',
  '',
];

const empresas = [
  { id: 'emp1', nome: 'Construtora Vale Ltda', cnpj: '12.345.678/0001-90', invite_code: 'VALE-2026', user_id: currentUserId },
  { id: 'emp2', nome: 'Comercial Horizonte SA', cnpj: '98.765.432/0001-10', invite_code: 'HORIZ-2026', user_id: currentUserId },
  { id: 'emp3', nome: 'Servicos Integrados ME', cnpj: '55.444.333/0001-22', invite_code: 'SERV-2026', user_id: currentUserId },
];

const representantes = [
  { id: 'r1', company_id: 'emp1', user_id: currentUserId, nome: 'Carlos Mendes', telefone: '(77) 99111-2233', email: 'carlos@vale.com.br', observacao: 'Regiao Sul', ativo: true },
  { id: 'r2', company_id: 'emp1', user_id: currentUserId, nome: 'Juliana Prado', telefone: '(77) 99222-3344', email: 'juliana@vale.com.br', observacao: 'Grandes contas', ativo: true },
  { id: 'r3', company_id: 'emp1', user_id: currentUserId, nome: 'Rogerio Lima', telefone: '(77) 99333-4455', email: 'rogerio@vale.com.br', observacao: '', ativo: false },
  { id: 'r4', company_id: 'emp2', user_id: currentUserId, nome: 'Beatriz Martins', telefone: '(11) 98877-6655', email: 'bia@horizonte.com', observacao: 'Varejo', ativo: true },
  { id: 'r5', company_id: 'emp2', user_id: currentUserId, nome: 'Thiago Araujo', telefone: '(11) 97766-5544', email: 'thiago@horizonte.com', observacao: '', ativo: true },
  { id: 'r6', company_id: 'emp3', user_id: currentUserId, nome: 'Patricia Nogueira', telefone: '(31) 99988-7766', email: 'patricia@si.com.br', observacao: 'Atendimento unico', ativo: true },
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
  { id: '11', company_id: 'emp3', user_id: currentUserId, batchId: 'batch-emp3-1', nome: 'CLIENTE SERVICOS UNICO', numeroBoleto: '1001-5', dataVencimento: '2026-05-20', valor: 2500, representanteId: 'r6', telefone: '(31) 99988-7766', observacao: '', status: 'pendente', importadoEm: '2026-04-12T14:30:00Z', liquidadoEm: null },
];

const importacoes = [
  { id: 'h1', company_id: 'emp1', user_id: currentUserId, batchId: 'batch-h1', arquivo: 'sicoob_marco_2026.pdf', tipo: 'vencidos', registros: 8, status: 'concluida', created_at: '2026-04-15T10:00:00Z' },
];

const configuracoes = {
  emp1: { company_id: 'emp1', user_id: currentUserId, multaPercentual: 2, jurosPercentualDia: 0.033 },
  emp2: { company_id: 'emp2', user_id: currentUserId, multaPercentual: 2, jurosPercentualDia: 0.033 },
  emp3: { company_id: 'emp3', user_id: currentUserId, multaPercentual: 2, jurosPercentualDia: 0.033 },
};

const cobrancasWhatsapp = [];
const whatsappCobrancaConfig = {};

export const db = {
  empresas,
  representantes,
  registros,
  importacoes,
  configuracoes,
  cobrancasWhatsapp,
  whatsappCobrancaConfig,
};

export const defaultAutomationRules = {
  active: false,
  horario: '08:00',
  canal: 'WhatsApp',
  intervalo_dias: 5,
  cobrar_apos_dias_vencido: 1,
  protesto_apos_5_dias: true,
  mensagem_template: '',
  rules: [],
};

export const clone = (value) => JSON.parse(JSON.stringify(value));

export const localDelay = async (payload) => {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return clone(payload);
};

export const mapEmpresaToApp = (row) => ({
  id: row.id,
  nome: row.nome,
  cnpj: row.cnpj || '',
  inviteCode: row.invite_code || '',
});

export const createDefaultFinanceConfig = (companyId, userId = currentUserId) => ({
  company_id: companyId,
  user_id: userId,
  multaPercentual: 2,
  jurosPercentualDia: 0.033,
});

export const buildLocalBootstrap = ({ userId }) => ({
  empresas: db.empresas.filter((item) => item.user_id === userId).map(mapEmpresaToApp),
  registros: db.registros.filter((item) => item.user_id === userId),
  representantes: db.representantes.filter((item) => item.user_id === userId),
  historico: db.importacoes.filter((item) => item.user_id === userId).map(mapImportacaoToApp),
  configuracoes: Object.values(db.configuracoes).filter((item) => item.user_id === userId),
});

export const buildLocalCompanyDataset = ({ companyId, userId, isGlobalMode = false }) => {
  const selectedCompanyIds = isGlobalMode ? db.empresas.map((item) => item.id) : [companyId];
  const companyMap = new Map(db.empresas.map((company) => [company.id, mapEmpresaToApp(company)]));

  return {
    companies: db.empresas.map(mapEmpresaToApp),
    records: db.registros
      .filter((item) => selectedCompanyIds.includes(item.company_id) && item.user_id === userId)
      .map((item) => ({
        ...item,
        empresaNome: companyMap.get(item.company_id)?.nome || 'Empresa desconhecida',
      })),
    representatives: db.representantes.filter((item) => selectedCompanyIds.includes(item.company_id) && item.user_id === userId),
    history: db.importacoes
      .filter((item) => selectedCompanyIds.includes(item.company_id) && item.user_id === userId)
      .map((item) =>
        mapImportacaoToApp({
          ...item,
          empresa_nome: companyMap.get(item.company_id)?.nome || 'Empresa desconhecida',
        }),
      ),
    config: isGlobalMode
      ? createDefaultFinanceConfig(companyId, userId)
      : db.configuracoes[companyId] || createDefaultFinanceConfig(companyId, userId),
  };
};
