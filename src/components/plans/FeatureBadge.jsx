import { CheckCircle2, XCircle } from 'lucide-react';

export default function FeatureBadge({ enabled = true, children, subtle = false }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        enabled
          ? subtle
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-emerald-100 text-emerald-800'
          : subtle
            ? 'bg-slate-800/60 text-slate-500'
            : 'bg-slate-200 text-slate-300'
      }`}
    >
      {enabled ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      <span>{children}</span>
    </div>
  );
}
