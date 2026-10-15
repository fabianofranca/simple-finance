import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardAccounts, buildPurchase, recentPurchases, buildUndo } from '../src/purchases.js';
import { effectiveAmount } from '../src/forecast.js';
import { formatMoney } from '../src/money.js';

// Datas sempre locais (new Date(y, m, d, h)), para os testes valerem em qualquer fuso.
const local = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const reais = (v) => Math.round(v * 100);
const R = (v) => formatMoney(reais(v)); // "R$ 150,00" com o espaço não-quebrável do Intl

const NOW = local(2026, 10, 15); // mês atual: outubro de 2026

const nubank = { id: 'nubank', name: 'Nubank', type: 'expense', defaultAmount: null, order: 1, active: true, isCard: true };
const unha = { id: 'unha', name: 'Unha', type: 'expense', defaultAmount: reais(150), order: 2, active: true, isCard: false };
const salario = { id: 'salario', name: 'Salário', type: 'income', defaultAmount: reais(3000), order: 3, active: true };

// Nubank cartão com 1.000 em novembro e sem lançamento em dezembro; Unha com padrão 150.
function sample({ accounts = [nubank, unha, salario], entries, purchases = [] } = {}) {
  return {
    accounts,
    entries: entries ?? [{ accountId: 'nubank', month: '2026-11', amount: reais(1000), updatedAt: local(2026, 10, 1).toISOString() }],
    checkins: [],
    settings: {},
    purchases,
  };
}

// Servidor de mentira: aplica { purchase, entries } como o savePurchase do backend
// (upsert por id; atualizado_em = undoneAt ?? at; paidAt ausente mantém a marcação).
function apply(data, { purchase, entries }) {
  const purchases = data.purchases.filter((p) => p.id !== purchase.id).concat([{ ...purchase }]);
  return { ...data, purchases, entries: applyEntries(data.entries, entries, purchase.undoneAt ?? purchase.at) };
}

function applyEntries(current, entries, updatedAt) {
  const list = current.slice();
  for (const e of entries) {
    const i = list.findIndex((x) => x.accountId === e.accountId && x.month === e.month);
    if (e.amount === null) {
      if (i >= 0) list.splice(i, 1);
      continue;
    }
    const row = { accountId: e.accountId, month: e.month, amount: e.amount, updatedAt };
    if ('paidAt' in e) row.paidAt = e.paidAt;
    else if (i >= 0 && 'paidAt' in list[i]) row.paidAt = list[i].paidAt;
    if (i >= 0) list[i] = row;
    else list.push(row);
  }
  return list;
}

// Edição manual (tela Mês ou revisão) num instante `at`.
const edit = (data, entry, at) => ({ ...data, entries: applyEntries(data.entries, [entry], at.toISOString()) });

const amountOf = (data, accountId, month) => {
  const account = data.accounts.find((a) => a.id === accountId);
  return effectiveAmount(account, month, data.entries);
};
const entryOf = (data, accountId, month) => data.entries.find((e) => e.accountId === accountId && e.month === month);

const buy = (data, now = NOW, o = {}) =>
  buildPurchase(data, now, { id: 'p1', accountId: 'nubank', installment: reais(150), count: 3, ...o });

test('cardAccounts: só ativas, de despesa e marcadas, na ordem', () => {
  const accounts = [
    { ...nubank, order: 5 },
    { id: 'inter', name: 'Inter', type: 'expense', defaultAmount: null, order: 2, active: true, isCard: true },
    { id: 'velho', name: 'Velho', type: 'expense', defaultAmount: null, order: 1, active: false, isCard: true },
    { id: 'renda', name: 'Renda', type: 'income', defaultAmount: null, order: 1, active: true, isCard: true },
    unha,
    { id: 'antiga', name: 'Antiga', type: 'expense', defaultAmount: null, order: 3, active: true }, // sem a chave
  ];
  assert.deepEqual(cardAccounts({ accounts }).map((a) => a.id), ['inter', 'nubank']);
  assert.deepEqual(cardAccounts({}), []);
});

