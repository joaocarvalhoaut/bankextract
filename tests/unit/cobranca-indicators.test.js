import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveCobrancaIndicatorMetrics,
  EMPTY_COBRANCA_DASHBOARD_META,
  normalizeCobrancaDashboardMeta,
} from '../../src/utils/cobrancaIndicators.js';

test('normaliza meta nula para estado seguro do dashboard', () => {
  assert.deepEqual(normalizeCobrancaDashboardMeta(null), EMPTY_COBRANCA_DASHBOARD_META);
});

test('normaliza campos numericos invalidos sem gerar NaN visual', () => {
  const result = normalizeCobrancaDashboardMeta({
    totalWhatsAppCharges: 'abc',
    manualWhatsAppCharges: undefined,
    autoWhatsAppCharges: '5',
    autoChargeActive: 1,
    activeAutoConfigsCount: 'x',
  });

  assert.deepEqual(result, {
    totalWhatsAppCharges: 0,
    manualWhatsAppCharges: 0,
    autoWhatsAppCharges: 5,
    autoChargeActive: true,
    activeAutoConfigsCount: 0,
    recordsCount: 0,
  });
});

test('deriva indicadores vazios sem crash quando rows e nullish', () => {
  assert.deepEqual(deriveCobrancaIndicatorMetrics(null), {
    totalVencido: 0,
    totalAVencer: 0,
    valorPotencial: 0,
    clientesSemTelefone: 0,
    titulosProtesto: 0,
  });
});

test('ignora datas invalidas e separa corretamente a vencer x vencidos', () => {
  const result = deriveCobrancaIndicatorMetrics([
    { status: 'pendente', dataVencimento: '2026-05-10', valor: 100, telefone: '1199999' },
    { status: 'pendente', dataVencimento: '2026-05-25', valor: 200, telefone: '' },
    { status: 'pendente', dataVencimento: 'data-invalida', valor: 999, telefone: '1199999' },
    { status: 'liquidado', dataVencimento: '2026-05-01', valor: 500, telefone: '1199999' },
  ], { todayIso: '2026-05-20' });

  assert.deepEqual(result, {
    totalVencido: 100,
    totalAVencer: 200,
    valorPotencial: 100,
    clientesSemTelefone: 0,
    titulosProtesto: 1,
  });
});
