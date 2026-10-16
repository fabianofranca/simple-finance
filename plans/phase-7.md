# Plano: App de Contas — Fase 7 (arquivar sem sobras e excluir conta arquivada)

## Contexto

O Fabiano achou um "bug": uma conta arquivada some da tela Mês por uns meses e depois reaparece.

**Causa:** arquivar não apaga nada. A conta arquivada só aparece num mês em que tem lançamento (`src/month-view.js`). Se ela tinha valores lançados meses à frente (digitados, parcelas do "Vou comprar" ou da revisão), some nos meses vazios e volta nos meses com valor.

**O efeito mais grave não aparece na tela:** esses valores futuros continuam entrando na sobra e nos Próximos meses (`src/forecast.js`). Um cartão cancelado e arquivado continua tirando dinheiro da previsão.

O Fabiano também quer **excluir** uma conta arquivada. Hoje isso não existe ("Arquivar em vez de excluir; o histórico nunca é apagado").

**Ponto de partida:**
- `apps-script/Code.gs`: aba Contas com `id`, `nome`, `tipo`, `valor_padrao`, `ordem`, `ativa` e `cartao`.
- `src/accounts.js`: `archive`, `reactivate`, `activeAccounts` e `archivedAccounts`.
- `src/month-view.js`: arquivada só aparece com lançamento no mês.
- `src/forecast.js`: conta arquivada não usa valor padrão, mas os lançamentos dela continuam valendo.
- `src/purchases.js`: `recentPurchases` lista compras de qualquer conta.
- `src/screens/settings.js`: "Arquivar" com confirmação e "Arquivadas" com "Reativar".

## Restrições

1. Todas as das fases anteriores continuam: sem build, sem npm, sem framework, nenhum segredo no repo, centavos no JS, mobile first, PT-BR na interface e código em inglês.
2. **Muda o backend:** a aba Contas ganha uma coluna. É preciso publicar uma Nova versão do script **nas duas planilhas**, a de teste e a dela (pausa 1). O backend novo continua aceitando o app antigo.

## Decisões

- **Arquivar apaga os valores dos meses seguintes ao atual.** O mês atual e os passados ficam (histórico).
  - A confirmação diz o que sai: "Arquivar Nubank? O histórico fica guardado. Os valores de novembro em diante (R$ 2.300,00) serão apagados.". Sem valores futuros, fica como hoje: "Arquivar Nubank? O histórico fica guardado.".
  - Reativar não traz os valores de volta.
- **Excluir, só para conta arquivada,** na seção "Arquivadas", ao lado de "Reativar".
  - A conta **não é apagada da planilha**. Ela ganha a marca `excluida` e some de Ajustes de vez (sai das Arquivadas e não tem "Reativar").
  - **Os meses passados continuam com os valores e o nome dela,** porque a linha da conta continua na aba Contas.
  - Os valores dos meses seguintes ao atual são apagados, como no arquivar. Isso cobre contas arquivadas antes desta fase, que ainda têm valores futuros.
  - Confirmação: "Excluir Nubank? Ela sai de Ajustes e não dá para desfazer. Os meses passados continuam mostrando os valores dela.". Com valores futuros, acrescenta: "Os valores de novembro em diante (R$ 2.300,00) serão apagados.".
- **Na tela Mês,** conta excluída segue a regra da arquivada: só aparece no mês em que tem lançamento.
- **Últimas compras** só lista compras de cartões **ativos**. Desfazer a compra de um cartão arquivado não faz sentido, porque os meses futuros já foram apagados. Reativar o cartão faz a compra voltar à lista.
- **Contas arquivadas antes desta fase** continuam com os valores futuros até que ela as exclua, ou as reative e arquive de novo. O app não apaga nada sozinho.

## Regras

**Backend (`apps-script/Code.gs`):**
- A aba Contas ganha `excluida` (caixa de seleção) no fim. Numa planilha que já existe, a coluna entra sozinha e começa desmarcada.
- O GET devolve `deleted` (boolean) em cada conta.
- `saveAccount` aceita `deleted` opcional, com o mesmo padrão do `isCard`:
  - ausente: mantém o valor da linha (conta nova fica `false`);
  - presente: precisa ser boolean.
  - Uma conta com `deleted: true` precisa ter `active: false`; senão, `invalid_payload`.
- `seed` e `reset` funcionam com a coluna nova (contas do seed com `false`).
- `scripts/smoke-test.sh`: no modo padrão, a ida e volta de `deleted` na conta smoke-test, que já é arquivada (marcar, regravar sem a chave, desmarcar, e `deleted: true` com `active: true` dá `invalid_payload`). A conta termina com `false`.

**Lógica (`src/accounts.js`, puro):**
- `activeAccounts` não muda (conta excluída nunca é ativa). `archivedAccounts` passa a ignorar as excluídas.
- `archivePlan(data, now, accountId)` devolve `{ account, entries, message }`:
  - `account`: a conta com `active: false`;
  - `entries`: um item `{ accountId, month, amount: null }` para cada lançamento dela com `month > mês atual`;
  - `message`: o texto da confirmação (com ou sem a parte dos valores futuros).
  - O mês atual é o `monthOf(now)`. A soma dos valores futuros usa o módulo do valor e `formatMoney`, e o nome do primeiro mês segue o critério do `buy-view.js` (com o ano quando é de outro ano).
