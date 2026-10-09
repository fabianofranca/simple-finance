import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthLabel, monthName, navRange, resolveMonth, monthView } from '../src/month-view.js';

// Hoje fixo: 15/10/2026 (data local).
const today = new Date(2026, 9, 15);
const reais = (v) => Math.round(v * 100);

// Massa equivalente à do `seed` do Code.gs, a partir de outubro/2026.
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
  const checkins = [{
    at: new Date(2026, 9, 1, 9).toISOString(),
    month: '2026-10',
    balance: reais(3000),
    billsPaid: false,
    incomeReceived: true,
    projectedBalance: reais(850),
  }];
  return { accounts, entries, checkins, settings: { checkinFrequency: 'daily', horizonMonths: 3 } };
}

test('monthLabel e monthName por extenso, em minúsculas', () => {
  assert.equal(monthLabel('2026-10'), 'outubro de 2026');
  assert.equal(monthLabel('2027-01'), 'janeiro de 2027');
  assert.equal(monthName('2026-10'), 'outubro');
  assert.equal(monthName('2026-03'), 'março');
});

test('navRange: 12 meses para trás e para frente', () => {
  assert.deepEqual(navRange('2026-10'), { min: '2025-10', max: '2027-10' });
  assert.deepEqual(navRange('2026-01'), { min: '2025-01', max: '2027-01' });
});

test('resolveMonth: fora da faixa ou inválido cai no mês atual', () => {
  assert.equal(resolveMonth('2025-10', '2026-10'), '2025-10');
  assert.equal(resolveMonth('2027-10', '2026-10'), '2027-10');
  assert.equal(resolveMonth('2025-09', '2026-10'), '2026-10');
  assert.equal(resolveMonth('2027-11', '2026-10'), '2026-10');
  for (const bad of ['2026-13', '2026-00', '2026-1', 'abc', '', null, undefined]) {
    assert.equal(resolveMonth(bad, '2026-10'), '2026-10');
  }
});

test('mês atual com a massa do seed: sobra 850 e próximos 1.600, 1.700 e 50', () => {
  const v = monthView(seedData(), today, '2026-10');
  assert.equal(v.kind, 'current');
  assert.equal(v.label, 'outubro de 2026');
  assert.equal(v.current, '2026-10');
  assert.equal(v.balance, reais(3000));
  assert.equal(v.toPay, reais(2150));
  assert.equal(v.endOfMonth, reais(850));
  assert.deepEqual(v.upcoming, [
    { month: '2026-11', income: reais(3000), expense: reais(2250), balance: reais(1600), label: 'novembro', negative: false },
    { month: '2026-12', income: reais(3000), expense: reais(2900), balance: reais(1700), label: 'dezembro', negative: false },
    { month: '2027-01', income: reais(3000), expense: reais(4650), balance: reais(50), label: 'janeiro', negative: false },
  ]);
  assert.equal(v.income, undefined);

  assert.deepEqual(v.rows.income, [
    { accountId: 'salario', name: 'Salário', amount: reais(3000), estimated: true, empty: false, hasDefault: true },
  ]);
  assert.deepEqual(v.rows.expense.map((r) => r.name), ['Nubank', 'Inter', 'Renner', 'C&A', 'Unha']);
  assert.deepEqual(v.rows.expense[0], {
    accountId: 'nubank', name: 'Nubank', amount: reais(900), estimated: false, empty: false, hasDefault: false,
  });
  assert.deepEqual(v.rows.expense[4], {
    accountId: 'unha', name: 'Unha', amount: reais(150), estimated: true, empty: false, hasDefault: true,
  });
});

test('upcoming usa o horizonte dos ajustes e marca negativos', () => {
  const d = seedData();
  d.settings.horizonMonths = 4;
  const v = monthView(d, today, '2026-10');
  assert.equal(v.upcoming.length, 4);
  // Fevereiro: 50 + 3.000 − 2.650 = 400.
  assert.deepEqual(v.upcoming[3], {
    month: '2027-02', income: reais(3000), expense: reais(2650), balance: reais(400), label: 'fevereiro', negative: false,
  });

  d.entries.find((e) => e.accountId === 'nubank' && e.month === '2027-01').amount = reais(2100);
  assert.equal(monthView(d, today, '2026-10').upcoming[2].negative, true);

  delete d.settings.horizonMonths;
  assert.equal(monthView(d, today, '2026-10').upcoming.length, 3);
});

test('mês futuro: Entra, Sai e sobra prevista do project', () => {
  const dec = monthView(seedData(), today, '2026-12');
  assert.equal(dec.kind, 'future');
  assert.equal(dec.income, reais(3000));
  assert.equal(dec.expense, reais(2900));
  assert.equal(dec.endOfMonth, reais(1700));
  assert.equal(dec.upcoming, undefined);
  assert.equal(dec.balance, undefined);
  // Lançamento da Unha em dezembro vence o padrão.
  assert.deepEqual(dec.rows.expense.find((r) => r.accountId === 'unha'), {
    accountId: 'unha', name: 'Unha', amount: reais(200), estimated: false, empty: false, hasDefault: true,
  });

  const mar = monthView(seedData(), today, '2027-03');
  // Fev: 400; Mar: 400 + 3.000 − 2.150 = 1.250.
  assert.equal(mar.endOfMonth, reais(1250));

  // Além da massa: só os padrões (3.000 − 150 por mês).
  const far = monthView(seedData(), today, '2027-10');
  assert.equal(far.kind, 'future');
  assert.equal(far.endOfMonth, reais(1250 + 7 * 2850));
  assert.equal(far.rows.expense.find((r) => r.accountId === 'nubank').empty, true);
});

