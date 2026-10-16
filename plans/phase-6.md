# Plano: App de Contas — Fase 6 (Vou comprar)

## Contexto

Hoje o Posso comprar? só simula: a resposta mostra se cabe, mas a compra não entra na previsão. Ela precisa lembrar de somar a parcela na fatura de cada mês, e é aí que se perde nas parcelas.

O Fabiano decidiu que, quando a previsão permitir, a tela oferece **"Vou comprar"**:
- o app pergunta em qual cartão foi a compra;
- soma a parcela no valor daquele cartão em todos os meses da compra.

Em Ajustes, uma lista das últimas compras feitas assim permite desfazer, com confirmação.

**Ponto de partida:**
- `apps-script/Code.gs`: abas Contas, Lancamentos, Checkins e Config, com migração automática de colunas novas (Fase 5).
- `src/buy-view.js` e `src/screens/buy.js`: só simulam, com a primeira parcela sempre no mês seguinte.
- `src/store.js`: cache, fila e `saveEntries` otimista.
- `src/screens/settings.js`: contas, check-in, próximos meses e planilha.
- `docs/product.md`: "Só simula, não grava nada" e "gravar compras simuladas" em Fora do escopo. Os dois mudam neste PR do plano.

## Restrições

1. Todas as das fases anteriores continuam: sem build, sem npm, sem framework, nenhum segredo no repo, centavos no JS, mobile first, PT-BR na interface e código em inglês.
2. **Muda o backend:** aba nova, coluna nova e ação nova. É preciso publicar uma Nova versão do script (pausa 1). O backend novo continua aceitando o app antigo, e o app novo não manda `savePurchase` antes da T3.

## Decisões

- **Por que gravar agora não conta duas vezes:** a compra **soma no valor do mês** do cartão, em vez de virar uma linha à parte. Quando ela atualiza a fatura com o valor do app do banco (na tela Mês ou na revisão), o valor novo **substitui** o anterior, que já tinha a parcela. A regra antiga ("se o app gravasse, contaria duas vezes") valia para uma compra guardada separada da fatura.
- **"Vou comprar" só com "Pode comprar".** Com "Não pode", o botão não aparece.
- **Só cartões:** a conta ganha a opção "É cartão de crédito" (só para Conta, não para Entrada). A pergunta "Em qual cartão?" lista os cartões ativos na ordem das contas.
  - **Um toque lança:** cada cartão é um botão. Não há confirmação extra, porque dá para desfazer em Ajustes.
  - **Sem nenhum cartão marcado,** aparece "Marque quais contas são cartão em Ajustes." com o botão "Ir para Ajustes".
- **Meses:** os mesmos da simulação. A primeira parcela cai no mês seguinte, e são n meses.
  - Em cada mês, o lançamento do cartão vira **valor efetivo + parcela**. Mês estimado vira lançamento, e o "estimado" some. A marcação de pago fica como está.
- **Sem nome da compra.** A lista identifica a compra pelo valor, cartão, data e meses.
- **Depois de lançar:**
  - a faixa de aviso confirma: "Lançado no Nubank: 3 parcelas de R$ 150,00, de novembro a janeiro.";
  - o formulário volta ao início (valor vazio e 1x), para um novo "Ver" não parecer a mesma compra.
- **Ajustes → "Últimas compras":** as N compras mais recentes que não foram desfeitas.
  - N é configurável de 1 a 20, com padrão 5, no mesmo controle − n + do "Próximos meses".
  - Cada item: "R$ 150,00 × 3 · Nubank" e "Lançada em 15/10 · novembro a janeiro", com o botão "Desfazer".
  - Lista vazia: "Nenhuma compra lançada pelo Posso comprar?.".
- **Além do limite,** a compra some da lista, mas continua na aba Compras para consulta. Só não dá mais para desfazer pelo app.
- **Desfazer:**
  - **Confirmação com o valor:** "R$ 150,00 por mês será removido do Nubank, de novembro a janeiro." Com 1 parcela: "R$ 150,00 será removido do Nubank em novembro.".
  - **Mês que mudou depois da compra:** subtrai mesmo assim e avisa na mesma confirmação: "O valor de novembro mudou depois da compra. Confira depois." Com vários: "Os valores de novembro e dezembro mudaram depois da compra. Confira depois.".
  - **Nunca fica negativo:** se a subtração passar de zero, o mês fica em 0.
  - **Volta como era:** se o resultado for igual ao que o mês teria sem lançamento (o valor padrão, ou 0 sem padrão) e o item não estiver marcado como pago, o lançamento é apagado. O mês volta a "estimado", ou a "—".
  - **Depois de desfazer:** a compra sai da lista, e a faixa avisa "Compra desfeita.". Na planilha, a linha fica marcada com `desfeita_em`.
- **Compra e valores numa única chamada** (`savePurchase`), para nunca ficar só metade gravada. Os valores vão absolutos, calculados no aparelho (como o check da Fase 5). Reenviar a mesma operação dá o mesmo resultado.

## Regras

