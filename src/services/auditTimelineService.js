import { supabase, hasSupabaseConfig } from './supabaseClient';
import { logAuditEvent } from './auditService';

export const ACTION_META = {
  import_created: { label: 'Importacao criada', color: 'sky', group: 'financeiro' },
  import_confirmed: { label: 'Importacao confirmada', color: 'emerald', group: 'financeiro' },
  history_deleted: { label: 'Lote removido', color: 'red', group: 'financeiro' },
  records_deleted: { label: 'Registros excluidos', color: 'red', group: 'financeiro' },
  view_cleared: { label: 'Visao geral limpa', color: 'orange', group: 'financeiro' },
  record_edited: { label: 'Registro editado', color: 'blue', group: 'financeiro' },
  export_data: { label: 'Dados exportados', color: 'violet', group: 'financeiro' },
  representative_changed: { label: 'Representante alterado', color: 'blue', group: 'financeiro' },
  financial_config_changed: { label: 'Configuracao financeira alterada', color: 'blue', group: 'financeiro' },
  charge_prepared: { label: 'Cobranca preparada', color: 'sky', group: 'cobranca' },
  collection_ai_generated: { label: 'Mensagem inteligente gerada', color: 'violet', group: 'cobranca' },
  whatsapp_sent: { label: 'Cobranca enviada', color: 'green', group: 'cobranca' },
  whatsapp_failed: { label: 'Envio falhou', color: 'red', group: 'cobranca' },
  whatsapp_simulated: { label: 'Cobranca simulada', color: 'yellow', group: 'cobranca' },
  automation_executed: { label: 'Automacao executada', color: 'violet', group: 'automacao' },
  automation_simulated: { label: 'Simulacao executada', color: 'yellow', group: 'automacao' },
  automation_scheduled: { label: 'Rotina salva', color: 'sky', group: 'automacao' },
  plan_changed: { label: 'Plano alterado', color: 'blue', group: 'sistema' },
  limit_reached: { label: 'Limite atingido', color: 'red', group: 'sistema' },
  trial_started: { label: 'Trial iniciado', color: 'emerald', group: 'sistema' },
  trial_ending: { label: 'Trial proximo do fim', color: 'yellow', group: 'sistema' },
  trial_ended: { label: 'Trial encerrado', color: 'slate', group: 'sistema' },
  notification_created: { label: 'Notificacao criada', color: 'sky', group: 'sistema' },
  notification_read: { label: 'Notificacao lida', color: 'slate', group: 'sistema' },
  user_joined: { label: 'Usuario entrou na empresa', color: 'emerald', group: 'usuarios' },
  user_removed: { label: 'Usuario saiu da empresa', color: 'red', group: 'usuarios' },
  permission_changed: { label: 'Permissao alterada', color: 'orange', group: 'usuarios' },
};

export const GROUP_LABELS = {
  financeiro: 'Financeiro',
  cobranca: 'Cobranca',
  automacao: 'Automacoes',
  sistema: 'Sistema',
  usuarios: 'Usuarios',
};

