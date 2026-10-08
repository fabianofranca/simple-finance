import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, formatInput, parseMoney } from '../src/money.js';

// O Intl põe um espaço não separável (U+00A0) entre "R$" e o número.
const NBSP = ' ';

test('formatMoney usa R$, milhar com ponto e decimal com vírgula', () => {
  assert.equal(formatMoney(123456), `R$${NBSP}1.234,56`);
  assert.equal(formatMoney(0), `R$${NBSP}0,00`);
  assert.equal(formatMoney(5), `R$${NBSP}0,05`);
  assert.equal(formatMoney(-5000), `-R$${NBSP}50,00`);
  assert.equal(formatMoney(100000000), `R$${NBSP}1.000.000,00`);
});

test('formatInput sem "R$", para pré-preencher o campo', () => {
  assert.equal(formatInput(123456), '1.234,56');
  assert.equal(formatInput(50), '0,50');
  assert.equal(formatInput(-123450), '-1.234,50');
});

test('parseMoney aceita os formatos comuns', () => {
  const cases = {
    '1.234,56': 123456,
    '1234,5': 123450,
    '1234,56': 123456,
    'R$ 1.234,56': 123456,
    [`R$${NBSP}1.234,56`]: 123456,
    'R$1234': 123400,
    '1234': 123400,
    '  1234  ': 123400,
    '0,5': 50,
    '0': 0,
    '12.5': 1250,
    '12.50': 1250,
    '1.234': 123400,
    '1.234.567': 123456700,
    '1.234.567,89': 123456789,
  };
  for (const [text, cents] of Object.entries(cases)) {
    assert.equal(parseMoney(text), cents, JSON.stringify(text));
  }
});

test('parseMoney devolve null para vazio, lixo e mais de 2 casas', () => {
  const bad = [
    '', '   ', 'abc', 'R$', '12a', '1,2,3', '1.23.4', '1.2345', '12,345', '1.234,567',
    ',5', '5,', '.5', '1 234', '12.3.4', '--5', '-', 'R$ R$ 5', null, undefined, 123,
  ];
  for (const text of bad) {
    assert.equal(parseMoney(text), null, JSON.stringify(text));
    assert.equal(parseMoney(text, { allowNegative: true }), null, JSON.stringify(text));
  }
});

test('parseMoney: negativo só com allowNegative', () => {
  for (const text of ['-50', '-R$ 50,00', 'R$ -50', '−50', '- 50,00']) {
    assert.equal(parseMoney(text), null, JSON.stringify(text));
    assert.equal(parseMoney(text, { allowNegative: true }), -5000, JSON.stringify(text));
  }
  assert.equal(parseMoney('-1.234,56', { allowNegative: true }), -123456);
  assert.equal(parseMoney('-12.5', { allowNegative: true }), -1250);
  assert.ok(Object.is(parseMoney('-0', { allowNegative: true }), 0));
  assert.equal(parseMoney('50', { allowNegative: true }), 5000);
});

test('ida e volta: formatMoney/formatInput → parseMoney', () => {
  for (const cents of [0, 1, 10, 99, 100, 123456, 100000000, 987654321]) {
    assert.equal(parseMoney(formatMoney(cents)), cents);
    assert.equal(parseMoney(formatInput(cents)), cents);
  }
  for (const cents of [-1, -5000, -123456]) {
    assert.equal(parseMoney(formatMoney(cents)), null);
    assert.equal(parseMoney(formatMoney(cents), { allowNegative: true }), cents);
    assert.equal(parseMoney(formatInput(cents), { allowNegative: true }), cents);
  }
});
