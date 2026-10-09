import { loadConfig, saveConfig, clearConfig, buildConfigLink, parseConfigLink, generateKey } from './config.js';
import { ping, seed, reset } from './api.js';
import { store } from './store.js';
import { currentStatus, project } from './forecast.js';

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

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = cents => brl.format(cents / 100);
const NEED_DATA = 'Toque em Carregar dados primeiro.';

function clearSummary() {
  $('summary').hidden = true;
  $('summary').replaceChildren();
}

function show(data) {
  const out = $('out');
  out.className = '';
  out.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function hintFor(e) {
  const hint = HINTS[e.code];
  return hint ? `${e.message}\n\nDica: ${hint}` : e.message;
}

function showError(e) {
  clearSummary();
  const out = $('out');
  out.className = 'err';
  out.textContent = hintFor(e);
}

async function run(fn) {
  clearSummary();
  show('Carregando...');
  try {
    await fn();
  } catch (e) {
    showError(e);
  }
}

// Estado da fila, sempre visível
function renderQueue() {
  const { pending, sending, error } = store.getQueueState();
  let text = 'Tudo salvo';
  if (sending) text = 'Enviando…';
  else if (pending) text = `${pending} gravação(ões) pendente(s)`;
  $('queue-text').textContent = text;
  $('queue-error').hidden = !error;
  $('queue-actions').hidden = !error;
  if (error) $('queue-error').textContent = hintFor(error);
}

function renderTestTools() {
  $('test-tools').hidden = store.getData()?.settings?.environment !== 'test';
}

store.subscribe(() => {
  renderQueue();
  renderTestTools();
});

function line(label, cents, parent) {
  const row = document.createElement('div');
  row.className = 'line';
  const l = document.createElement('span');
  l.textContent = label;
  const v = document.createElement('span');
  v.textContent = money(cents);
  if (cents < 0) v.className = 'neg';
  row.append(l, v);
  parent.append(row);
}

function heading(text, parent) {
  const h = document.createElement('h3');
  h.textContent = text;
  parent.append(h);
}

function showForecast(data) {
  const today = new Date();
  const status = currentStatus(data, today);
  const next = project(data, today, 3);
  const box = $('summary');
  box.replaceChildren();
  heading(`Mês atual (${status.month})`, box);
  line('Na conta', status.balance, box);
  line('Falta pagar', status.toPay, box);
  line('Sobra no fim do mês', status.endOfMonth, box);
  heading('Próximos meses (sobra acumulada)', box);
  for (const m of next) line(m.month, m.balance, box);
  box.hidden = false;
  show({ status, project: next });
}

$('save').onclick = () => {
  const ok = saveConfig({ url: $('url').value.trim(), key: $('key').value });
  clearSummary();
  show(ok ? 'Configuração salva neste navegador.' : 'Não foi possível salvar neste navegador.');
};
$('clear').onclick = () => {
  clearConfig();
  $('url').value = '';
  $('key').value = '';
  clearSummary();
  show('Configuração apagada.');
};

$('ping').onclick = () => run(async () => {
  const { latencyMs, ...rest } = await ping();
  show({ ...rest, latencia_ms: latencyMs });
});

$('read').onclick = () => run(async () => {
  show(await store.refresh());
});

$('forecast').onclick = () => {
  const data = store.getData();
  if (!data) {
    clearSummary();
    show(NEED_DATA);
    return;
  }
  try {
    showForecast(data);
  } catch (e) {
    showError(e);
  }
};

$('settings').onclick = () => {
  const data = store.getData();
  clearSummary();
  if (!data) return show(NEED_DATA);
  const { checkinFrequency, horizonMonths } = data.settings;
  store.saveSettings({ checkinFrequency, horizonMonths });
  show('Ajustes regravados. Veja o estado da fila acima.');
};

$('seed').onclick = () => run(async () => {
  await seed();
  show(await store.refresh());
});

$('reset').onclick = () => {
  if (!confirm('Apagar todos os dados da planilha de teste?')) return;
  return run(async () => {
    await reset();
    show(await store.refresh());
  });
};

$('retry').onclick = () => store.retry();
$('discard').onclick = () => {
  if (!confirm('Descartar as gravações pendentes? Elas não serão enviadas.')) return;
  run(async () => {
    await store.discardPending();
    show('Pendências descartadas.');
  });
};

const cfg = loadConfig();
if (cfg.url) $('url').value = cfg.url;
if (cfg.key) $('key').value = cfg.key;

renderQueue();
renderTestTools();
if (cfg.url && cfg.key) {
  const cached = store.getData();
  if (cached) show(cached);
  store.refresh().then(d => { if (!cached) show(d); }).catch(showError);
}

// Link de configuração: não usa nem grava a configuração do aparelho.
let copiedTimer;

$('cl-genkey').addEventListener('click', () => {
  $('cl-key').value = generateKey((n) => crypto.getRandomValues(new Uint8Array(n)));
});

$('cl-genlink').addEventListener('click', () => {
  const url = $('cl-url').value.trim();
  const key = $('cl-key').value.trim();
  const link = buildConfigLink(new URL('./', location.href).href, { url, key });
  $('cl-copied').hidden = true;
  if (!parseConfigLink(link)) {
    $('cl-result').hidden = true;
    $('cl-error').textContent = 'Confira o endereço: precisa ser o /exec do Apps Script, e a chave não pode ficar vazia.';
    $('cl-error').hidden = false;
    return;
  }
  $('cl-error').hidden = true;
  $('cl-link').value = link;
  $('cl-result').hidden = false;
});

$('cl-copy').addEventListener('click', async () => {
  const field = $('cl-link');
  let ok = false;
  try {
    await navigator.clipboard.writeText(field.value);
    ok = true;
  } catch {
    field.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
  }
  if (!ok) return;
  $('cl-copied').hidden = false;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { $('cl-copied').hidden = true; }, 2000);
});
