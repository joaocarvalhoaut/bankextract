import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFinancialRecordIdempotencyKey,
} from '../../src/utils/financialRecordIdempotency.js';
import {
  buildFinancialExportRows,
  getFinancialTipoLabel,
} from '../../src/utils/financialExport.js';

test('gera a mesma idempotency key para o mesmo titulo com formatacoes diferentes', () => {
  const base = {
    numero_boleto: '23790.12345 60000.000001 00000.123456 1 99990000125000',
    documento: 'DOC-123',
    nome: 'Cliente Exemplo',
    telefone: '(11) 99999-0000',
    data_vencimento: '2026-05-10',
    valor: 1250,
  };

  const sameRecordDifferentFormatting = {
    numero_boleto: '23790123456000000000100000123456199990000125000',
    documento: 'doc 123',
    nome: 'CLIENTE EXEMPLO',
    telefone: '11999990000',
    data_vencimento: '2026-05-10T00:00:00.000Z',
    valor: '1250.00',
  };

  assert.equal(
    buildFinancialRecordIdempotencyKey(base),
    buildFinancialRecordIdempotencyKey(sameRecordDifferentFormatting)
  );
});

test('usa fallback com nome e telefone quando o titulo nao tem documento identificador', () => {
  const key = buildFinancialRecordIdempotencyKey({
    nome: 'Acme Ltda',
    telefone: '(31) 98888-7777',
    data_vencimento: '2026-05-20',
    valor: 899.45,
  });

  assert.equal(key, 'fallback|acmeltda|31988887777|2026-05-20|89945');
});

test('exporta coluna tipo com labels amigaveis e fallback legado', () => {
  const { header, lines } = buildFinancialExportRows([
    {
      nome: 'Cliente 1',
      documento: 'DOC-1',
      data_vencimento: '2026-05-10',
      valor: 100,
      telefone: '11999990000',
      status: 'pendente',
      tipo: 'a_vencer',
      batch_id: 'batch-1',
    },
    {
      nome: 'Cliente 2',
      documento: 'DOC-2',
      data_vencimento: '2026-05-11',
      valor: 200,
      telefone: '',
      status: 'liquidado',
      tipo: '',
      batch_id: '',
    },
  ]);

  assert.deepEqual(header, ['Cliente', 'Documento', 'Vencimento', 'Valor', 'Telefone', 'Status', 'Tipo', 'batch_id']);
  assert.equal(lines[0][6], 'A vencer');
  assert.equal(lines[1][6], 'Vencidos');
});

test('mantem label amigavel para tipos conhecidos e converte tipos desconhecidos', () => {
  assert.equal(getFinancialTipoLabel('liquidacao'), 'Liquidacao');
  assert.equal(getFinancialTipoLabel('manual_assistido'), 'Manual Assistido');
});
