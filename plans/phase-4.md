# Plano: App de Contas — Fase 4 (usabilidade: "Falta receber" e "Recebi"/"Paguei" na tela Mês)

## Contexto

Ao validar a Fase 3 no celular, o Fabiano achou dois problemas no mês atual da tela Mês.

1. **A conta não fecha na tela.** O cartão mostra "Na conta R$ 0,00", "Falta pagar R$ 0,00" e "Sobra no fim do mês R$ 1.000,00". O salário que ainda não caiu entra na sobra, mas não aparece em lugar nenhum. A etiqueta "estimado" no salário acabou lida como "ainda não recebi".
2. **"Já paguei" e "Já caiu" ficam escondidos** dentro do "Atualizar saldo". Não aparecem na tela e não têm como ser desfeitos: depois do "sim", a linha some até o mês seguinte.

Esta fase resolve os dois antes da Entrega, para que a primeira experiência dela já seja com a versão ajustada. Os testes continuam só com o Fabiano, na planilha de teste.

**Ponto de partida:**
- `src/forecast.js`: `currentStatus` com `balance`, `toPay` e `endOfMonth`.
- `src/month-view.js`: `monthView`.
- `src/checkin.js`: `checkinForm`, `lineOf`, `canConfirm`, `buildCheckin` e `dropNotice`.
- `src/screens/month.js`: cartão `summary` e `section(title, rows, month)`.
- `src/screens/checkin.js`: lê `ctx.params.auto`.
- `src/app.js`: `#checkin` e `#checkin/auto`.
- `src/screens/ui.js`: `h`, `money`, `queueLine` e `confirmDialog`.

## Restrições

1. Todas as das fases anteriores continuam: sem build, sem npm, sem framework, nenhum segredo no repo, centavos no JS, mês `YYYY-MM`, `node --test` nativo, mobile first (360px, toques ≥ 44px, dark mode), dinheiro sempre pelo `src/money.js`, interface e docs em PT-BR, código em inglês e regra testável em módulo puro.
2. **Sem mudança de backend.** O switch grava um check-in comum: `saveCheckin`, idempotente por `at`, com `at`, `month`, `balance`, `billsPaid`, `incomeReceived` e `projectedBalance`. Nenhuma implantação nesta fase.
3. **Sem marcação por conta.** O switch vale para a seção inteira, como as perguntas do check-in. Continua valendo o que o `docs/product.md` diz: ela não marca conta por conta.

## Decisões

- **"Falta receber" no cartão do mês atual**, entre "Na conta" e "Falta pagar". O valor é `salario_caiu ? 0 : R(A)`, o espelho do "Falta pagar".
  - Com o último check-in no mês atual, o cartão sempre fecha: Na conta + Falta receber − Falta pagar = Sobra no fim do mês.
  - Se o último check-in for de um mês anterior, a soma pode não fechar, por causa de pendências daquele mês. O check-in automático do mês corrige isso, e o cartão não trata o caso.
  - A etiqueta "estimado" não muda.
- **Switches na tela Mês, só no mês atual,** no título de cada seção: "Entradas" com "Recebi" e "Contas" com "Paguei".
  - Mostram a resposta do último check-in do mês. Sem check-in no mês, ficam desligados.
  - Cada um é um `<button role="switch" aria-checked>` com o texto ao lado, para não depender só da cor, e área de toque ≥ 44px.
  - Meses passados e futuros não têm switch.
- **O switch não muda sem o saldo.** *(Substituído pelo "Ajuste depois da validação no celular", mais abaixo: o switch agora ajusta o saldo sozinho, sem diálogo. O caso sem check-in no mês continua valendo.)* "Paguei" só faz sentido junto com o saldo depois de pagar. Exemplo: ela tem 3.000 na conta e 2.000 de contas, com o salário já recebido, e a sobra é 1.000. Se ela pagar e só ligar o switch, o app mostraria sobra de 3.000. Com o salário acontece o contrário: ele seria contado duas vezes. Por isso:
  - **Com check-in no mês:** o toque abre um diálogo com o título da mudança e o campo de saldo, já preenchido com o último. O campo é igual ao do check-in e aceita negativo com "±".
    - "Confirmar" grava um check-in com a marcação nova e mantém a outra.
    - "Cancelar" não grava, e o switch fica como estava.
  - **Sem check-in no mês:** o toque abre o "Atualizar saldo" (`#checkin/paguei` ou `#checkin/recebi`) com aquela resposta já marcada. A outra pergunta continua obrigatória, como em todo primeiro check-in do mês.
  - Depois de confirmar, aparece o mesmo aviso educativo do check-in ("Sua sobra de outubro caiu…"), se houver.
