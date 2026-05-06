import { CheckCircle2, MinusCircle } from 'lucide-react';
import { getComparisonRows } from '../../constants/plans';

export default function PlanComparisonTable({ plans = [], title = 'Comparativo de planos' }) {
  const rows = getComparisonRows();

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Comparativo</p>
        <h3 className="mt-1 text-xl font-semibold text-slate-950">{title}</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Recurso</th>
              {plans.map((plan) => (
                <th key={plan.id} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="rounded-l-2xl border border-r-0 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  {row.label}
                </td>
                {plans.map((plan, index) => {
                  const rawValue = row.formatter ? row.formatter(plan) : plan?.capabilities?.[row.key];
                  const content =
                    typeof rawValue === 'boolean' ? (
                      rawValue ? <CheckCircle2 size={16} className="text-emerald-600" /> : <MinusCircle size={16} className="text-slate-300" />
                    ) : (
                      <span className="text-sm font-semibold text-slate-900">{rawValue}</span>
                    );

                  return (
                    <td
                      key={`${plan.id}-${row.key}`}
                      className={`border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 ${index === plans.length - 1 ? 'rounded-r-2xl' : ''}`}
                    >
                      <div className="flex items-center gap-2">{content}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
