// Tela "Revisar valores" (esqueleto da T1; o conteúdo vem na T4).
import { h } from './ui.js';

export function mount(el, ctx) {
  el.replaceChildren(
    h('section', { class: 'review' }, h('h1', {}, 'Revisar valores'), h('button', { type: 'button', class: 'ghost', onclick: () => ctx.back() }, 'Sair'))
  );
  return function unmount() {
    el.replaceChildren();
  };
}
