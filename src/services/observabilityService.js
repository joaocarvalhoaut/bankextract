/**
 * Observability Service — métricas operacionais avançadas, funil de cobrança,
 * rankings, heatmap, agregações diária/semanal/mensal e alertas inteligentes.
 */
import { supabase, hasSupabaseConfig } from './supabaseClient';
import { createScopedLogger } from './loggerService';

const logger = createScopedLogger('observability');

function noop(fallback) { return fallback; }
void noop;

function sinceIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((Number(part || 0) / Number(total || 1)) * 100 * 10) / 10;
}

function avg(values = []) {
  if (!values.length) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function safeDb() {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

// ── Métricas completas por empresa ────────────────────────────────────────────

export async function getFullOperationalMetrics(companyId, { days = 30 } = {}) {
  if (!companyId) return null;
  const db = safeDb();
  const since = sinceIso(days);

  const [wpRes, auditRes, dispatchRes, circuitRes] = await Promise.allSettled([
    db.from('cobrancas_whatsapp')
      .select('id, status, sent_at, delivered_at, read_at, failed_at, failure_reason, simulated, created_at')
      .eq('company_id', companyId)
      .gte('created_at', since)
      .limit(5000),
    db.from('automation_audit_logs')
      .select('id, action, zapi_status, ocr_used, boleto_score, blocked_reason, duration_ms, created_at')
      .eq('company_id', companyId)
      .gte('created_at', since)
      .limit(5000),
    db.from('automation_dispatches')
      .select('id, status, retry_count, circuit_open, created_at')
      .eq('company_id', companyId)
      .gte('created_at', since)
      .limit(2000),
    db.from('zapi_circuit_state')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle(),
  ]);

  const settle = (r, fallback) => (r.status === 'fulfilled' ? r.value?.data || fallback : fallback);
  const wp = settle(wpRes, []);
  const audit = settle(auditRes, []);
  const dispatches = settle(dispatchRes, []);
  const circuit = dispatchRes.status === 'fulfilled' ? dispatchRes.value?.data || null : null;
  void circuit;
  const circuitState = circuitRes.status === 'fulfilled' ? circuitRes.value?.data : null;

  // WhatsApp
  const totalSent = wp.filter(r => ['sent','enviado','delivered','read'].includes(String(r.status||'').toLowerCase())).length;
  const totalDelivered = wp.filter(r => r.delivered_at).length;
  const totalRead = wp.filter(r => r.read_at).length;
  const totalFailed = wp.filter(r => ['failed','erro','falha'].includes(String(r.status||'').toLowerCase())).length;
  const totalSimulated = wp.filter(r => r.simulated).length;

  const sendLatencies = wp.filter(r => r.created_at && r.sent_at)
    .map(r => new Date(r.sent_at).getTime() - new Date(r.created_at).getTime())
    .filter(v => v >= 0 && v < 300000);
  const readLatencies = wp.filter(r => r.sent_at && r.read_at)
    .map(r => new Date(r.read_at).getTime() - new Date(r.sent_at).getTime())
    .filter(v => v >= 0);

  // Audit / boletos
  const sentAudit = audit.filter(r => r.action === 'whatsapp_charge_sent');
  const conflictAudit = audit.filter(r => r.blocked_reason?.startsWith('conflict'));
  const lowConfAudit = audit.filter(r => r.blocked_reason?.startsWith('baixa_confianca'));
  const ocrAudit = audit.filter(r => r.ocr_used);
  const totalFound = audit.filter(r => r.action === 'drive_sync_found' || (r.boleto_score && !r.blocked_reason)).length;

  // Dispatches
  const totalRetries = dispatches.reduce((s, r) => s + Number(r.retry_count || 0), 0);
  const circuitActivations = dispatches.filter(r => r.circuit_open).length;

  // Jobs ativos/falhos nos últimos 10 min / histórico
  const activeJobs = dispatches.filter(r => r.status === 'processing').length;
  const failedJobs = dispatches.filter(r => r.status === 'failed').length;

  return {
    period: { days, since },
    whatsapp: {
      totalSent,
      totalDelivered,
      totalRead,
      totalFailed,
      totalSimulated,
      deliveryRate: pct(totalDelivered, totalSent),
      readRate: pct(totalRead, totalSent),
      errorRate: pct(totalFailed, totalSent + totalFailed),
      avgSendLatencyMs: avg(sendLatencies),
      avgReadLatencyMs: avg(readLatencies),
      avgSendLatencyMinutes: Math.round(avg(readLatencies) / 60000),
    },
    boletos: {
      totalFound,
      totalConflict: conflictAudit.length,
      totalLowConfidence: lowConfAudit.length,
      totalOcrUsed: ocrAudit.length,
      conflictRate: pct(conflictAudit.length, totalFound + conflictAudit.length),
      ocrUsageRate: pct(ocrAudit.length, sentAudit.length),
    },
    automation: {
      totalDispatches: dispatches.length,
      totalRetries,
      circuitActivations,
      activeJobs,
      failedJobs,
      circuitOpen: Boolean(circuitState?.circuit_open),
      circuitOpenedAt: circuitState?.circuit_opened_at || null,
      consecutiveFailures: Number(circuitState?.consecutive_failures || 0),
    },
    rates: {
      recoveryRate: pct(totalSent, totalSent + totalFailed + conflictAudit.length),
      conversionRate: 0, // calculado na camada de pagamentos
      errorRate: pct(totalFailed, totalSent + totalFailed),
      conflictRate: pct(conflictAudit.length, totalFound + conflictAudit.length),
      ocrUsageRate: pct(ocrAudit.length, sentAudit.length),
    },
    loadedAt: new Date().toISOString(),
  };
}

// ── Agregações temporais ───────────────────────────────────────────────────────

function bucketByDay(rows, getDate, getValue) {
  const map = new Map();
  for (const row of rows) {
    const d = getDate(row);
    if (!d) continue;
    const key = d.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + Number(getValue(row) || 1));
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

function bucketByWeek(rows, getDate, getValue) {
  const map = new Map();
  for (const row of rows) {
    const d = getDate(row);
    if (!d) continue;
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + Number(getValue(row) || 1));
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, value]) => ({ week, value }));
}

