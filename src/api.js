import { loadConfig } from './config.js';

const TIMEOUT_MS = 15000;

// Erro com um código para a UI poder sugerir a causa provável
export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function request(method, payload) {
  const { url, key } = loadConfig();
  if (!url || !key) throw new ApiError('Salve a URL e a chave antes de testar.', 'config');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  let data;
  try {
    const res = method === 'GET'
      ? await fetch(`${url}?key=${encodeURIComponent(key)}`, { signal: controller.signal })
      // text/plain evita o preflight de CORS, que o Apps Script não suporta
      : await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ key, ...payload }),
          signal: controller.signal
        });
    data = await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError('A planilha demorou mais de 15 segundos para responder.', 'timeout');
    if (e instanceof SyntaxError) throw new ApiError('A resposta não veio no formato esperado.', 'bad_response');
    throw new ApiError('Não foi possível conectar ao servidor.', 'network');
  } finally {
    clearTimeout(timer);
  }

  const ms = Math.round(performance.now() - t0);
  if (!data.ok) throw new ApiError(`Erro do servidor: ${data.error} (${ms} ms)`, data.error || 'server');
  return { ...data, latencyMs: ms };
}

export const ping = () => request('POST', { action: 'ping' });
export const loadAll = () => request('GET');
export const saveAccount = account => request('POST', { action: 'saveAccount', account });
export const saveEntries = entries => request('POST', { action: 'saveEntries', entries });
export const saveCheckin = checkin => request('POST', { action: 'saveCheckin', checkin });
export const saveSettings = settings => request('POST', { action: 'saveSettings', settings });
export const seed = () => request('POST', { action: 'seed' });
export const reset = () => request('POST', { action: 'reset' });
