// Revisão semanal guiada e lembrete (plans/phase-3.md, seção "Regras").
// Módulo puro: sem DOM e sem relógio; `today`/`now` vêm por parâmetro.

import { addMonths, effectiveAmount, currentStatus, project } from './forecast.js';
import { formatMoney } from './money.js';
import { monthName } from './month-view.js';
import { localDay } from './checkin.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAYS = 7;
const ISO_RE = /^\d{4}-\d{2}-\d{2}/;

// Quantos meses de `from` até `to` (pode ser negativo).
function monthDiff(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

const byOrder = (a, b) =>
  (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name), 'pt-BR');

// Perguntas do mês seguinte ao corrente: contas de despesa ativas, na ordem.
export function reviewQuestions(data, today) {
  const month = addMonths(currentStatus(data, today).month, 1);
  const entries = data.entries || [];
  const items = (data.accounts || [])
    .filter((a) => a.type === 'expense' && a.active)
    .sort(byOrder)
    .map((a) => {
      const hasEntry = entries.some((e) => e.accountId === a.id && e.month === month);
      const { amount, estimated } = effectiveAmount(a, month, entries);
      const kind = hasEntry || a.defaultAmount != null ? 'confirm' : 'ask';
      return { accountId: a.id, name: a.name, amount, estimated, kind };
    });
  return { month, items };
}

// Título e pergunta de um item. Os botões ficam na tela.
export function questionText(item, month) {
  const name = monthName(month);
  const title = `${item.name} · ${name}`;
  if (item.kind === 'ask') return { title, question: `Já sabe quanto vai ser em ${name}?` };
  const value = formatMoney(item.amount);
  if (item.estimated) {
    return { title, question: `Pelo valor padrão, deve ficar em ${value} (estimado). Continua assim?` };
  }
  return { title, question: `Ainda está em ${value}?` };
}

// Sobra prevista no fim de `month` (mês corrente ou futuro); mês passado → null.
export function monthEnd(data, today, month) {
  const status = currentStatus(data, today);
  const diff = monthDiff(status.month, month);
  if (diff < 0) return null;
  if (diff === 0) return status.endOfMonth;
  const list = project(data, today, diff);
  return list[list.length - 1].balance;
}

// Texto do fim da revisão, comparando com a sobra do início.
export function reviewDone(month, before, after) {
  const name = monthName(month);
  if (before === after) return `Pronto! Sua sobra de ${name} continua em ${formatMoney(after)}`;
  return `Pronto! Sua sobra de ${name} ficou em ${formatMoney(after)} (antes ${formatMoney(before)})`;
}

// Dias de calendário local entre `iso` e `now`; ISO nulo ou inválido → null.
export function daysSince(iso, now) {
  if (typeof iso !== 'string' || !ISO_RE.test(iso)) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  // Meia-noite UTC de cada dia local: o horário de verão não interfere.
  const dayIndex = (d) => {
    const [y, m, day] = localDay(d).split('-').map(Number);
    return Date.UTC(y, m - 1, day) / DAY_MS;
  };
  return dayIndex(now) - dayIndex(then);
}

// Texto da faixa do lembrete na tela Mês, ou null quando não é a hora.
export function reminder(settings, now) {
  const days = daysSince(settings?.lastReviewAt ?? null, now);
  if (days === null) return 'Que tal revisar as contas do mês que vem?';
  if (days >= REMINDER_DAYS) return `Faz ${days} dias que você não revisa as contas.`;
  return null;
}