- **Desfazer:** desligar o switch é o jeito de corrigir um toque errado. Por isso a linha do "Atualizar saldo" passa a seguir o **último** check-in do mês:
  - some enquanto a última resposta for "sim";
  - volta marcada "Ainda não" se ela desligar o switch.
- **O switch conta como check-in.** Com "1x por dia", o check-in automático não abre de novo no mesmo dia.

**Textos do diálogo** (com o nome do mês corrente; o diálogo sai no ajuste T4–T5):

| Mudança | Título | Campo |
|---|---|---|
| Paguei → ligado | Contas de outubro pagas | Quanto ficou na conta? |
| Paguei → desligado | Contas de outubro ainda não pagas | Quanto tem na conta agora? |
| Recebi → ligado | Salário de outubro recebido | Quanto tem na conta agora? |
| Recebi → desligado | Salário de outubro ainda não caiu | Quanto tem na conta agora? |

## Regras

**Cálculo (`src/forecast.js`):** `currentStatus` ganha `toReceive = base.month === month && base.incomeReceived ? 0 : R(month)`, ao lado do `toPay`.

**Tela Mês (`src/month-view.js`):** no mês atual, `view.toReceive` e `view.flags = { hasCheckin, billsPaid, incomeReceived }`, vindo de `monthFlags`.

**Check-in (`src/checkin.js`):**
- **`lineOf`** olha só o último check-in do mês:
  - se ele tiver `true`, devolve `{ show: false, preset: true }`;
  - sem check-in no mês, devolve `{ show: true, preset: null }`;
  - nos outros casos, devolve `{ show: true, preset: false }`.
  - O `buildCheckin` não muda: uma linha escondida continua gravando `true`.
- **`monthFlags(data, now)`** devolve `{ hasCheckin, billsPaid, incomeReceived }` do último check-in do mês de `now`. Sem check-in nesse mês, devolve tudo `false`.
- **`buildToggle(data, now, { field, value, balance })`** devolve um check-in em que:
  - `field` (`'billsPaid'` ou `'incomeReceived'`) vale `value`;
  - a outra marcação é copiada do último check-in do mês;
  - `at` e `month` são preenchidos como no `buildCheckin`;
  - `projectedBalance` é calculado do mesmo jeito.
  - Só é usado quando há check-in no mês; sem check-in, a tela vai para o "Atualizar saldo".
- **`toggleText(field, value, month)`** devolve `{ title, label }` com os textos da tabela.

**Rotas:** `#checkin/paguei` e `#checkin/recebi` abrem o "Atualizar saldo" com "Já paguei" ou "Já caiu" marcado, se a linha estiver visível. O `#checkin/auto` continua igual.

## Tarefas

Cada tarefa vira um PR. As três rodam em sequência: T2 depende da lógica da T1, e T3 documenta o resultado.

### T1. Lógica pura + testes
- Mudar `src/forecast.js`, `src/month-view.js` e `src/checkin.js` conforme as regras, com testes em `tests/forecast.test.js`, `tests/month-view.test.js` e `tests/checkin.test.js`.
- Casos mínimos:
  - **Tela do Fabiano:** sem check-in, salário com padrão de 1.000 e sem contas dá Na conta 0, Falta receber 1.000, Falta pagar 0 e Sobra 1.000.
  - **Check-in no mês:** saldo 3.000, salário de 3.000 recebido e 2.000 de contas pendentes dão Falta receber 0, Falta pagar 2.000 e Sobra 1.000. Também deve valer `balance + toReceive − toPay === endOfMonth` nas quatro combinações de marcação.
  - **`buildToggle`:** ligar `billsPaid` com saldo 1.000 mantém `incomeReceived` e dá `projectedBalance` 1.000.
  - **Desfazer:** ligar e depois desligar `billsPaid` faz o `lineOf` mostrar a linha de novo, com `preset: false`.
  - **`monthFlags`:** sem check-in no mês, inclusive com check-in só no mês anterior, devolve tudo `false` e `hasCheckin: false`.
  - **`toggleText`:** os quatro textos.
- **Aceite:** `node --test` passa, sem warnings.

### T2. Telas (`src/screens/month.js`, `styles/month.css`, `src/screens/checkin.js`, `src/app.js`)
- Cartão do mês atual com "Falta receber" entre "Na conta" e "Falta pagar".
- Switches no título de "Entradas" e "Contas", só no mês atual.
- Com check-in no mês, o switch abre um `<dialog>` (no mesmo estilo do `confirmDialog`) com:
  - o título da tabela e o campo de saldo, com o mesmo formato e o "±" do check-in;
  - "Cancelar" e "Confirmar";
  - erro em linguagem humana para valor inválido.
  - "Confirmar" grava o `buildToggle` pelo `store` e mostra o `dropNotice`.
