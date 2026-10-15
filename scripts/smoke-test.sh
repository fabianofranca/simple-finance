#!/usr/bin/env bash
# Teste ponta a ponta da API do Apps Script (valores em centavos).
#
# Modo padrão (não destrutivo): ping, leitura, conta "smoke-test" (arquivada, inclusive a
# marcação de cartão, isCard), lançamentos em 2099-12 (inclusive a marcação de pago, paidAt),
# payloads inválidos (savePurchase inválido não grava nada) e chave errada.
# Não mexe em dados reais. Não grava compra: linhas da aba Compras não se apagam pela API.
#   cp .env.example .env (preencha) && ./scripts/smoke-test.sh
#
# Modo completo: SMOKE_FULL=1 ./scripts/smoke-test.sh
#   Roda reset, a suíte inteira com savePurchase (lançar e desfazer), saveCheckin e
#   saveSettings, e termina com seed.
#   APAGA TUDO e deixa a massa de exemplo. Exige ambiente = teste na aba Config.
#   NUNCA rode SMOKE_FULL na planilha da esposa.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] || { echo "FALHA: arquivo .env não encontrado." >&2; exit 1; }
set -a; . ./.env; set +a
: "${APPS_SCRIPT_URL:?defina APPS_SCRIPT_URL no .env}"
: "${APPS_SCRIPT_KEY:?defina APPS_SCRIPT_KEY no .env}"

FULL=0; [ "${SMOKE_FULL:-}" = "1" ] && FULL=1
if [ "$FULL" = 1 ]; then TOTAL=16; MODO="completo"; else TOTAL=10; MODO="padrão"; fi
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
check "GET sem purchases, purchaseListSize ou isCard (publicou a Nova versão do script da Fase 6?)" "$g" \
  'Array.isArray(d.purchases) && Number.isInteger(d.settings.purchaseListSize) && d.accounts.every(a => typeof a.isCard === "boolean")'
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
  check "reset não esvaziou as abas" "$g" 'd.accounts.length === 0 && d.entries.length === 0 && d.checkins.length === 0 && d.purchases.length === 0'
  echo "  ok: abas vazias"
fi

step "saveAccount (smoke-test, arquivada)"
SMOKE_ACCOUNT='"id":"smoke-test","name":"smoke-test","type":"expense","defaultAmount":null,"order":999,"active":false'
ok_post "saveAccount" "\"action\":\"saveAccount\",\"account\":{$SMOKE_ACCOUNT}"
echo "  ok"

step "isCard: marcar, regravar sem a chave (mantém a marcação) e desmarcar"
card_of() { js "$1" 'd.accounts.filter(a => a.id === "smoke-test").map(a => a.isCard)'; }
ok_post "saveAccount isCard true" "\"action\":\"saveAccount\",\"account\":{$SMOKE_ACCOUNT,\"isCard\":true}"
g=$(getall) || fail "GET sem resposta"
check "isCard true não voltou no GET" "$(card_of "$g")" 'd.length === 1 && d[0] === true'
ok_post "saveAccount sem isCard" "\"action\":\"saveAccount\",\"account\":{$SMOKE_ACCOUNT}"
g=$(getall) || fail "GET sem resposta"
check "regravar sem isCard apagou a marcação" "$(card_of "$g")" 'd.length === 1 && d[0] === true'
ok_post "saveAccount isCard false" "\"action\":\"saveAccount\",\"account\":{$SMOKE_ACCOUNT,\"isCard\":false}"
g=$(getall) || fail "GET sem resposta"
check "isCard false não desmarcou" "$(card_of "$g")" 'd.length === 1 && d[0] === false'
r=$(post "\"action\":\"saveAccount\",\"account\":{$SMOKE_ACCOUNT,\"isCard\":\"sim\"}") || fail "sem resposta"
check "esperava invalid_payload para isCard texto" "$r" 'd.ok !== true && d.error === "invalid_payload"'
echo "  ok: marcou, manteve, desmarcou"

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

# save_purchase <rótulo> <id> <at> <undoneAt JSON> <entries JSON>: compra de 2 × R$ 150,00
# na conta smoke-test a partir de 2099-10
save_purchase() {
  ok_post "$1" "\"action\":\"savePurchase\",\"purchase\":{\"id\":\"$2\",\"at\":\"$3\",\"accountId\":\"smoke-test\",\"installment\":15000,\"count\":2,\"firstMonth\":\"2099-10\",\"undoneAt\":$4},\"entries\":$5"
}
# valores da conta smoke-test em 2099-10 e 2099-11, nessa ordem
purchase_entries() {
  js "$1" 'd.entries.filter(e => e.accountId === "smoke-test" && (e.month === "2099-10" || e.month === "2099-11")).sort((a, b) => a.month < b.month ? -1 : 1)'
}

