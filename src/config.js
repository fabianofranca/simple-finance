const CONFIG_KEY = 'contas-config';

export function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveConfig({ url, key }) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, key }));
    return true;
  } catch {
    return false;
  }
}

export function clearConfig() {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    // sem acesso ao localStorage: nada a apagar
  }
}

// Endereço resumido para a tela Ajustes: "script.google.com · …abc123"
// (6 últimos caracteres do id do script). Outro formato: só o host; inválido: ''.
export function shortUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? '').trim());
  } catch {
    return '';
  }
  const id = /\/s\/([^/]+)\/exec\/?$/.exec(parsed.pathname)?.[1];
  if (parsed.host === 'script.google.com' && id) return `script.google.com · …${id.slice(-6)}`;
  return parsed.host;
}
