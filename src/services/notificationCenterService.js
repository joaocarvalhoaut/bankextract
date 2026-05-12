const LISTENERS = new Set();
let notifications = [];

const makeId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const emit = () => {
  for (const listener of LISTENERS) {
    listener([...notifications]);
  }
};

export function subscribeNotificationCenter(listener) {
  if (typeof listener !== 'function') return () => {};
  LISTENERS.add(listener);
  listener([...notifications]);
  return () => LISTENERS.delete(listener);
}

export function notifyCenter(payload = {}) {
  const item = {
    id: payload.id || makeId(),
    type: payload.type || 'info',
    title: payload.title || '',
    message: payload.message || '',
    sticky: payload.sticky === true,
    createdAt: new Date().toISOString(),
    metadata: payload.metadata || {},
  };

  notifications = [item, ...notifications].slice(0, 8);
  emit();
  return item;
}

export function dismissCenterNotification(id) {
  notifications = notifications.filter((item) => item.id !== id);
  emit();
}

export function clearNotificationCenter() {
  notifications = [];
  emit();
}

export function getNotificationCenterSnapshot() {
  return [...notifications];
}

export default {
  subscribeNotificationCenter,
  notifyCenter,
  dismissCenterNotification,
  clearNotificationCenter,
  getNotificationCenterSnapshot,
};
