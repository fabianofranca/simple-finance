import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortUrl, parseConfigLink, buildConfigLink, sameConfig, generateKey } from '../src/config.js';

test('shortUrl resume a URL do Apps Script com os 6 últimos caracteres do id', () => {
  const url = 'https://script.google.com/macros/s/AKfycbx1234567890abcdefXYZ987654/exec';
  assert.equal(shortUrl(url), 'script.google.com · …987654');
  assert.equal(shortUrl(`  ${url}  `), 'script.google.com · …987654');
  assert.equal(shortUrl('https://script.google.com/a/macros/empresa.com/s/AKfycbQWERTY/exec'), 'script.google.com · …QWERTY');
});

test('shortUrl com URL estranha mostra só o host', () => {
  assert.equal(shortUrl('https://example.com/qualquer/coisa'), 'example.com');
  assert.equal(shortUrl('https://script.google.com/macros/s/AKfycbx123/dev'), 'script.google.com');
  assert.equal(shortUrl('http://localhost:8080/exec'), 'localhost:8080');
});

test('shortUrl vazia ou inválida → string vazia', () => {
  for (const bad of ['', '   ', null, undefined, 'não é url', 'script.google.com/macros/s/x/exec']) {
    assert.equal(shortUrl(bad), '');
  }
});

const URL_OK = 'https://script.google.com/macros/s/AKfyFAKE/exec';
const BASE = 'https://fulano.github.io/simple-finance/';

test('link de configuração: ida e volta com chave cheia de especiais', () => {
  const cfg = { url: URL_OK, key: 'a+b/c=d&e#f ção' };
  const link = buildConfigLink(BASE, cfg);
  assert.ok(link.startsWith(`${BASE}#conectar?u=`));
  assert.deepEqual(parseConfigLink(link), cfg);
});

test('buildConfigLink descarta #… da base', () => {
  const link = buildConfigLink(`${BASE}#mes`, { url: URL_OK, key: 'chave-teste' });
  assert.equal(link, `${BASE}#conectar?u=${encodeURIComponent(URL_OK)}&k=chave-teste`);
});

test('parseConfigLink aceita link inteiro, só o hash e texto colado com espaços', () => {
  const cfg = { url: URL_OK, key: 'chave-teste' };
  const link = buildConfigLink(BASE, cfg);
  const hash = link.slice(link.indexOf('#'));
  assert.deepEqual(parseConfigLink(link), cfg);
  assert.deepEqual(parseConfigLink(hash), cfg);
  assert.deepEqual(parseConfigLink(`  \n${link}\n  `), cfg);
  assert.deepEqual(parseConfigLink(`\t${hash} \n`), cfg);
});

test('parseConfigLink normaliza /exec/ para /exec', () => {
  const link = buildConfigLink(BASE, { url: `${URL_OK}/`, key: 'chave-teste' });
  assert.equal(parseConfigLink(link).url, URL_OK);
});

test('parseConfigLink recusa link inválido', () => {
  const mk = (u, k) => `${BASE}#conectar?${u === null ? '' : `u=${encodeURIComponent(u)}`}&${k === null ? '' : `k=${encodeURIComponent(k)}`}`;
  assert.equal(parseConfigLink(mk('https://script.google.com/macros/s/AKfyFAKE/dev', 'chave-teste')), null);
  assert.equal(parseConfigLink(mk('https://example.com/macros/s/x/exec', 'chave-teste')), null);
  assert.equal(parseConfigLink(mk('http://script.google.com/macros/s/AKfyFAKE/exec', 'chave-teste')), null);
  assert.equal(parseConfigLink(mk(`${URL_OK}?x=1`, 'chave-teste')), null);
  assert.equal(parseConfigLink(mk(null, 'chave-teste')), null);
  assert.equal(parseConfigLink(mk(URL_OK, null)), null);
  assert.equal(parseConfigLink(mk(URL_OK, '   ')), null);
  assert.equal(parseConfigLink(`${BASE}#mes`), null);
  for (const bad of ['', '   ', null, undefined]) assert.equal(parseConfigLink(bad), null);
});

test('sameConfig compara URL e chave aparadas', () => {
  const a = { url: URL_OK, key: 'chave-teste' };
  assert.equal(sameConfig(a, { url: ` ${URL_OK} `, key: ' chave-teste\n' }), true);
  assert.equal(sameConfig(a, { url: URL_OK, key: 'outra' }), false);
  assert.equal(sameConfig(a, null), false);
  assert.equal(sameConfig(a, {}), false);
  assert.equal(sameConfig(null, {}), true);
  assert.equal(sameConfig(null, undefined), true);
});

test('generateKey: 32 caracteres alfanuméricos, determinístico com fonte fixa', () => {
  const src = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 7) % 248);
  const key = generateKey(src);
  assert.equal(key.length, 32);
  assert.match(key, /^[A-Za-z0-9]{32}$/);
  assert.equal(generateKey(src), key);
  assert.equal(generateKey(() => new Uint8Array(64)), 'A'.repeat(32));
});

test('generateKey descarta bytes >= 248 (sem viés de módulo)', () => {
  let calls = 0;
  const src = (n) => {
    calls += 1;
    // primeira chamada: tudo rejeitado, menos um 1 no fim; depois, só 2
    const out = new Uint8Array(n).fill(calls === 1 ? 255 : 2);
    if (calls === 1) out[n - 1] = 1;
    return out;
  };
  assert.equal(generateKey(src), 'B' + 'C'.repeat(31));
  assert.ok(calls >= 2);
  assert.match(generateKey(() => Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 248 : 247))), /^[A-Za-z0-9]{32}$/);
});