test('mês passado: Entrou e Saiu, sem sobra', () => {
  const d = seedData();
  d.entries.push({ accountId: 'nubank', month: '2026-09', amount: reais(700), updatedAt: 'x' });
  const v = monthView(d, today, '2026-09');
  assert.equal(v.kind, 'past');
  assert.equal(v.label, 'setembro de 2026');
  assert.equal(v.income, reais(3000));
  assert.equal(v.expense, reais(850));
  assert.equal(v.endOfMonth, undefined);
  assert.equal(v.upcoming, undefined);
  assert.equal(v.toPay, undefined);
});

test('"—": sem lançamento e sem padrão a linha vem vazia', () => {
  const v = monthView(seedData(), today, '2026-09');
  const nubank = v.rows.expense.find((r) => r.accountId === 'nubank');
  assert.deepEqual(nubank, {
    accountId: 'nubank', name: 'Nubank', amount: 0, estimated: false, empty: true, hasDefault: false,
  });
  // Lançamento de valor zero não é "—".
  const d = seedData();
  d.entries.push({ accountId: 'cea', month: '2026-09', amount: 0, updatedAt: 'x' });
  assert.equal(monthView(d, today, '2026-09').rows.expense.find((r) => r.accountId === 'cea').empty, false);
});

test('arquivada aparece só com lançamento no mês e não usa o padrão', () => {
  const d = seedData();
  d.accounts.push({ id: 'velha', name: 'Velha', type: 'expense', defaultAmount: reais(99), order: 3, active: false });
  d.entries.push({ accountId: 'velha', month: '2026-11', amount: reais(40), updatedAt: 'x' });

  const oct = monthView(d, today, '2026-10');
  assert.equal(oct.rows.expense.some((r) => r.accountId === 'velha'), false);

  const nov = monthView(d, today, '2026-11');
  // Empate de ordem com a Renner: desempata pelo nome.
  assert.deepEqual(nov.rows.expense.map((r) => r.name), ['Nubank', 'Inter', 'Renner', 'Velha', 'C&A', 'Unha']);
  assert.deepEqual(nov.rows.expense.find((r) => r.accountId === 'velha'), {
    accountId: 'velha', name: 'Velha', amount: reais(40), estimated: false, empty: false, hasDefault: false,
  });
});

test('ordem por `order`, empate pelo nome', () => {
  const d = seedData();
  d.accounts.push({ id: 'aluguel', name: 'Aluguel', type: 'expense', defaultAmount: null, order: 1, active: true });
  d.accounts.push({ id: 'extra', name: 'Extra', type: 'income', defaultAmount: null, order: 0, active: true });
  const v = monthView(d, today, '2026-10');
  assert.deepEqual(v.rows.expense.map((r) => r.accountId), ['aluguel', 'nubank', 'inter', 'renner', 'cea', 'unha']);
  assert.deepEqual(v.rows.income.map((r) => r.accountId), ['extra', 'salario']);
  assert.equal(v.rows.income[0].empty, true);
});

test('limites de ±12 meses funcionam como passado e futuro', () => {
  const d = seedData();
  const { min, max } = navRange(monthView(d, today, '2026-10').current);
  assert.equal(monthView(d, today, min).kind, 'past');
  const last = monthView(d, today, max);
  assert.equal(last.kind, 'future');
  assert.equal(last.month, '2027-10');
});

test('mês atual traz toReceive e flags; tela do Fabiano sem check-in', () => {
  const accounts = [{ id: 's', name: 'Salário', type: 'income', defaultAmount: reais(1000), order: 1, active: true }];
  const v = monthView({ accounts, entries: [], checkins: [], settings: {} }, today, '2026-10');
  assert.equal(v.balance, 0);
  assert.equal(v.toReceive, reais(1000));
  assert.equal(v.toPay, 0);
  assert.equal(v.endOfMonth, reais(1000));
  assert.deepEqual(v.flags, { hasCheckin: false, billsPaid: false, incomeReceived: false });

  const seed = monthView(seedData(), today, '2026-10');
  assert.equal(seed.toReceive, 0);
  assert.deepEqual(seed.flags, { hasCheckin: true, billsPaid: false, incomeReceived: true });
});

test('mês passado e futuro não têm toReceive nem flags', () => {
  for (const month of ['2026-09', '2026-12']) {
    const v = monthView(seedData(), today, month);
    assert.equal('toReceive' in v, false);
    assert.equal('flags' in v, false);
  }
});
