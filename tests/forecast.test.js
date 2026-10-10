import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthOf,
  addMonths,
  effectiveAmount,
  monthTotals,
  pendingTotals,
  effectiveBalance,
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
const entry = (accountId, month, amount, paidAt) => ({
  accountId, month, amount, updatedAt: '2026-10-01T00:00:00.000Z', ...(paidAt !== undefined && { paidAt }),
});
// Check-ins antigos podiam trazer billsPaid/incomeReceived; agora são ignorados no cálculo.
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

test('caso 2: item marcado como pago sai de Falta pagar e do Na conta sem mudar a sobra', () => {
  const accounts = [income('salario', reais(1500)), expense('contas', reais(1000))];
  const c = checkin('2026-10', reais(500), { at: '2026-10-10T12:00:00.000Z' });
  const pending = data({ accounts, checkins: [c] });
  assert.deepEqual(currentStatus(pending, today), {
    month: '2026-10', balance: reais(500), toReceive: reais(1500), toPay: reais(1000), endOfMonth: reais(1000),
  });

  const paid = data({
    accounts,
    entries: [entry('contas', '2026-10', reais(1000), '2026-10-12T12:00:00.000Z')],
    checkins: [c],
  });
  assert.deepEqual(currentStatus(paid, today), {
    month: '2026-10', balance: reais(-500), toReceive: reais(1500), toPay: 0, endOfMonth: reais(1000),
  });
});

