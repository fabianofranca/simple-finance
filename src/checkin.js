// Regras do Check-in (plans/phase-2.md, seção "Regras do Check-in").
// Módulo puro: sem DOM e sem relógio; `now` vem por parâmetro. `at` é ISO (UTC);
// para comparar dias, usa a data local do aparelho.

import { monthOf, currentStatus } from './forecast.js';
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

// Check-ins do mês, do mais antigo para o mais recente.
function ofMonth(data, month) {
  return (data.checkins || [])
    .filter((c) => c.month === month)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

// Abre sozinho? Sem check-in, sempre (e o "Agora não" não vale).
export function shouldOpenCheckin(data, now, snoozeDay = null) {
  const last = lastOf(data.checkins);
  if (!last) return true;
  if (snoozeDay && snoozeDay === localDay(now)) return false;
  const frequency = data.settings?.checkinFrequency || 'daily';
  if (frequency === 'always') return true;
  if (frequency === 'weekly') return now.getTime() - new Date(last.at).getTime() >= WEEK_MS;
  return localDay(new Date(last.at)) !== localDay(now);
}

// Uma linha (contas ou salário): some depois de um "sim" no mês;
// no primeiro check-in do mês vem sem seleção, depois com a última resposta.
function lineOf(list, field) {
  if (list.some((c) => c[field] === true)) return { show: false, preset: true };
  if (!list.length) return { show: true, preset: null };
  return { show: true, preset: Boolean(list[list.length - 1][field]) };
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
