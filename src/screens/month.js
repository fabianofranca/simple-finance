// Tela Mês (stub da T1; a T4 implementa).
export function mount(el, ctx) {
  el.innerHTML = '<h1>Mês</h1><p><a href="#checkin">Conferir saldo</a></p>';
  return function unmount() {
    el.replaceChildren();
  };
}
