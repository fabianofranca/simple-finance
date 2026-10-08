// Casca do app: roteador por hash, faixa de aviso e atualização dos dados.
// Contrato das telas: mount(el, ctx) devolve unmount().
// ctx = { store, now, navigate, notify, params }
import { loadConfig } from './config.js';
import { store } from './store.js';
import * as setup from './screens/setup.js';
import * as month from './screens/month.js';
import * as checkin from './screens/checkin.js';
import { shouldOpenCheckin } from './checkin.js';

const root = document.getElementById('app');
const noticeBox = document.getElementById('notice');
const noticeText = document.getElementById('notice-text');
let unmountCurrent = null;

// Faixa de aviso no topo, só em memória (some ao recarregar).
function notify(text) {
  noticeText.textContent = text;
  noticeBox.hidden = false;
}
document.getElementById('notice-close').addEventListener('click', () => {
  noticeBox.hidden = true;
});

const hasConfig = () => {
  const { url, key } = loadConfig();
  return Boolean(url && key);
};

// Abrir uma rota empilha no histórico (ex.: Mês -> Check-in, e o "voltar" volta ao Mês).
// Com { replace: true } troca a entrada atual (usado na troca de mês).
function navigate(route, { replace = false } = {}) {
  const hash = route.startsWith('#') ? route : `#${route}`;
  if (replace) {
    history.replaceState(null, '', hash);
    render();
  } else if (location.hash === hash) {
    render();
  } else {
    location.hash = hash; // dispara hashchange
  }
}

// #mes, #mes/YYYY-MM, #checkin (aberto à mão) e #checkin/auto (aberto pelo app);
// qualquer outra coisa cai no mês atual.
function parseRoute() {
  const [name, arg] = location.hash.replace(/^#/, '').split('/');
  if (name === 'checkin') return { screen: checkin, params: arg === 'auto' ? { auto: true } : {} };
  const params = /^\d{4}-(0[1-9]|1[0-2])$/.test(arg || '') ? { month: arg } : {};
  return { screen: month, params };
}

function render() {
  if (unmountCurrent) unmountCurrent();
  unmountCurrent = null;
  const ctx = { store, now: () => new Date(), navigate, notify, params: {} };
  let screen = setup; // sem URL/chave, qualquer rota mostra a configuração
  if (!hasConfig()) {
    // depois de salvar a configuração (com os dados já carregados), vê se é hora do check-in
    ctx.navigate = (route, opts) => {
      navigate(route, opts);
      maybeOpenCheckin();
    };
  }
  if (hasConfig()) {
    const route = parseRoute();
    screen = route.screen;
    ctx.params = route.params;
  }
  root.replaceChildren();
  unmountCurrent = screen.mount(root, ctx) || null;
}

// Abre o check-in sozinho quando for a hora (regras em src/checkin.js).
// Chamado depois que há dados (cache ou refresh) e quando o app volta a ficar visível.
// Idempotente: no máximo uma abertura por vez que o app fica visível, e nunca
// com o check-in já aberto.
let openedThisVisit = false;
function maybeOpenCheckin() {
  if (openedThisVisit || !hasConfig()) return;
  const data = store.getData();
  if (!data) return;
  if (location.hash.replace(/^#/, '').split('/')[0] === 'checkin') return;
  let snoozeDay = null;
  try {
    snoozeDay = localStorage.getItem('sf.snooze');
  } catch {
    // sem acesso ao storage: segue sem o "Agora não"
  }
  if (!shouldOpenCheckin(data, new Date(), snoozeDay)) return;
  openedThisVisit = true;
  navigate('#checkin/auto');
}

// Atualiza os dados; erro (sem rede etc.) não derruba a tela, que segue com o cache.
async function refresh() {
  if (!hasConfig()) return;
  try {
    await store.refresh();
  } catch {
    // segue com o cache
  }
  maybeOpenCheckin();
}

window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    openedThisVisit = false;
    refresh();
  }
});

render();
if (hasConfig()) {
  if (store.getData()) maybeOpenCheckin();
  refresh();
}
