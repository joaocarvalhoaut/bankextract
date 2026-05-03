/**
 * BankExtract Pro — Serviço de Audit Log
 *
 * Registra ações sensíveis na tabela audit_logs do Supabase.
 * Falhas de log são silenciosas — nunca devem quebrar a operação principal.
 *
 * Ações registradas:
 *   import_confirmed   — importação confirmada
 *   records_deleted    — registros financeiros excluídos
 *   history_deleted    — importações excluídas do histórico
 *   view_cleared       — visão geral limpa (todos os registros da empresa)
 *   export_csv         — exportação CSV/Excel
 *   record_edited      — célula de registro editada
 *   whatsapp_charges_sent — cobranças enviadas via WhatsApp
 */

import { supabase } from './supabaseClient';

/**
 * Registra uma ação no audit_log.
 *
 * @param {Object} params
 * @param {string|null} params.companyId  - UUID da empresa
 * @param {string}      params.action     - Chave da ação (ex: 'import_confirmed')
 * @param {string}      params.entity     - Nome da entidade (ex: 'registros_financeiros')
 * @param {string|null} [params.entityId] - UUID da entidade afetada (se aplicável)
 * @param {Object|null} [params.metadata] - Dados extras serializáveis em JSON
 */
export async function logAudit({ companyId, action, entity, entityId = null, metadata = null }) {
  if (!supabase) return;

  try {
    const { error } = await supabase.from('audit_logs').insert({
      company_id: companyId || null,
      action,
      entity,
      entity_id:  entityId  ? String(entityId)  : null,
      metadata:   metadata  ? metadata           : null,
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[AuditLog] Falha ao registrar log:', error.message);
    }
  } catch (err) {
    // Silencioso — log failure nunca deve interromper a operação principal
    // eslint-disable-next-line no-console
    console.warn('[AuditLog] Erro inesperado:', err?.message);
  }
}

/**
 * Helpers pré-configurados para as ações mais comuns.
 * Chamados diretamente nos hooks de negócio.
 */

export const auditLog = {
  importConfirmed(companyId, { arquivo, registros, tipo }) {
    return logAudit({
      companyId,
      action:   'import_confirmed',
      entity:   'importacoes',
      metadata: { arquivo, registros, tipo },
    });
  },

  recordsDeleted(companyId, { count, ids }) {
    return logAudit({
      companyId,
      action:   'records_deleted',
      entity:   'registros_financeiros',
      metadata: { count, ids: ids?.slice(0, 50) }, // limita IDs para não explodir o JSON
    });
  },

  historyDeleted(companyId, { count, ids }) {
    return logAudit({
      companyId,
      action:   'history_deleted',
      entity:   'importacoes',
      metadata: { count, ids: ids?.slice(0, 50) },
    });
  },

  viewCleared(companyId, { count }) {
    return logAudit({
      companyId,
      action:   'view_cleared',
      entity:   'registros_financeiros',
      metadata: { count },
    });
  },

  exportCsv(companyId, { count, filters }) {
    return logAudit({
      companyId,
      action:   'export_csv',
      entity:   'registros_financeiros',
      metadata: { count, filters },
    });
  },

  recordEdited(companyId, { id, field, oldValue, newValue }) {
    return logAudit({
      companyId,
      action:   'record_edited',
      entity:   'registros_financeiros',
      entityId: id,
      metadata: { field, oldValue, newValue },
    });
  },

  whatsappChargesSent(companyId, { count, mocked }) {
    return logAudit({
      companyId,
      action:   'whatsapp_charges_sent',
      entity:   'cobrancas_whatsapp',
      metadata: { count, mocked },
    });
  },
};
