import { getNotifications } from './notificationService';
import { hasSupabaseConfig, supabase } from './supabaseClient';
import { getCurrentUsage } from './usageService';

const STORAGE_KEY = 'bankextract.production-checklist';

export const PRODUCTION_CHECKLIST_ITEMS = [
  { key: 'saas_migration_applied', title: 'Migration SaaS aplicada', category: 'infra' },
  { key: 'notifications_migration_applied', title: 'Migration notificacoes aplicada', category: 'infra' },
  { key: 'audit_migration_applied', title: 'Migration auditoria aplicada', category: 'infra' },
  { key: 'test_company_created', title: 'Empresa teste criada', category: 'cadastro' },
  { key: 'import_tested', title: 'Importacao testada', category: 'operacao' },
  { key: 'manual_charge_tested', title: 'Cobranca manual testada', category: 'operacao' },
  { key: 'automation_tested', title: 'Automacao/simulacao testada', category: 'operacao' },
  { key: 'usage_counters_working', title: 'Usage counters funcionando', category: 'saas' },
  { key: 'notifications_working', title: 'Notificacoes funcionando', category: 'saas' },
  { key: 'audit_working', title: 'Auditoria funcionando', category: 'saas' },
  { key: 'plans_billing_working', title: 'Planos/Billing funcionando', category: 'saas' },
  { key: 'help_center_working', title: 'Help Center funcionando', category: 'produto' },
  { key: 'collection_ai_working', title: 'IA cobranca funcionando', category: 'produto' },
  { key: 'supabase_backup_checked', title: 'Backup Supabase conferido', category: 'infra' },
  { key: 'env_production_checked', title: 'Variaveis .env producao conferidas', category: 'infra' },
];

const STATUS_VALUES = ['pendente', 'em_andamento', 'concluido'];

const normalizeStatus = (value) => (STATUS_VALUES.includes(value) ? value : 'pendente');

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

const readMockStore = () => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeMockStore = (nextValue) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextValue));
};

const isSupabaseChecklistAvailable = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return !(
    message.includes('production_checklist_items') &&
    (message.includes('does not exist') ||
      message.includes('could not find the table') ||
      message.includes('relation') ||
      message.includes('schema cache'))
  );
};

const normalizeItem = (companyId, definition, row = {}) => ({
  id: row.id || makeUuid(),
  company_id: companyId || row.company_id || '',
  item_key: definition.key,
  title: definition.title,
  category: definition.category,
  status: normalizeStatus(row.status),
  owner_name: String(row.owner_name || '').trim(),
  notes: String(row.notes || '').trim(),
  completed_at: row.completed_at || null,
  created_at: row.created_at || null,
  updated_at: row.updated_at || null,
});

const buildEvidence = (found, summary = '', details = {}) => ({
  found: Boolean(found),
  summary: String(summary || '').trim(),
  details,
});

const hasMeaningfulUsage = (usage) =>
  Boolean(
    usage &&
      (
        Number(usage.imports_month || 0) > 0 ||
        Number(usage.charges_month || 0) > 0 ||
        Number(usage.automations_month || 0) > 0 ||
        Number(usage.users_count || 0) > 0
      )
  );

