// Tela Mês: resumo do mês, próximos meses e edição dos valores de cada conta.
// Regras de exibição em src/month-view.js; dinheiro sempre por src/money.js.
import { addMonths, currentStatus } from '../forecast.js';
import { monthView, monthLabel, monthName, navRange, resolveMonth } from '../month-view.js';
import { formatMoney, formatInput, parseMoney } from '../money.js';
import { buildPaid } from '../checkin.js';
import { reminder } from '../review.js';
import { activeAccounts } from '../accounts.js';
import { h, money, queueLine, selectOnFocus } from './ui.js';

// Linha do resumo: rótulo à esquerda, valor à direita.
function summaryLine(label, cents, strong = false) {
  return h('div', { class: `sum-line${strong ? ' strong' : ''}` }, h('span', { class: 'sum-label' }, label), money(cents));
}

function summary(view) {
  if (view.kind === 'current') {
    return [
      summaryLine('Na conta', view.balance),
      summaryLine('Falta receber', view.toReceive),
      summaryLine('Falta pagar', view.toPay),
      summaryLine('Sobra no fim do mês', view.endOfMonth, true)
    ];
  }
  if (view.kind === 'future') {
    return [
      summaryLine('Entra', view.income),
      summaryLine('Sai', view.expense),
      summaryLine('Sobra prevista no fim do mês', view.endOfMonth, true)
    ];
  }
  return [summaryLine('Entrou', view.income), summaryLine('Saiu', view.expense)];
}

