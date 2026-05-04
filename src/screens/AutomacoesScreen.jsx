import { useEffect, useState } from 'react';
import { Clock3, Sparkles, ToggleLeft } from 'lucide-react';
import WhatsAppAutoConfig from '../components/WhatsAppAutoConfig';
import { getWhatsAppAutoConfig } from '../services/whatsappAutoService';

function calcProximaExecucao(horaEnvio) {
  try {
    const brNow = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());

    const [hNow, mNow] = brNow.split(':').map(Number);
    const [hTarget, mTarget] = (horaEnvio || '08:00').split(':').map(Number);

    if (hNow * 60 + mNow < hTarget * 60 + mTarget) {
      return `Hoje às ${horaEnvio}`;
    }
    return `Amanhã às ${horaEnvio}`;
  } catch {
    return `às ${horaEnvio}`;
  }
}

export default function AutomacoesScreen({
  companyId,
  companyName,
  globalMode,
  rules,
  onToggleRule,
  onSaveRules,
}) {
  const [whatsappConfig, setWhatsappConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setWhatsappConfig(null);
      return;
    }
    setConfigLoading(true);
    getWhatsAppAutoConfig(companyId)
      .then(setWhatsappConfig)
      .catch(() => setWhatsappConfig(null))
      .finally(() => setConfigLoading(false));
  }, [companyId]);

  const ativo = whatsappConfig?.ativo ?? rules.active ?? false;
  const horaEnvio = whatsappConfig?.hora_envio ?? rules.horario ?? '08:00';
  const proximaExecucao = ativo ? calcProximaExecucao(horaEnvio) : '—';

  return (
    <div className="space-y-6">
      <section className="hero-mesh overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-lifted lg:p-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <Sparkles size={13} />
              Automações
            </div>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 lg:text-4xl">
              Organize a cobrança automática por atraso, horário e regras por empresa.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 lg:text-base">
              O motor abaixo prepara a operação automática sem mexer na cobrança real. Tudo continua respeitando
              company_id, escopo da empresa ativa e modo global do admin.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{configLoading ? '...' : ativo ? 'Ativo' : 'Inativo'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Horário</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{configLoading ? '...' : horaEnvio}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Próxima janela</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{configLoading ? '...' : proximaExecucao}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="accent-bar rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-blue-50 text-blue-700">
            <Sparkles size={22} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Regras de automação</h3>
            <p className="text-sm text-slate-500">
              Motor inicial de cadência por atraso preparado para Supabase Scheduler.
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</p>
            <p className={`mt-2 text-2xl font-semibold ${ativo ? 'text-emerald-700' : 'text-slate-900'}`}>
              {configLoading ? '...' : ativo ? 'Ativo' : 'Inativo'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Horário de envio</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{configLoading ? '...' : horaEnvio}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Próxima execução</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{configLoading ? '...' : proximaExecucao}</p>
          </div>
        </div>

        {globalMode ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <p className="font-semibold">Modo global ativo</p>
            <p className="mt-1 text-xs text-amber-700">
              Selecione uma empresa específica para editar regras de automação individuais.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(rules.items || []).map((rule, idx) => (
              <div
                key={rule.id || idx}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Clock3 size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{rule.label || `Regra ${idx + 1}`}</p>
                    <p className="text-xs text-slate-500">{rule.description || 'Cadência por atraso'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleRule && onToggleRule(rule.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                    rule.active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <ToggleLeft size={13} />
                  {rule.active ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            ))}

            {!(rules.items || []).length ? (
              <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 py-10 text-sm text-slate-400">
                Nenhuma regra configurada ainda.
              </div>
            ) : null}

            {onSaveRules ? (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={onSaveRules}
                  className="rounded-2xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  Salvar regras
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="accent-bar rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
            <Clock3 size={22} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Configuração WhatsApp</h3>
            <p className="text-sm text-slate-500">
              Gerencie o agendador automático de cobrança via WhatsApp.
            </p>
          </div>
        </div>

        {companyId ? (
          <WhatsAppAutoConfig companyId={companyId} companyName={companyName} />
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 py-10 text-sm text-slate-400">
            Selecione uma empresa para configurar o WhatsApp automático.
          </div>
        )}
      </section>
    </div>
  );
}
