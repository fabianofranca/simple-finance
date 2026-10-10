// Regras do Check-in (plans/phase-2.md, seção "Regras do Check-in").
// Módulo puro: sem DOM e sem relógio; `now` vem por parâmetro. `at` é ISO (UTC);
// para comparar dias, usa a data local do aparelho.

import { monthOf, currentStatus, effectiveAmount } from './forecast.js';
import { activeAccounts } from './accounts.js';
import { formatMoney } from './money.js';
import { monthName } from './month-view.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Dia local 'YYYY-MM-DD' de uma data.
export function localDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Check-in mais recente (maior `at`), ou null.
function lastOf(checkins) {
  let last = null;
  for (const c of checkins || []) {
    if (!last || c.at > last.at) last = c;
  }
  return last;
}

// Abre sozinho? Sem nenhuma conta ativa (nada cadastrado ou só arquivadas), nunca:
// não há o que perguntar. Sem check-in, sempre (e o "Agora não" não vale).
// Com "toda vez" (always) o "Agora não" também é ignorado: só pula aquela abertura.
// Com daily e weekly, adiado hoje não abre até o dia seguinte.
export function shouldOpenCheckin(data, now, snoozeDay = null) {
  if (!activeAccounts(data.accounts).length) return false;
  const last = lastOf(data.checkins);
  if (!last) return true;
  const frequency = data.settings?.checkinFrequency || 'daily';
  if (frequency === 'always') return true;
  if (snoozeDay && snoozeDay === localDay(now)) return false;
  if (frequency === 'weekly') return now.getTime() - new Date(last.at).getTime() >= WEEK_MS;
  return localDay(new Date(last.at)) !== localDay(now);
}

// Estado inicial da tela de check-in: só o saldo. Já com check-in, o campo vem com o
// "Na conta" que o cartão mostra; sem nenhum, vem vazio e obrigatório (null).
export function checkinForm(data, now) {
  const last = lastOf(data.checkins);
  return {
    month: monthOf(now),
    balance: last ? currentStatus(data, now).balance : null,
  };
}

// Confirmar libera com saldo inteiro válido.
export function canConfirm(form, answers) {
  return Number.isInteger(answers?.balance);
}

// Payload do check-in. As antigas marcações em bloco não existem mais (gravam false);
// a sobra prevista é a do currentStatus com este check-in acrescentado aos dados.
export function buildCheckin(data, now, { balance }) {
  const checkin = {
    at: now.toISOString(),
    month: monthOf(now),
    balance,
    billsPaid: false,
    incomeReceived: false,
    projectedBalance: 0,
  };
  const next = { ...data, checkins: [...(data.checkins || []), checkin] };
  checkin.projectedBalance = currentStatus(next, now).endOfMonth;
  return checkin;
}

// Check de uma linha da tela Mês (um toque): marca ou desmarca o item do mês atual.
// Devolve { entries, notice }:
// - entries: um lançamento { accountId, month, amount, paidAt } com o valor efetivo
//   (item estimado vira lançamento); `paidAt` é o instante ISO ao marcar, null ao desmarcar;
// - notice: confirmação curta; null com valor 0. O sinal vem do texto e fica colado
//   ao valor (espaço não-quebrável) para não sobrar sozinho no fim da linha.
// Conta inexistente lança Error.
export function buildPaid(data, now, { accountId, paid }) {
  const account = (data.accounts || []).find((a) => a.id === accountId);
  if (!account) throw new Error(`conta inexistente: ${accountId}`);
  const month = monthOf(now);
  const { amount } = effectiveAmount(account, month, data.entries);
  const on = paid === true;
  const entries = [{ accountId, month, amount, paidAt: on ? now.toISOString() : null }];
  let notice = null;
  if (amount) {
    const money = formatMoney(Math.abs(amount));
    if (!on) notice = `${account.name} desmarcado.`;
    else if (account.type === 'income') notice = `${account.name} recebido: +\u00a0${money} na conta.`;
    else notice = `${account.name} pago: −\u00a0${money} na conta.`;
  }
  return { entries, notice };
}

// Aviso educativo: a sobra caiu desde o check-in anterior do mesmo mês?
export function dropNotice(data, checkin) {
  const previous = lastOf(
    (data.checkins || []).filter((c) => c.month === checkin.month && c.at < checkin.at),
  );
  if (!previous || !Number.isInteger(previous.projectedBalance)) return null;
  const drop = previous.projectedBalance - checkin.projectedBalance;
  if (!(drop > 0)) return null;
  const day = new Date(previous.at);
  const since = `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`;
  return {
    month: checkin.month,
    drop,
    since,
    text: `Sua sobra de ${monthName(checkin.month)} caiu ${formatMoney(drop)} desde ${since}`,
  };
}