- Sem check-in no mês, o switch faz `navigate('#checkin/paguei')` ou `navigate('#checkin/recebi')`. A rota empilha, e sair volta ao Mês. O `src/app.js` aceita os dois parâmetros, e o `src/screens/checkin.js` marca a resposta.
- **Roteiro** (Playwright no backend local com o `Code.gs` real, 360×800, claro e escuro, sem erros no console):
  1. **Tela do Fabiano:** `reset` e uma conta "Salário" (Entrada, padrão de 1.000) via POST. O cartão mostra Na conta 0, Falta receber 1.000, Falta pagar 0 e Sobra 1.000, com os dois switches desligados.
  2. **Sem check-in no mês:** "Recebi" abre o "Atualizar saldo" com "Já caiu" marcado e "Contas" sem resposta, com "Confirmar" desabilitado. Saldo 1.000 + "Ainda não" volta ao Mês com "Recebi" ligado, Falta receber 0 e Sobra 1.000.
  3. **Com check-in no mês:** usar o `seed` e fazer um check-in pelo app com salário recebido e contas pendentes, guardando a sobra antes.
     - "Paguei" + "Cancelar" não grava nada (o GET confere) e o switch fica desligado.
     - "Paguei" com saldo de (saldo − Falta pagar) deixa Falta pagar 0 e a sobra igual à de antes.
     - Desligar "Paguei" com o mesmo saldo faz o Falta pagar voltar e a sobra cair esse valor. O "Atualizar saldo" volta a mostrar "Contas de outubro" marcado "Ainda não".
  4. **Outros meses:** mês passado e mês futuro aparecem sem switch e sem "Falta receber".
  5. **Acessibilidade:** `role="switch"` e `aria-checked` corretos nos dois estados.
- Screenshots do cartão, dos switches e do diálogo (claro e escuro) no PR.

### T3. README + CLAUDE.md
- **README:** atualizar "Como o app funciona" com o "Falta receber" e os switches, e acrescentar o "Roteiro de conferência da Fase 4".
- **CLAUDE.md:** acrescentar em Arquivos as rotas `#checkin/paguei` e `#checkin/recebi`. A Fase 4 só entra no Status depois da validação no celular.

**Comum a T2:** o agente monta o backend local que carrega o `Code.gs` real com mocks, como nas Fases 2 e 3, **no scratchpad e nunca no repo**.

## Ajuste depois da validação no celular (T4–T6)

Na validação, o Fabiano pediu que ligar "Recebi" já tire o "estimado" das entradas e some o valor em "Na conta", sem perguntar nada. O mesmo vale para "Paguei".

**Decisão: o switch é um toque só e nunca muda a sobra.** Ele só passa o dinheiro de "Falta receber" ou "Falta pagar" para "Na conta". Assim não há como inflar a sobra, que era o motivo do diálogo. Se o valor real vier diferente do estimado, o "Atualizar saldo" do dia corrige o "Na conta".

| Toque | Lançamentos do mês | Na conta | Marcação |
|---|---|---|---|
| Liga "Recebi" | as entradas estimadas viram lançamentos (some o "estimado") | último saldo **+** R(A) | `incomeReceived = true` |
| Desliga "Recebi" | nada muda (os lançamentos ficam) | último saldo **−** R(A) | `incomeReceived = false` |
| Liga "Paguei" | as contas estimadas viram lançamentos | último saldo **−** D(A) | `billsPaid = true` |
| Desliga "Paguei" | nada muda | último saldo **+** D(A) | `billsPaid = false` |

Exemplo: Na conta 500, Salário 3.000 estimado e 2.150 de contas, com Unha 150 estimado. A sobra é 1.350.
- Ligar "Recebi" grava o Salário de 3.000 como lançamento. Fica Na conta 3.500, Falta receber 0 e sobra 1.350.
- Ligar "Paguei" grava a Unha de 150 como lançamento. Fica Na conta 1.350, Falta pagar 0 e sobra 1.350.
- Desligar "Paguei" volta para Na conta 3.500, Falta pagar 2.150 e sobra 1.350.

**Regras:**
- **Sem check-in no mês:** o toque continua abrindo o "Atualizar saldo" com a resposta marcada. O primeiro saldo do mês precisa ser o real, senão o app somaria em cima de um saldo velho.
- **Lançamentos:** só viram lançamento as contas daquele tipo com valor estimado no mês, isto é, ativas, com padrão e sem lançamento. Conta sem valor continua sem valor.
- **Gravação:** primeiro o `saveEntries` (se houver lançamentos), depois o `saveCheckin`. O check-in segue o formato de sempre (`at`, `month`, `balance`, as duas marcações e `projectedBalance`), com a outra marcação copiada do último check-in do mês.
- **Sem diálogo e sem aviso de "sobra caiu"**, porque a sobra não muda. Depois do toque aparece uma confirmação curta pelo `ctx.notify`, que some com um toque. Se o total for 0, não aparece nada.

