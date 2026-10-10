#!/usr/bin/env bash
# Teste ponta a ponta da API do Apps Script (valores em centavos).
#
# Modo padrão (não destrutivo): ping, leitura, conta "smoke-test" (arquivada),
# lançamentos em 2099-12 (inclusive a marcação de pago, paidAt), payload inválido e
# chave errada. Não mexe em dados reais.
#   cp .env.example .env (preencha) && ./scripts/smoke-test.sh
#
# Modo completo: SMOKE_FULL=1 ./scripts/smoke-test.sh
#   Roda reset, a suíte inteira com saveCheckin e termina com seed.
#   APAGA TUDO e deixa a massa de exemplo. Exige ambiente = teste na aba Config.
#   NUNCA rode SMOKE_FULL na planilha da esposa.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] || { echo "FALHA: arquivo .env não encontrado." >&2; exit 1; }
set -a; . ./.env; set +a
: "${APPS_SCRIPT_URL:?defina APPS_SCRIPT_URL no .env}"
: "${APPS_SCRIPT_KEY:?defina APPS_SCRIPT_KEY no .env}"

FULL=0; [ "${SMOKE_FULL:-}" = "1" ] && FULL=1
if [ "$FULL" = 1 ]; then TOTAL=13; MODO="completo"; else TOTAL=8; MODO="padrão"; fi
N=0

fail() { echo "FALHA: $1" >&2; echo "Resposta: ${2:-}" >&2; exit 1; }
step() { N=$((N + 1)); echo "$N/$TOTAL $1"; }

# post '<campos JSON sem a chave>' [chave]
post() {
  # -L: o Apps Script responde com redirect 302
  curl -sSL --max-time 60 -H 'Content-Type: text/plain;charset=utf-8' \
    -d "{\"key\":\"${2:-$APPS_SCRIPT_KEY}\",$1}" "$APPS_SCRIPT_URL"
}
getall() {
  curl -sSL --max-time 60 -G --data-urlencode "key=$APPS_SCRIPT_KEY" "$APPS_SCRIPT_URL"
}

# js '<json>' '<expressão sobre d>' -> imprime o resultado (d = JSON lido)
js() {
  JSON_IN="$1" EXPR="$2" node -e '
    const d = JSON.parse(process.env.JSON_IN);
    const v = eval(process.env.EXPR);
    console.log(typeof v === "object" ? JSON.stringify(v) : String(v));
  ' 2>/dev/null || echo "__erro__"
}
# check '<rótulo>' '<json>' '<expressão booleana sobre d>'
check() { [ "$(js "$2" "$3")" = "true" ] || fail "$1" "$2"; }

# ok_post <rótulo> <campos>: exige ok:true
ok_post() {
  local r; r=$(post "$2") || fail "$1 sem resposta"
  check "$1" "$r" 'd.ok === true'
}
entries_of() { js "$1" 'd.entries.filter(e => e.accountId === "smoke-test" && e.month === "2099-12")'; }
# save_entries <rótulo> <amount|null> [campos extras, ex.: ,"paidAt":null]
save_entries() {
  ok_post "$1" "\"action\":\"saveEntries\",\"entries\":[{\"accountId\":\"smoke-test\",\"month\":\"2099-12\",\"amount\":$2${3:-}}]"
}

step "ping"
r=$(post '"action":"ping"') || fail "ping sem resposta"
check "ping" "$r" 'd.ok === true'; echo "  ok: $r"

step "leitura (GET)"
g=$(getall) || fail "GET sem resposta"
check "GET sem accounts/entries/checkins/settings" "$g" '["accounts","entries","checkins","settings"].every(k => k in d)'
echo "  ok"

if [ "$FULL" = 1 ]; then
  step "verificar ambiente de teste"
  if [ "$(js "$g" 'd.settings.environment === "test"')" != "true" ]; then
    echo "FALHA: SMOKE_FULL só roda na planilha de teste (ambiente = teste na Config)." >&2
    exit 1
  fi
  echo "  ok: ambiente = teste"

  step "reset"
  ok_post "reset" '"action":"reset"'
  g=$(getall) || fail "GET sem resposta"
  check "reset não esvaziou as abas" "$g" 'd.accounts.length === 0 && d.entries.length === 0 && d.checkins.length === 0'
  echo "  ok: abas vazias"
fi