const buildEvidenceMap = ({ company = null, subscription = null, financialCount = 0, notifications = [], usage = null, auditEvents = [] }) => {
  const eventsByAction = new Map();
  for (const event of auditEvents || []) {
    const current = eventsByAction.get(event.action) || [];
    current.push(event);
    eventsByAction.set(event.action, current);
  }

  const getFirstAction = (actions = []) => {
    for (const action of actions) {
      const items = eventsByAction.get(action);
      if (items?.length) return items[0];
    }
    return null;
  };

  const importEvent = getFirstAction(['import_confirmed', 'import_created']);
  const chargeEvent = getFirstAction(['charge_prepared', 'whatsapp_sent', 'whatsapp_simulated', 'whatsapp_failed']);
  const automationEvent = getFirstAction(['automation_executed', 'automation_simulated']);
  const aiEvent = getFirstAction(['collection_ai_generated']);
  const hasUsageEvidence = hasMeaningfulUsage(usage);
  const hasNotifications = Array.isArray(notifications) && notifications.length > 0;
  const hasAudit = Array.isArray(auditEvents) && auditEvents.length > 0;

  return {
    test_company_created: company || subscription
      ? buildEvidence(
          true,
          subscription?.plan_code
            ? `Empresa ativa com assinatura ${String(subscription.plan_code).toUpperCase()} em ${subscription.status || 'status indefinido'}.`
            : 'Empresa ativa encontrada no ambiente.',
          {
            company_name: company?.nome || '',
            plan_code: subscription?.plan_code || null,
            subscription_status: subscription?.status || null,
          }
        )
      : buildEvidence(false),
    import_tested: financialCount > 0 || Number(usage?.imports_month || 0) > 0 || Boolean(importEvent)
      ? buildEvidence(
          true,
          financialCount > 0
            ? `${financialCount} registro(s) financeiros encontrados na carteira.`
            : Number(usage?.imports_month || 0) > 0
              ? `${Number(usage?.imports_month || 0)} importacao(oes) registrada(s) no ciclo atual.`
              : importEvent?.title || 'Evento de importacao encontrado na auditoria.',
          {
            financial_count: financialCount,
            imports_month: Number(usage?.imports_month || 0),
            audit_action: importEvent?.action || null,
          }
        )
      : buildEvidence(false),
    manual_charge_tested: Number(usage?.charges_month || 0) > 0 || Boolean(chargeEvent)
      ? buildEvidence(
          true,
          Number(usage?.charges_month || 0) > 0
            ? `${Number(usage?.charges_month || 0)} cobranca(s) registrada(s) no ciclo atual.`
            : chargeEvent?.title || 'Evidencia de cobranca manual encontrada.',
          {
            charges_month: Number(usage?.charges_month || 0),
            audit_action: chargeEvent?.action || null,
          }
        )
      : buildEvidence(false),
    automation_tested: Number(usage?.automations_month || 0) > 0 || Boolean(automationEvent)
      ? buildEvidence(
          true,
          Number(usage?.automations_month || 0) > 0
            ? `${Number(usage?.automations_month || 0)} automacao(oes) registrada(s) no ciclo atual.`
            : automationEvent?.title || 'Simulacao/automacao identificada na auditoria.',
          {
            automations_month: Number(usage?.automations_month || 0),
            audit_action: automationEvent?.action || null,
          }
        )
      : buildEvidence(false),
    usage_counters_working: hasUsageEvidence
      ? buildEvidence(
          true,
          `Contadores carregados para o ciclo ${usage?.period_start || '-'} a ${usage?.period_end || '-'}.`,
          {
            imports_month: Number(usage?.imports_month || 0),
            charges_month: Number(usage?.charges_month || 0),
            automations_month: Number(usage?.automations_month || 0),
            users_count: Number(usage?.users_count || 0),
          }
        )
      : buildEvidence(false),
    notifications_working: hasNotifications
      ? buildEvidence(
          true,
          `${notifications.length} notificacao(oes) encontrada(s) para a empresa.`,
          {
            notifications_count: notifications.length,
            last_notification_title: notifications[0]?.title || null,
          }
        )
      : buildEvidence(false),
    audit_working: hasAudit
      ? buildEvidence(
          true,
          `${auditEvents.length} evento(s) de auditoria recente(s) encontrado(s).`,
          {
            audit_count: auditEvents.length,
            last_action: auditEvents[0]?.action || null,
          }
        )
      : buildEvidence(false),
    plans_billing_working: subscription?.plan_code
      ? buildEvidence(
          true,
          `Assinatura ${String(subscription.plan_code).toUpperCase()} com status ${subscription.status || 'ativo'} encontrada.`,
          {
            plan_code: subscription.plan_code,
            subscription_status: subscription.status || null,
            current_period_end: subscription.current_period_end || null,
          }
        )
      : buildEvidence(false),
    collection_ai_working: aiEvent
      ? buildEvidence(
          true,
          aiEvent.title || 'Mensagem inteligente de cobranca registrada na auditoria.',
          {
            audit_action: aiEvent.action,
            created_at: aiEvent.created_at || null,
          }
        )
      : buildEvidence(false),
  };
};