const MOCK_EVENTS = [
  {
    id: 'mock-1',
    action: 'import_confirmed',
    entity: 'importacoes',
    entity_id: null,
    metadata: { arquivo: 'vencidos_maio.xlsx', registros: 48, tipo: 'vencidos' },
    title: 'Importacao confirmada',
    description: '48 registros adicionados ao lote vencidos_maio.xlsx',
    severity: 'success',
    user_email: 'operador@empresa.com',
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 'mock-2',
    action: 'whatsapp_sent',
    entity: 'cobrancas_whatsapp',
    entity_id: null,
    metadata: { cliente: 'ABC Comercio', valor: 4250.0, telefone: '+5511999990000' },
    title: 'Cobranca enviada',
    description: 'Cobranca enviada para ABC Comercio - R$ 4.250,00',
    severity: 'success',
    user_email: 'financeiro@empresa.com',
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: 'mock-3',
    action: 'plan_changed',
    entity: 'empresas',
    entity_id: null,
    metadata: { from: 'starter', to: 'pro' },
    title: 'Plano alterado',
    description: 'Plano alterado de Starter para Pro',
    severity: 'info',
    user_email: 'admin@empresa.com',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

function buildDescription(action, metadata = {}) {
  switch (action) {
    case 'import_created':
      return metadata.arquivo ? `Previa criada para ${metadata.arquivo}` : 'Previa de importacao criada';
    case 'import_confirmed':
      return metadata.arquivo
        ? `${metadata.registros || 0} registro(s) confirmados em ${metadata.arquivo}`
        : 'Lote de importacao confirmado';
    case 'history_deleted':
      return metadata.batch_id
        ? `Lote ${String(metadata.batch_id).slice(0, 8)} removido do historico`
        : 'Lote removido do historico';
    case 'records_deleted':
      return `${metadata.count || 0} registro(s) excluido(s) da carteira`;
    case 'view_cleared':
      return `${metadata.count || 0} registro(s) removido(s) da visao geral`;
    case 'record_edited':
      return metadata.field ? `Campo ${metadata.field} atualizado no registro` : 'Registro financeiro atualizado';
    case 'representative_changed':
      return metadata.nome
        ? `Representante ${metadata.nome} atualizado`
        : metadata.mode === 'delete'
          ? 'Representante removido'
          : 'Representante atualizado';
    case 'charge_prepared':
      return metadata.documento
        ? `Cobranca preparada para o documento ${metadata.documento}`
        : 'Cobranca preparada manualmente';
    case 'collection_ai_generated':
      return metadata.tone_label
        ? `Mensagem gerada com tom ${String(metadata.tone_label).toLowerCase()}`
        : 'Mensagem inteligente gerada para cobranca';
    case 'whatsapp_sent':
      return metadata.mocked
        ? 'Cobranca registrada em modo simulacao'
        : 'Cobranca enviada com sucesso';
    case 'whatsapp_failed':
      return metadata.error || metadata.erro || 'Falha no envio via WhatsApp.';
    case 'whatsapp_simulated':
      return 'Cobranca simulada antes do envio real';
    case 'automation_executed':
      return metadata.rotina ? `Automacao ${metadata.rotina} executada` : 'Automacao executada';
    case 'automation_simulated':
      return 'Simulacao de automacao executada';
    case 'automation_scheduled':
      return 'Regras de automacao atualizadas';
    case 'plan_changed':
      return metadata.to ? `Plano atualizado para ${metadata.to}` : 'Plano alterado';
    case 'limit_reached':
      return metadata.metric_label
        ? `Limite de ${metadata.metric_label.toLowerCase()} atingido no ciclo atual`
        : 'Limite do plano atingido';
    case 'trial_ending':
      return metadata.days_left != null ? `Trial termina em ${metadata.days_left} dia(s)` : 'Trial proximo do fim';
    case 'notification_created':
      return metadata.notification_title || 'Nova notificacao gerada no sistema';
    case 'notification_read':
      return metadata.notification_title || 'Notificacao marcada como lida';
    case 'user_joined':
      return metadata.user_email ? `${metadata.user_email} entrou na empresa` : 'Usuario entrou na empresa';
    case 'user_removed':
      return metadata.user_email ? `${metadata.user_email} saiu da empresa` : 'Usuario saiu da empresa';
    default:
      return '';
  }
}

function normalizeEvent(raw = {}) {
  const meta = ACTION_META[raw.action] || { label: raw.action || 'Evento', color: 'slate', group: 'sistema' };
  const md = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};

  return {
    id: raw.id,
    company_id: raw.company_id || '',
    action: raw.action || 'unknown',
    entity: raw.entity || raw.entity_type || '',
    entity_id: raw.entity_id || '',
    metadata: md,
    title: raw.title || md.title || meta.label,
    description: raw.description || md.description || buildDescription(raw.action, md),
    severity: raw.severity || md.severity || 'info',
    color: meta.color,
    group: meta.group,
    user_id: raw.user_id || null,
    user_email: raw.user_email || md.user_email || null,
    created_at: raw.created_at || new Date().toISOString(),
    favorited: Boolean(md._favorited),
  };
}

export async function getAuditEvents(companyId, filters = {}, options = {}) {
  const { allCompanies = false } = options;

  if ((!companyId && !allCompanies) || !hasSupabaseConfig || !supabase) {
    return MOCK_EVENTS.map(normalizeEvent);
  }

  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (!allCompanies) {
    query = query.eq('company_id', companyId);
  }

  const now = new Date();
  if (filters.period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    query = query.gte('created_at', start.toISOString());
  } else if (filters.period === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    query = query.gte('created_at', start.toISOString());
  } else if (filters.period === '30d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    query = query.gte('created_at', start.toISOString());
  } else if (filters.period === 'custom' && filters.dateStart) {
    query = query.gte('created_at', new Date(filters.dateStart).toISOString());
    if (filters.dateEnd) {
      const end = new Date(filters.dateEnd);
      end.setHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }
  }

  if (filters.userId) {
    query = query.eq('user_id', filters.userId);
  }

  if (filters.action && filters.action !== 'todos') {
    query = query.eq('action', filters.action);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || 'Falha ao carregar eventos de auditoria.');
  }

  let events = (Array.isArray(data) ? data : []).map(normalizeEvent);

  if (filters.group && filters.group !== 'todos') {
    events = events.filter((event) => event.group === filters.group);
  }

  if (filters.entity) {
    const entityTerm = String(filters.entity).toLowerCase();
    events = events.filter(
      (event) =>
        String(event.entity || '').toLowerCase().includes(entityTerm) ||
        String(event.entity_id || '').toLowerCase().includes(entityTerm)
    );
  }

  if (filters.userQuery) {
    const userTerm = String(filters.userQuery).toLowerCase();
    events = events.filter(
      (event) =>
        String(event.user_email || '').toLowerCase().includes(userTerm) ||
        String(event.user_id || '').toLowerCase().includes(userTerm)
    );
  }

  if (filters.search) {
    const term = String(filters.search).toLowerCase();
    events = events.filter(
      (event) =>
        String(event.title || '').toLowerCase().includes(term) ||
        String(event.description || '').toLowerCase().includes(term) ||
        String(event.user_email || '').toLowerCase().includes(term) ||
        String(event.entity || '').toLowerCase().includes(term)
    );
  }

  return events;
}

