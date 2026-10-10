import * as realApi from './api.js';

// Cache local + fila de gravação. A tela lê do cache na hora; as gravações
// são aplicadas de forma otimista e enviadas em segundo plano, em ordem.

const DATA_KEY = 'sf.data';
const QUEUE_KEY = 'sf.queue';
const SETTINGS_KEYS = ['checkinFrequency', 'horizonMonths', 'lastReviewAt'];
const RETRY_CODES = new Set(['network', 'timeout', 'busy']);
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 60000;

const clone = v => JSON.parse(JSON.stringify(v));

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Aplicação otimista: mesmas regras do servidor. Sempre devolve um objeto novo.
function applyOp(data, op) {
  const next = { ...data };
  const p = op.payload;
  if (op.type === 'saveAccount') {
    const list = data.accounts.slice();
    const i = list.findIndex(a => a.id === p.id);
    if (i >= 0) list[i] = { ...list[i], ...p };
    else list.push({ ...p });
    next.accounts = list;
  } else if (op.type === 'saveEntries') {
    const list = data.entries.slice();
    for (const e of p) {
      const i = list.findIndex(x => x.accountId === e.accountId && x.month === e.month);
      if (e.amount === null || e.amount === undefined) {
        if (i >= 0) list.splice(i, 1);
      } else {
        const row = { accountId: e.accountId, month: e.month, amount: e.amount, updatedAt: new Date().toISOString() };
        // `paidAt` ausente mantém a marcação da linha; presente (inclusive null) substitui
        if ('paidAt' in e && e.paidAt !== undefined) row.paidAt = e.paidAt;
        else if (i >= 0 && list[i].paidAt !== undefined) row.paidAt = list[i].paidAt;
        if (i >= 0) list[i] = row;
        else list.push(row);
      }
    }
    next.entries = list;
  } else if (op.type === 'saveCheckin') {
    // deduplica por `at`: reaplicar depois de um refresh não pode duplicar
    if (!data.checkins.some(c => c.at === p.at)) next.checkins = [...data.checkins, { ...p }];
  } else if (op.type === 'saveSettings') {
    const merged = { ...data.settings };
    for (const k of SETTINGS_KEYS) if (k in p) merged[k] = p[k];
    next.settings = merged;
  }
  return next;
}

function normalize(raw) {
  return {
    accounts: Array.isArray(raw?.accounts) ? raw.accounts : [],
    entries: Array.isArray(raw?.entries) ? raw.entries : [],
    checkins: Array.isArray(raw?.checkins) ? raw.checkins : [],
    settings: raw?.settings && typeof raw.settings === 'object' ? raw.settings : {}
  };
}

