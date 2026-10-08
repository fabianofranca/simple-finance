// O que a tela "Posso comprar?" exibe (plans/phase-3.md, seção "Regras").
// Módulo puro: só chama o forecast.js; `today` vem por parâmetro.

import { canBuy, currentStatus, addMonths } from './forecast.js';
import { formatMoney } from './money.js';
import { monthName, monthLabel } from './month-view.js';

const DEFAULT_HORIZON = 3;
const MAX_COUNT = 24;

function horizonOf(data) {
  const h = Number(data.settings?.horizonMonths);
  return Number.isInteger(h) && h > 0 ? h : DEFAULT_HORIZON;
}

// Entrada inválida: objeto de erro com texto pronto para a tela.
function invalid(installment, count) {
  if (!Number.isInteger(installment) || installment <= 0) {
    return { error: 'installment', message: 'Digite o valor da parcela, por exemplo 150,00.' };
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    return { error: 'count', message: `As parcelas vão de 1 a ${MAX_COUNT}.` };
  }
  return null;
}

// `installment` em centavos (já lido pelo parseMoney); `count` de 1 a 24.
// Com entrada inválida devolve { error, message } sem chamar o canBuy.
export function buyView(data, today, { installment, count } = {}) {
  const error = invalid(installment, count);
  if (error) return error;

  const current = currentStatus(data, today).month;
  const year = current.slice(0, 4);
  // Mês do mesmo ano: "janeiro"; de outro ano: "janeiro de 2027".
  const name = (month) => (month.slice(0, 4) === year ? monthName(month) : monthLabel(month));

  const result = canBuy(data, today, { installment, count, horizon: horizonOf(data) });
  const first = addMonths(current, 1);
  const last = addMonths(current, count);
  const value = formatMoney(installment);
  const neg = result.firstNegative;
  const already = result.alreadyNegative;

  return {
    ok: result.ok,
    headline: result.ok ? 'Pode comprar' : 'Não pode',
    detail: neg ? `Em ${name(neg.month)} fica faltando ${formatMoney(neg.missing)}` : null,
    warning: already
      ? `Mesmo sem essa compra, ${name(already.month)} já fica negativo (faltam ${formatMoney(already.missing)}).`
      : null,
    range: count === 1
      ? `1 parcela de ${value}, em ${name(first)}`
      : `${count} parcelas de ${value}, de ${name(first)} a ${name(last)}`,
    rows: result.months.map((m) => ({
      month: m.month,
      label: monthName(m.month),
      before: m.before,
      after: m.after,
      negative: m.after < 0,
    })),
  };
}
