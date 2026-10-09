// Tela de configuração: cola o link recebido ou, à mão, URL e chave.
import { saveConfig, loadConfig, parseConfigLink } from '../config.js';

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
      <p>Para começar, abra o link que você recebeu ou cole ele aqui.</p>
      <form class="link-form">
        <label for="setup-link">Cole aqui o link que você recebeu</label>
        <textarea id="setup-link" rows="3" autocomplete="off" autocapitalize="none" spellcheck="false"></textarea>
        <div class="actions"><button type="submit">Conectar</button></div>
      </form>
      <details class="manual">
        <summary>Configurar à mão</summary>
        <form class="manual-form">
          <label for="setup-url">Endereço (URL)</label>
          <input id="setup-url" type="url" autocomplete="off" placeholder="Cole o endereço que termina em /exec">
          <label for="setup-key">Chave</label>
          <input id="setup-key" type="password" autocomplete="off">
          <div class="actions"><button type="submit">Salvar</button></div>
        </form>
      </details>
      <div class="error" role="alert" hidden></div>
    </section>`;
  const linkForm = el.querySelector('.link-form');
  const manualForm = el.querySelector('.manual-form');
  const link = el.querySelector('#setup-link');
  const url = el.querySelector('#setup-url');
  const key = el.querySelector('#setup-key');
  const linkBtn = linkForm.querySelector('button');
  const manualBtn = manualForm.querySelector('button');
  const error = el.querySelector('.error');
  url.value = cfg.url || '';
  key.value = cfg.key || '';
  let alive = true;

  const showError = text => {
    error.textContent = text;
    error.hidden = false;
  };
  // Mensagem vinda da casca (ex.: link de configuração incompleto)
  if (ctx.params && ctx.params.linkError) showError(ctx.params.linkError);

  const setBusy = (btn, label) => {
    linkBtn.disabled = true;
    manualBtn.disabled = true;
    btn.textContent = label;
  };
  const fail = (btn, label, text) => {
    showError(text);
    linkBtn.disabled = false;
    manualBtn.disabled = false;
    btn.textContent = label;
  };

  // Grava a configuração e testa a conexão; só sai da tela se os dados chegarem.
  async function connect(config, btn, label) {
    setBusy(btn, 'Conectando…');
    if (!saveConfig(config)) {
      return fail(btn, label, 'Não consegui guardar a configuração neste navegador.');
    }
    try {
      await ctx.store.refresh();
      if (alive) ctx.navigate('#mes');
    } catch (e) {
      if (alive) fail(btn, label, humanMessage(e));
    }
  }

  linkForm.addEventListener('submit', ev => {
    ev.preventDefault();
    error.hidden = true;
    const parsed = parseConfigLink(link.value);
    if (!parsed) return showError('Esse link não parece completo. Confira se copiou tudo.');
    connect(parsed, linkBtn, 'Conectar');
  });

  manualForm.addEventListener('submit', ev => {
    ev.preventDefault();
    error.hidden = true;
    if (!url.value.trim() || !key.value) return showError('Preencha o endereço e a chave.');
    connect({ url: url.value.trim(), key: key.value }, manualBtn, 'Salvar');
  });

  return function unmount() {
    alive = false;
    el.replaceChildren();
  };
}
