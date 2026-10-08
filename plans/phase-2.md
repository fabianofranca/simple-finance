# Plano: App de Contas — Fase 2 (telas Check-in e Mês)

## Contexto

A Fase 1 entregou abas, API, cache com fila de gravação (`src/store.js`) e cálculo testado (`src/forecast.js`). A Fase 2 entrega as primeiras telas de verdade, conforme `docs/product.md`: **Check-in** e **Mês** (com o bloco **Próximos meses**), num app que ela instala na tela inicial do celular. Por enquanto só o Fabiano testa, no celular dele, com a planilha de teste.

**Ponto de partida:** `index.html` + `src/main.js` + `styles.css` (painel de desenvolvimento), `src/config.js` (URL e chave em `contas-config`), `src/api.js`, `src/store.js` (`getData`, `refresh`, `save*`, `getQueueState`, `subscribe`, `retry`; cache em `sf.data` e `sf.queue`), `src/forecast.js` (`monthOf`, `addMonths`, `effectiveAmount`, `monthTotals`, `project`, `currentStatus`) e `apps-script/Code.gs` (`CONFIG_DEFAULTS` com `semanal`).

## Restrições

1. Todas as das Fases 0 e 1 continuam: sem build, sem npm, sem framework, nenhum segredo no repo, valores em centavos no JS, mês `YYYY-MM`, `node --test` nativo.
2. **Idioma:** interface e docs em PT-BR; código, identificadores e nomes de arquivos em inglês.
3. **Mobile first:** layout pensado para 360px de largura, toques ≥ 44px, dark mode (`prefers-color-scheme`), textos curtos. Mais humano, menos planilha.
4. **Lógica fora do DOM:** toda regra que dá para testar fica em módulo puro (sem DOM, sem `fetch`, sem relógio; `now`/`today` por parâmetro). As telas só montam HTML e chamam esses módulos.
5. **Datas:** "hoje" é o dia local do aparelho. `at` é ISO (UTC); para comparar dias, converter com `new Date(at)` e usar data local.
6. **Dinheiro na tela:** sempre pelo `src/money.js`. Pegadinha: o `Intl` põe um espaço não separável (U+00A0) entre "R$" e o número; os testes comparam com esse caractere.

## Decisões

- **`index.html` vira o app; o painel vai para `dev.html`** (com `src/main.js` renomeado para `src/dev.js` e o mesmo `styles.css`). Mesmo site, mesma origem: os dois compartilham `contas-config`, `sf.data` e `sf.queue`. O Fabiano gera a massa no `dev.html` e vê no `index.html`. Nenhum link do app aponta para o `dev.html`.
- **Estrutura do app:** `src/app.js` (roteador e casca), `src/screens/setup.js`, `src/screens/month.js`, `src/screens/checkin.js`; estilos em `styles/app.css` (tokens, botões, casca, configuração), `styles/month.css` e `styles/checkin.css`. Cada tela tem seus próprios arquivos para T4 e T5 rodarem em paralelo.
- **Contrato das telas:** cada módulo de tela exporta `mount(el, ctx)` e devolve uma função `unmount()`. `ctx = { store, now: () => new Date(), navigate(route), notify(text), params }`. A tela assina o `store.subscribe` sozinha e se desinscreve no `unmount`.
- **Rotas por hash:** `#mes` (mês atual), `#mes/YYYY-MM` e `#checkin`. A troca de mês usa `history.replaceState` (não empilha); abrir o check-in empilha, para o "voltar" do Android voltar ao Mês. Sem config salva, qualquer rota mostra a configuração.
- **Primeira abertura:** sem URL/chave, a tela de configuração pede URL e chave e tem "Salvar". Ao salvar, grava com `saveConfig`, chama `store.refresh()` e vai para `#mes`; em erro, mostra a mensagem em linguagem humana (mesmas dicas do painel para `network`, `unauthorized`, `bad_response`) e mantém os campos.
- **Aviso educativo na casca:** `ctx.notify(text)` mostra uma faixa no topo, acima da tela, com um "×" para dispensar. Fica só em memória (some ao recarregar). Assim a T5 dispara o aviso e a T4 não precisa saber dele.
- **Helper da tela Mês em módulo próprio, `src/month-view.js`**, e não no `forecast.js`: o `forecast.js` é a regra de cálculo do `product.md`, já testada e estável; o que a tela exibe por tipo de mês (rótulos, linhas, "—", arquivadas) é apresentação e muda com o produto. O `month-view.js` só chama o `forecast.js`.
- **Frequência padrão `diaria`** no backend; o frontend usa `daily` quando `settings.checkinFrequency` vier vazio.
- **Instalável:** `manifest.webmanifest` + ícones PNG gerados a partir de `icons/icon.svg`. Sem service worker.

