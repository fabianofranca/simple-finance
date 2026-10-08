// Ajudantes de tela compartilhados: montar DOM, dinheiro, linha de estado da gravação e confirmação.
import { formatMoney } from '../money.js';

// Monta um elemento sem innerHTML: textos entram sempre por textContent.
export function h(tag, props = {}, ...children) {
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
export function money(cents) {
  return h('span', { class: `money${cents < 0 ? ' neg' : ''}` }, formatMoney(cents));
}

// Linha de estado da gravação em segundo plano.
export function queueLine(store) {
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

// Pergunta com [Cancelar] e [okLabel]; resolve true só no OK. Fechar de qualquer outro jeito é false.
export function confirmDialog(text, okLabel = 'OK') {
  return new Promise((resolve) => {
    let result = false;
    const dialog = h('dialog', { class: 'confirm-dialog' });
    const ok = h('button', {
      type: 'button',
      onclick: () => {
        result = true;
        dialog.close();
      }
    }, okLabel);
    const cancel = h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancelar');
    dialog.append(h('p', { class: 'confirm-text' }, text), h('div', { class: 'confirm-actions' }, cancel, ok));
    dialog.addEventListener('click', (ev) => {
      if (ev.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
