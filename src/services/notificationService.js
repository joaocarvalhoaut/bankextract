import { getPlanMeta, normalizePlanId } from '../constants/plans';
import { createAuditEvent } from './auditTimelineService';
import { createScopedLogger } from './loggerService';
import { hasSupabaseConfig, supabase } from './supabaseClient';

const logger = createScopedLogger('notifications');

const STORAGE_KEY = 'bankextract.notifications.mock';
const NOTIFICATION_EVENT = 'bankextract:notifications-changed';

const DAY_IN_MS = 86400000;

const severityTone = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

const emitNotificationsChanged = (detail = {}) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail }));
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

const readMockStore = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeMockStore = (notifications) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
};

const normalizeNotification = (item = {}) => ({
  id: item.id || makeUuid(),
  company_id: item.company_id || '',
  user_id: item.user_id || null,
  type: String(item.type || 'info'),
  title: String(item.title || 'Notificacao'),
  message: String(item.message || ''),
  status: item.status === 'read' ? 'read' : 'unread',
  severity: severityTone[item.severity] || 'info',
  metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
  read_at: item.read_at || null,
  created_at: item.created_at || new Date().toISOString(),
});

const sortNotifications = (items = []) =>
  [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

const matchesFilter = (item, options = {}) => {
  if (!options.includeRead && item.status === 'read') return false;
  if (options.status && item.status !== options.status) return false;
  if (options.onlyImportant && !['warning', 'danger'].includes(item.severity)) return false;
  return true;
};

const findByDedupeKey = (items, companyId, dedupeKey) =>
  items.find((item) => item.company_id === companyId && item.metadata?.dedupe_key === dedupeKey);

const buildPayload = (companyId, payload = {}) =>
  normalizeNotification({
    company_id: companyId,
    type: payload.type || 'info',
    title: payload.title || 'Notificacao',
    message: payload.message || '',
    severity: payload.severity || 'info',
    user_id: payload.user_id || null,
    metadata: payload.metadata || {},
  });

export function subscribeNotifications(callback) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => callback?.(event.detail || {});
  window.addEventListener(NOTIFICATION_EVENT, handler);
  return () => window.removeEventListener(NOTIFICATION_EVENT, handler);
}

export async function getNotifications(companyId, options = {}) {
  if (!companyId) return [];
  logger.debug('list_requested', { company_id: companyId, options });

  if (!hasSupabaseConfig || !supabase) {
    const items = sortNotifications(readMockStore())
      .filter((item) => item.company_id === companyId)
      .filter((item) => matchesFilter(item, options));
    return typeof options.limit === 'number' ? items.slice(0, options.limit) : items;
  }

  let query = supabase.from('notifications').select('*').eq('company_id', companyId).order('created_at', { ascending: false });

  if (!options.includeRead) {
    query = query.eq('status', 'unread');
  } else if (options.status) {
    query = query.eq('status', options.status);
  }

  if (typeof options.limit === 'number') {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao carregar notificacoes.');

  return (Array.isArray(data) ? data : [])
    .map(normalizeNotification)
    .filter((item) => matchesFilter(item, options));
}

export async function getUnreadCount(companyId) {
  if (!companyId) return 0;

  if (!hasSupabaseConfig || !supabase) {
    return readMockStore().filter((item) => item.company_id === companyId && item.status !== 'read').length;
  }

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'unread');

  if (error) throw new Error(error.message || 'Falha ao contar notificacoes nao lidas.');
  return Number(count || 0);
}