test('lançar 3 × 150 no Nubank: 1.150, 150 e 150 de novembro a janeiro; outubro igual', () => {
  const data = sample();
  const { purchase, entries, notice } = buy(data);
  assert.deepEqual(purchase, {
    id: 'p1', at: NOW.toISOString(), accountId: 'nubank', installment: reais(150), count: 3, firstMonth: '2026-11', undoneAt: null,
  });
  assert.deepEqual(entries, [
    { accountId: 'nubank', month: '2026-11', amount: reais(1150) },
    { accountId: 'nubank', month: '2026-12', amount: reais(150) },
    { accountId: 'nubank', month: '2027-01', amount: reais(150) },
  ]);
  for (const e of entries) assert.equal('paidAt' in e, false, 'sem paidAt: mantém a marcação');
  assert.equal(notice, `Lançado no Nubank: 3 parcelas de ${R(150)}, de novembro a janeiro de 2027.`);

  const after = apply(data, { purchase, entries });
  assert.deepEqual(amountOf(after, 'nubank', '2026-10'), { amount: 0, estimated: false });
  assert.equal(amountOf(after, 'nubank', '2026-11').amount, reais(1150));
  assert.equal(amountOf(after, 'nubank', '2027-02').amount, 0);
  assert.equal(entryOf(after, 'nubank', '2026-11').updatedAt, purchase.at);
});

test('lançar num cartão com valor padrão: o mês estimado vira padrão + parcela', () => {
  const data = sample({ accounts: [nubank, { ...unha, isCard: true }, salario] });
  const { entries } = buy(data, NOW, { accountId: 'unha', count: 2 });
  assert.deepEqual(entries.map((e) => [e.month, e.amount]), [['2026-11', reais(300)], ['2026-12', reais(300)]]);
  const after = apply(data, buy(data, NOW, { accountId: 'unha', count: 2 }));
  assert.deepEqual(amountOf(after, 'unha', '2026-11'), { amount: reais(300), estimated: false });
  assert.deepEqual(amountOf(after, 'unha', '2027-01'), { amount: reais(150), estimated: true });
});

test('lançar mantém a marcação de pago do mês (sem paidAt no envio)', () => {
  const paidAt = local(2026, 10, 2).toISOString();
  const data = sample({ entries: [{ accountId: 'nubank', month: '2026-11', amount: reais(1000), updatedAt: paidAt, paidAt }] });
  const launched = buy(data, NOW, { count: 1 });
  const after = apply(data, launched);
  assert.equal(entryOf(after, 'nubank', '2026-11').amount, reais(1150));
  assert.equal(entryOf(after, 'nubank', '2026-11').paidAt, paidAt);
});

test('buildPurchase: textos com 1 parcela e na virada do ano', () => {
  assert.equal(buy(sample(), NOW, { count: 1 }).notice, `Lançado no Nubank: ${R(150)}, em novembro.`);
  const dec = local(2026, 12, 3);
  assert.equal(buy(sample(), dec, { count: 1 }).notice, `Lançado no Nubank: ${R(150)}, em janeiro de 2027.`);
  assert.equal(buy(sample(), dec, { count: 1 }).purchase.firstMonth, '2027-01');
  assert.equal(buy(sample(), local(2026, 9, 1)).notice, `Lançado no Nubank: 3 parcelas de ${R(150)}, de outubro a dezembro.`);
  assert.equal(
    buy(sample(), local(2026, 11, 1), { count: 2 }).notice,
    `Lançado no Nubank: 2 parcelas de ${R(150)}, de dezembro a janeiro de 2027.`,
  );
});

test('buildPurchase: conta inexistente, não cartão, arquivada ou valores inválidos lançam erro', () => {
  const data = sample({ accounts: [nubank, unha, salario, { ...nubank, id: 'velho', active: false }] });
  assert.throws(() => buy(data, NOW, { accountId: 'nada' }));
  assert.throws(() => buy(data, NOW, { accountId: 'unha' }));
  assert.throws(() => buy(data, NOW, { accountId: 'salario' }));
  assert.throws(() => buy(data, NOW, { accountId: 'velho' }));
  assert.throws(() => buy(data, NOW, { installment: 0 }));
  assert.throws(() => buy(data, NOW, { installment: 15.5 }));
  assert.throws(() => buy(data, NOW, { count: 0 }));
  assert.throws(() => buy(data, NOW, { count: 25 }));
  assert.throws(() => buy(data, NOW, { id: '' }));
  assert.equal(buy(data, NOW, { count: 24 }).entries.length, 24);
});

