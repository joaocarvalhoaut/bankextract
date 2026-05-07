import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  PlayCircle,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';
import CollectionMessagePreview from '../components/CollectionMessagePreview';
import {
  getRealSendChecklist,
  simulateChargeBatch,
} from '../services/billingAutomationService';
import { createAuditEvent } from '../services/auditTimelineService';
import { createNotification } from '../services/notificationService';
import { getCollectionToneMeta } from '../services/collectionMessageService';
import { incrementUsage } from '../services/usageService';

function ChecklistCard({ label, value, tone = 'slate' }) {
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

function sectionTone(status, blocked) {
  if (blocked) return 'border-slate-200 bg-slate-50 text-slate-600';
  return status ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800';
}

function statusLabel(value) {
  if (value === 'pronto_para_ativar') return 'Pronto para ativar';
  if (value === 'quase_pronto') return 'Quase pronto';
  return 'Nao pronto';
}

function statusTone(value) {
  if (value === 'pronto_para_ativar') return 'emerald';
  if (value === 'quase_pronto') return 'amber';
  return 'red';
}

function toCsvValue(value) {
  const safe = String(value ?? '').replace(/"/g, '""');
  return `"${safe}"`;
}

export default function ChecklistEnvioRealScreen({
  companyId,
  activeCompanyId,
  activeCompany,
  selectedCompany,
  company,
  companyName,
  globalMode,
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
  const [simulating, setSimulating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState(null);
  const [checklistAiMessage, setChecklistAiMessage] = useState('');

  const loadChecklist = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      setData(null);
      return;
    }

    setLoading(true);
    try {
      const response = await getRealSendChecklist(resolvedCompanyId);
      setData(response);
    } catch (error) {
      setData(null);
      onToast?.('erro', error.message || 'Falha ao carregar o checklist pre-envio.');
    } finally {
      setLoading(false);
    }
  }, [globalMode, onToast, resolvedCompanyId]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  const groupedChecklist = useMemo(() => {
    const entries = Array.isArray(data?.checklist) ? data.checklist : [];
    return entries.reduce((acc, item) => {
      const key = item.section || 'Geral';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [data?.checklist]);

  const cards = data?.cards || {
    status_geral: 'nao_pronto',
    titulos_monitorados: 0,
    telefones_validos: '0/0',
    boletos_encontrados: '0/0',
    simulacoes_sucesso: 0,
    erros: 0,
    inconsistencias_criticas: 0,
    zapi: 'Pendente / bloqueado',
  };

  const handleSimulateBatch = useCallback(async () => {
    if (!resolvedCompanyId || globalMode) {
      onToast?.('erro', 'Selecione uma empresa especifica para rodar a simulacao geral.');
      return;
    }

    setSimulating(true);
    try {
      const result = await simulateChargeBatch(resolvedCompanyId, 10);
      await incrementUsage(resolvedCompanyId, 'automations_month', 1);
      await createAuditEvent(resolvedCompanyId, {
        action: 'automation_simulated',
        entity_type: 'automacoes_cobranca',
        title: 'Simulacao geral executada',
        description: `A simulacao geral processou ${result?.simulated || 0} item(ns).`,
        metadata: {
          simulated: result?.simulated || 0,
        },
        severity: 'info',
      });
      try {
        await createNotification(resolvedCompanyId, {
          type: 'automation_executed',
          title: 'Simulacao de automacao concluida',
          message: `A simulacao geral de cobranca processou ${result?.simulated || 0} item(ns).`,
          severity: 'success',
          metadata: {
            simulated: result?.simulated || 0,
          },
        });
      } catch {
        // Mantem a simulacao principal mesmo se a notificacao falhar.
      }
      await loadChecklist();
      onToast?.('sucesso', `Simulacao geral concluida: ${result?.simulated || 0} item(ns) simulados.`);
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao rodar a simulacao geral.');
    } finally {
      setSimulating(false);
    }
  }, [globalMode, loadChecklist, onToast, resolvedCompanyId]);

  const handleExportCsv = useCallback(() => {
    setExporting(true);
    try {
      const checklistRows = Array.isArray(data?.checklist) ? data.checklist : [];
      const header = 'Secao;Item;Status;Detalhe;Obrigatorio';
      const lines = checklistRows.map((item) =>
        [
          toCsvValue(item.section || ''),
          toCsvValue(item.item || ''),
          toCsvValue(item.blocked ? 'Pendente / bloqueado' : item.status ? 'OK' : 'Pendente'),
          toCsvValue(item.detail || ''),
          toCsvValue(item.obrigatorio ? 'Sim' : 'Não'),
        ].join(';')
      );
      const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'checklist_pre_envio_bankextract.csv';
      anchor.click();
      URL.revokeObjectURL(url);
      onToast?.('sucesso', 'Checklist exportado com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao exportar o checklist.');
    } finally {
      setExporting(false);
    }
  }, [data?.checklist, onToast]);

  const handleChecklistAiGenerated = useCallback(
    async (result) => {
      const toneMeta = getCollectionToneMeta(result.tone);
      setChecklistAiMessage(result.message);
      await createAuditEvent(resolvedCompanyId, {
        action: 'collection_ai_generated',
        entity_type: 'checklist_envio',
        title: 'Mensagem inteligente gerada',
        description: `IA local gerou uma mensagem com tom ${toneMeta.label.toLowerCase()} para simulacao operacional.`,
        metadata: {
          tone: result.tone,
          tone_label: toneMeta.label,
        },
        severity: toneMeta.severity === 'danger' ? 'danger' : toneMeta.severity === 'warning' ? 'warning' : 'info',
      });

      if (result.tone === 'firme' || result.tone === 'juridico') {
        await createNotification(resolvedCompanyId, {
          type: 'collection_ai_tone',
          title: `Tom ${toneMeta.label} usado no checklist`,
          message: `Uma mensagem de cobranca foi gerada no checklist com tom ${toneMeta.label.toLowerCase()}.`,
          severity: result.tone === 'juridico' ? 'danger' : 'warning',
          metadata: {
            tone: result.tone,
          },
        });
      }
    },
    [resolvedCompanyId]
  );

  if (globalMode || !resolvedCompanyId) {
    return (
      <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-soft">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5" size={18} />
          <div>
            <p className="font-semibold">Selecione uma empresa especifica</p>
            <p className="mt-1 text-xs text-amber-700">
              O checklist pre-envio funciona por empresa para manter isolamento por company_id.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <Activity size={13} />
              Pronto para envio
            </div>
            <h3 className="mt-4 text-2xl font-semibold text-slate-950">Checklist pre-envio real</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Esta empresa esta pronta ou nao para ativar envio real no futuro, mantendo a simulacao como caminho principal hoje.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadChecklist}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
              Atualizar checklist
            </button>
            <button
              type="button"
              onClick={handleSimulateBatch}
              disabled={simulating}
              className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-soft transition hover:bg-blue-100 disabled:opacity-50"
            >
              {simulating ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
              Rodar nova simulacao geral
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-50"
            >
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
              Exportar checklist CSV
            </button>
            <button
              type="button"
              onClick={() => onToast?.('aviso', 'Envio real bloqueado. Configure e valide a Z-API antes de ativar.')}
              className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 shadow-soft transition hover:bg-red-100"
            >
              <AlertCircle size={15} />
              Ativar envio real
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ChecklistCard label="Status geral" value={statusLabel(cards.status_geral)} tone={statusTone(cards.status_geral)} />
        <ChecklistCard label="Titulos monitorados" value={cards.titulos_monitorados || 0} tone="slate" />
        <ChecklistCard label="Telefones validos" value={cards.telefones_validos || '0/0'} tone="blue" />
        <ChecklistCard label="Boletos encontrados" value={cards.boletos_encontrados || '0/0'} tone="blue" />
        <ChecklistCard label="Simulacoes sucesso" value={cards.simulacoes_sucesso || 0} tone="emerald" />
        <ChecklistCard label="Erros" value={cards.erros || 0} tone="red" />
        <ChecklistCard label="Inconsistencias criticas" value={cards.inconsistencias_criticas || 0} tone="amber" />
        <ChecklistCard label="Z-API" value={cards.zapi || 'Pendente / bloqueado'} tone="amber" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="space-y-6">
          {Object.entries(groupedChecklist).map(([section, items]) => (
            <article key={section} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{section}</p>
                  <h4 className="mt-1 text-xl font-semibold text-slate-950">Checklist de {section.toLowerCase()}</h4>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  {items.filter((item) => item.status).length}/{items.length} ok
                </div>
              </div>
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={`${section}-${item.item}`} className={`rounded-[22px] border px-4 py-4 ${sectionTone(item.status, item.blocked)}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-start gap-3">
                        {item.blocked ? (
                          <ShieldAlert className="mt-0.5 shrink-0" size={18} />
                        ) : item.status ? (
                          <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                        ) : (
                          <AlertCircle className="mt-0.5 shrink-0" size={18} />
                        )}
                        <div>
                          <p className="font-semibold">{item.item}</p>
                          <p className="mt-1 text-sm opacity-90">{item.detail}</p>
                        </div>
                      </div>
                      <div className="rounded-full border border-current/10 bg-white/60 px-3 py-1 text-xs font-semibold">
                        {item.blocked ? 'Pendente / bloqueado' : item.status ? 'Aprovado' : 'Pendente'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status geral</p>
            <h4 className="mt-2 text-2xl font-semibold text-slate-950">{statusLabel(data?.status_geral)}</h4>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              O checklist avalia configuracao, qualidade de dados, operacao da simulacao e bloqueios de integracao real antes de qualquer ativacao futura.
            </p>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recomendacoes</p>
            <div className="mt-4 space-y-3">
              {(data?.recommendations || []).length ? (
                data.recommendations.map((recommendation, index) => (
                  <div key={`${recommendation}-${index}`} className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {recommendation}
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Nenhuma recomendacao critica no momento. Continue usando simulacao ate a etapa real de integracao.
                </div>
              )}
            </div>
          </section>

          <CollectionMessagePreview
            title="IA de cobranca para simulacao operacional"
            context={{
              nome: companyName || 'Cliente Exemplo',
              valor: cards.titulos_monitorados ? 2500 : 0,
              vencimento: new Date().toISOString().slice(0, 10),
              diasAtraso: Number(cards.inconsistencias_criticas || 0) > 0 ? 10 : 2,
              documento: `CHECKLIST-${resolvedCompanyId}`,
              telefone: 'nao localizado',
              empresa: companyName || 'Empresa Exemplo',
              linha_digitavel: 'nao localizado',
              link_boleto: 'nao localizado',
              codigo_barras: 'nao localizado',
              historico: (data?.recommendations || []).slice(0, 2).join('; '),
            }}
            initialMessage={checklistAiMessage}
            restoreMessage={checklistAiMessage}
            onMessageChange={setChecklistAiMessage}
            onGenerated={(result) => {
              handleChecklistAiGenerated(result).catch(() => {});
            }}
          />
        </div>
      </section>
    </div>
  );
}
