// Cálculo do fluxo de caixa (regras em docs/product.md, seção Cálculo).
// Módulo puro: sem DOM, sem fetch e sem relógio interno; `today` vem por parâmetro.
// Valores sempre em centavos inteiros. Mês no formato 'YYYY-MM'.

// Mês 'YYYY-MM' de uma data, usando o fuso local.
export function monthOf(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

// Soma k meses (k pode ser negativo), virando o ano quando preciso.
export function addMonths(month, k) {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + k;
  const year = Math.floor(index / 12);
  const mon = index - year * 12 + 1;
  return `${String(year).padStart(4, '0')}-${String(mon).padStart(2, '0')}`;
}

// Valor efetivo: lançamento > valor padrão (só conta ativa) > 0.
export function effectiveAmount(account, month, entries) {
  const entry = (entries || []).find((e) => e.accountId === account.id && e.month === month);
  if (entry) return { amount: entry.amount, estimated: false };
  if (account.active && account.defaultAmount != null) {
    return { amount: account.defaultAmount, estimated: true };
  }
  return { amount: 0, estimated: false };
}

// R(m) e D(m): soma dos valores efetivos de todas as contas, arquivadas inclusive.
export function monthTotals(data, month) {
  let income = 0;
  let expense = 0;
  for (const account of data.accounts || []) {
    const { amount } = effectiveAmount(account, month, data.entries);
    if (account.type === 'income') income += amount;
    else if (account.type === 'expense') expense += amount;
  }
  return { income, expense };
}

// Base do cálculo: o check-in mais recente (maior `at`) ou, sem nenhum, saldo 0 no mês atual.
function baseCheckin(data, today) {
  let last = null;
  for (const c of data.checkins || []) {
    if (!last || c.at > last.at) last = c;
  }
  if (!last) {
    return { balance: 0, month: monthOf(today), billsPaid: false, incomeReceived: false };
  }
  return last;
}

// Mês corrente do cálculo. Se o último check-in estiver no futuro
// (relógio do aparelho errado), o mês do check-in vira o mês corrente.
function currentMonth(base, today) {
  const m = monthOf(today);
  return base.month > m ? base.month : m;
}

// Sobra acumulada no fim de cada mês, de A até `to`.
// `extra(month)` soma despesas simuladas (Posso comprar?).
function endBalances(data, base, to, extra = () => 0) {
  const result = new Map();
  let month = base.month;
  let { income, expense } = monthTotals(data, month);
  expense += extra(month);
  let balance = base.balance + (base.incomeReceived ? 0 : income) - (base.billsPaid ? 0 : expense);
  result.set(month, balance);
  while (month < to) {
    month = addMonths(month, 1);
    ({ income, expense } = monthTotals(data, month));
    expense += extra(month);
    balance += income - expense;
    result.set(month, balance);
  }
  return result;
}

// Marcações do último check-in (maior `at`) do mês de `now`.
// Sem check-in nesse mês, tudo `false`. Mora aqui (e não no checkin.js) para a
// tela Mês usar sem import circular; o checkin.js reexporta.
export function monthFlags(data, now) {
  const month = monthOf(now);
  let last = null;
  for (const c of data.checkins || []) {
    if (c.month === month && (!last || c.at > last.at)) last = c;
  }
  if (!last) return { hasCheckin: false, billsPaid: false, incomeReceived: false };
  return { hasCheckin: true, billsPaid: last.billsPaid === true, incomeReceived: last.incomeReceived === true };
}

// Topo da tela Mês: Na conta, Falta receber, Falta pagar e Sobra no fim do mês.
export function currentStatus(data, today) {
  const base = baseCheckin(data, today);
  const month = currentMonth(base, today);
  const ends = endBalances(data, base, month);
  const totals = monthTotals(data, month);
  const toReceive = base.month === month && base.incomeReceived ? 0 : totals.income;
  const toPay = base.month === month && base.billsPaid ? 0 : totals.expense;
  return { month, balance: base.balance, toReceive, toPay, endOfMonth: ends.get(month) };
}

// Próximos `months` meses depois do mês corrente, com a sobra acumulada.
export function project(data, today, months) {
  const base = baseCheckin(data, today);
  const current = currentMonth(base, today);
  const ends = endBalances(data, base, addMonths(current, months));
  const list = [];
  for (let k = 1; k <= months; k++) {
    const month = addMonths(current, k);
    const { income, expense } = monthTotals(data, month);
    list.push({ month, income, expense, balance: ends.get(month) });
  }
  return list;
}

function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

// Posso comprar? Simula `count` parcelas de `installment` a partir do mês seguinte.
// Não grava nada: só compara a sobra sem e com a compra.
export function canBuy(data, today, { installment, count, horizon } = {}) {
  const h = horizon ?? data.settings?.horizonMonths ?? 3;
  if (!isPositiveInt(installment)) throw new RangeError('installment deve ser inteiro positivo');
  if (!isPositiveInt(count)) throw new RangeError('count deve ser inteiro positivo');
  if (!isPositiveInt(h)) throw new RangeError('horizon deve ser inteiro positivo');

  const base = baseCheckin(data, today);
  const current = currentMonth(base, today);
  const first = addMonths(current, 1);
  const lastInstallment = addMonths(current, count);
  const extra = (m) => (m >= first && m <= lastInstallment ? installment : 0);

  const to = addMonths(current, Math.max(h, count));
  const before = endBalances(data, base, to);
  const after = endBalances(data, base, to, extra);

  // Verifica toda a faixa M … M+max(H, n), inclusive além do horizonte exibido.
  let firstNegative = null;
  let alreadyNegative = null;
  for (let month = current; month <= to; month = addMonths(month, 1)) {
    if (!firstNegative && after.get(month) < 0) {
      firstNegative = { month, missing: -after.get(month) };
    }
    if (!alreadyNegative && before.get(month) < 0) {
      alreadyNegative = { month, missing: -before.get(month) };
    }
  }

  const months = [];
  for (let k = 1; k <= h; k++) {
    const month = addMonths(current, k);
    months.push({ month, before: before.get(month), after: after.get(month) });
  }

  return { ok: firstNegative === null, months, firstNegative, alreadyNegative };
}
