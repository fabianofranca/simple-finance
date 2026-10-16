import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeAccounts,
  archivedAccounts,
  nextOrder,
  newAccount,
  editAccount,
  move,
  archive,
  reactivate,
  archivePlan,
  deletePlan,
} from '../src/accounts.js';

const acc = (id, order, active = true, extra = {}) => ({
  id, name: id[0].toUpperCase() + id.slice(1), type: 'expense', defaultAmount: null, order, active, ...extra,
});

function sample() {
  return [
    acc('inter', 2),
    acc('nubank', 1),
    acc('velha', 3, false),
    acc('renner', 4),
    acc('antiga', 9, false),
    acc('cea', 5),
  ];
}

test('activeAccounts e archivedAccounts ordenadas, empate pelo nome', () => {
  const list = [...sample(), acc('aluguel', 2)];
  assert.deepEqual(activeAccounts(list).map((a) => a.id), ['nubank', 'aluguel', 'inter', 'renner', 'cea']);
  assert.deepEqual(archivedAccounts(list).map((a) => a.id), ['velha', 'antiga']);
  assert.deepEqual(activeAccounts(undefined), []);
  assert.deepEqual(archivedAccounts([]), []);
});

test('nextOrder conta as arquivadas; lista vazia → 1', () => {
  assert.equal(nextOrder(sample()), 10);
  assert.equal(nextOrder([acc('a', 3), acc('b', 7, false)]), 8);
  assert.equal(nextOrder([]), 1);
  assert.equal(nextOrder(undefined), 1);
});

test('newAccount: nome aparado, sem id, ativa e no fim', () => {
  const a = newAccount({ name: '  Farmácia  ', type: 'expense', defaultAmount: 8000 }, sample());
  assert.deepEqual(a, { name: 'Farmácia', type: 'expense', defaultAmount: 8000, order: 10, active: true, isCard: false });
  assert.equal('id' in a, false);
  const b = newAccount({ name: 'Extra', type: 'income' }, []);
  assert.deepEqual(b, { name: 'Extra', type: 'income', defaultAmount: null, order: 1, active: true, isCard: false });
});

test('newAccount: isCard só vale para despesa', () => {
  assert.equal(newAccount({ name: 'Nubank', type: 'expense', isCard: true }, []).isCard, true);
  assert.equal(newAccount({ name: 'Nubank', type: 'expense', isCard: false }, []).isCard, false);
  assert.equal(newAccount({ name: 'Nubank', type: 'expense', isCard: 'sim' }, []).isCard, false);
  assert.equal(newAccount({ name: 'Salário', type: 'income', isCard: true }, []).isCard, false);
});

test('editAccount: mantém id, ordem e situação; isCard ausente mantém, virar Entrada desmarca', () => {
  const card = acc('nubank', 3, false, { isCard: true });
  assert.deepEqual(editAccount(card, { name: ' Nubank Roxo ', type: 'expense', defaultAmount: 5000 }), {
    ...card, name: 'Nubank Roxo', defaultAmount: 5000,
  });
  assert.equal(editAccount(card, { name: 'Nubank', type: 'expense', isCard: false }).isCard, false);
  assert.equal(editAccount(card, { name: 'Nubank', type: 'income' }).isCard, false);
  assert.equal(editAccount(acc('inter', 1), { name: 'Inter', type: 'expense' }).isCard, false, 'conta antiga sem a chave');
  assert.equal(editAccount(acc('inter', 1), { name: 'Inter', type: 'expense', isCard: true }).isCard, true);
  assert.equal(editAccount(card, { name: '  ', type: 'expense' }), null);
  assert.equal(editAccount(card, { name: 'X', type: 'outro' }), null);
  assert.equal(card.isCard, true, 'não altera a conta recebida');
});

test('archive, reactivate e move mantêm isCard', () => {
  const card = acc('nubank', 1, true, { isCard: true });
  assert.equal(archive(card).isCard, true);
  assert.equal(reactivate(archive(card)).isCard, true);
  const list = [card, acc('inter', 2)];
  assert.equal(move(list, 'nubank', 'down').find((a) => a.id === 'nubank').isCard, true);
});

test('newAccount recusa nome vazio ou tipo inválido', () => {
  assert.equal(newAccount({ name: '   ', type: 'expense' }, []), null);
  assert.equal(newAccount({ name: '', type: 'expense' }, []), null);
  assert.equal(newAccount({ type: 'expense' }, []), null);
  assert.equal(newAccount({ name: 'X', type: 'outro' }, []), null);
  assert.equal(newAccount(undefined, []), null);
});

test('move troca o order com a vizinha ativa, pulando arquivadas', () => {
  const list = sample();
  // Renner (4) sobe: a vizinha ativa é a Inter (2), não a Velha arquivada (3).
  assert.deepEqual(move(list, 'renner', 'up'), [
    { ...acc('renner', 2) },
    { ...acc('inter', 4) },
  ]);
  assert.deepEqual(move(list, 'inter', 'down'), [
    { ...acc('inter', 4) },
    { ...acc('renner', 2) },
  ]);
  // Aceita -1/1 também.
  assert.deepEqual(move(list, 'nubank', 1), move(list, 'nubank', 'down'));
  // Não altera a lista recebida.
  assert.deepEqual(list, sample());
});

