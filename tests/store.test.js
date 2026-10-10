import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, store as appStore } from '../src/store.js';

// Deixa as promessas pendentes andarem
const flush = () => new Promise(resolve => setImmediate(resolve));

class FakeError extends Error {
  constructor(code) {
    super(`erro ${code}`);
    this.code = code;
  }
}

// API falsa: registra as chamadas e falha conforme `failures` (um código por chamada)
function fakeApi(server = {}) {
  const api = {
    calls: [],
    failures: [],
    server: { accounts: [], entries: [], checkins: [], settings: {}, ...server },
    loadAllDelay: null
  };
  const call = (type, payload) => {
    api.calls.push({ type, payload });
    const code = api.failures.shift();
    return code ? Promise.reject(new FakeError(code)) : Promise.resolve({ ok: true });
  };
  api.saveAccount = a => call('saveAccount', a);
  api.saveEntries = e => call('saveEntries', e);
  api.saveCheckin = c => call('saveCheckin', c);
  api.saveSettings = s => call('saveSettings', s);
  api.loadAll = async () => {
    const snapshot = JSON.parse(JSON.stringify(api.server));
    if (api.loadAllDelay) await api.loadAllDelay;
    return { ok: true, latencyMs: 5, ...snapshot };
  };
  return api;
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k)
  };
}

// Timers controláveis: nada dorme de verdade
function fakeTimers() {
  const t = { pending: [], nextId: 1, delays: [] };
  t.setTimeout = (fn, ms) => {
    const id = t.nextId++;
    t.pending.push({ id, fn, ms });
    t.delays.push(ms);
    return id;
  };
  t.clearTimeout = id => {
    t.pending = t.pending.filter(x => x.id !== id);
  };
  t.fireNext = () => {
    const item = t.pending.shift();
    assert.ok(item, 'esperava um timer pendente');
    item.fn();
  };
  return t;
}

function setup({ server, storage = memoryStorage(), api = fakeApi(server), timers = fakeTimers(), onlineTarget } = {}) {
  const store = createStore({ api, storage, timers, onlineTarget });
  return { store, api, storage, timers };
}

const account = { id: 'a1', name: 'Nubank', type: 'expense', defaultAmount: null, order: 1, active: true };

async function loaded(opts = {}) {
  const ctx = setup(opts);
  await ctx.store.refresh();
  return ctx;
}

test('o módulo é importável no Node e a instância padrão existe', () => {
  assert.equal(typeof appStore.getData, 'function');
  assert.equal(appStore.getData(), null);
});

test('getData é null antes do primeiro refresh', () => {
  const { store } = setup();
  assert.equal(store.getData(), null);
});

test('save* muda getData na hora, persiste e a API recebe em ordem', async () => {
  const { store, api, storage } = await loaded();

  const saved = store.saveAccount({ name: 'Inter', type: 'expense', defaultAmount: null, order: 2, active: true });
  assert.ok(saved.id, 'gera id para conta nova');
  store.saveEntries([{ accountId: saved.id, month: '2026-11', amount: 90000 }]);
  store.saveCheckin({ at: '2026-10-08T10:00:00Z', month: '2026-10', balance: 50000, billsPaid: false, incomeReceived: true, projectedBalance: 1000 });
  store.saveSettings({ horizonMonths: 6 });

  // otimista: já está no cache, antes de a rede responder
  const d = store.getData();
  assert.equal(d.accounts.length, 1);
  assert.equal(d.accounts[0].id, saved.id);
  assert.equal(d.entries[0].amount, 90000);
  assert.equal(d.checkins.length, 1);
  assert.equal(d.settings.horizonMonths, 6);
  assert.equal(store.getQueueState().pending, 4);

  // persistido
  assert.equal(JSON.parse(storage.getItem('sf.data')).accounts[0].id, saved.id);
  assert.equal(JSON.parse(storage.getItem('sf.queue')).length, 4);

  await flush();
  assert.deepEqual(api.calls.map(c => c.type), ['saveAccount', 'saveEntries', 'saveCheckin', 'saveSettings']);
  assert.equal(api.calls[0].payload.id, saved.id);
  assert.equal(store.getQueueState().pending, 0);
  assert.equal(store.getQueueState().sending, false);
  assert.equal(JSON.parse(storage.getItem('sf.queue')).length, 0);
});

