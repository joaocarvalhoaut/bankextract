import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  PhoneOff,
  Receipt,
  RefreshCcw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import CollectionMessagePreview from '../components/CollectionMessagePreview';
import DataTable from '../components/DataTable';
import PlanLimitNotice from '../components/PlanLimitNotice';
import {
  getBillingCenter,
  getBillingConfig,
  prepareManualCharge,
  previewChargePayload,
  saveBillingConfig,
  sendRealCharge,
  simulateChargeItem,
  syncBillingDrive,
  updateChargeStatus,
} from '../services/billingAutomationService';
import { createAuditEvent } from '../services/auditTimelineService';
import { createNotification } from '../services/notificationService';
import { getCollectionToneMeta } from '../services/collectionMessageService';
import { getUsageSummary } from '../services/usageService';
import { canUserPerformAction } from '../security/permissions';
import { formatCurrencyBRL } from '../utils/format';

function CenterCard({ label, value, tone = 'slate' }) {
  const palette = {
    slate: 'from-slate-400 to-slate-500 text-slate-50',
    emerald: 'from-emerald-400 to-emerald-600 text-emerald-700',
    blue: 'from-blue-400 to-blue-600 text-blue-700',
    amber: 'from-amber-400 to-orange-400 text-amber-700',
    red: 'from-red-400 to-red-600 text-red-700',
  };

  return (
    <article className="relative overflow-hidden rounded-[24px] border border-slate-700 bg-slate-900/60 p-5 shadow-soft">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${palette[tone]?.split(' text-')[0] || 'from-slate-400 to-slate-500'} opacity-80`} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${palette[tone]?.split(' ').pop() || 'text-slate-50'}`}>{value}</p>
    </article>
  );
}