test('desfazer logo em seguida: volta a 1.000 e dezembro e janeiro ficam sem lançamento', () => {
  let data = sample();
  data = apply(data, buy(data));
  const undo = buildUndo(data, local(2026, 10, 15, 13), 'p1');
  assert.deepEqual(undo.entries, [
    { accountId: 'nubank', month: '2026-11', amount: reais(1000) },
    { accountId: 'nubank', month: '2026-12', amount: null },
    { accountId: 'nubank', month: '2027-01', amount: null },
  ]);
  assert.deepEqual(undo.changedMonths, []);
  assert.equal(undo.message, `${R(150)} por mês será removido do Nubank, de novembro a janeiro de 2027.`);
  assert.equal(undo.purchase.undoneAt, local(2026, 10, 15, 13).toISOString());
  assert.equal(undo.purchase.at, NOW.toISOString());

  data = apply(data, undo);
  assert.equal(entryOf(data, 'nubank', '2026-11').amount, reais(1000));
  assert.equal(entryOf(data, 'nubank', '2026-12'), undefined);
  assert.equal(entryOf(data, 'nubank', '2027-01'), undefined);
  assert.equal(data.purchases.length, 1, 'desfazer faz upsert, não duplica');
  assert.throws(() => buildUndo(data, NOW, 'p1'), /desfeita/);
});

test('desfazer depois de editar novembro para 1.300: fica 1.150 e avisa novembro', () => {
  let data = sample();
  data = apply(data, buy(data));
  data = edit(data, { accountId: 'nubank', month: '2026-11', amount: reais(1300) }, local(2026, 10, 20));
  const undo = buildUndo(data, local(2026, 10, 21), 'p1');
  assert.equal(undo.entries[0].amount, reais(1150));
  assert.deepEqual(undo.changedMonths, ['2026-11']);
  assert.equal(
    undo.message,
    `${R(150)} por mês será removido do Nubank, de novembro a janeiro de 2027. O valor de novembro mudou depois da compra. Confira depois.`,
  );
});

test('edição anterior à compra não conta como mudança', () => {
  let data = sample();
  data = edit(data, { accountId: 'nubank', month: '2026-11', amount: reais(1200) }, local(2026, 10, 10));
  data = apply(data, buy(data));
  assert.deepEqual(buildUndo(data, local(2026, 10, 16), 'p1').changedMonths, []);
});

test('duas compras no mesmo cartão e mês: desfazer a primeira não avisa "mudou"', () => {
  let data = sample();
  data = apply(data, buy(data));
  const later = local(2026, 10, 16);
  data = apply(data, buildPurchase(data, later, { id: 'p2', accountId: 'nubank', installment: reais(100), count: 1 }));
  assert.equal(entryOf(data, 'nubank', '2026-11').amount, reais(1250));

  const undo = buildUndo(data, local(2026, 10, 17), 'p1');
  assert.deepEqual(undo.changedMonths, []);
  assert.deepEqual(undo.entries.map((e) => e.amount), [reais(1100), null, null]);
  data = apply(data, undo);

  // a segunda, desfeita depois da primeira: o updatedAt de novembro é o undoneAt da primeira
  const undo2 = buildUndo(data, local(2026, 10, 18), 'p2');
  assert.deepEqual(undo2.changedMonths, []);
  assert.deepEqual(undo2.entries, [{ accountId: 'nubank', month: '2026-11', amount: reais(1000) }]);
  assert.equal(undo2.message, `${R(100)} será removido do Nubank em novembro.`);
});