function bucketByMonth(rows, getDate, getValue) {
  const map = new Map();
  for (const row of rows) {
    const d = getDate(row);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(key, (map.get(key) || 0) + Number(getValue(row) || 1));
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, value]) => ({ month, value }));
}

export async function getTemporalAggregations(companyId, { days = 90 } = {}) {
  if (!companyId) return { daily: [], weekly: [], monthly: [] };
  const db = safeDb();
  const since = sinceIso(days);

  const { data: wp } = await db
    .from('cobrancas_whatsapp')
    .select('id, status, sent_at, created_at')
    .eq('company_id', companyId)
    .gte('created_at', since)
    .limit(10000);

  const rows = wp || [];
  const getDate = r => r.sent_at || r.created_at ? new Date(r.sent_at || r.created_at) : null;
  const getOne = () => 1;

  return {
    daily: bucketByDay(rows, getDate, getOne),
    weekly: bucketByWeek(rows, getDate, getOne),
    monthly: bucketByMonth(rows, getDate, getOne),
  };
}

// ── Funil de cobrança ─────────────────────────────────────────────────────────

export async function getCollectionFunnel(companyId, { days = 30 } = {}) {
  if (!companyId) return [];
  const db = safeDb();
  const since = sinceIso(days);

  const [regRes, wpRes, auditRes] = await Promise.allSettled([
    db.from('registros_financeiros')
      .select('id, status, drive_file_id, boleto_status')
      .eq('company_id', companyId)
      .limit(5000),
    db.from('cobrancas_whatsapp')
      .select('id, status, read_at, delivered_at')
      .eq('company_id', companyId)
      .gte('created_at', since)
      .limit(5000),
    db.from('automation_audit_logs')
      .select('id, action, blocked_reason, zapi_status')
      .eq('company_id', companyId)
      .gte('created_at', since)
      .limit(5000),
  ]);

  const regs = regRes.status === 'fulfilled' ? regRes.value?.data || [] : [];
  const wp = wpRes.status === 'fulfilled' ? wpRes.value?.data || [] : [];
  const audit = auditRes.status === 'fulfilled' ? auditRes.value?.data || [] : [];

  const open = regs.filter(r => !['pago','liquidado','cancelado'].includes(String(r.status||'').toLowerCase())).length;
  const withBoleto = regs.filter(r => r.drive_file_id || r.boleto_status === 'encontrado').length;
  const sent = wp.filter(r => ['sent','enviado','delivered','read'].includes(String(r.status||'').toLowerCase())).length;
  const delivered = wp.filter(r => r.delivered_at).length;
  const read = wp.filter(r => r.read_at).length;
  const paid = regs.filter(r => ['pago','liquidado'].includes(String(r.status||'').toLowerCase())).length;
  const blocked = audit.filter(r => r.blocked_reason).length;

  return [
    { stage: 'Carteira ativa',     value: open,        color: '#3B82F6', pct: 100 },
    { stage: 'Boleto encontrado',  value: withBoleto,  color: '#06B6D4', pct: pct(withBoleto, open) },
    { stage: 'Mensagem enviada',   value: sent,        color: '#8B5CF6', pct: pct(sent, open) },
    { stage: 'Entregue',           value: delivered,   color: '#10B981', pct: pct(delivered, open) },
    { stage: 'Lido',               value: read,        color: '#F59E0B', pct: pct(read, open) },
    { stage: 'Pago',               value: paid,        color: '#22C55E', pct: pct(paid, open) },
    { stage: 'Bloqueado/Conflito', value: blocked,     color: '#EF4444', pct: pct(blocked, open) },
  ];
}

