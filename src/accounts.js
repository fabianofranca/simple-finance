// Contas na tela Ajustes: ordem, reordenar, nova conta, arquivar e reativar.
// Módulo puro: devolve cópias, nunca altera as contas recebidas.

const TYPES = ['expense', 'income'];

const byOrder = (a, b) =>
  (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name), 'pt-BR');

// Ativas na ordem (empate pelo nome).
export function activeAccounts(accounts) {
  return (accounts || []).filter((a) => a.active).sort(byOrder);
}

// Arquivadas na ordem (empate pelo nome).
export function archivedAccounts(accounts) {
  return (accounts || []).filter((a) => !a.active).sort(byOrder);
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
// Nome vazio (depois de aparar) ou tipo inválido → null.
export function newAccount({ name, type, defaultAmount } = {}, accounts) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || !TYPES.includes(type)) return null;
  return {
    name: trimmed,
    type,
    defaultAmount: Number.isInteger(defaultAmount) ? defaultAmount : null,
    order: nextOrder(accounts),
    active: true,
  };
}

// Sobe ('up' ou -1) ou desce ('down' ou 1) uma conta ativa.
// Devolve só as contas alteradas; nas pontas, arquivada ou id desconhecido, [].
export function move(accounts, id, dir) {
  const step = dir === 'up' || dir === -1 ? -1 : dir === 'down' || dir === 1 ? 1 : 0;
  const list = activeAccounts(accounts);
  const i = list.findIndex((a) => a.id === id);
  const j = i + step;
  if (!step || i < 0 || j < 0 || j >= list.length) return [];

  const orders = list.map((a) => a.order);
  if (new Set(orders).size === orders.length) {
    // Ordens distintas: só troca com a vizinha.
    return [{ ...list[i], order: list[j].order }, { ...list[j], order: list[i].order }];
  }
  // Ordem repetida entre as ativas: troca as posições e renumera 1..n.
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
