// "Vou comprar" e "Últimas compras" (plans/phase-6.md, seção "Regras → Lógica").
// Módulo puro: sem DOM e sem relógio; `now` vem por parâmetro. Valores em centavos.
// Como no check da Fase 5, os valores vão absolutos, calculados no aparelho: reenviar
// a mesma operação dá o mesmo resultado.

import { addMonths, currentStatus, effectiveAmount } from './forecast.js';
import { activeAccounts } from './accounts.js';
import { formatMoney } from './money.js';
import { monthName, monthLabel } from './month-view.js';

const MAX_COUNT = 24;
const DEFAULT_LIST_SIZE = 5;
const MISSING_ACCOUNT = 'Conta removida';

// Cartões para a pergunta "Em qual cartão?": ativos, de despesa e marcados, na ordem.
export function cardAccounts(data) {
  return activeAccounts(data?.accounts).filter((a) => a.type === 'expense' && a.isCard === true);
}

// Meses da compra: `count` meses a partir de `firstMonth`.
function monthsOf(purchase) {
  const list = [];
  for (let k = 0; k < purchase.count; k++) list.push(addMonths(purchase.firstMonth, k));
  return list;
}

// Nome do mês em relação a um mês de referência: "janeiro" no mesmo ano,
// "janeiro de 2027" em outro ano (mesmo critério do buy-view.js).
function namer(reference) {
  const year = reference.slice(0, 4);
  return (month) => (month.slice(0, 4) === year ? monthName(month) : monthLabel(month));
}

// "novembro", "novembro e dezembro", "novembro, dezembro e janeiro".
function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

// Dia local dd/mm de um instante ISO.
function dayMonth(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function accountName(data, accountId) {
  return (data.accounts || []).find((a) => a.id === accountId)?.name ?? MISSING_ACCOUNT;
}

// Lança a compra no cartão: em cada um dos `count` meses, a partir do mês seguinte ao
// atual (os mesmos meses da simulação), o lançamento vira valor efetivo + parcela.
// Sem `paidAt`: a marcação de pago fica como está.
// Devolve { purchase, entries, notice }. Cartão inexistente ou valores inválidos lançam Error.
export function buildPurchase(data, now, { id, accountId, installment, count } = {}) {
  if (typeof id !== 'string' || !id) throw new Error('id da compra obrigatório');
  if (!Number.isInteger(installment) || installment <= 0) throw new Error('installment deve ser inteiro positivo');
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) throw new Error(`count deve ir de 1 a ${MAX_COUNT}`);
  const account = cardAccounts(data).find((a) => a.id === accountId);
  if (!account) throw new Error(`cartão inexistente: ${accountId}`);

  // Mesmo mês corrente do canBuy (com check-in no futuro, o mês dele).
  const current = currentStatus(data, now).month;
  const purchase = {
    id,
    at: now.toISOString(),
    accountId,
    installment,
    count,
    firstMonth: addMonths(current, 1),
    undoneAt: null,
  };
  const months = monthsOf(purchase);
  const entries = months.map((month) => ({
    accountId,
    month,
    amount: effectiveAmount(account, month, data.entries).amount + installment,
  }));

  const name = namer(current);
  const value = formatMoney(installment);
  const notice = count === 1
    ? `Lançado no ${account.name}: ${value}, em ${name(months[0])}.`
    : `Lançado no ${account.name}: ${count} parcelas de ${value}, de ${name(months[0])} a ${name(months[count - 1])}.`;
  return { purchase, entries, notice };
}

// Lista "Últimas compras": as não desfeitas, da mais recente para a mais antiga, até `limit`.
// Cada item traz os textos prontos: título "R$ 150,00 × 3 · Nubank" e detalhe
// "Lançada em 15/10 · novembro a janeiro". Os meses são nomeados em relação ao mês em que a
// compra foi lançada (o mês antes do primeiro), como no aviso de "Lançado".
export function recentPurchases(data, limit = DEFAULT_LIST_SIZE) {
  const size = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_SIZE;
  return (data?.purchases || [])
    .filter((p) => !p.undoneAt)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, size)
    .map((p) => {
      const months = monthsOf(p);
      const name = namer(addMonths(p.firstMonth, -1));
      const card = accountName(data, p.accountId);
      const value = formatMoney(p.installment);
      const range = p.count === 1 ? name(months[0]) : `${name(months[0])} a ${name(months[months.length - 1])}`;
      return {
        id: p.id,
        accountId: p.accountId,
        accountName: card,
        installment: p.installment,
        count: p.count,
        firstMonth: p.firstMonth,
        at: p.at,
        title: p.count === 1 ? `${value} · ${card}` : `${value} × ${p.count} · ${card}`,
        detail: `Lançada em ${dayMonth(p.at)} · ${range}`,
      };
    });
}

// Desfaz a compra: em cada mês dela, o lançamento vira max(0, valor efetivo − parcela).
// - Se o resultado é o valor que o mês teria sem lançamento (o padrão numa conta ativa
//   com padrão; 0 nos outros casos) e o item não está marcado, o lançamento é apagado
//   (amount null): o mês volta a "estimado", ou a "—".
// - Mês que "mudou depois da compra": o lançamento sumiu, ou foi gravado depois dela
//   por algo que não é uma compra (o `updatedAt` de uma compra é o `at` ou o `undoneAt` dela).
//   Subtrai mesmo assim e avisa no `message`.
// Devolve { purchase, entries, message, changedMonths }. Compra inexistente ou já
// desfeita lança Error.
export function buildUndo(data, now, purchaseId) {
  const purchases = data.purchases || [];
  const found = purchases.find((p) => p.id === purchaseId);
  if (!found) throw new Error(`compra inexistente: ${purchaseId}`);
  if (found.undoneAt) throw new Error(`compra já desfeita: ${purchaseId}`);
  const account = (data.accounts || []).find((a) => a.id === found.accountId);
  if (!account) throw new Error(`conta inexistente: ${found.accountId}`);

  const fromPurchases = new Set();
  for (const p of purchases) {
    if (p.at) fromPurchases.add(p.at);
    if (p.undoneAt) fromPurchases.add(p.undoneAt);
  }
  const withoutEntry = account.active && account.defaultAmount != null ? account.defaultAmount : 0;

  const entries = [];
  const changedMonths = [];
  const months = monthsOf(found);
  for (const month of months) {
    const entry = (data.entries || []).find((e) => e.accountId === account.id && e.month === month);
    const { amount } = effectiveAmount(account, month, data.entries);
    const next = Math.max(0, amount - found.installment);
    if (!entry || (entry.updatedAt > found.at && !fromPurchases.has(entry.updatedAt))) {
      changedMonths.push(month);
    }
    // Sem `paidAt`: a marcação fica como está.
    entries.push({ accountId: account.id, month, amount: next === withoutEntry && !entry?.paidAt ? null : next });
  }

  const name = namer(currentStatus(data, now).month);
  const value = formatMoney(found.installment);
  let message = found.count === 1
    ? `${value} será removido do ${account.name} em ${name(months[0])}.`
    : `${value} por mês será removido do ${account.name}, de ${name(months[0])} a ${name(months[months.length - 1])}.`;
  if (changedMonths.length === 1) {
    message += ` O valor de ${name(changedMonths[0])} mudou depois da compra. Confira depois.`;
  } else if (changedMonths.length > 1) {
    message += ` Os valores de ${joinNames(changedMonths.map(name))} mudaram depois da compra. Confira depois.`;
  }

  return { purchase: { ...found, undoneAt: now.toISOString() }, entries, message, changedMonths };
}
