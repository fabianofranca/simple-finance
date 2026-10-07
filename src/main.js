import { loadConfig, saveConfig, clearConfig } from './config.js';
import { getRows, appendRow, ping } from './api.js';

const $ = id => document.getElementById(id);

const HINTS = {
  network: 'Confira se a URL termina em /exec (e não /dev) e se a implantação está com acesso "Qualquer pessoa".',
  timeout: 'A rede pode estar lenta. Tente de novo em alguns segundos.',
  unauthorized: 'A chave não confere com o SECRET do Code.gs.',
  bad_response: 'A URL provavelmente não é a do app da Web. Confira se termina em /exec.',
  unknown_action: 'O script implantado está desatualizado. Crie uma nova versão da implantação.',
  invalid_json: 'O script implantado está desatualizado. Crie uma nova versão da implantação.',
  config: 'Preencha a URL e a chave e toque em "Salvar configuração".'
};

function show(data) {
  const out = $('out');
  out.className = '';
  out.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function showError(e) {
  const out = $('out');
  out.className = 'err';
  const hint = HINTS[e.code];
  out.textContent = hint ? `${e.message}\n\nDica: ${hint}` : e.message;
}

async function run(fn) {
  show('Carregando...');
  try {
    const { latencyMs, ...rest } = await fn();
    show({ ...rest, latencia_ms: latencyMs });
  } catch (e) {
    showError(e);
  }
}

$('save').onclick = () => {
  const ok = saveConfig({ url: $('url').value.trim(), key: $('key').value });
  show(ok ? 'Configuração salva neste navegador.' : 'Não foi possível salvar neste navegador.');
};
$('clear').onclick = () => {
  clearConfig();
  $('url').value = '';
  $('key').value = '';
  show('Configuração apagada.');
};
$('ping').onclick = () => run(ping);
$('read').onclick = () => run(getRows);
$('append').onclick = () => run(() => appendRow({
  descricao: 'Conta de teste',
  valor: 123.45,
  vencimento: new Date().toISOString().slice(0, 10),
  pago: false
}));

const cfg = loadConfig();
if (cfg.url) $('url').value = cfg.url;
if (cfg.key) $('key').value = cfg.key;
