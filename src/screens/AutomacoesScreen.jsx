import { useEffect, useMemo, useState } from 'react';
import { Clock3, Save, Sparkles, ToggleLeft } from 'lucide-react';
import WhatsAppAutoConfig from '../components/WhatsAppAutoConfig';
import CobrancaAutomaticaScreen from './CobrancaAutomaticaScreen';
import { getWhatsAppAutoConfig, saveWhatsAppAutoConfig } from '../services/whatsappAutoService';

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
    return `Às ${horaEnvio}`;
  }
}

const baseForm = {
  active: false,
  horario: '08:00',
  canal: 'WhatsApp',
  intervalo_dias: 5,
  cobrar_apos_dias_vencido: 1,
  protesto_apos_5_dias: true,
  mensagem_template: '',
  rules: [],
};

export default function AutomacoesScreen({
  companyId,
  activeCompanyId,
  activeCompany,
  companyName,
  globalMode,
  userRole = 'operador',
  rules,
  onToggleRule,
  onSaveRules,
  onToast,
}) {
  const [configLoading, setConfigLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(baseForm);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      ...baseForm,
      ...rules,
      rules: Array.isArray(rules?.rules) ? rules.rules : [],
    }));
  }, [rules]);

  useEffect(() => {
    let active = true;

    if (!companyId || globalMode) {
      setForm((prev) => ({
        ...prev,
        active: false,
      }));
      return undefined;
    }

    setConfigLoading(true);
    getWhatsAppAutoConfig(companyId)
      .then((config) => {
        if (!active) return;
        setForm((prev) => ({
          ...prev,
          active: Boolean(config.ativo),
          horario: config.hora_envio || prev.horario,
          intervalo_dias: Number(config.intervalo_dias || prev.intervalo_dias),
          cobrar_apos_dias_vencido: Number(config.cobrar_apos_dias_vencido || prev.cobrar_apos_dias_vencido),
          protesto_apos_5_dias: Boolean(config.protesto_apos_5_dias ?? prev.protesto_apos_5_dias),
          canal: config.canal_envio || prev.canal,
          mensagem_template: config.mensagem_template || prev.mensagem_template,
        }));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setConfigLoading(false);
      });

    return () => {
      active = false;
    };
  }, [companyId, globalMode]);

  const ativo = form.active;
  const horaEnvio = form.horario || '08:00';
  const proximaExecucao = ativo ? calcProximaExecucao(horaEnvio) : '—';
  const displayedRules = useMemo(() => (Array.isArray(form.rules) ? form.rules : []), [form.rules]);

  const updateField = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleToggleRuleLocal = (ruleId) => {
    const nextRules = displayedRules.map((rule, idx) => {
      const currentId = rule.id || rule.day || `rule-${idx}`;
      if (currentId !== ruleId) return rule;
      return {
        ...rule,
        active: !rule.active,
      };
    });

    setForm((prev) => ({
      ...prev,
      rules: nextRules,
    }));

    onToggleRule?.(ruleId);
  };

  const handleSave = async () => {
    if (!companyId || globalMode) return;

    setSaving(true);
    try {
      await saveWhatsAppAutoConfig(companyId, {
        ativo: form.active,
        hora_envio: form.horario,
        intervalo_dias: form.intervalo_dias,
        cobrar_apos_dias_vencido: form.cobrar_apos_dias_vencido,
        protesto_apos_5_dias: form.protesto_apos_5_dias,
        canal_envio: form.canal,
        mensagem_template: form.mensagem_template,
      });

      await onSaveRules?.({
        active: form.active,
        horario: form.horario,
        canal: form.canal,
        intervalo_dias: Number(form.intervalo_dias || 5),
        cobrar_apos_dias_vencido: Number(form.cobrar_apos_dias_vencido || 1),
        protesto_apos_5_dias: Boolean(form.protesto_apos_5_dias),
        mensagem_template: form.mensagem_template,
        rules: displayedRules,
      });

      onToast?.('sucesso', 'Regras de automação salvas com sucesso.');
    } catch (error) {
      onToast?.('erro', error.message || 'Não foi possível salvar as regras de automação.');
    } finally {
      setSaving(false);
    }
  };

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
              Edite o horário, frequência, texto padrão e as regras de atraso sem perder o layout atual.
            </p>
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
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Empresa ativa</span>
                <input value={companyName || ''} readOnly className="input-premium w-full bg-white" />
              </label>

              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ativar cobrança automática</span>
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">{form.active ? 'Ativa' : 'Desativada'}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(form.active)}
                    onChange={(event) => updateField('active', event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </div>
              </label>

              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Canal de envio</span>
                <select
                  value={form.canal}
                  onChange={(event) => updateField('canal', event.target.value)}
                  className="input-premium w-full bg-white"
                >
                  <option value="WhatsApp">WhatsApp</option>
                </select>
              </label>

              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Horario de envio</span>
                <input
                  type="time"
                  value={form.horario}
                  onChange={(event) => updateField('horario', event.target.value)}
                  className="input-premium w-full bg-white"
                />
              </label>

              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Frequencia de envio (dias)</span>
                <input
                  type="number"
                  min="1"
                  value={form.intervalo_dias}
                  onChange={(event) => updateField('intervalo_dias', event.target.value)}
                  className="input-premium w-full bg-white"
                />
              </label>

              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Dias de atraso para cobranca</span>
                <input
                  type="number"
                  min="0"
                  value={form.cobrar_apos_dias_vencido}
                  onChange={(event) => updateField('cobrar_apos_dias_vencido', event.target.value)}
                  className="input-premium w-full bg-white"
                />
              </label>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Aplicar aviso de protesto apos 5 dias</p>
                <p className="text-xs text-slate-500">Mantem a regra comercial explicita na mensagem automatica.</p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(form.protesto_apos_5_dias)}
                onChange={(event) => updateField('protesto_apos_5_dias', event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <label className="block">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Texto padrao da mensagem</span>
                <textarea
                  rows={8}
                  value={form.mensagem_template}
                  onChange={(event) => updateField('mensagem_template', event.target.value)}
                  className="input-premium min-h-[220px] w-full bg-white"
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">
                Variaveis aceitas: {'{{cliente}}'}, {'{{documento}}'}, {'{{vencimento}}'}, {'{{valor}}'}, {'{{telefone}}'}, {'{{dias_atraso}}'}, {'{{empresa}}'}.
              </p>
            </div>

            <div className="space-y-3">
              {displayedRules.map((rule, idx) => {
                const ruleId = rule.id || rule.day || `rule-${idx}`;
                return (
                  <div
                    key={ruleId}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <Clock3 size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{rule.label || rule.day || `Regra ${idx + 1}`}</p>
                        <p className="text-xs text-slate-500">{rule.description || 'Cadencia por atraso'}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleRuleLocal(ruleId)}
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
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <Save size={15} />
                {saving ? 'Salvando...' : 'Salvar regras'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="accent-bar rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
            <Clock3 size={22} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Configuracao WhatsApp</h3>
            <p className="text-sm text-slate-500">
              Gerencie o agendador automatico de cobranca via WhatsApp.
            </p>
          </div>
        </div>

        {companyId ? (
          <WhatsAppAutoConfig companyId={companyId} companyName={companyName} globalMode={globalMode} />
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 py-10 text-sm text-slate-400">
            Selecione uma empresa para configurar o WhatsApp automatico.
          </div>
        )}
      </section>

      <CobrancaAutomaticaScreen
        companyId={companyId}
        activeCompanyId={activeCompanyId}
        activeCompany={activeCompany}
        companyName={companyName}
        globalMode={globalMode}
        userRole={userRole}
        onToast={onToast}
      />
    </div>
  );
}
