// Backend do app de contas: Google Apps Script vinculado à planilha.
//
// Como implantar (primeira vez):
// 1. Na planilha: Extensões → Apps Script. Cole este arquivo inteiro, sem editar nada.
// 2. Configurações do projeto (engrenagem) → Propriedades do script → Adicionar:
//    propriedade SECRET, valor = uma chave longa. Faça isso uma vez por projeto.
//    Sem a propriedade (ou vazia), toda chamada responde "unauthorized".
// 3. Implantar → Nova implantação → App da Web.
//    Executar como: eu | Acesso: qualquer pessoa.
// 4. Copie a URL que termina em /exec (não use a /dev).
// 5. A primeira chamada (ex.: "Testar conexão") cria as abas Contas, Lancamentos,
//    Checkins e Config, com cabeçalhos e formatos.
// 6. Só na planilha de TESTE: na aba Config, adicione a linha  ambiente | teste
//    (libera seed e reset). Na planilha da esposa essa linha não existe.
//
// Ao alterar o script: cole o arquivo inteiro e use
// Implantar → Gerenciar implantações → Editar → Nova versão.
// Assim a URL continua a mesma. Uma nova implantação gera URL nova.
//
// Valores: na API são centavos inteiros; na planilha ficam em reais (0.00).
// Mês: texto "YYYY-MM". Leitura e escrita são feitas pelo nome do cabeçalho.
//
// Contrato:
//   GET  ?key=...
//     -> { ok, accounts, entries, checkins, settings }
//        accounts : [{ id, name, type: 'expense'|'income', defaultAmount: int|null, order, active }]
//        entries  : [{ accountId, month, amount, updatedAt }]
//        checkins : [{ at, month, balance, billsPaid, incomeReceived, projectedBalance }]
//        settings : { checkinFrequency: 'always'|'daily'|'weekly', horizonMonths,
//                     lastReviewAt: string|null, environment: 'test'|'production' }
//   POST { key, action: 'ping' }                                  -> { ok, time }
//   POST { key, action: 'saveAccount', account: {...} }           -> { ok }   (upsert por id)
//   POST { key, action: 'saveEntries', entries: [{accountId, month, amount}] }
//                                                                  -> { ok, saved }
//        (upsert por conta + mês; amount null apaga a linha)
//   POST { key, action: 'saveCheckin', checkin: {...} }           -> { ok }   (append)
//   POST { key, action: 'saveSettings', settings: {...} }         -> { ok }
//        (só checkinFrequency, horizonMonths e lastReviewAt)
//   POST { key, action: 'seed' }                                  -> { ok }   (só ambiente = teste)
//   POST { key, action: 'reset' }                                 -> { ok }   (só ambiente = teste)
//   Erros: { ok: false, error } com unauthorized, invalid_json, unknown_action,
//          invalid_payload, busy, forbidden, bad_sheet_data
//          (e internal, para falhas inesperadas).

// ---------------------------------------------------------------------------
// Definição das abas
// ---------------------------------------------------------------------------

// kind: text (formato @), money (0.00), number, bool (caixa de seleção)
const SHEETS = {
  Contas: {
    key: 'id',
    columns: [
      { name: 'id', kind: 'text' },
      { name: 'nome', kind: 'text' },
      { name: 'tipo', kind: 'text' },
      { name: 'valor_padrao', kind: 'money' },
      { name: 'ordem', kind: 'number' },
      { name: 'ativa', kind: 'bool' }
    ]
  },
  Lancamentos: {
    key: 'conta_id',
    columns: [
      { name: 'conta_id', kind: 'text' },
      { name: 'mes', kind: 'text' },
      { name: 'valor', kind: 'money' },
      { name: 'atualizado_em', kind: 'text' }
    ]
  },
  Checkins: {
    key: 'data',
    columns: [
      { name: 'data', kind: 'text' },
      { name: 'mes', kind: 'text' },
      { name: 'saldo', kind: 'money' },
      { name: 'contas_pagas', kind: 'bool' },
      { name: 'salario_caiu', kind: 'bool' },
      { name: 'sobra_prevista', kind: 'money' }
    ]
  },
  Config: {
    key: 'chave',
    columns: [
      { name: 'chave', kind: 'text' },
      { name: 'valor', kind: 'text' }
    ]
  }
};