test('caso 3: entrada marcada como recebida sai de Falta receber e entra no Na conta', () => {
  const accounts = [income('salario', reais(1500)), expense('contas', reais(1000))];
  const c = checkin('2026-10', reais(500), { at: '2026-10-10T12:00:00.000Z' });
  const received = data({
    accounts,
    entries: [entry('salario', '2026-10', reais(1500), '2026-10-12T12:00:00.000Z')],
    checkins: [c],
  });
  assert.deepEqual(currentStatus(received, today), {
    month: '2026-10', balance: reais(2000), toReceive: 0, toPay: reais(1000), endOfMonth: reais(1000),
  });
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
  // billsPaid/incomeReceived antigos são ignorados: Ago: 1.000 + 500; Set: +500; Out: +500.
  assert.deepEqual(currentStatus(old, today), {
    month: '2026-10', balance: reais(1000), toReceive: reais(1500), toPay: reais(1000), endOfMonth: reais(2500),
  });
  assert.equal(project(old, today, 1)[0].balance, reais(3000));

  const none = data({ accounts });
  assert.deepEqual(currentStatus(none, today), {
    month: '2026-10', balance: 0, toReceive: reais(1500), toPay: reais(1000), endOfMonth: reais(500),
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

test('Falta receber: tela do Fabiano, sem check-in e só o salário padrão', () => {
  const d = data({ accounts: [income('salario', reais(1000))] });
  assert.deepEqual(currentStatus(d, today), {
    month: '2026-10', balance: 0, toReceive: reais(1000), toPay: 0, endOfMonth: reais(1000),
  });
});

test('Falta receber: com check-in no mês, a conta fecha em qualquer combinação de marcações', () => {
  const accounts = [income('salario', reais(3000)), expense('contas', reais(2000))];
  const c = checkin('2026-10', reais(3000), { at: '2026-10-10T12:00:00.000Z' });
  const later = '2026-10-12T12:00:00.000Z';
  for (const billPaid of [false, true]) {
    for (const incomeReceived of [false, true]) {
      const d = data({
        accounts,
        entries: [
          entry('contas', '2026-10', reais(2000), billPaid ? later : null),
          entry('salario', '2026-10', reais(3000), incomeReceived ? later : null),
        ],
        checkins: [c],
      });
      const x = currentStatus(d, today);
      assert.equal(x.endOfMonth, reais(4000), `${billPaid}/${incomeReceived}`);
      assert.equal(x.balance + x.toReceive - x.toPay, x.endOfMonth, `${billPaid}/${incomeReceived}`);
    }
  }
});

// ---- Fase 5: marcação de pago por item (paidAt) ----

// S = 500 (check-in em t0); Salário 3.000 (padrão, estimado); Nubank 900, Inter 600,
// Renner 300 e C&A 200 lançadas; Unha 150 (padrão, estimada). Sobra 1.350.
const t0 = '2026-10-10T09:00:00.000Z';
const t1 = '2026-10-11T09:00:00.000Z';
const t2 = '2026-10-12T09:00:00.000Z';
const t3 = '2026-10-13T09:00:00.000Z';
const phase5 = (extra = {}) => data({
  accounts: [
    income('salario', reais(3000)),
    expense('nubank'), expense('inter'), expense('renner'), expense('cea'),
    expense('unha', reais(150)),
  ],
  entries: [
    entry('nubank', '2026-10', reais(900)),
    entry('inter', '2026-10', reais(600)),
    entry('renner', '2026-10', reais(300)),
    entry('cea', '2026-10', reais(200)),
  ],
  checkins: [checkin('2026-10', reais(500), { at: t0 })],
  ...extra,
});
const mark = (d, accountId, amount, paidAt) => {
  const rest = d.entries.filter((e) => e.accountId !== accountId || e.month !== '2026-10');
  return { ...d, entries: [...rest, entry(accountId, '2026-10', amount, paidAt)] };
};

test('Fase 5: ponto de partida do exemplo', () => {
  assert.deepEqual(currentStatus(phase5(), today), {
    month: '2026-10', balance: reais(500), toReceive: reais(3000), toPay: reais(2150), endOfMonth: reais(1350),
  });
});

test('Fase 5: marcar o Salário soma no Na conta e não muda a sobra', () => {
  const d = mark(phase5(), 'salario', reais(3000), t1);
  assert.deepEqual(currentStatus(d, today), {
    month: '2026-10', balance: reais(3500), toReceive: 0, toPay: reais(2150), endOfMonth: reais(1350),
  });
});

test('Fase 5: marcar o Nubank tira do Na conta e de Falta pagar, sem mudar a sobra', () => {
  const d = mark(mark(phase5(), 'salario', reais(3000), t1), 'nubank', reais(900), t2);
  assert.deepEqual(currentStatus(d, today), {
    month: '2026-10', balance: reais(2600), toReceive: 0, toPay: reais(1250), endOfMonth: reais(1350),
  });
});

test('Fase 5: novo check-in com S = 2.600 ignora marcações anteriores a ele', () => {
  let d = mark(mark(phase5(), 'salario', reais(3000), t1), 'nubank', reais(900), t2);
  d = { ...d, checkins: [...d.checkins, checkin('2026-10', reais(2600), { at: t3 })] };
  assert.deepEqual(currentStatus(d, today), {
    month: '2026-10', balance: reais(2600), toReceive: 0, toPay: reais(1250), endOfMonth: reais(1350),
  });

  // Desmarcar o Nubank (marcado antes do check-in): o Na conta não muda, a conta volta a faltar.
  const undone = mark(d, 'nubank', reais(900), null);
  assert.deepEqual(currentStatus(undone, today), {
    month: '2026-10', balance: reais(2600), toReceive: 0, toPay: reais(2150), endOfMonth: reais(450),
  });
});

test('Fase 5: desmarcar logo depois de marcar (mesmo check-in) devolve o Na conta', () => {
  const marked = mark(phase5(), 'nubank', reais(900), t1);
  assert.equal(currentStatus(marked, today).balance, reais(-400));
  const undone = mark(marked, 'nubank', reais(900), null);
  assert.deepEqual(currentStatus(undone, today), currentStatus(phase5(), today));
});

test('Fase 5: marcação feita antes do check-in não conta (paidAt <= at)', () => {
  const d = mark(phase5(), 'nubank', reais(900), '2026-10-09T09:00:00.000Z');
  assert.equal(currentStatus(d, today).balance, reais(500));
  assert.equal(currentStatus(d, today).toPay, reais(1250));
});

test('Fase 5: item marcado em mês futuro não muda o mês atual', () => {
  const base = phase5({ entries: [...phase5().entries, entry('nubank', '2026-11', reais(1000))] });
  const marked = {
    ...base,
    entries: base.entries.map((e) => (e.month === '2026-11' ? { ...e, paidAt: t1 } : e)),
  };
  const before = currentStatus(base, today);
  const after = currentStatus(marked, today);
  assert.equal(after.balance, before.balance);
  assert.equal(after.toPay, before.toPay);
  assert.equal(after.toReceive, before.toReceive);
});

test('Fase 5: sem nenhum check-in, todo item marcado conta (base { balance: 0, at: "" })', () => {
  const d = data({
    accounts: [income('salario', reais(1500)), expense('contas'), expense('luz', reais(1000))],
    entries: [entry('salario', '2026-10', reais(1500), t1), entry('contas', '2026-10', reais(400), t2)],
  });
  assert.deepEqual(currentStatus(d, today), {
    month: '2026-10', balance: reais(1100), toReceive: 0, toPay: reais(1000), endOfMonth: reais(100),
  });
  assert.equal(effectiveBalance(d, { balance: 0, at: '' }), reais(1100));
});

test('effectiveBalance: soma receitas e subtrai despesas marcadas depois de base.at', () => {
  const d = mark(mark(phase5(), 'salario', reais(3000), t1), 'nubank', reais(900), t2);
  assert.equal(effectiveBalance(d, { balance: reais(500), at: t0 }), reais(2600));
  assert.equal(effectiveBalance(d, { balance: reais(500), at: t1 }), reais(-400));
  assert.equal(effectiveBalance(d, { balance: reais(500), at: t2 }), reais(500));
});

test('pendingTotals: soma só itens sem paidAt; estimado conta como não marcado', () => {
  assert.deepEqual(pendingTotals(phase5(), '2026-10'), { income: reais(3000), expense: reais(2150) });
  const d = mark(phase5(), 'unha', reais(150), t1);
  assert.deepEqual(pendingTotals(d, '2026-10'), { income: reais(3000), expense: reais(2000) });
  // paidAt null e ausente são equivalentes
  const nulled = mark(phase5(), 'nubank', reais(900), null);
  assert.deepEqual(pendingTotals(nulled, '2026-10'), pendingTotals(phase5(), '2026-10'));
  // monthTotals continua somando tudo
  assert.deepEqual(monthTotals(d, '2026-10'), { income: reais(3000), expense: reais(2150) });
});

test('pendingTotals: conta arquivada só conta com lançamento no mês, e some se marcada', () => {
  const old = expense('antiga', reais(50), false);
  const accounts = [income('salario', reais(1000)), old];
  const noEntry = data({ accounts });
  assert.deepEqual(pendingTotals(noEntry, '2026-10'), { income: reais(1000), expense: 0 });

  const withEntry = data({ accounts, entries: [entry('antiga', '2026-10', reais(30))] });
  assert.deepEqual(pendingTotals(withEntry, '2026-10'), { income: reais(1000), expense: reais(30) });
  assert.deepEqual(pendingTotals(withEntry, '2026-11'), { income: reais(1000), expense: 0 });

  const paid = data({ accounts, entries: [entry('antiga', '2026-10', reais(30), t1)] });
  assert.deepEqual(pendingTotals(paid, '2026-10'), { income: reais(1000), expense: 0 });
});

test('Fase 5: Posso comprar? e project seguem o novo cálculo', () => {
  const d = mark(phase5(), 'nubank', reais(900), t1);
  // Sobra em outubro 1.350; em novembro entram só as padrões (salário 3.000, unha 150).
  assert.equal(project(d, today, 1)[0].balance, reais(1350 + 3000 - 150));
  const r = canBuy(d, today, { installment: reais(100), count: 2 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.months[0], { month: '2026-11', before: reais(4200), after: reais(4100) });
});
