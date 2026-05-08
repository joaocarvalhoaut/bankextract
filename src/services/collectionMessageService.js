const TONE_META = {
  amigavel: {
    label: 'Amigavel',
    severity: 'info',
    actionLabel: 'Manter tom consultivo',
  },
  neutro: {
    label: 'Neutro',
    severity: 'info',
    actionLabel: 'Reforcar acompanhamento',
  },
  firme: {
    label: 'Firme',
    severity: 'warning',
    actionLabel: 'Cobrar retorno prioritario',
  },
  juridico: {
    label: 'Juridico',
    severity: 'danger',
    actionLabel: 'Escalar para tratativa formal',
  },
};

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return 'nao localizado';
  try {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T00:00:00`));
  } catch {
    return String(value);
  }
}

function normalizeTone(value) {
  return TONE_META[value] ? value : 'neutro';
}

function getHistoryHint(history) {
  if (!history) return '';
  if (Array.isArray(history) && history.length) {
    return `Historico recente: ${history.slice(0, 2).join('; ')}.`;
  }
  if (typeof history === 'string' && history.trim()) {
    return `Historico recente: ${history.trim()}.`;
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

function buildGreeting(tone, name) {
  const safeName = name || 'cliente';
  if (tone === 'juridico') return `Prezado(a) ${safeName},`;
  if (tone === 'firme') return `Ola, ${safeName},`;
  return `Ola, ${safeName},`;
}

function buildBodyByTone(tone, context) {
  const {
    documento,
    numeroBoleto,
    valor,
    vencimento,
    diasAtraso,
    empresa,
    linhaDigitavel,
    linkBoleto,
    historyHint,
  } = context;

  const commonBlock = [
    `Documento: ${documento}`,
    `Boleto: ${numeroBoleto}`,
    `Vencimento: ${vencimento}`,
    `Valor: ${valor}`,
    '',
    'Linha digitavel:',
    linhaDigitavel,
    '',
    'Link do boleto:',
    linkBoleto,
  ];

  if (tone === 'amigavel') {
    return [
      'Segue uma lembranca sobre o titulo abaixo, que permanece em acompanhamento em nosso sistema.',
      '',
      ...commonBlock,
      '',
      diasAtraso > 0
        ? `Hoje identificamos ${diasAtraso} dia(s) de atraso. Se ja houver pagamento, basta nos enviar o comprovante para baixa.`
        : 'Se precisar de apoio para localizar o boleto ou confirmar o vencimento, ficamos a disposicao.',
      historyHint,
      '',
      `Atenciosamente, equipe ${empresa}.`,
    ];
  }

  if (tone === 'firme') {
    return [
      'Identificamos pendencia em aberto e precisamos do seu retorno para regularizacao do titulo abaixo.',
      '',
      ...commonBlock,
      '',
      `O atraso atual e de ${diasAtraso} dia(s). Pedimos prioridade no pagamento ou no envio do comprovante ainda hoje.`,
      historyHint,
      '',
      `Atenciosamente, equipe ${empresa}.`,
    ];
  }

  if (tone === 'juridico') {
    return [
      'Consta em nosso controle financeiro a permanencia da inadimplencia do titulo abaixo.',
      '',
      ...commonBlock,
      '',
      `O atraso atual e de ${diasAtraso} dia(s). Solicitamos regularizacao imediata ou formalizacao de tratativa para evitar escalonamento interno.`,
      historyHint,
      '',
      `Atenciosamente, ${empresa}.`,
    ];
  }

  return [
    'Segue a cobranca referente ao titulo abaixo em acompanhamento financeiro.',
    '',
    ...commonBlock,
    '',
    diasAtraso > 0
      ? `No momento, o titulo registra ${diasAtraso} dia(s) de atraso em nosso sistema.`
      : 'O titulo esta em acompanhamento no vencimento informado.',
    historyHint,
    '',
    'Caso o pagamento ja tenha sido efetuado, desconsidere esta mensagem.',
    '',
    `Atenciosamente, equipe ${empresa}.`,
  ];
}

export function generateCollectionMessage(input = {}, tone = 'neutro') {
  const normalizedTone = normalizeTone(tone);
  const delayBand = inferDelayBand(input.diasAtraso);
  const meta = TONE_META[normalizedTone];
  const context = {
    nome: input.nome || input.cliente || 'cliente',
    telefone: input.telefone || 'nao localizado',
    documento: input.documento || input.numero_documento || 'nao localizado',
    numeroBoleto: input.numero_boleto || input.boleto || input.documento || 'nao localizado',
    valor: formatCurrency(input.valor),
    vencimento: formatDate(input.vencimento),
    diasAtraso: Number(input.diasAtraso || input.dias_atraso || 0),
    empresa: input.empresa || 'NC Finance',
    linhaDigitavel: input.linha_digitavel || 'nao localizado',
    codigoBarras: input.codigo_barras || 'nao localizado',
    linkBoleto: input.link_boleto || input.boleto_url || 'nao localizado',
    historyHint: getHistoryHint(input.historico),
  };

  const message = [
    buildGreeting(normalizedTone, context.nome),
    '',
    ...buildBodyByTone(normalizedTone, context),
  ]
    .filter(Boolean)
    .join('\n');

  const subject =
    normalizedTone === 'juridico'
      ? `Regularizacao imediata - ${context.documento}`
      : normalizedTone === 'firme'
        ? `Pendencia financeira - ${context.documento}`
        : normalizedTone === 'amigavel'
          ? `Lembrete de pagamento - ${context.documento}`
          : `Cobranca do titulo ${context.documento}`;

  return {
    tone: normalizedTone,
    subject,
    message,
    severity: meta.severity,
    actionSuggestion:
      normalizedTone === 'juridico'
        ? 'Encaminhar para tratativa formal se nao houver retorno.'
        : normalizedTone === 'firme'
          ? 'Solicitar confirmacao de pagamento com prioridade.'
          : delayBand === 'preventivo'
            ? 'Manter acompanhamento consultivo ate o vencimento.'
            : 'Acompanhar resposta do cliente e atualizar status na central.',
    summary: `${meta.label} · ${context.numeroBoleto} · ${context.valor}`,
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
