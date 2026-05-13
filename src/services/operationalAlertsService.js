const STORAGE_KEY = 'bankextract.admin-ops.alerts';

const SEVERITY_RANK = {
  critical: 4,
  warning: 3,
  info: 2,
  resolved: 1,
};

function readStore() {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // noop
  }
}

function createAlert(partial) {
  return {
    id: partial.id,
    title: partial.title,
    detail: partial.detail,
    severity: partial.severity || 'info',
    source: partial.source || 'system',
    companyId: partial.companyId || '',
    cooldownMs: Number(partial.cooldownMs || 15 * 60 * 1000),
    createdAt: partial.createdAt || new Date().toISOString(),
  };
}

function deriveCurrentAlerts(metrics, health) {
  const alerts = [];
  const now = new Date().toISOString();

  if (health?.overall === 'critical') {
    alerts.push(createAlert({
      id: 'health:critical',
      title: 'Sistema em estado critico',
      detail: 'Um ou mais health checks criticos foram detectados.',
      severity: 'critical',
      source: 'health',
      createdAt: now,
    }));
  } else if (health?.overall === 'degraded') {
    alerts.push(createAlert({
      id: 'health:degraded',
      title: 'Sistema degradado',
      detail: 'Existem checks degradados exigindo acompanhamento.',
      severity: 'warning',
      source: 'health',
      createdAt: now,
    }));
  }

  for (const check of health?.checks || []) {
    if (check.status === 'critical' || check.status === 'offline') {
      alerts.push(createAlert({
        id: `check:${check.label}`,
        title: `${check.label} com falha`,
        detail: check.detail,
        severity: 'critical',
        source: 'health',
        createdAt: now,
      }));
    } else if (check.status === 'degraded') {
      alerts.push(createAlert({
        id: `check:${check.label}`,
        title: `${check.label} degradado`,
        detail: check.detail,
        severity: 'warning',
        source: 'health',
        createdAt: now,
      }));
    }
  }

  const whatsapp = metrics?.whatsapp;
  if (whatsapp?.falha > 0 && whatsapp?.taxaSucesso < 70) {
    alerts.push(createAlert({
      id: 'whatsapp:high-failure-rate',
      title: 'Alta taxa de falhas no WhatsApp',
      detail: `${whatsapp.falha} falha(s) e taxa de sucesso de ${whatsapp.taxaSucesso}%.`,
      severity: 'critical',
      source: 'whatsapp',
      createdAt: now,
    }));
  }
  if (whatsapp?.timeouts > 0) {
    alerts.push(createAlert({
      id: 'whatsapp:timeouts',
      title: 'Timeouts no envio WhatsApp',
      detail: `${whatsapp.timeouts} timeout(s) detectado(s) no periodo analisado.`,
      severity: whatsapp.timeouts >= 5 ? 'critical' : 'warning',
      source: 'whatsapp',
      createdAt: now,
    }));
  }
  if (whatsapp?.rateLimited > 0) {
    alerts.push(createAlert({
      id: 'whatsapp:rate-limit',
      title: 'Rate limit no provedor WhatsApp',
      detail: `${whatsapp.rateLimited} ocorrencia(s) com indicio de rate limit.`,
      severity: 'warning',
      source: 'whatsapp',
      createdAt: now,
    }));
  }

  const dispatches = metrics?.dispatches;
  if (dispatches?.failed > 0) {
    alerts.push(createAlert({
      id: 'dispatch:failed',
      title: 'Falhas em automacao',
      detail: `${dispatches.failed} dispatch(es) com falha.`,
      severity: dispatches.failed >= 10 ? 'critical' : 'warning',
      source: 'dispatch',
      createdAt: now,
    }));
  }
  if (dispatches?.retriesExecuted > 0) {
    alerts.push(createAlert({
      id: 'dispatch:retries',
      title: 'Retries executados',
      detail: `${dispatches.retriesExecuted} retry(s) executado(s) no periodo.`,
      severity: dispatches.retriesExecuted >= 20 ? 'critical' : 'warning',
      source: 'dispatch',
      createdAt: now,
    }));
  }
  if (dispatches?.stuckProcessing > 0) {
    alerts.push(createAlert({
      id: 'dispatch:stuck',
      title: 'Fila travada ou pendente',
      detail: `${dispatches.stuckProcessing} dispatch(es) preso(s) em processing.`,
      severity: 'critical',
      source: 'dispatch',
      createdAt: now,
    }));
  }

  const audit = metrics?.audit;
  if (audit?.errors >= 10) {
    alerts.push(createAlert({
      id: 'audit:error-spike',
      title: 'Spike de erros operacionais',
      detail: `${audit.errors} eventos de erro/criticidade na auditoria recente.`,
      severity: 'critical',
      source: 'audit',
      createdAt: now,
    }));
  }
  if (audit?.duplicateBlocked > 0) {
    alerts.push(createAlert({
      id: 'audit:duplicate-blocked',
      title: 'Duplicidades bloqueadas',
      detail: `${audit.duplicateBlocked} evento(s) de deduplicacao bloqueados.`,
      severity: 'info',
      source: 'audit',
      createdAt: now,
    }));
  }

  const integrations = metrics?.integrations;
  if (integrations?.googleSheetsErrors > 0) {
    alerts.push(createAlert({
      id: 'integration:google-errors',
      title: 'Google Drive/Sheets com erro',
      detail: `${integrations.googleSheetsErrors} integracao(oes) com erro de sync.`,
      severity: integrations.googleSheetsErrors >= 5 ? 'critical' : 'warning',
      source: 'integrations',
      createdAt: now,
    }));
  }
  if (integrations?.stripeFailing > 0) {
    alerts.push(createAlert({
      id: 'integration:stripe-failing',
      title: 'Stripe com empresas em falha',
      detail: `${integrations.stripeFailing} assinatura(s) em past_due/canceled/bloqueada.`,
      severity: 'warning',
      source: 'integrations',
      createdAt: now,
    }));
  }

  for (const company of metrics?.whatsapp?.byCompany || []) {
    if (company.total >= 5 && company.taxaSucesso < 60) {
      alerts.push(createAlert({
        id: `tenant:${company.empresa_id}:continuous-failure`,
        title: 'Tenant com falhas continuas',
        detail: `${company.empresa_id} com taxa de sucesso de ${company.taxaSucesso}% em ${company.total} envio(s).`,
        severity: 'warning',
        source: 'tenant',
        companyId: company.empresa_id,
        createdAt: now,
      }));
    }
  }

  return alerts;
}

