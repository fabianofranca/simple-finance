import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localDay,
  shouldOpenCheckin,
  checkinForm,
  canConfirm,
  buildCheckin,
  dropNotice,
  monthFlags,
  buildToggle,
  toggleText,
} from '../src/checkin.js';
import { currentStatus } from '../src/forecast.js';

// Datas sempre locais (new Date(y, m, d, h)); `at` é o ISO dessas datas,
// para os testes valerem em qualquer fuso.
const local = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (...args) => local(...args).toISOString();
const reais = (v) => Math.round(v * 100);

const ck = (date, month, { balance = 0, billsPaid = false, incomeReceived = false, projectedBalance = 0 } = {}) => ({
  at: date.toISOString(), month, balance, billsPaid, incomeReceived, projectedBalance,
});
const data = ({ accounts = [], entries = [], checkins = [], settings = {} } = {}) => ({
  accounts, entries, checkins, settings,
});

// Salário 1.500 e contas 1.000 todo mês.
const accounts = [
  { id: 'salario', name: 'Salário', type: 'income', defaultAmount: reais(1500), order: 2, active: true },
  { id: 'contas', name: 'Contas', type: 'expense', defaultAmount: reais(1000), order: 1, active: true },
];

test('localDay usa o dia local', () => {
  assert.equal(localDay(local(2026, 10, 3, 0, 5)), '2026-10-03');
  assert.equal(localDay(local(2026, 12, 31, 23, 59)), '2026-12-31');
});

test('sem nenhum check-in sempre abre, em qualquer frequência e mesmo adiado', () => {
  const now = local(2026, 10, 15);
  for (const checkinFrequency of ['always', 'daily', 'weekly', undefined]) {
    assert.equal(shouldOpenCheckin(data({ settings: { checkinFrequency } }), now, null), true);
    assert.equal(shouldOpenCheckin(data({ settings: { checkinFrequency } }), now, '2026-10-15'), true);
  }
});

test('always: abre toda vez, mesmo logo depois de um check-in', () => {
  const d = data({ checkins: [ck(local(2026, 10, 15, 9), '2026-10')], settings: { checkinFrequency: 'always' } });
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 9, 1), null), true);
});

test('daily: abre só quando o último check-in não é de hoje (dia local)', () => {
  const d = data({ checkins: [ck(local(2026, 10, 14, 23, 59), '2026-10')], settings: { checkinFrequency: 'daily' } });
  // Um minuto depois, mas já é outro dia local.
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 0, 0), null), true);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 14, 23, 59, 30), null), false);

  const morning = data({ checkins: [ck(local(2026, 10, 15, 0, 1), '2026-10')], settings: { checkinFrequency: 'daily' } });
  assert.equal(shouldOpenCheckin(morning, local(2026, 10, 15, 23, 59), null), false);
});

test('frequência ausente vale como daily', () => {
  const d = data({ checkins: [ck(local(2026, 10, 15, 8), '2026-10')], settings: {} });
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 20), null), false);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 16, 8), null), true);
  const noSettings = { accounts: [], entries: [], checkins: d.checkins };
  assert.equal(shouldOpenCheckin(noSettings, local(2026, 10, 16, 8), null), true);
});

test('weekly: 6 dias não abre, 7 dias abre', () => {
  const last = local(2026, 10, 1, 10);
  const d = data({ checkins: [ck(last, '2026-10')], settings: { checkinFrequency: 'weekly' } });
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 7, 10), null), false);
  assert.equal(shouldOpenCheckin(d, new Date(last.getTime() + 7 * 864e5 - 1), null), false);
  assert.equal(shouldOpenCheckin(d, new Date(last.getTime() + 7 * 864e5), null), true);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 20, 10), null), true);
});

test('último check-in é o de maior `at`, não o último da lista', () => {
  const d = data({
    checkins: [ck(local(2026, 10, 15, 8), '2026-10'), ck(local(2026, 10, 10, 8), '2026-10')],
    settings: { checkinFrequency: 'daily' },
  });
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 20), null), false);
});

