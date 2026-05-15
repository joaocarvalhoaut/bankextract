import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChecklistPreviewContext,
  buildChecklistPreviewSummary,
} from '../../src/utils/checklistPreview.js';

test('monta contexto real do checklist sem placeholders fake', () => {
  const context = buildChecklistPreviewContext({
    sampleCharge: {
      nome: 'Cliente Real',
      documento: 'DOC-123',
      numero_boleto: '23793.38128 60004.000001 23000.123456 7 99990000125000',
      data_vencimento: '2026-05-10',
      valor: 1250,
      telefone: '11999990000',
      linha_digitavel: '23793.38128 60004.000001 23000.123456 7 99990000125000',
      boleto_url: 'https://drive.google.com/file/d/abc/view',
      codigo_barras: '23797999900001250003381286000400000123000123456',
    },
    companyName: 'Empresa Real',
  });

  assert.equal(context.documento, 'DOC-123');
  assert.equal(context.numero_boleto, '23793.38128 60004.000001 23000.123456 7 99990000125000');
  assert.equal(context.telefone, '11999990000');
  assert.equal(context.link_boleto, 'https://drive.google.com/file/d/abc/view');
  assert.equal(context.historico, '');
});

test('usa nao informado apenas quando o dado realmente nao existe', () => {
  const context = buildChecklistPreviewContext({
    sampleCharge: null,
    companyName: '',
  });
  const summary = buildChecklistPreviewSummary(context);

  assert.equal(summary.documento, 'nao informado');
  assert.equal(summary.boleto, 'nao informado');
  assert.equal(summary.telefone, 'nao informado');
  assert.equal(summary.linhaDigitavel, 'nao informado');
  assert.equal(summary.linkBoleto, 'nao informado');
  assert.equal(summary.diasAtraso, 0);
});
