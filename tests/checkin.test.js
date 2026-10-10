import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localDay,
  shouldOpenCheckin,
  checkinForm,
  canConfirm,
  buildCheckin,
  buildPaid,
  dropNotice,
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

test('formulário sem nenhum check-in: saldo vazio e obrigatório', () => {
  assert.deepEqual(checkinForm(data({ accounts }), local(2026, 10, 15)), {
    month: '2026-10',
    balance: null,
  });
});

test('formulário com check-in do mês anterior: saldo vem do "Na conta" do cartão', () => {
  const d = data({
    accounts,
    checkins: [ck(local(2026, 9, 20), '2026-09', { balance: reais(700), billsPaid: true, incomeReceived: true })],
  });
  // Marcações antigas (billsPaid/incomeReceived) são ignoradas: só o saldo.
  assert.deepEqual(checkinForm(d, local(2026, 10, 1, 8)), { month: '2026-10', balance: reais(700) });
});

test('formulário pré-preenche com o Na conta do cartão (último saldo ± itens marcados depois)', () => {
  const d = data({
    accounts,
    entries: [{ accountId: 'contas', month: '2026-10', amount: reais(400), paidAt: iso(2026, 10, 5) }],
    checkins: [
      ck(local(2026, 10, 3), '2026-10', { balance: reais(500) }),
      ck(local(2026, 10, 1), '2026-10', { balance: reais(9999) }),
    ],
  });
  const form = checkinForm(d, local(2026, 10, 6));
  assert.equal(form.balance, currentStatus(d, local(2026, 10, 6)).balance);
  assert.deepEqual(form, { month: '2026-10', balance: reais(100) });
});

test('canConfirm: só exige saldo inteiro', () => {
  const form = { month: '2026-10', balance: null };
  assert.equal(canConfirm(form, { balance: null }), false);
  assert.equal(canConfirm(form, {}), false);
  assert.equal(canConfirm(form, undefined), false);
  assert.equal(canConfirm(form, { balance: 12.5 }), false);
  assert.equal(canConfirm(form, { balance: '10' }), false);
  assert.equal(canConfirm(form, { balance: reais(10) }), true);
  assert.equal(canConfirm(form, { balance: 0 }), true);
  assert.equal(canConfirm(form, { balance: reais(-50) }), true);
});

