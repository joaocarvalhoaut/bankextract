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
  prepareManualCharge,
  previewChargePayload,
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
    slate: 'from-slate-400 to-slate-500 text-slate-950',
    emerald: 'from-emerald-400 to-emerald-600 text-emerald-700',
    blue: 'from-blue-400 to-blue-600 text-blue-700',
    amber: 'from-amber-400 to-orange-400 text-amber-700',
    red: 'from-red-400 to-red-600 text-red-700',
  };

  return (
    <article className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${palette[tone]?.split(' text-')[0] || 'from-slate-400 to-slate-500'} opacity-80`} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${palette[tone]?.split(' ').pop() || 'text-slate-950'}`}>{value}</p>
    </article>
  );
}

const toneByStatus = {
  pendente: 'bg-slate-100 text-slate-700 ring-slate-200',
  pago: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  negociado: 'bg-blue-50 text-blue-700 ring-blue-200',
  suspenso: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const boletoStatusTone = {
  encontrado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  baixa_confianca: 'bg-amber-50 text-amber-700 ring-amber-200',
  pendente: 'bg-slate-100 text-slate-700 ring-slate-200',
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

  const handlePrepareSelected = useCallback(async () => {
    const selectedIds = Array.from(selectedRows).slice(0, 20);
    if (!selectedIds.length) {
      onToast?.('erro', 'Selecione ao menos um titulo para preparar o lote.');
      return;
    }

    setRunningAction('prepare-selected');
    try {
      const preparedItems = [];
      const errorsList = [];
      for (const rowId of selectedIds) {
        try {
          const result = await prepareManualCharge(resolvedCompanyId, rowId);
          preparedItems.push({
            ...result.payload,
            cliente: getClienteEfetivo(result.payload) || result.payload?.cliente || '',
            numero_boleto: getNumeroBoletoEfetivo(result.payload) || result.payload?.numero_boleto || '',
            message: result.manual_message,
          });
        } catch (error) {
          const row = rows.find((item) => item.id === rowId);
          errorsList.push({
            id: rowId,
            cliente: row?.cliente_nome || 'Cliente',
            error: error.message || 'Falha ao preparar envio manual.',
            semTelefone: !row?.telefone,
            semBoleto: !row?.boleto_url && !row?.drive_file_id,
          });
        }
      }

      setManualResult({
        type: 'batch',
        items: preparedItems,
        prepared: preparedItems.length,
        errors: errorsList.length,
        errorItems: errorsList,
        warning: 'Envio real nao realizado. Copie as mensagens e envie manualmente pelo WhatsApp.',
      });
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
            className="h-4 w-4 rounded border-slate-300"
          />
        ),
        render: (row) => (
          <input
            type="checkbox"
            checked={selectedRows.has(row.id)}
            onChange={() => toggleRowSelection(row.id)}
            className="h-4 w-4 rounded border-slate-300"
          />
        ),
      },
      {
        key: 'cliente_nome',
        label: 'Cliente',
        render: (row) => <span className="font-medium text-slate-900">{getClienteEfetivo(row) || row.cliente_nome}</span>,
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
        render: (row) => <span className="font-semibold text-slate-900">{formatCurrencyBRL(row.valor)}</span>,
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
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${toneByStatus[row.status || 'pendente'] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
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
                : 'bg-slate-100 text-slate-700 ring-slate-200';
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
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
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
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <ExternalLink size={12} />
              Abrir boleto
            </button>
            <div className="relative" data-row-action-menu>
              <button
                type="button"
                onClick={() => setOpenMenuRowId((current) => (current === row.id ? null : row.id))}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <MoreHorizontal size={12} />
                Mais acoes
                <ChevronDown size={12} />
              </button>
              {openMenuRowId === row.id ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-[9999] min-w-[220px] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
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
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
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
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
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
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
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
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
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
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
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
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
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
    <div className="space-y-6">
      {limitNotice ? <PlanLimitNotice {...limitNotice} /> : null}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <Receipt size={13} />
              Central de cobranca
            </div>
            <h3 className="mt-4 text-2xl font-semibold text-slate-950">Operacao da regua por titulo</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Visao consolidada da carteira da empresa <span className="font-semibold text-slate-900">{companyName}</span> com etapa da regua, boleto encontrado e ultimas simulacoes.
            </p>
          </div>
          <button
            type="button"
            onClick={loadCenter}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            Atualizar central
          </button>
          <button
            type="button"
            onClick={() => onToast?.('aviso', 'Selecione um titulo para preparar manualmente ou use a acao por linha.')}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-soft transition hover:bg-slate-100"
          >
            <Send size={15} />
            Preparar cobranca
          </button>
          <button
            type="button"
            onClick={handlePrepareSelected}
            disabled={!selectedRows.size || Boolean(runningAction)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-soft transition hover:bg-slate-100 disabled:opacity-50"
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
        <section className="rounded-[28px] border border-blue-200 bg-blue-50/70 p-6 shadow-soft">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 text-blue-700" size={18} />
            <div className="w-full">
              <p className="text-sm font-semibold text-blue-900">Ultima simulacao</p>
              <p className="mt-1 text-xs text-blue-700">
                Arquivo encontrado: {simulationResult.arquivo_encontrado ? 'sim' : 'nao'}.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-2xl border border-blue-100 bg-white p-4 text-xs leading-relaxed text-slate-700">
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
                    setSimulationResult((current) => (current ? { ...current, mensagem_gerada: value } : current))
                  }
                  onGenerated={(result) => {
                    handleCollectionMessageGenerated(result.tone, simulationResult.payload).catch(() => {});
                    setSimulationResult((current) => (current ? { ...current, mensagem_gerada: result.message } : current));
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="Nenhum titulo monitorado nesta empresa."
          emptyDescription="Assim que houver registros sincronizados, a central mostrara a etapa da regua e o status do boleto."
        />
      </section>

      {previewResult ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-emerald-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-900">Previa do envio</p>
                <p className="mt-1 text-xs text-emerald-700">Simulacao - nao enviado.</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewResult(null)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
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
                  setPreviewResult((current) => (current ? { ...current, message: value } : current))
                }
                onGenerated={(result) => {
                  handleCollectionMessageGenerated(result.tone, previewResult.payload).catch(() => {});
                  setPreviewResult((current) => (current ? { ...current, message: result.message } : current));
                }}
              />

              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <p><span className="font-semibold text-slate-900">Numero boleto:</span> {getNumeroBoletoEfetivo(previewResult.payload) || '-'}</p>
                <p className="mt-2"><span className="font-semibold text-slate-900">Linha digitavel:</span> {previewResult.payload?.linha_digitavel || '-'}</p>
                <p className="mt-2"><span className="font-semibold text-slate-900">Codigo barras:</span> {previewResult.payload?.codigo_barras || '-'}</p>
                <p className="mt-2"><span className="font-semibold text-slate-900">Link boleto:</span> {previewResult.payload?.boleto_url || '-'}</p>
                <p className="mt-2"><span className="font-semibold text-slate-900">PDF:</span> {previewResult.payload?.drive_file_id || '-'}</p>
                <p className="mt-2"><span className="font-semibold text-slate-900">Status:</span> Simulacao - nao enviado</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {manualResult ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-[28px] border border-emerald-200 bg-white p-6 shadow-2xl">
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
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    Baixar CSV
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setManualResult(null)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
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

            <div className="mt-5 space-y-4">
              {(manualResult.items || []).map((item, index) => (
                <div key={`${item.drive_file_id || getNumeroBoletoEfetivo(item) || index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-900">Cliente:</span> {getClienteEfetivo(item) || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Telefone:</span> {item.telefone || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Numero boleto:</span> {getNumeroBoletoEfetivo(item) || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Linha digitavel:</span> {item.linha_digitavel || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Codigo de barras:</span> {item.codigo_barras || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Link/PDF:</span> {item.boleto_url || '-'}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(item.message || '', 'Mensagem copiada com sucesso.')}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                      >
                        <Copy size={12} />
                        Copiar mensagem
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText(item.linha_digitavel || '', 'Linha digitavel copiada com sucesso.')}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                      >
                        <Copy size={12} />
                        Copiar linha digitavel
                      </button>
                      <button
                        type="button"
                        disabled={!item.boleto_url || item.boleto_url === 'nao localizado'}
                        onClick={() => window.open(item.boleto_url, '_blank', 'noopener,noreferrer')}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
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
                        setManualResult((current) =>
                          current
                            ? {
                                ...current,
                                items: current.items.map((currentItem, currentIndex) =>
                                  currentIndex === index ? { ...currentItem, message: value } : currentItem
                                ),
                              }
                            : current
                        )
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
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
