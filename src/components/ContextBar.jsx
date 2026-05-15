import { useEffect, useRef, useState } from 'react';
import { Building2, Sparkles, Shield } from 'lucide-react';
import { GLOBAL_COMPANY_ID } from '../services/companyService';
import { getUsageLimits } from '../services/subscriptionService';
import SubscriptionBadge from './SubscriptionBadge';
import { getPlanMeta, getUpgradeRecommendation, normalizePlanId } from '../constants/plans';

export default function ContextBar({
  companies = [],
  activeCompanyId,
  onChangeCompany,
  activeCompany,
  billingExecutionMode = 'simulate',
  isSystemAdmin = false,
  onOpenCompanyModal,
  onOpenPlans,
}) {
  const [usageSummary, setUsageSummary] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!activeCompanyId || activeCompany?.isGlobal || activeCompanyId === GLOBAL_COMPANY_ID) {
      setUsageSummary(null);
      return;
    }
    getUsageLimits(activeCompanyId)
      .then((data) => { if (mountedRef.current) setUsageSummary(data); })
      .catch(() => { if (mountedRef.current) setUsageSummary(null); });
  }, [activeCompanyId, activeCompany?.isGlobal]);

  const usagePercent = Number(usageSummary?.usage_percent || 0);
  const planId = normalizePlanId(usageSummary?.plan);
  const planMeta = getPlanMeta(planId);
  const usedRealSends = Number(usageSummary?.used_real_sends || 0);
  const monthlyLimit = Number(usageSummary?.monthly_send_limit || 0);
  const limitReached = Boolean(usageSummary?.blocked_by_limit || usageSummary?.remainingRealSends <= 0);
  const highUsage = !limitReached && usagePercent >= 80;
  const upgrade = getUpgradeRecommendation(planId, {
    monthly_send_limit: monthlyLimit,
    extra_send_credits: Number(usageSummary?.extra_send_credits || 0),
    used_real_sends: usedRealSends,
  });

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-slate-800/60 bg-slate-900/40 px-4 py-2.5">

      {/* Left: company selector + CNPJ + mode */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-2">
          <Building2 size={13} className="flex-shrink-0 text-slate-500" />
          <select
            value={activeCompanyId || ''}
            onChange={(e) => onChangeCompany(e.target.value)}
            className="cursor-pointer bg-transparent text-sm font-medium text-slate-200 outline-none transition-colors hover:text-white"
            style={{ colorScheme: 'dark' }}
          >
            {!activeCompanyId && <option value="">Selecione uma empresa</option>}
            {companies.map((company) => (
              <option key={company.id} value={company.id} style={{ background: '#0D1B2E', color: '#fff' }}>
                {company.nome}
              </option>
            ))}
          </select>
        </div>

        {activeCompany && !activeCompany.isGlobal && (activeCompany.cnpj || activeCompany.inviteCode) && (
          <span className="hidden font-mono text-[11px] text-slate-600 sm:inline">
            {activeCompany.cnpj || activeCompany.inviteCode}
          </span>
        )}

        {activeCompany?.isGlobal && (
          <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
            Modo global
          </span>
        )}

        <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
          billingExecutionMode === 'real'
            ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
            : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
        }`}>
          <Shield size={9} />
          {billingExecutionMode === 'real' ? 'Envio real' : 'Simulacao'}
        </div>
      </div>

      {/* Right: usage meter + admin actions */}
      <div className="flex items-center gap-3">
        {usageSummary && (
          <div className="hidden items-center gap-2 sm:flex">
            {planMeta && <SubscriptionBadge planId={planId} size="xs" />}
            <span className={`text-[11px] font-medium ${
              limitReached ? 'text-red-400' : highUsage ? 'text-amber-400' : 'text-slate-500'
            }`}>
              {limitReached
                ? 'Limite atingido'
                : `${usedRealSends}/${monthlyLimit > 0 ? monthlyLimit : '∞'}`}
            </span>
            <div className="h-1 w-14 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(usagePercent, 100)}%`,
                  background: limitReached
                    ? '#EF4444'
                    : highUsage
                    ? '#F59E0B'
                    : 'linear-gradient(90deg, #005DFF, #14D8FF)',
                }}
              />
            </div>
            {upgrade?.message && (
              <button
                type="button"
                onClick={onOpenPlans}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-300 transition hover:bg-blue-500/20"
              >
                <Sparkles size={9} />
                {upgrade.message}
              </button>
            )}
          </div>
        )}

        {isSystemAdmin && (
          <button
            type="button"
            onClick={() => onOpenCompanyModal?.('criar')}
            className="hidden items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 sm:inline-flex"
          >
            + Nova empresa
          </button>
        )}
      </div>
    </div>
  );
}