step "saveAccount (smoke-test, arquivada)"
ok_post "saveAccount" '"action":"saveAccount","account":{"id":"smoke-test","name":"smoke-test","type":"expense","defaultAmount":null,"order":999,"active":false}'
echo "  ok"

step "saveEntries duas vezes (100 e 200): uma linha com 200"
save_entries "saveEntries 100" 100
save_entries "saveEntries 200" 200
g=$(getall) || fail "GET sem resposta"
e=$(entries_of "$g")
check "esperava uma linha com amount 200" "$e" 'd.length === 1 && d[0].amount === 200'
echo "  ok: $e"

step "paidAt: marcar, regravar só o valor (mantém a marcação) e desmarcar"
PAID_AT=$(node -e "console.log(new Date().toISOString())") # portátil (o date do macOS não tem %N)
save_entries "saveEntries com paidAt" 300 ",\"paidAt\":\"$PAID_AT\""
g=$(getall) || fail "GET sem resposta"
e=$(entries_of "$g")
check "paidAt não voltou no GET (publicou a Nova versão do script da Fase 5?)" "$e" "d.length === 1 && d[0].amount === 300 && d[0].paidAt === \"$PAID_AT\""
save_entries "saveEntries só o valor" 400
g=$(getall) || fail "GET sem resposta"
e=$(entries_of "$g")
check "regravar só o valor apagou a marcação" "$e" "d.length === 1 && d[0].amount === 400 && d[0].paidAt === \"$PAID_AT\""
save_entries "saveEntries paidAt null" 400 ',"paidAt":null'
g=$(getall) || fail "GET sem resposta"
e=$(entries_of "$g")
check "paidAt null não desmarcou" "$e" 'd.length === 1 && d[0].amount === 400 && d[0].paidAt === null'
r=$(post '"action":"saveEntries","entries":[{"accountId":"smoke-test","month":"2099-12","amount":400,"paidAt":123}]') || fail "sem resposta"
check "esperava invalid_payload para paidAt numérico" "$r" 'd.ok !== true && d.error === "invalid_payload"'
echo "  ok: marcou, manteve, desmarcou"

step "saveEntries com amount null apaga a linha"
save_entries "saveEntries null" null
g=$(getall) || fail "GET sem resposta"
e=$(entries_of "$g")
check "a linha não sumiu" "$e" 'd.length === 0'
echo "  ok"

step "payload inválido (mês 2099-13)"
r=$(post '"action":"saveEntries","entries":[{"accountId":"smoke-test","month":"2099-13","amount":1}]') || fail "sem resposta"
check "esperava invalid_payload" "$r" 'd.ok !== true && d.error === "invalid_payload"'
echo "  ok"

if [ "$FULL" = 1 ]; then
  at=$(node -e "console.log(new Date().toISOString())") # portátil (o date do macOS não tem %N)
  mes=$(date -u +%Y-%m)
  step "saveCheckin duas vezes: um check-in só"
  ck="\"action\":\"saveCheckin\",\"checkin\":{\"at\":\"$at\",\"month\":\"$mes\",\"balance\":100000,\"billsPaid\":false,\"incomeReceived\":true,\"projectedBalance\":100000}"
  ok_post "saveCheckin 1" "$ck"
  ok_post "saveCheckin 2" "$ck"
  g=$(getall) || fail "GET sem resposta"
  check "esperava um único check-in com esse at" "$g" "d.checkins.filter(c => c.at === \"$at\").length === 1"
  echo "  ok"

  step "saveSettings com environment é recusado"
  r=$(post '"action":"saveSettings","settings":{"environment":"production"}') || fail "sem resposta"
  check "esperava invalid_payload" "$r" 'd.ok !== true && d.error === "invalid_payload"'
  echo "  ok"
fi

step "chave errada"
r=$(post '"action":"ping"' "chave-errada-smoke") || fail "sem resposta"
check "esperava unauthorized" "$r" 'd.ok !== true && d.error === "unauthorized"'
echo "  ok"

if [ "$FULL" = 1 ]; then
  step "seed (deixa a massa de exemplo)"
  ok_post "seed" '"action":"seed"'
  g=$(getall) || fail "GET sem resposta"
  check "seed: esperava 6 contas e 1 check-in" "$g" 'd.accounts.length === 6 && d.checkins.length === 1'
  echo "  ok: 6 contas e 1 check-in"
fi

echo "Smoke test passou (modo $MODO)."