test('buildCheckin: payload com projectedBalance igual ao currentStatus com o check-in novo', () => {
  const d = data({
    accounts,
    checkins: [ck(local(2026, 10, 3), '2026-10', { balance: reais(9999) })],
  });
  const now = local(2026, 10, 15, 9, 30);
  const c = buildCheckin(d, now, { balance: reais(500) });
  // billsPaid/incomeReceived ficam false (colunas antigas); a sobra é 500 + 1.500 − 1.000.
  assert.deepEqual(c, {
    at: now.toISOString(),
    month: '2026-10',
    balance: reais(500),
    billsPaid: false,
    incomeReceived: false,
    projectedBalance: reais(1000),
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
  const c = buildCheckin(d, local(2026, 10, 8, 9), { balance: reais(880) });
  assert.equal(c.projectedBalance, reais(1380));
  const notice = dropNotice(d, c);
  assert.equal(notice.text, 'Sua sobra de outubro caiu R$ 120,00 desde 03/10');
});

// Exemplo do plano: Na conta 500; Salário 3.000 (padrão, estimado); contas do mês
// Nubank 900, Inter 600, Renner 300, C&A 200 (lançamentos) e Unha 150 (padrão, estimada).
const paidAccounts = [
  { id: 'salario', name: 'Salário', type: 'income', defaultAmount: reais(3000), order: 1, active: true },
  { id: 'nubank', name: 'Nubank', type: 'expense', defaultAmount: null, order: 2, active: true },
  { id: 'inter', name: 'Inter', type: 'expense', defaultAmount: null, order: 3, active: true },
  { id: 'renner', name: 'Renner', type: 'expense', defaultAmount: null, order: 4, active: true },
  { id: 'cea', name: 'C&A', type: 'expense', defaultAmount: null, order: 5, active: true },
  { id: 'unha', name: 'Unha', type: 'expense', defaultAmount: reais(150), order: 6, active: true },
];
const entry = (accountId, v) => ({ accountId, month: '2026-10', amount: reais(v) });
const paidEntries = [entry('nubank', 900), entry('inter', 600), entry('renner', 300), entry('cea', 200)];
const paidData = (over = {}) => data({
  accounts: paidAccounts,
  entries: paidEntries,
  checkins: [ck(local(2026, 10, 3), '2026-10', { balance: reais(500) })],
  ...over,
});
// Aplica o resultado do toque aos dados, como o store otimista faz (paidAt presente troca).
const apply = (d, r) => {
  const entries = d.entries.slice();
  for (const e of r.entries) {
    const i = entries.findIndex((x) => x.accountId === e.accountId && x.month === e.month);
    if (i >= 0) entries[i] = { ...entries[i], ...e };
    else entries.push({ ...e });
  }
  return { ...d, entries };
};
const NOW = (h) => local(2026, 10, 10, h);

test('buildPaid: marcar a Unha estimada vira lançamento de 150 com paidAt', () => {
  const d = paidData();
  const r = buildPaid(d, NOW(9), { accountId: 'unha', paid: true });
  assert.deepEqual(r.entries, [{ accountId: 'unha', month: '2026-10', amount: reais(150), paidAt: NOW(9).toISOString() }]);
  assert.equal(r.notice, `Unha pago: −\u00a0${formatMoney(reais(150))} na conta.`);

  const un = buildPaid(apply(d, r), NOW(10), { accountId: 'unha', paid: false });
  assert.deepEqual(un.entries, [{ accountId: 'unha', month: '2026-10', amount: reais(150), paidAt: null }]);
  assert.equal(un.notice, 'Unha desmarcado.');
});

test('buildPaid: textos de conta marcada, entrada marcada e desmarcadas', () => {
  const d = paidData();
  const nubank = buildPaid(d, NOW(9), { accountId: 'nubank', paid: true });
  assert.equal(nubank.notice, `Nubank pago: −\u00a0${formatMoney(reais(900))} na conta.`);
  assert.match(nubank.notice, /^Nubank pago: −\u00a0R\$\s900,00 na conta\.$/);
  assert.equal(nubank.entries[0].amount, reais(900));

  const salario = buildPaid(d, NOW(9), { accountId: 'salario', paid: true });
  assert.equal(salario.notice, `Salário recebido: +\u00a0${formatMoney(reais(3000))} na conta.`);
  assert.equal(salario.entries[0].amount, reais(3000));

  assert.equal(buildPaid(d, NOW(9), { accountId: 'nubank', paid: false }).notice, 'Nubank desmarcado.');
  assert.equal(buildPaid(d, NOW(9), { accountId: 'salario', paid: false }).notice, 'Salário desmarcado.');
});

test('buildPaid: valor efetivo 0 grava a marcação mas não tem aviso', () => {
  const d = paidData({
    accounts: [...paidAccounts, { id: 'vazia', name: 'Vazia', type: 'expense', defaultAmount: null, order: 7, active: true }],
  });
  const r = buildPaid(d, NOW(9), { accountId: 'vazia', paid: true });
  assert.equal(r.notice, null);
  assert.deepEqual(r.entries, [{ accountId: 'vazia', month: '2026-10', amount: 0, paidAt: NOW(9).toISOString() }]);
  assert.equal(buildPaid(d, NOW(9), { accountId: 'vazia', paid: false }).notice, null);
});

test('buildPaid: conta inexistente lança Error', () => {
  assert.throws(() => buildPaid(paidData(), NOW(9), { accountId: 'x', paid: true }), Error);
});

test('buildPaid: o exemplo do plano, nos toques e no check-in novo', () => {
  let d = paidData();
  assert.equal(currentStatus(d, NOW(8)).endOfMonth, reais(1350));

  d = apply(d, buildPaid(d, NOW(9), { accountId: 'salario', paid: true }));
  let s = currentStatus(d, NOW(9));
  assert.deepEqual([s.balance, s.toReceive, s.endOfMonth], [reais(3500), 0, reais(1350)]);

  d = apply(d, buildPaid(d, NOW(10), { accountId: 'nubank', paid: true }));
  s = currentStatus(d, NOW(10));
  assert.deepEqual([s.balance, s.toPay, s.endOfMonth], [reais(2600), reais(1250), reais(1350)]);

  // Check-in novo com o saldo mostrado: as marcações antigas deixam de mexer no Na conta.
  const novo = buildCheckin(d, NOW(11), { balance: reais(2600) });
  assert.equal(novo.projectedBalance, reais(1350));
  d = { ...d, checkins: [...d.checkins, novo] };
  s = currentStatus(d, NOW(11));
  assert.deepEqual([s.balance, s.toPay, s.endOfMonth], [reais(2600), reais(1250), reais(1350)]);

  // Desmarcar o Nubank (marcado antes do check-in): Na conta não muda, sobra cai 900.
  d = apply(d, buildPaid(d, NOW(12), { accountId: 'nubank', paid: false }));
  s = currentStatus(d, NOW(12));
  assert.deepEqual([s.balance, s.toPay, s.endOfMonth], [reais(2600), reais(2150), reais(450)]);
});

