# Plano: App de Contas — Fase 5 (marcação de pago por item)

## Contexto

O Fabiano decidiu mudar um conceito: cada item passa a ter marcação de pago (nas Contas) ou de recebido (nas Entradas).
- **Tela Mês:** um check simples por linha.
- **"Atualizar saldo":** fica só com o valor "Na conta". Saem as perguntas "Já paguei / Já caiu".
- **Switches "Recebi" e "Paguei"** das seções (Fase 4): saem, porque o check por item substitui os dois.

Isso também resolve o erro conservador que tínhamos aceitado: hoje, enquanto ela não diz "Já paguei", **todas** as contas do mês contam como pendentes. Com o check por item, o pagamento parcial entra certo.

A Fase 5 vem antes da sessão de carga com ela, porque muda o uso do dia a dia.

**Ponto de partida:**
- `apps-script/Code.gs`: aba Lancamentos com `conta_id`, `mes`, `valor` e `atualizado_em`; aba Checkins com `contas_pagas` e `salario_caiu`.
- `src/forecast.js`: `currentStatus`, `endBalances`, `monthTotals`, `effectiveAmount` e `monthFlags`.
- `src/checkin.js`: `checkinForm`, `buildCheckin`, `buildToggle` e `toggleNotice`.
- `src/store.js`: no `saveEntries` otimista, a linha é trocada inteira.
- `src/screens/month.js`: os switches.
- `src/screens/checkin.js`: as perguntas.
- `src/app.js`: as rotas `#checkin/paguei` e `#checkin/recebi`.

## Restrições

1. Todas as das fases anteriores continuam: sem build, sem npm, sem framework, nenhum segredo no repo, centavos no JS, mobile first, PT-BR na interface e código em inglês.
2. **Muda o backend.** A aba Lancamentos ganha colunas, e é preciso publicar uma Nova versão do script (pausa 1). O backend novo continua aceitando o app antigo.

## Decisões

- **Check por item, só no mês atual,** à esquerda do nome em cada linha. Em Contas quer dizer "pago"; em Entradas, "recebido".
  - É um `role="checkbox"` com `aria-checked`, toque ≥ 44px e um ✓ visível, para não depender só da cor.
  - A linha marcada fica com o valor em tom mais apagado.
  - Tocar no valor continua abrindo a edição.
  - Meses passados e futuros não têm check.
- **O check é um toque só e nunca muda a sobra.** Ele passa o valor de "Falta pagar" (ou "Falta receber") para "Na conta", como os switches da Fase 4.
  - Se o valor era estimado, vira lançamento e o "estimado" some.
  - Desmarcar devolve o item para "Falta pagar" (ou "Falta receber").
  - Uma confirmação curta aparece: "Nubank pago: − R$ 900,00 na conta.", "Salário recebido: + R$ 3.000,00 na conta." ou "Nubank desmarcado.".
- **"Atualizar saldo" só com o saldo:** "Como está outubro?", o campo "Na conta" (preenchido com o saldo que o cartão mostra) e "Confirmar".
  - Saem as perguntas e as rotas `#checkin/paguei` e `#checkin/recebi`.
  - O resto continua: abertura automática, "Agora não", aviso "sobra caiu" e primeiro uso.
- **Como o "Na conta" acompanha os checks sem criar check-ins:** cada item marcado guarda **quando** foi marcado (`paidAt`). O "Na conta" é o último saldo informado (`S`), mais as entradas marcadas depois dele, menos as contas marcadas depois dele.
  - Quando ela informa um saldo novo, ele já inclui o que foi pago antes, e as marcações antigas deixam de mexer no "Na conta".
  - **Por que não gravar um check-in a cada check:** com "1x por dia", qualquer check contaria como o saldo do dia, e o app pararia de perguntar o saldo real. Esse saldo é o que capta os gastos do dia a dia, que ela não lança.
