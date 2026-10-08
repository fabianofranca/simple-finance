import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortUrl } from '../src/config.js';

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