test('saveAccount mantém o id quando já existe e faz upsert por id', async () => {
  const { store } = await loaded();
  store.saveAccount(account);
  const again = store.saveAccount({ ...account, name: 'Nubank Roxinho' });
  assert.equal(again.id, 'a1');
  assert.equal(store.getData().accounts.length, 1);
  assert.equal(store.getData().accounts[0].name, 'Nubank Roxinho');
  await flush();
});

test('saveEntries faz upsert e amount null apaga o lançamento', async () => {
  const { store } = await loaded();
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 100 }, { accountId: 'a1', month: '2026-12', amount: 200 }]);
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 150 }]);
  let entries = store.getData().entries;
  assert.equal(entries.length, 2);
  assert.equal(entries.find(e => e.month === '2026-11').amount, 150);

  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: null }]);
  entries = store.getData().entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].month, '2026-12');
  await flush();
});

test('saveEntries: paidAt ausente mantém, presente troca, null limpa e amount null apaga', async () => {
  const { store } = await loaded();
  const find = (m) => store.getData().entries.find(e => e.month === m);
  const at = '2026-10-12T09:00:00.000Z';
  const later = '2026-10-13T09:00:00.000Z';

  // lançamento novo sem a chave: sem marcação
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 100 }]);
  assert.ok(!find('2026-11').paidAt);

  // marcar
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 100, paidAt: at }]);
  assert.equal(find('2026-11').paidAt, at);

  // editar o valor sem a chave mantém a marcação
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 150 }]);
  assert.equal(find('2026-11').amount, 150);
  assert.equal(find('2026-11').paidAt, at);

  // presente troca
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 150, paidAt: later }]);
  assert.equal(find('2026-11').paidAt, later);

  // null limpa (e fica null, não ausente)
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 150, paidAt: null }]);
  assert.equal(find('2026-11').paidAt, null);

  // outro mês não é afetado
  store.saveEntries([{ accountId: 'a1', month: '2026-12', amount: 7 }]);
  assert.ok(!find('2026-12').paidAt);

  // amount null apaga o lançamento, com ou sem marcação
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 150, paidAt: at }]);
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: null }]);
  assert.equal(find('2026-11'), undefined);
  assert.equal(store.getData().entries.length, 1);
  await flush();
});

test('saveSettings só aceita as chaves permitidas e faz merge', async () => {
  const { store, api } = await loaded({ server: { settings: { environment: 'test', horizonMonths: 3 } } });
  store.saveSettings({ checkinFrequency: 'daily', environment: 'production' });
  assert.deepEqual(store.getData().settings, { environment: 'test', horizonMonths: 3, checkinFrequency: 'daily' });
  await flush();
  assert.deepEqual(api.calls[0].payload, { checkinFrequency: 'daily' });
});

test('check-in reaplicado não duplica (deduplicado por at)', async () => {
  const checkin = { at: '2026-10-08T10:00:00Z', month: '2026-10', balance: 1, billsPaid: true, incomeReceived: true, projectedBalance: 1 };
  const { store, api } = await loaded();
  store.saveCheckin(checkin);
  await flush();
  // o servidor já tem o check-in; o refresh não pode duplicar nem se a fila o reaplicasse
  api.server.checkins = [checkin];
  await store.refresh();
  assert.equal(store.getData().checkins.length, 1);

  // com o check-in ainda na fila (servidor com erro), o refresh também não duplica
  api.failures.push('network');
  store.saveCheckin({ ...checkin, at: '2026-10-09T10:00:00Z' });
  await flush();
  api.server.checkins = [checkin, { ...checkin, at: '2026-10-09T10:00:00Z' }];
  await store.refresh();
  assert.equal(store.getData().checkins.length, 2);
});

