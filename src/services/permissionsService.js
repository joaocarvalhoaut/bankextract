/**
 * BankExtract Pro — Serviço de Permissões
 *
 * Mapeia roles de usuário para ações permitidas no sistema.
 * Usado no frontend para habilitar/desabilitar botões e formulários.
 *
 * IMPORTANTE: Este serviço é uma camada de UX — a segurança real
 * está nas políticas RLS do Supabase (bankextract_security_audit.sql).
 * Nunca confiar apenas neste serviço para proteger dados.
 *
 * Hierarquia de roles (maior = mais permissões):
 *   5 owner       — dono da empresa, pode tudo incluindo excluir empresa
 *   4 admin       — admin da empresa, pode quase tudo
 *   3 financeiro  — pode importar, editar, excluir registros e cobrar
 *   2 operador    — pode importar e editar registros
 *   1 membro      — visualiza e edita células individuais
 *   1 member      — alias de membro
 *   0 visualizador — apenas leitura
 */

export const ROLES = {
  OWNER:        'owner',
  ADMIN:        'admin',
  FINANCEIRO:   'financeiro',
  OPERADOR:     'operador',
  MEMBRO:       'membro',
  MEMBER:       'member',
  VISUALIZADOR: 'visualizador',
};

/** Nível numérico de cada role (maior = mais poder). */
const ROLE_LEVEL = {
  owner:        5,
  admin:        4,
  financeiro:   3,
  operador:     2,
  membro:       1,
  member:       1,
  visualizador: 0,
};

/**
 * Role mínimo necessário para cada ação.
 * Ações não listadas são liberadas para todos.
 */
const ACTION_MIN_ROLE = {
  // Importação
  importar:              'operador',
  confirmar_importacao:  'operador',

  // Registros financeiros
  editar_registro:       'operador',
  excluir_registros:     'financeiro',
  limpar_visao:          'financeiro',

  // Histórico de importações
  excluir_historico:     'admin',

  // Exportação
  exportar_csv:          'operador',

  // WhatsApp
  cobrar_whatsapp:       'operador',
  config_whatsapp:       'admin',
  config_auto_cobranca:  'admin',

  // Google Sheets
  config_google_sheets:  'admin',

  // Representantes
  criar_representante:   'admin',
  editar_representante:  'admin',
  excluir_representante: 'admin',

  // Empresa
  editar_empresa:        'admin',
  excluir_empresa:       'owner',
  convidar_membros:      'admin',
};

/**
 * Verifica se um usuário com o role informado pode executar a ação.
 *
 * @param {string|null} role   - Role do usuário na empresa ativa (ex: 'admin', 'operador')
 * @param {string}      action - Chave da ação (ver ACTION_MIN_ROLE acima)
 * @returns {boolean}
 *
 * @example
 *   canUserPerformAction('operador', 'importar')     // → true
 *   canUserPerformAction('visualizador', 'importar') // → false
 *   canUserPerformAction(null, 'importar')           // → false
 */
export function canUserPerformAction(role, action) {
  if (!role) return false;

  const userLevel = ROLE_LEVEL[role] ?? -1;
  const minRole   = ACTION_MIN_ROLE[action];

  // Ação não mapeada → permitida para qualquer membro
  if (!minRole) return userLevel >= 0;

  const minLevel = ROLE_LEVEL[minRole] ?? 999;
  return userLevel >= minLevel;
}

/**
 * Retorna o label legível do role para exibição na UI.
 *
 * @param {string|null} role
 * @returns {string}
 */
export function getRoleLabel(role) {
  const labels = {
    owner:        'Proprietário',
    admin:        'Administrador',
    financeiro:   'Financeiro',
    operador:     'Operador',
    membro:       'Membro',
    member:       'Membro',
    visualizador: 'Visualizador',
  };
  return labels[role] || role || 'Sem role';
}

/**
 * Retorna a cor do badge de role para exibição visual.
 *
 * @param {string|null} role
 * @returns {string} - classe Tailwind de cor
 */
export function getRoleColor(role) {
  const colors = {
    owner:        'text-purple-700 bg-purple-50 border-purple-200',
    admin:        'text-blue-700 bg-blue-50 border-blue-200',
    financeiro:   'text-emerald-700 bg-emerald-50 border-emerald-200',
    operador:     'text-amber-700 bg-amber-50 border-amber-200',
    membro:       'text-slate-700 bg-slate-50 border-slate-200',
    member:       'text-slate-700 bg-slate-50 border-slate-200',
    visualizador: 'text-slate-500 bg-slate-50 border-slate-200',
  };
  return colors[role] || 'text-slate-500 bg-slate-50 border-slate-200';
}
