import { Building2, KeyRound, PlusCircle, ShieldCheck, Sparkles } from 'lucide-react';

export default function EmpresaModal({
  isOpen,
  mode,
  setMode,
  allowCreate,
  onClose,
  onContinueWithoutCompany,
  form,
  setField,
  error,
  saving,
  onCreate,
  onJoin,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (allowCreate && onClose && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="card-hover w-full max-w-xl overflow-hidden rounded-[34px] border border-white/70 bg-white/95 shadow-[0_40px_120px_rgba(15,23,42,0.2)] backdrop-blur">
        <div className="hero-mesh border-b border-slate-200/80 px-6 py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                <Sparkles size={12} />
                Onboarding empresarial
              </div>
              <h2 className="text-2xl font-semibold text-slate-950">Escolha sua empresa</h2>
              <p className="max-w-xl text-sm leading-6 text-slate-600">
                {allowCreate
                  ? 'Sua conta ainda nao possui uma empresa ativa. Crie uma nova empresa, entre por convite ou continue sem empresa para seguir explorando o sistema.'
                  : 'Sua conta ainda nao possui uma empresa ativa. Entre em uma empresa existente usando um codigo de convite.'}
              </p>
            </div>
            {allowCreate && onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
              >
                Fechar
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="grid grid-cols-1 gap-3">
            {allowCreate ? (
              <button
                type="button"
                onClick={() => setMode('criar')}
                className={`rounded-[26px] border px-4 py-4 text-left transition hover:-translate-y-0.5 ${
                  mode === 'criar'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-2xl p-2 ${mode === 'criar' ? 'bg-white/80' : 'bg-slate-100'}`}>
                    <PlusCircle size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Criar empresa</p>
                    <p className="mt-1 text-xs text-current/80">Cadastrar uma nova empresa para iniciar a operacao.</p>
                  </div>
                </div>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setMode('entrar')}
              className={`rounded-[26px] border px-4 py-4 text-left transition hover:-translate-y-0.5 ${
                mode === 'entrar'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-2xl p-2 ${mode === 'entrar' ? 'bg-white/80' : 'bg-slate-100'}`}>
                  <KeyRound size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Entrar por convite</p>
                  <p className="mt-1 text-xs text-current/80">Use o codigo de uma empresa existente para se vincular com seguranca.</p>
                </div>
              </div>
            </button>
          </div>

          {mode === 'criar' && allowCreate ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nome da empresa</span>
                <input
                  value={form.nome}
                  onChange={(event) => setField('nome', event.target.value)}
                  placeholder="Ex.: Realce Estofados Ltda"
                  className="input-premium w-full"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">CNPJ (opcional)</span>
                <input
                  value={form.cnpj}
                  onChange={(event) => setField('cnpj', event.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="input-premium w-full"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Codigo de convite</span>
                <input
                  value={form.inviteCode}
                  onChange={(event) => setField('inviteCode', event.target.value)}
                  placeholder="Ex.: ABCD-1234"
                  className="input-premium w-full uppercase"
                />
              </label>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-sm">
                O codigo de convite e gerado automaticamente quando uma empresa e criada. Ao entrar, sua conta fica vinculada com as permissoes da empresa.
              </div>
            </div>
          )}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
              {error}
            </div>
          ) : null}

          {!allowCreate ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
              O cadastro de novas empresas e restrito ao administrador geral do sistema. Solicite um codigo de convite para entrar em uma empresa existente.
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-200/80 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={14} />
            Empresa ativa obrigatoria para carregar a operacao financeira.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {allowCreate && onContinueWithoutCompany ? (
              <button
                type="button"
                onClick={onContinueWithoutCompany}
                disabled={saving}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Continuar sem empresa
              </button>
            ) : null}
            <button
              type="button"
              onClick={mode === 'criar' && allowCreate ? onCreate : onJoin}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(14,159,110,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_34px_rgba(14,159,110,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Building2 size={14} />
              {saving ? 'Salvando...' : mode === 'criar' && allowCreate ? 'Criar empresa e continuar' : 'Entrar na empresa'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
