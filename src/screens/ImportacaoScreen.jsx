import { FileImage, FileText, LoaderCircle, ScanSearch, UploadCloud, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import PlanLimitNotice from '../components/PlanLimitNotice';
import { PageShell, ScreenHeader } from '../components/ui/layout';
import { OperationalMetric, OperationalPanel, OperationalStatusPill } from '../components/ui/operational';
import { getUsageSummary } from '../services/usageService';
import PreviewImportTable from '../components/PreviewImportTable';
import { canUserPerformAction } from '../security/permissions';

const importTypeOptions = [
  { value: 'vencidos', label: 'Vencidos', hint: 'Popula a carteira financeira da empresa ativa.' },
  { value: 'liquidacao', label: 'Liquidacao', hint: 'Marca registros como liquidados sem apagar historico.' },
];

const stageLabels = [
  'Enviando arquivo',
  'Executando OCR',
  'Estruturando dados',
  'Validando registros',
];

function StageCard({ stage, active, completed }) {
  const tone = active
    ? 'border-emerald-500/30 bg-emerald-950/20'
    : completed
      ? 'border-blue-700/30 bg-blue-950/20'
      : 'border-slate-700 bg-slate-900/60';

  const badge = active ? 'Em andamento' : completed ? 'Concluido' : 'Aguardando';

  return (
    <div className={`rounded-2xl border px-4 py-4 transition ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              active ? 'bg-emerald-500/15 text-emerald-300' : completed ? 'bg-blue-500/15 text-blue-300' : 'bg-slate-950 text-slate-400'
            }`}
          >
            {active ? <LoaderCircle size={16} className="animate-spin" /> : <ScanSearch size={16} />}
          </div>
          <p className="text-sm font-semibold text-slate-50">{stage}</p>
        </div>
        <span className="rounded-full bg-slate-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {badge}
        </span>
      </div>
    </div>
  );
}

export default function ImportacaoScreen({
  companies,
  activeCompanyId,
  setActiveCompanyId,
  importType,
  setImportType,
  selectedFile,
  onFileSelect,
  onProcess,
  processingStage,
  processing,
  preview,
  onTogglePreviewRow,
  onToggleAllPreviewRows,
  onUpdatePreviewField,
  onDiscardPreview,
  onImportSelected,
  userRole = 'operador',
  onOpenPlans,
}) {
  const canImport = canUserPerformAction(userRole, 'import_files');
  const activeCompany = companies.find((item) => item.id === activeCompanyId);
  const selectedType = importTypeOptions.find((item) => item.value === importType) || importTypeOptions[0];
  const [limitNotice, setLimitNotice] = useState(null);
  const previewRows = Array.isArray(preview?.rows) ? preview.rows : [];
  const processingFinished = Boolean(preview) && !processing;

  useEffect(() => {
    let alive = true;

    const loadUsage = async () => {
      if (!activeCompanyId) {
        if (alive) setLimitNotice(null);
        return;
      }

      try {
        const summary = await getUsageSummary(activeCompanyId);
        const metric = summary?.metrics?.imports_month;

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
  }, [activeCompanyId]);

  return (
    <PageShell>
      <ScreenHeader
        breadcrumb={['Operacao', 'Importacao']}
        title="Importacao OCR operacional"
        description="Envie o arquivo, revise a previa e grave apenas os registros aprovados na empresa ativa."
        status={
          <>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200">
              <Wand2 size={12} />
              OCR operacional
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200">
              {canImport ? 'Permissao liberada' : 'Permissao restrita'}
            </span>
          </>
        }
      />

      <div className="space-y-6">
      {limitNotice ? <PlanLimitNotice {...limitNotice} actionLabel="Ver planos" onAction={onOpenPlans} /> : null}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <OperationalMetric label="Tipo ativo" value={selectedType.label} hint={selectedType.hint} tone="info" />
        <OperationalMetric label="Empresa destino" value={activeCompany?.nome || 'Selecione uma empresa'} hint="company_id acompanha o lote" tone="processing" />
        <OperationalMetric label="Permissao" value={canImport ? 'Liberada' : 'Restrita'} hint="Importacao respeita role e escopo" tone={canImport ? 'success' : 'warning'} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <OperationalPanel title="Importacao OCR de documentos" subtitle="PDF, JPG, PNG e JPEG com revisao antes de gravar a carteira.">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-emerald-300">
              <UploadCloud size={24} />
            </div>
            <OperationalStatusPill tone="processing">Pipeline OCR</OperationalStatusPill>
          </div>

          <div className="space-y-5">
            {!canImport ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Seu perfil atual nao pode processar importacoes nesta empresa. Solicite permissao de operador,
                financeiro, admin ou owner.
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Tipo de importacao
                </span>
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-800/60 p-1">
                  {importTypeOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setImportType(item.value)}
                      className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                        importType === item.value
                          ? 'border border-slate-700 bg-slate-950 text-slate-50'
                          : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Empresa ativa
                </span>
                <select
                  value={activeCompanyId}
                  onChange={(event) => setActiveCompanyId(event.target.value)}
                  className="input-premium w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
                >
                  {!activeCompanyId ? <option value="">Selecione a empresa</option> : null}
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950/60 px-6 py-10 text-center transition hover:border-emerald-500/50 hover:bg-slate-900/70">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-emerald-300">
                {selectedFile?.type?.includes('image') ? <FileImage size={28} /> : <FileText size={28} />}
              </div>
              <p className="text-lg font-semibold text-slate-50">
                {selectedFile ? selectedFile.name : 'Arraste um arquivo ou clique para selecionar'}
              </p>
              <p className="mt-2 text-sm text-slate-500">Aceita PDF, PNG, JPG e JPEG.</p>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(event) => onFileSelect(event.target.files?.[0] || null)}
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onProcess}
                disabled={processing || !canImport}
                title={!canImport ? 'Sem permissao para importar' : undefined}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {processing ? <LoaderCircle size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                Processar dados
              </button>
              <span className="rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1 text-xs font-semibold text-slate-400">
                batch_id sera gerado na confirmacao da importacao
              </span>
            </div>
          </div>
        </OperationalPanel>

        <OperationalPanel title="Pipeline de processamento" subtitle={activeCompany ? `Destino atual: ${activeCompany.nome}` : 'Selecione uma empresa para continuar.'}>

          <div className="space-y-3">
            {stageLabels.map((stage, index) => {
              const active = processingStage === stage;
              const completed = processingFinished || stageLabels.indexOf(processingStage) > index;
              return <StageCard key={stage} stage={stage} active={active} completed={completed} />;
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm text-slate-400">
            A previa so aparece depois do processamento. Nesse ponto, voce pode revisar, selecionar e confirmar apenas as linhas desejadas.
          </div>
        </OperationalPanel>
      </section>

      {preview ? (
        <>
          {previewRows.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Nenhum registro foi encontrado no arquivo. Verifique se o PDF possui texto legivel ou tente outro arquivo.
            </div>
          ) : null}
          <PreviewImportTable
            rows={previewRows}
            onToggleRow={onTogglePreviewRow}
            onToggleAll={onToggleAllPreviewRows}
            onFieldChange={onUpdatePreviewField}
            onDiscard={onDiscardPreview}
            onImport={onImportSelected}
          />
        </>
      ) : null}
      </div>
    </PageShell>
  );
}
