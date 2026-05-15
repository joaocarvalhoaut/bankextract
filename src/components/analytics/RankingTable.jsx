/**
 * RankingTable — Tabela de ranking configurável (devedores, templates, estratégias).
 */
function fmtBRL(v) {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(0)}k`;
  return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
}

function RankBadge({ rank }) {
  const colors = ['text-yellow-400', 'text-slate-300', 'text-amber-700'];
  const medals = ['🥇', '🥈', '🥉'];
  if (rank < 3) return <span className={`text-base ${colors[rank]}`}>{medals[rank]}</span>;
  return <span className="text-slate-500 text-sm font-mono">{rank + 1}</span>;
}

function BarCell({ value, max, color = '#3B82F6' }) {
  const pct = Math.max((value / Math.max(max, 1)) * 100, 2);
  return (
    <div className="relative h-1.5 rounded-full bg-slate-700/50 overflow-hidden w-20">
      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function DebtorRanking({ debtors = [], loading = false }) {
  const maxVal = Math.max(...debtors.map(d => d.value || 0), 1);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-slate-700/30 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!debtors.length) return <div className="text-slate-500 text-sm text-center py-4">Sem inadimplentes.</div>;

  return (
    <div className="space-y-1.5">
      {debtors.map((d, i) => (
        <div key={d.id || i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/40 transition-colors">
          <div className="w-6 text-center shrink-0"><RankBadge rank={i} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{d.name}</div>
            <BarCell value={d.value} max={maxVal} color="#EF4444" />
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-red-400">{fmtBRL(d.value)}</div>
            {d.daysOverdue > 0 && (
              <div className="text-[10px] text-slate-500">{d.daysOverdue}d atraso</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TemplateRanking({ templates = [], loading = false }) {
  const maxRate = Math.max(...templates.map(t => t.rate || 0), 1);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 bg-slate-700/30 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!templates.length) return <div className="text-slate-500 text-sm text-center py-4">Sem dados de template.</div>;

  return (
    <div className="space-y-1.5">
      {templates.map((t, i) => (
        <div key={t.template || i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/40 transition-colors">
          <div className="w-6 text-center shrink-0"><RankBadge rank={i} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate capitalize">{t.template}</div>
            <BarCell value={t.rate} max={maxRate} color="#10B981" />
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-emerald-400">{t.rate}%</div>
            <div className="text-[10px] text-slate-500">{t.sent} envios</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StrategyRanking({ strategies = [], loading = false }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 bg-slate-700/30 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!strategies.length) return <div className="text-slate-500 text-sm text-center py-4">Sem dados de estratégia.</div>;

  return (
    <div className="space-y-1.5">
      {strategies.map((s, i) => (
        <div key={s.strategy || i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/40 transition-colors">
          <div className="w-6 text-center shrink-0"><RankBadge rank={i} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{s.strategy}</div>
            <div className="text-[10px] text-slate-500">{s.count} matches · {s.blocked} bloqueados</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-blue-400">{s.successRate}%</div>
            <div className="text-[10px] text-slate-500">eficiência</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RankingTable({ debtors, templates, strategies, loading }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Top Inadimplentes</h4>
        <DebtorRanking debtors={debtors} loading={loading} />
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Templates Mais Eficazes</h4>
        <TemplateRanking templates={templates} loading={loading} />
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Eficiência por Estratégia</h4>
        <StrategyRanking strategies={strategies} loading={loading} />
      </div>
    </div>
  );
}
