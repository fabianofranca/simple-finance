// Casca do app: roteador por hash, faixa de aviso e atualização dos dados.
// Contrato das telas: mount(el, ctx) devolve unmount().
// ctx = { store, now, navigate, back, notify, params }
import { loadConfig, saveConfig, clearConfig, parseConfigLink, sameConfig } from './config.js';
import { store } from './store.js';
import * as setup from './screens/setup.js';
import * as month from './screens/month.js';
import * as checkin from './screens/checkin.js';
import * as buy from './screens/buy.js';
import * as review from './screens/review.js';
import * as settings from './screens/settings.js';
import { shouldOpenCheckin } from './checkin.js';
import { confirmDialog } from './screens/ui.js';

const root = document.getElementById('app');
const noticeBox = document.getElementById('notice');
const noticeText = document.getElementById('notice-text');
const tabbar = document.getElementById('tabbar');
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

// Cada entrada que o próprio app empilha guarda sua profundidade em history.state ({ sf: n }).
// Entradas de fora (primeiro acesso, hash digitado, recarga) têm profundidade 0.
const depth = () => (history.state && history.state.sf) || 0;

// Abrir uma rota empilha no histórico (ex.: Mês -> Check-in, e o "voltar" volta ao Mês).
// Com { replace: true } troca a entrada atual, mantendo a profundidade (usado na troca de mês).
function navigate(route, { replace = false } = {}) {
  const hash = route.startsWith('#') ? route : `#${route}`;
  if (replace) {
    history.replaceState(history.state, '', hash);
    render();
  } else if (location.hash === hash) {
    render();
  } else {
    history.pushState({ sf: depth() + 1 }, '', hash); // pushState não dispara hashchange
    render();
  }
}

// Volta para a tela de onde esta foi aberta; sem tela anterior do app, vai para o mês atual.
// O history.back() dispara hashchange, que já renderiza.
function back() {
  if (depth() > 0) history.back();
  else navigate('#mes', { replace: true });
}

// Tabela de rotas: nome do hash -> tela e aba da barra inferior (null = sem barra).
const ROUTES = {
  mes: { screen: month, tab: 'mes' },
  comprar: { screen: buy, tab: 'comprar' },
  ajustes: { screen: settings, tab: 'ajustes' },
  checkin: { screen: checkin, tab: null },
  revisao: { screen: review, tab: null }
};

// Parâmetros do check-in por sufixo: auto (abertura automática) e as respostas já marcadas pelos switches da tela Mês.
const CHECKIN_PARAMS = {
  auto: { auto: true },
  paguei: { preset: 'billsPaid' },
  recebi: { preset: 'incomeReceived' }
};

// #mes, #mes/YYYY-MM, #comprar, #ajustes, #revisao, #checkin (à mão), #checkin/auto, #checkin/paguei e #checkin/recebi (pelo app);
// qualquer outra coisa cai no mês atual.
function parseRoute() {
  const [name, arg] = location.hash.replace(/^#/, '').split('/');
  const route = ROUTES[name] || ROUTES.mes;
  let params = {};
  if (route.screen === checkin) params = CHECKIN_PARAMS[arg] || {};
  else if (route.screen === month) params = /^\d{4}-(0[1-9]|1[0-2])$/.test(arg || '') ? { month: arg } : {};
  return { ...route, params };
}

// Barra inferior: só aparece quando a rota tem aba; marca a aba ativa.
function updateTabbar(tab) {
  tabbar.hidden = tab === null;
  document.body.classList.toggle('has-tabbar', tab !== null);
  for (const btn of tabbar.querySelectorAll('button[data-tab]')) {
    if (btn.dataset.tab === tab) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
}
tabbar.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-tab]');
  if (btn) navigate(`#${btn.dataset.tab}`, { replace: true }); // "Mês" vale #mes: volta ao mês atual
});

// Mensagem para a tela de configuração (link incompleto); vale para uma única tela.
let setupMessage = null;

function render() {
  if (unmountCurrent) unmountCurrent();
  unmountCurrent = null;
  const ctx = { store, now: () => new Date(), navigate, back, notify, params: {} };
  let screen = setup;
  let tab = null; // sem URL/chave, qualquer rota mostra a configuração
  if (setupMessage) ctx.params = { linkError: setupMessage };
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
    tab = route.tab;
    ctx.params = route.params;
  }
  setupMessage = null;
  updateTabbar(tab);
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
  const current = location.hash.replace(/^#/, '').split('/')[0];
  if (current === 'checkin' || current === 'revisao') return;
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

// Link de configuração (#conectar?u=…&k=…): tratado antes do roteador. O link, que leva a chave,
// sai da barra de endereço e do histórico em todos os casos (replaceState, nunca pushState).
const isConnectLink = () => location.hash.startsWith('#conectar');

function stripLink(hash) {
  history.replaceState(null, '', location.pathname + location.search + hash);
}

async function openConnectLink() {
  const incoming = parseConfigLink(location.href);
  if (!incoming) {
    if (hasConfig()) {
      stripLink('#mes');
      notify('Esse link de configuração não está completo. Peça um novo ao Fabiano.');
      startApp();
    } else {
      stripLink('');
      setupMessage = 'Esse link de configuração não está completo. Peça um novo ao Fabiano.';
      render();
    }
    return;
  }
  stripLink('#mes');
  if (!hasConfig()) {
    saveConfig(incoming);
    startApp();
  } else if (sameConfig(loadConfig(), incoming)) {
    startApp();
  } else {
    // Fundo do diálogo: só a tela atual, sem atualizar nem abrir o check-in da planilha antiga.
    render();
    const ok = await confirmDialog(
      'Esse link troca a planilha deste aparelho. Os dados guardados aqui serão apagados.',
      'Trocar'
    );
    if (!ok) {
      startApp();
      return;
    }
    // Mesmo que "Trocar planilha" (Ajustes); o store descarta buscas em andamento ao limpar.
    if (unmountCurrent) unmountCurrent();
    unmountCurrent = null;
    clearConfig();
    store.clear();
    try {
      localStorage.removeItem('sf.snooze');
    } catch {
      // sem acesso ao storage: nada a apagar
    }
    saveConfig(incoming);
    openedThisVisit = false;
    stripLink('#mes'); // a planilha nova começa sempre pelo Mês
    startApp();
  }
}

window.addEventListener('hashchange', () => {
  if (isConnectLink()) openConnectLink();
  else render();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    openedThisVisit = false;
    refresh();
  }
});

function startApp() {
  render();
  if (hasConfig()) {
    if (store.getData()) maybeOpenCheckin();
    refresh();
  }
}

// Recarregar não conta como "veio de outra tela": zera a profundidade da entrada atual.
if (depth() > 0) history.replaceState(null, '', location.href);
if (isConnectLink()) openConnectLink();
else startApp();
