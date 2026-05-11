import { AlertTriangle, ArrowRightCircle, BadgeDollarSign, MessageCircleMore, PhoneOff, TrendingUp, WalletCards, Waypoints } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { GLOBAL_COMPANY_ID } from '../services/companyService';
import { financeService } from '../services/financeService.ts';
import { formatCurrencyBRL } from '../utils/format';

function DashboardCard({ title, value, tone = 'slate', subtitle = '', badges = [], action = null }) {
  const tones = {
    slate: 'text-slate-50 border-slate-700 bg-slate-900/60',
    red: 'text-red-700 border-red-200 bg-red-50',
    blue: 'text-blue-700 border-blue-700/40 bg-blue-900/20',
    green: 'text-emerald-700 border-emerald-200 bg-emerald-50',
    orange: 'text-orange-700 border-orange-200 bg-orange-50',
    yellow: 'text-amber-700 border-amber-200 bg-amber-50',
    darkred: 'text-rose-800 border-rose-200 bg-rose-50',
    neutral: 'text-slate-200 border-slate-700 bg-slate-800/40',
  };

  return (
    <div className={`rounded-xl border p-4 shadow-soft ${tones[tone] || tones.slate}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {badges.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {badges.map((badge) => (
            <span key={`${title}-${badge.label}`} className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const isRowOpen = (row) => String(row.status || '').trim().toLowerCase() !== 'liquidado';

export default function CobrancaIndicators({
  rows = [],
  companyId = null,
  globalMode = false,
  userId = null,
  companyCount = 0,
}) {
  const [meta, setMeta] = useState({
    totalWhatsAppCharges: 0,
    manualWhatsAppCharges: 0,
    autoWhatsAppCharges: 0,
    autoChargeActive: false,
    activeAutoConfigsCount: 0,
  });
  const [metaError, setMetaError] = useState('');

  useEffect(() => {
    let active = true;
    const queryCompanyId = globalMode ? GLOBAL_COMPANY_ID : companyId;

    const loadMeta = async () => {
      if (!queryCompanyId && !globalMode) {
        if (active) {
          setMeta({
            totalWhatsAppCharges: 0,
            manualWhatsAppCharges: 0,
            autoWhatsAppCharges: 0,
            autoChargeActive: false,
            activeAutoConfigsCount: 0,
          });
          setMetaError('');
        }
        return;
      }

      try {
        const nextMeta = await financeService.fetchCobrancaDashboardMeta({
          companyId: queryCompanyId,
          userId,
        });
        if (active) {
          setMeta(nextMeta);
          setMetaError('');
        }
      } catch (err) {
        if (active) {
          setMetaError(err.message || 'Falha ao carregar indicadores de cobranca.');
        }
      }
    };

    loadMeta();

    const refreshHandler = () => {
      loadMeta();
    };

    window.addEventListener('bankextract:dashboard-refresh', refreshHandler);
    return () => {
      active = false;
      window.removeEventListener('bankextract:dashboard-refresh', refreshHandler);
    };
  }, [companyId, globalMode, userId]);

  const indicators = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const openRows = rows.filter(isRowOpen);
    const overdueRows = openRows.filter((row) => String(row.dataVencimento || '') < today);
    const futureRows = openRows.filter((row) => String(row.dataVencimento || '') >= today);
    const eligibleChargeRows = overdueRows.filter((row) => String(row.telefone || '').trim());
    const olderThanFiveDays = overdueRows.filter((row) => {
      const dueDate = new Date(`${row.dataVencimento}T00:00:00`);
      if (Number.isNaN(dueDate.getTime())) return false;
      const diff = Math.floor((Date.now() - dueDate.getTime()) / 86400000);
      return diff > 5;
    });

    return {
      totalVencido: overdueRows.reduce((sum, row) => sum + Number(row.valorAtualizado || row.valor || 0), 0),
      totalAVencer: futureRows.reduce((sum, row) => sum + Number(row.valorAtualizado || row.valor || 0), 0),
      valorPotencial: eligibleChargeRows.reduce((sum, row) => sum + Number(row.valorAtualizado || row.valor || 0), 0),
      clientesSemTelefone: overdueRows.filter((row) => !String(row.telefone || '').trim()).length,
      titulosProtesto: olderThanFiveDays.length,
      totalEmpresas: companyCount,
    };
  }, [companyCount, rows]);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">Indicadores de cobranca</h3>
          <p className="text-sm text-slate-500">Painel financeiro e comercial com foco em cobranca e recuperacao.</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800/40"
        >
          <ArrowRightCircle size={14} />
          Ver relatorio
        </button>
      </div>

      {metaError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {metaError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard
          title="Total vencido"
          value={formatCurrencyBRL(indicators.totalVencido)}
          tone="red"
          action={<BadgeDollarSign size={18} className="shrink-0 text-red-500" />}
        />
        <DashboardCard
          title="Total a vencer"
          value={formatCurrencyBRL(indicators.totalAVencer)}
          tone="blue"
          action={<TrendingUp size={18} className="shrink-0 text-blue-500" />}
        />
        <DashboardCard
          title="Total cobrado por WhatsApp"
          value={meta.totalWhatsAppCharges}
          tone="green"
          badges={[
            { label: `Manual ${meta.manualWhatsAppCharges}`, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
            { label: `Auto ${meta.autoWhatsAppCharges}`, className: 'border-blue-700/40 bg-blue-900/20 text-blue-700' },
          ]}
          action={<MessageCircleMore size={18} className="shrink-0 text-emerald-500" />}
        />
        <DashboardCard
          title="Valor potencial em cobranca"
          value={formatCurrencyBRL(indicators.valorPotencial)}
          tone="orange"
          action={<WalletCards size={18} className="shrink-0 text-orange-500" />}
        />
        <DashboardCard
          title="Clientes sem telefone"
          value={indicators.clientesSemTelefone}
          tone="yellow"
          badges={[
            { label: 'Acao necessaria', className: 'border-amber-200 bg-amber-50 text-amber-700' },
          ]}
          action={<PhoneOff size={18} className="shrink-0 text-amber-500" />}
        />
        <DashboardCard
          title="Titulos >5 dias de atraso"
          value={indicators.titulosProtesto}
          tone="darkred"
          badges={[
            { label: 'Protesto', className: 'border-rose-200 bg-rose-50 text-rose-700' },
          ]}
          action={<AlertTriangle size={18} className="shrink-0 text-rose-600" />}
        />
        <DashboardCard
          title="Cobrancas automaticas ativas"
          value={meta.autoChargeActive ? 'Ativo' : 'Desativado'}
          subtitle={meta.autoChargeActive ? `${meta.activeAutoConfigsCount} configuracao(oes) ativa(s)` : 'Nenhuma empresa com cobranca automatica ativa'}
          tone={meta.autoChargeActive ? 'green' : 'neutral'}
          action={<Waypoints size={18} className={`shrink-0 ${meta.autoChargeActive ? 'text-emerald-500' : 'text-slate-400'}`} />}
        />
        <DashboardCard
          title="Recuperacao"
          value={formatCurrencyBRL(0)}
          subtitle={globalMode ? `${indicators.totalEmpresas} empresa(s) monitoradas` : 'Estrutura pronta para futura logica'}
          tone="slate"
          action={<TrendingUp size={18} className="shrink-0 text-slate-400" />}
        />
      </div>
    </section>
  );
}