const buildChecklistResponse = (companyId, rows = [], evidenceMap = {}) => {
  const rowMap = new Map((rows || []).map((row) => [row.item_key, row]));
  const items = PRODUCTION_CHECKLIST_ITEMS.map((definition) =>
    ({
      ...normalizeItem(companyId, definition, rowMap.get(definition.key)),
      evidence: evidenceMap[definition.key] || buildEvidence(false),
    })
  );
  const completed = items.filter((item) => item.status === 'concluido').length;
  const inProgress = items.filter((item) => item.status === 'em_andamento').length;
  const pending = items.filter((item) => item.status === 'pendente').length;
  const total = items.length;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const evidenceFound = items.filter((item) => item.evidence?.found).length;

  return {
    companyId,
    items,
    summary: {
      total,
      completed,
      inProgress,
      pending,
      progress,
      evidenceFound,
    },
  };
};

const getMockChecklistRows = (companyId) => {
  if (!companyId) return [];
  const store = readMockStore();
  const companyRows = store[companyId];
  return Array.isArray(companyRows) ? companyRows : [];
};

const setMockChecklistRows = (companyId, rows) => {
  if (!companyId) return;
  const store = readMockStore();
  store[companyId] = rows;
  writeMockStore(store);
};

export async function getProductionChecklist(companyId) {
  if (!companyId) {
    return buildChecklistResponse('', []);
  }

  let evidenceMap = {};

  if (!hasSupabaseConfig || !supabase) {
    try {
      const usage = await getCurrentUsage(companyId);
      const notifications = await getNotifications(companyId, { includeRead: true, limit: 20 });
      evidenceMap = buildEvidenceMap({
        company: companyId ? { id: companyId } : null,
        subscription: null,
        financialCount: Number(usage?.record_count || 0),
        notifications,
        usage,
        auditEvents: [],
      });
    } catch {
      evidenceMap = {};
    }

    return buildChecklistResponse(companyId, getMockChecklistRows(companyId), evidenceMap);
  }

  try {
    const [
      { data, error },
      { data: company, error: companyError },
      { data: subscription, error: subscriptionError },
      { count: financialCount, error: financialError },
      { data: auditEvents, error: auditError },
    ] = await Promise.all([
      supabase
        .from('production_checklist_items')
        .select('*')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false }),
      supabase.from('empresas').select('id, nome, created_at').eq('id', companyId).maybeSingle(),
      supabase
        .from('company_subscriptions')
        .select('company_id, plan_code, status, trial_ends_at, current_period_end, current_period_start')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('registros_financeiros').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase
        .from('audit_logs')
        .select('id, action, title, description, created_at, metadata')
        .eq('company_id', companyId)
        .in('action', [
          'import_created',
          'import_confirmed',
          'charge_prepared',
          'whatsapp_sent',
          'whatsapp_simulated',
          'whatsapp_failed',
          'automation_executed',
          'automation_simulated',
          'collection_ai_generated',
          'plan_changed',
          'notification_created',
          'limit_reached',
        ])
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (error) throw error;
    if (companyError) throw companyError;
    if (subscriptionError) throw subscriptionError;
    if (financialError) throw financialError;
    if (auditError) throw auditError;

    const [usage, notifications] = await Promise.all([
      getCurrentUsage(companyId).catch(() => null),
      getNotifications(companyId, { includeRead: true, limit: 20 }).catch(() => []),
    ]);

    evidenceMap = buildEvidenceMap({
      company,
      subscription,
      financialCount: Number(financialCount || 0),
      notifications,
      usage,
      auditEvents: Array.isArray(auditEvents) ? auditEvents : [],
    });

    return buildChecklistResponse(companyId, Array.isArray(data) ? data : [], evidenceMap);
  } catch (error) {
    if (isSupabaseChecklistAvailable(error)) {
      throw new Error(error.message || 'Falha ao carregar checklist de producao.');
    }

    try {
      const usage = await getCurrentUsage(companyId);
      const notifications = await getNotifications(companyId, { includeRead: true, limit: 20 });
      evidenceMap = buildEvidenceMap({
        company: companyId ? { id: companyId } : null,
        subscription: null,
        financialCount: Number(usage?.record_count || 0),
        notifications,
        usage,
        auditEvents: [],
      });
    } catch {
      evidenceMap = {};
    }

    return buildChecklistResponse(companyId, getMockChecklistRows(companyId), evidenceMap);
  }
}