const CONFIG_DEFAULTS = [
  ['frequencia_checkin', 'semanal'],
  ['horizonte_meses', '3'],
  ['ultima_revisao', '']
];

const FREQ_TO_API = { toda_vez: 'always', diaria: 'daily', semanal: 'weekly' };
const FREQ_TO_SHEET = { always: 'toda_vez', daily: 'diaria', weekly: 'semanal' };
const TYPE_TO_API = { despesa: 'expense', receita: 'income' };
const TYPE_TO_SHEET = { expense: 'despesa', income: 'receita' };
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

function doGet(e) {
  return respond(function () {
    const key = e && e.parameter ? e.parameter.key : undefined;
    if (!isAuthorized(key)) fail('unauthorized');
    ensureSheetsLocked();
    return readAll();
  });
}

function doPost(e) {
  return respond(function () {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      fail('invalid_json');
    }
    if (!isPlainObject(body)) fail('invalid_json');
    if (!isAuthorized(body.key)) fail('unauthorized');

    // ping só lê o relógio; não precisa de lock (só para criar as abas, se faltarem)
    if (body.action === 'ping') {
      ensureSheetsLocked();
      return { ok: true, time: new Date().toISOString() };
    }

    return withLock(function () {
      ensureSheets();
      switch (body.action) {
        case 'saveAccount': return saveAccount(body.account);
        case 'saveEntries': return saveEntries(body.entries);
        case 'saveCheckin': return saveCheckin(body.checkin);
        case 'saveSettings': return saveSettings(body.settings);
        case 'seed': return seed();
        case 'reset': return reset();
        default: return fail('unknown_action');
      }
    });
  });
}

// Opcional: roda a criação das abas pelo editor
function setup() {
  withLock(ensureSheets);
}

// Converte o resultado (ou o erro com código) em resposta JSON
function respond(fn) {
  try {
    const result = fn();
    return json(result);
  } catch (err) {
    if (err && err.code) return json({ ok: false, error: err.code });
    return json({ ok: false, error: 'internal', detail: String(err && err.message ? err.message : err) });
  }
}

function fail(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}

function isAuthorized(key) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  return typeof secret === 'string' && secret !== '' && typeof key === 'string' && key === secret;
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail('busy');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Criação automática das abas (idempotente)
// ---------------------------------------------------------------------------

function allSheetsExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return Object.keys(SHEETS).every(function (name) { return !!ss.getSheetByName(name); });
}

// Caminho barato: se tudo existe, não pega lock nem escreve
function ensureSheetsLocked() {
  if (allSheetsExist()) return;
  withLock(ensureSheets);
}

function ensureSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    if (ss.getSheetByName(name)) return;
    const def = SHEETS[name];
    const sheet = ss.insertSheet(name);
    const headers = def.columns.map(function (c) { return c.name; });
    // formatos antes dos valores, para o Sheets não converter "2026-11" em data
    formatColumns(sheet, def, headers, 2, Math.max(1, sheet.getMaxRows() - 1));
    sheet.getRange(1, 1, 1, headers.length).setNumberFormat('@').setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    if (name === 'Config') {
      sheet.getRange(2, 1, CONFIG_DEFAULTS.length, 2).setValues(CONFIG_DEFAULTS);
    }
  });
}

// Aplica o formato de cada coluna (pelo cabeçalho) num intervalo de linhas
function formatColumns(sheet, def, headers, startRow, numRows) {
  def.columns.forEach(function (c) {
    const col = headers.indexOf(c.name) + 1;
    if (col < 1) return;
    const range = sheet.getRange(startRow, col, numRows, 1);
    if (c.kind === 'text') range.setNumberFormat('@');
    else if (c.kind === 'money') range.setNumberFormat('0.00');
    else if (c.kind === 'bool') range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  });
}

// ---------------------------------------------------------------------------
// Acesso às tabelas (sempre pelo cabeçalho)
// ---------------------------------------------------------------------------

