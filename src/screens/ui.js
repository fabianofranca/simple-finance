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

// Campos que devem receber o foco sem selecionar o texto (ver focusAtEnd).
const keepCaret = new WeakSet();

// Ao ganhar o foco, seleciona o texto todo: o valor antigo vem preenchido e ela só digita o novo.
// No Android/iOS o toque posiciona o cursor DEPOIS do `focus` e desfaz a seleção; por isso seleciona
// de novo num setTimeout e engole o soltar do dedo (mouseup/touchend) que acompanha esse primeiro toque.
// Toques seguintes, com o campo já focado, posicionam o cursor normalmente.
export function selectOnFocus(input) {
  let fresh = false; // acabou de ganhar foco e o dedo ainda não foi solto
  let timer = null;
  input.addEventListener('focus', () => {
    if (keepCaret.has(input)) return;
    fresh = true;
    input.select();
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.activeElement === input) input.select();
      // Foco programático não tem "soltar o dedo": encerra a janela sozinho.
      timer = setTimeout(() => { fresh = false; }, 400);
    }, 0);
  });
  const swallow = (ev) => {
    if (!fresh) return;
    fresh = false;
    ev.preventDefault();
    input.select();
  };
  input.addEventListener('mouseup', swallow);
  input.addEventListener('touchend', swallow);
  input.addEventListener('blur', () => { fresh = false; clearTimeout(timer); });
  return input;
}

// Devolve o foco ao campo com o cursor no fim, sem selecionar (ex.: depois do "±").
export function focusAtEnd(input) {
  keepCaret.add(input);
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
  setTimeout(() => {
    if (document.activeElement === input) input.setSelectionRange(end, end);
    keepCaret.delete(input);
  }, 50);
}