test('erro network: fica na fila, tenta de novo após a espera e depois sai', async () => {
  const { store, api, timers } = await loaded();
  api.failures.push('network');
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 100 }]);
  await flush();

  assert.equal(api.calls.length, 1);
  assert.equal(store.getQueueState().pending, 1);
  assert.equal(store.getQueueState().error, null);
  assert.deepEqual(timers.delays, [2000]);

  timers.fireNext();
  await flush();
  assert.equal(api.calls.length, 2);
  assert.equal(store.getQueueState().pending, 0);
});

test('espera cresce 2s, 4s, 8s e para em 60s; timeout e busy também tentam de novo', async () => {
  const { store, api, timers } = await loaded();
  api.failures.push('network', 'timeout', 'busy', 'network', 'network', 'network', 'network');
  store.saveSettings({ horizonMonths: 4 });
  await flush();
  for (let i = 0; i < 6; i++) {
    timers.fireNext();
    await flush();
  }
  assert.deepEqual(timers.delays, [2000, 4000, 8000, 16000, 32000, 60000, 60000]);
  timers.fireNext();
  await flush();
  assert.equal(store.getQueueState().pending, 0);
  // depois do sucesso a espera volta ao começo
  api.failures.push('network');
  store.saveSettings({ horizonMonths: 5 });
  await flush();
  assert.equal(timers.delays.at(-1), 2000);
});

test('uma gravação nova durante a espera não fura a fila nem o timer', async () => {
  const { store, api, timers } = await loaded();
  api.failures.push('network');
  store.saveSettings({ horizonMonths: 4 });
  await flush();
  store.saveSettings({ horizonMonths: 5 });
  await flush();
  assert.equal(api.calls.length, 1);
  timers.fireNext();
  await flush();
  assert.deepEqual(api.calls.map(c => c.payload.horizonMonths), [4, 4, 5]);
});

test('evento online tenta de novo na hora', async () => {
  let onOnline;
  const onlineTarget = { addEventListener: (name, fn) => { if (name === 'online') onOnline = fn; } };
  const { store, api, timers } = await loaded({ onlineTarget });
  api.failures.push('network');
  store.saveSettings({ horizonMonths: 4 });
  await flush();
  assert.equal(store.getQueueState().pending, 1);
  onOnline();
  await flush();
  assert.equal(store.getQueueState().pending, 0);
  assert.equal(timers.pending.length, 0, 'o timer de espera foi cancelado');
});

test('invalid_payload: para, mantém a fila, expõe o erro; discardPending limpa', async () => {
  const { store, api, timers, storage } = await loaded();
  api.failures.push('invalid_payload');
  store.saveEntries([{ accountId: 'x', month: '2026-11', amount: 1 }]);
  store.saveSettings({ horizonMonths: 4 });
  await flush();

  const state = store.getQueueState();
  assert.equal(state.pending, 2);
  assert.equal(state.error.code, 'invalid_payload');
  assert.equal(timers.pending.length, 0, 'sem nova tentativa automática');
  assert.equal(api.calls.length, 1);

  // novas gravações não furam o bloqueio
  store.saveSettings({ horizonMonths: 5 });
  await flush();
  assert.equal(api.calls.length, 1);

  await store.discardPending();
  assert.deepEqual(store.getQueueState(), { pending: 0, sending: false, error: null });
  assert.equal(JSON.parse(storage.getItem('sf.queue')).length, 0);
});

test('retry zera o erro e envia de novo', async () => {
  const { store, api } = await loaded();
  api.failures.push('unauthorized');
  store.saveSettings({ horizonMonths: 4 });
  await flush();
  assert.equal(store.getQueueState().error.code, 'unauthorized');

  store.retry();
  await flush();
  assert.equal(store.getQueueState().error, null);
  assert.equal(store.getQueueState().pending, 0);
  assert.equal(api.calls.length, 2);
});

