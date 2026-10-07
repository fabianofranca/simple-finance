// Backend do app de contas: Google Apps Script vinculado à planilha.
//
// Como implantar:
// 1. Na planilha: Extensões → Apps Script. Cole este arquivo e troque o SECRET.
// 2. Implantar → Nova implantação → App da Web.
//    Executar como: eu | Acesso: qualquer pessoa.
// 3. Copie a URL que termina em /exec (não use a /dev).
// 4. Ao alterar o script: Implantar → Gerenciar implantações → Editar →
//    Nova versão. Assim a URL continua a mesma.
//
// Contrato:
//   GET  ?key=...                              -> { ok, rows }
//   POST { key, action: 'append', row: {...} } -> { ok }
//   POST { key, action: 'ping' }               -> { ok, time }
//   Erros: { ok: false, error: 'unauthorized' | 'invalid_json' | 'unknown_action' }
const SECRET = 'troque-por-uma-chave-longa';
const SHEET_NAME = 'Teste';

function doGet(e) {
  if (e.parameter.key !== SECRET) return json({ ok: false, error: 'unauthorized' });
  return json({ ok: true, rows: readRows() });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'invalid_json' });
  }
  if (body.key !== SECRET) return json({ ok: false, error: 'unauthorized' });

  // ping só lê o relógio, não precisa de lock
  if (body.action === 'ping') return json({ ok: true, time: new Date().toISOString() });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    switch (body.action) {
      case 'append':
        appendRow(body.row);
        return json({ ok: true });
      default:
        return json({ ok: false, error: 'unknown_action' });
    }
  } finally {
    lock.releaseLock();
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

// Primeira linha = cabeçalho; demais linhas viram objetos { coluna: valor }
function readRows() {
  const values = getSheet().getDataRange().getValues();
  if (values.length < 2) return [];
  const header = values[0];
  return values.slice(1).map(function (r) {
    const obj = {};
    header.forEach(function (h, i) { obj[h] = r[i]; });
    return obj;
  });
}

// Cria o cabeçalho a partir das chaves do objeto se a aba estiver vazia
function appendRow(row) {
  const sheet = getSheet();
  let header = [];
  if (sheet.getLastRow() > 0) {
    header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  } else {
    header = Object.keys(row);
    sheet.appendRow(header);
  }
  sheet.appendRow(header.map(function (h) { return row[h] !== undefined ? row[h] : ''; }));
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