test('"Agora não": adiado hoje não abre; amanhã volta a abrir (daily)', () => {
  const d = data({ checkins: [ck(local(2026, 10, 10), '2026-10')], settings: { checkinFrequency: 'daily' } });
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 9), '2026-10-15'), false);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 23, 59), '2026-10-15'), false);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 16, 0, 0), '2026-10-15'), true);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 9), null), true);
});

test('"Agora não" com "toda vez" é ignorado', () => {
  const d = data({ checkins: [ck(local(2026, 10, 10), '2026-10')], settings: { checkinFrequency: 'always' } });
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 9), '2026-10-15'), true);
});

test('formulário sem nenhum check-in: saldo vazio e linhas sem seleção', () => {
  assert.deepEqual(checkinForm(data({ accounts }), local(2026, 10, 15)), {
    month: '2026-10',
    balance: null,
    bills: { show: true, preset: null },
    income: { show: true, preset: null },
  });
});

test('primeiro check-in do mês vem sem pré-seleção, mesmo com check-in do mês anterior', () => {
  const d = data({
    accounts,
    checkins: [ck(local(2026, 9, 20), '2026-09', { balance: reais(700), billsPaid: true, incomeReceived: true })],
  });
  // Linhas de setembro voltam em outubro, e o saldo vem do último check-in.
  assert.deepEqual(checkinForm(d, local(2026, 10, 1, 8)), {
    month: '2026-10',
    balance: reais(700),
    bills: { show: true, preset: null },
    income: { show: true, preset: null },
  });
});

test('check-ins seguintes do mês vêm com a última resposta', () => {
  const d = data({
    accounts,
    checkins: [
      ck(local(2026, 10, 3), '2026-10', { balance: reais(500) }),
      ck(local(2026, 10, 5), '2026-10', { balance: reais(450) }),
    ],
  });
  assert.deepEqual(checkinForm(d, local(2026, 10, 6)), {
    month: '2026-10',
    balance: reais(450),
    bills: { show: true, preset: false },
    income: { show: true, preset: false },
  });
});

test('depois de um "sim" no mês a linha some, e volta no mês seguinte', () => {
  const d = data({
    accounts,
    checkins: [
      ck(local(2026, 10, 3), '2026-10', { balance: reais(2000), incomeReceived: true }),
      ck(local(2026, 10, 8), '2026-10', { balance: reais(1000), billsPaid: false, incomeReceived: true }),
    ],
  });
  const form = checkinForm(d, local(2026, 10, 10));
  assert.deepEqual(form.income, { show: false, preset: true });
  assert.deepEqual(form.bills, { show: true, preset: false });

  // Gravar com a linha escondida manda `true`, mesmo que a resposta venha falsa.
  const c = buildCheckin(d, local(2026, 10, 10), { balance: reais(1000), billsPaid: false, incomeReceived: false });
  assert.equal(c.incomeReceived, true);
  assert.equal(c.billsPaid, false);

  const next = checkinForm(d, local(2026, 11, 1, 9));
  assert.equal(next.month, '2026-11');
  assert.deepEqual(next.income, { show: true, preset: null });
  assert.deepEqual(next.bills, { show: true, preset: null });
});

