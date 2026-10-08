# Plano: App de Contas — Fase 1 (dados e regras)

## Contexto

A Fase 0 validou o caminho GitHub Pages → Apps Script → Sheets (`ping`, `append` e leitura da aba `Teste`). A Fase 1 troca o modelo de teste pelo modelo real descrito em `docs/product.md` e entrega tudo o que as telas vão usar, ainda sem telas novas:

- abas reais criadas automaticamente pelo script;
- API nova no `Code.gs`;
- cache local com fila de gravação;
- cálculo de fluxo de caixa com testes;
- massa de teste e limpeza pela API, para o Fabiano testar pelo celular.

**Duas planilhas:** a atual (a da Fase 0) vira a planilha de **teste** do Fabiano. A planilha **da esposa** é criada do zero no fim, na entrega, com implantação própria; o app já tem URL e chave configuráveis por aparelho.

**Ponto de partida:** `apps-script/Code.gs` (doGet/doPost, lock, `json()`), `src/config.js` (URL e chave), `src/api.js` (`request()` com timeout, latência e `ApiError`), `src/main.js` + `index.html` (painel de teste) e `scripts/smoke-test.sh`.

## Restrições

1. Todas as da Fase 0 continuam valendo: sem build, sem npm no frontend, nenhum segredo no repo, POST com `Content-Type: text/plain;charset=utf-8` e sem headers customizados, `curl -L`, mobile first.
2. **Idioma:** abas e cabeçalhos da planilha em PT-BR, porque ela lê. API JSON, JS e nomes de arquivos em inglês. O `Code.gs` é o único lugar que traduz, seguindo a tabela abaixo.
3. **Valores:** na API e no JS são centavos inteiros. Na planilha ficam em reais, com formato numérico `0.00`, para ela ler direto no Sheets. O `Code.gs` converte com `Math.round(v * 100)` e `v / 100`.
4. **Mês e ids:** texto `YYYY-MM`. PEGADINHA: o Sheets converte "2026-11" em data e "1" em número. A criação das abas aplica `setNumberFormat('@')` nas colunas de id, conta_id, mes, data e atualizado_em, e o `Code.gs` grava sempre com `String(...)`. Na leitura, qualquer `Date` que apareça nessas colunas vira erro `bad_sheet_data`, nunca é convertido em silêncio.
5. **Testes:** `node --test` nativo + `node:assert`, sem package.json. No container há o node v22.22.0, que detecta ES modules sozinho desde a 22.7: `src/forecast.js` é importado por `tests/forecast.test.js` sem flag e sem aviso (testado). Exigir node ≥ 22.7. Se algum ambiente mais antigo falhar, a alternativa é um `package.json` mínimo com `{ "type": "module" }`, sem dependências, e isso **precisa de aprovação do Fabiano antes**.

## Mapeamento planilha ↔ API

| Aba → chave JSON | Cabeçalho (PT-BR) → campo (inglês) |
|---|---|
| `Contas` → `accounts` | id → `id` · nome → `name` · tipo (`despesa`/`receita`) → `type` (`expense`/`income`) · valor_padrao (reais, vazio = sem) → `defaultAmount` (centavos ou `null`) · ordem → `order` · ativa (TRUE/FALSE) → `active` |
| `Lancamentos` → `entries` | conta_id → `accountId` · mes → `month` · valor → `amount` · atualizado_em → `updatedAt` (ISO, preenchido pelo servidor) |
| `Checkins` → `checkins` | data → `at` (ISO, do cliente) · mes → `month` · saldo → `balance` · contas_pagas → `billsPaid` · salario_caiu → `incomeReceived` · sobra_prevista → `projectedBalance` |
| `Config` → `settings` | frequencia_checkin (`toda_vez`/`diaria`/`semanal`) → `checkinFrequency` (`always`/`daily`/`weekly`) · horizonte_meses (padrão 3) → `horizonMonths` · ultima_revisao → `lastReviewAt` · ambiente (`teste`) → `environment` (`test`/`production`), somente leitura |

A aba `Config` tem duas colunas, `chave` e `valor`, e cada linha é uma configuração. No JS ela se chama `settings` para não confundir com `src/config.js`, que guarda URL e chave no localStorage.

