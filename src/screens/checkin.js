// Tela Check-in (stub da T1; a T5 implementa).
export function mount(el, ctx) {
  el.innerHTML = '<h1>Check-in</h1>';
  return function unmount() {
    el.replaceChildren();
  };
}
