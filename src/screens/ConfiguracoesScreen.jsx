import { Building2, KeyRound, Shield, Users2 } from 'lucide-react';

function InfoCard({ icon: Icon, title, children, badge = null }) {
  return (
    <article className="accent-bar rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-slate-50 text-slate-700">
            <Icon size={20} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        </div>
        {badge ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </article>
  );
}

export default function ConfiguracoesScreen({
  companyName,
  activeCompany,
  settings,
  isSystemAdmin,
  userRole = 'membro',
}) {
  return (
    <div className="space-y-6">
      <section className="hero-mesh overflow-hidden rounded-[32px] p-6 text-white shadow-lifted lg:p-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
              <Shield size={13} />
              Configuracoes
            </div>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-white lg:text-4xl">
              Governe empresa ativa, permissoes e prontidao comercial em um unico lugar.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 lg:text-base">
              Esta tela organiza dados da empresa, usuarios, invite code e preferencias operacionais sem mexer no
              schema nem no fluxo real do produto.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="glass rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Empresa ativa</p>
              <p className="mt-2 text-sm font-semibold text-white">{companyName || 'Nenhuma empresa ativa'}</p>
            </div>
            <div className="glass rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Role atual</p>
              <p className="mt-2 text-sm font-semibold capitalize text-white">{userRole}</p>
            </div>
            <div className="glass rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Escopo</p>
              <p className="mt-2 text-sm font-semibold text-white">{isSystemAdmin ? 'Admin geral habilitado' : 'Escopo da empresa ativa'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <InfoCard icon={Building2} title="Empresa ativa" badge={activeCompany?.isGlobal ? 'Global' : 'Empresa'}>
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              <span className="font-semibold text-slate-900">Nome:</span> {companyName || 'Nenhuma empresa ativa'}
            </p>
            <p>
              <span className="font-semibold text-slate-900">CNPJ:</span> {activeCompany?.cnpj || 'Nao informado'}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Modo:</span>{' '}
              {activeCompany?.isGlobal ? 'Todas as empresas' : 'Empresa especifica'}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Invite code:</span>{' '}
              {activeCompany?.inviteCode || 'Indisponivel'}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Role atual:</span> {userRole}
            </p>
          </div>
        </InfoCard>

        <InfoCard icon={KeyRound} title="Preferencias de exportacao" badge={isSystemAdmin ? 'Admin' : 'Padrao'}>
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              <span className="font-semibold text-slate-900">Formato:</span>{' '}
              {settings?.preferencias?.exportacao || 'CSV e Excel'}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Fuso horario:</span>{' '}
              {settings?.preferencias?.timezone || 'America/Sao_Paulo'}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Permissao especial:</span>{' '}
              {isSystemAdmin ? 'Admin geral' : 'Usuario padrao'}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Acoes destrutivas:</span>{' '}
              {activeCompany?.isGlobal ? 'Bloqueadas no modo global' : 'Controladas por role'}
            </p>
          </div>
        </InfoCard>
      </section>

      <InfoCard icon={Users2} title="Usuarios e permissoes" badge={`${(settings?.usuarios || []).length} usuarios`}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(settings?.usuarios || []).map((user) => (
            <div key={user.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="font-medium text-slate-900">{user.nome}</p>
              <p className="text-sm text-slate-500">{user.perfil}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      <InfoCard icon={Shield} title="Prontidao comercial" badge="Go-to-market">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Empresa ativa controlada</p>
            <p className="mt-1 text-xs text-slate-500">
              Selecao por company_id com bloqueio de acoes globais destrutivas.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Convite pronto para onboarding</p>
            <p className="mt-1 text-xs text-slate-500">
              Use o invite code da empresa para entrada de novos usuarios sem criar outra carteira.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Permissoes por role</p>
            <p className="mt-1 text-xs text-slate-500">
              Importacao, exportacao e limpeza seguem a role da empresa ativa.
            </p>
          </div>
        </div>
      </InfoCard>
    </div>
  );
}
