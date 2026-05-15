import { Activity, CheckCircle2, Clock, ShieldCheck, Wifi, WifiOff } from 'lucide-react';

function StatusBadge({ status, ok }) {
  const isReady = status === 'pronto' || ok;
  const isWarning = status === 'atencao';
  if (isReady) {
    return (
      <span className="notice-success inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Pronto
      </span>
    );
  }
  if (isWarning) {
    return (
      <span className="notice-warning inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Atencao
      </span>
    );
  }
  return (
    <span className="surface-panel-muted inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-slate-300">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Pendente
    </span>
  );
}

function StatusRow({ item }) {
  return (
    <div className="surface-panel-muted flex items-start justify-between gap-4 rounded-2xl px-4 py-3 transition hover:bg-slate-800/70">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-50">{item.label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{item.detail}</p>
      </div>
      <StatusBadge status={item.status} ok={item.ok} />
    </div>
  );
}

export default function SystemStatusScreen({ status }) {
  const checklist = status?.checklist || [];
  const recentAuditLogs = status?.recentAuditLogs || [];
  const readyCount = checklist.filter((item) => item.status === 'pronto' || item.ok).length;
  const pendingCount = checklist.filter((item) => !item.ok && item.status !== 'atencao').length;
  const attentionCount = checklist.filter((item) => item.status === 'atencao').length;
  const total = checklist.length || 1;
  const readyPct = Math.round((readyCount / total) * 100);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="surface-card relative overflow-hidden rounded-2xl p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-400 to-blue-600 opacity-70" />
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-900/20 text-blue-700">
            <ShieldCheck size={18} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Empresa ativa</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-50">
            {status?.companyMode === 'global' ? 'Modo global' : 'Empresa especifica'}
          </p>
          <p className="mt-1 truncate text-xs text-slate-400">{status?.companyName || 'Nenhuma empresa ativa'}</p>
        </article>

        <article className="surface-card relative overflow-hidden rounded-2xl p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
          <div className={`absolute inset-x-0 top-0 h-0.5 ${status?.googleSheetsConnected ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-slate-200'}`} />
          <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${status?.googleSheetsConnected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800/60 text-slate-400'}`}>
            {status?.googleSheetsConnected ? <Wifi size={18} /> : <WifiOff size={18} />}
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Google Sheets</p>
          <p className={`mt-1.5 text-2xl font-semibold ${status?.googleSheetsConnected ? 'text-emerald-300' : 'text-slate-300'}`}>
            {status?.googleSheetsConnected ? 'Conectado' : 'Desconectado'}
          </p>
          <p className="mt-1 truncate text-xs text-slate-400">{status?.googleSheetsSheetName || 'Sem planilha vinculada'}</p>
        </article>

        <article className="surface-card relative overflow-hidden rounded-2xl p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
          <div className={`absolute inset-x-0 top-0 h-0.5 ${status?.whatsappMockMode ? 'bg-gradient-to-r from-amber-400 to-orange-400' : 'bg-gradient-to-r from-emerald-400 to-emerald-600'}`} />
          <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${status?.whatsappMockMode ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
            <Activity size={18} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">WhatsApp</p>
          <p className={`mt-1.5 text-2xl font-semibold ${status?.whatsappMockMode ? 'text-amber-300' : 'text-emerald-300'}`}>
            {status?.whatsappMockMode ? 'Modo teste' : 'Pronto'}
          </p>
          <p className="mt-1 truncate text-xs text-slate-400">
            Ultima execucao: {status?.lastAutoExecution || 'Nunca'}
          </p>
        </article>

        <article className="surface-card relative overflow-hidden rounded-2xl p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-400 to-purple-500 opacity-70" />
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
            <ShieldCheck size={18} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Role atual</p>
          <p className="mt-1.5 text-2xl font-semibold capitalize text-slate-50">{status?.userRole || 'membro'}</p>
          <p className="mt-1 text-xs text-slate-400">
            {status?.isSystemAdmin ? 'Administrador geral' : 'Escopo da empresa'}
          </p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <article className="surface-card rounded-2xl p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Itens prontos</p>
              <p className="mt-1.5 text-4xl font-semibold text-emerald-300">{readyCount}</p>
              <p className="mt-1 text-xs text-slate-500">Fluxos prontos para operacao.</p>
            </div>
            <CheckCircle2 size={32} className="text-emerald-200" />
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/60">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${readyPct}%` }} />
          </div>
          <p className="mt-1 text-right text-[10px] text-slate-400">{readyPct}% completo</p>
        </article>

        <article className="surface-card rounded-2xl p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pendencias</p>
              <p className="mt-1.5 text-4xl font-semibold text-slate-200">{pendingCount}</p>
              <p className="mt-1 text-xs text-slate-500">Necessarios antes da ativacao.</p>
            </div>
            <Clock size={32} className="text-slate-200" />
          </div>
        </article>

        <article className="surface-card rounded-2xl p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Atencao</p>
              <p className="mt-1.5 text-4xl font-semibold text-amber-300">{attentionCount}</p>
              <p className="mt-1 text-xs text-slate-500">Funcionais, aguardando validacao.</p>
            </div>
            <Activity size={32} className="text-amber-100" />
          </div>
        </article>
      </section>

      <section className="surface-card rounded-2xl p-6 shadow-soft">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-50">Checklist de prontidao</h3>
            <p className="text-sm text-slate-500">Leitura rapida do que esta pronto, pendente ou em atencao.</p>
          </div>
          <span className="rounded-full bg-slate-800/60 px-3 py-1 text-xs font-semibold text-slate-300">
            {readyCount}/{checklist.length}
          </span>
        </div>
        {checklist.length > 0 ? (
          <div className="space-y-2">
            {checklist.map((item) => (
              <StatusRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/40 px-4 py-6 text-center text-sm text-slate-500">
            Nenhum item de checklist encontrado.
          </div>
        )}
      </section>

      <section className="surface-card rounded-2xl p-6 shadow-soft">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-slate-50">Ultimos audit logs</h3>
          <p className="text-sm text-slate-500">Historico recente de operacoes sensiveis no escopo atual.</p>
        </div>
        {recentAuditLogs.length > 0 ? (
          <div className="space-y-2">
            {recentAuditLogs.map((item, index) => (
              <div
                key={`${item.action}-${item.created_at}-${index}`}
                className="surface-panel-muted flex items-start justify-between gap-4 rounded-2xl px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-50">{item.action}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.company_id || 'sem company_id'}</p>
                </div>
                <p className="shrink-0 text-xs text-slate-400">
                  {new Date(item.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/40 px-4 py-6 text-center text-sm text-slate-500">
            Nenhum audit log recente encontrado no escopo atual.
          </div>
        )}
      </section>
    </div>
  );
}
