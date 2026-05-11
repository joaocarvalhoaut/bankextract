import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CheckCircle2, CircleDashed, ClipboardCheck, ExternalLink, Filter, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  getProductionChecklist,
  markProductionChecklistCompleted,
  updateProductionChecklistItem,
} from '../services/productionChecklistService';

const STATUS_META = {
  pendente: {
    label: 'Pendente',
    tone: 'border-slate-700 bg-slate-800/40 text-slate-300',
  },
  em_andamento: {
    label: 'Em andamento',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  concluido: {
    label: 'Concluido',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
};

const formatDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    : 'Nao concluido';

const summaryCards = (summary) => [
  { key: 'progress', label: 'Progresso', value: `${summary?.progress || 0}%`, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { key: 'completed', label: 'Concluidos', value: summary?.completed || 0, tone: 'text-blue-700 bg-blue-900/20 border-blue-700/40' },
  { key: 'inProgress', label: 'Em andamento', value: summary?.inProgress || 0, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
  { key: 'pending', label: 'Pendentes', value: summary?.pending || 0, tone: 'text-slate-200 bg-slate-800/40 border-slate-700' },
  { key: 'evidenceFound', label: 'Com evidencia', value: summary?.evidenceFound || 0, tone: 'text-violet-700 bg-violet-50 border-violet-200' },
];

const FILTER_OPTIONS = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'em_andamento', label: 'Em andamento' },
  { id: 'concluido', label: 'Concluidos' },
  { id: 'com_evidencia', label: 'Com evidencia' },
];

const EVIDENCE_ORIGIN_MAP = {
  test_company_created: { tab: 'billing', label: 'Planos/Billing' },
  import_tested: { tab: 'importacao', label: 'Importacao' },
  manual_charge_tested: { tab: 'central-cobranca', label: 'Central de Cobranca' },
  automation_tested: { tab: 'automacoes', label: 'Central de Cobranca' },
  usage_counters_working: { tab: 'analytics', label: 'Analytics' },
  notifications_working: { tab: 'notifications', label: 'Notificacoes' },
  audit_working: { tab: 'audit', label: 'Auditoria' },
  plans_billing_working: { tab: 'billing', label: 'Planos/Billing' },
  collection_ai_working: { tab: 'central-cobranca', label: 'Central de Cobranca' },
};

export default function ProductionChecklistScreen({ companyId, companyName, onToast, currentUserLabel = '', onOpenTab }) {
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [activeFilter, setActiveFilter] = useState('todos');
  const [checklist, setChecklist] = useState({ items: [], summary: { total: 0, completed: 0, inProgress: 0, pending: 0, progress: 0 } });
  const [drafts, setDrafts] = useState({});

  const loadChecklist = useCallback(async () => {
    if (!companyId) {
      setChecklist({ items: [], summary: { total: 0, completed: 0, inProgress: 0, pending: 0, progress: 0 } });
      setDrafts({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await getProductionChecklist(companyId);
      setChecklist(response);
      setDrafts(
        Object.fromEntries(
          (response.items || []).map((item) => [
            item.item_key,
            {
              status: item.status,
              owner_name: item.owner_name || '',
              notes: item.notes || '',
            },
          ])
        )
      );
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao carregar o checklist de producao.');
    } finally {
      setLoading(false);
    }
  }, [companyId, onToast]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  const cards = useMemo(() => summaryCards(checklist.summary), [checklist.summary]);
  const filteredItems = useMemo(() => {
    const items = checklist.items || [];
    if (activeFilter === 'pendente') {
      return items.filter((item) => item.status === 'pendente');
    }
    if (activeFilter === 'em_andamento') {
      return items.filter((item) => item.status === 'em_andamento');
    }
    if (activeFilter === 'concluido') {
      return items.filter((item) => item.status === 'concluido');
    }
    if (activeFilter === 'com_evidencia') {
      return items.filter((item) => item.evidence?.found);
    }
    return items;
  }, [activeFilter, checklist.items]);

  const updateDraft = useCallback((itemKey, partial) => {
    setDrafts((current) => ({
      ...current,
      [itemKey]: {
        ...(current[itemKey] || {}),
        ...partial,
      },
    }));
  }, []);

  const handleSave = useCallback(
    async (item) => {
      if (!companyId) {
        onToast?.('erro', 'Selecione uma empresa antes de atualizar o checklist.');
        return;
      }

      const draft = drafts[item.item_key] || {};
      setSavingKey(item.item_key);
      try {
        const response = await updateProductionChecklistItem(companyId, item.item_key, {
          status: draft.status || item.status,
          owner_name: draft.owner_name ?? item.owner_name,
          notes: draft.notes ?? item.notes,
          completed_at:
            (draft.status || item.status) === 'concluido'
              ? item.completed_at || new Date().toISOString()
              : null,
        });
        setChecklist(response);
        setDrafts(
          Object.fromEntries(
            (response.items || []).map((nextItem) => [
              nextItem.item_key,
              {
                status: nextItem.status,
                owner_name: nextItem.owner_name || '',
                notes: nextItem.notes || '',
              },
            ])
          )
        );
        onToast?.('sucesso', 'Checklist atualizado com sucesso.');
      } catch (error) {
        onToast?.('erro', error.message || 'Falha ao salvar item do checklist.');
      } finally {
        setSavingKey('');
      }
    },
    [companyId, drafts, onToast]
  );

  const handleMarkComplete = useCallback(
    async (item) => {
      if (!companyId) {
        onToast?.('erro', 'Selecione uma empresa antes de marcar o checklist.');
        return;
      }

      const draft = drafts[item.item_key] || {};
      setSavingKey(item.item_key);
      try {
        const response = await markProductionChecklistCompleted(
          companyId,
          item.item_key,
          draft.owner_name || item.owner_name || currentUserLabel
        );
        setChecklist(response);
        setDrafts(
          Object.fromEntries(
            (response.items || []).map((nextItem) => [
              nextItem.item_key,
              {
                status: nextItem.status,
                owner_name: nextItem.owner_name || '',
                notes: nextItem.notes || '',
              },
            ])
          )
        );
        onToast?.('sucesso', 'Item marcado como concluido.');
      } catch (error) {
        onToast?.('erro', error.message || 'Falha ao marcar item como concluido.');
      } finally {
        setSavingKey('');
      }
    },
    [companyId, currentUserLabel, drafts, onToast]
  );

  const handleMarkWithEvidence = useCallback(
    async (item) => {
      if (!companyId || !item?.evidence?.found) {
        onToast?.('erro', 'Nenhuma evidencia disponivel para este item.');
        return;
      }

      const draft = drafts[item.item_key] || {};
      const evidenceText = `Evidencia: ${item.evidence.summary}`;
      const currentNotes = String(draft.notes || item.notes || '').trim();
      const mergedNotes = currentNotes.includes(evidenceText)
        ? currentNotes
        : currentNotes
          ? `${currentNotes}\n${evidenceText}`
          : evidenceText;

      setSavingKey(item.item_key);
      try {
        const response = await updateProductionChecklistItem(companyId, item.item_key, {
          status: 'concluido',
          owner_name: draft.owner_name || item.owner_name || currentUserLabel,
          notes: mergedNotes,
          completed_at: new Date().toISOString(),
        });
        setChecklist(response);
        setDrafts(
          Object.fromEntries(
            (response.items || []).map((nextItem) => [
              nextItem.item_key,
              {
                status: nextItem.status,
                owner_name: nextItem.owner_name || '',
                notes: nextItem.notes || '',
              },
            ])
          )
        );
        onToast?.('sucesso', 'Item concluido com base na evidencia encontrada.');
      } catch (error) {
        onToast?.('erro', error.message || 'Falha ao marcar item com evidencia.');
      } finally {
        setSavingKey('');
      }
    },
    [companyId, currentUserLabel, drafts, onToast]
  );

  const handleOpenEvidenceOrigin = useCallback(
    (item) => {
      const origin = EVIDENCE_ORIGIN_MAP[item?.item_key];
      if (!origin?.tab) {
        onToast?.('aviso', 'Origem da evidencia ainda nao configurada para este item.');
        return;
      }
      onOpenTab?.(origin.tab);
    },
    [onOpenTab, onToast]
  );

  if (!companyId) {
    return (
      <div className="rounded-[32px] border border-dashed border-slate-700 bg-slate-900/60 p-12 text-center shadow-soft">
        <ClipboardCheck className="mx-auto mb-4 text-slate-300" size={30} />
        <h2 className="text-xl font-semibold text-slate-50">Selecione uma empresa para validar o piloto</h2>
        <p className="mt-2 text-sm text-slate-500">
          O checklist de producao e persistido por empresa para garantir que o ambiente esta pronto para cliente piloto.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="hero-mesh overflow-hidden rounded-[32px] border border-slate-700/50 bg-slate-900/70 px-6 py-7 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <ShieldCheck size={14} />
              Piloto e producao assistida
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-50">Checklist de prontidao para cliente piloto</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Valide migracoes, fluxo operacional, billing interno, notificacoes e auditoria antes de liberar o NC Finance para {companyName || 'a empresa ativa'}.
            </p>
          </div>

          <button
            type="button"
            onClick={loadChecklist}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Atualizar checklist
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <article key={card.key} className={`rounded-[26px] border p-5 shadow-soft ${card.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">{card.label}</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[30px] border border-slate-700 bg-slate-900/60 p-6 shadow-soft">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-50">Itens de validacao</h3>
            <p className="text-sm text-slate-500">Cada item pode ser salvo em andamento e fechado quando o teste estiver concluido.</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-300">
            {filteredItems.length} de {checklist.summary.total || 0} itens
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Filter size={13} />
            Filtros
          </div>
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setActiveFilter(option.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeFilter === option.id
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                  : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/40'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-[24px] border border-slate-700 p-5">
                <div className="skeleton h-5 w-56 rounded-full" />
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="skeleton h-12 rounded-2xl" />
                  <div className="skeleton h-12 rounded-2xl" />
                  <div className="skeleton h-12 rounded-2xl" />
                </div>
                <div className="mt-3 skeleton h-24 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const draft = drafts[item.item_key] || {
                status: item.status,
                owner_name: item.owner_name || '',
                notes: item.notes || '',
              };
              const statusMeta = STATUS_META[draft.status] || STATUS_META.pendente;
              const isSaving = savingKey === item.item_key;
              const hasEvidence = Boolean(item.evidence?.found);

              return (
                <article key={item.item_key} className="rounded-[26px] border border-slate-700 bg-slate-800/40 p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-semibold text-slate-50">{item.title}</h4>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusMeta.tone}`}>
                          {statusMeta.label}
                        </span>
                        <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {item.category}
                        </span>
                        {hasEvidence ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                            <BadgeCheck size={12} />
                            Evidencia encontrada
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Conclusao: {formatDateTime(item.completed_at)}</p>
                      {hasEvidence ? (
                        <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-violet-800">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>{item.evidence.summary}</span>
                            {EVIDENCE_ORIGIN_MAP[item.item_key] ? (
                              <button
                                type="button"
                                onClick={() => handleOpenEvidenceOrigin(item)}
                                className="inline-flex items-center gap-2 self-start rounded-xl border border-violet-200 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                              >
                                <ExternalLink size={13} />
                                Abrir origem
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSave(item)}
                        disabled={isSaving}
                        className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-60"
                      >
                        {isSaving ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkComplete(item)}
                        disabled={isSaving || draft.status === 'concluido'}
                        className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {isSaving ? <LoaderCircle size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        Marcar concluido
                      </button>
                      {hasEvidence ? (
                        <button
                          type="button"
                          onClick={() => handleMarkWithEvidence(item)}
                          disabled={isSaving || draft.status === 'concluido'}
                          className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60"
                        >
                          <BadgeCheck size={15} />
                          Marcar concluido com evidencia
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</span>
                      <select
                        value={draft.status || 'pendente'}
                        onChange={(event) => updateDraft(item.item_key, { status: event.target.value })}
                        className="w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-200 outline-none ring-emerald-500 focus:ring-2"
                      >
                        <option value="pendente">Pendente</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="concluido">Concluido</option>
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Responsavel</span>
                      <input
                        type="text"
                        value={draft.owner_name || ''}
                        onChange={(event) => updateDraft(item.item_key, { owner_name: event.target.value })}
                        placeholder="Nome ou e-mail do responsavel"
                        className="w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-200 outline-none ring-emerald-500 placeholder:text-slate-400 focus:ring-2"
                      />
                    </label>

                    <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Conclusao</p>
                      <p className="mt-2 text-sm font-medium text-slate-200">{formatDateTime(item.completed_at)}</p>
                    </div>
                  </div>

                  <label className="mt-3 block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Observacao</span>
                    <textarea
                      rows={3}
                      value={draft.notes || ''}
                      onChange={(event) => updateDraft(item.item_key, { notes: event.target.value })}
                      placeholder="Anote evidencias, bloqueios ou links internos deste teste."
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-200 outline-none ring-emerald-500 placeholder:text-slate-400 focus:ring-2"
                    />
                  </label>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {!loading && filteredItems.length === 0 ? (
        <section className="rounded-[30px] border border-dashed border-slate-700 bg-slate-900/60 p-12 text-center shadow-soft">
          <CircleDashed className="mx-auto mb-4 text-slate-300" size={30} />
          <h3 className="text-lg font-semibold text-slate-50">Nenhum item encontrado</h3>
          <p className="mt-2 text-sm text-slate-500">
            Ajuste o filtro atual ou aguarde novas evidencias e atualizacoes do checklist.
          </p>
        </section>
      ) : null}
    </div>
  );
}
