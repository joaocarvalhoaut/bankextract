import test from 'node:test';
import assert from 'node:assert/strict';

import { generateCollectionMessage } from '../../src/services/collectionMessageService.js';

const technicalHistory =
  'Configuracao: Template preventiva configurado - Template preventiva ausente.; Configuracao: Template vencimento configurado - Template vencimento ausente.';

for (const tone of ['amigavel', 'neutro', 'firme', 'juridico']) {
  test(`remove historico tecnico da mensagem final no tom ${tone}`, () => {
    const result = generateCollectionMessage(
      {
        nome: 'Cliente Real',
        documento: 'DOC-123',
        numero_boleto: 'BOL-456',
        valor: 715.66,
        vencimento: '2026-05-10',
        diasAtraso: 0,
        empresa: 'Empresa Real',
        linha_digitavel: '23793.38128 60004.000001 23000.123456 7 99990000125000',
        link_boleto: 'https://example.com/boleto',
        historico: technicalHistory,
      },
      tone,
    );

    assert.doesNotMatch(result.message, /Historico recente/i);
    assert.doesNotMatch(result.message, /template preventiva/i);
    assert.doesNotMatch(result.message, /template vencimento/i);
    assert.doesNotMatch(result.message, /configuracao/i);
  });
}

test('mantem historico funcional quando nao for tecnico', () => {
  const result = generateCollectionMessage(
    {
      nome: 'Cliente Real',
      documento: 'DOC-123',
      numero_boleto: 'BOL-456',
      valor: 715.66,
      vencimento: '2026-05-10',
      diasAtraso: 3,
      empresa: 'Empresa Real',
      linha_digitavel: '23793.38128 60004.000001 23000.123456 7 99990000125000',
      link_boleto: 'https://example.com/boleto',
      historico: ['Cliente pediu segunda via', 'Prometeu retorno hoje'],
    },
    'neutro',
  );

  assert.match(result.message, /Historico recente: Cliente pediu segunda via; Prometeu retorno hoje\./i);
});