export async function createNotification(companyId, payload = {}) {
  if (!companyId) return null;
  logger.info('create_requested', {
    company_id: companyId,
    type: payload.type || 'info',
    severity: payload.severity || 'info',
  });

  const nextItem = buildPayload(companyId, payload);
  const dedupeKey = nextItem.metadata?.dedupe_key;

  if (!hasSupabaseConfig || !supabase) {
    const items = readMockStore();
    if (dedupeKey && findByDedupeKey(items, companyId, dedupeKey)) {
      return findByDedupeKey(items, companyId, dedupeKey);
    }
    const nextItems = sortNotifications([nextItem, ...items]);
    writeMockStore(nextItems);
    emitNotificationsChanged({ companyId, notificationId: nextItem.id, action: 'created' });
    try {
      await createAuditEvent(companyId, {
        action: 'notification_created',
        entity_type: 'notifications',
        entity_id: nextItem.id,
        title: 'Notificacao criada',
        description: nextItem.title,
        metadata: {
          notification_title: nextItem.title,
          notification_type: nextItem.type,
          severity: nextItem.severity,
        },
        severity: nextItem.severity === 'danger' ? 'danger' : nextItem.severity === 'warning' ? 'warning' : 'info',
      });
    } catch {
      // Nao impede a notificacao principal.
    }
    return nextItem;
  }

  if (dedupeKey) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('*')
      .eq('company_id', companyId)
      .contains('metadata', { dedupe_key: dedupeKey })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return normalizeNotification(existing);
  }

  const { data, error } = await supabase.from('notifications').insert({
    company_id: companyId,
    user_id: nextItem.user_id,
    type: nextItem.type,
    title: nextItem.title,
    message: nextItem.message,
    status: nextItem.status,
    severity: nextItem.severity,
    metadata: nextItem.metadata,
  }).select('*').single();

  if (error) {
    logger.error('create_failed', error, { company_id: companyId, type: nextItem.type });
    throw new Error(error.message || 'Falha ao criar notificacao.');
  }

  const created = normalizeNotification(data);
  logger.info('create_succeeded', { company_id: companyId, notification_id: created.id, type: created.type });
  emitNotificationsChanged({ companyId, notificationId: created.id, action: 'created' });
  try {
    await createAuditEvent(companyId, {
      action: 'notification_created',
      entity_type: 'notifications',
      entity_id: created.id,
      title: 'Notificacao criada',
      description: created.title,
      metadata: {
        notification_title: created.title,
        notification_type: created.type,
        severity: created.severity,
      },
      severity: created.severity === 'danger' ? 'danger' : created.severity === 'warning' ? 'warning' : 'info',
    });
  } catch {
    // Nao impede a notificacao principal.
  }
  return created;
}

export async function markAsRead(notificationId) {
  if (!notificationId) return null;
  logger.debug('mark_read_requested', { notification_id: notificationId });

  if (!hasSupabaseConfig || !supabase) {
    const items = readMockStore();
    const nextItems = items.map((item) =>
      item.id === notificationId
        ? { ...item, status: 'read', read_at: item.read_at || new Date().toISOString() }
        : item
    );
    writeMockStore(nextItems);
    const current = nextItems.find((item) => item.id === notificationId) || null;
    emitNotificationsChanged({ companyId: current?.company_id || '', notificationId, action: 'read' });
    if (current?.company_id) {
      try {
        await createAuditEvent(current.company_id, {
          action: 'notification_read',
          entity_type: 'notifications',
          entity_id: notificationId,
          title: 'Notificacao lida',
          description: current.title,
          metadata: { notification_title: current.title },
          severity: 'info',
        });
      } catch {
        // Nao impede o fluxo principal.
      }
    }
    return current;
  }

  const { data, error } = await supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .select('*')
    .single();

  if (error) {
    logger.error('mark_read_failed', error, { notification_id: notificationId });
    throw new Error(error.message || 'Falha ao marcar notificacao como lida.');
  }

  const updated = normalizeNotification(data);
  emitNotificationsChanged({ companyId: updated.company_id, notificationId, action: 'read' });
  try {
    await createAuditEvent(updated.company_id, {
      action: 'notification_read',
      entity_type: 'notifications',
      entity_id: notificationId,
      title: 'Notificacao lida',
      description: updated.title,
      metadata: { notification_title: updated.title },
      severity: 'info',
    });
  } catch {
    // Nao impede o fluxo principal.
  }
  return updated;
}

export async function markAllAsRead(companyId) {
  if (!companyId) return 0;
  logger.debug('mark_all_read_requested', { company_id: companyId });

  if (!hasSupabaseConfig || !supabase) {
    const now = new Date().toISOString();
    const items = readMockStore();
    let changed = 0;
    const nextItems = items.map((item) => {
      if (item.company_id !== companyId || item.status === 'read') return item;
      changed += 1;
      return { ...item, status: 'read', read_at: now };
    });
    writeMockStore(nextItems);
    emitNotificationsChanged({ companyId, action: 'read-all' });
    return changed;
  }

  const { data, error } = await supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('status', 'unread')
    .select('id');

  if (error) {
    logger.error('mark_all_read_failed', error, { company_id: companyId });
    throw new Error(error.message || 'Falha ao marcar notificacoes como lidas.');
  }

  emitNotificationsChanged({ companyId, action: 'read-all' });
  return Array.isArray(data) ? data.length : 0;
}