test('recarregar: nova store com o mesmo storage retoma a fila pendente', async () => {
  const storage = memoryStorage();
  const api1 = fakeApi();
  const first = setup({ storage, api: api1 });
  await first.store.refresh();
  api1.failures.push('network', 'network');
  first.store.saveAccount(account);
  first.store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 700 }]);
  await flush();
  assert.equal(first.store.getQueueState().pending, 2);

  // "recarrega a página": store nova, API nova, mesmo storage
  const api2 = fakeApi();
  const second = setup({ storage, api: api2 });
  assert.equal(second.store.getData().accounts[0].id, 'a1', 'cache lido do storage');
  assert.equal(second.store.getQueueState().pending, 2);
  await flush();
  assert.deepEqual(api2.calls.map(c => c.type), ['saveAccount', 'saveEntries']);
  assert.equal(second.store.getQueueState().pending, 0);
  assert.equal(JSON.parse(storage.getItem('sf.queue')).length, 0);
});

test('storage com lixo ou que lança erro não derruba a store', async () => {
  const bad = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); }, removeItem: () => {} };
  const { store, api } = setup({ storage: bad });
  await store.refresh();
  store.saveSettings({ horizonMonths: 4 });
  await flush();
  assert.equal(api.calls.length, 1);

  const junk = memoryStorage({ 'sf.data': '{nao e json', 'sf.queue': '42' });
  const ctx = setup({ storage: junk });
  assert.equal(ctx.store.getData(), null);
  assert.equal(ctx.store.getQueueState().pending, 0);
});

test('refresh reaplica as operações pendentes por cima dos dados do servidor', async () => {
  const { store, api } = await loaded({ server: { accounts: [{ ...account, name: 'Velho' }], entries: [{ accountId: 'a1', month: '2026-11', amount: 100, updatedAt: 'x' }] } });
  api.failures.push('network');
  store.saveAccount({ ...account, name: 'Novo' });
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: null }, { accountId: 'a1', month: '2026-12', amount: 300 }]);
  await flush();
  assert.equal(store.getQueueState().pending, 2);

  await store.refresh();
  const d = store.getData();
  assert.equal(d.accounts[0].name, 'Novo');
  assert.deepEqual(d.entries.map(e => [e.month, e.amount]), [['2026-12', 300]]);
});

test('refresh substitui o cache pelos dados do servidor e descarta campos de transporte', async () => {
  const { store, api, storage } = await loaded();
  api.server.accounts = [account];
  const d = await store.refresh();
  assert.deepEqual(Object.keys(d).sort(), ['accounts', 'checkins', 'entries', 'settings']);
  assert.equal(JSON.parse(storage.getItem('sf.data')).accounts.length, 1);
});

test('refresh em andamento não perde uma gravação que saiu da fila durante a busca', async () => {
  const { store, api } = await loaded();
  let release;
  api.loadAllDelay = new Promise(r => { release = r; });
  const pending = store.refresh(); // o servidor responde com o estado antigo
  store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 500 }]);
  await flush(); // a gravação sai da fila antes de o refresh terminar
  assert.equal(store.getQueueState().pending, 0);
  release();
  await pending;
  assert.equal(store.getData().entries[0].amount, 500);
});

test('subscribe é chamado quando dados ou fila mudam e o cancelamento funciona', async () => {
  const { store, api } = await loaded();
  let n = 0;
  const unsubscribe = store.subscribe(() => n++);

  store.saveSettings({ horizonMonths: 4 });
  assert.ok(n >= 1, 'avisa na gravação');
  await flush();
  const afterSend = n;
  assert.ok(afterSend >= 2, 'avisa quando a fila esvazia');

  await store.refresh();
  assert.ok(n > afterSend, 'avisa no refresh');

  api.failures.push('forbidden');
  const before = n;
  store.saveSettings({ horizonMonths: 5 });
  await flush();
  assert.ok(n - before >= 2, 'avisa também quando o erro aparece');

  unsubscribe();
  const final = n;
  store.retry();
  await flush();
  assert.equal(n, final);
});

