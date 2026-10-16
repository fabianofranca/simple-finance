// Contas na tela Ajustes: ordem, reordenar, nova conta, edição, arquivar, reativar e excluir.
// Módulo puro: devolve cópias, nunca altera as contas recebidas; `now` vem por parâmetro.

import { monthOf } from './forecast.js';
import { formatMoney } from './money.js';
import { monthName, monthLabel } from './month-view.js';

const TYPES = ['expense', 'income'];

const byOrder = (a, b) =>
  (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name), 'pt-BR');

// Ativas na ordem (empate pelo nome).
export function activeAccounts(accounts) {
  return (accounts || []).filter((a) => a.active).sort(byOrder);
}

// Arquivadas na ordem (empate pelo nome). As excluídas (`deleted`) ficam de fora.
export function archivedAccounts(accounts) {
  return (accounts || []).filter((a) => !a.active && a.deleted !== true).sort(byOrder);
}

// Maior `order` de todas as contas (arquivadas inclusive) + 1, ou 1.
export function nextOrder(accounts) {
  let max = 0;
  for (const a of accounts || []) {
    if (Number.isFinite(a.order) && a.order > max) max = a.order;
  }
  return max + 1;
}

// Conta nova no fim da lista, sem `id` (o store gera).
// `isCard` ("É cartão de crédito") só vale para despesa; nos outros casos fica false.
// Nome vazio (depois de aparar) ou tipo inválido → null.
export function newAccount({ name, type, defaultAmount, isCard } = {}, accounts) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || !TYPES.includes(type)) return null;
  return {
    name: trimmed,
    type,
    defaultAmount: Number.isInteger(defaultAmount) ? defaultAmount : null,
    order: nextOrder(accounts),
    active: true,
    isCard: type === 'expense' && isCard === true,
  };
}

// Conta editada (nome, tipo, valor padrão e, opcionalmente, `isCard`), mantendo id, ordem,
// situação e o que mais houver. `isCard` ausente mantém a marcação; virar Entrada desmarca.
// Nome vazio (depois de aparar) ou tipo inválido → null.
export function editAccount(account, { name, type, defaultAmount, isCard } = {}) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!account || !trimmed || !TYPES.includes(type)) return null;
  const card = isCard === undefined ? account.isCard === true : isCard === true;
  return {
    ...account,
    name: trimmed,
    type,
    defaultAmount: Number.isInteger(defaultAmount) ? defaultAmount : null,
    isCard: type === 'expense' && card,
  };
}

// Sobe ('up' ou -1) ou desce ('down' ou 1) uma conta ativa, dentro das ativas do mesmo tipo
// (Entradas e Contas são listas separadas na tela). Devolve só as contas alteradas; nas pontas
// da lista do tipo, arquivada ou id desconhecido, [].
// A ordem das contas do outro tipo nunca muda.
export function move(accounts, id, dir) {
  const step = dir === 'up' || dir === -1 ? -1 : dir === 'down' || dir === 1 ? 1 : 0;
  const target = activeAccounts(accounts).find((a) => a.id === id);
  if (!step || !target) return [];
  const list = activeAccounts(accounts).filter((a) => a.type === target.type);
  const i = list.findIndex((a) => a.id === id);
  const j = i + step;
  if (j < 0 || j >= list.length) return [];

  const orders = list.map((a) => a.order);
  if (new Set(orders).size === orders.length) {
    // Ordens distintas: só troca com a vizinha do mesmo tipo.
    return [{ ...list[i], order: list[j].order }, { ...list[j], order: list[i].order }];
  }
  // Ordem repetida dentro do tipo: troca as posições e renumera só esse grupo, 1..n.
  const swapped = [...list];
  [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
  const before = new Map(list.map((a) => [a.id, a.order]));
  return swapped
    .map((a, k) => ({ ...a, order: k + 1 }))
    .filter((a) => a.order !== before.get(a.id));
}

// Arquivar e reativar mantêm o `order`.
export function archive(account) {
  return { ...account, active: false };
}

export function reactivate(account) {
  return { ...account, active: true };
}

// Lançamentos da conta nos meses seguintes ao atual (`monthOf(now)`), para apagar ao
// arquivar ou excluir: { entries, notice }. `entries` vem em ordem crescente de mês, com
// `amount: null`; `notice` é a frase dos valores apagados ("" sem lançamentos futuros).
// O primeiro mês segue o critério do buy-view.js: "janeiro de 2027" quando é de outro ano.
function futureCleanup(data, now, account) {
  const current = monthOf(now);
  const future = (data?.entries || [])
    .filter((e) => e.accountId === account.id && e.month > current)
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  if (!future.length) return { entries: [], notice: '' };

  const first = future[0].month;
  const name = first.slice(0, 4) === current.slice(0, 4) ? monthName(first) : monthLabel(first);
  const total = future.reduce((sum, e) => sum + Math.abs(e.amount || 0), 0);
  return {
    entries: future.map((e) => ({ accountId: account.id, month: e.month, amount: null })),
    notice: ` Os valores de ${name} em diante (${formatMoney(total)}) serão apagados.`,
  };
}

function findAccount(data, accountId) {
  const account = (data?.accounts || []).find((a) => a.id === accountId);
  if (!account) throw new Error(`conta inexistente: ${accountId}`);
  return account;
}

// Arquivar: a conta fica `active: false` e os valores dos meses seguintes ao atual são
// apagados (o mês atual e os passados ficam como histórico). Arquivar uma conta já
// arquivada devolve o mesmo plano (apaga o que tiver sobrado no futuro).
// Devolve { account, entries, message }. Conta inexistente lança Error.
export function archivePlan(data, now, accountId) {
  const account = findAccount(data, accountId);
  const { entries, notice } = futureCleanup(data, now, account);
  return {
    account: archive(account),
    entries,
    message: `Arquivar ${account.name}? O histórico fica guardado.${notice}`,
  };
}

// Excluir (só conta arquivada): a conta fica `active: false, deleted: true` e sai de Ajustes;
// a linha continua na planilha, então os meses passados seguem com o nome e os valores dela.
// Os valores futuros são apagados como no arquivar.
// Devolve { account, entries, message }. Conta inexistente ou ativa lança Error.
export function deletePlan(data, now, accountId) {
  const account = findAccount(data, accountId);
  if (account.active) throw new Error(`só conta arquivada pode ser excluída: ${accountId}`);
  const { entries, notice } = futureCleanup(data, now, account);
  return {
    account: { ...account, active: false, deleted: true },
    entries,
    message: `Excluir ${account.name}? Ela sai de Ajustes e não dá para desfazer. Os meses passados continuam mostrando os valores dela.${notice}`,
  };
}