test('canConfirm: saldo válido e cada linha visível respondida', () => {
  const open = { month: '2026-10', balance: null, bills: { show: true, preset: null }, income: { show: true, preset: null } };
  assert.equal(canConfirm(open, { balance: null, billsPaid: null, incomeReceived: null }), false);
  assert.equal(canConfirm(open, { balance: reais(10), billsPaid: null, incomeReceived: true }), false);
  assert.equal(canConfirm(open, { balance: reais(10), billsPaid: false, incomeReceived: null }), false);
  assert.equal(canConfirm(open, { balance: null, billsPaid: true, incomeReceived: true }), false);
  assert.equal(canConfirm(open, { balance: 12.5, billsPaid: true, incomeReceived: true }), false);
  assert.equal(canConfirm(open, { balance: reais(10), billsPaid: false, incomeReceived: false }), true);
  assert.equal(canConfirm(open, { balance: 0, billsPaid: true, incomeReceived: false }), true);
  assert.equal(canConfirm(open, { balance: reais(-50), billsPaid: true, incomeReceived: false }), true);

  const hidden = { ...open, income: { show: false, preset: true } };
  assert.equal(canConfirm(hidden, { balance: reais(10), billsPaid: false, incomeReceived: null }), true);
  assert.equal(canConfirm(hidden, { balance: reais(10), billsPaid: null, incomeReceived: null }), false);
});

test('buildCheckin: payload com projectedBalance igual ao currentStatus com o check-in novo', () => {
  const d = data({
    accounts,
    checkins: [ck(local(2026, 10, 3), '2026-10', { balance: reais(9999) })],
  });
  const now = local(2026, 10, 15, 9, 30);
  const c = buildCheckin(d, now, { balance: reais(500), billsPaid: false, incomeReceived: true });
  assert.deepEqual(c, {
    at: now.toISOString(),
    month: '2026-10',
    balance: reais(500),
    billsPaid: false,
    incomeReceived: true,
    projectedBalance: reais(-500),
  });
  const status = currentStatus({ ...d, checkins: [...d.checkins, c] }, now);
  assert.equal(c.projectedBalance, status.endOfMonth);
  // Não altera os dados recebidos.
  assert.equal(d.checkins.length, 1);
});

test('dropNotice: avisa só quando a sobra cai em relação ao check-in anterior do mês', () => {
  const prev = ck(local(2026, 10, 3, 9), '2026-10', { projectedBalance: reais(800) });
  const older = ck(local(2026, 10, 1, 9), '2026-10', { projectedBalance: reais(100) });
  const otherMonth = ck(local(2026, 9, 28, 9), '2026-09', { projectedBalance: reais(5000) });
  const d = data({ accounts, checkins: [older, prev, otherMonth] });

  const lower = ck(local(2026, 10, 15, 9), '2026-10', { projectedBalance: reais(680) });
  assert.deepEqual(dropNotice(d, lower), {
    month: '2026-10',
    drop: reais(120),
    since: '03/10',
    text: 'Sua sobra de outubro caiu R$ 120,00 desde 03/10',
  });

  // Mesmo com o check-in novo já nos dados (gravação otimista).
  assert.equal(dropNotice({ ...d, checkins: [...d.checkins, lower] }, lower).drop, reais(120));

  const same = ck(local(2026, 10, 15, 9), '2026-10', { projectedBalance: reais(800) });
  assert.equal(dropNotice(d, same), null);
  const higher = ck(local(2026, 10, 15, 9), '2026-10', { projectedBalance: reais(900) });
  assert.equal(dropNotice(d, higher), null);

  // Primeiro check-in do mês: nada para comparar (o de setembro não conta).
  const nov = ck(local(2026, 11, 1, 9), '2026-11', { projectedBalance: 0 });
  assert.equal(dropNotice(d, nov), null);
});

test('dropNotice com o payload de buildCheckin', () => {
  const first = ck(local(2026, 10, 3, 9), '2026-10', { balance: reais(1000), projectedBalance: reais(1500) });
  const d = data({ accounts, checkins: [first] });
  const c = buildCheckin(d, local(2026, 10, 8, 9), { balance: reais(880), billsPaid: false, incomeReceived: false });
  assert.equal(c.projectedBalance, reais(1380));
  const notice = dropNotice(d, c);
  assert.equal(notice.text, 'Sua sobra de outubro caiu R$ 120,00 desde 03/10');
});

