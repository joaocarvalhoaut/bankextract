import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildZapiErrorInfo,
  ZAPI_ERROR_KINDS,
} from '../../src/shared/zapiErrorMapping.js';

test('mapeia HTTP 400 para instancia invalida', () => {
  const result = buildZapiErrorInfo({ status: 400, message: 'Instance not found' });
  assert.equal(result.kind, ZAPI_ERROR_KINDS.INVALID_INSTANCE);
  assert.equal(result.userMessage, 'Instancia Z-API nao encontrada');
});

test('mapeia HTTP 401 para credencial invalida', () => {
  const result = buildZapiErrorInfo({ status: 401, message: 'Unauthorized' });
  assert.equal(result.kind, ZAPI_ERROR_KINDS.INVALID_CLIENT_TOKEN);
  assert.equal(result.userMessage, 'Client Token invalido ou expirado');
});

test('mapeia HTTP 403 para credencial invalida', () => {
  const result = buildZapiErrorInfo({ status: 403, message: 'Client-Token not allowed' });
  assert.equal(result.kind, ZAPI_ERROR_KINDS.INVALID_CLIENT_TOKEN);
  assert.equal(result.userMessage, 'Client Token invalido ou expirado');
});

test('mapeia HTTP 404 para instancia invalida', () => {
  const result = buildZapiErrorInfo({ status: 404, message: 'Not found' });
  assert.equal(result.kind, ZAPI_ERROR_KINDS.INVALID_INSTANCE);
  assert.equal(result.userMessage, 'Instancia Z-API nao encontrada');
});

test('mapeia HTTP 429 para limite temporario', () => {
  const result = buildZapiErrorInfo({ status: 429, message: 'Too many requests' });
  assert.equal(result.kind, ZAPI_ERROR_KINDS.RATE_LIMIT);
  assert.equal(result.userMessage, 'Limite temporario excedido');
});

test('mapeia timeout para indisponibilidade temporaria', () => {
  const result = buildZapiErrorInfo({ message: 'Tempo limite excedido ao gerar o QR Code da Z-API.' });
  assert.equal(result.kind, ZAPI_ERROR_KINDS.TEMPORARILY_UNAVAILABLE);
  assert.equal(result.userMessage, 'Z-API indisponivel no momento');
});