function mergeAlerts(currentAlerts) {
  const store = readStore();
  const now = new Date().toISOString();
  const nextStore = { ...store };
  const seen = new Set();

  const activeAlerts = currentAlerts.map((alert) => {
    const previous = store[alert.id] || {};
    const merged = {
      ...alert,
      acknowledgedAt: previous.acknowledgedAt || null,
      firstSeenAt: previous.firstSeenAt || alert.createdAt || now,
      lastSeenAt: now,
      resolvedAt: null,
      state: previous.acknowledgedAt ? 'acknowledged' : 'active',
    };

    nextStore[alert.id] = merged;
    seen.add(alert.id);
    return merged;
  });

  const resolvedAlerts = Object.values(store)
    .filter((alert) => !seen.has(alert.id))
    .map((alert) => {
      const resolved = {
        ...alert,
        resolvedAt: alert.resolvedAt || now,
        state: 'resolved',
      };
      nextStore[alert.id] = resolved;
      return resolved;
    });

  writeStore(nextStore);

  return [...activeAlerts, ...resolvedAlerts].sort((a, b) => {
    const severityDiff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.lastSeenAt || b.createdAt || 0).getTime() - new Date(a.lastSeenAt || a.createdAt || 0).getTime();
  });
}

export function getOperationalAlerts(metrics, health) {
  return mergeAlerts(deriveCurrentAlerts(metrics, health));
}

export function acknowledgeOperationalAlert(alertId) {
  if (!alertId) return;
  const store = readStore();
  const current = store[alertId];
  if (!current) return;
  store[alertId] = {
    ...current,
    acknowledgedAt: new Date().toISOString(),
    state: 'acknowledged',
  };
  writeStore(store);
}

export function clearOperationalAlertAcknowledgement(alertId) {
  if (!alertId) return;
  const store = readStore();
  const current = store[alertId];
  if (!current) return;
  store[alertId] = {
    ...current,
    acknowledgedAt: null,
    state: current.resolvedAt ? 'resolved' : 'active',
  };
  writeStore(store);
}

export default {
  getOperationalAlerts,
  acknowledgeOperationalAlert,
  clearOperationalAlertAcknowledgement,
};