## Contrato da API

| Método | Request | Sucesso |
|---|---|---|
| GET | `?key=<chave>` | `{ ok, accounts:[], entries:[], checkins:[], settings:{} }`; `settings.environment` é `test` quando a `Config` tem `ambiente = teste`, senão `production` |
| POST | `{ key, action:"ping" }` | `{ ok, time }` |
| POST | `{ key, action:"saveAccount", account:{id,name,type,defaultAmount,order,active} }` | `{ ok }`: upsert por `id` |
| POST | `{ key, action:"saveEntries", entries:[{accountId,month,amount}] }` | `{ ok, saved:n }`: upsert por (accountId, month); `amount:null` apaga a linha (volta ao valor padrão) |
| POST | `{ key, action:"saveCheckin", checkin:{at,month,balance,billsPaid,incomeReceived,projectedBalance} }` | `{ ok }`: append |
| POST | `{ key, action:"saveSettings", settings:{...} }` | `{ ok }`: upsert de cada chave. Aceita só `checkinFrequency`, `horizonMonths` e `lastReviewAt`; qualquer outra chave, inclusive `environment`, dá `invalid_payload` (ninguém liga o modo teste pela web) |
| POST | `{ key, action:"seed" }` | `{ ok }`: apaga os dados e recria a massa de exemplo (só em ambiente de teste) |
| POST | `{ key, action:"reset" }` | `{ ok }`: apaga as linhas de dados de `Contas`, `Lancamentos` e `Checkins`, mantendo abas e cabeçalhos; na `Config`, preserva a linha `ambiente` e restaura os padrões (só em ambiente de teste) |

- **Erros:** `{ ok:false, error }`, com os códigos `unauthorized`, `invalid_json`, `unknown_action`, `invalid_payload` (campo faltando, tipo errado, mês fora de `YYYY-MM`, valor não inteiro, conta_id inexistente), `busy` (não conseguiu o lock em 10s, via `tryLock`), `forbidden` (`seed` ou `reset` em planilha sem `ambiente = teste` na `Config`) e `bad_sheet_data`. Sem a propriedade `SECRET` configurada, toda chamada responde `unauthorized`; chave vazia nunca é aceita.
- **Escritas:** toda escrita, inclusive `seed` e `reset`, usa `LockService.getScriptLock()`. A validação acontece inteira antes de gravar, então um payload inválido não grava nada.
- **Massa de teste (`seed`):** contas Nubank, Inter, Renner, C&A (despesas), Unha (despesa com valor padrão) e Salário (receita com valor padrão); lançamentos do mês atual e dos próximos meses com valores plausíveis, incluindo parcelas que fazem um mês futuro ficar apertado, para exercitar o "Posso comprar?"; e um primeiro check-in do mês atual. O mês atual é calculado no servidor (fuso do script).
- **Sai:** a action `append` e a aba `Teste`. O Fabiano pode apagar a aba depois.

## Tarefas

Cada tarefa vira um PR. Dependências: **T1 e T2 começam em paralelo.** T3 depende só do contrato acima e pode correr junto com T1. T4 depende de T3. T5 depende de T1. T6 depende de T2 e T4. T7 vem por último.

### T1. Backend (`apps-script/Code.gs`)
- **Sem `setup()` manual.** No início de `doGet`/`doPost`, uma rotina cria as abas que faltarem com cabeçalho na linha 1, congela a linha 1, aplica o formato `@` nas colunas de texto, `0.00` nos valores e caixa de seleção em ativa/contas_pagas/salario_caiu, e grava os padrões da `Config` (`semanal`, `3`). É idempotente e barata: quando tudo existe, não escreve nada. Pode haver uma função `setup()` que só chama a mesma rotina, opcional.
- **Chave nas Propriedades do script:** a chave sai do código e fica em `PropertiesService.getScriptProperties()`, propriedade `SECRET`, configurada uma vez por projeto no editor (*Configurações do projeto → Propriedades do script*). Assim, cada versão nova do `Code.gs` é colar o arquivo inteiro sem editar nada.
- `seed` e `reset` (contrato acima), só se a `Config` tiver `ambiente = teste`; senão `forbidden`. `saveSettings` rejeita `ambiente`.
- `doGet` monta a leitura completa. `doPost` despacha as actions do contrato, com um validador por action.
- Lê e grava pelo cabeçalho, não pela posição da coluna: ela pode reordenar colunas.
- **Aceite:** usa só `SpreadsheetApp`, `ContentService`, `LockService` e `PropertiesService`. O comentário do topo traz o contrato novo e os passos de implantação (propriedade `SECRET`, colar sem editar, *Nova versão*).