step "savePurchase inválido (25 parcelas) não grava nada"
g=$(getall) || fail "GET sem resposta"
before=$(js "$g" 'd.purchases.length')
NOW=$(node -e "console.log(new Date().toISOString())")
r=$(post "\"action\":\"savePurchase\",\"purchase\":{\"id\":\"smoke-invalid\",\"at\":\"$NOW\",\"accountId\":\"smoke-test\",\"installment\":15000,\"count\":25,\"firstMonth\":\"2099-10\",\"undoneAt\":null},\"entries\":[{\"accountId\":\"smoke-test\",\"month\":\"2099-10\",\"amount\":15000}]") || fail "sem resposta"
check "esperava invalid_payload (publicou a Nova versão do script da Fase 6?)" "$r" 'd.ok !== true && d.error === "invalid_payload"'
g=$(getall) || fail "GET sem resposta"
check "o savePurchase inválido gravou algo" "$g" "d.purchases.length === $before && !d.purchases.some(p => p.id === \"smoke-invalid\") && !d.entries.some(e => e.accountId === \"smoke-test\" && e.month === \"2099-10\")"
echo "  ok"

if [ "$FULL" = 1 ]; then
  step "savePurchase: lançar, reenviar e desfazer (2099-10 e 2099-11)"
  PID="smoke-purchase-$(date +%s)"
  P_AT=$(node -e "console.log(new Date().toISOString())")
  ok_post "saveEntries 2099-10" '"action":"saveEntries","entries":[{"accountId":"smoke-test","month":"2099-10","amount":10000}]'
  LAUNCH='[{"accountId":"smoke-test","month":"2099-10","amount":25000},{"accountId":"smoke-test","month":"2099-11","amount":15000}]'
  save_purchase "savePurchase lançar" "$PID" "$P_AT" null "$LAUNCH"
  save_purchase "savePurchase reenvio" "$PID" "$P_AT" null "$LAUNCH"
  g=$(getall) || fail "GET sem resposta"
  check "esperava uma compra lançada (sem undoneAt)" "$g" "(p => p.length === 1 && p[0].installment === 15000 && p[0].count === 2 && p[0].firstMonth === \"2099-10\" && p[0].at === \"$P_AT\" && p[0].undoneAt === null)(d.purchases.filter(p => p.id === \"$PID\"))"
  e=$(purchase_entries "$g")
  check "esperava 250,00 e 150,00 com updatedAt = at" "$e" "d.length === 2 && d[0].amount === 25000 && d[1].amount === 15000 && d.every(x => x.updatedAt === \"$P_AT\")"
  U_AT=$(node -e "console.log(new Date().toISOString())")
  save_purchase "savePurchase desfazer" "$PID" "$P_AT" "\"$U_AT\"" '[{"accountId":"smoke-test","month":"2099-10","amount":10000},{"accountId":"smoke-test","month":"2099-11","amount":null}]'
  g=$(getall) || fail "GET sem resposta"
  check "esperava a mesma compra com undoneAt" "$g" "(p => p.length === 1 && p[0].undoneAt === \"$U_AT\")(d.purchases.filter(p => p.id === \"$PID\"))"
  e=$(purchase_entries "$g")
  check "esperava 100,00 em 2099-10 (updatedAt = undoneAt) e 2099-11 sem lançamento" "$e" "d.length === 1 && d[0].month === \"2099-10\" && d[0].amount === 10000 && d[0].updatedAt === \"$U_AT\""
  ok_post "limpar 2099-10" '"action":"saveEntries","entries":[{"accountId":"smoke-test","month":"2099-10","amount":null}]'
  echo "  ok: lançou, reenviou sem duplicar e desfez"

  at=$(node -e "console.log(new Date().toISOString())") # portátil (o date do macOS não tem %N)
  mes=$(date -u +%Y-%m)
  step "saveCheckin duas vezes: um check-in só"
  ck="\"action\":\"saveCheckin\",\"checkin\":{\"at\":\"$at\",\"month\":\"$mes\",\"balance\":100000,\"billsPaid\":false,\"incomeReceived\":true,\"projectedBalance\":100000}"
  ok_post "saveCheckin 1" "$ck"
  ok_post "saveCheckin 2" "$ck"
  g=$(getall) || fail "GET sem resposta"
  check "esperava um único check-in com esse at" "$g" "d.checkins.filter(c => c.at === \"$at\").length === 1"
  echo "  ok"

  step "saveSettings: environment e purchaseListSize 21 recusados; purchaseListSize 7 aceito"
  r=$(post '"action":"saveSettings","settings":{"environment":"production"}') || fail "sem resposta"
  check "esperava invalid_payload para environment" "$r" 'd.ok !== true && d.error === "invalid_payload"'
  r=$(post '"action":"saveSettings","settings":{"purchaseListSize":21}') || fail "sem resposta"
  check "esperava invalid_payload para purchaseListSize 21" "$r" 'd.ok !== true && d.error === "invalid_payload"'
  ok_post "saveSettings purchaseListSize 7" '"action":"saveSettings","settings":{"purchaseListSize":7}'
  g=$(getall) || fail "GET sem resposta"
  check "purchaseListSize 7 não voltou no GET" "$g" 'd.settings.purchaseListSize === 7'
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
  check "seed: esperava Nubank, Inter, Renner e C&A como cartão" "$g" 'd.accounts.filter(a => a.isCard).map(a => a.id).sort().join() === "cea,inter,nubank,renner"'
  check "seed: esperava a lista de compras com 5 e sem compras" "$g" 'd.settings.purchaseListSize === 5 && d.purchases.length === 0'
  echo "  ok: 6 contas (4 cartões) e 1 check-in"
fi

echo "Smoke test passou (modo $MODO)."
