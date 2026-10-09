// Tela "Posso comprar?": simula uma compra parcelada sem gravar nada.
// Regras de exibição em src/buy-view.js; dinheiro sempre por src/money.js.
import { buyView } from '../buy-view.js';
import { parseMoney } from '../money.js';
import { h, money, selectOnFocus } from './ui.js';

const MIN_COUNT = 1;
const MAX_COUNT = 24;

export function mount(el, ctx) {
  const { store } = ctx;
  let alive = true;
  let built = false;
  let count = 1;
  let shown = false; // há resposta (ou erro) na tela

  const root = h('section', { class: 'buy' });
  el.replaceChildren(root);

  const input = h('input', {
    id: 'buy-amount',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    enterkeyhint: 'go',
    placeholder: '0,00'
  });
  selectOnFocus(input);
  const countText = h('span', { class: 'stepper-value', id: 'buy-count', 'aria-live': 'polite' }, '1x');
  const minus = h('button', { type: 'button', class: 'step-btn', 'aria-label': 'Menos uma parcela', onclick: () => step(-1) }, '−');
  const plus = h('button', { type: 'button', class: 'step-btn', 'aria-label': 'Mais uma parcela', onclick: () => step(1) }, '+');
  const result = h('div', { class: 'buy-result', 'aria-live': 'polite' });

  function syncCount() {
    countText.textContent = `${count}x`;
    minus.disabled = count <= MIN_COUNT;
    plus.disabled = count >= MAX_COUNT;
  }

  function clearResult() {
    shown = false;
    result.replaceChildren();
  }

  function step(delta) {
    count = Math.min(MAX_COUNT, Math.max(MIN_COUNT, count + delta));
    syncCount();
    clearResult();
  }

  function answer() {
    const data = store.getData();
    if (!data) return;
    const view = buyView(data, ctx.now(), { installment: parseMoney(input.value), count });
    shown = true;
    if (view.error) {
      result.replaceChildren(h('p', { class: 'buy-error', role: 'alert' }, view.message));
      return;
    }
    const card = h('div', { class: `buy-card ${view.ok ? 'yes' : 'no'}` });
    if (view.warning) card.append(h('p', { class: 'buy-warning' }, view.warning));
    card.append(
      h(
        'p',
        { class: 'buy-headline' },
        h('span', { class: 'buy-mark', 'aria-hidden': 'true' }, view.ok ? '✓' : '✕'),
        ' ',
        view.headline
      )
    );
    if (view.detail) card.append(h('p', { class: 'buy-detail' }, view.detail));
    card.append(h('p', { class: 'buy-range' }, view.range));
    const list = h('ul', { class: 'buy-rows' });
    for (const row of view.rows) {
      list.append(
        h(
          'li',
          { class: 'buy-row' },
          h('span', { class: 'buy-month' }, row.label),
          h('span', { class: 'buy-values' }, money(row.before), h('span', { class: 'buy-arrow', 'aria-hidden': 'true' }, ' → '), money(row.after))
        )
      );
    }
    card.append(list);
    result.replaceChildren(card);
  }

  function build() {
    built = true;
    syncCount();
    input.addEventListener('input', clearResult);
    const form = h(
      'form',
      { class: 'buy-form' },
      h('label', { for: 'buy-amount' }, 'Valor da parcela'),
      input,
      h('label', { for: 'buy-count' }, 'Parcelas'),
      h('div', { class: 'stepper' }, minus, countText, plus),
      h('button', { type: 'submit', class: 'buy-go' }, 'Ver')
    );
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      answer();
    });
    root.replaceChildren(
      h('h1', {}, 'Posso comprar?'),
      h('p', { class: 'buy-lead' }, 'Veja se cabe no orçamento dos próximos meses.'),
      form,
      result
    );
  }

  function render() {
    if (!alive) return;
    if (!store.getData()) {
      root.replaceChildren(h('p', { class: 'loading', role: 'status' }, 'Carregando…'));
      built = false;
      return;
    }
    if (!built) build();
    else if (shown) answer(); // dados mudaram: atualiza a resposta que está na tela
  }

  const unsubscribe = store.subscribe(render);
  render();

  return function unmount() {
    alive = false;
    unsubscribe();
    el.replaceChildren();
  };
}