- **Erro aceito, conservador:** se ela pagar no banco, atualizar o saldo e só depois marcar o item, o valor é descontado duas vezes e a sobra aparece menor. O próximo "Atualizar saldo" corrige.
- **Sem migração.** As marcações antigas do mês (`contas_pagas` e `salario_caiu` nos check-ins) são ignoradas, e os itens começam sem check. As colunas antigas ficam na planilha e o app novo grava `false` nelas.

## Regras

**Backend (`apps-script/Code.gs`):**
- A aba Lancamentos ganha `pago` (caixa de seleção) e `pago_em` (texto ISO).
- Numa planilha que já existe, as colunas que faltam entram no fim do cabeçalho na primeira chamada. Isso vale para a de teste e para a dela, se já tiver sido criada.
- O GET devolve `paidAt` (ISO ou `null`) em cada lançamento.
- O `saveEntries` aceita `paidAt` opcional em cada item:
  - **chave presente:** grava `pago = paidAt !== null` e `pago_em = paidAt ?? ''`;
  - **chave ausente:** mantém o que estava, então editar o valor não apaga a marcação;
  - **lançamento novo sem a chave:** fica sem marcação.
- `seed` e `reset` continuam funcionando com as colunas novas.
- `scripts/smoke-test.sh` ganha a ida e volta de `paidAt` no modo padrão (não destrutivo).

**Lógica (`src/forecast.js`, puro):**
- `pendingTotals(data, month)` devolve `{ income, expense }` com a soma dos valores efetivos dos itens **sem** `paidAt` no mês. Item estimado, sem lançamento, conta como não marcado.
- `effectiveBalance(data, base)` devolve `S`, mais os valores dos lançamentos de receita com `paidAt > base.at`, menos os de despesa com `paidAt > base.at`. Sem check-in, `S = 0` e `at = ''`.
- Cálculo da sobra:
  - `Sobra(A) = effectiveBalance + pendingTotals(A).income − pendingTotals(A).expense`;
  - para k ≥ 1, `Sobra(A+k) = Sobra(A+k−1) + pendingTotals(A+k).income − pendingTotals(A+k).expense`.
- `currentStatus` devolve:
  - `balance = effectiveBalance`;
  - `toReceive` e `toPay` iguais ao `pendingTotals` do mês corrente;
  - `endOfMonth`.
  - Com o último check-in no mês atual, o cartão fecha.
- O Posso comprar? e a revisão usam o mesmo `project`, então funcionam sem mudança.
- Saem `monthFlags`, `buildToggle`, `toggleNotice` e as linhas de pergunta do check-in (`lineOf`).
  - `checkinForm`, `canConfirm` e `buildCheckin` passam a tratar só o saldo e gravam `billsPaid: false` e `incomeReceived: false`.
  - O campo "Na conta" vem preenchido com o `effectiveBalance`.
- `buildPaid(data, now, { accountId, paid })` devolve `{ entries, notice }`.
  - `entries` tem um item: `{ accountId, month: mês corrente, amount: valor efetivo, paidAt: paid ? now ISO : null }`.
  - `notice` usa os textos das decisões; com valor 0, devolve `null`.
- `month-view.js`: cada linha do mês corrente ganha `paid` (boolean).

**Store (`src/store.js`):** no `saveEntries` otimista, `paidAt` ausente mantém o valor anterior da linha, e `paidAt` presente substitui. O `amount: null` continua apagando o lançamento.

**Tela (`src/screens/month.js`):** "Usar o valor padrão" num item marcado grava `amount = valor padrão` (mantém o lançamento e a marcação), em vez de apagar.

## Tarefas

Cada tarefa vira um PR.
- **Paralelas:** T1 e T2, que mexem em arquivos diferentes.
- **Depois das duas:** T3.
- **Em paralelo com a T3:** T4.
- **Ordem de merge:** T1 → pausa 1 (Nova versão) → T2 → T3, **logo em seguida** (sem a T3, a tela usa funções que a T2 removeu) → T4.

