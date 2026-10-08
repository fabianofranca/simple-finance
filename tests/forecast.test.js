import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthOf,
  addMonths,
  effectiveAmount,
  monthTotals,
  project,
  currentStatus,
  canBuy,
} from '../src/forecast.js';

// Hoje fixo: 15/10/2026 (data local), mês corrente 2026-10.
const today = new Date(2026, 9, 15);

// Helpers de massa de teste. Valores em centavos.
const reais = (v) => Math.round(v * 100);
const expense = (id, defaultAmount = null, active = true) => ({
  id, name: id, type: 'expense', defaultAmount, order: 0, active,
});
const income = (id, defaultAmount = null, active = true) => ({
  id, name: id, type: 'income', defaultAmount, order: 0, active,
});
const entry = (accountId, month, amount) => ({
  accountId, month, amount, updatedAt: '2026-10-01T00:00:00.000Z',
});
const checkin = (month, balance, { billsPaid = false, incomeReceived = false, at } = {}) => ({
  at: at ?? `${month}-10T12:00:00.000Z`, month, balance, billsPaid, incomeReceived, projectedBalance: 0,
});
const data = ({ accounts = [], entries = [], checkins = [], settings = {} } = {}) => ({
  accounts, entries, checkins, settings,
});

// Salário 1.500 e contas 1.000 todo mês, check-in de outubro com saldo 0 e nada pago.
const steady = (extra = {}) => data({
  accounts: [income('salario', reais(1500)), expense('contas', reais(1000))],
  checkins: [checkin('2026-10', 0)],
  ...extra,
});

test('monthOf usa a data local', () => {
  assert.equal(monthOf(today), '2026-10');
  assert.equal(monthOf(new Date(2026, 0, 1)), '2026-01');
  assert.equal(monthOf(new Date(2026, 11, 31, 23, 59)), '2026-12');
});

test('addMonths vira o ano para frente e para trás', () => {
  assert.equal(addMonths('2026-10', 0), '2026-10');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-10', 15), '2028-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-10', -22), '2024-12');
});

test('caso 1: 1.500/1.000 sobra 500; mês seguinte 1.500/1.200 acumula 800', () => {
  const d = data({
    accounts: [income('salario'), expense('contas')],
    entries: [
      entry('salario', '2026-10', reais(1500)),
      entry('contas', '2026-10', reais(1000)),
      entry('salario', '2026-11', reais(1500)),
      entry('contas', '2026-11', reais(1200)),
    ],
    checkins: [checkin('2026-10', 0)],
  });
  assert.equal(currentStatus(d, today).endOfMonth, reais(500));
  const [nov] = project(d, today, 1);
  assert.deepEqual(nov, {
    month: '2026-11', income: reais(1500), expense: reais(1200), balance: reais(800),
  });
});

test('caso 2: "Ainda não" desconta D(A); "Já paguei" não desconta e Falta pagar = 0', () => {
  const accounts = [income('salario', reais(1500)), expense('contas', reais(1000))];
  const pending = data({ accounts, checkins: [checkin('2026-10', reais(500), { incomeReceived: true })] });
  assert.deepEqual(currentStatus(pending, today), {
    month: '2026-10', balance: reais(500), toPay: reais(1000), endOfMonth: reais(-500),
  });

  const paid = data({
    accounts,
    checkins: [checkin('2026-10', reais(500), { incomeReceived: true, billsPaid: true })],
  });
  assert.deepEqual(currentStatus(paid, today), {
    month: '2026-10', balance: reais(500), toPay: 0, endOfMonth: reais(500),
  });
});

test('caso 3: salário "Ainda não" soma R(A); "Já caiu" não soma', () => {
  const accounts = [income('salario', reais(1500)), expense('contas', reais(1000))];
  const waiting = data({ accounts, checkins: [checkin('2026-10', reais(500), { billsPaid: true })] });
  assert.equal(currentStatus(waiting, today).endOfMonth, reais(2000));

  const received = data({
    accounts,
    checkins: [checkin('2026-10', reais(500), { billsPaid: true, incomeReceived: true })],
  });
  assert.equal(currentStatus(received, today).endOfMonth, reais(500));
});

test('caso 4: lançamento vence padrão; padrão é estimativa; sem os dois é 0; arquivada ignora padrão', () => {
  const unha = expense('unha', reais(80));
  const entries = [entry('unha', '2026-10', reais(100))];
  assert.deepEqual(effectiveAmount(unha, '2026-10', entries), { amount: reais(100), estimated: false });
  assert.deepEqual(effectiveAmount(unha, '2026-11', entries), { amount: reais(80), estimated: true });
  assert.deepEqual(effectiveAmount(expense('avulsa'), '2026-10', []), { amount: 0, estimated: false });

  const old = expense('antiga', reais(50), false);
  const oldEntries = [entry('antiga', '2026-10', reais(30))];
  assert.deepEqual(effectiveAmount(old, '2026-10', oldEntries), { amount: reais(30), estimated: false });
  assert.deepEqual(effectiveAmount(old, '2026-11', oldEntries), { amount: 0, estimated: false });

  // Totais somam todas as contas, inclusive os lançamentos da arquivada.
  const d = data({
    accounts: [income('salario', reais(1500)), unha, old],
    entries: [...entries, ...oldEntries],
  });
  assert.deepEqual(monthTotals(d, '2026-10'), { income: reais(1500), expense: reais(130) });
  assert.deepEqual(monthTotals(d, '2026-11'), { income: reais(1500), expense: reais(80) });
});

