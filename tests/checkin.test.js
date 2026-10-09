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
  toggleNotice,
} from '../src/checkin.js';
import { currentStatus } from '../src/forecast.js';
import { formatMoney } from '../src/money.js';

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

// Dados para as regras de abertura: shouldOpenCheckin só abre com conta ativa.
const openData = (o = {}) => data({ accounts: [{ id: 'a', name: 'Conta', type: 'expense', defaultAmount: 100, order: 1, active: true }], ...o });

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
    assert.equal(shouldOpenCheckin(openData({ settings: { checkinFrequency } }), now, null), true);
    assert.equal(shouldOpenCheckin(openData({ settings: { checkinFrequency } }), now, '2026-10-15'), true);
  }
});

test('sem conta ativa nunca abre (nenhuma conta ou só arquivadas), em qualquer frequência', () => {
  const archived = [{ id: 'a', name: 'Velha', type: 'expense', defaultAmount: 100, order: 1, active: false }];
  const now = local(2026, 10, 15);
  for (const accs of [[], archived]) {
    for (const checkinFrequency of ['always', 'daily', 'weekly']) {
      assert.equal(shouldOpenCheckin(data({ accounts: accs, settings: { checkinFrequency } }), now, null), false);
    }
    const withCheckin = data({ accounts: accs, checkins: [ck(local(2026, 10, 1), '2026-10')], settings: { checkinFrequency: 'weekly' } });
    assert.equal(shouldOpenCheckin(withCheckin, local(2026, 10, 30), null), false);
  }
  assert.equal(shouldOpenCheckin(openData(), now, null), true);
});

test('always: abre toda vez, mesmo logo depois de um check-in', () => {
  const d = openData({ checkins: [ck(local(2026, 10, 15, 9), '2026-10')], settings: { checkinFrequency: 'always' } });
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 9, 1), null), true);
});

test('daily: abre só quando o último check-in não é de hoje (dia local)', () => {
  const d = openData({ checkins: [ck(local(2026, 10, 14, 23, 59), '2026-10')], settings: { checkinFrequency: 'daily' } });
  // Um minuto depois, mas já é outro dia local.
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 0, 0), null), true);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 14, 23, 59, 30), null), false);

  const morning = openData({ checkins: [ck(local(2026, 10, 15, 0, 1), '2026-10')], settings: { checkinFrequency: 'daily' } });
  assert.equal(shouldOpenCheckin(morning, local(2026, 10, 15, 23, 59), null), false);
});

test('frequência ausente vale como daily', () => {
  const d = openData({ checkins: [ck(local(2026, 10, 15, 8), '2026-10')], settings: {} });
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 20), null), false);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 16, 8), null), true);
  const noSettings = { accounts: d.accounts, entries: [], checkins: d.checkins };
  assert.equal(shouldOpenCheckin(noSettings, local(2026, 10, 16, 8), null), true);
});

test('weekly: 6 dias não abre, 7 dias abre', () => {
  const last = local(2026, 10, 1, 10);
  const d = openData({ checkins: [ck(last, '2026-10')], settings: { checkinFrequency: 'weekly' } });
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 7, 10), null), false);
  assert.equal(shouldOpenCheckin(d, new Date(last.getTime() + 7 * 864e5 - 1), null), false);
  assert.equal(shouldOpenCheckin(d, new Date(last.getTime() + 7 * 864e5), null), true);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 20, 10), null), true);
});

test('último check-in é o de maior `at`, não o último da lista', () => {
  const d = openData({
    checkins: [ck(local(2026, 10, 15, 8), '2026-10'), ck(local(2026, 10, 10, 8), '2026-10')],
    settings: { checkinFrequency: 'daily' },
  });
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 20), null), false);
});

test('"Agora não": adiado hoje não abre; amanhã volta a abrir (daily)', () => {
  const d = openData({ checkins: [ck(local(2026, 10, 10), '2026-10')], settings: { checkinFrequency: 'daily' } });
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 9), '2026-10-15'), false);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 23, 59), '2026-10-15'), false);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 16, 0, 0), '2026-10-15'), true);
  assert.equal(shouldOpenCheckin(d, local(2026, 10, 15, 9), null), true);
});