export function mount(el, ctx) {
  const { store } = ctx;
  let alive = true;
  const content = h('div', { class: 'month' });
  const dialog = h('dialog', { class: 'edit-dialog' });
  el.replaceChildren(content, dialog);

  // ----- edição -----
  let editing = null; // { row, month }

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  // ----- check por linha (só no mês atual) -----
  // Um toque só: passa o dinheiro de "Falta receber/pagar" para "Na conta" (ou devolve), sem mexer na sobra.
  const lastTap = {}; // conta -> instante (ms) do último toque tratado
  const TAP_GUARD_MS = 400; // segura o toque duplo: o redesenho já troca o check, o 2º toque desfaria o 1º

  function onCheck(row) {
    const data = store.getData();
    if (!data) return;
    const t = performance.now();
    if (lastTap[row.accountId] !== undefined && t - lastTap[row.accountId] < TAP_GUARD_MS) return;
    lastTap[row.accountId] = t;
    const { entries, notice } = buildPaid(data, ctx.now(), { accountId: row.accountId, paid: !row.paid });
    store.saveEntries(entries);
    if (notice) ctx.notify(notice);
  }

  // Círculo vazio ou com ✓: o ✓ aparece só marcado, então não depende só da cor.
  function checkButton(row, type) {
    const verb = type === 'income' ? 'recebido' : 'pago';
    return h(
      'button',
      {
        type: 'button',
        class: 'check',
        role: 'checkbox',
        'aria-checked': String(row.paid),
        'aria-label': `${row.paid ? 'Desmarcar' : 'Marcar'} ${row.name} como ${verb}`,
        'data-check': row.accountId,
        onclick: () => onCheck(row)
      },
      h('span', { class: 'check-box', 'aria-hidden': 'true' }, row.paid ? '✓' : '')
    );
  }

  function openEdit(row, month) {
    editing = { row, month };
    const input = h('input', {
      id: 'edit-amount',
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      enterkeyhint: 'done'
    });
    input.value = row.empty ? '' : formatInput(row.amount);
    selectOnFocus(input);
    const error = h('p', { class: 'edit-error', role: 'alert', hidden: true });

    function save(amount) {
      store.saveEntries([{ accountId: row.accountId, month, amount }]);
      closeDialog();
    }

    // Item marcado: grava o valor padrão como lançamento (sem paidAt, a marcação fica);
    // item não marcado: apaga o lançamento e volta ao estimado.
    function useDefault() {
      const account = (store.getData()?.accounts || []).find((a) => a.id === row.accountId);
      const entry = (store.getData()?.entries || []).find((e) => e.accountId === row.accountId && e.month === month);
      if (entry?.paidAt && account && account.defaultAmount != null) save(account.defaultAmount);
      else save(null);
    }

    const form = h(
      'form',
      { class: 'edit-form' },
      h('h2', { class: 'edit-title' }, `${row.name} · ${monthName(month)}`),
      h('label', { for: 'edit-amount' }, 'Valor'),
      input,
      error,
      h(
        'div',
        { class: 'edit-actions' },
        h('button', { type: 'submit' }, 'Salvar'),
        h('button', { type: 'button', class: 'ghost', onclick: closeDialog }, 'Cancelar')
      ),
      row.hasDefault &&
        h('button', { type: 'button', class: 'link', onclick: useDefault }, 'Usar o valor padrão')
    );
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const cents = parseMoney(input.value);
      if (cents === null) {
        error.textContent = 'Não entendi esse valor. Use um formato como 150,00.';
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      save(cents);
    });
    input.addEventListener('input', () => {
      error.hidden = true;
      input.removeAttribute('aria-invalid');
    });

    dialog.replaceChildren(form);
    if (!dialog.open) dialog.showModal();
    input.focus();
  }

  // Toque fora da caixa fecha; ao fechar, o foco volta para o valor editado.
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) closeDialog();
  });
  dialog.addEventListener('close', () => {
    const last = editing;
    editing = null;
    if (!alive || !last) return;
    const btn = content.querySelector(`[data-account="${CSS.escape(String(last.row.accountId))}"]`);
    if (btn) btn.focus();
  });

  // ----- pedaços da tela -----
  function header(view, current) {
    const { min, max } = navRange(current);
    const go = (month) => ctx.navigate(month === current ? '#mes' : `#mes/${month}`, { replace: true });
    const prev = addMonths(view.month, -1);
    const next = addMonths(view.month, 1);
    return h(
      'header',
      { class: 'month-head' },
      h('button', {
        type: 'button',
        class: 'nav-btn',
        'aria-label': 'Mês anterior',
        disabled: view.month <= min,
        onclick: () => go(prev)
      }, '‹'),
      h('h1', { class: 'month-title' }, monthLabel(view.month)),
      h('button', {
        type: 'button',
        class: 'nav-btn',
        'aria-label': 'Próximo mês',
        disabled: view.month >= max,
        onclick: () => go(next)
      }, '›')
    );
  }

  // Faixa do lembrete da revisão semanal; some quando não é a hora.
  function reminderBanner(data, now) {
    const text = reminder(data.settings, now);
    if (!text) return null;
    return h(
      'div',
      { class: 'reminder', role: 'status' },
      h('span', { class: 'reminder-text' }, text),
      h('button', { type: 'button', onclick: () => ctx.navigate('#revisao') }, 'Revisar agora')
    );
  }

  function upcomingBlock(view) {
    if (view.kind !== 'current' || !view.upcoming.length) return null;
    return h(
      'section',
      { class: 'block' },
      h('h2', {}, 'Próximos meses'),
      h(
        'ul',
        { class: 'list' },
        ...view.upcoming.map((p) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'upcoming',
                'aria-label': `Abrir ${monthLabel(p.month)}`,
                onclick: () => ctx.navigate(`#mes/${p.month}`, { replace: true })
              },
              h('span', { class: 'row-name' }, p.label),
              money(p.balance)
            )
          )
        )
      )
    );
  }

  function section(title, rows, month, type, withCheck) {
    return h(
      'section',
      { class: 'block' },
      h('h2', {}, title),
      rows.length
        ? h(
            'ul',
            { class: 'list' },
            ...rows.map((row) => {
              const valueText = row.empty ? '—' : formatMoney(row.amount);
              const cls = `value-btn${row.estimated ? ' estimated' : ''}${!row.empty && row.amount < 0 ? ' neg' : ''}`;
              return h(
                'li',
                { class: `row${row.paid ? ' paid' : ''}` },
                withCheck && checkButton(row, type),
                h('span', { class: 'row-name' }, row.name),
                h(
                  'button',
                  {
                    type: 'button',
                    class: cls,
                    'data-account': row.accountId,
                    'aria-label': `Editar ${row.name}: ${row.empty ? 'sem valor' : valueText}${row.estimated ? ', estimado' : ''}`,
                    onclick: () => openEdit(row, month)
                  },
                  h('span', { class: 'value-text' }, valueText),
                  row.estimated && h('span', { class: 'tag' }, 'estimado')
                )
              );
            })
          )
        : h('p', { class: 'empty-note' }, 'Nada por aqui.')
    );
  }

  // Convite do primeiro uso (planilha sem contas).
  function invite() {
    return h(
      'section',
      { class: 'invite' },
      h('h2', { class: 'invite-title' }, 'Vamos começar?'),
      h('p', { class: 'invite-text' }, 'Cadastre o salário e as contas da casa.'),
      h('button', { type: 'button', onclick: () => ctx.navigate('#ajustes', { replace: true }) }, 'Cadastrar contas')
    );
  }

  // ----- desenho -----
  function render() {
    if (!alive) return;
    const data = store.getData();
    if (!data) {
      content.replaceChildren(h('p', { class: 'loading', role: 'status' }, 'Carregando…'));
      return;
    }
    const today = ctx.now();
    const current = currentStatus(data, today).month;
    const month = resolveMonth(ctx.params && ctx.params.month, current);
    const view = monthView(data, today, month);

    const isCurrent = view.kind === 'current';
    // Primeiro uso: sem conta ativa, a tela mostra só o cabeçalho, a linha de estado e o convite.
    const firstUse = activeAccounts(data.accounts).length === 0;
    const parts = firstUse
      ? [header(view, current), queueLine(store), invite()]
      : [
          header(view, current),
          queueLine(store),
          reminderBanner(data, today),
          h('section', { class: 'summary' }, ...summary(view)),
          upcomingBlock(view),
          section('Entradas', view.rows.income, month, 'income', isCurrent),
          section('Contas', view.rows.expense, month, 'expense', isCurrent),
          h(
            'div',
            { class: 'foot' },
            h('button', { type: 'button', class: 'ghost', onclick: () => ctx.navigate('#checkin') }, `Atualizar saldo de ${monthName(current)}`),
            h('button', { type: 'button', class: 'ghost', onclick: () => ctx.navigate('#revisao') }, 'Revisar valores')
          )
        ];
    // O redesenho troca os botões; se o foco estava num check, devolve o foco ao novo.
    const focused = content.contains(document.activeElement) ? document.activeElement.dataset.check : null;
    content.replaceChildren(...parts.filter(Boolean)); // replaceChildren(null) escreveria "null"
    if (focused) content.querySelector(`[data-check="${CSS.escape(focused)}"]`)?.focus();
  }

  const unsubscribe = store.subscribe(render);
  render();

  return function unmount() {
    alive = false;
    unsubscribe();
    closeDialog();
    el.replaceChildren();
  };
}