## Regras do Check-in (`src/checkin.js`)

- **`shouldOpenCheckin(data, now)`:** sem nenhum check-in → `true`. `always` → `true`. `daily` → se o último check-in (maior `at`) não é de hoje (dia local). `weekly` → se `now − último.at ≥ 7 dias`. O app avalia ao abrir (depois de ter dados: cache ou primeiro `refresh`) e no `visibilitychange` para visível.
- **"Agora não":** com check-in anterior, a tela automática tem "Agora não", que suspende a abertura automática até o app ser recarregado (memória). Sem nenhum check-in não há "Agora não". Aberto à mão ("Conferir saldo"), o botão é "Voltar".
- **`checkinForm(data, now)`** devolve `{ month, balance, bills, income }`:
  - `balance`: saldo do último check-in (qualquer mês); sem check-in, `null` (campo vazio e obrigatório).
  - `bills`/`income`: `{ show, preset }`. Se algum check-in do mês atual tem `billsPaid: true`, `show: false`; idem `incomeReceived`. No primeiro check-in do mês, `preset: null` (sem seleção). Nos seguintes, `preset` = resposta do último check-in do mês (na prática, "Ainda não").
- **`canConfirm(form, answers)`:** saldo válido e cada linha visível respondida.
- **`buildCheckin(data, now, { balance, billsPaid, incomeReceived })`:** devolve `{ at: now ISO, month: monthOf(now), balance, billsPaid, incomeReceived, projectedBalance }`. Linha escondida grava `true`. `projectedBalance` = `currentStatus` com o check-in novo acrescentado aos dados (`endOfMonth`), a mesma fórmula do forecast.
- **`dropNotice(data, checkin)`:** compara com o check-in anterior mais recente do mesmo mês; se a nova `projectedBalance` for menor, devolve `{ month, drop, since }` e o texto "Sua sobra de outubro caiu R$ 120,00 desde 03/10" (`since` em `dd/mm`, dia local). Senão `null`.

## Regras da tela Mês (`src/month-view.js`)

- `monthLabel('2026-10')` → "outubro de 2026" e `monthName` → "outubro", via `Intl.DateTimeFormat('pt-BR')`.
- `navRange(current)` → `{ min: current − 12, max: current + 12 }`; setas desabilitadas nos limites; rota fora da faixa cai no mês atual.
- `monthView(data, today, month)` devolve `kind` (`past`/`current`/`future`) e:
  - atual: `{ balance, toPay, endOfMonth }` de `currentStatus` (Na conta, Falta pagar, Sobra no fim do mês) e `upcoming` = `project(data, today, horizonMonths)` com rótulo e `negative`;
  - futuro: `{ income, expense }` de `monthTotals` (Entra, Sai) e `endOfMonth` do `project` até aquele mês (Sobra prevista no fim do mês);
  - passado: `{ income, expense }` (Entrou, Saiu), sem sobra.
- `rows: { income: [...], expense: [...] }`, ordenadas por `order`, cada uma `{ accountId, name, amount, estimated, empty, hasDefault }`. Conta ativa sempre aparece; arquivada só com lançamento no mês. Sem lançamento e sem padrão: `empty: true` (a tela mostra "—").

## Tarefas

