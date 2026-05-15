export default function PrivacyPolicyScreen() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="surface-card rounded-2xl px-6 py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Privacidade</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-50">Politica de Privacidade</h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          O NC Finance by NC HUB trata dados operacionais, cadastrais e financeiros para executar cobranca,
          analytics, onboarding e gestao comercial de forma segura em ambiente multiempresa.
        </p>
      </section>

      <section className="surface-card rounded-2xl px-6 py-8 text-sm leading-7 text-slate-300">
        <h2 className="text-lg font-semibold text-slate-50">Dados tratados</h2>
        <p className="mt-3">
          Podemos tratar dados de contato, registros financeiros, status de cobranca, logs operacionais,
          integracoes e eventos de assinatura para prestar o servico.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Finalidade</h2>
        <p className="mt-3">
          Os dados sao usados para automacao de cobranca, conciliacao, observabilidade, suporte,
          analytics operacional e melhoria da experiencia do produto.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Compartilhamento</h2>
        <p className="mt-3">
          O sistema utiliza provedores de infraestrutura e integracoes contratadas, como Supabase,
          Vercel, Stripe, Z-API e ferramentas de monitoramento, sempre com finalidade operacional.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Direitos do titular</h2>
        <p className="mt-3">
          Solicite informacoes, correcao ou exclusao de dados pelo canal operacional informado abaixo.
          Pedidos podem exigir validacao de identidade e contexto da empresa.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Contato</h2>
        <p className="mt-3">
          Para assuntos de privacidade, exclusao de dados ou exercicio de direitos:
          <a className="ml-2 text-cyan-300 hover:text-cyan-200" href="mailto:privacidade@nchub.com.br">
            privacidade@nchub.com.br
          </a>
        </p>
      </section>
    </div>
  );
}
