const TONE_META = {
  amigavel: {
    label: 'Amigavel',
    severity: 'info',
    actionLabel: 'Manter lembrete acolhedor',
  },
  neutro: {
    label: 'Neutro',
    severity: 'info',
    actionLabel: 'Conduzir acompanhamento objetivo',
  },
  firme: {
    label: 'Firme',
    severity: 'warning',
    actionLabel: 'Cobrar retorno com prioridade',
  },
  juridico: {
    label: 'Juridico',
    severity: 'danger',
    actionLabel: 'Formalizar tratativa administrativa',
  },
};

const MESSAGE_STYLES = {
  amigavel: {
    subjectPrefix: 'Lembrete gentil do boleto',
    summaryPrefix: 'Lembrete cordial',
    actionSuggestion: 'Manter o contato aberto para apoio e comprovante de pagamento.',
    greeting: (name) => `Ola, ${name}, tudo bem?`,
    buildLines: (context) => [
      'Passando para lembrar de forma tranquila sobre o boleto abaixo, que segue em nosso acompanhamento.',
      '',
      ...buildDetailsBlock(context),
      '',
      context.diasAtraso > 0
        ? `Notei ${context.diasAtraso} dia(s) de atraso no momento. Se voce ja pagou, pode me enviar o comprovante para eu pedir a baixa.`
        : 'Quis me adiantar para facilitar sua organizacao e evitar qualquer correria perto do vencimento.',
      'Se precisar, posso reenviar os dados do boleto ou te ajudar a localizar as informacoes mais rapidamente.',
      context.historyHint,
      '',
      `Fico a disposicao. Equipe ${context.empresa}.`,
    ],
  },
  neutro: {
    subjectPrefix: 'Acompanhamento financeiro',
    summaryPrefix: 'Cobranca objetiva',
    actionSuggestion: 'Acompanhar a resposta e atualizar o retorno do cliente na central.',
    greeting: (name) => `Ola, ${name},`,
    buildLines: (context) => [
      'Segue o acompanhamento do titulo abaixo para sua verificacao.',
      '',
      ...buildDetailsBlock(context),
      '',
      context.diasAtraso > 0
        ? `Atualmente o titulo registra ${context.diasAtraso} dia(s) de atraso em nosso controle financeiro.`
        : 'O titulo esta no prazo informado e permanece em acompanhamento preventivo.',
      'Solicitamos a confirmacao do pagamento ou o envio do comprovante para atualizacao do status.',
      context.historyHint,
      '',
      `Atenciosamente, equipe financeira ${context.empresa}.`,
    ],
  },
  firme: {
    subjectPrefix: 'Regularizacao prioritaria',
    summaryPrefix: 'Cobranca urgente',
    actionSuggestion: 'Solicitar retorno imediato com previsao objetiva de pagamento.',
    greeting: (name) => `Ola, ${name},`,
    buildLines: (context) => [
      'Precisamos tratar com prioridade a pendencia financeira abaixo.',
      '',
      ...buildDetailsBlock(context),
      '',
      `O titulo acumula ${context.diasAtraso} dia(s) de atraso e exige uma definicao imediata.`,
      'Pedimos regularizacao ainda hoje ou retorno objetivo com a previsao de pagamento.',
      'Sem um posicionamento, o caso segue em escalonamento interno para acompanhamento diario.',
      context.historyHint,
      '',
      `Equipe de cobranca ${context.empresa}.`,
    ],
  },
  juridico: {
    subjectPrefix: 'Notificacao administrativa',
    summaryPrefix: 'Aviso formal',
    actionSuggestion: 'Registrar retorno formal e manter a tratativa administrativa documentada.',
    greeting: (name) => `Prezado(a) ${name},`,
    buildLines: (context) => [
      'Comunicamos, para fins de registro administrativo, a permanencia da pendencia descrita abaixo.',
      '',
      ...buildDetailsBlock(context),
      '',
      `Consta em sistema atraso de ${context.diasAtraso} dia(s), sem regularizacao identificada ate o momento.`,
      'Solicitamos manifestacao formal e a respectiva regularizacao financeira com a maior brevidade possivel.',
      'Na ausencia de retorno, o caso permanece sujeito ao fluxo interno de cobranca administrativa da empresa.',
      context.historyHint,
      '',
      `Atenciosamente, departamento administrativo ${context.empresa}.`,
    ],
  },
};

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return 'nao informado';
  try {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T00:00:00`));
  } catch {
    return String(value);
  }
}

function normalizeTone(value) {
  return TONE_META[value] ? value : 'neutro';
}

function isTechnicalHistoryEntry(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return true;

  return [
    'configuracao',
    'template',
    'preventiva',
    'vencimento',
    'ausente',
    'diagnostic',
    'debug',
    'operacional',
    'recommendation',
    'recomendacao',
    'checklist',
    'interno',
    'status tecnico',
  ].some((token) => normalized.includes(token));
}

function getHistoryHint(history) {
  if (!history) return '';

  const entries = Array.isArray(history)
    ? history
    : typeof history === 'string'
      ? history.split(';')
      : [];

  const safeEntries = entries
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .filter((entry) => !isTechnicalHistoryEntry(entry))
    .slice(0, 2);

  if (safeEntries.length) {
    return `Historico recente: ${safeEntries.join('; ')}.`;
  }

  return '';
}

function inferDelayBand(daysLate) {
  const value = Number(daysLate || 0);
  if (value <= 0) return 'preventivo';
  if (value <= 3) return 'leve';
  if (value <= 15) return 'moderado';
  return 'critico';
}

function buildDetailsBlock(context) {
  return [
    `Documento: ${context.documento}`,
    `Boleto: ${context.numeroBoleto}`,
    `Vencimento: ${context.vencimento}`,
    `Valor: ${context.valor}`,
    '',
    'Linha digitavel:',
    context.linhaDigitavel,
    '',
    'Link do boleto:',
    context.linkBoleto,
  ];
}

export function generateCollectionMessage(input = {}, tone = 'neutro') {
  const normalizedTone = normalizeTone(tone);
  const delayBand = inferDelayBand(input.diasAtraso);
  const meta = TONE_META[normalizedTone];
  const style = MESSAGE_STYLES[normalizedTone];
  const context = {
    nome: input.nome || input.cliente || 'cliente',
    telefone: input.telefone || 'nao informado',
    documento: input.documento || input.numero_documento || 'nao informado',
    numeroBoleto: input.numero_boleto || input.boleto || input.documento || 'nao informado',
    valor: formatCurrency(input.valor),
    vencimento: formatDate(input.vencimento),
    diasAtraso: Number(input.diasAtraso || input.dias_atraso || 0),
    empresa: input.empresa || 'NC Finance',
    linhaDigitavel: input.linha_digitavel || 'nao informado',
    codigoBarras: input.codigo_barras || 'nao informado',
    linkBoleto: input.link_boleto || input.boleto_url || 'nao informado',
    historyHint: getHistoryHint(input.historico),
  };

  const message = [style.greeting(context.nome), '', ...style.buildLines(context)]
    .filter(Boolean)
    .join('\n');

  return {
    tone: normalizedTone,
    subject: `${style.subjectPrefix} - ${context.documento}`,
    message,
    severity: meta.severity,
    actionSuggestion:
      delayBand === 'preventivo' && normalizedTone === 'amigavel'
        ? 'Manter o lembrete leve e preventivo ate a data de vencimento.'
        : style.actionSuggestion,
    summary: `${style.summaryPrefix} | ${context.numeroBoleto} | ${context.valor}`,
  };
}

export function getCollectionToneOptions() {
  return Object.entries(TONE_META).map(([value, meta]) => ({
    value,
    label: meta.label,
    severity: meta.severity,
  }));
}

export function getCollectionToneMeta(tone) {
  return TONE_META[normalizeTone(tone)];
}

export function getDefaultCollectionTone(input = {}) {
  const delayBand = inferDelayBand(input.diasAtraso || input.dias_atraso);
  if (delayBand === 'critico') return 'juridico';
  if (delayBand === 'moderado') return 'firme';
  if (delayBand === 'preventivo') return 'amigavel';
  return 'neutro';
}