| Toque | Confirmação |
|---|---|
| Liga "Recebi" | Salário de outubro somado: + R$ 3.000,00 na conta. |
| Desliga "Recebi" | Salário de outubro tirado: − R$ 3.000,00 na conta. |
| Liga "Paguei" | Contas de outubro descontadas: − R$ 2.150,00 na conta. |
| Desliga "Paguei" | Contas de outubro devolvidas: + R$ 2.150,00 na conta. |

**Lógica (`src/checkin.js`):**
- **`buildToggle(data, now, { field, value })`** devolve `{ entries, checkin }`:
  - `entries` vem como `[{ accountId, month, amount }]` (vazio ao desligar);
  - `checkin.balance` é o saldo do último check-in do mês ± o total do tipo, calculado com os lançamentos novos;
  - `projectedBalance` é calculado como no `buildCheckin` e fica igual à sobra de antes.
  - Sem check-in no mês, lança `Error`, porque a tela não deve chamar nesse caso. O parâmetro `balance` sai.
- **`toggleNotice(field, value, total, month)`** substitui o `toggleText` e devolve o texto da confirmação, ou `null` com total 0.

### T4. Lógica + testes (`src/checkin.js`, `tests/checkin.test.js`)
- Implementar `buildToggle` e `toggleNotice` conforme as regras e remover o `toggleText`.
- Casos mínimos:
  - o exemplo acima, nos quatro toques;
  - em todos os toques, `projectedBalance` igual ao `currentStatus(...).endOfMonth` de antes;
  - a outra marcação copiada;
  - conta arquivada com lançamento entra no total e não vira lançamento de novo;
  - conta sem valor fica de fora;
  - desligar não gera lançamentos;
  - sem check-in no mês, lança erro;
  - os quatro textos e o `null` com total 0.
- **Aceite:** `node --test` passa.

### T5. Tela Mês (`src/screens/month.js`, `styles/month.css`)
- Tirar o diálogo do switch, com o CSS que ficar sem uso.
- Com check-in no mês, o toque chama `buildToggle`, grava os lançamentos e depois o check-in, e mostra o `toggleNotice`. O foco continua no switch.
- Sem check-in no mês, o toque continua abrindo `#checkin/paguei` ou `#checkin/recebi`.
- **Roteiro** (Playwright no backend local, 360×800, claro e escuro, sem erros no console):
  - o exemplo acima, partindo do `seed` com um check-in pelo app;
  - o "estimado" some do Salário ao ligar "Recebi" e da Unha ao ligar "Paguei", e o GET mostra os lançamentos;
  - a sobra fica igual em todos os toques, e o cartão fecha em todos;
  - desligar volta o "Na conta" e não apaga lançamentos;
  - as confirmações aparecem com os textos da tabela;
  - sem check-in no mês, continua abrindo o "Atualizar saldo".
- Screenshots no PR.

### T6. README
- Atualizar a descrição dos switches e o "Roteiro de conferência da Fase 4". Pode rodar em paralelo com a T5.

## Pausas obrigatórias (ações manuais do Fabiano)
1. **Nenhuma implantação de backend** nesta fase.
2. **No fim, no celular, com a planilha de teste:**
   - ver o cartão fechar (na conta + falta receber − falta pagar = sobra);
   - ligar "Recebi": o "estimado" some das entradas, o "Na conta" sobe e a sobra fica igual;
   - ligar "Paguei": o "estimado" some das contas, o "Na conta" desce e a sobra fica igual;
   - desligar um deles: o "Na conta" volta e a pergunta reaparece no "Atualizar saldo".

## Fora do escopo desta fase
- Marcar pago ou recebido conta a conta.
- Pagamento parcial. Continua o erro conservador aceito: com "Ainda não", todas as contas do mês contam como pendentes.
- Mudar a etiqueta "estimado" em si. Ela só some quando o switch transforma o valor estimado em lançamento.
- Planilha da esposa, link de configuração e carga real (passo da Entrega).
- Qualquer framework, build ou dependência.

## Critério de pronto
- `node --test` passa com os casos da T1 e da T4.
- Os roteiros da T2 e da T5 rodam sem erros no console, com screenshots nos PRs.
- No celular, a pausa 2 completa sem surpresas.