const toneByStatus = {
  pendente: 'bg-slate-800/60 text-slate-200 ring-slate-700',
  pago: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  negociado: 'bg-blue-900/20 text-blue-700 ring-blue-200',
  suspenso: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const boletoStatusTone = {
  encontrado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  baixa_confianca: 'bg-amber-50 text-amber-700 ring-amber-200',
  pendente: 'bg-slate-800/60 text-slate-200 ring-slate-700',
  sem_boleto: 'bg-red-50 text-red-700 ring-red-200',
  nao_encontrado: 'bg-orange-50 text-orange-700 ring-orange-200',
  conflito: 'bg-red-50 text-red-700 ring-red-200',
  erro: 'bg-red-50 text-red-700 ring-red-200',
};

function truncateLinhaDigitavel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 5)}...${raw.slice(-5)}`;
}

function getNumeroBoletoEfetivo(registro = {}) {
  return String(registro?.documento || registro?.numero_nf || registro?.numero_boleto || '').trim();
}

function getClienteEfetivo(registro = {}) {
  return String(registro?.cliente_nome || registro?.cliente || '').trim();
}

function temBoleto(registro = {}) {
  const numero = getNumeroBoletoEfetivo(registro);
  return Boolean(numero && numero !== '-');
}

function logCobrancaMapping(registro = {}) {
  const numeroBoletoEfetivo = getNumeroBoletoEfetivo(registro);
  const clienteEfetivo = getClienteEfetivo(registro);
  console.log(
    '[COBRANCA]',
    'cliente=', clienteEfetivo,
    'documento=', registro?.documento || '',
    'numero_nf=', registro?.numero_nf || '',
    'usando=', numeroBoletoEfetivo
  );
  return { numeroBoletoEfetivo, clienteEfetivo };
}

function isChargeRowEligible(row = {}) {
  const status = String(row?.status || '').toLowerCase().trim();
  const hasStatus = ['aberto', 'pendente', 'vencido'].includes(status);
  const hasPhone = Boolean(row?.telefone_valido || String(row?.telefone || '').trim());
  const hasDocument = temBoleto(row);
  const hasError = Boolean(String(row?.ultimo_erro || '').trim());
  return hasStatus && hasPhone && hasDocument && !hasError;
}

export default function CentralCobrancaScreen({
  companyId,
  activeCompanyId,
  activeCompany,
  selectedCompany,
  company,
  companyName,
  globalMode,
  userRole = 'operador',
  onToast,
}) {
  const resolvedCompanyId =
    companyId ||
    activeCompanyId ||
    activeCompany?.id ||
    selectedCompany?.id ||
    company?.id ||
    null;

  const [loading, setLoading] = useState(false);
  const [runningAction, setRunningAction] = useState('');
  const [center, setCenter] = useState(null);
  const [items, setItems] = useState([]);
  const [simulationResult, setSimulationResult] = useState(null);
  const [previewResult, setPreviewResult] = useState(null);
  const [manualResult, setManualResult] = useState(null);
  const [selectedRows, setSelectedRows] = useState(() => new Set());
  const [openMenuRowId, setOpenMenuRowId] = useState(null);
  const [limitNotice, setLimitNotice] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sendingReal, setSendingReal] = useState(false);
  const [sendingRealKeys, setSendingRealKeys] = useState(() => new Set());
  const [zapiBlockedError, setZapiBlockedError] = useState(null);

  const canManageCharges = canUserPerformAction(userRole, 'manage_charges');

  const loadCenter = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      setCenter(null);
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const response = await getBillingCenter(resolvedCompanyId);
      const nextItems = response?.items ?? response?.data?.items ?? [];
      setItems(Array.isArray(nextItems) ? nextItems : []);
      setSelectedRows(new Set());
      setCenter(response);
    } catch (error) {
      setItems([]);
      onToast?.('erro', error.message || 'Falha ao carregar a central de cobranca.');
    } finally {
      setLoading(false);
    }
  }, [globalMode, onToast, resolvedCompanyId]);

  useEffect(() => {
    loadCenter();
  }, [loadCenter]);

  useEffect(() => {
    let alive = true;

    const loadUsage = async () => {
      if (!resolvedCompanyId || globalMode) {
        if (alive) setLimitNotice(null);
        return;
      }

      try {
        const summary = await getUsageSummary(resolvedCompanyId);
        const metric = summary?.metrics?.charges_month;

        if (!alive) return;
        if (metric?.alert) {
          setLimitNotice({
            type: metric.alert.level === 'warning' ? 'warning' : 'danger',
            title: metric.alert.title,
            message: metric.alert.message,
          });
        } else {
          setLimitNotice(null);
        }
      } catch {
        if (alive) setLimitNotice(null);
      }
    };

    loadUsage();
    return () => {
      alive = false;
    };
  }, [globalMode, resolvedCompanyId]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!event.target.closest('[data-row-action-menu]')) {
        setOpenMenuRowId(null);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpenMenuRowId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const runRowAction = useCallback(
    async (actionKey, fn, successMessage) => {
      if (!resolvedCompanyId || globalMode) {
        onToast?.('erro', 'Selecione uma empresa especifica para operar a central.');
        return;
      }

      setRunningAction(actionKey);
      try {
        const result = await fn();
        await loadCenter();
        const payload = result?.payload
          ? {
              ...result.payload,
              cliente: getClienteEfetivo(result.payload) || result.payload?.cliente || '',
              numero_boleto: getNumeroBoletoEfetivo(result.payload) || result.payload?.numero_boleto || '',
            }
          : null;
        if (payload) logCobrancaMapping(payload);
        if (result?.mensagem_gerada) {
          createAuditEvent(resolvedCompanyId, {
            action: 'whatsapp_simulated',
            entity_type: 'cobrancas_whatsapp',
            entity_id: payload?.registro_id || payload?.documento || null,
            title: 'Cobranca simulada',
            description: `Previa de envio gerada para ${payload?.cliente || 'cliente selecionado'}.`,
            metadata: {
              documento: payload?.documento || payload?.numero_boleto || '',
            },
            severity: 'info',
          }).catch(() => {});
          setSimulationResult(payload ? { ...result, payload } : result);
        }
        if (result?.payload && result?.message) {
          createAuditEvent(resolvedCompanyId, {
            action: 'whatsapp_simulated',
            entity_type: 'cobrancas_whatsapp',
            entity_id: payload?.registro_id || payload?.documento || null,
            title: 'Previa do envio gerada',
            description: `Payload de cobranca montado para ${payload?.cliente || 'cliente selecionado'}.`,
            metadata: {
              documento: payload?.documento || payload?.numero_boleto || '',
            },
            severity: 'info',
          }).catch(() => {});
          setPreviewResult(payload ? { ...result, payload } : result);
        }
        if (result?.manual_message && result?.payload) {
          createAuditEvent(resolvedCompanyId, {
            action: 'charge_prepared',
            entity_type: 'cobrancas_whatsapp',
            entity_id: payload?.registro_id || payload?.documento || null,
            title: 'Cobranca preparada',
            description: `Cobranca preparada para ${payload?.cliente || 'cliente selecionado'}.`,
            metadata: {
              documento: payload?.documento || payload?.numero_boleto || '',
              telefone: payload?.telefone || '',
            },
            severity: 'info',
          }).catch(() => {});
          setManualResult({
            type: 'single',
            items: [{
              ...(payload || result.payload),
              message: result.manual_message,
            }],
            prepared: 1,
            errors: 0,
            warning: result.warning,
          });
        }
        onToast?.('sucesso', result?.payload ? successMessage : result?.message || successMessage);
      } catch (error) {
        onToast?.('erro', error.message || 'Falha ao executar a acao da central.');
      } finally {
        setRunningAction('');
      }
    },
    [globalMode, loadCenter, onToast, resolvedCompanyId]
  );

  const cards = center?.cards || {
    vencendo_amanha: 0,
    vencem_hoje: 0,
    em_atraso: 0,
    sem_boleto_encontrado: 0,
    sem_telefone_valido: 0,
    simulacoes_realizadas_hoje: 0,
    erros: 0,
    total_em_aberto: 0,
  };

  const rows = Array.isArray(items) ? items : [];
  const allSelected = rows.length > 0 && selectedRows.size === rows.length;

  const toggleRowSelection = useCallback((rowId) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const toggleAllRows = useCallback(() => {
    setSelectedRows((current) => {
      if (rows.length && current.size === rows.length) return new Set();
      return new Set(rows.map((row) => row.id));
    });
  }, [rows]);

  const copyText = useCallback(async (value, successMessage) => {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      onToast?.('sucesso', successMessage);
    } catch {
      onToast?.('erro', 'Nao foi possivel copiar o conteudo.');
    }
  }, [onToast]);

  const saveCompanyTemplate = useCallback(async (mensagemFinal) => {
    if (!resolvedCompanyId || globalMode) {
      onToast?.('erro', 'Selecione uma empresa especifica para salvar o modelo.');
      return;
    }

    const finalMessage = String(mensagemFinal || '').trim();
    if (!finalMessage) {
      onToast?.('erro', 'A mensagem do modelo nao pode ficar vazia.');
      return;
    }

    console.log('[MENSAGEM TEMPLATE]', finalMessage);
    setSavingTemplate(true);
    try {
      const currentConfigResponse = await getBillingConfig(resolvedCompanyId);
      const currentConfig = currentConfigResponse?.config || currentConfigResponse?.data || currentConfigResponse || {};

      await saveBillingConfig(resolvedCompanyId, {
        ...currentConfig,
        mensagem_template: finalMessage,
        template_preventiva: finalMessage,
        template_vencimento: finalMessage,
        template_atraso: finalMessage,
      });

      onToast?.('sucesso', 'Modelo da empresa salvo com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao salvar o modelo da empresa.');
    } finally {
      setSavingTemplate(false);
    }
  }, [globalMode, onToast, resolvedCompanyId]);

  const applyRealSendSummary = useCallback((previous, response) => {
    const sent = Array.isArray(response?.sent) ? response.sent : [];
    const failed = Array.isArray(response?.failed) ? response.failed : [];
    const sentKeys = new Set(sent.map((item) => String(item?.registro_id || item?.id || item?.documento || item?.numero_boleto || '')));
    const failedByKey = new Map(
      failed.map((item) => [
        String(item?.registro_id || item?.id || item?.documento || item?.numero_boleto || ''),
        item,
      ])
    );

    const nextItems = (previous?.items || []).map((item) => {
      const key = String(item?.registro_id || item?.id || item?.documento || item?.numero_boleto || '');
      if (sentKeys.has(key)) {
        const sentItem = sent.find((current) => String(current?.registro_id || current?.id || current?.documento || current?.numero_boleto || '') === key) || {};
        return {
          ...item,
          ...sentItem,
          send_status: 'enviado',
        };
      }
      if (failedByKey.has(key)) {
        const failedItem = failedByKey.get(key) || {};
        return {
          ...item,
          ...failedItem,
          send_status: 'erro',
          send_error: failedItem?.error || 'Falha no envio real.',
        };
      }
      return item;
    });

    return {
      ...previous,
      items: nextItems,
      sendSummary: {
        sent: sent.length,
        failed: failed.length,
        pending: Math.max(nextItems.length - sent.length - failed.length, 0),
      },
    };
  }, []);

  const handleSendReal = useCallback(async (entries, batch = false) => {
    const safeEntries = Array.isArray(entries) ? entries : [];
    if (!resolvedCompanyId || !safeEntries.length) {
      onToast?.('erro', 'Nenhuma cobranca preparada para envio real.');
      return;
    }

    const confirmMessage = batch
      ? `Voce esta prestes a enviar ${safeEntries.length} mensagem(ns) reais pelo WhatsApp. Confirmar?`
      : 'Confirmar envio real pelo WhatsApp para este cliente?';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    const payload = safeEntries.map((item) => ({
      registro_id: item?.registro_id || item?.id || null,
      company_id: resolvedCompanyId,
      cliente_nome: getClienteEfetivo(item),
      telefone: item?.telefone || '',
      documento: item?.documento || getNumeroBoletoEfetivo(item) || '',
      numero_boleto: getNumeroBoletoEfetivo(item) || '',
      numero_nf: item?.numero_nf || '',
      valor: item?.valor || 0,
      vencimento: item?.vencimento || null,
      message: item?.message || '',
    }));

    const activeKeys = new Set(payload.map((item) => String(item.registro_id || item.documento || item.numero_boleto || '')));
    setSendingReal(true);
    setSendingRealKeys(activeKeys);
    try {
      const result = await sendRealCharge(resolvedCompanyId, payload);
      console.log('[ENVIO REAL] resultado', result);
      setManualResult((current) => applyRealSendSummary(current, result));
      await loadCenter();
      await createAuditEvent(resolvedCompanyId, {
        action: 'whatsapp_sent',
        entity_type: 'cobrancas_whatsapp',
        title: batch ? 'Lote real enviado' : 'Cobranca enviada',
        description: `${Array.isArray(result?.sent) ? result.sent.length : 0} mensagem(ns) enviada(s) via Z-API.`,
        metadata: {
          sent: Array.isArray(result?.sent) ? result.sent.length : 0,
          failed: Array.isArray(result?.failed) ? result.failed.length : 0,
        },
        severity: Array.isArray(result?.failed) && result.failed.length ? 'warning' : 'success',
      }).catch(() => {});
      onToast?.(
        'sucesso',
        `${Array.isArray(result?.sent) ? result.sent.length : 0} envio(s) real(is) concluido(s).`
      );
    } catch (error) {
      const msg = error?.message || '';
      const isZapiPairing = msg.toLowerCase().includes('nao pareado') ||
        msg.toLowerCase().includes('nao conectado') ||
        msg.toLowerCase().includes('qr code') ||
        error?.code === 'zapi_not_paired';
      if (isZapiPairing) {
        setZapiBlockedError(msg);
      }
      onToast?.('erro', msg || 'Falha ao enviar cobranca real pelo WhatsApp.');
    } finally {
      setSendingReal(false);
      setSendingRealKeys(new Set());
    }
  }, [applyRealSendSummary, loadCenter, onToast, resolvedCompanyId]);

  const handleCollectionMessageGenerated = useCallback(
    async (tone, payload) => {
      const toneMeta = getCollectionToneMeta(tone);
      const numeroBoletoEfetivo = getNumeroBoletoEfetivo(payload);
      await createAuditEvent(resolvedCompanyId, {
        action: 'collection_ai_generated',
        entity_type: 'cobrancas_whatsapp',
        entity_id: payload?.registro_id || payload?.documento || numeroBoletoEfetivo || null,
        title: 'Mensagem inteligente gerada',
        description: `IA local gerou uma mensagem com tom ${toneMeta.label.toLowerCase()}.`,
        metadata: {
          tone,
          tone_label: toneMeta.label,
          documento: payload?.documento || numeroBoletoEfetivo || '',
        },
        severity: toneMeta.severity === 'danger' ? 'danger' : toneMeta.severity === 'warning' ? 'warning' : 'info',
      });

      if (tone === 'firme' || tone === 'juridico') {
        await createNotification(resolvedCompanyId, {
          type: 'collection_ai_tone',
          title: `Tom ${toneMeta.label} usado na cobranca`,
          message: `Uma mensagem de cobranca foi gerada com tom ${toneMeta.label.toLowerCase()}.`,
          severity: tone === 'juridico' ? 'danger' : 'warning',
          metadata: {
            tone,
            documento: payload?.documento || numeroBoletoEfetivo || '',
          },
        });
      }
    },
    [resolvedCompanyId]
  );

  const downloadManualCsv = useCallback((entries) => {
    const header = 'Cliente;Telefone;Mensagem;LinhaDigitavel;LinkBoleto';
    const lines = (entries || []).map((item) =>
      [
        getClienteEfetivo(item) || '',
        item.telefone || '',
        `"${String(item.message || '').replace(/"/g, '""')}"`,
        item.linha_digitavel || '',
        item.boleto_url || '',
      ].join(';')
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cobrancas_manuais_bankextract.csv';
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const handlePrepareSelected = useCallback(async (options = {}) => {
    console.log('[PREPARAR COBRANCA] click');
    console.log('[PREPARAR COBRANCA] selecionados', Array.from(selectedRows));
    const fallbackToEligible = options?.fallbackToEligible !== false;
    const selectedIds = Array.from(selectedRows).slice(0, 20);
    const eligibleRows = rows.filter((row) => isChargeRowEligible(row)).slice(0, 20);
    const targetIds = selectedIds.length ? selectedIds : (fallbackToEligible ? eligibleRows.map((row) => row.id) : []);

    if (!targetIds.length) {
      onToast?.('erro', 'Selecione ao menos um titulo para preparar a cobranca.');
      return;
    }

    setRunningAction('prepare-selected');
    try {
      const preparedItems = [];
      const errorsList = [];
      for (const rowId of targetIds) {
        const row = rows.find((item) => item.id === rowId) || {};
        const elegivel = isChargeRowEligible(row);

        if (!elegivel) {
          errorsList.push({
            id: rowId,
            cliente: getClienteEfetivo(row) || 'Cliente',
            error: 'Titulo nao elegivel para preparo manual.',
            semTelefone: !(row?.telefone_valido || String(row?.telefone || '').trim()),
            semBoleto: !temBoleto(row),
          });
          continue;
        }

        try {
          const result = await prepareManualCharge(resolvedCompanyId, rowId);
          preparedItems.push({
            ...result.payload,
            cliente: getClienteEfetivo(result.payload) || result.payload?.cliente || '',
            numero_boleto: getNumeroBoletoEfetivo(result.payload) || result.payload?.numero_boleto || '',
            message: result.manual_message || result.message || '',
          });
        } catch (error) {
          console.error('[PREPARAR COBRANCA] erro item', error);
          try {
            const fallbackResult = await previewChargePayload(resolvedCompanyId, rowId);
            preparedItems.push({
              ...fallbackResult.payload,
              cliente: getClienteEfetivo(fallbackResult.payload) || fallbackResult.payload?.cliente || '',
              numero_boleto: getNumeroBoletoEfetivo(fallbackResult.payload) || fallbackResult.payload?.numero_boleto || '',
              message: fallbackResult.message || fallbackResult.manual_message || '',
              preview_only: true,
            });
          } catch (fallbackError) {
            errorsList.push({
              id: rowId,
              cliente: getClienteEfetivo(row) || 'Cliente',
              error: fallbackError.message || error.message || 'Falha ao preparar envio manual.',
              semTelefone: !(row?.telefone_valido || String(row?.telefone || '').trim()),
              semBoleto: !temBoleto(row),
            });
          }
        }
      }

      const result = {
        type: 'batch',
        items: preparedItems,
        prepared: preparedItems.length,
        errors: errorsList.length,
        errorItems: errorsList,
        warning: 'Envio real nao realizado. Copie as mensagens e envie manualmente pelo WhatsApp.',
      };
      console.log('[PREPARAR COBRANCA] resultado', result);
      setManualResult(result);
      if (preparedItems.length) {
        createAuditEvent(resolvedCompanyId, {
          action: 'charge_prepared',
          entity_type: 'cobrancas_whatsapp',
          title: 'Lote de cobrancas preparado',
          description: `${preparedItems.length} cobranca(s) preparada(s) para envio manual assistido.`,
          metadata: {
            prepared: preparedItems.length,
            errors: errorsList.length,
            documentos: preparedItems.map((item) => item.documento || getNumeroBoletoEfetivo(item) || '').filter(Boolean),
          },
          severity: errorsList.length ? 'warning' : 'info',
        }).catch(() => {});
      }
      await loadCenter();
      onToast?.('sucesso', `${preparedItems.length} preparo(s) manual(is) concluido(s).`);
    } catch (error) {
      console.error('[PREPARAR COBRANCA] erro', error);
      onToast?.('erro', error.message || 'Falha ao preparar os titulos selecionados.');
    } finally {
      setRunningAction('');
    }
  }, [loadCenter, onToast, resolvedCompanyId, rows, selectedRows]);

  const columns = useMemo(
    () => [
      {
        key: 'select',
        label: (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAllRows}
            className="h-4 w-4 rounded border-slate-700"
          />
        ),
        render: (row) => (
          <input
            type="checkbox"
            checked={selectedRows.has(row.id)}
            onChange={() => toggleRowSelection(row.id)}
            className="h-4 w-4 rounded border-slate-700"
          />
        ),
      },
      {
        key: 'cliente_nome',
        label: 'Cliente',
        render: (row) => <span className="font-medium text-slate-50">{getClienteEfetivo(row) || row.cliente_nome}</span>,
      },
      {
        key: 'numero_boleto',
        label: 'NumeroBoleto',
        render: (row) => getNumeroBoletoEfetivo(row) || '-',
      },
      {
        key: 'vencimento',
        label: 'Vencimento',
        render: (row) => (row.vencimento ? new Date(`${row.vencimento}T00:00:00`).toLocaleDateString('pt-BR') : '-'),
      },
      {
        key: 'valor',
        label: 'Valor',
        render: (row) => <span className="font-semibold text-slate-50">{formatCurrencyBRL(row.valor)}</span>,
      },
      {
        key: 'telefone',
        label: 'Telefone',
        render: (row) => row.telefone || <span className="text-slate-400">Sem telefone</span>,
      },
      {
        key: 'status',
        label: 'Status',
        render: (row) => (
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${toneByStatus[row.status || 'pendente'] || 'bg-slate-800/60 text-slate-200 ring-slate-700'}`}>
            {row.status || 'pendente'}
          </span>
        ),
      },
      {
        key: 'etapa_regua',
        label: 'Etapa da regua',
      },
      {
        key: 'boleto_status',
        label: 'Status boleto',
        render: (row) => (
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${boletoStatusTone[row.boleto_status || 'pendente'] || boletoStatusTone.pendente}`}>
            {row.boleto_status || 'pendente'}
          </span>
        ),
      },
      {
        key: 'boleto_match_confidence',
        label: 'Confianca',
        render: (row) => {
          const confidence = Number(row.boleto_match_confidence || 0);
          const tone =
            confidence >= 80
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : confidence >= 50
                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                : 'bg-slate-800/60 text-slate-200 ring-slate-700';
          return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tone}`}>{confidence.toFixed(0)}%</span>;
        },
      },
      {
        key: 'linha_digitavel',
        label: 'Linha digitavel',
        render: (row) => (
          <div className="flex items-center gap-2">
            <span title={row.linha_digitavel || ''}>{truncateLinhaDigitavel(row.linha_digitavel)}</span>
            {row.linha_digitavel ? (
              <button
                type="button"
                onClick={() => copyText(row.linha_digitavel, 'Linha digitavel copiada com sucesso.')}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-800/40"
              >
                <Copy size={11} />
                Copiar
              </button>
            ) : null}
          </div>
        ),
      },
      {
        key: 'boleto_encontrado',
        label: 'Boleto encontrado',
        render: (row) =>
          row.boleto_encontrado ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 size={12} />
              Sim
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
              <AlertCircle size={12} />
              nao
            </span>
          ),
      },
      {
        key: 'ultima_cobranca',
        label: 'Ultima cobranca',
        render: (row) =>
          row.ultima_cobranca
            ? new Date(row.ultima_cobranca).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '-',
      },
      {
        key: 'actions',
        label: 'Acoes',
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canManageCharges || Boolean(runningAction)}
              onClick={() =>
                runRowAction(
                  `prepare-${row.id}`,
                  () => prepareManualCharge(resolvedCompanyId, row.id),
                  'Envio manual assistido preparado com sucesso.'
                )
              }
              className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              {runningAction === `prepare-${row.id}` ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Preparar cobranca
            </button>
            <button
              type="button"
              disabled={!row.boleto_url}
              onClick={() => window.open(row.boleto_url, '_blank', 'noopener,noreferrer')}
              className="control-surface inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium text-slate-200 transition disabled:opacity-50"
            >
              <ExternalLink size={12} />
              Abrir boleto
            </button>
            <div className="relative" data-row-action-menu>
              <button
                type="button"
                onClick={() => setOpenMenuRowId((current) => (current === row.id ? null : row.id))}
                className="control-surface inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium text-slate-200 transition"
              >
                <MoreHorizontal size={12} />
                Mais acoes
                <ChevronDown size={12} />
              </button>
              {openMenuRowId === row.id ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-[90] min-w-[220px] rounded-2xl border border-slate-700 bg-slate-900/96 p-2 shadow-xl backdrop-blur">
                  <button
                    type="button"
                    disabled={!canManageCharges || Boolean(runningAction)}
                    onClick={() => {
                      setOpenMenuRowId(null);
                      runRowAction(
                        `simulate-${row.id}`,
                        () => simulateChargeItem(resolvedCompanyId, row.id),
                        'Simulacao registrada com sucesso.'
                      );
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
                  >
                    <Send size={12} />
                    Simular cobranca
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(runningAction)}
                    onClick={() => {
                      setOpenMenuRowId(null);
                      runRowAction(
                        `preview-${row.id}`,
                        () => previewChargePayload(resolvedCompanyId, row.id),
                        'Previa do envio montada com sucesso.'
                      );
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
                  >
                    <Receipt size={12} />
                    Previa do envio
                  </button>
                  <button
                    type="button"
                    disabled={!canManageCharges || Boolean(runningAction)}
                    onClick={() => {
                      setOpenMenuRowId(null);
                      runRowAction(
                        `paid-${row.id}`,
                        () => updateChargeStatus(resolvedCompanyId, row.id, 'pago'),
                        'Titulo marcado como pago.'
                      );
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
                  >
                    <CheckCircle2 size={12} />
                    Marcar como pago
                  </button>
                  <button
                    type="button"
                    disabled={!canManageCharges || Boolean(runningAction)}
                    onClick={() => {
                      setOpenMenuRowId(null);
                      runRowAction(
                        `negotiated-${row.id}`,
                        () => updateChargeStatus(resolvedCompanyId, row.id, 'negociado'),
                        'Titulo marcado como negociado.'
                      );
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
                  >
                    <Receipt size={12} />
                    Marcar como negociado
                  </button>
                  <button
                    type="button"
                    disabled={!canManageCharges || Boolean(runningAction)}
                    onClick={() => {
                      setOpenMenuRowId(null);
                      runRowAction(
                        `suspend-${row.id}`,
                        () => updateChargeStatus(resolvedCompanyId, row.id, 'suspenso'),
                        'Cobranca suspensa para este titulo.'
                      );
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
                  >
                    <PhoneOff size={12} />
                    Suspender cobranca
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(runningAction)}
                    onClick={() => {
                      setOpenMenuRowId(null);
                      runRowAction(
                        `drive-${row.id}`,
                        () => syncBillingDrive(resolvedCompanyId),
                        'Busca de boletos reprocessada com sucesso.'
                      );
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
                  >
                    <RefreshCcw size={12} />
                    Reprocessar boleto
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ),
      },
    ],
    [allSelected, canManageCharges, copyText, openMenuRowId, resolvedCompanyId, runRowAction, runningAction, selectedRows, toggleAllRows, toggleRowSelection]
  );

  if (globalMode || !resolvedCompanyId) {
    return (
      <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-soft">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5" size={18} />
          <div>
            <p className="font-semibold">Selecione uma empresa especifica</p>
            <p className="mt-1 text-xs text-amber-700">
              A central de cobranca trabalha por empresa para manter isolamento por company_id.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="text-crisp space-y-6">
      {limitNotice ? <PlanLimitNotice {...limitNotice} /> : null}

      {zapiBlockedError && (
        <div className="rounded-2xl border border-amber-700/50 bg-amber-950/30 px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">WhatsApp não pareado — envio bloqueado</p>
              <p className="text-xs text-amber-400/80 mt-1">{zapiBlockedError}</p>
              <button
                type="button"
                onClick={() => setZapiBlockedError(null)}
                className="mt-2 text-xs text-amber-400 hover:text-amber-200 underline underline-offset-2"
              >
                Fechar aviso
              </button>
            </div>
          </div>
        </div>
      )}
      <section className="rounded-[28px] border border-slate-700 bg-slate-900/60 p-6 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <Receipt size={13} />
              Central de cobranca
            </div>
            <h3 className="mt-4 text-2xl font-semibold text-slate-50">Operacao da regua por titulo</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              Visao consolidada da carteira da empresa <span className="font-semibold text-slate-50">{companyName}</span> com etapa da regua, boleto encontrado e ultimas simulacoes.
            </p>
          </div>
          <button
            type="button"
            onClick={loadCenter}
            disabled={loading}
            className="control-surface inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-soft transition disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            Atualizar central
          </button>
          <button
            type="button"
            onClick={() => handlePrepareSelected({ fallbackToEligible: true })}
            disabled={Boolean(runningAction)}
            className="control-surface inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-soft transition"
          >
            <Send size={15} />
            Preparar cobranca
          </button>
          <button
            type="button"
            onClick={() => handlePrepareSelected({ fallbackToEligible: false })}
            disabled={!selectedRows.size || Boolean(runningAction)}
            className="control-surface inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-soft transition disabled:opacity-50"
          >
            {runningAction === 'prepare-selected' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Preparar lote
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CenterCard label="Vencendo amanha" value={cards.vencendo_amanha} tone="blue" />
        <CenterCard label="Vencem hoje" value={cards.vencem_hoje} tone="emerald" />
        <CenterCard label="Em atraso" value={cards.em_atraso} tone="amber" />
        <CenterCard label="Sem boleto encontrado" value={cards.sem_boleto_encontrado} tone="red" />
        <CenterCard label="Sem telefone valido" value={cards.sem_telefone_valido} tone="amber" />
        <CenterCard label="Simulacoes hoje" value={cards.simulacoes_realizadas_hoje} tone="blue" />
        <CenterCard label="Erros" value={cards.erros} tone="red" />
        <CenterCard label="Total em aberto" value={cards.total_em_aberto} tone="slate" />
      </section>

      {simulationResult ? (
        <section className="rounded-[28px] border border-blue-700/40 bg-blue-500/10 p-6 shadow-soft">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 text-blue-700" size={18} />
            <div className="w-full">
              <p className="text-sm font-semibold text-blue-900">Ultima simulacao</p>
              <p className="mt-1 text-xs text-blue-700">
                Arquivo encontrado: {simulationResult.arquivo_encontrado ? 'sim' : 'nao'}.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-2xl border border-blue-100 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-200">
                {simulationResult.mensagem_gerada || 'Nenhuma mensagem gerada.'}
              </pre>
              <div className="mt-4">
                <CollectionMessagePreview
                  title="IA de cobranca para a simulacao"
                  context={{
                    nome: getClienteEfetivo(simulationResult.payload),
                    valor: simulationResult.payload?.valor,
                    vencimento: simulationResult.payload?.vencimento,
                    diasAtraso: simulationResult.payload?.dias_atraso,
                    documento: simulationResult.payload?.documento,
                    telefone: simulationResult.payload?.telefone,
                    empresa: companyName,
                    linha_digitavel: simulationResult.payload?.linha_digitavel,
                    link_boleto: simulationResult.payload?.boleto_url,
                    codigo_barras: simulationResult.payload?.codigo_barras,
                  }}
                  initialMessage={simulationResult.mensagem_gerada || ''}
                  restoreMessage={simulationResult.mensagem_gerada || ''}
                  onMessageChange={(value) =>
                    {
                      console.log('[MENSAGEM TEMPLATE]', value);
                      setSimulationResult((current) => (current ? { ...current, mensagem_gerada: value } : current));
                    }
                  }
                  onGenerated={(result) => {
                    handleCollectionMessageGenerated(result.tone, simulationResult.payload).catch(() => {});
                    setSimulationResult((current) => (current ? { ...current, mensagem_gerada: result.message } : current));
                  }}
                  onSaveTemplate={saveCompanyTemplate}
                  savingTemplate={savingTemplate}
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-slate-700 bg-slate-900/60 p-6 shadow-soft">
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="Nenhum titulo monitorado nesta empresa."
          emptyDescription="Assim que houver registros sincronizados, a central mostrara a etapa da regua e o status do boleto."
        />
      </section>

      {previewResult ? (
        <div className="modal-overlay fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div className="modal-shell text-crisp max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[28px] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-900">Previa do envio</p>
                <p className="mt-1 text-xs text-emerald-700">Simulacao - nao enviado.</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewResult(null)}
                className="control-surface rounded-xl px-3 py-2 text-xs font-semibold text-slate-200"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <CollectionMessagePreview
                title="IA de cobranca para a previa"
                context={{
                  nome: getClienteEfetivo(previewResult.payload),
                  valor: previewResult.payload?.valor,
                  vencimento: previewResult.payload?.vencimento,
                  diasAtraso: previewResult.payload?.dias_atraso,
                  documento: previewResult.payload?.documento,
                  telefone: previewResult.payload?.telefone,
                  empresa: companyName,
                  linha_digitavel: previewResult.payload?.linha_digitavel,
                  link_boleto: previewResult.payload?.boleto_url,
                  codigo_barras: previewResult.payload?.codigo_barras,
                }}
                initialMessage={previewResult.message || ''}
                restoreMessage={previewResult.message || ''}
                onMessageChange={(value) =>
                  {
                    console.log('[MENSAGEM TEMPLATE]', value);
                    setPreviewResult((current) => (current ? { ...current, message: value } : current));
                  }
                }
                onGenerated={(result) => {
                  handleCollectionMessageGenerated(result.tone, previewResult.payload).catch(() => {});
                  setPreviewResult((current) => (current ? { ...current, message: result.message } : current));
                }}
                onSaveTemplate={saveCompanyTemplate}
                savingTemplate={savingTemplate}
              />

              <div className="panel-subtle rounded-2xl p-4 text-sm text-slate-200">
                <p><span className="font-semibold text-slate-50">Numero boleto:</span> {getNumeroBoletoEfetivo(previewResult.payload) || '-'}</p>
                <p className="mt-2"><span className="font-semibold text-slate-50">Linha digitavel:</span> {previewResult.payload?.linha_digitavel || '-'}</p>
                <p className="mt-2"><span className="font-semibold text-slate-50">Codigo barras:</span> {previewResult.payload?.codigo_barras || '-'}</p>
                <p className="mt-2"><span className="font-semibold text-slate-50">Link boleto:</span> {previewResult.payload?.boleto_url || '-'}</p>
                <p className="mt-2"><span className="font-semibold text-slate-50">PDF:</span> {previewResult.payload?.drive_file_id || '-'}</p>
                <p className="mt-2"><span className="font-semibold text-slate-50">Status:</span> Simulacao - nao enviado</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {manualResult ? (
        <div className="modal-overlay fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div className="modal-shell text-crisp max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-[28px] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-900">Envio manual assistido</p>
                <p className="mt-1 text-xs text-emerald-700">{manualResult.warning || 'Envio real ainda nao realizado.'}</p>
              </div>
              <div className="flex gap-2">
                {manualResult.type === 'batch' ? (
                  <button
                    type="button"
                    onClick={() => downloadManualCsv(manualResult.items || [])}
                    className="control-surface rounded-xl px-3 py-2 text-xs font-semibold text-slate-200"
                  >
                    Baixar CSV
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={sendingReal || !(manualResult.items || []).length}
                  onClick={() => handleSendReal(manualResult.items || [], (manualResult.items || []).length > 1)}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                >
                  {sendingReal ? 'Enviando lote...' : (manualResult.type === 'batch' ? 'Enviar lote real' : 'Enviar WhatsApp real')}
                </button>
                <button
                  type="button"
                  onClick={() => setManualResult(null)}
                className="control-surface rounded-xl px-3 py-2 text-xs font-semibold text-slate-200"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <CenterCard label="Preparados" value={manualResult.prepared || 0} tone="emerald" />
              <CenterCard label="Erros" value={manualResult.errors || 0} tone="red" />
              <CenterCard label="Sem telefone" value={(manualResult.errorItems || []).filter((item) => item.semTelefone).length} tone="amber" />
              <CenterCard label="Sem boleto" value={(manualResult.errorItems || []).filter((item) => item.semBoleto).length} tone="amber" />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <CenterCard label="Enviados reais" value={manualResult.sendSummary?.sent || 0} tone="emerald" />
              <CenterCard label="Erros de envio" value={manualResult.sendSummary?.failed || 0} tone="red" />
              <CenterCard label="Pendentes" value={manualResult.sendSummary?.pending ?? ((manualResult.items || []).length - (manualResult.sendSummary?.sent || 0) - (manualResult.sendSummary?.failed || 0))} tone="blue" />
            </div>

            <div className="mt-5 space-y-4">
              {(manualResult.items || []).map((item, index) => (
                <div key={`${item.drive_file_id || getNumeroBoletoEfetivo(item) || index}`} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2 text-sm text-slate-200">
                      <p><span className="font-semibold text-slate-50">Cliente:</span> {getClienteEfetivo(item) || '-'}</p>
                      <p><span className="font-semibold text-slate-50">Telefone:</span> {item.telefone || '-'}</p>
                      <p><span className="font-semibold text-slate-50">Numero boleto:</span> {getNumeroBoletoEfetivo(item) || '-'}</p>
                      <p><span className="font-semibold text-slate-50">Linha digitavel:</span> {item.linha_digitavel || '-'}</p>
                      <p><span className="font-semibold text-slate-50">Codigo de barras:</span> {item.codigo_barras || '-'}</p>
                      <p><span className="font-semibold text-slate-50">Link/PDF:</span> {item.boleto_url || '-'}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(item.message || '', 'Mensagem copiada com sucesso.')}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200"
                      >
                        <Copy size={12} />
                        Copiar mensagem
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText(item.linha_digitavel || '', 'Linha digitavel copiada com sucesso.')}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200"
                      >
                        <Copy size={12} />
                        Copiar linha digitavel
                      </button>
                      <button
                        type="button"
                        disabled={!item.boleto_url || item.boleto_url === 'nao localizado'}
                        onClick={() => window.open(item.boleto_url, '_blank', 'noopener,noreferrer')}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 disabled:opacity-50"
                      >
                        <ExternalLink size={12} />
                        Abrir boleto
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <CollectionMessagePreview
                      title="IA de cobranca para envio manual"
                      context={{
                        nome: getClienteEfetivo(item),
                        valor: item.valor,
                        vencimento: item.vencimento,
                        diasAtraso: item.dias_atraso,
                        documento: item.documento,
                        telefone: item.telefone,
                        empresa: companyName,
                        linha_digitavel: item.linha_digitavel,
                        link_boleto: item.boleto_url,
                        codigo_barras: item.codigo_barras,
                      }}
                      initialMessage={item.message || ''}
                      restoreMessage={item.message || ''}
                      onMessageChange={(value) =>
                        {
                          console.log('[MENSAGEM TEMPLATE]', value);
                          setManualResult((current) =>
                            current
                              ? {
                                  ...current,
                                  items: current.items.map((currentItem, currentIndex) =>
                                    currentIndex === index ? { ...currentItem, message: value } : currentItem
                                  ),
                                }
                              : current
                          );
                        }
                      }
                      onGenerated={(result) => {
                        handleCollectionMessageGenerated(result.tone, item).catch(() => {});
                        setManualResult((current) =>
                          current
                            ? {
                                ...current,
                                items: current.items.map((currentItem, currentIndex) =>
                                  currentIndex === index ? { ...currentItem, message: result.message } : currentItem
                                ),
                              }
                            : current
                        );
                      }}
                      onSaveTemplate={saveCompanyTemplate}
                      savingTemplate={savingTemplate}
                      extraActions={(
                        <button
                          type="button"
                          disabled={sendingReal || sendingRealKeys.has(String(item?.registro_id || item?.id || item?.documento || item?.numero_boleto || ''))}
                          onClick={() => handleSendReal([item], false)}
                          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                        >
                          <Send size={13} />
                          {sendingRealKeys.has(String(item?.registro_id || item?.id || item?.documento || item?.numero_boleto || '')) ? 'Enviando...' : 'Enviar WhatsApp real'}
                        </button>
                      )}
                    />
                  </div>
                  {item.send_status === 'enviado' ? (
                    <p className="mt-3 text-xs font-medium text-emerald-700">
                      Enviado com sucesso via Z-API.
                    </p>
                  ) : null}
                  {item.send_status === 'erro' ? (
                    <p className="mt-3 text-xs font-medium text-red-700">
                      Erro no envio real: {item.send_error || item.error || 'Falha nao identificada.'}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
