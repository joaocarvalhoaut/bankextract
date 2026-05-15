import { CheckCircle2, XCircle } from 'lucide-react';

export default function FeatureBadge({ enabled = true, children }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        enabled
          ? 'bg-emerald-500/10 text-emerald-300'
          : 'bg-slate-800/60 text-slate-500'
      }`}
    >
      {enabled ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      <span>{children}</span>
    </div>
  );
}
