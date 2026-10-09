// Regras do Check-in (plans/phase-2.md, seção "Regras do Check-in").
// Módulo puro: sem DOM e sem relógio; `now` vem por parâmetro. `at` é ISO (UTC);
// para comparar dias, usa a data local do aparelho.

import { monthOf, currentStatus, monthFlags, effectiveAmount, monthTotals } from './forecast.js';
import { activeAccounts } from './accounts.js';
import { formatMoney } from './money.js';
import { monthName } from './month-view.js';

export { monthFlags };

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

// Check-ins do mês, do mais antigo para o mais recente.
function ofMonth(data, month) {
  return (data.checkins || [])
    .filter((c) => c.month === month)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
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

// Uma linha (contas ou salário) segue o ÚLTIMO check-in do mês:
// "sim" some a linha; "não" mostra com "Ainda não" (é o jeito de desfazer);
// sem check-in no mês, vem sem seleção.
function lineOf(list, field) {
  if (!list.length) return { show: true, preset: null };
  if (list[list.length - 1][field] === true) return { show: false, preset: true };
  return { show: true, preset: false };
}

// Estado inicial da tela de check-in.
export function checkinForm(data, now) {
  const month = monthOf(now);
  const list = ofMonth(data, month);
  const last = lastOf(data.checkins);
  return {
    month,
    balance: last ? last.balance : null,
    bills: lineOf(list, 'billsPaid'),
    income: lineOf(list, 'incomeReceived'),
  };
}

// Confirmar libera com saldo válido e cada linha visível respondida.
export function canConfirm(form, answers) {
  if (!Number.isInteger(answers?.balance)) return false;
  if (form.bills.show && typeof answers.billsPaid !== 'boolean') return false;
  if (form.income.show && typeof answers.incomeReceived !== 'boolean') return false;
  return true;
}

// Payload do check-in. Linha escondida grava `true`; a sobra prevista
// é a do currentStatus com este check-in acrescentado aos dados.
export function buildCheckin(data, now, { balance, billsPaid, incomeReceived }) {
  const form = checkinForm(data, now);
  const checkin = {
    at: now.toISOString(),
    month: form.month,
    balance,
    billsPaid: form.bills.show ? billsPaid === true : true,
    incomeReceived: form.income.show ? incomeReceived === true : true,
    projectedBalance: 0,
  };
  const next = { ...data, checkins: [...(data.checkins || []), checkin] };
  checkin.projectedBalance = currentStatus(next, now).endOfMonth;
  return checkin;
}

// Switch com um toque da tela Mês (plans/phase-4.md, T4): passa o dinheiro de
// "Falta receber"/"Falta pagar" para "Na conta" e nunca muda a sobra.
// `field` é 'incomeReceived' (contas income) ou 'billsPaid' (contas expense).
// Devolve { entries, checkin, total }:
// - entries: ao ligar, as contas do tipo com valor estimado no mês viram lançamentos
//   { accountId, month, amount }; ao desligar, [] (os lançamentos ficam);
// - checkin: saldo do último check-in do mês ± total, a outra marcação copiada;
// - total: soma dos valores efetivos do tipo no mês (para o `toggleNotice`).
// Sem check-in no mês lança Error: a tela deve abrir o "Atualizar saldo".
export function buildToggle(data, now, { field, value }) {
  if (field !== 'billsPaid' && field !== 'incomeReceived') {
    throw new Error(`field inválido: ${field}`);
  }
  const month = monthOf(now);
  const last = lastOf(ofMonth(data, month));
  if (!last) throw new Error(`sem check-in em ${month}`);

  const type = field === 'incomeReceived' ? 'income' : 'expense';
  const on = value === true;
  const entries = [];
  if (on) {
    for (const account of data.accounts || []) {
      if (account.type !== type) continue;
      const { amount, estimated } = effectiveAmount(account, month, data.entries);
      if (estimated) entries.push({ accountId: account.id, month, amount });
    }
  }
  const withEntries = { ...data, entries: [...(data.entries || []), ...entries] };
  const totals = monthTotals(withEntries, month);
  const total = type === 'income' ? totals.income : totals.expense;
  // Recebi soma na conta; Paguei tira. Desligar faz o contrário.
  const sign = (type === 'income') === on ? 1 : -1;

  const checkin = {
    at: now.toISOString(),
    month,
    balance: last.balance + sign * total,
    billsPaid: last.billsPaid === true,
    incomeReceived: last.incomeReceived === true,
    projectedBalance: 0,
  };
  checkin[field] = on;
  const next = { ...withEntries, checkins: [...(data.checkins || []), checkin] };
  checkin.projectedBalance = currentStatus(next, now).endOfMonth;
  return { entries, checkin, total };
}

// Confirmação curta depois do toque (sem diálogo); null com total 0.
// `total` em centavos; o sinal vem do texto, não do número, e fica colado ao valor
// (espaço não-quebrável) para não sobrar sozinho no fim da linha.
export function toggleNotice(field, value, total, month) {
  if (!total) return null;
  const name = monthName(month);
  const money = formatMoney(Math.abs(total));
  if (field === 'incomeReceived') {
    return value
      ? `Salário de ${name} somado: +\u00a0${money} na conta.`
      : `Salário de ${name} tirado: −\u00a0${money} na conta.`;
  }
  return value
    ? `Contas de ${name} descontadas: −\u00a0${money} na conta.`
    : `Contas de ${name} devolvidas: +\u00a0${money} na conta.`;
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