test('move no topo, no fim, arquivada ou id desconhecido não muda nada', () => {
  const list = sample();
  assert.deepEqual(move(list, 'nubank', 'up'), []);
  assert.deepEqual(move(list, 'cea', 'down'), []);
  assert.deepEqual(move(list, 'velha', 'up'), []);
  assert.deepEqual(move(list, 'nada', 'up'), []);
  assert.deepEqual(move(list, 'inter', 'lado'), []);
});

test('move com order repetido renumera as ativas 1..n', () => {
  const list = [acc('a', 1), acc('b', 1), acc('c', 1), acc('d', 7), acc('x', 2, false)];
  // Ordem atual: a, b, c (empate pelo nome), d. C sobe: a, c, b, d.
  const changed = move(list, 'c', 'up');
  assert.deepEqual(changed, [acc('c', 2), acc('b', 3), acc('d', 4)]);
  // "a" já tinha order 1 e não mudou, então não vem na lista.
  assert.equal(changed.some((x) => x.id === 'a'), false);
});

test('move só troca com contas do mesmo tipo: despesa não troca com receita vizinha', () => {
  const list = [
    acc('nubank', 1),
    acc('inter', 2),
    acc('salario', 3, true, { type: 'income' }),
    acc('unha', 4),
    acc('extra', 5, true, { type: 'income' }),
  ];
  // Unha (4) sobe: a vizinha de despesa é a Inter (2), não o Salário (3).
  assert.deepEqual(move(list, 'unha', 'up'), [acc('unha', 2), acc('inter', 4)]);
  // Salário (3) desce: a vizinha de receita é o Extra (5), não a Unha (4).
  assert.deepEqual(move(list, 'salario', 'down'), [
    acc('salario', 5, true, { type: 'income' }),
    acc('extra', 3, true, { type: 'income' }),
  ]);
});

test('move nas pontas da lista do próprio tipo devolve []', () => {
  const list = [
    acc('salario', 1, true, { type: 'income' }),
    acc('nubank', 2),
    acc('inter', 3),
    acc('extra', 4, true, { type: 'income' }),
  ];
  // Nubank é a primeira despesa, mesmo com uma receita antes dela.
  assert.deepEqual(move(list, 'nubank', 'up'), []);
  assert.deepEqual(move(list, 'inter', 'down'), []);
  assert.deepEqual(move(list, 'salario', 'up'), []);
  assert.deepEqual(move(list, 'extra', 'down'), []);
});

