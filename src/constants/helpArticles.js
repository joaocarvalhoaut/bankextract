export const HELP_ARTICLES = [
  {
    id: 'importar-carteira',
    title: 'Como importar carteira',
    category: 'Operacao',
    description: 'Envie o arquivo, revise a previa OCR e confirme somente as linhas que devem entrar na carteira.',
    bullets: [
      'Selecione a empresa ativa antes de importar.',
      'Escolha o tipo de importacao e envie o arquivo.',
      'Revise a previa e importe apenas os registros validados.',
    ],
    actionTab: 'importacao',
  },
  {
    id: 'revisar-dados',
    title: 'Como revisar dados importados',
    category: 'Operacao',
    description: 'Use a Visao Geral para filtrar registros, ajustar campos financeiros e corrigir inconsistencias.',
    bullets: [
      'Filtre por status, periodo e busca textual.',
      'Edite valores, vencimentos e dados do cliente quando necessario.',
      'Acompanhe as alteracoes pelo historico e pela auditoria visual.',
    ],
    actionTab: 'visao-geral',
  },
  {
    id: 'preparar-cobranca',
    title: 'Como preparar cobranca',
    category: 'Cobranca',
    description: 'Monte a mensagem, valide telefone e boleto e prepare o envio manual assistido sem disparo real.',
    bullets: [
      'Abra a Central Operacional para revisar cada titulo.',
      'Use Preparar cobranca para gerar mensagem, boleto e linha digitavel.',
      'No lote manual, selecione ate 20 titulos e exporte CSV se precisar.',
    ],
    actionTab: 'central-cobranca',
  },
  {
    id: 'executar-simulacao',
    title: 'Como executar simulacao',
    category: 'Automacao',
    description: 'Rode simulacoes para validar a regua automatica sem enviar WhatsApp real nem consumir envio real.',
    bullets: [
      'Configure horario, templates e regras de atraso.',
      'Execute simulacao na tela de Automacoes.',
      'Revise o checklist pre-envio antes de pensar em ativacao real.',
    ],
    actionTab: 'automacoes',
  },
  {
    id: 'interpretar-dashboard',
    title: 'Como interpretar dashboard',
    category: 'Analytics',
    description: 'Leia carteira ativa, vencido, recebido e as ultimas atividades para priorizar cobranca e operacao.',
    bullets: [
      'Acompanhe KPIs financeiros e aging da carteira.',
      'Use os proximos vencimentos e maiores valores em aberto para priorizar acao.',
      'Consulte Ultimas atividades para entender o que a equipe executou.',
    ],
    actionTab: 'dashboard',
  },
  {
    id: 'planos-e-limites',
    title: 'Como funcionam planos e limites',
    category: 'Comercial',
    description: 'Entenda o plano atual, os medidores de consumo e quando faz sentido solicitar upgrade.',
    bullets: [
      'Veja o plano atual em Billing e Planos.',
      'Acompanhe cobrancas, importacoes, automacoes e usuarios usados no ciclo.',
      'Os avisos de 80%, 95% e 100% sao apenas informativos nesta etapa.',
    ],
    actionTab: 'billing',
  },
  {
    id: 'usar-notificacoes',
    title: 'Como usar notificacoes',
    category: 'Operacao',
    description: 'O sino centraliza alertas de importacao, cobranca, automacao, trial e limites do plano.',
    bullets: [
      'Abra o sino no header para ver as ultimas notificacoes.',
      'Use a tela completa para filtrar nao lidas e importantes.',
      'Marque todas como lidas quando quiser limpar o operacional.',
    ],
    actionTab: 'notifications',
  },
  {
    id: 'consultar-auditoria',
    title: 'Como consultar auditoria',
    category: 'Governanca',
    description: 'A timeline visual ajuda a entender quem fez o que, quando e em qual entidade.',
    bullets: [
      'Filtre por acao, periodo, usuario, entidade e texto livre.',
      'Use o dashboard para abrir rapidamente as ultimas atividades.',
      'Exporte CSV ou Excel quando precisar compartilhar a trilha.',
    ],
    actionTab: 'audit',
  },
  {
    id: 'ia-de-cobranca',
    title: 'Como usar IA de cobranca',
    category: 'Automacao',
    description: 'Use o gerador local por regras para criar mensagens mais adequadas ao atraso, tom e contexto do cliente.',
    bullets: [
      'Selecione o tom entre amigavel, neutro, firme e juridico.',
      'Gere a mensagem, revise o texto e ajuste antes de copiar ou salvar.',
      'O uso de tom firme ou juridico gera notificacao e auditoria automaticamente.',
    ],
    actionTab: 'central-cobranca',
  },
  {
    id: 'faq',
    title: 'Perguntas frequentes',
    category: 'Suporte',
    description: 'Respostas rapidas sobre simulacao, separacao por empresa, planos, WhatsApp e uso inicial.',
    bullets: [
      'O sistema nao envia WhatsApp real nesta fase sem configuracao posterior.',
      'Os dados continuam separados por company_id.',
      'Voce pode operar onboarding, consumo e notificacoes sem gateway de pagamento.',
    ],
    actionTab: 'onboarding',
  },
];

export const HELP_ARTICLE_MAP = Object.fromEntries(HELP_ARTICLES.map((article) => [article.id, article]));
