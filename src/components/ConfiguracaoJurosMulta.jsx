import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ConfiguracaoJurosMulta({
  config,
  onChange,
  disabled = false,
  notice = '',
  title = 'Juros e multa',
  subtitle = 'Esses percentuais recalculam toda a Visao Geral em tempo real.',
  showRealtimeBadge = false,
  saveLabel = 'Salvar configuracao',
}) {
  const [draft, setDraft] = useState({
    multaPercentual: Number(config?.multaPercentual ?? 2),
    jurosPercentualDia: Number(config?.jurosPercentualDia ?? 0.033),
  });

  useEffect(() => {
    setDraft({
      multaPercentual: Number(config?.multaPercentual ?? 2),
      jurosPercentualDia: Number(config?.jurosPercentualDia ?? 0.033),
    });
  }, [config?.jurosPercentualDia, config?.multaPercentual]);

  const handleFieldChange = (field, value) => {
    const nextValue = Number.parseFloat(value) || 0;
    const nextDraft = { ...draft, [field]: nextValue };
    setDraft(nextDraft);
    onChange({ [field]: nextValue });
  };

  const handleSave = () => {
    onChange({
      multaPercentual: draft.multaPercentual,
      jurosPercentualDia: draft.jurosPercentualDia,
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-slate-900">{title}</p>
            {showRealtimeBadge ? (
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                Atualizacao em tempo real
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500">{subtitle}</p>
          {notice ? (
            <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {notice}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Multa (%)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={draft.multaPercentual}
              onChange={(e) => handleFieldChange('multaPercentual', e.target.value)}
              disabled={disabled}
              className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Juros diario (%)
            </label>
            <input
              type="number"
              step="0.001"
              min="0"
              max="100"
              value={draft.jurosPercentualDia}
              onChange={(e) => handleFieldChange('jurosPercentualDia', e.target.value)}
              disabled={disabled}
              className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={14} />
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