function isDate(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

// Lê a aba e devolve { sheet, headers, idx, rows: [{ row, raw, v }] }.
// Linhas com a coluna-chave vazia são ignoradas.
function loadTable(name) {
  const def = SHEETS[name];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  const values = sheet.getDataRange().getValues();
  const headers = (values[0] || []).map(String);
  const idx = {};
  headers.forEach(function (h, i) { if (!(h in idx)) idx[h] = i; });
  def.columns.forEach(function (c) {
    if (!(c.name in idx)) fail('bad_sheet_data');
  });

  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const raw = values[r];
    const k = raw[idx[def.key]];
    if (k === '' || k === null || k === undefined) continue;
    const v = {};
    def.columns.forEach(function (c) {
      const cell = raw[idx[c.name]];
      if (c.kind === 'text' && isDate(cell)) fail('bad_sheet_data');
      v[c.name] = cell;
    });
    rows.push({ row: r + 1, raw: raw, v: v });
  }
  return { name: name, sheet: sheet, headers: headers, idx: idx, rows: rows };
}

// Escreve no fim da aba. objs: [{ coluna: valor }]
function appendRows(table, objs) {
  if (objs.length === 0) return;
  const def = SHEETS[table.name];
  const sheet = table.sheet;
  const width = table.headers.length;
  const data = objs.map(function (o) {
    const row = [];
    for (let i = 0; i < width; i++) row.push('');
    def.columns.forEach(function (c) {
      if (o[c.name] !== undefined) row[table.idx[c.name]] = o[c.name];
    });
    return row;
  });
  const start = sheet.getLastRow() + 1;
  const end = start + objs.length - 1;
  if (end > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows());
  // formata antes de gravar, para ids e meses ficarem como texto
  formatColumns(sheet, def, table.headers, start, objs.length);
  sheet.getRange(start, 1, objs.length, width).setValues(data);
}

// Regrava uma linha existente, trocando só as colunas informadas
function updateRow(table, rowInfo, changes) {
  const raw = rowInfo.raw.slice();
  Object.keys(changes).forEach(function (name) { raw[table.idx[name]] = changes[name]; });
  table.sheet.getRange(rowInfo.row, 1, 1, table.headers.length).setValues([raw]);
}

// ---------------------------------------------------------------------------
// Conversões
// ---------------------------------------------------------------------------

function toCents(reais) {
  return Math.round(reais * 100);
}

function toReais(cents) {
  return cents / 100;
}

// Célula de valor → centavos, ou null se vazia
function readMoney(cell) {
  if (cell === '' || cell === null || cell === undefined) return null;
  const n = typeof cell === 'number' ? cell : Number(cell);
  if (typeof cell === 'boolean' || isDate(cell) || !isFinite(n)) fail('bad_sheet_data');
  return toCents(n);
}

function readBool(cell) {
  if (cell === true) return true;
  if (typeof cell === 'string') return cell.toUpperCase() === 'TRUE';
  return false;
}

function readText(cell) {
  if (cell === null || cell === undefined) return '';
  return String(cell);
}

function currentMonth() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
}

function addMonths(month, k) {
  const y = parseInt(month.slice(0, 4), 10);
  const m = parseInt(month.slice(5, 7), 10) - 1 + k;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12 + 1;
  return yy + '-' + (mm < 10 ? '0' : '') + mm;
}

// ---------------------------------------------------------------------------
// Leitura (GET)
// ---------------------------------------------------------------------------

