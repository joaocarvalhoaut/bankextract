import { BrainCircuit, ShieldCheck, Sparkles } from 'lucide-react';

const riskTone = {
  'baixo risco': 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200',
  'medio risco': 'border-amber-500/20 bg-amber-500/10 text-amber-200',
  'alto risco': 'border-red-500/20 bg-red-500/10 text-red-200',
};

export default function OperationalAiPanel({ loading = false, insights = [], riskScore = '', tones = [] }) {
  return (
    <article className="surface-card rounded-2xl p-6 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">Central IA operacional</h3>
          <p className="mt-1 text-sm text-slate-400">
            Recomendações acionáveis para cobrança, automação e priorização de carteira.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${riskTone[riskScore] || 'border-slate-700 bg-slate-900/50 text-slate-300'}`}>
          <ShieldCheck size={12} className="mr-1 inline-block" />
          {riskScore || 'aguardando leitura'}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="skeleton h-20 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {(tones || []).map((item) => (
              <div key={item.tone} className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <Sparkles size={15} className="text-cyan-300" />
                  {item.tone}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{item.reason}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {(insights || []).map((item, index) => (
              <div key={`${item.title}-${index}`} className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <BrainCircuit size={15} className="text-cyan-300" />
                  {item.title}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.description}</p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Prioridade: {item.priority}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
