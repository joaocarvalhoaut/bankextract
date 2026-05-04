import { Database, FileSpreadsheet, MessageCircleMore, ShieldCheck } from 'lucide-react';
import GoogleSheetsConfig from '../components/GoogleSheetsConfig';

function IntegrationCard({ icon: Icon, title, description, tone = 'slate', badge = null }) {
  const palette = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    blue: 'bg-blue-50 text-blue-800 border-blue-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    gold: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <div className="card-hover rounded-[26px] border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={`inline-flex rounded-2xl border p-3 ${palette[tone] || palette.slate}`}>
          <Icon size={18} />
        </div>
        {badge ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
    </div>
  );
}

export default function IntegracoesScreen({
  companyId,
  companyName,
  globalMode,
  onGoogleSheetsSaved,
}) {
  return (
    <div className="space-y-6">
      <section className="hero-mesh overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-lifted lg:p-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              <ShieldCheck size={13} />
              Integrações
            </div>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 lg:text-4xl">
              Conecte o BankExtract a rotinas externas sem expor credenciais no frontend.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 lg:text-base">
              Esta área concentra Google Sheets, WhatsApp em modo teste, exportação e a base Supabase para operar com
              company_id e auditoria centralizada.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Escopo</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {globalMode ? 'Modo global bloqueia configurações por empresa' : companyName || 'Sem empresa ativa'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Credenciais</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">Seguras no backend</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status comercial</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">Pronto para demonstração</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <IntegrationCard
          icon={Database}
          title="Supabase"
          description="Base multiempresa preparada para company_id, batch_id e automações."
          tone="blue"
          badge="Core"
        />
        <IntegrationCard
          icon={FileSpreadsheet}
          title="Google Sheets"
          description="Exportação e sincronização operacional por empresa ativa."
          tone="green"
          badge="Live"
        />
        <IntegrationCard
          icon={MessageCircleMore}
          title="WhatsApp"
          description="Disparo manual e motor de cobrança automática com templates por empresa."
          tone="gold"
          badge="Mock"
        />
        <IntegrationCard
          icon={ShieldCheck}
          title="Exportação Excel"
          description="Estrutura pronta para relatórios financeiros, históricos e auditoria."
          tone="slate"
          badge="Ready"
        />
      </section>

      <GoogleSheetsConfig
        empresaId={companyId}
        empresaNome={companyName}
        globalMode={globalMode}
        onSaved={onGoogleSheetsSaved}
      />
    </div>
  );
}