**Backend (`apps-script/Code.gs`):**
- **Contas** ganha `cartao` (caixa de seleção), que vira `isCard` na API.
  - Na planilha que já existe, a coluna entra sozinha (migração da Fase 5) e começa desmarcada.
  - `saveAccount` aceita `isCard` opcional:
    - ausente: mantém o que estava (o app antigo não apaga a marcação);
    - conta nova sem a chave: fica `false`;
    - conta de receita: grava sempre `false`.
- **Aba nova `Compras`,** criada sozinha:
  - colunas `id` (chave, texto), `data` (ISO), `conta_id`, `parcela` (money), `parcelas` (número), `primeiro_mes` (texto `YYYY-MM`) e `desfeita_em` (ISO ou vazio);
  - o GET devolve `purchases: [{ id, at, accountId, installment, count, firstMonth, undoneAt }]`.
- **Config** ganha `compras_na_lista` (padrão `5`), que vira `settings.purchaseListSize` e é aceita no `saveSettings` (inteiro de 1 a 20).
- **`POST { action: 'savePurchase', purchase, entries }`,** com lock, faz tudo numa vez:
  - valida a compra: `id` e `accountId` existentes, `installment` > 0, `count` de 1 a 24, `firstMonth`, `at` ISO e `undoneAt` ISO ou `null`;
  - grava a linha da compra (upsert por `id`, o que serve para lançar e para desfazer);
  - aplica `entries` com as mesmas regras do `saveEntries`, só que com `atualizado_em = undoneAt ?? at` em vez do relógio do servidor. Assim o app sabe quais mudanças vieram de uma compra.
- **`seed`** marca Nubank, Inter, Renner e C&A como cartão.
- **`scripts/smoke-test.sh`** ganha a ida e volta de `savePurchase` (lançar e desfazer) **só no `SMOKE_FULL=1`**. Linhas da aba Compras não se apagam pela API, então o modo padrão (que roda na planilha dela) não grava compra.

**Lógica (`src/purchases.js`, novo e puro):**
- `cardAccounts(data)`: contas ativas de despesa com `isCard`, na ordem.
- `buildPurchase(data, now, { id, accountId, installment, count })` devolve `{ purchase, entries, notice }`.
  - `firstMonth` é o mês seguinte ao atual. Cada um dos `count` meses vira `valor efetivo + installment`, sem `paidAt` (mantém a marcação).
  - O `notice` segue os textos das decisões: "Lançado no Nubank: R$ 150,00, em novembro." ou "Lançado no Nubank: 3 parcelas de R$ 150,00, de novembro a janeiro.".
- `recentPurchases(data, limit)`: as não desfeitas, da mais recente para a mais antiga, até `limit` (padrão 5). Cada item vem com os textos da lista prontos e com o nome do cartão; conta arquivada continua com o nome.
- `buildUndo(data, now, purchaseId)` devolve `{ purchase, entries, message, changedMonths }`.
  - **Novo valor de cada mês:** `max(0, valor efetivo − installment)`.
    - Vira `amount: null` quando é igual ao valor que o mês teria **sem lançamento** e o lançamento não tem `paidAt`. Esse valor é o `defaultAmount` numa conta ativa com padrão, e 0 nos outros casos.
    - Assim o mês volta a "estimado", ou a "—".
  - **Mês "mudou depois da compra":** o lançamento sumiu, ou o `updatedAt` dele é maior que o `at` da compra e não é o `at` nem o `undoneAt` de nenhuma compra.
  - O `message` é o texto da confirmação, com o aviso quando `changedMonths` não está vazio.
- **Nomes de mês:** os textos de meses usam o mesmo critério do `buy-view.js` ("janeiro" no mesmo ano; "janeiro de 2027" em outro ano).

**Store e API (`src/store.js`, `src/api.js`):**
- `api.savePurchase(purchase, entries)`.
- `store.savePurchase({ purchase, entries })` entra na fila como as outras operações.
  - **Otimista:** faz upsert em `data.purchases` por `id` e aplica `entries` como o `saveEntries`, com `updatedAt = undoneAt ?? at`.
- O `normalize` passa a ter `purchases: []`, e cache antigo sem a chave continua funcionando.
- `SETTINGS_KEYS` ganha `purchaseListSize`.

**Contas (`src/accounts.js`):** `newAccount` aceita `isCard` (só `true` em despesa).

## Tarefas

Cada tarefa vira um PR.
- **Paralelas:** T1 e T2, que mexem em arquivos diferentes.
- **Depois da T2:** T3 e T4, em paralelo, porque mexem em telas diferentes.
- **Em paralelo com a T3 e a T4:** T5.
- **Ordem de merge:** T1 → pausa 1 (Nova versão) → T2 → T3 e T4 → T5.

### T1. Backend (`apps-script/Code.gs`, `scripts/smoke-test.sh`)
- Conforme as regras: `cartao`, aba Compras, `compras_na_lista`, `savePurchase` e `seed`.
- **Teste no backend local do scratchpad** (o `Code.gs` real com mocks):
  - planilha antiga ganha `cartao` e a aba Compras sem perder dados;
  - `saveAccount` sem `isCard` mantém a marcação;
  - receita grava sempre `false`;
  - `savePurchase` grava a compra e os valores com `atualizado_em = at`;
  - desfazer atualiza `desfeita_em` sem duplicar a linha;
  - reenvio idêntico não duplica;
  - payload inválido não grava nada;
  - `seed` e `reset` funcionam.

