import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeAccounts,
  archivedAccounts,
  nextOrder,
  newAccount,
  move,
  archive,
  reactivate,
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
  assert.deepEqual(a, { name: 'Farmácia', type: 'expense', defaultAmount: 8000, order: 10, active: true });
  assert.equal('id' in a, false);
  const b = newAccount({ name: 'Extra', type: 'income' }, []);
  assert.deepEqual(b, { name: 'Extra', type: 'income', defaultAmount: null, order: 1, active: true });
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

test('archive e reactivate trocam active e mantêm o order', () => {
  const a = acc('nubank', 4);
  assert.deepEqual(archive(a), { ...a, active: false });
  assert.deepEqual(reactivate(archive(a)), a);
  assert.equal(a.active, true);
});
