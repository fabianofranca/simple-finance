// Tela "Posso comprar?" (esqueleto da T1; o conteúdo vem na T3).
import { h } from './ui.js';

export function mount(el, ctx) {
  el.replaceChildren(
    h('section', { class: 'buy' }, h('h1', {}, 'Posso comprar?'))
  );
  return function unmount() {
    el.replaceChildren();
  };
}
