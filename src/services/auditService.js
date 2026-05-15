import { supabase, hasSupabaseConfig } from './supabaseClient';
import { createScopedLogger } from './loggerService';

const isProduction = import.meta.env.PROD;
const logger = createScopedLogger('audit-service');

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
  title = '',
  description = '',
  severity = 'info',
  metadata = null,
  ipAddress = null,
  userAgent = null,
}) {
  if (!action || !entity) return false;

  if (!hasSupabaseConfig || !supabase) {
    if (isProduction) {
      logger.error('supabase_not_configured', new Error('Supabase nao configurado para producao.'));
    }
    return false;
  }

  const browserMeta = getBrowserMetadata();

  try {
    const baseMetadata = metadata && typeof metadata === 'object' ? metadata : {};
    const payload = {
      company_id: companyId || null,
      user_id: userId || null,
      action,
      entity,
      entity_id: entityId ? String(entityId) : null,
      title: title || baseMetadata.title || null,
      description: description || baseMetadata.description || null,
      severity: severity || baseMetadata.severity || 'info',
      metadata: {
        ...baseMetadata,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(severity ? { severity } : {}),
      },
      ip_address: ipAddress || browserMeta.ipAddress,
      user_agent: userAgent || browserMeta.userAgent,
    };

    const { error } = await supabase.from('audit_logs').insert({
      ...payload,
    });

    if (error) {
      logger.warn('insert_failed', { message: error.message });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('unexpected_error', { message: error?.message || 'Erro inesperado ao registrar auditoria.' });
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
      title: 'Importacao confirmada',
      description: metadata?.arquivo
        ? `${metadata.registros || 0} registro(s) confirmados em ${metadata.arquivo}`
        : 'Lote de importacao confirmado',
      severity: 'success',
      metadata,
    });
  },

  recordsDeleted(companyId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'records_deleted',
      entity: 'registros_financeiros',
      title: 'Registros excluidos',
      description: `${metadata?.count || 0} registro(s) excluido(s) da carteira`,
      severity: 'warning',
      metadata,
    });
  },

  historyDeleted(companyId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'history_deleted',
      entity: 'importacoes',
      title: 'Lote removido',
      description: metadata?.batch_id
        ? `Lote ${String(metadata.batch_id).slice(0, 8)} removido do historico`
        : 'Lote removido do historico',
      severity: 'warning',
      metadata,
    });
  },

  viewCleared(companyId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'view_cleared',
      entity: 'registros_financeiros',
      title: 'Visao geral limpa',
      description: `${metadata?.count || 0} registro(s) removido(s) da visao geral`,
      severity: 'warning',
      metadata,
    });
  },

  exportData(companyId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'export_data',
      entity: 'registros_financeiros',
      title: 'Dados exportados',
      description: `Exportacao ${metadata?.format || 'arquivo'} com ${metadata?.count || 0} registro(s)`,
      severity: 'info',
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
      title: 'Registro editado',
      description: metadata?.field
        ? `Campo ${metadata.field} atualizado no registro`
        : 'Registro financeiro atualizado',
      severity: 'info',
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
      title: 'Representante alterado',
      description: metadata?.nome
        ? `Representante ${metadata.nome} atualizado`
        : metadata?.mode === 'delete'
          ? 'Representante removido'
          : 'Representante atualizado',
      severity: metadata?.mode === 'delete' ? 'warning' : 'info',
      metadata,
    });
  },

  financialConfigChanged(companyId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'financial_config_changed',
      entity: 'configuracoes_financeiras',
      title: 'Configuracao financeira alterada',
      description: 'Parametros financeiros da empresa foram atualizados',
      severity: 'info',
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
      title: metadata?.mocked ? 'Cobranca simulada' : 'Cobranca enviada',
      description: metadata?.status
        ? `Status do envio: ${metadata.status}`
        : metadata?.mocked
          ? 'Cobranca registrada em modo simulacao'
          : 'Cobranca enviada com sucesso',
      severity: metadata?.mocked ? 'info' : 'success',
      metadata,
    });
  },

  whatsappFailed(companyId, entityId, metadata = {}, userId = null) {
    return logAuditEvent({
      companyId,
      userId,
      action: 'whatsapp_failed',
      entity: 'cobrancas_whatsapp',
      entityId,
      title: 'Falha no envio da cobranca',
      description: metadata?.error || metadata?.erro || 'Falha no envio via WhatsApp.',
      severity: 'danger',
      metadata,
    });
  },

  whatsappChargesSent(companyId, metadata = {}, userId = null) {
    return this.whatsappSent(companyId, metadata.chargeId || null, metadata, userId);
  },
};
