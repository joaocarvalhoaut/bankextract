import { normalizeText } from './format';

export const parseBankReport = (text) => {
  const rows = [];
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;
  const valueRegex = /([\d]{1,3}(?:\.\d{3})*,\d{2})/g;
  const ignoreWords = [
    'relatorio',
    'titulo',
    'periodo',
    'sicoob',
    'bradesco',
    'itau',
    'itau',
    'santander',
    'caixa',
    'banco',
    'agencia',
    'conta',
    'cedente',
    'cooperativa',
    'total',
    'totais',
    'subtotal',
    'quantidade',
    'qtd',
    'pagina',
    'page',
    'sacado',
    'nosso',
    'numero',
    'vencimento',
    'valor',
    'emissao',
    'cnpj',
    'cpf',
    'usuario'
  ];

  const shouldIgnore = (line) => {
    if (line.length < 15) return true;
    if (!dateRegex.test(line)) return true;
    if (!line.match(valueRegex)) return true;

    const tokens = normalizeText(line).split(/\s+/);
    const ignoredCount = tokens.filter((token) => ignoreWords.includes(token)).length;
    return ignoredCount / tokens.length > 0.6;
  };

  lines.forEach((line, index) => {
    if (shouldIgnore(line)) return;

    const dateMatch = line.match(dateRegex);
    const values = [...line.matchAll(valueRegex)];
    if (!dateMatch || values.length === 0) return;

    const amount = parseFloat(values.at(-1)[1].replace(/\./g, '').replace(',', '.'));
    if (!amount || amount <= 0) return;

    const [day, month, year] = dateMatch[1].split('/');
    const dueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    const boletoMatch = line.match(/\b(\d{4,}[-/]\d+|\d{5,})\b/);
    const numeroBoleto = boletoMatch?.[1] || '';

    let name = line
      .replace(dateRegex, '')
      .replace(valueRegex, '')
      .replace(/\b\d{4,}[-/]\d+\b/g, '')
      .replace(/\b\d{5,}\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    name = name.replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ.)]+$/g, '').trim();
    if (name.length < 3) return;

    rows.push({
      id: `preview_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
      nome: name.toUpperCase(),
      numeroBoleto,
      dataVencimento: dueDate,
      valor: amount,
      representanteId: null,
      telefone: '',
      observacao: '',
      status: 'pendente',
      linhaOriginal: line
    });
  });

  return rows;
};

export const daysLate = (dataVencimento, now = new Date()) => {
  if (!dataVencimento) return 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${dataVencimento}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return 0;
  dueDate.setHours(0, 0, 0, 0);
  if (dueDate >= today) return 0;
  return Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000));
};

export const calculateCharges = (row, config) => {
  const atraso = daysLate(row.dataVencimento);
  if (atraso <= 0 || row.status === 'liquidado') {
    return {
      juros: 0,
      multa: 0,
      valorAtualizado: Number(row.valor || 0),
      diasAtraso: 0
    };
  }

  const valor = Number(row.valor || 0);
  const multa = valor * (Number(config?.multaPercentual || 0) / 100);
  const juros = valor * (Number(config?.jurosPercentualDia || 0) / 100) * atraso;

  return {
    juros,
    multa,
    valorAtualizado: valor + multa + juros,
    diasAtraso: atraso
  };
};

export const recalculateRows = (rows, config) =>
  (rows || []).map((row) => ({
    ...row,
    ...calculateCharges(row, config)
  }));

export const detectProblems = (row, existingRows, previewRows) => {
  const problems = [];

  if (!row.nome || row.nome.trim().length < 3) {
    problems.push({ campo: 'nome', tipo: 'erro', msg: 'Nome muito curto ou vazio' });
  }

  if (!row.numeroBoleto || row.numeroBoleto.trim() === '') {
    problems.push({ campo: 'numeroBoleto', tipo: 'aviso', msg: 'Numero do boleto ausente' });
  }

  if (!row.valor || row.valor <= 0) {
    problems.push({ campo: 'valor', tipo: 'erro', msg: 'Valor invalido ou zerado' });
  }

  if (!row.dataVencimento || !/^\d{4}-\d{2}-\d{2}$/.test(row.dataVencimento)) {
    problems.push({ campo: 'dataVencimento', tipo: 'erro', msg: 'Data invalida' });
  }

  if (row.numeroBoleto && existingRows.some((item) => item.numeroBoleto === row.numeroBoleto)) {
    problems.push({ campo: 'numeroBoleto', tipo: 'aviso', msg: 'Boleto ja existe na base' });
  }

  if (row.numeroBoleto && previewRows.filter((item) => item.numeroBoleto === row.numeroBoleto).length > 1) {
    problems.push({ campo: 'numeroBoleto', tipo: 'aviso', msg: 'Duplicado na importacao' });
  }

  const year = Number(row.dataVencimento?.slice(0, 4));
  const currentYear = new Date().getFullYear();
  if (year && (year < currentYear - 5 || year > currentYear + 10)) {
    problems.push({ campo: 'dataVencimento', tipo: 'aviso', msg: 'Data fora do intervalo esperado' });
  }

  return problems;
};

export const filterRows = ({
  rows,
  search,
  filters,
  representatives = [],
  previewMode = false,
  previewFilter = 'todos'
}) => {
  let result = [...(rows || [])];

  if (search?.trim()) {
    const term = normalizeText(search);
    result = result.filter((row) => {
      const representative = representatives.find((item) => item.id === row.representanteId);
      return [
        row.nome,
        row.numeroBoleto,
        row.dataVencimento,
        row.telefone,
        row.observacao,
        representative?.nome,
        String(row.valor),
        String(row.valorAtualizado),
        String(row.juros),
        String(row.multa)
      ]
        .filter(Boolean)
        .some((field) => normalizeText(field).includes(term));
    });
  }

  if (!previewMode) {
    Object.entries(filters || {}).forEach(([field, values]) => {
      if (values?.length) {
        result = result.filter((row) => values.includes(String(row[field] ?? '')));
      }
    });
  }

  if (previewMode) {
    if (previewFilter === 'com_problema') {
      result = result.filter((row) => row.problemas?.length > 0);
    }
    if (previewFilter === 'duplicados') {
      result = result.filter((row) => row.problemas?.some((item) => normalizeText(item.msg).includes('duplic')));
    }
    if (previewFilter === 'sem_problema') {
      result = result.filter((row) => (row.problemas?.length || 0) === 0);
    }
  }

  return result;
};

export const sortRows = (rows, sortBy, representatives = []) => {
  const sorted = [...(rows || [])];
  if (!sortBy?.campo) return sorted;

  sorted.sort((a, b) => {
    let first;
    let second;

    if (sortBy.campo === 'representanteId') {
      first = representatives.find((item) => item.id === a.representanteId)?.nome || '';
      second = representatives.find((item) => item.id === b.representanteId)?.nome || '';
    } else {
      first = a[sortBy.campo];
      second = b[sortBy.campo];
    }

    if (typeof first === 'string') first = normalizeText(first);
    if (typeof second === 'string') second = normalizeText(second);

    if (first < second) return sortBy.direcao === 'asc' ? -1 : 1;
    if (first > second) return sortBy.direcao === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted;
};