### T2. Cálculo (`src/forecast.js` + `tests/forecast.test.js`)
- Módulo puro, sem DOM e sem fetch. Recebe `data = { accounts, entries, checkins, settings }` e `today` (Date) por parâmetro.
- Exporta, no mínimo:
  - `monthOf(date)` e `addMonths(month, k)`;
  - `effectiveAmount(account, month, entries)`, que devolve `{ amount, estimated }`;
  - `monthTotals(data, month)`, que devolve `{ income, expense }`;
  - `project(data, today, months)`, que devolve `[{ month, income, expense, balance }]`;
  - `currentStatus(data, today)`, que devolve `{ month, balance, toPay, endOfMonth }`;
  - `canBuy(data, today, { installment, count, horizon })`, que devolve `{ ok, months, firstNegative, alreadyNegative }`.
- Regras exatamente como em `docs/product.md`.
- **Casos mínimos de teste:**
  1. 1.500/1.000 → sobra 500; mês seguinte 1.500/1.200 → acumulado 800.
  2. Check-in com "Ainda não" desconta D(A); com "Já paguei", não desconta, e Falta pagar = 0.
  3. Salário com "Ainda não" soma R(A); com "Já caiu", não soma.
  4. Lançamento vence valor padrão; sem lançamento usa o padrão com `estimated: true`; sem os dois dá 0; conta arquivada ignora o padrão.
  5. Último check-in de um mês anterior: a projeção atravessa os meses até hoje. Sem check-in: S = 0.
  6. Posso comprar positivo: todos os meses ≥ 0, e a 1ª parcela cai no mês seguinte.
  7. Negativo dentro do horizonte: `firstNegative` com o mês e quanto falta.
  8. Negativo só além do horizonte (n > H): é detectado mesmo fora dos `months` exibidos.
  9. Já negativo sem a compra: `alreadyNegative` preenchido.
- **Aceite:** `node --test` na raiz passa, sem warnings.

### T3. Cliente (`src/api.js`)
- Mantém `request()`, `ApiError` e `ping()`. Acrescenta `loadAll()`, `saveAccount(a)`, `saveEntries(list)`, `saveCheckin(c)` e `saveSettings(s)`. Remove `getRows` e `appendRow`.
- **Aceite:** cada função monta exatamente o payload do contrato.

### T4. Cache (`src/store.js`)
- Guarda o último `loadAll()` no localStorage. Todo acesso fica em try/catch e, sem localStorage, o store funciona só em memória.
- `getData()` responde na hora, a partir do cache. `refresh()` busca no servidor e reaplica por cima as gravações ainda na fila.
- `save*()` atualiza o cache na hora (otimista) e põe a operação numa fila persistida. A fila é enviada em ordem, em segundo plano.
- Em erro de rede, `timeout` ou `busy`: nova tentativa com espera crescente (2s, 4s, 8s… até 60s) e também no evento `online`. Em `unauthorized` ou `invalid_payload`: para, mantém a fila e expõe o erro.
- `subscribe(fn)` avisa a UI quando os dados ou o estado da fila mudam.
- O id de conta nova vem de `crypto.randomUUID()`.
- **Aceite:** ao recarregar a página com a fila pendente, ela é retomada e nada se perde.

### T5. Smoke test (`scripts/smoke-test.sh`)
- Faz, em ordem:
  - `ping`;
  - GET com as quatro chaves;
  - `saveAccount` da conta `smoke-test` (arquivada);
  - `saveEntries` duas vezes para a mesma chave, e o GET deve mostrar uma linha só, com o 2º valor;
  - `amount:null` apaga a linha;
  - um payload inválido deve dar `invalid_payload`;
  - uma chave errada deve dar `unauthorized`.