test('valor menor que a parcela vira 0 (nunca negativo)', () => {
  // cartão com padrão: 0 não é o "sem lançamento" (150), então grava 0
  const card = { ...unha, isCard: true };
  let data = sample({ accounts: [nubank, card, salario] });
  data = apply(data, buy(data, NOW, { accountId: 'unha', count: 1 }));
  data = edit(data, { accountId: 'unha', month: '2026-11', amount: reais(50) }, local(2026, 10, 20));
  const undo = buildUndo(data, local(2026, 10, 21), 'p1');
  assert.deepEqual(undo.entries, [{ accountId: 'unha', month: '2026-11', amount: 0 }]);
  assert.deepEqual(undo.changedMonths, ['2026-11']);

  // cartão sem padrão: 0 é o "sem lançamento", então apaga (volta a "—")
  let plain = sample({ entries: [] });
  plain = apply(plain, buy(plain, NOW, { count: 1 }));
  plain = edit(plain, { accountId: 'nubank', month: '2026-11', amount: reais(100) }, local(2026, 10, 20));
  assert.deepEqual(buildUndo(plain, local(2026, 10, 21), 'p1').entries, [{ accountId: 'nubank', month: '2026-11', amount: null }]);
});

test('mês com paidAt mantém o lançamento e a marcação (sem paidAt no envio)', () => {
  let data = sample();
  data = apply(data, buy(data));
  const paidAt = local(2026, 12, 5).toISOString();
  data = edit(data, { accountId: 'nubank', month: '2026-12', amount: reais(150), paidAt }, local(2026, 12, 5));
  const undo = buildUndo(data, local(2026, 12, 6), 'p1');
  // dezembro voltaria a 0 ("—"), mas está marcado: fica o lançamento com 0
  assert.deepEqual(undo.entries[1], { accountId: 'nubank', month: '2026-12', amount: 0 });
  for (const e of undo.entries) assert.equal('paidAt' in e, false);
  data = apply(data, undo);
  assert.equal(entryOf(data, 'nubank', '2026-12').paidAt, paidAt);
  assert.equal(entryOf(data, 'nubank', '2026-12').amount, 0);
});

test('conta com padrão: desfazer volta a estimado quando bate com o padrão', () => {
  const card = { ...unha, isCard: true };
  let data = sample({ accounts: [nubank, card, salario] });
  data = apply(data, buy(data, NOW, { accountId: 'unha' }));
  const undo = buildUndo(data, local(2026, 10, 16), 'p1');
  assert.deepEqual(undo.entries.map((e) => e.amount), [null, null, null]);
  data = apply(data, undo);
  assert.deepEqual(amountOf(data, 'unha', '2026-11'), { amount: reais(150), estimated: true });

  // arquivada: sem lançamento o mês vale 0, então 0 é o que apaga
  let archived = sample({ accounts: [nubank, card, salario] });
  archived = apply(archived, buy(archived, NOW, { accountId: 'unha', count: 1 }));
  archived = { ...archived, accounts: [nubank, { ...card, active: false }, salario] };
  assert.deepEqual(buildUndo(archived, local(2026, 10, 16), 'p1').entries, [{ accountId: 'unha', month: '2026-11', amount: reais(150) }]);
});

test('lançamento que sumiu conta como mudado; textos com vários meses', () => {
  let data = sample();
  data = apply(data, buy(data));
  // apagados à mão (ex.: "Usar o valor padrão")
  data = { ...data, entries: data.entries.filter((e) => e.month === '2026-11') };
  let undo = buildUndo(data, local(2026, 10, 16), 'p1');
  assert.deepEqual(undo.changedMonths, ['2026-12', '2027-01']);
  assert.match(undo.message, / Os valores de dezembro e janeiro de 2027 mudaram depois da compra\. Confira depois\.$/);

  data = { ...data, entries: [] };
  undo = buildUndo(data, local(2026, 10, 16), 'p1');
  assert.deepEqual(undo.changedMonths, ['2026-11', '2026-12', '2027-01']);
  assert.match(undo.message, / Os valores de novembro, dezembro e janeiro de 2027 mudaram depois da compra\. Confira depois\.$/);
  // sem lançamento e sem padrão: nada a subtrair, continua sem lançamento
  assert.deepEqual(undo.entries.map((e) => e.amount), [null, null, null]);
});

