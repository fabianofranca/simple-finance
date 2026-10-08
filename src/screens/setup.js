// Tela de configuração: pede URL e chave na primeira abertura.
import { saveConfig, loadConfig } from '../config.js';

const HINTS = {
  network: 'Confira se a URL termina em /exec (e não /dev) e se a implantação está com acesso "Qualquer pessoa".',
  timeout: 'A rede pode estar lenta. Tente de novo em alguns segundos.',
  unauthorized: 'A chave não confere com a propriedade SECRET do script (Configurações do projeto → Propriedades do script).',
  bad_response: 'A URL provavelmente não é a do app da Web. Confira se termina em /exec.'
};

function humanMessage(e) {
  const hint = HINTS[e && e.code];
  const base = (e && e.message) || 'Não consegui conectar.';
  return hint ? `${base}\n\n${hint}` : base;
}

export function mount(el, ctx) {
  const cfg = loadConfig();
  el.innerHTML = `
    <section class="setup">
      <h1>Contas</h1>
      <p>Para começar, informe o endereço e a chave da sua planilha.</p>
      <form>
        <label for="setup-url">Endereço (URL)</label>
        <input id="setup-url" type="url" autocomplete="off" placeholder="Cole o endereço que termina em /exec">
        <label for="setup-key">Chave</label>
        <input id="setup-key" type="password" autocomplete="off">
        <div class="actions"><button type="submit">Salvar</button></div>
      </form>
      <div class="error" role="alert" hidden></div>
    </section>`;
  const form = el.querySelector('form');
  const url = el.querySelector('#setup-url');
  const key = el.querySelector('#setup-key');
  const btn = el.querySelector('button');
  const error = el.querySelector('.error');
  url.value = cfg.url || '';
  key.value = cfg.key || '';
  let alive = true;

  const fail = text => {
    error.textContent = text;
    error.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Salvar';
  };

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    error.hidden = true;
    if (!url.value.trim() || !key.value) return fail('Preencha o endereço e a chave.');
    btn.disabled = true;
    btn.textContent = 'Conectando…';
    if (!saveConfig({ url: url.value.trim(), key: key.value })) {
      return fail('Não consegui guardar a configuração neste navegador.');
    }
    try {
      await ctx.store.refresh();
      if (alive) ctx.navigate('#mes');
    } catch (e) {
      if (alive) fail(humanMessage(e));
    }
  });

  return function unmount() {
    alive = false;
    el.replaceChildren();
  };
}