function readAll() {
  const contas = loadTable('Contas');
  const lanc = loadTable('Lancamentos');
  const checks = loadTable('Checkins');
  const config = loadTable('Config');

  const accounts = contas.rows.map(function (r) {
    const tipo = readText(r.v.tipo);
    if (!(tipo in TYPE_TO_API)) fail('bad_sheet_data');
    const ordem = r.v.ordem === '' ? 0 : Number(r.v.ordem);
    if (!Number.isInteger(ordem)) fail('bad_sheet_data');
    return {
      id: readText(r.v.id),
      name: readText(r.v.nome),
      type: TYPE_TO_API[tipo],
      defaultAmount: readMoney(r.v.valor_padrao),
      order: ordem,
      active: readBool(r.v.ativa)
    };
  });

  const entries = [];
  lanc.rows.forEach(function (r) {
    const amount = readMoney(r.v.valor);
    if (amount === null) return; // lançamento sem valor é ignorado
    const month = readText(r.v.mes);
    if (!MONTH_RE.test(month)) fail('bad_sheet_data');
    entries.push({
      accountId: readText(r.v.conta_id),
      month: month,
      amount: amount,
      updatedAt: readText(r.v.atualizado_em)
    });
  });

  const checkins = checks.rows.map(function (r) {
    const month = readText(r.v.mes);
    if (!MONTH_RE.test(month)) fail('bad_sheet_data');
    return {
      at: readText(r.v.data),
      month: month,
      balance: readMoney(r.v.saldo) || 0,
      billsPaid: readBool(r.v.contas_pagas),
      incomeReceived: readBool(r.v.salario_caiu),
      projectedBalance: readMoney(r.v.sobra_prevista) || 0
    };
  });

  return { ok: true, accounts: accounts, entries: entries, checkins: checkins, settings: readSettings(config) };
}

function readSettings(config) {
  const map = {};
  config.rows.forEach(function (r) { map[readText(r.v.chave).trim()] = readText(r.v.valor).trim(); });

  const freqSheet = map.frequencia_checkin || 'semanal';
  if (!(freqSheet in FREQ_TO_API)) fail('bad_sheet_data');

  const horizon = map.horizonte_meses ? Number(map.horizonte_meses) : 3;
  if (!Number.isInteger(horizon) || horizon < 1) fail('bad_sheet_data');

  return {
    checkinFrequency: FREQ_TO_API[freqSheet],
    horizonMonths: horizon,
    lastReviewAt: map.ultima_revisao ? map.ultima_revisao : null,
    environment: map.ambiente === 'teste' ? 'test' : 'production'
  };
}

