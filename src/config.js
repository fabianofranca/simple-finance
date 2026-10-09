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

const EXEC_URL = /^https:\/\/script\.google\.com\/macros\/s\/[^/?#\s]+\/exec$/;

// Lê o link de configuração (#conectar?u=URL&k=CHAVE). Aceita o link inteiro,
// só o hash ou o texto colado com espaços/quebras de linha em volta.
// Devolve { url, key } ou null se faltar algo ou a URL não for do Apps Script (/exec).
export function parseConfigLink(text) {
  const raw = String(text ?? '').trim();
  const marker = '#conectar?';
  const at = raw.indexOf(marker);
  if (at === -1) return null;
  const params = new URLSearchParams(raw.slice(at + marker.length));
  let url = (params.get('u') ?? '').trim();
  const key = (params.get('k') ?? '').trim();
  if (url.endsWith('/exec/')) url = url.slice(0, -1);
  if (!EXEC_URL.test(url) || !key) return null;
  return { url, key };
}

// Monta o link de configuração a partir do endereço do app (qualquer #… da base é descartado).
export function buildConfigLink(base, { url, key }) {
  const clean = String(base ?? '').split('#')[0];
  return `${clean}#conectar?u=${encodeURIComponent(url)}&k=${encodeURIComponent(key)}`;
}

// Mesma planilha? Compara URL e chave, ignorando espaços nas pontas.
export function sameConfig(a, b) {
  const norm = (c) => [String(c?.url ?? '').trim(), String(c?.key ?? '').trim()];
  const [ua, ka] = norm(a);
  const [ub, kb] = norm(b);
  return ua === ub && ka === kb;
}

const KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const KEY_LENGTH = 32;

// Chave de 32 caracteres [A-Za-z0-9]. `randomBytes(n)` devolve um Uint8Array de n bytes
// (a tela passa (n) => crypto.getRandomValues(new Uint8Array(n))).
// Sem viés de módulo: 62 * 4 = 248, então bytes >= 248 são descartados e se pede mais.
export function generateKey(randomBytes) {
  let key = '';
  while (key.length < KEY_LENGTH) {
    for (const byte of randomBytes(KEY_LENGTH * 2)) {
      if (byte >= 248) continue;
      key += KEY_CHARS[byte % 62];
      if (key.length === KEY_LENGTH) break;
    }
  }
  return key;
}