test('"Agora não" com "toda vez" é ignorado', () => {
  const d = openData({ checkins: [ck(local(2026, 10, 10), '2026-10')], settings: { checkinFrequency: 'always' } });
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

// Exemplo do plano: Na conta 500; Salário 3.000 (padrão, estimado); contas do mês
// Nubank 900, Inter 600, Renner 300, C&A 200 (lançamentos) e Unha 150 (padrão, estimada).
const toggleAccounts = [
  { id: 'salario', name: 'Salário', type: 'income', defaultAmount: reais(3000), order: 1, active: true },
  { id: 'nubank', name: 'Nubank', type: 'expense', defaultAmount: null, order: 2, active: true },
  { id: 'inter', name: 'Inter', type: 'expense', defaultAmount: null, order: 3, active: true },
  { id: 'renner', name: 'Renner', type: 'expense', defaultAmount: null, order: 4, active: true },
  { id: 'cea', name: 'C&A', type: 'expense', defaultAmount: null, order: 5, active: true },
  { id: 'unha', name: 'Unha', type: 'expense', defaultAmount: reais(150), order: 6, active: true },
];
const entry = (accountId, v) => ({ accountId, month: '2026-10', amount: reais(v) });
const toggleEntries = [entry('nubank', 900), entry('inter', 600), entry('renner', 300), entry('cea', 200)];
const toggleData = (over = {}) => data({
  accounts: toggleAccounts,
  entries: toggleEntries,
  checkins: [ck(local(2026, 10, 3), '2026-10', { balance: reais(500) })],
  ...over,
});
// Aplica o resultado do toque aos dados, como a tela faz.
const apply = (d, r) => ({ ...d, entries: [...d.entries, ...r.entries], checkins: [...d.checkins, r.checkin] });
const NOW = (h) => local(2026, 10, 10, h);

test('buildToggle: o exemplo do plano, nos quatro toques', () => {
  assert.equal(currentStatus(toggleData(), NOW(9)).endOfMonth, reais(1350));

  let d = toggleData();
  const recebi = buildToggle(d, NOW(9), { field: 'incomeReceived', value: true });
  assert.deepEqual(recebi.entries, [entry('salario', 3000)]);
  assert.equal(recebi.total, reais(3000));
  assert.equal(recebi.checkin.balance, reais(3500));
  d = apply(d, recebi);
  let s = currentStatus(d, NOW(9));
  assert.equal(s.toReceive, 0);
  assert.equal(s.endOfMonth, reais(1350));

  const paguei = buildToggle(d, NOW(10), { field: 'billsPaid', value: true });
  assert.deepEqual(paguei.entries, [entry('unha', 150)]);
  assert.equal(paguei.total, reais(2150));
  assert.equal(paguei.checkin.balance, reais(1350));
  d = apply(d, paguei);
  s = currentStatus(d, NOW(10));
  assert.equal(s.toPay, 0);
  assert.equal(s.balance, reais(1350));
  assert.equal(s.endOfMonth, reais(1350));

  const desPaguei = buildToggle(d, NOW(11), { field: 'billsPaid', value: false });
  assert.deepEqual(desPaguei.entries, []);
  assert.equal(desPaguei.checkin.balance, reais(3500));
  d = apply(d, desPaguei);
  s = currentStatus(d, NOW(11));
  assert.equal(s.toPay, reais(2150));
  assert.equal(s.endOfMonth, reais(1350));

  const desRecebi = buildToggle(d, NOW(12), { field: 'incomeReceived', value: false });
  assert.deepEqual(desRecebi.entries, []);
  assert.equal(desRecebi.checkin.balance, reais(500));
  d = apply(d, desRecebi);
  assert.equal(currentStatus(d, NOW(12)).endOfMonth, reais(1350));
});

test('buildToggle: projectedBalance igual à sobra de antes nos quatro toques', () => {
  let d = toggleData();
  const before = currentStatus(d, NOW(8)).endOfMonth;
  const steps = [
    ['incomeReceived', true], ['billsPaid', true], ['billsPaid', false], ['incomeReceived', false],
  ];
  steps.forEach(([field, value], i) => {
    const r = buildToggle(d, NOW(9 + i), { field, value });
    assert.equal(r.checkin.projectedBalance, before);
    assert.equal(r.checkin.at, NOW(9 + i).toISOString());
    assert.equal(r.checkin.month, '2026-10');
    d = apply(d, r);
  });
});

test('buildToggle copia a outra marcação do último check-in do mês', () => {
  const d = toggleData({
    checkins: [
      ck(local(2026, 10, 8), '2026-10', { balance: reais(500), billsPaid: true, incomeReceived: false }),
      ck(local(2026, 10, 3), '2026-10', { balance: reais(9999), billsPaid: false, incomeReceived: true }),
    ],
  });
  const r = buildToggle(d, NOW(9), { field: 'incomeReceived', value: true });
  assert.equal(r.checkin.incomeReceived, true);
  assert.equal(r.checkin.billsPaid, true);
  assert.equal(r.checkin.balance, reais(3500));
  const r2 = buildToggle(d, NOW(9), { field: 'billsPaid', value: false });
  assert.equal(r2.checkin.billsPaid, false);
  assert.equal(r2.checkin.incomeReceived, false);
});

test('buildToggle: conta arquivada com lançamento entra no total e não vira lançamento', () => {
  const d = toggleData({
    accounts: [...toggleAccounts, { id: 'velha', name: 'Velha', type: 'expense', defaultAmount: reais(80), order: 7, active: false }],
    entries: [...toggleEntries, entry('velha', 100)],
  });
  const r = buildToggle(d, NOW(9), { field: 'billsPaid', value: true });
  assert.deepEqual(r.entries, [entry('unha', 150)]);
  assert.equal(r.total, reais(2250));
  assert.equal(r.checkin.balance, reais(500 - 2250));
});

test('buildToggle: conta arquivada sem lançamento e conta sem valor ficam de fora', () => {
  const d = toggleData({
    accounts: [
      ...toggleAccounts,
      { id: 'velha', name: 'Velha', type: 'expense', defaultAmount: reais(80), order: 7, active: false },
      { id: 'vazia', name: 'Vazia', type: 'expense', defaultAmount: null, order: 8, active: true },
    ],
  });
  const r = buildToggle(d, NOW(9), { field: 'billsPaid', value: true });
  assert.deepEqual(r.entries, [entry('unha', 150)]);
  assert.equal(r.total, reais(2150));
});

test('buildToggle: sem check-in no mês lança, mesmo com check-in do mês anterior', () => {
  assert.throws(() => buildToggle(toggleData({ checkins: [] }), NOW(9), { field: 'billsPaid', value: true }), Error);
  const old = toggleData({ checkins: [ck(local(2026, 9, 20), '2026-09', { balance: reais(500) })] });
  assert.throws(() => buildToggle(old, NOW(9), { field: 'incomeReceived', value: true }), Error);
});

test('buildToggle com field inválido lança', () => {
  assert.throws(() => buildToggle(toggleData(), NOW(9), { field: 'x', value: true }), Error);
});

test('desfazer: ligar e desligar billsPaid mostra a linha de novo com "Ainda não"', () => {
  let d = toggleData({ checkins: [ck(local(2026, 10, 3), '2026-10', { balance: reais(2000), incomeReceived: true })] });
  d = apply(d, buildToggle(d, NOW(9), { field: 'billsPaid', value: true }));
  assert.deepEqual(checkinForm(d, NOW(10)).bills, { show: false, preset: true });
  // Linha escondida continua gravando true.
  const hidden = buildCheckin(d, NOW(10), { balance: reais(1000), billsPaid: false, incomeReceived: false });
  assert.equal(hidden.billsPaid, true);
  d = apply(d, buildToggle(d, NOW(11), { field: 'billsPaid', value: false }));
  assert.deepEqual(checkinForm(d, NOW(12)).bills, { show: true, preset: false });
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

test('toggleNotice: os quatro textos e null com total 0', () => {
  const m3 = formatMoney(reais(3000));
  const m2 = formatMoney(reais(2150));
  assert.equal(toggleNotice('incomeReceived', true, reais(3000), '2026-10'), `Salário de outubro somado: +\u00a0${m3} na conta.`);
  assert.equal(toggleNotice('incomeReceived', false, reais(3000), '2026-10'), `Salário de outubro tirado: −\u00a0${m3} na conta.`);
  assert.equal(toggleNotice('billsPaid', true, reais(2150), '2026-10'), `Contas de outubro descontadas: −\u00a0${m2} na conta.`);
  assert.equal(toggleNotice('billsPaid', false, reais(2150), '2026-10'), `Contas de outubro devolvidas: +\u00a0${m2} na conta.`);
  assert.match(m3, /^R\$\s3\.000,00$/);
  assert.equal(toggleNotice('billsPaid', true, 0, '2026-10'), null);
  assert.equal(toggleNotice('incomeReceived', false, 0, '2026-10'), null);
});
