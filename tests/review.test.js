import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewQuestions,
  questionText,
  monthEnd,
  reviewDone,
  daysSince,
  reminder,
} from '../src/review.js';

// Hoje fixo: 15/10/2026 (data local).
const today = new Date(2026, 9, 15);
const local = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
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

test('perguntas de novembro na ordem das contas, sem o salário', () => {
  const { month, items } = reviewQuestions(seedData(), today);
  assert.equal(month, '2026-11');
  assert.deepEqual(items, [
    { accountId: 'nubank', name: 'Nubank', amount: reais(1000), estimated: false, kind: 'confirm' },
    { accountId: 'inter', name: 'Inter', amount: reais(600), estimated: false, kind: 'confirm' },
    { accountId: 'renner', name: 'Renner', amount: reais(300), estimated: false, kind: 'confirm' },
    { accountId: 'cea', name: 'C&A', amount: reais(200), estimated: false, kind: 'confirm' },
    { accountId: 'unha', name: 'Unha', amount: reais(150), estimated: true, kind: 'confirm' },
  ]);
});

test('conta sem lançamento nem padrão vira ask; arquivada fica de fora', () => {
  const d = seedData();
  d.accounts.push({ id: 'farmacia', name: 'Farmácia', type: 'expense', defaultAmount: null, order: 7, active: true });
  d.accounts.push({ id: 'velha', name: 'Velha', type: 'expense', defaultAmount: reais(99), order: 2, active: false });
  d.entries.push({ accountId: 'velha', month: '2026-11', amount: reais(40), updatedAt: 'x' });
  const { items } = reviewQuestions(d, today);
  assert.equal(items.some((i) => i.accountId === 'velha'), false);
  assert.deepEqual(items[items.length - 1], {
    accountId: 'farmacia', name: 'Farmácia', amount: 0, estimated: false, kind: 'ask',
  });
  // Lançamento de valor zero ainda é confirm.
  d.entries.push({ accountId: 'farmacia', month: '2026-11', amount: 0, updatedAt: 'x' });
  assert.equal(reviewQuestions(d, today).items.at(-1).kind, 'confirm');
});

test('ordem por order com empate pelo nome; sem despesas ativas a lista vem vazia', () => {
  const d = seedData();
  d.accounts.push({ id: 'aluguel', name: 'Aluguel', type: 'expense', defaultAmount: reais(1), order: 2, active: true });
  assert.deepEqual(
    reviewQuestions(d, today).items.map((i) => i.accountId),
    ['nubank', 'aluguel', 'inter', 'renner', 'cea', 'unha'],
  );
  const none = seedData();
  none.accounts = none.accounts.filter((a) => a.type === 'income');
  assert.deepEqual(reviewQuestions(none, today), { month: '2026-11', items: [] });
});

test('mês da revisão vira o ano em dezembro', () => {
  const d = seedData();
  assert.equal(reviewQuestions(d, new Date(2026, 11, 3)).month, '2027-01');
});

test('questionText: confirm, estimado e ask', () => {
  const { month, items } = reviewQuestions(seedData(), today);
  assert.deepEqual(questionText(items[0], month), {
    title: 'Nubank · novembro',
    question: brl('Ainda está em R$ 1.000,00?'),
  });
  assert.deepEqual(questionText(items[4], month), {
    title: 'Unha · novembro',
    question: brl('Pelo valor padrão, deve ficar em R$ 150,00 (estimado). Continua assim?'),
  });
  const ask = { accountId: 'cea', name: 'C&A', amount: 0, estimated: false, kind: 'ask' };
  assert.deepEqual(questionText(ask, month), {
    title: 'C&A · novembro',
    question: 'Já sabe quanto vai ser em novembro?',
  });
});

test('monthEnd e reviewDone: Nubank de novembro de 1.000 para 1.200', () => {
  const d = seedData();
  const before = monthEnd(d, today, '2026-11');
  assert.equal(before, reais(1600));
  d.entries.find((e) => e.accountId === 'nubank' && e.month === '2026-11').amount = reais(1200);
  const after = monthEnd(d, today, '2026-11');
  assert.equal(after, reais(1400));
  assert.equal(
    reviewDone('2026-11', before, after),
    brl('Pronto! Sua sobra de novembro ficou em R$ 1.400,00 (antes R$ 1.600,00)'),
  );
  assert.equal(
    reviewDone('2026-11', reais(1600), reais(1600)),
    brl('Pronto! Sua sobra de novembro continua em R$ 1.600,00'),
  );
});

test('monthEnd: mês corrente, mais distante e passado', () => {
  const d = seedData();
  assert.equal(monthEnd(d, today, '2026-10'), reais(850));
  assert.equal(monthEnd(d, today, '2027-01'), reais(50));
  assert.equal(monthEnd(d, today, '2026-09'), null);
});

test('daysSince: dias de calendário local; nulo ou inválido → null', () => {
  const now = local(2026, 10, 15, 9);
  assert.equal(daysSince(local(2026, 10, 15, 8).toISOString(), now), 0);
  assert.equal(daysSince(local(2026, 10, 6, 20).toISOString(), now), 9);
  // Virada do dia local: 2 minutos depois já é 1 dia.
  assert.equal(daysSince(local(2026, 10, 14, 23, 59).toISOString(), local(2026, 10, 15, 0, 1)), 1);
  for (const bad of [null, undefined, '', 'abc', '2026-13-45T00:00:00Z', 123]) {
    assert.equal(daysSince(bad, now), null);
  }
});

test('lembrete: nunca revisou ou ISO inválido', () => {
  const now = local(2026, 10, 15);
  const text = 'Que tal revisar as contas do mês que vem?';
  assert.equal(reminder({ lastReviewAt: null }, now), text);
  assert.equal(reminder({}, now), text);
  assert.equal(reminder(undefined, now), text);
  assert.equal(reminder({ lastReviewAt: 'ontem' }, now), text);
});

test('lembrete: some com 6 dias e aparece com 7 ou mais', () => {
  const now = local(2026, 10, 15, 10);
  assert.equal(reminder({ lastReviewAt: local(2026, 10, 15, 8).toISOString() }, now), null);
  assert.equal(reminder({ lastReviewAt: local(2026, 10, 9, 8).toISOString() }, now), null);
  assert.equal(
    reminder({ lastReviewAt: local(2026, 10, 8, 18).toISOString() }, now),
    'Faz 7 dias que você não revisa as contas.',
  );
  assert.equal(
    reminder({ lastReviewAt: local(2026, 10, 6, 12).toISOString() }, now),
    'Faz 9 dias que você não revisa as contas.',
  );
});

test('lembrete: conta a virada do dia local, não 24 horas', () => {
  // Domingo 23:59 → domingo seguinte 00:01: menos de 7×24h, mas 7 dias de calendário.
  const last = local(2026, 10, 4, 23, 59).toISOString();
  assert.equal(reminder({ lastReviewAt: last }, local(2026, 10, 11, 0, 1)), 'Faz 7 dias que você não revisa as contas.');
  // Domingo 00:01 → sábado 23:59: quase 7×24h, mas só 6 dias de calendário.
  const early = local(2026, 10, 4, 0, 1).toISOString();
  assert.equal(reminder({ lastReviewAt: early }, local(2026, 10, 10, 23, 59)), null);
});

test('lembrete: revisão no futuro (relógio errado) não mostra a faixa', () => {
  const now = local(2026, 10, 15);
  assert.equal(reminder({ lastReviewAt: local(2026, 10, 20).toISOString() }, now), null);
});
