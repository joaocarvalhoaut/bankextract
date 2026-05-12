export default function TermsScreen() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="surface-card rounded-[32px] px-6 py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Termos</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-50">Termos de Uso</h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          Estes termos estabelecem as condicoes basicas de uso do NC Finance by NC HUB para
          operacao financeira, cobranca, analytics e integracoes empresariais.
        </p>
      </section>

      <section className="surface-card rounded-[32px] px-6 py-8 text-sm leading-7 text-slate-300">
        <h2 className="text-lg font-semibold text-slate-50">Uso da plataforma</h2>
        <p className="mt-3">
          O acesso e concedido para operacao interna da empresa contratante, respeitando limites
          de plano, permissoes por usuario e politicas de seguranca do ambiente.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Responsabilidades</h2>
        <p className="mt-3">
          A empresa usuaria e responsavel pela qualidade dos dados importados, pelo uso adequado das
          integracoes conectadas e pela conformidade das comunicacoes enviadas aos clientes finais.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Assinatura e limites</h2>
        <p className="mt-3">
          Recursos, volumes e automacoes seguem o plano contratado e podem ser limitados conforme
          trial, status de assinatura, uso mensal e politicas comerciais vigentes.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Suporte e contato</h2>
        <p className="mt-3">
          Duvidas operacionais ou comerciais:
          <a className="ml-2 text-cyan-300 hover:text-cyan-200" href="mailto:contato@nchub.com.br">
            contato@nchub.com.br
          </a>
        </p>
      </section>
    </div>
  );
}