test('clear: apaga dados e fila na memória e no storage, sem buscar nada', async () => {
  const { store, api, storage, timers } = await loaded({ server: { accounts: [account] } });
  api.failures.push('network');
  store.saveSettings({ horizonMonths: 4 });
  await flush();
  assert.equal(store.getQueueState().pending, 1);
  assert.equal(timers.pending.length, 1, 'tem uma nova tentativa agendada');
  assert.ok(storage.map.has('sf.data'));
  const calls = api.calls.length;

  let notified = 0;
  store.subscribe(() => notified++);
  store.clear();

  assert.equal(store.getData(), null);
  assert.deepEqual(store.getQueueState(), { pending: 0, sending: false, error: null });
  assert.equal(storage.map.has('sf.data'), false);
  assert.equal(storage.map.has('sf.queue'), false);
  assert.equal(timers.pending.length, 0, 'o timer de nova tentativa foi cancelado');
  assert.ok(notified >= 1, 'avisa os ouvintes');
  await flush();
  assert.equal(api.calls.length, calls, 'não envia nem busca nada');
});

test('clear: zera o erro que travava a fila', async () => {
  const { store, api } = await loaded();
  api.failures.push('unauthorized');
  store.saveSettings({ horizonMonths: 4 });
  await flush();
  assert.equal(store.getQueueState().error.code, 'unauthorized');
  store.clear();
  assert.equal(store.getQueueState().error, null);
  // a fila destravou: uma gravação nova volta a ser enviada
  await store.refresh();
  store.saveSettings({ horizonMonths: 5 });
  await flush();
  assert.equal(api.calls.length, 2);
  assert.equal(store.getQueueState().pending, 0);
});

test('clear: um envio em andamento não reentra na fila nem no storage', async () => {
  const api = fakeApi();
  let release;
  const gate = new Promise(r => { release = r; });
  api.saveSettings = s => {
    api.calls.push({ type: 'saveSettings', payload: s });
    return gate.then(() => ({ ok: true }));
  };
  const { store, storage } = await loaded({ api });
  store.saveSettings({ horizonMonths: 4 });
  await flush();
  assert.equal(store.getQueueState().sending, true);

  store.clear();
  release();
  await flush();

  assert.deepEqual(store.getQueueState(), { pending: 0, sending: false, error: null });
  assert.equal(store.getData(), null);
  assert.equal(storage.map.has('sf.data'), false, 'o fim do envio não reescreve o cache');
  assert.equal(storage.map.has('sf.queue'), false);
  assert.equal(api.calls.length, 1);
});

test('clear: uma busca em andamento não repõe os dados da planilha antiga', async () => {
  const { store, api, storage } = await loaded({ server: { accounts: [account] } });
  let release;
  api.loadAllDelay = new Promise(r => { release = r; });
  const pending = store.refresh();
  store.clear();
  release();
  await pending;
  assert.equal(store.getData(), null);
  assert.equal(storage.map.has('sf.data'), false);
});

test('clear: uma store nova com o mesmo storage começa vazia', async () => {
  const storage = memoryStorage();
  const first = setup({ storage, server: { accounts: [account] } });
  await first.store.refresh();
  first.api.failures.push('network');
  first.store.saveEntries([{ accountId: 'a1', month: '2026-11', amount: 700 }]);
  await flush();
  assert.equal(first.store.getQueueState().pending, 1);

  first.store.clear();

  const api2 = fakeApi();
  const second = setup({ storage, api: api2 });
  assert.equal(second.store.getData(), null);
  assert.equal(second.store.getQueueState().pending, 0);
  await flush();
  assert.equal(api2.calls.length, 0, 'nada para reenviar');
});

test('clear: depois de limpar, refresh traz os dados da planilha nova', async () => {
  const { store, api } = await loaded({ server: { accounts: [account] } });
  store.clear();
  api.server.accounts = [{ ...account, id: 'b1', name: 'Outra' }];
  await store.refresh();
  assert.deepEqual(store.getData().accounts.map(a => a.id), ['b1']);
});
