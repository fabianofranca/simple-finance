// Regras do Check-in (plans/phase-2.md, seção "Regras do Check-in").
// Módulo puro: sem DOM e sem relógio; `now` vem por parâmetro. `at` é ISO (UTC);
// para comparar dias, usa a data local do aparelho.

import { monthOf, currentStatus, monthFlags } from './forecast.js';
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

// Abre sozinho? Sem check-in, sempre (e o "Agora não" não vale).
// Com "toda vez" (always) o "Agora não" também é ignorado: só pula aquela abertura.
// Com daily e weekly, adiado hoje não abre até o dia seguinte.
export function shouldOpenCheckin(data, now, snoozeDay = null) {
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

// Check-in gerado pelo switch da tela Mês: muda só `field` ('billsPaid' ou
// 'incomeReceived') e copia a outra marcação do último check-in do mês.
// Só vale com check-in no mês; sem ele a tela vai para o "Atualizar saldo".
export function buildToggle(data, now, { field, value, balance }) {
  if (field !== 'billsPaid' && field !== 'incomeReceived') {
    throw new Error(`field inválido: ${field}`);
  }
  const month = monthOf(now);
  const flags = monthFlags(data, now);
  const checkin = {
    at: now.toISOString(),
    month,
    balance,
    billsPaid: flags.billsPaid,
    incomeReceived: flags.incomeReceived,
    projectedBalance: 0,
  };
  checkin[field] = value === true;
  const next = { ...data, checkins: [...(data.checkins || []), checkin] };
  checkin.projectedBalance = currentStatus(next, now).endOfMonth;
  return checkin;
}

// Textos do diálogo do switch.
export function toggleText(field, value, month) {
  const name = monthName(month);
  if (field === 'billsPaid') {
    return value
      ? { title: `Contas de ${name} pagas`, label: 'Quanto ficou na conta?' }
      : { title: `Contas de ${name} ainda não pagas`, label: 'Quanto tem na conta agora?' };
  }
  return value
    ? { title: `Salário de ${name} recebido`, label: 'Quanto tem na conta agora?' }
    : { title: `Salário de ${name} ainda não caiu`, label: 'Quanto tem na conta agora?' };
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
