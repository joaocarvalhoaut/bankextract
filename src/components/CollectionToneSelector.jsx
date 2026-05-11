import { getCollectionToneOptions } from '../services/collectionMessageService';

const toneClasses = {
  amigavel: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  neutro: 'border-slate-700 bg-slate-800/40 text-slate-200',
  firme: 'border-amber-200 bg-amber-50 text-amber-700',
  juridico: 'border-red-200 bg-red-50 text-red-700',
};

export default function CollectionToneSelector({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {getCollectionToneOptions().map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange?.(option.value)}
            className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
              active
                ? toneClasses[option.value]
                : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/40'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

