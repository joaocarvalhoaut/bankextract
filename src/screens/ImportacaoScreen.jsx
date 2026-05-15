import { FileImage, FileText, LoaderCircle, ScanSearch, UploadCloud, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import PlanLimitNotice from '../components/PlanLimitNotice';
import { getUsageSummary } from '../services/usageService';
import PreviewImportTable from '../components/PreviewImportTable';
import { canUserPerformAction } from '../security/permissions';

const importTypeOptions = [
  { value: 'vencidos', label: 'Vencidos', hint: 'Popula a carteira financeira da empresa ativa.' },
  { value: 'a_vencer', label: 'A vencer', hint: 'Títulos com vencimento futuro — popula a carteira ativa.' },
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
    ? 'border-emerald-200 bg-emerald-50'
    : completed
      ? 'border-blue-700/40 bg-blue-900/20'
      : 'border-slate-700 bg-slate-800/40';

  const badge = active ? 'Em andamento' : completed ? 'Concluido' : 'Aguardando';

  return (
    <div className={`rounded-2xl border px-4 py-4 transition ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              active ? 'bg-emerald-100 text-emerald-700' : completed ? 'bg-blue-100 text-blue-700' : 'bg-slate-900/60 text-slate-400'
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
    <div className="space-y-6">
      {limitNotice ? <PlanLimitNotice {...limitNotice} actionLabel="Ver planos" onAction={onOpenPlans} /> : null}
      <section className="hero-mesh overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60 p-6 shadow-lifted lg:p-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <Wand2 size={13} />
              OCR operacional
            </div>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-50 lg:text-4xl">
              Importe documentos e transforme arquivos soltos em carteira acionavel.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 lg:text-base">
              O fluxo abaixo envia o arquivo, extrai os dados por OCR, organiza a previa e grava apenas os registros
              aprovados na empresa ativa.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tipo ativo</p>
              <p className="mt-2 text-sm font-semibold text-slate-50">{selectedType.label}</p>
              <p className="mt-1 text-xs text-slate-500">{selectedType.hint}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Empresa destino</p>
              <p className="mt-2 text-sm font-semibold text-slate-50">{activeCompany?.nome || 'Selecione uma empresa'}</p>
              <p className="mt-1 text-xs text-slate-500">company_id sempre acompanha o lote importado.</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Permissao</p>
              <p className="mt-2 text-sm font-semibold text-slate-50">{canImport ? 'Liberada' : 'Restrita'}</p>
              <p className="mt-1 text-xs text-slate-500">A importacao respeita role e escopo multiempresa.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="accent-bar rounded-2xl border border-slate-700 bg-slate-900/60 p-6 shadow-soft">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
              <UploadCloud size={24} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-50">Importacao OCR de documentos</h2>
              <p className="text-sm text-slate-500">PDF, JPG, PNG e JPEG com revisao antes de gravar a carteira.</p>
            </div>
          </div>

          <div className="space-y-5">
            {!canImport ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
                        importType === item.value ? 'bg-slate-900/60 text-slate-50 shadow-soft' : 'text-slate-500'
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

            <label className="card-hover block rounded-2xl border-2 border-dashed border-slate-700 bg-slate-800/40 px-6 py-10 text-center transition hover:border-emerald-300 hover:bg-emerald-50/40">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-900/60 text-emerald-700 shadow-soft">
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
              <span className="rounded-full bg-slate-800/60 px-3 py-1 text-xs font-semibold text-slate-500">
                batch_id sera gerado na confirmacao da importacao
              </span>
            </div>
          </div>
        </div>

        <div className="accent-bar rounded-2xl border border-slate-700 bg-slate-900/60 p-6 shadow-soft">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-50">Pipeline de processamento</h3>
            <p className="text-sm text-slate-500">
              {activeCompany ? `Destino atual: ${activeCompany.nome}` : 'Selecione uma empresa para continuar.'}
            </p>
          </div>

          <div className="space-y-3">
            {stageLabels.map((stage, index) => {
              const active = processingStage === stage;
              const completed = processingFinished || stageLabels.indexOf(processingStage) > index;
              return <StageCard key={stage} stage={stage} active={active} completed={completed} />;
            })}
          </div>

          <div className="mt-5 rounded-2xl bg-slate-800/40 px-4 py-4 text-sm text-slate-500">
            A previa so aparece depois do processamento. Nesse ponto, voce pode revisar, selecionar e confirmar apenas as linhas desejadas.
          </div>
        </div>
      </section>

      {preview ? (
        <>
          {previewRows.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
  );
}
