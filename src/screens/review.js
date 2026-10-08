// Tela Revisar valores: uma pergunta por vez sobre as contas do mês que vem.
// Regras (perguntas, textos, antes/depois) em src/review.js; aqui só se monta a tela.
import { reviewQuestions, questionText, monthEnd, reviewDone } from '../review.js';
import { formatInput, parseMoney } from '../money.js';
import { h, queueLine } from './ui.js';

export function mount(el, ctx) {
  const { store } = ctx;
  let alive = true;
  let started = false;

  // Fixos desde o início: gravações otimistas não podem bagunçar a lista nem o "antes".
  let month = null;
  let items = [];
  let before = null;
  let index = 0;
  let finished = false;

  const progress = h('span', { class: 'review-progress' });
  const queueBox = h('div', { class: 'review-queue' });
  const card = h('div', { class: 'review-card' });
  const top = h(
    'div',
    { class: 'review-top' },
    h('button', { type: 'button', class: 'ghost review-exit', onclick: () => ctx.back() }, 'Sair'),
    progress
  );
  el.replaceChildren(h('section', { class: 'review' }, top, queueBox, card));

  function paintQueue() {
    queueBox.replaceChildren(queueLine(store));
  }

  // Foca o título a cada passo, para o leitor de tela anunciar a nova pergunta.
  function show(...nodes) {
    card.replaceChildren(...nodes);
    const heading = card.querySelector('h1');
    if (heading) heading.focus({ preventScroll: true });
  }

  function next() {
    index += 1;
    renderStep();
  }

  function renderStep() {
    if (!alive) return;
    if (index >= items.length) {
      finish();
      return;
    }
    const item = items[index];
    const { title, question } = questionText(item, month);
    progress.textContent = `${index + 1} de ${items.length}`;

    const isAsk = item.kind === 'ask';
    const first = isAsk
      ? h('button', { type: 'button', class: 'review-choice secondary', onclick: next }, 'Ainda não sei')
      : h('button', { type: 'button', class: 'review-choice', onclick: next }, 'Sim');
    const second = h(
      'button',
      { type: 'button', class: `review-choice${isAsk ? '' : ' secondary'}`, onclick: () => renderInput(item) },
      isAsk ? 'Informar' : 'Mudou'
    );
    show(
      h('h1', { class: 'review-title', tabindex: '-1' }, title),
      h('p', { class: 'review-question' }, question),
      h('div', { class: 'review-choices' }, first, second),
      h('button', { type: 'button', class: 'review-skip', onclick: next }, 'Pular')
    );
  }

  function renderInput(item) {
    const { title } = questionText(item, month);
    const input = h('input', {
      id: 'review-amount',
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      enterkeyhint: 'done'
    });
    input.value = item.kind === 'ask' ? '' : formatInput(item.amount);
    const error = h('p', { class: 'review-error', role: 'alert', hidden: true });

    input.addEventListener('input', () => {
      error.hidden = true;
      input.removeAttribute('aria-invalid');
    });

    const form = h(
      'form',
      { class: 'review-form', novalidate: true },
      h('label', { for: 'review-amount' }, 'Valor'),
      input,
      error,
      h(
        'div',
        { class: 'review-choices' },
        h('button', { type: 'button', class: 'review-choice secondary', onclick: () => renderStep() }, 'Cancelar'),
        h('button', { type: 'submit', class: 'review-choice' }, 'Salvar')
      )
    );
    let saved = false;
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (saved) return;
      const cents = parseMoney(input.value);
      if (cents === null) {
        error.textContent = 'Não entendi esse valor. Use um formato como 150,00.';
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      saved = true;
      store.saveEntries([{ accountId: item.accountId, month, amount: cents }]);
      next();
    });

    show(h('h1', { class: 'review-title', tabindex: '-1' }, title), form);
    input.focus();
    input.select();
  }

  function finish() {
    if (finished) return;
    finished = true;
    const now = ctx.now();
    const after = monthEnd(store.getData(), now, month);
    store.saveSettings({ lastReviewAt: now.toISOString() });
    progress.textContent = '';
    show(
      h('h1', { class: 'review-done', tabindex: '-1' }, reviewDone(month, before, after)),
      h(
        'div',
        { class: 'review-choices' },
        h('button', { type: 'button', class: 'review-choice', onclick: () => ctx.navigate('#mes', { replace: true }) }, 'Ver os próximos meses')
      )
    );
  }

  // Sem dados ainda: "Carregando…" e começa quando o store avisar.
  function start() {
    if (!alive || started) return;
    const data = store.getData();
    if (!data) return;
    started = true;
    const now = ctx.now();
    const questions = reviewQuestions(data, now);
    month = questions.month;
    items = questions.items;
    before = monthEnd(data, now, month);
    renderStep();
  }

  card.append(h('p', { class: 'review-loading', role: 'status' }, 'Carregando…'));
  const unsubscribe = store.subscribe(() => {
    if (!alive) return;
    paintQueue();
    start();
  });
  paintQueue();
  start();

  return function unmount() {
    alive = false;
    unsubscribe();
    el.replaceChildren();
  };
}
