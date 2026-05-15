export const ZAPI_ERROR_KINDS = {
  INVALID_CLIENT_TOKEN: 'invalid_client_token',
  INVALID_INSTANCE: 'invalid_instance',
  RATE_LIMIT: 'rate_limit',
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
  UNKNOWN: 'unknown',
};

const INVALID_CLIENT_TOKEN_STATUSES = new Set([401, 403]);
const INVALID_INSTANCE_STATUSES = new Set([400, 404]);
const RATE_LIMIT_STATUSES = new Set([429]);

const TIMEOUT_PATTERNS = [
  'tempo limite',
  'timeout',
  'timed out',
  'abort',
  'aborted',
];

const UNAVAILABLE_PATTERNS = [
  'network',
  'fetch failed',
  'failed to fetch',
  'temporar',
  'unavailable',
  'indispon',
  'econnreset',
  'socket hang up',
];

const INVALID_CLIENT_TOKEN_PATTERNS = [
  'client token',
  'nao autorizado',
  'não autorizado',
  'not allowed',
  'forbidden',
  'acesso negado',
  'unauthorized',
];

const INVALID_INSTANCE_PATTERNS = [
  'instance not found',
  'instancia z-api nao encontrada',
  'instância z-api não encontrada',
  'instance id nao encontrado',
  'instance id não encontrado',
  'instancia inexistente',
  'instância inexistente',
];

const RATE_LIMIT_PATTERNS = [
  '429',
  'rate limit',
  'too many requests',
  'limite de requisicoes',
  'limite de requisições',
  'limite temporario',
  'limite temporário',
];

const ZAPI_ERROR_MESSAGES = {
  [ZAPI_ERROR_KINDS.INVALID_CLIENT_TOKEN]: 'Client Token invalido ou expirado',
  [ZAPI_ERROR_KINDS.INVALID_INSTANCE]: 'Instancia Z-API nao encontrada',
  [ZAPI_ERROR_KINDS.RATE_LIMIT]: 'Limite temporario excedido',
  [ZAPI_ERROR_KINDS.TEMPORARILY_UNAVAILABLE]: 'Z-API indisponivel no momento',
  [ZAPI_ERROR_KINDS.UNKNOWN]: 'Z-API indisponivel no momento',
};

function includesAny(message, patterns) {
  return patterns.some((pattern) => message.includes(pattern));
}

export function classifyZapiError(input = {}) {
  const status = Number(input.status || 0);
  const message = String(input.message || '').trim().toLowerCase();
  const name = String(input.name || '').trim().toLowerCase();

  if (INVALID_CLIENT_TOKEN_STATUSES.has(status)) {
    return ZAPI_ERROR_KINDS.INVALID_CLIENT_TOKEN;
  }

  if (INVALID_INSTANCE_STATUSES.has(status)) {
    return ZAPI_ERROR_KINDS.INVALID_INSTANCE;
  }

  if (RATE_LIMIT_STATUSES.has(status)) {
    return ZAPI_ERROR_KINDS.RATE_LIMIT;
  }

  if (includesAny(message, TIMEOUT_PATTERNS) || includesAny(name, TIMEOUT_PATTERNS)) {
    return ZAPI_ERROR_KINDS.TEMPORARILY_UNAVAILABLE;
  }

  if (includesAny(message, UNAVAILABLE_PATTERNS) || includesAny(name, UNAVAILABLE_PATTERNS)) {
    return ZAPI_ERROR_KINDS.TEMPORARILY_UNAVAILABLE;
  }

  if (includesAny(message, INVALID_CLIENT_TOKEN_PATTERNS)) {
    return ZAPI_ERROR_KINDS.INVALID_CLIENT_TOKEN;
  }

  if (includesAny(message, INVALID_INSTANCE_PATTERNS)) {
    return ZAPI_ERROR_KINDS.INVALID_INSTANCE;
  }

  if (includesAny(message, RATE_LIMIT_PATTERNS)) {
    return ZAPI_ERROR_KINDS.RATE_LIMIT;
  }

  return ZAPI_ERROR_KINDS.UNKNOWN;
}

export function getZapiUserMessage(kind) {
  return ZAPI_ERROR_MESSAGES[kind] || ZAPI_ERROR_MESSAGES[ZAPI_ERROR_KINDS.UNKNOWN];
}

export function buildZapiErrorInfo(input = {}) {
  const kind = classifyZapiError(input);
  return {
    kind,
    userMessage: getZapiUserMessage(kind),
  };
}