- Sem flag, o smoke test é não destrutivo: não roda `saveCheckin`, `seed` nem `reset`.
- Com `SMOKE_FULL=1`: roda `reset`, a suíte completa incluindo `saveCheckin`, e termina com `seed`, deixando a planilha de teste com a massa de exemplo. Só faz sentido na planilha de teste (exige `ambiente = teste`); nunca aponte para a da esposa.
- **Aceite:** sai com código diferente de zero em qualquer falha.

### T6. Painel de desenvolvimento (`index.html` + `src/main.js`)
- **Decisão:** o `index.html` continua como painel de desenvolvimento até a Fase 2 substituí-lo. Assim o Fabiano valida dados reais e cálculo no celular sem esperar as telas, e o painel some na Fase 2 sem custo.
- Botões "Testar conexão", "Carregar dados" (via store, mostra o estado da fila), "Ver previsão", que mostra `currentStatus` e `project` dos próximos 3 meses em JSON, e "Regravar ajustes", que chama `saveSettings` com os valores atuais (idempotente) para testar a fila. O botão "Gravar linha de teste" sai.
- Botões "Gerar massa de teste" (`seed`) e "Apagar tudo" (`reset`, com `confirm()`), visíveis só quando `settings.environment === 'test'`.
- **Aceite:** abrir via `python3 -m http.server` funciona sem erros no console.

### T7. README.md
- Atualiza o setup: configurar a propriedade `SECRET` uma vez (*Configurações do projeto → Propriedades do script*); colar o `Code.gs` inteiro sem editar; publicar com *Nova versão* (a autorização é pedida na 1ª vez); adicionar a linha `ambiente | teste` na `Config` da planilha de teste (dá para fazer pelo app do Sheets no celular); rodar `node --test`. Apagar a aba `Teste` antiga é opcional.
- Explica as abas e colunas (mês como texto, valores em reais) para leitura, e que a planilha da esposa é criada do zero na entrega, sem a linha `ambiente`.
- Explica a aba `Resumo` (opcional, só leitura). Fórmula em locale pt-BR, a validar na planilha real: `=QUERY({ARRAYFORMULA(SEERRO(PROCV(Lancamentos!A2:A;Contas!A2:B;2;FALSO)))\Lancamentos!B2:C};"select Col1, sum(Col3) where Col1 is not null group by Col1 pivot Col2";0)`. Registrar que o Resumo mostra só lançamentos, sem os valores padrão.

## Pausas obrigatórias (ações manuais do Fabiano)
1. **Depois de T1:** configurar a propriedade `SECRET` (uma vez) em *Configurações do projeto → Propriedades do script*, colar o `Code.gs` inteiro no editor e publicar em *Gerenciar implantações → Editar → Nova versão*. Não criar implantação nova, senão a URL muda. Depois, fazer uma chamada (ex.: abrir o painel e tocar em "Testar conexão") para as abas serem criadas e conferir as quatro. Por fim, adicionar a linha `ambiente | teste` na aba `Config`.
2. **Depois de T5:** rodar `SMOKE_FULL=1 ./scripts/smoke-test.sh` uma vez e reportar. Nas próximas vezes, rodar sem a variável.
3. **Depois de T6:** no celular, tocar em "Gerar massa de teste" e "Ver previsão" e conferir a sobra contra uma conta feita à mão.

## Fora do escopo desta fase
- Telas de Check-in, Mês, Posso comprar?, Ajustes e lembrete (Fases 2 e 3).
- E-mail semanal, push e importação de histórico.
- Qualquer framework, build ou dependência.
- Criação da planilha da esposa e carga real (passo da entrega).

## Critério de pronto
- `node --test` passa com todos os casos de T2.
- O smoke test passa contra a implantação publicada.
- A planilha de teste tem as quatro abas, com a massa de teste gerada pelo painel, e o mês aparece como texto.
- No celular, o painel mostra a previsão com os dados reais, batendo com a conta à mão. Com o modo avião ligado, uma gravação fica na fila e é enviada quando a rede volta.