test('move com order repetido renumera só o grupo do tipo e não mexe no outro', () => {
  const list = [
    acc('a', 1),
    acc('b', 1),
    acc('s1', 1, true, { type: 'income' }),
    acc('s2', 1, true, { type: 'income' }),
    acc('c', 1),
  ];
  // Despesas (empate pelo nome): a, b, c. C sobe: a, c, b.
  const changed = move(list, 'c', 'up');
  assert.deepEqual(changed, [acc('c', 2), acc('b', 3)]);
  assert.equal(changed.some((x) => x.type === 'income'), false);
  // Aplicando, a ordem relativa das receitas continua s1, s2 e a das despesas é a, c, b.
  const applied = list.map((x) => changed.find((c) => c.id === x.id) || x);
  assert.deepEqual(activeAccounts(applied).filter((x) => x.type === 'expense').map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(activeAccounts(applied).filter((x) => x.type === 'income').map((x) => x.id), ['s1', 's2']);
});

test('archive e reactivate trocam active e mantêm o order', () => {
  const a = acc('nubank', 4);
  assert.deepEqual(archive(a), { ...a, active: false });
  assert.deepEqual(reactivate(archive(a)), a);
  assert.equal(a.active, true);
});

test('archivedAccounts ignora as excluídas; activeAccounts não muda', () => {
  const list = [...sample(), acc('sumida', 6, false, { deleted: true }), acc('pendente', 7, false, { deleted: false })];
  assert.deepEqual(archivedAccounts(list).map((a) => a.id), ['velha', 'pendente', 'antiga']);
  assert.deepEqual(activeAccounts(list).map((a) => a.id), ['nubank', 'inter', 'renner', 'cea']);
});

// Arquivar e excluir: mês atual outubro de 2026.
const NOW = new Date(2026, 9, 15, 12);
const reais = (v) => Math.round(v * 100);
const nbsp = (text) => text.replace(/\u00a0/g, ' ');

// Nubank (cartão) com 900 em outubro, 1.000 em novembro, 800 em dezembro e 500 em janeiro de 2027;
// Inter com 300 em setembro e outubro (sem futuros); Renner com valor futuro que não pode sumir.
function planData({ nubankActive = true } = {}) {
  const entry = (accountId, month, v, extra = {}) => ({ accountId, month, amount: reais(v), updatedAt: 'x', ...extra });
  return {
    accounts: [
      acc('nubank', 1, nubankActive, { isCard: true, defaultAmount: reais(700) }),
      acc('inter', 2),
      acc('renner', 3),
    ],
    entries: [
      entry('nubank', '2027-01', 500),
      entry('nubank', '2026-10', 900),
      entry('renner', '2026-11', 50),
      entry('nubank', '2026-12', 800, { paidAt: '2026-10-10T12:00:00.000Z' }),
      entry('nubank', '2026-11', 1000),
      entry('nubank', '2026-09', 950),
      entry('inter', '2026-09', 300),
      entry('inter', '2026-10', 300),
    ],
  };
}

test('archivePlan: apaga novembro, dezembro e janeiro, mantém outubro e diz o que sai', () => {
  const data = planData();
  const before = JSON.stringify(data);
  const plan = archivePlan(data, NOW, 'nubank');
  assert.deepEqual(plan.account, { ...data.accounts[0], active: false });
  assert.equal(plan.account.isCard, true);
  assert.deepEqual(plan.entries, [
    { accountId: 'nubank', month: '2026-11', amount: null },
    { accountId: 'nubank', month: '2026-12', amount: null },
    { accountId: 'nubank', month: '2027-01', amount: null },
  ]);
  assert.equal(
    nbsp(plan.message),
    'Arquivar Nubank? O histórico fica guardado. Os valores de novembro em diante (R$ 2.300,00) serão apagados.',
  );
  assert.equal(JSON.stringify(data), before, 'não altera os dados recebidos');
});

test('archivePlan: sem valores futuros, texto curto e entries vazio', () => {
  const plan = archivePlan(planData(), NOW, 'inter');
  assert.deepEqual(plan.entries, []);
  assert.equal(plan.message, 'Arquivar Inter? O histórico fica guardado.');
  assert.equal(plan.account.active, false);
  // Dados sem entries também funcionam.
  assert.deepEqual(archivePlan({ accounts: [acc('a', 1)] }, NOW, 'a').entries, []);
});

test('archivePlan: primeiro mês futuro em outro ano vem com o ano', () => {
  const data = planData();
  data.entries = data.entries.filter((e) => !(e.accountId === 'nubank' && e.month > '2026-10' && e.month < '2027-01'));
  const plan = archivePlan(data, NOW, 'nubank');
  assert.deepEqual(plan.entries, [{ accountId: 'nubank', month: '2027-01', amount: null }]);
  assert.equal(
    nbsp(plan.message),
    'Arquivar Nubank? O histórico fica guardado. Os valores de janeiro de 2027 em diante (R$ 500,00) serão apagados.',
  );
});

test('archivePlan: soma o módulo dos valores (ajuste negativo)', () => {
  const data = planData();
  data.entries.push({ accountId: 'inter', month: '2026-11', amount: reais(-120), updatedAt: 'x' });
  data.entries.push({ accountId: 'inter', month: '2026-12', amount: reais(80), updatedAt: 'x' });
  assert.match(nbsp(archivePlan(data, NOW, 'inter').message), /novembro em diante \(R\$ 200,00\)/);
});

test('archivePlan: conta já arquivada devolve o mesmo plano; inexistente lança Error', () => {
  const plan = archivePlan(planData({ nubankActive: false }), NOW, 'nubank');
  assert.equal(plan.account.active, false);
  assert.equal(plan.entries.length, 3);
  assert.throws(() => archivePlan(planData(), NOW, 'nada'), /inexistente/);
});

test('deletePlan: arquivada com valores futuros apaga esses meses e marca deleted', () => {
  const data = planData({ nubankActive: false });
  const plan = deletePlan(data, NOW, 'nubank');
  assert.deepEqual(plan.account, { ...data.accounts[0], active: false, deleted: true });
  assert.deepEqual(plan.entries.map((e) => e.month), ['2026-11', '2026-12', '2027-01']);
  assert.ok(plan.entries.every((e) => e.accountId === 'nubank' && e.amount === null));
  assert.equal(
    nbsp(plan.message),
    'Excluir Nubank? Ela sai de Ajustes e não dá para desfazer. Os meses passados continuam mostrando os valores dela.'
      + ' Os valores de novembro em diante (R$ 2.300,00) serão apagados.',
  );
  assert.equal(data.accounts[0].deleted, undefined, 'não altera a conta recebida');
});

test('deletePlan: sem valores futuros, texto sem a parte dos valores', () => {
  const data = planData();
  data.accounts[1] = { ...data.accounts[1], active: false };
  const plan = deletePlan(data, NOW, 'inter');
  assert.deepEqual(plan.entries, []);
  assert.equal(
    plan.message,
    'Excluir Inter? Ela sai de Ajustes e não dá para desfazer. Os meses passados continuam mostrando os valores dela.',
  );
});

test('deletePlan: conta ativa ou inexistente lança Error', () => {
  assert.throws(() => deletePlan(planData(), NOW, 'nubank'), /arquivada/);
  assert.throws(() => deletePlan(planData(), NOW, 'nada'), /inexistente/);
});