test('buildToggle liga billsPaid mantendo incomeReceived do último check-in do mês', () => {
  const d = data({
    accounts,
    checkins: [ck(local(2026, 10, 3), '2026-10', { balance: reais(2000), incomeReceived: true })],
  });
  const now = local(2026, 10, 10, 9);
  const c = buildToggle(d, now, { field: 'billsPaid', value: true, balance: reais(1000) });
  assert.equal(c.at, now.toISOString());
  assert.equal(c.month, '2026-10');
  assert.equal(c.balance, reais(1000));
  assert.equal(c.billsPaid, true);
  assert.equal(c.incomeReceived, true);
  assert.equal(c.projectedBalance, reais(1000));
  assert.equal(c.projectedBalance, currentStatus({ ...d, checkins: [...d.checkins, c] }, now).endOfMonth);
});

test('buildToggle com field inválido lança', () => {
  const d = data({ accounts, checkins: [ck(local(2026, 10, 3), '2026-10')] });
  assert.throws(() => buildToggle(d, local(2026, 10, 10), { field: 'x', value: true, balance: 0 }), Error);
});

test('desfazer: ligar e desligar billsPaid mostra a linha de novo com "Ainda não"', () => {
  const now = local(2026, 10, 10, 9);
  let d = data({ accounts, checkins: [ck(local(2026, 10, 3), '2026-10', { balance: reais(2000), incomeReceived: true })] });
  const on = buildToggle(d, now, { field: 'billsPaid', value: true, balance: reais(1000) });
  d = { ...d, checkins: [...d.checkins, on] };
  assert.deepEqual(checkinForm(d, local(2026, 10, 10, 10)).bills, { show: false, preset: true });
  // Linha escondida continua gravando true.
  const hidden = buildCheckin(d, local(2026, 10, 10, 10), { balance: reais(1000), billsPaid: false, incomeReceived: false });
  assert.equal(hidden.billsPaid, true);

  const off = buildToggle(d, local(2026, 10, 10, 11), { field: 'billsPaid', value: false, balance: reais(1000) });
  d = { ...d, checkins: [...d.checkins, off] };
  assert.deepEqual(checkinForm(d, local(2026, 10, 10, 12)).bills, { show: true, preset: false });
});

test('monthFlags: sem check-in no mês (inclusive só do mês anterior) devolve tudo false', () => {
  const none = { hasCheckin: false, billsPaid: false, incomeReceived: false };
  assert.deepEqual(monthFlags(data(), local(2026, 10, 10)), none);
  const d = data({ checkins: [ck(local(2026, 9, 20), '2026-09', { billsPaid: true, incomeReceived: true })] });
  assert.deepEqual(monthFlags(d, local(2026, 10, 10)), none);
});

test('monthFlags usa o último check-in do mês por `at`, não o último da lista', () => {
  const d = data({
    checkins: [
      ck(local(2026, 10, 8), '2026-10', { billsPaid: true, incomeReceived: false }),
      ck(local(2026, 10, 3), '2026-10', { billsPaid: false, incomeReceived: true }),
    ],
  });
  assert.deepEqual(monthFlags(d, local(2026, 10, 10)), { hasCheckin: true, billsPaid: true, incomeReceived: false });
});

test('toggleText: os quatro textos do diálogo', () => {
  assert.deepEqual(toggleText('billsPaid', true, '2026-10'), { title: 'Contas de outubro pagas', label: 'Quanto ficou na conta?' });
  assert.deepEqual(toggleText('billsPaid', false, '2026-10'), { title: 'Contas de outubro ainda não pagas', label: 'Quanto tem na conta agora?' });
  assert.deepEqual(toggleText('incomeReceived', true, '2026-10'), { title: 'Salário de outubro recebido', label: 'Quanto tem na conta agora?' });
  assert.deepEqual(toggleText('incomeReceived', false, '2026-10'), { title: 'Salário de outubro ainda não caiu', label: 'Quanto tem na conta agora?' });
});