export async function updateProductionChecklistItem(companyId, itemKey, updates = {}) {
  if (!companyId || !itemKey) {
    throw new Error('Selecione uma empresa e um item valido do checklist.');
  }

  const normalizedUpdate = {
    status: normalizeStatus(updates.status),
    owner_name: updates.owner_name != null ? String(updates.owner_name).trim() : undefined,
    notes: updates.notes != null ? String(updates.notes).trim() : undefined,
    completed_at:
      updates.completed_at !== undefined
        ? updates.completed_at
        : normalizeStatus(updates.status) === 'concluido'
          ? new Date().toISOString()
          : null,
  };

  const payload = {
    company_id: companyId,
    item_key: itemKey,
    status: normalizedUpdate.status,
    owner_name: normalizedUpdate.owner_name ?? null,
    notes: normalizedUpdate.notes ?? null,
    completed_at: normalizedUpdate.completed_at,
  };

  if (!hasSupabaseConfig || !supabase) {
    const current = getMockChecklistRows(companyId);
    const nextRows = [...current];
    const idx = nextRows.findIndex((row) => row.item_key === itemKey);
    const now = new Date().toISOString();

    if (idx >= 0) {
      nextRows[idx] = {
        ...nextRows[idx],
        ...payload,
        id: nextRows[idx].id || makeUuid(),
        created_at: nextRows[idx].created_at || now,
        updated_at: now,
      };
    } else {
      nextRows.push({
        id: makeUuid(),
        ...payload,
        created_at: now,
        updated_at: now,
      });
    }

    setMockChecklistRows(companyId, nextRows);
    return buildChecklistResponse(companyId, nextRows);
  }

  try {
    const { error } = await supabase
      .from('production_checklist_items')
      .upsert(payload, { onConflict: 'company_id,item_key' });

    if (error) {
      throw error;
    }

    return getProductionChecklist(companyId);
  } catch (error) {
    if (isSupabaseChecklistAvailable(error)) {
      throw new Error(error.message || 'Falha ao atualizar checklist de producao.');
    }

    const current = getMockChecklistRows(companyId);
    const nextRows = [...current];
    const idx = nextRows.findIndex((row) => row.item_key === itemKey);
    const now = new Date().toISOString();

    if (idx >= 0) {
      nextRows[idx] = {
        ...nextRows[idx],
        ...payload,
        id: nextRows[idx].id || makeUuid(),
        created_at: nextRows[idx].created_at || now,
        updated_at: now,
      };
    } else {
      nextRows.push({
        id: makeUuid(),
        ...payload,
        created_at: now,
        updated_at: now,
      });
    }

    setMockChecklistRows(companyId, nextRows);
    return buildChecklistResponse(companyId, nextRows);
  }
}

export async function markProductionChecklistCompleted(companyId, itemKey, ownerName = '') {
  return updateProductionChecklistItem(companyId, itemKey, {
    status: 'concluido',
    owner_name: ownerName,
    completed_at: new Date().toISOString(),
  });
}

export default {
  PRODUCTION_CHECKLIST_ITEMS,
  getProductionChecklist,
  updateProductionChecklistItem,
  markProductionChecklistCompleted,
};
