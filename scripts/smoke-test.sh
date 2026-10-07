#!/usr/bin/env bash
# Teste ponta a ponta do Apps Script: ping, append e leitura.
# Uso: cp .env.example .env (preencha) && ./scripts/smoke-test.sh
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] || { echo "FALHA: arquivo .env não encontrado." >&2; exit 1; }
set -a; . ./.env; set +a
: "${APPS_SCRIPT_URL:?defina APPS_SCRIPT_URL no .env}"
: "${APPS_SCRIPT_KEY:?defina APPS_SCRIPT_KEY no .env}"

fail() { echo "FALHA: $1" >&2; echo "Resposta: ${2:-}" >&2; exit 1; }

post() {
  # -L: o Apps Script responde com redirect 302
  curl -sSL --max-time 30 -H 'Content-Type: text/plain;charset=utf-8' \
    -d "$1" "$APPS_SCRIPT_URL"
}

echo "1/3 ping"
r=$(post "{\"key\":\"$APPS_SCRIPT_KEY\",\"action\":\"ping\"}") || fail "ping sem resposta"
case "$r" in *'"ok":true'*) echo "  ok: $r" ;; *) fail "ping" "$r" ;; esac

stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "2/3 append ($stamp)"
r=$(post "{\"key\":\"$APPS_SCRIPT_KEY\",\"action\":\"append\",\"row\":{\"descricao\":\"smoke-test\",\"valor\":1,\"vencimento\":\"$stamp\",\"pago\":false}}") || fail "append sem resposta"
case "$r" in *'"ok":true'*) echo "  ok" ;; *) fail "append" "$r" ;; esac

echo "3/3 leitura"
r=$(curl -sSL --max-time 30 -G --data-urlencode "key=$APPS_SCRIPT_KEY" "$APPS_SCRIPT_URL") || fail "GET sem resposta"
case "$r" in *"$stamp"*) echo "  ok: linha encontrada" ;; *) fail "linha não apareceu no GET" "$r" ;; esac

echo "Smoke test passou."
