import { supabase, hasSupabaseConfig } from './supabaseClient';

const isProduction = import.meta.env.PROD;

const getBrowserMetadata = () => ({
  ipAddress: null,
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
});

export async function logAuditEvent({
  companyId,
  userId = null,
  action,
  entity,
  entityId = null,
  metadata = null,
  ipAddress = null,
  userAgent = null,
}) {
  if (!action || !entity) return false;

  if (!hasSupabaseConfig || !supabase) {
    if (isProduction) {
      // eslint-disable-next-line no-console
      console.error('[AuditLog] Supabase nao configurado para producao.');
    }
    return false;
  }

  const browserMeta = getBrowserMetadata();

  try {
    const { error } = await supabase.from('audit_logs').insert({
      company_id: companyId || null,
      user_id: userId || null,
      action,
      entity,
      entity_id: entityId ? String(entityId) : null,
      metadata: metadata || {},
      ip_address: ipAddress || browserMeta.ipAddress,
      user_agent: userAgent || browserMeta.userAgent,
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[AuditLog] Falha ao registrar log:', error.message);
      return false;
    }

    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[AuditLog] Erro inesperado:', error?.message);
    return false;
  }
}

export async function logAudit(params) {
  return logAuditEvent(params);
}

export const auditLog = {
  importConfirmed(companyId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'import_confirmed',
      entity: 'importacoes',
      metadata,
    });
  },

  recordsDeleted(companyId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'records_deleted',
      entity: 'registros_financeiros',
      metadata,
    });
  },

  historyDeleted(companyId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'history_deleted',
      entity: 'importacoes',
      metadata,
    });
  },

  viewCleared(companyId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'view_cleared',
      entity: 'registros_financeiros',
      metadata,
    });
  },

  exportData(companyId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'export_data',
      entity: 'registros_financeiros',
      metadata,
    });
  },

  exportCsv(companyId, metadata = {}, userId = null) {
    return this.exportData(companyId, metadata, userId);
  },

  financialRecordEdited(companyId, entityId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'record_edited',
      entity: 'registros_financeiros',
      entityId,
      metadata,
    });
  },

  recordEdited(companyId, metadata = {}, userId = null) {
    return this.financialRecordEdited(companyId, metadata.id || metadata.entityId || null, metadata, userId);
  },

  representativeChanged(companyId, entityId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'representative_changed',
      entity: 'representantes',
      entityId,
      metadata,
    });
  },

  financialConfigChanged(companyId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'financial_config_changed',
      entity: 'configuracoes_financeiras',
      metadata,
    });
  },

  whatsappSent(companyId, entityId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'whatsapp_sent',
      entity: 'cobrancas_whatsapp',
      entityId,
      metadata,
    });
  },

  whatsappChargesSent(companyId, metadata = {}, userId = null) {
    return this.whatsappSent(companyId, metadata.chargeId || null, metadata, userId);
  },
};
