// O que a tela Mês exibe (regras em plans/phase-2.md, seção "Regras da tela Mês").
// Módulo puro: só chama o forecast.js; `today` vem por parâmetro.

import { addMonths, effectiveAmount, monthTotals, currentStatus, project } from './forecast.js';

const NAV_LIMIT = 12;
const DEFAULT_HORIZON = 3;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const nameFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long' });
const labelFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

function firstDay(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

// '2026-10' → "outubro de 2026"
export function monthLabel(month) {
  return labelFormat.format(firstDay(month));
}

// '2026-10' → "outubro"
export function monthName(month) {
  return nameFormat.format(firstDay(month));
}

// Faixa navegável: 12 meses para trás e 12 para frente do mês atual.
export function navRange(current) {
  return { min: addMonths(current, -NAV_LIMIT), max: addMonths(current, NAV_LIMIT) };
}

// Mês pedido pela rota, ou o mês atual se for inválido ou fora da faixa.
export function resolveMonth(requested, current) {
  if (typeof requested !== 'string' || !MONTH_RE.test(requested)) return current;
  const { min, max } = navRange(current);
  return requested < min || requested > max ? current : requested;
}

// Quantos meses de `from` até `to` (pode ser negativo).
function monthDiff(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function horizonOf(data) {
  const h = Number(data.settings?.horizonMonths);
  return Number.isInteger(h) && h > 0 ? h : DEFAULT_HORIZON;
}

// Linhas de um tipo: ativas sempre; arquivadas só com lançamento no mês.
function rowsOf(data, month, type) {
  const entries = data.entries || [];
  const hasEntry = (id) => entries.some((e) => e.accountId === id && e.month === month);
  return (data.accounts || [])
    .filter((a) => a.type === type && (a.active || hasEntry(a.id)))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name), 'pt-BR'))
    .map((a) => {
      const { amount, estimated } = effectiveAmount(a, month, entries);
      const hasDefault = Boolean(a.active) && a.defaultAmount != null;
      return {
        accountId: a.id,
        name: a.name,
        amount,
        estimated,
        empty: !hasEntry(a.id) && !hasDefault,
        hasDefault,
      };
    });
}

// Dados da tela Mês para `month`, conforme o tipo (passado, atual ou futuro).
export function monthView(data, today, month) {
  const status = currentStatus(data, today);
  const current = status.month;
  const diff = monthDiff(current, month);
  const view = {
    month,
    label: monthLabel(month),
    current,
    kind: diff < 0 ? 'past' : diff === 0 ? 'current' : 'future',
  };

  if (view.kind === 'current') {
    view.balance = status.balance;
    view.toPay = status.toPay;
    view.endOfMonth = status.endOfMonth;
    view.upcoming = project(data, today, horizonOf(data)).map((p) => ({
      ...p,
      label: monthName(p.month),
      negative: p.balance < 0,
    }));
  } else {
    const { income, expense } = monthTotals(data, month);
    view.income = income;
    view.expense = expense;
    if (view.kind === 'future') {
      const list = project(data, today, diff);
      view.endOfMonth = list[list.length - 1].balance;
    }
  }

  view.rows = { income: rowsOf(data, month, 'income'), expense: rowsOf(data, month, 'expense') };
  return view;
}