export function createStore({ api, storage, timers, onlineTarget } = {}) {
  let data = null;
  let queue = [];
  let running = false;
  let error = null;
  let attempt = 0;
  let retryTimer = null;
  let epoch = 0; // muda quando a fila é descartada com um envio em andamento
  let generation = 0; // muda no clear(): uma busca em andamento não pode repor dados antigos
  let refreshing = 0;
  let doneDuringRefresh = [];
  const listeners = new Set();

  // Acesso ao storage sempre protegido: se falhar, o app segue em memória
  const read = key => {
    try {
      const v = storage.getItem(key);
      return v == null ? null : JSON.parse(v);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch {
      // sem espaço ou sem acesso: continua só em memória
    }
  };

  const persist = () => {
    write(DATA_KEY, data);
    write(QUEUE_KEY, queue);
  };

  const notify = () => {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        // um ouvinte com erro não pode travar a fila
      }
    }
  };

  const clearRetry = () => {
    if (retryTimer !== null) {
      timers.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  // Um único loop de envio: uma operação por vez, em ordem
  async function pump() {
    if (running || error || retryTimer !== null) return;
    if (!queue.length) return;
    running = true;
    notify();
    while (queue.length) {
      const op = queue[0];
      const myEpoch = epoch;
      try {
        await api[op.type](op.payload);
      } catch (e) {
        if (myEpoch !== epoch) continue; // fila descartada durante o envio
        const code = e?.code || 'unknown';
        running = false;
        if (RETRY_CODES.has(code)) {
          const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
          attempt++;
          retryTimer = timers.setTimeout(() => {
            retryTimer = null;
            pump();
          }, delay);
        } else {
          error = { code, message: e?.message || String(code) };
        }
        notify();
        return;
      }
      if (myEpoch !== epoch) continue; // a fila já foi trocada: não mexe nela
      queue.shift(); // só sai da fila depois do ok do servidor
      attempt = 0;
      if (refreshing) doneDuringRefresh.push(op);
      persist();
      notify();
    }
    running = false;
    notify();
  }

  function enqueue(op) {
    op = clone(op);
    if (data) data = applyOp(data, op);
    queue.push(op);
    persist();
    notify();
    pump();
  }

  // Volta a enviar na hora, sem esperar o relógio
  function kick() {
    clearRetry();
    attempt = 0;
    pump();
  }

  const store = {
    getData: () => data,

    async refresh() {
      if (!refreshing) doneDuringRefresh = [];
      refreshing++;
      const myGeneration = generation;
      let res;
      try {
        res = await api.loadAll();
      } finally {
        refreshing--;
      }
      if (myGeneration !== generation) return data; // cache apagado durante a busca: descarta a resposta
      // reaplica o que saiu da fila durante a busca (o servidor pode não ter
      // visto) e o que ainda está nela
      let next = normalize(res);
      for (const op of doneDuringRefresh) next = applyOp(next, op);
      for (const op of queue) next = applyOp(next, op);
      data = next;
      persist();
      notify();
      return data;
    },

    saveAccount(account) {
      const saved = { ...clone(account), id: account.id || newId() };
      enqueue({ type: 'saveAccount', payload: saved });
      return saved;
    },

    saveEntries(entries) {
      enqueue({ type: 'saveEntries', payload: entries });
    },

    saveCheckin(checkin) {
      enqueue({ type: 'saveCheckin', payload: checkin });
    },

    saveSettings(settings) {
      // só as chaves aceitas pelo servidor: uma chave estranha travaria a fila
      const payload = {};
      for (const k of SETTINGS_KEYS) if (k in settings) payload[k] = settings[k];
      if (!Object.keys(payload).length) return;
      enqueue({ type: 'saveSettings', payload });
    },

    getQueueState: () => ({ pending: queue.length, sending: running, error }),

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    retry() {
      error = null;
      kick();
      notify();
    },

    discardPending() {
      epoch++;
      queue = [];
      error = null;
      clearRetry();
      attempt = 0;
      persist();
      notify();
      return store.refresh();
    },

    // Apaga tudo (dados e fila), na memória e no storage, para trocar de planilha.
    // Não busca nada: quem chama decide quando fazer refresh().
    clear() {
      epoch++;
      generation++;
      data = null;
      queue = [];
      error = null;
      clearRetry();
      attempt = 0;
      doneDuringRefresh = [];
      try {
        storage.removeItem(DATA_KEY);
        storage.removeItem(QUEUE_KEY);
      } catch {
        // sem acesso ao storage: já está vazio em memória
      }
      notify();
    }
  };

  // Retomada: lê o que ficou salvo e continua enviando
  const saved = read(DATA_KEY);
  if (saved) data = normalize(saved);
  const savedQueue = read(QUEUE_KEY);
  if (Array.isArray(savedQueue)) queue = savedQueue;

  if (onlineTarget) onlineTarget.addEventListener('online', () => { if (!error) kick(); });

  if (queue.length) pump();

  return store;
}

// Storage do app: localStorage com try/catch; se falhar, usa memória
function createAppStorage() {
  const mem = new Map();
  const ls = () => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  };
  return {
    getItem(key) {
      try {
        const v = ls()?.getItem(key);
        if (v != null) return v;
      } catch {
        // cai para a memória
      }
      return mem.has(key) ? mem.get(key) : null;
    },
    setItem(key, value) {
      mem.set(key, value);
      try {
        ls()?.setItem(key, value);
      } catch {
        // fica só na memória
      }
    },
    removeItem(key) {
      mem.delete(key);
      try {
        ls()?.removeItem(key);
      } catch {
        // nada a apagar
      }
    }
  };
}

export const store = createStore({
  api: realApi,
  storage: createAppStorage(),
  timers: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) },
  onlineTarget: typeof window !== 'undefined' ? window : null
});
