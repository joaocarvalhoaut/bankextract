const ROLE_HIERARCHY = {
  visualizador: 0,
  membro: 1,
  member: 1,
  operador: 2,
  financeiro: 3,
  admin: 4,
  owner: 5,
};

const ACTION_MIN_ROLE = {
  view_dashboard: 'visualizador',
  import_files: 'operador',
  confirm_import: 'operador',
  edit_financial_records: 'financeiro',
  delete_financial_records: 'financeiro',
  clear_overview: 'admin',
  view_history: 'visualizador',
  delete_history: 'financeiro',
  export_data: 'financeiro',
  manage_charges: 'financeiro',
  manage_automations: 'admin',
  manage_integrations: 'admin',
  manage_users: 'admin',
  manage_company_settings: 'admin',
};

const LEGACY_ACTION_MAP = {
  importar: 'import_files',
  confirmar_importacao: 'confirm_import',
  editar_registro: 'edit_financial_records',
  excluir_registros: 'delete_financial_records',
  limpar_visao: 'clear_overview',
  excluir_historico: 'delete_history',
  exportar_csv: 'export_data',
  exportar_excel: 'export_data',
  cobrar_whatsapp: 'manage_charges',
  config_whatsapp: 'manage_automations',
  config_auto_cobranca: 'manage_automations',
  config_google_sheets: 'manage_integrations',
  criar_representante: 'edit_financial_records',
  editar_representante: 'edit_financial_records',
  excluir_representante: 'delete_financial_records',
  editar_empresa: 'manage_company_settings',
  excluir_empresa: 'manage_company_settings',
  convidar_membros: 'manage_users',
  ver_dashboard: 'view_dashboard',
  ver_historico: 'view_history',
};

const ROLE_LABELS = {
  owner: 'Proprietário',
  admin: 'Administrador',
  financeiro: 'Financeiro',
  operador: 'Operador',
  visualizador: 'Visualizador',
  membro: 'Membro legado',
  member: 'Member legado',
};

const ROLE_COLORS = {
  owner: 'text-purple-700 bg-purple-50 border-purple-200',
  admin: 'text-blue-700 bg-blue-50 border-blue-200',
  financeiro: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  operador: 'text-amber-700 bg-amber-50 border-amber-200',
  visualizador: 'text-slate-600 bg-slate-50 border-slate-200',
  membro: 'text-amber-700 bg-amber-50 border-amber-200',
  member: 'text-amber-700 bg-amber-50 border-amber-200',
};

export const ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  FINANCEIRO: 'financeiro',
  OPERADOR: 'operador',
  VISUALIZADOR: 'visualizador',
  MEMBRO: 'membro',
  MEMBER: 'member',
});

export const normalizeUserRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();

  if (!normalized) return 'visualizador';
  if (normalized === 'membro' || normalized === 'member') {
    return 'operador';
  }

  return ROLE_HIERARCHY[normalized] >= 0 ? normalized : 'visualizador';
};

export const normalizePermissionAction = (action) =>
  LEGACY_ACTION_MAP[action] || action;

export function canUserPerformAction(userRole, action) {
  const normalizedRole = normalizeUserRole(userRole);
  const normalizedAction = normalizePermissionAction(action);
  const minRole = ACTION_MIN_ROLE[normalizedAction];

  if (!minRole) {
    return ROLE_HIERARCHY[normalizedRole] >= ROLE_HIERARCHY.visualizador;
  }

  return ROLE_HIERARCHY[normalizedRole] >= ROLE_HIERARCHY[minRole];
}

export function getRoleLabel(role) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  return ROLE_LABELS[normalizedRole] || ROLE_LABELS[normalizeUserRole(role)] || 'Visualizador';
}

export function getRoleColor(role) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  return ROLE_COLORS[normalizedRole] || ROLE_COLORS[normalizeUserRole(role)] || ROLE_COLORS.visualizador;
}

export const permissionActionCatalog = Object.freeze({ ...ACTION_MIN_ROLE });