### T1. Backend (`apps-script/Code.gs`, `scripts/smoke-test.sh`)
- Colunas novas, migração do cabeçalho, `paidAt` no GET e no `saveEntries` conforme as regras.
- **Teste no backend local do scratchpad** (o `Code.gs` real com mocks):
  - planilha antiga sem as colunas ganha as duas no fim, sem perder dados;
  - ida e volta de `paidAt`;
  - `saveEntries` sem `paidAt` mantém a marcação;
  - `null` desmarca;
  - `seed` e `reset` continuam funcionando.

### T2. Lógica + testes (`src/forecast.js`, `src/month-view.js`, `src/checkin.js`, `src/store.js` e os testes deles)
- Conforme as regras. Os testes antigos que usam `billsPaid`/`incomeReceived` passam a usar `paidAt` nos lançamentos.
- Casos mínimos (S = 500; Salário 3.000 estimado; Nubank 900, Inter 600, Renner 300 e C&A 200 lançados; Unha 150 estimada; sobra 1.350):
  - marcar o Salário deixa Na conta 3.500, Falta receber 0 e sobra 1.350;
  - marcar o Nubank deixa Na conta 2.600, Falta pagar 1.250 e sobra 1.350;
  - novo check-in com S = 2.600 mantém Na conta 2.600 (marcações antigas não mexem mais) e sobra 1.350;
  - desmarcar o Nubank, que foi marcado antes desse check-in, deixa Na conta 2.600, Falta pagar 2.150 e sobra 450;
  - Unha estimada marcada vira lançamento de 150;
  - item marcado em mês futuro não muda nada no mês atual;
  - `pendingTotals` com conta arquivada;
  - `store`: `paidAt` ausente mantém, presente troca e `amount: null` apaga.

### T3. Telas (`src/screens/month.js`, `styles/month.css`, `src/screens/checkin.js`, `styles/checkin.css`, `src/app.js`)
- Check por linha no mês atual. Saem os switches e o diálogo, e o "Usar o valor padrão" passa a seguir a regra de item marcado.
- O "Atualizar saldo" fica só com o saldo, e saem as rotas `#checkin/paguei` e `#checkin/recebi`.
- **Roteiro** (Playwright no backend local com o `Code.gs` da T1, 360×800, claro e escuro, sem erros no console), partindo do exemplo da T2:
  - os toques dos casos da T2;
  - o "estimado" some ao marcar;
  - o GET mostra `pago`/`pago_em`;
  - recarregar mantém os checks;
  - editar o valor de um item marcado mantém o check;
  - o "Atualizar saldo" só pede o saldo;
  - a abertura automática 1x por dia continua depois de vários checks;
  - mês passado e futuro aparecem sem check.

### T4. README + CLAUDE.md
- **README:**
  - "Como o app funciona" com o check por item e o "Atualizar saldo" só com o saldo;
  - "Roteiro de conferência da Fase 5";
  - o passo da Nova versão.
- **CLAUDE.md:** Arquivos e Status.

**Comum a T1 e T3:** o backend local fica no scratchpad, nunca no repo. Os screenshots vão no PR.

## Pausas obrigatórias (ações manuais do Fabiano)
1. **Depois do merge da T1 e antes da T2 e da T3,** publique a Nova versão do script (*Gerenciar implantações → Editar → Nova versão*, colando o `Code.gs` inteiro) na planilha de teste. Faça o mesmo na planilha dela, se já tiver sido criada.
   - Para conferir, abra a aba Lancamentos: as colunas `pago` e `pago_em` devem aparecer depois da primeira chamada do app.
2. **No fim, no celular, com a planilha de teste:**
   - marcar e desmarcar contas e entradas, vendo "Na conta" e sobra;
   - conferir que a sobra não muda ao marcar;
   - atualizar o saldo e ver o cartão fechar;
   - conferir que o check aparece na planilha.

## Fora do escopo desta fase
- Data de vencimento, lembrete de conta a pagar e pagamento parcial de um mesmo item.
- Marcar itens de meses passados ou futuros.
- Migrar as marcações antigas.

## Critério de pronto
- `node --test` passa com os casos da T2, e o smoke test passa no modo padrão.
- O roteiro da T3 roda sem erros no console, com screenshots no PR.
- No celular, a pausa 2 completa sem surpresas.
