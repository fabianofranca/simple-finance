# Plano: App de Contas — Fase 3 (Posso comprar?, revisão semanal, Ajustes, barra inferior e lembrete)

## Contexto

A Fase 2 entregou o app instalável com as telas Check-in e Mês. A Fase 3 completa o produto descrito em `docs/product.md`: **Posso comprar?**, **revisão semanal guiada**, **Ajustes**, **barra inferior** e **lembrete**. Continua só o Fabiano testando, com a planilha de teste. A entrega para a esposa (planilha dela, link de configuração e carga real) é o passo seguinte, fora desta fase.

**Ponto de partida:** `src/app.js` (roteador por hash, `navigate(route, { replace })`, `back()`, `notify`, `maybeOpenCheckin`, contrato `mount(el, ctx)` → `unmount()`), `src/screens/{setup,month,checkin}.js`, `src/store.js` (`saveAccount` com id por `crypto.randomUUID()`, `saveEntries`, `saveSettings`, `getQueueState`, `retry`, `discardPending`), `src/forecast.js` (`canBuy`, `project`, `effectiveAmount`), `src/month-view.js` (`monthName`, `monthLabel`), `src/money.js`, `src/config.js` (`loadConfig`, `saveConfig`, `clearConfig`).

## Restrições

1. Todas as das fases anteriores continuam: sem build, sem npm, sem framework, nenhum segredo no repo, centavos no JS, mês `YYYY-MM`, `node --test` nativo, mobile first (360px, toques ≥ 44px, dark mode), dinheiro sempre pelo `src/money.js`.
2. **Idioma:** interface e docs em PT-BR; código, identificadores e nomes de arquivos em inglês.
3. **Lógica fora do DOM:** regra testável fica em módulo puro (sem DOM, sem `fetch`, sem relógio; `now`/`today` por parâmetro).
4. **Sem mudança de backend.** Conferido no `Code.gs`: `saveAccount` faz upsert por `id` com `name`, `type`, `defaultAmount`, `order` e `active` (cobre criar, renomear, tipo, padrão, ordem, arquivar e reativar); `saveEntries` grava a revisão; `saveSettings` aceita `checkinFrequency`, `horizonMonths` (inteiro ≥ 1) e `lastReviewAt` (texto ISO ou `null`, coluna `valor` em formato texto). Nenhuma implantação nesta fase.

## Decisões

- **Rotas novas:** `#comprar`, `#ajustes` e `#revisao`. O `src/app.js` passa a ter uma tabela de rotas `{ name → { screen, tab } }`; `tab` é `mes`, `comprar`, `ajustes` ou `null` (Check-in, Revisão e configuração).
- **Barra inferior na casca:** `<nav id="tabbar">` no `index.html`, fora do `<main>`, com três botões (Mês · Posso comprar? · Ajustes). O `render()` mostra a barra só quando `tab` não é `null` e marca o ativo com `aria-current="page"`. A troca usa `navigate(route, { replace: true })`; tocar em "Mês" estando em `#mes/YYYY-MM` volta ao mês atual. Barra fixa embaixo, `padding-bottom: env(safe-area-inset-bottom)`, e o `#app` ganha espaço extra embaixo quando a barra aparece (classe no `body`).
- **Helpers de DOM compartilhados:** a T1 move `h()`, `money()` e `queueLine(store)` de `src/screens/month.js` para `src/screens/ui.js`, junto com um `confirmDialog(text, okLabel)` (Promise com `<dialog>`, sem `window.confirm`). Assim T3, T4 e T5 usam o mesmo estado de gravação sem mexer uns nos arquivos dos outros.
- **Módulos puros novos:** `src/review.js` (perguntas, textos, lembrete, antes/depois), `src/buy-view.js` (o que a tela Posso comprar exibe, só chamando `canBuy`) e `src/accounts.js` (ordem, reordenar, nova conta, arquivar/reativar). Mesmo motivo do `month-view.js`: o `forecast.js` é a regra de cálculo, estável; o resto é apresentação.
- **Check-in automático não interrompe a revisão:** `maybeOpenCheckin` também não abre com `#revisao` na tela.
- **Trocar planilha** precisa limpar o cache, senão os dados e a fila da planilha antiga iriam para a nova: a T5 acrescenta `store.clear()` (zera dados e fila em memória e no storage, cancela o timer) com teste em `tests/store.test.js`, e apaga `sf.snooze`.