export async function getRecentAudit(companyId, limit = 5, options = {}) {
  const { allCompanies = false } = options;

  if ((!companyId && !allCompanies) || !hasSupabaseConfig || !supabase) {
    return MOCK_EVENTS.slice(0, limit).map(normalizeEvent);
  }

  let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (!allCompanies) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Falha ao carregar auditoria recente.');
  }

  return (Array.isArray(data) ? data : []).map(normalizeEvent);
}

export async function createAuditEvent(companyId, payload = {}) {
  const {
    action,
    entity_type,
    entity,
    entity_id,
    title,
    description,
    metadata = {},
    severity = 'info',
    userId = null,
  } = payload;

  return logAuditEvent({
    companyId,
    userId,
    action,
    entity: entity || entity_type || 'sistema',
    entityId: entity_id,
    title: title || '',
    description: description || '',
    severity,
    metadata,
  });
}

export function groupAuditByDay(events = []) {
  const map = new Map();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const formatDay = (date) =>
    `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

  const todayKey = formatDay(today);
  const yesterdayKey = formatDay(yesterday);

  for (const event of events) {
    const date = new Date(event.created_at);
    const key = formatDay(date);
    const label = key === todayKey ? 'Hoje' : key === yesterdayKey ? 'Ontem' : key;

    if (!map.has(key)) {
      map.set(key, { date: key, label, events: [] });
    }
    map.get(key).events.push(event);
  }

  return Array.from(map.values());
}

export default {
  ACTION_META,
  GROUP_LABELS,
  getAuditEvents,
  getRecentAudit,
  createAuditEvent,
  groupAuditByDay,
};