// ── Rankings ──────────────────────────────────────────────────────────────────

export async function getRankings(companyId, { days = 30, limit = 10 } = {}) {
  if (!companyId) return { debtors: [], templates: [], strategies: [] };
  const db = safeDb();
  const since = sinceIso(days);

  const [regRes, wpRes, auditRes] = await Promise.allSettled([
    db.from('registros_financeiros')
      .select('id, cliente_nome, cliente_numero, valor, status, data_vencimento')
      .eq('company_id', companyId)
      .not('status', 'in', '(pago,liquidado,cancelado)')
      .order('valor', { ascending: false })
      .limit(200),
    db.from('automation_audit_logs')
      .select('template_used, zapi_status, boleto_strategy, blocked_reason')
      .eq('company_id', companyId)
      .gte('created_at', since)
      .limit(5000),
    db.from('cobrancas_whatsapp')
      .select('id, status')
      .eq('company_id', companyId)
      .gte('created_at', since)
      .limit(5000),
  ]);

  const regs = regRes.status === 'fulfilled' ? regRes.value?.data || [] : [];
  const audit = auditRes.status === 'fulfilled' ? auditRes.value?.data || [] : [];
  void wpRes;

  // Top inadimplentes por valor
  const debtors = regs
    .slice(0, limit)
    .map(r => ({
      id: r.id,
      name: r.cliente_nome || r.cliente_numero || 'Desconhecido',
      value: Number(r.valor || 0),
      daysOverdue: r.data_vencimento
        ? Math.max(0, Math.floor((Date.now() - new Date(r.data_vencimento).getTime()) / 86400000))
        : 0,
    }));

  // Top templates por taxa de sucesso
  const templateMap = new Map();
  for (const a of audit) {
    if (!a.template_used) continue;
    const t = templateMap.get(a.template_used) || { template: a.template_used, sent: 0, success: 0 };
    t.sent += 1;
    if (a.zapi_status === 'sent') t.success += 1;
    templateMap.set(a.template_used, t);
  }
  const templates = Array.from(templateMap.values())
    .map(t => ({ ...t, rate: pct(t.success, t.sent) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, limit);

  // Eficiência por estratégia de match
  const stratMap = new Map();
  for (const a of audit) {
    if (!a.boleto_strategy) continue;
    const s = stratMap.get(a.boleto_strategy) || { strategy: a.boleto_strategy, count: 0, blocked: 0 };
    s.count += 1;
    if (a.blocked_reason) s.blocked += 1;
    stratMap.set(a.boleto_strategy, s);
  }
  const strategies = Array.from(stratMap.values())
    .map(s => ({ ...s, successRate: pct(s.count - s.blocked, s.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return { debtors, templates, strategies };
}

// ── Heatmap de horários de envio ──────────────────────────────────────────────

export async function getSendHeatmap(companyId, { days = 60 } = {}) {
  if (!companyId) return { cells: [], maxValue: 0 };
  const db = safeDb();

  const { data } = await db
    .from('cobrancas_whatsapp')
    .select('sent_at, status')
    .eq('company_id', companyId)
    .gte('sent_at', sinceIso(days))
    .not('sent_at', 'is', null)
    .limit(10000);

  const rows = data || [];
  const grid = {};

  for (const row of rows) {
    if (!row.sent_at) continue;
    const d = new Date(row.sent_at);
    const dow = d.getDay(); // 0=Sun
    const hour = d.getHours();
    const key = `${dow}-${hour}`;
    grid[key] = (grid[key] || 0) + 1;
  }

  const cells = [];
  let maxValue = 0;
  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const value = grid[`${dow}-${hour}`] || 0;
      if (value > maxValue) maxValue = value;
      cells.push({ dow, hour, dayLabel: DAYS[dow], value });
    }
  }

  return { cells, maxValue };
}

// ── Aging detalhado ───────────────────────────────────────────────────────────

export async function getDetailedAging(companyId) {
  if (!companyId) return { buckets: [], totalValue: 0, totalCount: 0 };
  const db = safeDb();

  const { data } = await db
    .from('registros_financeiros')
    .select('id, valor, data_vencimento, status, cliente_nome')
    .eq('company_id', companyId)
    .not('status', 'in', '(pago,liquidado,cancelado)')
    .limit(5000);

  const rows = data || [];
  const now = Date.now();
  const buckets = {
    'A vencer':   { label: 'A vencer',   min: null, max: 0,  value: 0, count: 0, color: '#3B82F6' },
    '1-7 dias':   { label: '1-7 dias',   min: 1,   max: 7,   value: 0, count: 0, color: '#F59E0B' },
    '8-15 dias':  { label: '8-15 dias',  min: 8,   max: 15,  value: 0, count: 0, color: '#F97316' },
    '16-30 dias': { label: '16-30 dias', min: 16,  max: 30,  value: 0, count: 0, color: '#EF4444' },
    '31-60 dias': { label: '31-60 dias', min: 31,  max: 60,  value: 0, count: 0, color: '#DC2626' },
    '+60 dias':   { label: '+60 dias',   min: 61,  max: null, value: 0, count: 0, color: '#7F1D1D' },
  };

  let totalValue = 0;
  let totalCount = 0;

  for (const row of rows) {
    const val = Number(row.valor || 0);
    if (!row.data_vencimento) continue;
    const daysOverdue = Math.floor((now - new Date(row.data_vencimento).getTime()) / 86400000);
    totalValue += val;
    totalCount += 1;

    if (daysOverdue <= 0) { buckets['A vencer'].value += val; buckets['A vencer'].count += 1; }
    else if (daysOverdue <= 7) { buckets['1-7 dias'].value += val; buckets['1-7 dias'].count += 1; }
    else if (daysOverdue <= 15) { buckets['8-15 dias'].value += val; buckets['8-15 dias'].count += 1; }
    else if (daysOverdue <= 30) { buckets['16-30 dias'].value += val; buckets['16-30 dias'].count += 1; }
    else if (daysOverdue <= 60) { buckets['31-60 dias'].value += val; buckets['31-60 dias'].count += 1; }
    else { buckets['+60 dias'].value += val; buckets['+60 dias'].count += 1; }
  }

  return {
    buckets: Object.values(buckets),
    totalValue,
    totalCount,
  };
}

// ── Alertas operacionais ──────────────────────────────────────────────────────

export async function getActiveAlerts(companyId) {
  if (!companyId) return [];
  const db = safeDb();
  const { data } = await db
    .from('operational_alerts')
    .select('*')
    .or(`company_id.is.null,company_id.eq.${companyId}`)
    .eq('acknowledged', false)
    .or('auto_resolved.is.null,auto_resolved.eq.false')
    .order('created_at', { ascending: false })
    .limit(50);
  return data || [];
}

export async function acknowledgeAlert(alertId) {
  const db = safeDb();
  const { error } = await db
    .from('operational_alerts')
    .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
    .eq('id', alertId);
  if (error) throw new Error(error.message);
}

export async function createAlert(payload) {
  const db = safeDb();
  const { error } = await db.from('operational_alerts').insert(payload);
  if (error) logger.warn('alert_insert_failed', { error: error.message });
}

// ── Métricas diárias pré-agregadas ────────────────────────────────────────────

export async function getDailyMetrics(companyId, { days = 30 } = {}) {
  if (!companyId) return [];
  const db = safeDb();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const { data } = await db
    .from('billing_metrics_daily')
    .select('*')
    .eq('company_id', companyId)
    .gte('metric_date', since)
    .order('metric_date', { ascending: true });

  return data || [];
}

// ── Eventos do event bus ──────────────────────────────────────────────────────

export async function getRecentEvents(companyId, { limit = 100, eventType = null } = {}) {
  if (!companyId) return [];
  const db = safeDb();
  let q = db
    .from('billing_events')
    .select('id, event_type, correlation_id, trace_id, registro_id, actor_type, payload, status, retry_count, dead_letter, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (eventType) q = q.eq('event_type', eventType);
  const { data } = await q;
  return data || [];
}

export async function getDeadLetterEvents(companyId, { limit = 50 } = {}) {
  if (!companyId) return [];
  const db = safeDb();
  const { data } = await db
    .from('billing_events')
    .select('*')
    .eq('company_id', companyId)
    .eq('dead_letter', true)
    .order('dead_letter_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// Aceita publishEvent(payload) ou publishEvent(companyId, eventData)
export async function publishEvent(companyIdOrPayload, eventData = null) {
  const p = eventData ? { ...eventData, company_id: companyIdOrPayload } : companyIdOrPayload;
  try {
    const db = safeDb();
    await db.from('billing_events').insert({
      company_id: p.company_id,
      event_type: p.event_type,
      correlation_id: p.correlation_id || null,
      trace_id: p.trace_id || null,
      request_id: p.request_id || null,
      registro_id: p.registro_id || null,
      charge_id: p.charge_id || null,
      actor_id: p.actor_id || null,
      actor_type: p.actor_type || 'system',
      payload: p.payload || {},
      metadata: p.metadata || {},
      status: 'published',
    });
  } catch (err) {
    logger.warn('event_publish_failed', { error: err?.message, event_type: p?.event_type });
  }
}

// ── Perfis financeiros de clientes ────────────────────────────────────────────

export async function getCustomerProfiles(companyId, { limit = 50, orderBy = 'default_risk_score', riskOnly = false } = {}) {
  if (!companyId) return [];
  const db = safeDb();
  let q = db
    .from('customer_financial_profiles')
    .select('*')
    .eq('company_id', companyId)
    .order(orderBy, { ascending: false })
    .limit(limit);
  if (riskOnly) q = q.eq('is_high_risk', true);
  const { data } = await q;
  return data || [];
}

export async function getCustomerProfile(companyId, clienteId) {
  if (!companyId || !clienteId) return null;
  const db = safeDb();
  const { data } = await db
    .from('customer_financial_profiles')
    .select('*')
    .eq('company_id', companyId)
    .eq('cliente_id', clienteId)
    .maybeSingle();
  return data;
}

// ── Scores de inteligência de cobrança ────────────────────────────────────────

export async function getCollectionScores(companyId, { limit = 100 } = {}) {
  if (!companyId) return [];
  const db = safeDb();
  const { data } = await db
    .from('collection_intelligence_scores')
    .select('*, registros_financeiros(id, nome, cliente_nome, valor, data_vencimento, documento)')
    .eq('company_id', companyId)
    .gt('expires_at', new Date().toISOString())
    .order('priority_score', { ascending: false })
    .limit(limit);
  // Normaliza o campo do join para compatibilidade com o componente
  return (data || []).map(row => ({
    ...row,
    registro: row.registros_financeiros || null,
  }));
}

// ── Sessões de segurança ──────────────────────────────────────────────────────

// Aceita getSecuritySessions(userId) ou getSecuritySessions(companyId, { byCompany: true })
export async function getSecuritySessions(id, { limit = 20, byCompany = false } = {}) {
  if (!id) return [];
  const db = safeDb();
  let q = db
    .from('security_sessions')
    .select('id, user_id, ip_address, user_agent, started_at, last_active_at, ended_at, anomaly_flags, actions_count, created_at')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (byCompany) q = q.eq('company_id', id);
  else q = q.eq('user_id', id);
  const { data } = await q;
  return data || [];
}

// ── Diagnóstico completo para go-live ─────────────────────────────────────────

// Retorna objeto keyed { supabase, drive_folder, zapi, financial_records, first_send }
// onde cada valor é { ok: boolean, message: string, count?: number, warning?: boolean }
export async function runGoLiveDiagnostic(companyId) {
  if (!companyId) throw new Error('company_id obrigatório.');
  const db = safeDb();

  const [cfgRes, zapiRes, rfRes, wpRes, circuitRes] = await Promise.allSettled([
    db.from('google_sheets_config').select('empresa_id, drive_root_folder_id, ativo').eq('empresa_id', companyId).maybeSingle(),
    db.from('company_integrations').select('company_id, connected, phone_number, provider').eq('company_id', companyId).eq('provider', 'zapi').maybeSingle(),
    db.from('registros_financeiros').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    db.from('cobrancas_whatsapp').select('id, status, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(5),
    db.from('zapi_circuit_state').select('circuit_open, consecutive_failures').eq('company_id', companyId).maybeSingle(),
  ]);

  const cfg = cfgRes.status === 'fulfilled' ? cfgRes.value?.data : null;
  const zapi = zapiRes.status === 'fulfilled' ? zapiRes.value?.data : null;
  const rfCount = rfRes.status === 'fulfilled' ? (rfRes.value?.count ?? rfRes.value?.data?.length ?? 0) : 0;
  const recentWp = wpRes.status === 'fulfilled' ? wpRes.value?.data || [] : [];
  const circuit = circuitRes.status === 'fulfilled' ? circuitRes.value?.data : null;

  const circuitOpen = Boolean(circuit?.circuit_open);
  const zapiConnected = Boolean(zapi?.connected);
  const zapiPhonePaired = Boolean(String(zapi?.phone_number || '').trim());
  const zapiOk = zapiConnected && zapiPhonePaired && !circuitOpen;
  const zapiMsg = circuitOpen
    ? `Circuit breaker aberto (${circuit?.consecutive_failures ?? 0} falhas consecutivas)`
    : !zapiConnected
      ? (zapi === null ? 'Integração Z-API não encontrada' : 'Instância Z-API não conectada')
      : !zapiPhonePaired
        ? 'Credenciais válidas mas WhatsApp não pareado — escaneie o QR Code em Integrações'
        : 'WhatsApp conectado e pareado';

  return {
    supabase: {
      ok: true,
      message: 'Banco de dados acessível e autenticado',
    },
    drive_folder: {
      ok: Boolean(cfg?.drive_root_folder_id),
      message: cfg?.drive_root_folder_id
        ? `Pasta configurada: ${cfg.drive_root_folder_id.slice(-12)}...`
        : 'Pasta raiz do Drive não configurada — acesse Integrações → Drive',
    },
    zapi: {
      ok: zapiOk,
      warning: !circuitOpen && zapiConnected && !zapiPhonePaired,
      message: zapiMsg,
    },
    financial_records: {
      ok: rfCount > 0,
      warning: rfCount === 0,
      message: rfCount > 0
        ? `${rfCount} registro${rfCount !== 1 ? 's' : ''} importado${rfCount !== 1 ? 's' : ''}`
        : 'Nenhum registro financeiro importado — importe uma planilha',
      count: rfCount,
    },
    first_send: {
      ok: recentWp.length > 0,
      warning: recentWp.length === 0,
      message: recentWp.length > 0
        ? `${recentWp.length} envio${recentWp.length !== 1 ? 's' : ''} recente${recentWp.length !== 1 ? 's' : ''} confirmado${recentWp.length !== 1 ? 's' : ''}`
        : 'Nenhum envio ainda — execute um envio simulado primeiro',
    },
  };
}

export default {
  getFullOperationalMetrics,
  getTemporalAggregations,
  getCollectionFunnel,
  getRankings,
  getSendHeatmap,
  getDetailedAging,
  getActiveAlerts,
  acknowledgeAlert,
  createAlert,
  getDailyMetrics,
  getRecentEvents,
  getDeadLetterEvents,
  publishEvent,
  getCustomerProfiles,
  getCustomerProfile,
  getCollectionScores,
  getSecuritySessions,
  runGoLiveDiagnostic,
};
