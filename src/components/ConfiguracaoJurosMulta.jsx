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
    <div className="surface-elevated rounded-xl p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-on-light text-sm font-medium">{title}</p>
            {showRealtimeBadge ? (
              <span className="badge-brand inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium">
                Atualizacao em tempo real
              </span>
            ) : null}
          </div>
          <p className="text-on-light-muted text-xs">{subtitle}</p>
          {notice ? (
            <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {notice}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-on-light-muted mb-1 block text-xs font-medium">
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
              className="input-light w-24 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-on-light-muted mb-1 block text-xs font-medium">
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
              className="input-light w-28 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={disabled}
            className="btn-brand inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={14} />
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
