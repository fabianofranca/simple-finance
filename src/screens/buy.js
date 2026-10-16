// Tela "Posso comprar?": simula uma compra parcelada e, com "Pode comprar", oferece
// "Vou comprar", que lança as parcelas no cartão escolhido (plans/phase-6.md).
// Regras de exibição em src/buy-view.js; lançamento em src/purchases.js; dinheiro por src/money.js.
import { buyView } from '../buy-view.js';
import { buildPurchase, cardAccounts } from '../purchases.js';
import { parseMoney } from '../money.js';
import { h, money, selectOnFocus } from './ui.js';

const MIN_COUNT = 1;
const MAX_COUNT = 24;

// Mesmo padrão do newId do store.
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function mount(el, ctx) {
  const { store } = ctx;
  let alive = true;
  let built = false;
  let count = 1;
  let shown = false; // há resposta (ou erro) na tela
  // Valor e parcelas da resposta na tela, guardados no "Ver": o redesenho e o lançamento usam
  // estes, e não o campo (que pode ter mudado).
  let asked = null;
  let picking = false; // "Em qual cartão?" aberto no lugar do "Vou comprar"
  let actionBox = null; // fim do cartão "Pode comprar"; abrir e fechar a pergunta só troca isto

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
  // tabindex -1: recebe o foco depois de lançar (o botão tocado sai da tela)
  const heading = h('h1', { tabindex: '-1' }, 'Posso comprar?');

  function syncCount() {
    countText.textContent = `${count}x`;
    minus.disabled = count <= MIN_COUNT;
    plus.disabled = count >= MAX_COUNT;
  }

  function clearResult() {
    shown = false;
    asked = null;
    picking = false;
    actionBox = null;
    result.replaceChildren();
  }

  function step(delta) {
    count = Math.min(MAX_COUNT, Math.max(MIN_COUNT, count + delta));
    syncCount();
    clearResult();
  }

  // Um toque no cartão lança. `asked` vira null aqui, antes de gravar: um segundo toque
  // (ou o redesenho que o próprio savePurchase dispara) não acha mais resposta e não lança de novo.
  function launch(accountId) {
    if (!asked || !picking) return;
    const { installment, count: n } = asked;
    let made;
    try {
      made = buildPurchase(store.getData(), ctx.now(), { id: newId(), accountId, installment, count: n });
    } catch {
      // cartão arquivado ou removido enquanto a pergunta estava aberta: redesenha com os cartões atuais
      answer();
      return;
    }
    // Formulário volta ao início antes de gravar: o redesenho do store já encontra a tela limpa.
    input.value = '';
    count = MIN_COUNT;
    syncCount();
    clearResult();
    store.savePurchase({ purchase: made.purchase, entries: made.entries });
    ctx.notify(made.notice);
    // O botão tocado saiu da tela; o foco vai para o título, sem abrir o teclado.
    heading.focus();
  }

  function setPicking(value) {
    if (!actionBox) return;
    picking = value;
    actionBox.replaceChildren(purchaseAction(store.getData()));
    // abrir: primeiro cartão (ou "Ir para Ajustes"); fechar: de volta ao "Vou comprar"
    actionBox.querySelector('[data-focus]')?.focus();
  }

  // Fim do cartão "Pode comprar": o botão "Vou comprar" ou a pergunta "Em qual cartão?".
  function purchaseAction(data) {
    if (!picking) {
      return h('button', { type: 'button', class: 'buy-commit', 'data-focus': 'go', onclick: () => setPicking(true) }, 'Vou comprar');
    }
    const cards = cardAccounts(data);
    const body = cards.length
      ? h(
          'div',
          { class: 'buy-pick-grid' },
          ...cards.map((a) =>
            h('button', { type: 'button', class: 'buy-pick-card', 'data-focus': `card:${a.id}`, onclick: () => launch(a.id) }, a.name)
          )
        )
      : h(
          'div',
          { class: 'buy-pick-empty' },
          h('p', {}, 'Marque quais contas são cartão em Ajustes.'),
          h(
            'button',
            { type: 'button', class: 'buy-pick-settings', 'data-focus': 'settings', onclick: () => ctx.navigate('#ajustes', { replace: true }) },
            'Ir para Ajustes'
          )
        );
    return h(
      'div',
      { class: 'buy-pick', role: 'group', 'aria-labelledby': 'buy-pick-title' },
      h('p', { class: 'buy-pick-title', id: 'buy-pick-title' }, 'Em qual cartão?'),
      body,
      h('button', { type: 'button', class: 'buy-pick-cancel', 'data-focus': 'cancel', onclick: () => setPicking(false) }, 'Cancelar')
    );
  }

  function answer() {
    const data = store.getData();
    if (!data || !asked) return;
    const view = buyView(data, ctx.now(), asked);
    shown = true;
    actionBox = null;
    if (!view.ok) picking = false; // dados mudaram e não cabe mais: some a pergunta
    // O redesenho troca os botões; se o foco estava num deles, devolve o foco ao novo.
    const focused = result.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
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
    if (view.ok) {
      actionBox = h('div', { class: 'buy-action' }, purchaseAction(data));
      card.append(actionBox);
    }
    result.replaceChildren(card);
    if (focused) result.querySelector(`[data-focus="${CSS.escape(focused)}"]`)?.focus();
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
      asked = { installment: parseMoney(input.value), count };
      picking = false;
      answer();
    });
    root.replaceChildren(
      heading,
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