function isTestEnvironment() {
  return readSettings(loadTable('Config')).environment === 'test';
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

function isPlainObject(o) {
  return o !== null && typeof o === 'object' && !Array.isArray(o);
}

function invalid() {
  fail('invalid_payload');
}

function checkString(v) {
  if (typeof v !== 'string' || v === '') invalid();
  return v;
}

function checkInt(v) {
  if (!Number.isInteger(v)) invalid();
  return v;
}

function checkIntOrNull(v) {
  if (v !== null && !Number.isInteger(v)) invalid();
  return v;
}

function checkBool(v) {
  if (typeof v !== 'boolean') invalid();
  return v;
}

function checkMonth(v) {
  if (typeof v !== 'string' || !MONTH_RE.test(v)) invalid();
  return v;
}

function validateAccount(a) {
  if (!isPlainObject(a)) invalid();
  if (a.type !== 'expense' && a.type !== 'income') invalid();
  return {
    id: checkString(a.id),
    name: checkString(a.name),
    type: a.type,
    defaultAmount: checkIntOrNull(a.defaultAmount),
    order: checkInt(a.order),
    active: checkBool(a.active)
  };
}

function validateEntries(list, accountIds) {
  if (!Array.isArray(list) || list.length === 0) invalid();
  return list.map(function (e) {
    if (!isPlainObject(e)) invalid();
    const accountId = checkString(e.accountId);
    if (!accountIds[accountId]) invalid();
    return { accountId: accountId, month: checkMonth(e.month), amount: checkIntOrNull(e.amount) };
  });
}

function validateCheckin(c) {
  if (!isPlainObject(c)) invalid();
  return {
    at: checkString(c.at),
    month: checkMonth(c.month),
    balance: checkInt(c.balance),
    billsPaid: checkBool(c.billsPaid),
    incomeReceived: checkBool(c.incomeReceived),
    projectedBalance: checkInt(c.projectedBalance)
  };
}

// Devolve [[chave_da_planilha, valor_texto]]
function validateSettings(s) {
  if (!isPlainObject(s)) invalid();
  const keys = Object.keys(s);
  if (keys.length === 0) invalid();
  return keys.map(function (k) {
    const v = s[k];
    if (k === 'checkinFrequency') {
      if (typeof v !== 'string' || !(v in FREQ_TO_SHEET)) invalid();
      return ['frequencia_checkin', FREQ_TO_SHEET[v]];
    }
    if (k === 'horizonMonths') {
      if (!Number.isInteger(v) || v < 1) invalid();
      return ['horizonte_meses', String(v)];
    }
    if (k === 'lastReviewAt') {
      if (v !== null && typeof v !== 'string') invalid();
      return ['ultima_revisao', v === null ? '' : v];
    }
    return invalid(); // inclui "environment"
  });
}

// ---------------------------------------------------------------------------
// Escritas
// ---------------------------------------------------------------------------

function accountRow(a) {
  return {
    id: a.id,
    nome: a.name,
    tipo: TYPE_TO_SHEET[a.type],
    valor_padrao: a.defaultAmount === null ? '' : toReais(a.defaultAmount),
    ordem: a.order,
    ativa: a.active
  };
}

function saveAccount(payload) {
  const a = validateAccount(payload);
  const table = loadTable('Contas');
  const found = table.rows.filter(function (r) { return readText(r.v.id) === a.id; })[0];
  if (found) updateRow(table, found, accountRow(a));
  else appendRows(table, [accountRow(a)]);
  return { ok: true };
}

function saveEntries(payload) {
  const contas = loadTable('Contas');
  const accountIds = {};
  contas.rows.forEach(function (r) { accountIds[readText(r.v.id)] = true; });
  const list = validateEntries(payload, accountIds);

  // se a mesma chave aparecer duas vezes no payload, vale a última
  const wanted = {};
  const order = [];
  list.forEach(function (e) {
    const k = e.accountId + '|' + e.month;
    if (!(k in wanted)) order.push(k);
    wanted[k] = e;
  });

  const table = loadTable('Lancamentos');
  const existing = {};
  table.rows.forEach(function (r) {
    const k = readText(r.v.conta_id) + '|' + readText(r.v.mes);
    if (!(k in existing)) existing[k] = r;
  });

  const now = new Date().toISOString();
  const toDelete = [];
  const toAppend = [];
  order.forEach(function (k) {
    const e = wanted[k];
    const row = existing[k];
    if (row) {
      if (e.amount === null) toDelete.push(row.row);
      else updateRow(table, row, { valor: toReais(e.amount), atualizado_em: now });
    } else if (e.amount !== null) {
      toAppend.push({ conta_id: e.accountId, mes: e.month, valor: toReais(e.amount), atualizado_em: now });
    }
  });

  // apaga de baixo para cima para os números de linha não se deslocarem
  toDelete.sort(function (a, b) { return b - a; }).forEach(function (r) { table.sheet.deleteRow(r); });
  appendRows(table, toAppend);
  return { ok: true, saved: order.length };
}

function saveCheckin(payload) {
  const c = validateCheckin(payload);
  appendRows(loadTable('Checkins'), [{
    data: c.at,
    mes: c.month,
    saldo: toReais(c.balance),
    contas_pagas: c.billsPaid,
    salario_caiu: c.incomeReceived,
    sobra_prevista: toReais(c.projectedBalance)
  }]);
  return { ok: true };
}

function saveSettings(payload) {
  const pairs = validateSettings(payload);
  upsertConfig(pairs);
  return { ok: true };
}

function upsertConfig(pairs) {
  const table = loadTable('Config');
  const toAppend = [];
  pairs.forEach(function (p) {
    const found = table.rows.filter(function (r) { return readText(r.v.chave).trim() === p[0]; })[0];
    if (found) updateRow(table, found, { valor: p[1] });
    else toAppend.push({ chave: p[0], valor: p[1] });
  });
  appendRows(table, toAppend);
}

// ---------------------------------------------------------------------------
// Massa de teste (seed) e limpeza (reset): só com ambiente = teste
// ---------------------------------------------------------------------------

// Massa de teste, em reais. Posição 0 de cada lista = mês atual; são 6 meses.
// null = sem lançamento (vale o valor padrão, se houver).
// Despesas efetivas por mês (cartões + Unha): 2150, 2250, 2900, 4650, 2650, 2150.
// Salário (padrão, sem lançamento): 3000 todo mês.
const SEED = {
  checkin: { balance: 3000, billsPaid: false, incomeReceived: true },
  accounts: [
    { id: 'nubank',  name: 'Nubank',  type: 'expense', defaultAmount: null,   order: 1 },
    { id: 'inter',   name: 'Inter',   type: 'expense', defaultAmount: null,   order: 2 },
    { id: 'renner',  name: 'Renner',  type: 'expense', defaultAmount: null,   order: 3 },
    { id: 'cea',     name: 'C&A',     type: 'expense', defaultAmount: null,   order: 4 },
    { id: 'unha',    name: 'Unha',    type: 'expense', defaultAmount: 150,    order: 5 },
    { id: 'salario', name: 'Salário', type: 'income',  defaultAmount: 3000,   order: 6 }
  ],
  entries: {
    nubank: [900, 1000, 1200, 2000, 1000, 900],
    inter:  [600,  600,  800, 1500,  800, 600],
    renner: [300,  300,  400,  600,  400, 300],
    cea:    [200,  200,  300,  400,  300, 200],
    unha:   [null, null, 200, null, null, null]
  }
};

function requireTestEnvironment() {
  if (!isTestEnvironment()) fail('forbidden');
}

function reset() {
  requireTestEnvironment();
  resetData();
  return { ok: true };
}

function resetData() {
  // lê tudo antes de apagar: se a planilha estiver inconsistente, nada é perdido pela metade
  const config = loadTable('Config');
  const tables = ['Contas', 'Lancamentos', 'Checkins'].map(loadTable);
  const ambiente = config.rows.filter(function (r) { return readText(r.v.chave).trim() === 'ambiente'; })[0];
  const ambienteValue = ambiente ? readText(ambiente.v.valor) : null;

  tables.concat([config]).forEach(function (t) {
    const last = t.sheet.getLastRow();
    if (last > 1) t.sheet.getRange(2, 1, last - 1, t.headers.length).clearContent();
  });

  const rows = CONFIG_DEFAULTS.map(function (p) { return { chave: p[0], valor: p[1] }; });
  if (ambienteValue !== null) rows.push({ chave: 'ambiente', valor: ambienteValue });
  appendRows(loadTable('Config'), rows);
}

function seed() {
  requireTestEnvironment();
  resetData();

  const month0 = currentMonth();
  const months = SEED.entries.nubank.length;

  const accountRows = SEED.accounts.map(function (a) {
    return accountRow({
      id: a.id, name: a.name, type: a.type,
      defaultAmount: a.defaultAmount === null ? null : toCents(a.defaultAmount),
      order: a.order, active: true
    });
  });
  appendRows(loadTable('Contas'), accountRows);

  const now = new Date().toISOString();
  const entryRows = [];
  const effective = {}; // accountId -> [centavos por mês]
  SEED.accounts.forEach(function (a) {
    effective[a.id] = [];
    const values = SEED.entries[a.id] || [];
    for (let i = 0; i < months; i++) {
      const v = values[i] === undefined ? null : values[i];
      if (v !== null) {
        entryRows.push({ conta_id: a.id, mes: addMonths(month0, i), valor: v, atualizado_em: now });
        effective[a.id].push(toCents(v));
      } else {
        effective[a.id].push(a.defaultAmount === null ? 0 : toCents(a.defaultAmount));
      }
    }
  });
  appendRows(loadTable('Lancamentos'), entryRows);

  // sobra prevista do mês atual: S + (salário já caiu ? 0 : R) − (contas pagas ? 0 : D)
  let income = 0;
  let expense = 0;
  SEED.accounts.forEach(function (a) {
    if (a.type === 'income') income += effective[a.id][0];
    else expense += effective[a.id][0];
  });
  const c = SEED.checkin;
  const balance = toCents(c.balance);
  const projected = balance + (c.incomeReceived ? 0 : income) - (c.billsPaid ? 0 : expense);
  appendRows(loadTable('Checkins'), [{
    data: now,
    mes: month0,
    saldo: toReais(balance),
    contas_pagas: c.billsPaid,
    salario_caiu: c.incomeReceived,
    sobra_prevista: toReais(projected)
  }]);

  return { ok: true };
}
