// Tela Mês: resumo do mês, próximos meses e edição dos valores de cada conta.
// Regras de exibição em src/month-view.js; dinheiro sempre por src/money.js.
import { addMonths, currentStatus } from '../forecast.js';
import { monthView, monthLabel, monthName, navRange, resolveMonth } from '../month-view.js';
import { formatMoney, formatInput, parseMoney } from '../money.js';

// Monta um elemento sem innerHTML: textos entram sempre por textContent.
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'onclick') node.addEventListener('click', value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child);
  }
  return node;
}

// Valor em reais; negativo ganha a classe `neg` (vermelho).
function money(cents) {
  return h('span', { class: `money${cents < 0 ? ' neg' : ''}` }, formatMoney(cents));
}

// Linha do resumo: rótulo à esquerda, valor à direita.
function summaryLine(label, cents, strong = false) {
  return h('div', { class: `sum-line${strong ? ' strong' : ''}` }, h('span', { class: 'sum-label' }, label), money(cents));
}

function summary(view) {
  if (view.kind === 'current') {
    return [
      summaryLine('Na conta', view.balance),
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

  function queueLine() {
    const q = store.getQueueState();
    const line = h('div', { class: 'queue', role: 'status', 'aria-live': 'polite' });
    if (q.error) {
      line.classList.add('error');
      line.append(
        h('span', {}, 'Não consegui salvar.'),
        h('button', { type: 'button', class: 'link', onclick: () => store.retry() }, 'Tentar de novo')
      );
    } else if (q.sending) {
      line.append(h('span', {}, 'Salvando…'));
    } else if (q.pending > 0) {
      line.append(h('span', {}, 'Sem internet, vou tentar de novo'));
    }
    return line;
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

  function section(title, rows, month) {
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

    const parts = [
      header(view, current),
      queueLine(),
      h('section', { class: 'summary' }, ...summary(view)),
      upcomingBlock(view),
      section('Entradas', view.rows.income, month),
      section('Contas', view.rows.expense, month),
      h('div', { class: 'foot' }, h('button', { type: 'button', class: 'ghost', onclick: () => ctx.navigate('#checkin') }, 'Atualizar saldo'))
    ];
    content.replaceChildren(...parts.filter(Boolean)); // replaceChildren(null) escreveria "null"
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