test('buildUndo: meses nomeados em relação ao mês atual de quando desfaz', () => {
  let data = sample();
  data = apply(data, buy(data));
  const undo = buildUndo(data, local(2027, 1, 10), 'p1');
  assert.equal(undo.message, `${R(150)} por mês será removido do Nubank, de novembro de 2026 a janeiro.`);
});

test('buildUndo: compra inexistente ou já desfeita lança erro', () => {
  const data = sample({ purchases: [{ id: 'x', at: NOW.toISOString(), accountId: 'nubank', installment: 1, count: 1, firstMonth: '2026-11', undoneAt: NOW.toISOString() }] });
  assert.throws(() => buildUndo(data, NOW, 'nada'), /inexistente/);
  assert.throws(() => buildUndo(data, NOW, 'x'), /desfeita/);
});

test('recentPurchases: mais recentes primeiro, ignora desfeitas e respeita o limite', () => {
  const p = (id, day, o = {}) => ({
    id, at: local(2026, 10, day).toISOString(), accountId: 'nubank', installment: reais(150), count: 3, firstMonth: '2026-11', undoneAt: null, ...o,
  });
  const purchases = [p('a', 3), p('b', 9), p('c', 5, { undoneAt: local(2026, 10, 6).toISOString() }), p('d', 7), p('e', 1), p('f', 2), p('g', 4), p('h', 8)];
  const data = sample({ purchases });
  assert.deepEqual(recentPurchases(data).map((x) => x.id), ['b', 'h', 'd', 'g', 'a'], 'padrão 5');
  assert.deepEqual(recentPurchases(data, 2).map((x) => x.id), ['b', 'h']);
  assert.deepEqual(recentPurchases(data, 20).map((x) => x.id), ['b', 'h', 'd', 'g', 'a', 'f', 'e']);
  assert.deepEqual(recentPurchases(data, 0).map((x) => x.id).length, 5, 'limite inválido usa o padrão');
  assert.deepEqual(recentPurchases(sample()), []);
  assert.deepEqual(recentPurchases({ accounts: [] }), [], 'dados sem purchases');
});

test('recentPurchases: textos prontos da lista', () => {
  const at = local(2026, 10, 15, 9).toISOString();
  const purchases = [
    { id: 'tres', at, accountId: 'nubank', installment: reais(150), count: 3, firstMonth: '2026-11', undoneAt: null },
    { id: 'uma', at: local(2026, 10, 14).toISOString(), accountId: 'nubank', installment: reais(89.9), count: 1, firstMonth: '2026-11', undoneAt: null },
    { id: 'virada', at: local(2026, 12, 2).toISOString(), accountId: 'velho', installment: reais(10), count: 2, firstMonth: '2027-01', undoneAt: null },
    { id: 'sumida', at: local(2026, 9, 2).toISOString(), accountId: 'apagada', installment: reais(10), count: 1, firstMonth: '2026-10', undoneAt: null },
  ];
  const velho = { ...nubank, id: 'velho', name: 'Cartão velho', active: false };
  const list = recentPurchases(sample({ accounts: [nubank, velho], purchases }), 10);
  const byId = Object.fromEntries(list.map((x) => [x.id, x]));

  assert.equal(byId.tres.title, `${R(150)} × 3 · Nubank`);
  assert.equal(byId.tres.detail, 'Lançada em 15/10 · novembro a janeiro de 2027');
  assert.equal(byId.tres.accountName, 'Nubank');
  assert.equal(byId.tres.installment, reais(150));
  assert.equal(byId.tres.count, 3);

  assert.equal(byId.uma.title, `${R(89.9)} · Nubank`);
  assert.equal(byId.uma.detail, 'Lançada em 14/10 · novembro');

  // arquivada mantém o nome; meses relativos ao mês em que foi lançada
  assert.equal(byId.virada.title, `${R(10)} × 2 · Cartão velho`);
  assert.equal(byId.virada.detail, 'Lançada em 02/12 · janeiro de 2027 a fevereiro de 2027');

  assert.equal(byId.sumida.title, `${R(10)} · Conta removida`);
});