Cada tarefa vira um PR. **T1, T2 e T3 começam em paralelo.** T4 e T5 dependem de T1 e T2 e rodam em paralelo entre si, cada uma nos seus arquivos; só a T5 mexe em `src/app.js` (ligar a abertura automática). T6 vem por último.

### T1. Estrutura do app
- `git mv index.html dev.html` e `git mv src/main.js src/dev.js`, ajustando só o `<script>` e o título ("Contas · painel de desenvolvimento"). Comportamento idêntico.
- `index.html` novo: `<main id="app">`, faixa de aviso, metas de viewport, `theme-color` (claro/escuro), `manifest`, `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` = "Contas" e `apple-mobile-web-app-status-bar-style` = `default`. Linka `styles/app.css`, `styles/month.css` e `styles/checkin.css` (os dois últimos vazios).
- `src/app.js`: roteador por hash, contrato `mount/unmount`, `notify`, tela de configuração (`src/screens/setup.js`), `store.refresh()` ao abrir e no `visibilitychange` (erro de refresh não derruba a tela: segue com o cache). Importa `src/screens/month.js` e `src/screens/checkin.js` como stubs que mostram só o título.
- `manifest.webmanifest`: `name`/`short_name` "Contas", `display: standalone`, `start_url: "./"` e `scope: "./"` (funciona em `…github.io/simple-finance/`), `theme_color` e `background_color` dos tokens, ícones 192 e 512 (`purpose: any`). Ícones em `icons/`: `icon.svg` (fonte, versionada), `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180). PNGs gerados por um script no scratchpad, com o Chromium do container (Playwright, `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); nenhum script ou dependência nova no repo.
- **Aceite:** `dev.html` funciona como antes; `index.html` sem config mostra a configuração e, com config, navega entre `#mes` e `#checkin` sem erros no console; o manifest passa sem avisos no painel *Application* do Chromium.

### T2. Lógica pura + testes
- `src/money.js`: `formatMoney(cents)` → "R$ 1.234,56" (negativo "-R$ 50,00"); `formatInput(cents)` → "1.234,56" (para pré-preencher); `parseMoney(text, { allowNegative })` → centavos ou `null`. Aceita "1.234,56", "1234,5", "R$ 1.234,56", "1234" e, sem vírgula, um ponto seguido de 1 ou 2 dígitos como decimal ("12.5"); vazio ou lixo → `null`.
- `src/checkin.js` e `src/month-view.js` como nas seções de regras acima.
- Testes: `tests/money.test.js`, `tests/checkin.test.js`, `tests/month-view.test.js`. Casos mínimos: os formatos de `parseMoney` e ida e volta com `formatMoney`; as quatro frequências, incluindo a virada do dia local e 6 vs. 7 dias; linhas escondidas após "sim" no mês e de volta no mês seguinte; primeiro check-in do mês sem pré-seleção, seguintes pré-selecionados; payload com `projectedBalance` batendo com o `currentStatus`; aviso só quando a sobra cai; os três tipos de mês com uma massa equivalente à do `seed` (sobra R$ 850 e próximos R$ 1.600, R$ 1.700 e R$ 50); arquivada com e sem lançamento; "—"; limites de ±12 meses.
- **Aceite:** `node --test` passa, sem warnings.

### T3. Backend: padrão diário
- `CONFIG_DEFAULTS`: `frequencia_checkin` = `diaria`, e o fallback da leitura da `Config` (hoje `|| 'semanal'`) também passa a `diaria`. Comentário do topo atualizado.
- **Aceite:** diff restrito a isso; `reset` restaura `diaria`.

### T4. Tela Mês (`src/screens/month.js` + `styles/month.css`)
- Cabeçalho ‹ outubro de 2026 ›; topo conforme o tipo de mês; "Próximos meses" só no mês atual, negativo em vermelho, cada mês tocável (navega até ele).
- Seções "Entradas" e "Contas": nome à esquerda, valor à direita; estimado em cinza com o rótulo "estimado"; "—" sem valor.
- Toque no valor abre um `<dialog>` com o nome da conta e do mês, campo de dinheiro (`inputmode="decimal"`), "Salvar" e "Cancelar"; se a conta tem padrão, "Usar o valor padrão" (`amount: null`). Grava com `store.saveEntries([{ accountId, month, amount }])` e a tela atualiza na hora (otimista).
- Linha de estado discreta a partir de `getQueueState()`: enviando → "Salvando…"; pendente aguardando nova tentativa → "Sem internet, vou tentar de novo"; erro → "Não consegui salvar." + "Tentar de novo" (`store.retry()`); tudo salvo → nada.
- Botão discreto "Conferir saldo" → `#checkin`.
- **Aceite:** roteiro abaixo.

