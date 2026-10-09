// Tela Mês: resumo do mês, próximos meses e edição dos valores de cada conta.
// Regras de exibição em src/month-view.js; dinheiro sempre por src/money.js.
import { addMonths, currentStatus, monthFlags } from '../forecast.js';
import { monthView, monthLabel, monthName, navRange, resolveMonth } from '../month-view.js';
import { formatMoney, formatInput, parseMoney } from '../money.js';
import { buildToggle, checkinForm, dropNotice, toggleText } from '../checkin.js';
import { reminder } from '../review.js';
import { h, money, queueLine } from './ui.js';

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
  const toggleDialog = h('dialog', { class: 'edit-dialog' }); // diálogo dos switches Recebi/Paguei
  el.replaceChildren(content, dialog, toggleDialog);

  // ----- edição -----
  let editing = null; // { row, month }

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  // ----- switches "Recebi" / "Paguei" (só no mês atual) -----
  let toggling = null; // campo do switch cujo diálogo está aberto

  function closeToggle() {
    if (toggleDialog.open) toggleDialog.close();
  }

  // O switch nunca muda sozinho: pede o saldo (com check-in no mês) ou leva ao "Atualizar saldo".
  function onSwitch(field, value, month) {
    const data = store.getData();
    const now = ctx.now();
    if (!data) return;
    if (!monthFlags(data, now).hasCheckin) {
      ctx.navigate(field === 'billsPaid' ? '#checkin/paguei' : '#checkin/recebi');
      return;
    }
    toggling = field;
    const text = toggleText(field, value, month);
    const input = h('input', {
      id: 'toggle-balance',
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      enterkeyhint: 'done'
    });
    const last = checkinForm(data, now).balance;
    if (last !== null) input.value = formatInput(last);
    const sign = h('button', { type: 'button', class: 'sign', 'aria-label': 'Trocar o sinal' }, '±');
    sign.addEventListener('click', () => {
      const t = input.value.trim();
      input.value = /^[-−]/.test(t) ? t.replace(/^[-−]\s*/, '') : `-${t}`;
      input.focus();
    });
    const error = h('p', { class: 'edit-error', role: 'alert', hidden: true });
    const form = h(
      'form',
      { class: 'edit-form' },
      h('h2', { class: 'edit-title' }, text.title),
      h('label', { for: 'toggle-balance' }, text.label),
      h('div', { class: 'toggle-balance' }, h('span', { class: 'currency', 'aria-hidden': 'true' }, 'R$'), input, sign),
      error,
      h(
        'div',
        { class: 'edit-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: closeToggle }, 'Cancelar'),
        h('button', { type: 'submit' }, 'Confirmar')
      )
    );
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const balance = parseMoney(input.value, { allowNegative: true });
      if (balance === null) {
        error.textContent = 'Não entendi esse valor. Use um formato como 150,00.';
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      const previous = store.getData();
      const checkin = buildToggle(previous, ctx.now(), { field, value, balance });
      const notice = dropNotice(previous, checkin); // antes de gravar, com os dados anteriores
      store.saveCheckin(checkin);
      if (notice) ctx.notify(notice.text);
      closeToggle();
    });
    input.addEventListener('input', () => {
      error.hidden = true;
      input.removeAttribute('aria-invalid');
    });
    toggleDialog.replaceChildren(form);
    if (!toggleDialog.open) toggleDialog.showModal();
    input.focus();
    input.select();
  }

  // Toque fora da caixa fecha; ao fechar, o foco volta para o switch.
  toggleDialog.addEventListener('click', (ev) => {
    if (ev.target === toggleDialog) closeToggle();
  });
  toggleDialog.addEventListener('close', () => {
    const field = toggling;
    toggling = null;
    if (!alive || !field) return;
    const btn = content.querySelector(`[data-switch="${field}"]`);
    if (btn) btn.focus();
  });

  function switchButton(field, text, on, month) {
    return h(
      'button',
      {
        type: 'button',
        class: 'switch',
        role: 'switch',
        'aria-checked': String(on),
        'data-switch': field,
        onclick: () => onSwitch(field, !on, month)
      },
      h('span', { class: 'switch-text' }, text),
      h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-thumb' }))
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
    const error = h('p', { class: 'edit-error', role: 'alert', hidden: true });

    function save(amount) {
      store.saveEntries([{ accountId: row.accountId, month, amount }]);
      closeDialog();
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
        h('button', { type: 'button', class: 'link', onclick: () => save(null) }, 'Usar o valor padrão')
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
    input.select();
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

  function section(title, rows, month, toggle = null) {
    return h(
      'section',
      { class: 'block' },
      toggle ? h('div', { class: 'block-head' }, h('h2', {}, title), toggle) : h('h2', {}, title),
      rows.length
        ? h(
            'ul',
            { class: 'list' },
            ...rows.map((row) => {
              const valueText = row.empty ? '—' : formatMoney(row.amount);
              const cls = `value-btn${row.estimated ? ' estimated' : ''}${!row.empty && row.amount < 0 ? ' neg' : ''}`;
              return h(
                'li',
                { class: 'row' },
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
    const parts = [
      header(view, current),
      queueLine(store),
      reminderBanner(data, today),
      h('section', { class: 'summary' }, ...summary(view)),
      upcomingBlock(view),
      section('Entradas', view.rows.income, month,
        isCurrent && switchButton('incomeReceived', 'Recebi', view.flags.incomeReceived, month)),
      section('Contas', view.rows.expense, month,
        isCurrent && switchButton('billsPaid', 'Paguei', view.flags.billsPaid, month)),
      h(
        'div',
        { class: 'foot' },
        h('button', { type: 'button', class: 'ghost', onclick: () => ctx.navigate('#checkin') }, `Atualizar saldo de ${monthName(current)}`),
        h('button', { type: 'button', class: 'ghost', onclick: () => ctx.navigate('#revisao') }, 'Revisar valores')
      )
    ];
    // O redesenho troca os botões; se o foco estava num switch, devolve o foco ao novo.
    const focused = content.contains(document.activeElement) ? document.activeElement.dataset.switch : null;
    content.replaceChildren(...parts.filter(Boolean)); // replaceChildren(null) escreveria "null"
    if (focused) content.querySelector(`[data-switch="${focused}"]`)?.focus();
  }

  const unsubscribe = store.subscribe(render);
  render();

  return function unmount() {
    alive = false;
    unsubscribe();
    closeDialog();
    closeToggle();
    el.replaceChildren();
  };
}