## Regras

**Revisão (`src/review.js`):**
- `reviewQuestions(data, today)` → `{ month, items }`: `month` = mês corrente do cálculo + 1; `items` = contas **de despesa ativas**, ordenadas por `order` (empate pelo nome), cada uma `{ accountId, name, amount, estimated, kind }` via `effectiveAmount`. `kind: 'confirm'` com lançamento ou padrão; `kind: 'ask'` sem nenhum dos dois. Receitas ficam de fora.
- `questionText(item, month)` → `{ title, question }`. Título "Nubank · novembro". `confirm`: "Ainda está em R$ 1.000,00?" [Sim] [Mudou]; estimado: "Pelo valor padrão, deve ficar em R$ 150,00 (estimado). Continua assim?" [Sim] [Mudou]. `ask`: "Já sabe quanto vai ser em novembro?" [Ainda não sei] [Informar]. Todas com "Pular". Progresso "2 de 5".
- `monthEnd(data, today, month)`: sobra prevista no fim de `month` (via `project`). `reviewDone(month, before, after)`: "Pronto! Sua sobra de novembro ficou em R$ 1.400,00 (antes R$ 1.600,00)"; igual: "Pronto! Sua sobra de novembro continua em R$ 1.600,00".
- `daysSince(iso, now)`: diferença em dias de calendário local; ISO inválido conta como nulo.
- `reminder(settings, now)`: `lastReviewAt` nulo/inválido → "Que tal revisar as contas do mês que vem?"; 7 dias ou mais → "Faz 9 dias que você não revisa as contas."; senão `null`.
- Lista vazia (nenhuma conta de despesa ativa) vai direto ao fim.

**Posso comprar? (`src/buy-view.js`):** `buyView(data, today, { installment, count })` chama `canBuy` com o horizonte das settings (padrão 3) e devolve `{ ok, headline, detail, warning, range, rows }`: `headline` "Pode comprar" ou "Não pode"; `detail` "Em janeiro fica faltando R$ 250,00" (só no "Não pode"); `warning` "Mesmo sem essa compra, janeiro já fica negativo (faltam R$ 50,00)." quando `alreadyNegative`; `range` "3 parcelas de R$ 100,00, de novembro a janeiro" (1 parcela: "1 parcela de R$ 100,00, em novembro"); `rows` `[{ month, label, before, after, negative }]` dos H meses. Mês de outro ano usa `monthLabel` ("janeiro de 2027") no `detail`, no `warning` e no `range`; nas linhas, `monthName`. Entrada inválida (`parseMoney` nulo ou ≤ 0, parcelas fora de 1 a 24) não chama `canBuy`.

**Contas (`src/accounts.js`):** `activeAccounts`/`archivedAccounts` (ordenadas); `nextOrder(accounts)` = maior `order` de todas (arquivadas inclusive) + 1, ou 1; `newAccount({ name, type, defaultAmount }, accounts)` → sem `id`, `active: true`, nome aparado e obrigatório; `move(accounts, id, dir)` → lista das contas alteradas (troca o `order` com a vizinha ativa; se houver `order` repetido entre as ativas, renumera as ativas 1..n); `archive`/`reactivate` → a conta com `active` trocado, mantendo o `order`.

**Conexão:** `shortUrl(url)` em `src/config.js` → "script.google.com · …últimos 6 caracteres do id" (URL estranha: o host).

## Tarefas

Cada tarefa vira um PR. **T1 e T2 começam em paralelo.** T3, T4 e T5 dependem de T1 e T2 e rodam em paralelo entre si, cada uma nos seus arquivos (só a T4 mexe em `src/screens/month.js`; só a T5 em `src/store.js`). T6 por último.