### T5. Tela Check-in (`src/screens/checkin.js` + `styles/checkin.css` + abertura automática em `src/app.js`)
- Layout do `product.md`: "Como está outubro?", "Na conta" (campo pt-BR, `inputmode="decimal"`, aceita negativo), linhas "Contas de outubro" [Já paguei] [Ainda não] e "Salário de outubro" [Já caiu] [Ainda não] como pares de botões grandes (`aria-pressed`), "Confirmar" desabilitado até `canConfirm`.
- Confirmar: `store.saveCheckin(buildCheckin(...))`, `ctx.notify` se houver `dropNotice`, e `navigate('#mes')`.
- Em `src/app.js`: `shouldOpenCheckin` ao abrir e no `visibilitychange`; "Agora não" conforme as regras.
- **Aceite:** roteiro abaixo.

**Roteiro de aceite de T4 e T5:** o agente monta, **no scratchpad e nunca no repo**, um backend local que carrega o `Code.gs` real com mocks de `SpreadsheetApp`, `LockService`, `PropertiesService` e `ContentService` e serve o site, e roda um roteiro no Playwright (Chromium 360×800, claro e escuro): configurar, `seed`, primeiro check-in do mês (Confirmar travado até responder), editar um valor e ver a sobra mudar, "Usar o valor padrão", navegar ±12 meses, tocar num mês de "Próximos meses", novo check-in com sobra menor (aviso aparece e some no "×"), modo offline (estado "Sem internet…" e envio quando volta). Zero erros no console; screenshots anexados ao PR.

### T6. README + CLAUDE.md
- README: o app em `index.html` e o painel em `dev.html`; "Adicionar à tela de início" (Android e iOS); roteiro de conferência da Fase 2; como regenerar os ícones a partir do SVG.
- CLAUDE.md: seção Arquivos (`dev.html`, `src/dev.js`, `src/app.js`, `src/screens/`, `src/money.js`, `src/checkin.js`, `src/month-view.js`, `styles/`, `icons/`, `manifest.webmanifest`) e Status.

## Pausas obrigatórias (ações manuais do Fabiano)
1. **Depois de T3:** colar o `Code.gs` inteiro e publicar em *Gerenciar implantações → Editar → Nova versão*. A planilha de teste continua com `semanal` (o padrão só vale para linha nova): para pegar o diário, rodar "Apagar tudo" e "Gerar massa de teste" no `dev.html`, ou trocar a `Config` à mão para `diaria`.
2. **No fim:** no celular, abrir o site, configurar URL e chave, "Adicionar à tela de início", abrir pelo ícone (sem barra do navegador), fazer o primeiro check-in do mês, editar um valor e ver a previsão mudar, ligar o modo avião, editar de novo e ver o estado "Sem internet…" e o envio quando a rede volta. Conferir que o `dev.html` continua funcionando.

## Fora do escopo desta fase
- Posso comprar?, Ajustes, barra inferior, atualização semanal guiada e lembrete (Fase 3).
- Link de configuração (URL e chave num link) e planilha da esposa: passo da entrega.
- Service worker e HTML offline (o cache de dados já existe).
- Qualquer framework, build ou dependência.

## Critério de pronto
- `node --test` passa com os casos de T2.
- Roteiros de T4 e T5 sem erros no console, com screenshots nos PRs.
- No celular, o app abre pelo ícone, o check-in abre sozinho uma vez por dia, e a sobra bate com o painel do `dev.html`.
- Com o modo avião, a edição fica na fila e é enviada quando a rede volta.
