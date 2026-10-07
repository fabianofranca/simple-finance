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