- `deletePlan(data, now, accountId)` devolve `{ account, entries, message }`, com `account` igual à conta com `active: false` e `deleted: true`. Os `entries` seguem a regra do `archivePlan`.
- Conta inexistente lança Error. No `deletePlan`, conta ativa também lança Error.

**Mês (`src/month-view.js`):** nada muda na regra. A conta excluída já é `active: false` e só aparece com lançamento. Um teste garante isso.

**Compras (`src/purchases.js`):** `recentPurchases` ignora compras cuja conta não está ativa.

**Store:** nada novo. O arquivar e o excluir gravam `saveEntries` (quando há valores futuros) e depois `saveAccount`, nessa ordem, na mesma fila.

**Tela (`src/screens/settings.js`):**
- O "Arquivar" usa o `archivePlan`: a confirmação mostra o `message` e, ao confirmar, recalcula com os dados atuais e grava.
- Na seção "Arquivadas", cada linha ganha "Excluir" (link em vermelho, como o "Arquivar" do diálogo) ao lado de "Reativar", com confirmação pelo `deletePlan` e o botão "Excluir".
- Com a última arquivada excluída, a seção "Arquivadas" some.

## Tarefas

Cada tarefa vira um PR.
- **Paralelas:** T1 e T2, que mexem em arquivos diferentes.
- **Depois da T2:** T3.
- **Em paralelo com a T3:** T4.
- **Ordem de merge:** T1 → pausa 1 (Nova versão nas duas planilhas) → T2 → T3 → T4.

### T1. Backend (`apps-script/Code.gs`, `scripts/smoke-test.sh`)
- Conforme as regras.
- **Teste no backend local do scratchpad** (o `Code.gs` real com mocks):
  - planilha da Fase 6 ganha `excluida` sem perder dados;
  - `deleted` no GET;
  - `saveAccount` sem a chave mantém;
  - `deleted: true` com `active: true` dá `invalid_payload`;
  - `seed` e `reset` funcionam.

### T2. Lógica + testes (`src/accounts.js`, `src/purchases.js`, `tests/accounts.test.js`, `tests/purchases.test.js`, `tests/month-view.test.js`)
- Conforme as regras.
- **Casos mínimos** (mês atual outubro de 2026; Nubank com 900 em outubro, 1.000 em novembro, 800 em dezembro e 500 em janeiro de 2027):
  - `archivePlan` apaga novembro, dezembro e janeiro, mantém outubro, e o texto diz "novembro em diante (R$ 2.300,00)";
  - sem valores futuros, o texto vem sem essa parte e `entries` vem vazio;
  - `deletePlan` numa conta arquivada com valores futuros apaga esses meses e marca `deleted`;
  - `deletePlan` numa conta ativa lança Error;
  - `archivedAccounts` ignora as excluídas;
  - a tela Mês mostra a excluída em setembro (com lançamento) e não em novembro;
  - `recentPurchases` ignora compra de cartão arquivado e volta a mostrar depois de reativar.

### T3. Ajustes (`src/screens/settings.js`, `styles/settings.css`)
- Conforme as regras.
- **Roteiro** (Playwright no backend local com o `Code.gs` da T1, 360×800, claro e escuro, sem erros no console):
  - arquivar com e sem valores futuros, conferindo o texto e, no Mês, que os meses futuros ficam sem a conta e outubro continua com ela;
  - reativar não traz os valores de volta;
  - excluir uma arquivada: ela some de Ajustes, os meses passados continuam com nome e valor, e o GET mostra `deleted`;
  - "Arquivadas" some ao excluir a última;
  - recarregar mantém tudo.

### T4. Docs (`README.md`, `CLAUDE.md`)
- **README:**
  - "Como o app funciona" com o arquivar e o excluir;
  - a coluna `excluida` na tabela de abas;
  - "Roteiro de conferência da Fase 7".
- **CLAUDE.md:** Arquivos e Status.

**Comum a T1 e T3:** o backend local fica no scratchpad, nunca no repo. Os screenshots vão para o Fabiano.

## Pausas obrigatórias (ações manuais do Fabiano)
1. **Depois do merge da T1 e antes do merge da T3,** publique a Nova versão do script na planilha de teste **e na dela** (*Gerenciar implantações → Editar → Nova versão*, colando o `Code.gs` inteiro).
   - Para conferir, abra o app uma vez: a coluna `excluida` aparece no fim de Contas.
2. **No fim, no celular, com a planilha de teste:**
   - arquivar uma conta com valores nos meses seguintes e ver que ela não reaparece mais;
   - excluir uma arquivada e ver que os meses passados continuam com ela;
   - na planilha dela, resolver a conta que reaparecia (Excluir, ou Reativar e Arquivar de novo).

## Fora do escopo desta fase
- Apagar de verdade a linha da conta ou os valores dos meses passados.
- Desfazer uma exclusão pelo app (dá para desmarcar `excluida` na planilha).
- Limpar sozinho os valores futuros de contas arquivadas antes desta fase.

## Critério de pronto
- `node --test tests/*.test.js` passa com os casos da T2, e o smoke test passa no modo padrão.
- O roteiro da T3 roda sem erros no console.
- No celular, a pausa 2 completa sem surpresas.