test('caso 5: check-in de mês anterior atravessa os meses até hoje; sem check-in S = 0', () => {
  const accounts = [income('salario', reais(1500)), expense('contas', reais(1000))];
  const old = data({
    accounts,
    checkins: [
      checkin('2026-07', reais(9999)),
      checkin('2026-08', reais(1000), { billsPaid: true, incomeReceived: true }),
    ],
  });
  // Ago: 1.000; Set: +500; Out entra inteiro: +500.
  assert.deepEqual(currentStatus(old, today), {
    month: '2026-10', balance: reais(1000), toPay: reais(1000), endOfMonth: reais(2000),
  });
  assert.equal(project(old, today, 1)[0].balance, reais(2500));

  const none = data({ accounts });
  assert.deepEqual(currentStatus(none, today), {
    month: '2026-10', balance: 0, toPay: reais(1000), endOfMonth: reais(500),
  });
  assert.deepEqual(project(none, today, 2).map((p) => p.balance), [reais(1000), reais(1500)]);
});

test('base é o check-in de maior `at`, não o último da lista', () => {
  const d = steady({
    checkins: [
      checkin('2026-10', reais(300), { at: '2026-10-12T10:00:00.000Z' }),
      checkin('2026-10', reais(100), { at: '2026-10-03T10:00:00.000Z' }),
    ],
  });
  assert.equal(currentStatus(d, today).balance, reais(300));
});

test('check-in no futuro (relógio errado): o mês do check-in vira o mês corrente', () => {
  const d = steady({ checkins: [checkin('2026-11', reais(200))] });
  const status = currentStatus(d, today);
  assert.equal(status.month, '2026-11');
  assert.equal(status.endOfMonth, reais(700));
  assert.equal(project(d, today, 1)[0].month, '2026-12');
});

test('caso 6: Posso comprar positivo, 1ª parcela no mês seguinte', () => {
  const r = canBuy(steady(), today, { installment: reais(200), count: 3 });
  assert.equal(r.ok, true);
  assert.equal(r.firstNegative, null);
  assert.equal(r.alreadyNegative, null);
  assert.deepEqual(r.months, [
    { month: '2026-11', before: reais(1000), after: reais(800) },
    { month: '2026-12', before: reais(1500), after: reais(1100) },
    { month: '2027-01', before: reais(2000), after: reais(1400) },
  ]);
  for (const m of r.months) assert.ok(m.after >= 0);
});

test('caso 7: negativo dentro do horizonte aponta o mês e quanto falta', () => {
  const r = canBuy(steady(), today, { installment: reais(700), count: 3 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.firstNegative, { month: '2027-01', missing: reais(100) });
  assert.equal(r.alreadyNegative, null);
  assert.equal(r.months.length, 3);
});

test('caso 8: negativo só além do horizonte (n > H) também é detectado', () => {
  // Março/2027 tem uma despesa grande: o aperto vem na 5ª parcela.
  const d = steady({ entries: [entry('contas', '2027-03', reais(3000))] });
  const r = canBuy(d, today, { installment: reais(300), count: 6, horizon: 3 });
  assert.equal(r.months.length, 3);
  for (const m of r.months) assert.ok(m.after >= 0);
  assert.equal(r.ok, false);
  assert.deepEqual(r.firstNegative, { month: '2027-03', missing: reais(500) });
  assert.equal(r.alreadyNegative, null);
});

test('caso 9: já negativo sem a compra preenche alreadyNegative', () => {
  const d = steady({ entries: [entry('contas', '2026-12', reais(4000))] });
  const r = canBuy(d, today, { installment: reais(10), count: 1 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.alreadyNegative, { month: '2026-12', missing: reais(1500) });
  assert.deepEqual(r.firstNegative, { month: '2026-12', missing: reais(1510) });
});

test('canBuy usa o horizonte dos ajustes como padrão', () => {
  const r = canBuy(steady({ settings: { horizonMonths: 2 } }), today, { installment: 100, count: 1 });
  assert.deepEqual(r.months.map((m) => m.month), ['2026-11', '2026-12']);
  const fallback = canBuy(data({ accounts: [] }), today, { installment: 100, count: 1 });
  assert.equal(fallback.months.length, 3);
});

test('canBuy rejeita parcela e quantidade inválidas', () => {
  const d = steady();
  for (const bad of [0, -100, 1.5, '100', null, undefined, NaN]) {
    assert.throws(() => canBuy(d, today, { installment: bad, count: 1 }), RangeError);
    assert.throws(() => canBuy(d, today, { installment: 100, count: bad }), RangeError);
  }
});