export async function syncUsageAlertNotification(companyId, metricSummary, periodStart, periodEnd) {
  if (!companyId || !metricSummary?.alert || !metricSummary?.limit) return null;

  const percent = Number(metricSummary.percent || 0);
  const threshold = percent >= 100 ? 100 : percent >= 95 ? 95 : percent >= 80 ? 80 : 0;
  if (!threshold) return null;

  const created = await createNotification(companyId, {
    type: `plan_limit_${threshold}`,
    title:
      threshold === 100
        ? 'Limite mensal atingido'
        : threshold === 95
          ? 'Plano proximo do limite mensal'
          : 'Uso alto do plano',
    message:
      threshold === 100
        ? `O limite mensal de ${metricSummary.label.toLowerCase()} foi atingido no ciclo atual.`
        : threshold === 95
          ? `O limite mensal de ${metricSummary.label.toLowerCase()} esta proximo de ser atingido.`
          : `Voce ja utilizou 80% do limite mensal de ${metricSummary.label.toLowerCase()}.`,
    severity: threshold >= 95 ? 'danger' : 'warning',
    metadata: {
      metric_key: metricSummary.key,
      metric_label: metricSummary.label,
      used: metricSummary.used,
      limit: metricSummary.limit,
      percent,
      threshold,
      period_start: periodStart,
      period_end: periodEnd,
      dedupe_key: `usage:${metricSummary.key}:${threshold}:${periodStart}:${periodEnd}`,
    },
  });

  if (threshold >= 100) {
    try {
      await createAuditEvent(companyId, {
        action: 'limit_reached',
        entity_type: 'subscription',
        title: 'Limite mensal atingido',
        description: `Limite de ${metricSummary.label.toLowerCase()} atingido no ciclo atual.`,
        metadata: {
          metric_key: metricSummary.key,
          metric_label: metricSummary.label,
          used: metricSummary.used,
          limit: metricSummary.limit,
          percent,
        },
        severity: 'danger',
      });
    } catch {
      // Nao impede a notificacao principal.
    }
  }

  return created;
}

export async function syncTrialEndingNotification(companyId, subscription) {
  const trialEndsAt = subscription?.trialEndsAt || subscription?.trial_ends_at || null;
  const planCode = normalizePlanId(subscription?.currentPlan?.id || subscription?.plan_code || subscription?.subscription_plan);
  if (!companyId || !trialEndsAt || planCode !== 'starter') return null;

  const daysLeft = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / DAY_IN_MS);
  if (daysLeft > 3) return null;

  const plan = getPlanMeta(planCode);
  const created = await createNotification(companyId, {
    type: 'trial_ending',
    title: 'Trial proximo do fim',
    message: `O trial do plano ${plan.name} termina em ${Math.max(daysLeft, 0)} dia(s).`,
    severity: daysLeft <= 0 ? 'danger' : 'warning',
    metadata: {
      trial_ends_at: trialEndsAt,
      days_left: daysLeft,
      dedupe_key: `trial-ending:${companyId}:${new Date(trialEndsAt).toISOString().slice(0, 10)}`,
    },
  });

  try {
    await createAuditEvent(companyId, {
      action: 'trial_ending',
      entity_type: 'company_subscriptions',
      title: 'Trial proximo do fim',
      description: `O trial do plano ${plan.name} termina em ${Math.max(daysLeft, 0)} dia(s).`,
      metadata: {
        days_left: daysLeft,
        trial_ends_at: trialEndsAt,
      },
      severity: daysLeft <= 0 ? 'danger' : 'warning',
    });
  } catch {
    // Nao impede a notificacao principal.
  }

  return created;
}

export default {
  subscribeNotifications,
  getNotifications,
  getUnreadCount,
  createNotification,
  markAsRead,
  markAllAsRead,
  syncUsageAlertNotification,
  syncTrialEndingNotification,
};