### T1. Casca e barra inferior
- `index.html`: `<nav id="tabbar">` e links para `styles/buy.css`, `styles/review.css`, `styles/settings.css` (vazios). `styles/app.css`: barra, item ativo e espaço extra embaixo.
- `src/app.js`: tabela de rotas, barra, `#revisao` fora do check-in automático. Stubs `src/screens/{buy,review,settings}.js` só com o título.
- `src/screens/ui.js` com `h`, `money`, `queueLine`, `confirmDialog`; `month.js` passa a importar dele, sem mudar o comportamento.
- **Aceite:** navega pela barra entre as três telas sem empilhar histórico; barra some no Check-in, na Revisão e na configuração; a tela Mês segue igual; zero erros no console.

### T2. Lógica pura + testes
- `src/review.js`, `src/buy-view.js`, `src/accounts.js` e `shortUrl` conforme as regras; testes em `tests/review.test.js`, `tests/buy-view.test.js`, `tests/accounts.test.js`, `tests/config.test.js`.
- Casos mínimos: com a massa do `seed`, perguntas de novembro na ordem (Nubank 1.000, Inter 600, Renner 300, C&A 200, Unha 150 estimado) e salário de fora; conta sem valor vira `ask`; arquivada fora; antes/depois mudando e igual; lembrete com nulo, ISO inválido, 6 e 7 dias (aparece com 7), virada do dia local; todos os casos de "Posso comprar?" do roteiro da T3; `move` no topo/fim e com `order` repetido; `nextOrder` contando arquivadas.
- **Aceite:** `node --test` passa, sem warnings.

### T3. Posso comprar? (`src/screens/buy.js` + `styles/buy.css`)
- Título "Posso comprar?"; "Valor da parcela" (`inputmode="decimal"`); "Parcelas" com stepper − n + (1 a 24, padrão 1, botões de 44px); "Ver". Erro em linguagem humana para valor inválido. Mudar um campo esconde a resposta anterior.
- Resposta: `warning` (se houver) antes; `headline` grande (verde/vermelho, sem depender só da cor), `detail`, `range`; lista "mês · antes → depois", negativo em vermelho. Não grava nada.
- **Roteiro** (massa do `seed`, relógio em outubro de 2026; sobras sem compra: novembro R$ 1.600,00, dezembro R$ 1.700,00, janeiro R$ 50,00):
  - R$ 10,00 × 3 → **Pode comprar**; 1.590,00 / 1.680,00 / 20,00.
  - R$ 50,00 × 1 → **Pode comprar**; 1.550,00 / 1.650,00 / 0,00 (zero não é negativo).
  - R$ 50,01 × 1 → **Não pode**: em janeiro fica faltando R$ 0,01.
  - R$ 100,00 × 3 → **Não pode**: em janeiro fica faltando R$ 250,00; 1.500,00 / 1.500,00 / -250,00.
  - R$ 10,00 × 6 → **Pode comprar** (confere até abril; lista só os 3 meses).
  - Horizonte 1 (POST `saveSettings` direto no backend local): R$ 100,00 × 3 → lista só novembro (1.600,00 → 1.500,00) e **Não pode** em janeiro, R$ 250,00, além do horizonte.
  - Janeiro negativo antes (Nubank de janeiro 2.000 → 2.100 pela tela Mês): R$ 10,00 × 1 → aviso "já fica negativo (faltam R$ 50,00)" e **Não pode**, faltando R$ 60,00.

