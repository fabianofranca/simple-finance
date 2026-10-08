// Dinheiro na tela: formatação e leitura em pt-BR. Valores sempre em centavos inteiros.
// Módulo puro: sem DOM e sem relógio.

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 123456 → "R$ 1.234,56" (com U+00A0 depois do "R$"); -5000 → "-R$ 50,00".
export function formatMoney(cents) {
  return currency.format(cents / 100);
}

// 123456 → "1.234,56", para pré-preencher um campo; negativo com "-".
export function formatInput(cents) {
  return plain.format(cents / 100);
}

// Número com vírgula decimal: "1.234,56", "1234,5".
const WITH_COMMA = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/;
// Sem vírgula, ponto com 1 ou 2 dígitos no fim é decimal: "12.5".
const DOT_DECIMAL = /^(\d+)\.(\d{1,2})$/;
// Sem vírgula, pontos de milhar: "1.234", "1.234.567".
const THOUSANDS = /^\d{1,3}(?:\.\d{3})+$/;
const INTEGER = /^\d+$/;
// Sinal opcional ("-" ou "−") antes ou depois do "R$" opcional.
const SHAPE = /^([-−])?\s*(?:R\$)?\s*([-−])?\s*(\S+)$/;

// Texto digitado → centavos inteiros, ou null se não der para entender.
// Monta os centavos a partir das partes, sem passar por float.
export function parseMoney(text, { allowNegative = false } = {}) {
  if (typeof text !== 'string') return null;
  const shape = SHAPE.exec(text.trim());
  if (!shape) return null;
  const [, signBefore, signAfter, body] = shape;
  if (signBefore && signAfter) return null;
  const negative = Boolean(signBefore || signAfter);
  if (negative && !allowNegative) return null;

  let whole;
  let frac = '';
  let m;
  if ((m = WITH_COMMA.exec(body))) {
    whole = m[1];
    frac = m[2];
  } else if ((m = DOT_DECIMAL.exec(body))) {
    whole = m[1];
    frac = m[2];
  } else if (THOUSANDS.test(body) || INTEGER.test(body)) {
    whole = body;
  } else {
    return null;
  }

  const cents = Number(whole.replace(/\./g, '')) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  if (cents === 0) return 0; // evita -0
  return negative ? -cents : cents;
}
