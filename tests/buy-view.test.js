import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyView } from '../src/buy-view.js';

// Hoje fixo: 15/10/2026 (data local). Sobras sem compra:
// novembro 1.600, dezembro 1.700, janeiro 50.
const today = new Date(2026, 9, 15);
const reais = (v) => Math.round(v * 100);
// O Intl usa espaço não separável (U+00A0) depois do "R$".
const brl = (text) => text.replace(/R\$ /g, 'R$ ');

// Massa equivalente à do `seed` do Code.gs (a mesma de tests/month-view.test.js).
const MONTHS = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
function seedData() {
  const accounts = [
    { id: 'nubank', name: 'Nubank', type: 'expense', defaultAmount: null, order: 1, active: true },
    { id: 'inter', name: 'Inter', type: 'expense', defaultAmount: null, order: 2, active: true },
    { id: 'renner', name: 'Renner', type: 'expense', defaultAmount: null, order: 3, active: true },
    { id: 'cea', name: 'C&A', type: 'expense', defaultAmount: null, order: 4, active: true },
    { id: 'unha', name: 'Unha', type: 'expense', defaultAmount: reais(150), order: 5, active: true },
    { id: 'salario', name: 'Salário', type: 'income', defaultAmount: reais(3000), order: 6, active: true },
  ];
  const values = {
    nubank: [900, 1000, 1200, 2000, 1000, 900],
    inter: [600, 600, 800, 1500, 800, 600],
    renner: [300, 300, 400, 600, 400, 300],
    cea: [200, 200, 300, 400, 300, 200],
    unha: [null, null, 200, null, null, null],
  };
  const entries = [];
  for (const [accountId, list] of Object.entries(values)) {
    list.forEach((v, i) => {
      if (v !== null) entries.push({ accountId, month: MONTHS[i], amount: reais(v), updatedAt: '2026-10-01T00:00:00.000Z' });
    });
  }
  // Salário de outubro já recebido: marcado antes do check-in, que já inclui o dinheiro.
  entries.push({
    accountId: 'salario', month: '2026-10', amount: reais(3000),
    updatedAt: '2026-10-01T00:00:00.000Z', paidAt: new Date(2026, 9, 1, 8).toISOString(),
  });
  const checkins = [{
    at: new Date(2026, 9, 1, 9).toISOString(),
    month: '2026-10',
    balance: reais(3000),
    billsPaid: false,
    incomeReceived: false,
    projectedBalance: reais(850),
  }];
  return { accounts, entries, checkins, settings: { checkinFrequency: 'daily', horizonMonths: 3 } };
}

const row = (month, label, before, after) => ({
  month, label, before: reais(before), after: reais(after), negative: after < 0,
});

test('R$ 10,00 × 3: pode comprar', () => {
  assert.deepEqual(buyView(seedData(), today, { installment: reais(10), count: 3 }), {
    ok: true,
    headline: 'Pode comprar',
    detail: null,
    warning: null,
    range: brl('3 parcelas de R$ 10,00, de novembro a janeiro de 2027'),
    rows: [
      row('2026-11', 'novembro', 1600, 1590),
      row('2026-12', 'dezembro', 1700, 1680),
      row('2027-01', 'janeiro', 50, 20),
    ],
  });
});

test('R$ 50,00 × 1: pode comprar, janeiro fica em zero', () => {
  const v = buyView(seedData(), today, { installment: reais(50), count: 1 });
  assert.equal(v.ok, true);
  assert.equal(v.headline, 'Pode comprar');
  assert.equal(v.range, brl('1 parcela de R$ 50,00, em novembro'));
  assert.deepEqual(v.rows, [
    row('2026-11', 'novembro', 1600, 1550),
    row('2026-12', 'dezembro', 1700, 1650),
    row('2027-01', 'janeiro', 50, 0),
  ]);
  assert.equal(v.rows[2].negative, false);
});

test('R$ 50,01 × 1: não pode, faltando R$ 0,01 em janeiro', () => {
  const v = buyView(seedData(), today, { installment: 5001, count: 1 });
  assert.equal(v.ok, false);
  assert.equal(v.headline, 'Não pode');
  assert.equal(v.detail, brl('Em janeiro de 2027 fica faltando R$ 0,01'));
  assert.equal(v.warning, null);
  assert.equal(v.rows[2].after, -1);
  assert.equal(v.rows[2].negative, true);
});