### T4. Revisão semanal + lembrete (`src/screens/review.js` + `styles/review.css` + `src/screens/month.js` + `styles/month.css`)
- Tela `#revisao`: no início guarda `before = monthEnd(...)` e a lista; uma pergunta por vez com progresso e "Sair" (`ctx.back()`). "Sim", "Pular" e "Ainda não sei" avançam sem gravar. "Mudou"/"Informar" abre o campo de dinheiro (pré-preenchido no "Mudou") com [Salvar] e [Cancelar]; Salvar grava na hora (`store.saveEntries`) e avança. Linha de estado (`queueLine`) sempre visível.
- Fim: texto de `reviewDone`, `store.saveSettings({ lastReviewAt: now ISO })` e "Ver os próximos meses" → `navigate('#mes', { replace: true })`. Sair no meio não grava `lastReviewAt`.
- Tela Mês: faixa do `reminder` no topo com [Revisar agora] → `#revisao` (empilha); botão "Revisar valores" no rodapé, ao lado de "Atualizar saldo de outubro".
- **Roteiro:** após o `seed` a faixa diz "Que tal revisar…"; 5 perguntas de novembro, Unha como estimado; "Mudou" no Nubank para 1.200,00, "Sim" no resto → "Pronto! Sua sobra de novembro ficou em R$ 1.400,00 (antes R$ 1.600,00)" e a faixa some; nova revisão só com "Sim" → "continua em R$ 1.400,00"; sair no meio após um Salvar mantém o valor e a faixa; conta "Farmácia" sem padrão (POST `saveAccount` no backend local) aparece como "Já sabe quanto vai ser em novembro?"; `lastReviewAt` de 9 dias atrás → "Faz 9 dias…".

### T5. Ajustes (`src/screens/settings.js` + `styles/settings.css` + `store.clear()`)
- **Contas:** ativas na ordem com nome, "Conta"/"Entrada" e padrão (ou "sem valor padrão"); toque abre `<dialog>` com nome, tipo (dois botões), valor padrão opcional, Salvar/Cancelar e "Arquivar" (com `confirmDialog`: "O histórico continua guardado."). Setas ↑↓ (desabilitadas nas pontas, `aria-label` com o nome). "Nova conta" no mesmo diálogo. "Arquivadas (n)" em `<details>` fechado, com "Reativar".
- **Check-in:** três botões "Toda vez" / "1x por dia" / "1x por semana" (`aria-pressed`). **Próximos meses:** stepper 1 a 12. Cada toque grava pelo `store`.
- **Conexão:** `shortUrl` e "Trocar planilha" (`confirmDialog`; com fila pendente avisa que alterações não enviadas serão perdidas) → `clearConfig()`, `store.clear()`, configuração.
- `queueLine` no topo, como na tela Mês.
- **Roteiro:** criar "Farmácia" (Conta, R$ 80,00) e vê-la no fim do Mês; subir com ↑ e ver a ordem no Mês; editar nome e padrão; arquivar (some do Mês e da revisão) e reativar; frequência "1x por semana" e horizonte 5 → "Próximos meses" com 5 itens; trocar planilha volta à configuração sem dados antigos.

**Comum a T3–T5:** o agente monta, **no scratchpad e nunca no repo**, o backend local que carrega o `Code.gs` real com mocks (como na Fase 2) e roda o roteiro no Playwright (Chromium 360×800, claro e escuro, com `seed`), zero erros no console, screenshots anexados ao PR.

### T6. README + CLAUDE.md
- README: telas novas, roteiro de conferência da Fase 3, como forçar o lembrete.
- CLAUDE.md: Arquivos (`src/review.js`, `src/buy-view.js`, `src/accounts.js`, telas e CSS novos, `src/screens/ui.js`, rotas) e Status.

## Pausas obrigatórias (ações manuais do Fabiano)
1. **Nenhuma implantação de backend** nesta fase.
2. **No fim, no celular:** navegar pela barra; "Posso comprar?" com um caso que pode e um que não pode; revisão mudando uma fatura e vendo o antes e depois; forçar o lembrete apagando `ultima_revisao` na `Config` ou digitando uma data antiga em ISO (ex.: `2026-09-20T12:00:00Z`) e reabrindo o app; em Ajustes, criar, reordenar, arquivar e reativar uma conta, mudar frequência e horizonte e ver o efeito no Mês.

## Fora do escopo desta fase
- E-mail ou push do lembrete; gravar compras simuladas; categorias; importação de histórico.
- Planilha da esposa, link de configuração e carga real (passo da entrega).
- Voltar para a pergunta anterior na revisão; excluir conta de vez.
- Qualquer framework, build ou dependência.

## Critério de pronto
- `node --test` passa com os casos de T2 e o `store.clear()`.
- Roteiros de T3, T4 e T5 sem erros no console, com screenshots nos PRs.
- No celular, a pausa 2 completa sem surpresas, e os números do Posso comprar batem com a tela Mês.