### T2. Lógica + store + testes (`src/purchases.js`, `src/store.js`, `src/api.js`, `src/accounts.js`, `tests/purchases.test.js`, `tests/store.test.js`, `tests/accounts.test.js`)
- Conforme as regras.
- **Casos mínimos** (mês atual outubro; Nubank cartão com 1.000 em novembro e sem lançamento em dezembro; Unha com padrão 150; compra de 3 × 150 no Nubank):
  - lançar deixa Nubank com 1.150, 150 e 150 de novembro a janeiro, e outubro sem mudança;
  - lançar num cartão com valor padrão transforma o mês estimado em padrão + parcela;
  - desfazer logo em seguida volta a 1.000, e dezembro e janeiro ficam sem lançamento (estimado, ou "—");
  - desfazer depois de editar novembro para 1.300 deixa 1.150 e avisa novembro;
  - duas compras no mesmo cartão e mês: desfazer a primeira não avisa "mudou";
  - um valor menor que a parcela vira 0;
  - mês com `paidAt` mantém o lançamento e a marcação;
  - `recentPurchases` respeita o limite, ignora desfeitas e ordena;
  - `cardAccounts` ignora receita, arquivada e conta sem `isCard`;
  - **store:** otimista com reenvio, cache antigo sem `purchases` e `purchaseListSize` aceito.

### T3. Tela Posso comprar? (`src/screens/buy.js`, `styles/buy.css`)
- **Botão:** "Vou comprar" no cartão de "Pode comprar". O toque mostra, no próprio cartão, "Em qual cartão?" com um botão por cartão e "Cancelar". Sem cartão, aparece o texto com "Ir para Ajustes".
- **Lançar** grava pelo `store.savePurchase`, mostra o `notice` na faixa e limpa o formulário.
- **Roteiro** (Playwright no backend local com o `Code.gs` da T1, 360×800, claro e escuro, sem erros no console):
  - "Não pode" sem botão;
  - lançar com 1 e com 3 parcelas, conferindo o Mês de novembro a janeiro;
  - sem cartão, o botão leva a Ajustes;
  - recarregar mantém tudo, e a aba Compras mostra a linha.

### T4. Ajustes (`src/screens/settings.js`, `styles/settings.css`)
- **Na edição da conta,** "É cartão de crédito" (só com o tipo Conta). Na lista, cartões com a etiqueta "cartão".
- **Seção "Últimas compras"** com a lista, "Desfazer" (com `confirmDialog` usando o `message`, botão "Desfazer") e "Mostrar as últimas" com o − n +.
- **Roteiro:**
  - marcar e desmarcar cartão;
  - desfazer com e sem mês alterado (texto do aviso);
  - mudar o limite para 1 e voltar para 5;
  - a compra além do limite some da lista e continua na planilha.

### T5. Docs (`README.md`, `CLAUDE.md`)
- **README:**
  - "Como o app funciona" com o Vou comprar e as Últimas compras;
  - aba Compras e coluna `cartao`;
  - "Roteiro de conferência da Fase 6";
  - o passo da Nova versão.
- **CLAUDE.md:** Arquivos (`src/purchases.js`, `savePurchase`) e Status.

**Comum a T1, T3 e T4:** o backend local fica no scratchpad, nunca no repo. Os screenshots vão no PR.

## Pausas obrigatórias (ações manuais do Fabiano)
1. **Depois do merge da T1 e antes da T2,** publique a Nova versão do script (*Gerenciar implantações → Editar → Nova versão*, colando o `Code.gs` inteiro) na planilha de teste. Faça o mesmo na dela, se já existir.
   - Para conferir, depois da primeira chamada do app devem aparecer a aba Compras e a coluna `cartao` em Contas. A linha `compras_na_lista` da Config só entra numa planilha que já existe quando o limite for mudado em Ajustes (até lá o app usa 5).
2. **Depois do merge da T4,** marque os cartões em Ajustes ("É cartão de crédito"), na planilha de teste e, na entrega, na dela.
3. **No fim, no celular, com a planilha de teste:**
   - simular, tocar em "Vou comprar", escolher o cartão e ver os meses no Mês;
   - desfazer em Ajustes e ver os valores voltarem;
   - editar um mês e desfazer outra compra para ver o aviso.

## Fora do escopo desta fase
- Nome ou descrição da compra.
- Escolher o mês da primeira parcela (continua sendo sempre o mês seguinte).
- Lançar compra quando a resposta é "Não pode".
- Desfazer pela tela Posso comprar? ou desfazer só alguns meses.
- Editar uma compra lançada (para mudar, desfaz e lança de novo).

## Critério de pronto
- `node --test tests/*.test.js` passa com os casos da T2, e o smoke test passa nos dois modos (o completo só na planilha de teste).
- Os roteiros da T3 e da T4 rodam sem erros no console, com screenshots no PR.
- No celular, a pausa 3 completa sem surpresas.
