// Tela "Ajustes" (esqueleto da T1; o conteúdo vem na T5).
import { h } from './ui.js';

export function mount(el, ctx) {
  el.replaceChildren(
    h('section', { class: 'settings' }, h('h1', {}, 'Ajustes'))
  );
  return function unmount() {
    el.replaceChildren();
  };
}
