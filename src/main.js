import { loadConfig, saveConfig, clearConfig } from './config.js';
import { loadAll, ping } from './api.js';

const $ = id => document.getElementById(id);

const HINTS = {
  network: 'Confira se a URL termina em /exec (e não /dev) e se a implantação está com acesso "Qualquer pessoa".',
  timeout: 'A rede pode estar lenta. Tente de novo em alguns segundos.',
  unauthorized: 'A chave não confere com a propriedade SECRET do script (Configurações do projeto → Propriedades do script).',
  bad_response: 'A URL provavelmente não é a do app da Web. Confira se termina em /exec.',
  unknown_action: 'O script implantado está desatualizado. Crie uma nova versão da implantação.',
  invalid_json: 'O script implantado está desatualizado. Crie uma nova versão da implantação.',
  config: 'Preencha a URL e a chave e toque em "Salvar configuração".',
  busy: 'A planilha está ocupada com outra gravação. Tente de novo em alguns segundos.',
  forbidden: 'Essa ação só funciona na planilha de teste (linha ambiente = teste na aba Config).',
  invalid_payload: 'O servidor recusou os dados enviados. Provavelmente é um erro do app.',
  bad_sheet_data: 'O Sheets converteu um mês ou id em data. Formate a coluna como texto simples.'
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
$('read').onclick = () => run(loadAll);

const cfg = loadConfig();
if (cfg.url) $('url').value = cfg.url;
if (cfg.key) $('key').value = cfg.key;