test('R$ 100,00 × 3: não pode, faltando R$ 250,00 em janeiro', () => {
  const v = buyView(seedData(), today, { installment: reais(100), count: 3 });
  assert.equal(v.ok, false);
  assert.equal(v.headline, 'Não pode');
  assert.equal(v.detail, brl('Em janeiro de 2027 fica faltando R$ 250,00'));
  assert.equal(v.range, brl('3 parcelas de R$ 100,00, de novembro a janeiro de 2027'));
  assert.deepEqual(v.rows, [
    row('2026-11', 'novembro', 1600, 1500),
    row('2026-12', 'dezembro', 1700, 1500),
    row('2027-01', 'janeiro', 50, -250),
  ]);
});

test('R$ 10,00 × 6: pode comprar, confere até abril e lista só 3 meses', () => {
  const v = buyView(seedData(), today, { installment: reais(10), count: 6 });
  assert.equal(v.ok, true);
  assert.equal(v.detail, null);
  assert.equal(v.range, brl('6 parcelas de R$ 10,00, de novembro a abril de 2027'));
  assert.deepEqual(v.rows.map((r) => r.month), ['2026-11', '2026-12', '2027-01']);
});

test('horizonte 1: R$ 100,00 × 3 lista só novembro e não pode em janeiro', () => {
  const d = seedData();
  d.settings.horizonMonths = 1;
  const v = buyView(d, today, { installment: reais(100), count: 3 });
  assert.deepEqual(v.rows, [row('2026-11', 'novembro', 1600, 1500)]);
  assert.equal(v.ok, false);
  assert.equal(v.detail, brl('Em janeiro de 2027 fica faltando R$ 250,00'));
});

test('horizonte ausente ou inválido usa 3', () => {
  for (const horizonMonths of [undefined, null, 0, 'abc', 2.5]) {
    const d = seedData();
    d.settings.horizonMonths = horizonMonths;
    assert.equal(buyView(d, today, { installment: reais(10), count: 1 }).rows.length, 3);
  }
});

test('janeiro já negativo: aviso de R$ 50,00 e não pode faltando R$ 60,00', () => {
  const d = seedData();
  d.entries.find((e) => e.accountId === 'nubank' && e.month === '2027-01').amount = reais(2100);
  const v = buyView(d, today, { installment: reais(10), count: 1 });
  assert.equal(v.ok, false);
  assert.equal(v.headline, 'Não pode');
  assert.equal(v.warning, brl('Mesmo sem essa compra, janeiro de 2027 já fica negativo (faltam R$ 50,00).'));
  assert.equal(v.detail, brl('Em janeiro de 2027 fica faltando R$ 60,00'));
  assert.deepEqual(v.rows[2], row('2027-01', 'janeiro', -50, -60));
});

test('mês do mesmo ano não leva o ano no texto', () => {
  // Dezembro: 1.700 − 2 × 1.000 = −300 (novembro ainda fica em 600).
  const v = buyView(seedData(), today, { installment: reais(1000), count: 2 });
  assert.equal(v.ok, false);
  assert.equal(v.detail, brl('Em dezembro fica faltando R$ 300,00'));
  assert.equal(v.range, brl('2 parcelas de R$ 1.000,00, de novembro a dezembro'));
});

test('entrada inválida devolve erro sem calcular', () => {
  const d = seedData();
  for (const installment of [null, undefined, 0, -100, 10.5, '1000', NaN]) {
    assert.equal(buyView(d, today, { installment, count: 1 }).error, 'installment');
  }
  for (const count of [0, 25, -1, 1.5, null, undefined, '3']) {
    assert.equal(buyView(d, today, { installment: reais(10), count }).error, 'count');
  }
  assert.equal(typeof buyView(d, today, { installment: 0, count: 1 }).message, 'string');
  assert.equal(buyView(d, today).error, 'installment');
  // Limites válidos.
  assert.equal(buyView(d, today, { installment: 1, count: 24 }).ok, true);
});
