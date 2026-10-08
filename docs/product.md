# Especificação de produto — App de Contas

Fonte de verdade das decisões de produto para as Fases 1 a 3. Mudou alguma regra? Atualize este arquivo antes do código.

## Problema

Hoje ela controla as contas numa planilha Excel:

- Uma aba por ano, uma coluna por mês, uma linha por conta.
- A linha é o que fizer sentido para ela. Às vezes é macro: no cartão (Nubank, Inter, Renner, C&A) ela lança o total da fatura do mês e vai corrigindo, sem lançar compra por compra. Às vezes é específica, como a unha.
- No rodapé ficam o total de despesas, uma linha de salário e a diferença salário − despesas.
- A coluna é o **mês em que ela paga**: uma compra no cartão em outubro entra na coluna de novembro.

O que dói:

1. **Ela não vê o fluxo de caixa.** Cada mês aparece isolado. Exemplo: ganhou 1.500 e gastou 1.000, sobraram 500. No mês seguinte ganhou 1.500 e gastou 1.200, sobraram 300. O acumulado deveria mostrar 800.
2. **Ela se perde nas parcelas.** Faz muitas compras parceladas e não sabe se vai ficar negativa ao comprar.

Ela **não** marca conta por conta como paga, e não vai passar a marcar. Se o app parecer planilha, ela abandona.

## Princípio

**Mais humano, menos planilha.** Sempre que der, o app pergunta em vez de pedir para preencher campos. Poucos toques e textos claros em PT-BR.

## Conceitos

- **Conta:** nome livre, tipo (despesa ou receita; salário é receita), valor padrão opcional (para recorrentes como salário e unha), ordem e situação (ativa ou arquivada). Não tem dia de vencimento, categoria nem "pago".
- **Lançamento:** valor de uma conta num mês de pagamento.
- **Valor efetivo** de uma conta no mês: o lançamento, se existir. Se não existir, o valor padrão, exibido em cinza como estimativa. Se também não houver valor padrão, 0. Conta arquivada não usa valor padrão, mas os lançamentos dela continuam valendo.
- **R(m)** e **D(m):** soma dos valores efetivos das receitas e das despesas do mês `m`.

## Check-in

Uma tela só. Abre sozinha conforme a frequência configurada e também pode ser aberta manualmente.

```
Como está outubro?
Na conta:            R$ 500,00   [alterar]
Contas de outubro:   [Já paguei]  [Ainda não]
Salário de outubro:  [Já caiu]    [Ainda não]
                  [Confirmar]
```

- "Na conta" vem preenchido com o último saldo informado, e ela confirma ou altera. É o saldo em conta, sem desconto nenhum.
- Depois que ela responde "Já paguei" ou "Já caiu" num mês, aquela linha some até o mês seguinte.
- Enquanto a resposta for "Ainda não", o app considera **todas** as contas do mês pendentes. É um erro conservador, que mostra menos sobra, e foi aceito de propósito.
- "Salário" cobre todas as receitas do mês.
- **Educativo:** ao confirmar, se a sobra prevista do mês caiu em relação ao check-in anterior do mesmo mês, o app mostra algo como "Sua sobra de outubro caiu R$ 120 desde 03/10".

## Cálculo (fluxo de caixa)

A base é o último check-in: saldo `S`, mês `A`, `contas_pagas` e `salario_caiu`.

- Sobra no fim do mês A = `S + (salario_caiu ? 0 : R(A)) − (contas_pagas ? 0 : D(A))`
- Para k ≥ 1: `Sobra(A+k) = Sobra(A+k−1) + R(A+k) − D(A+k)`
- Falta pagar no mês atual = `contas_pagas ? 0 : D(A)`
- Se o último check-in é de um mês anterior ao atual, a projeção segue a mesma regra a partir de A, e o mês atual entra inteiro (Falta pagar = D do mês atual).
- Sem nenhum check-in, a base é S = 0, A = mês atual e nada pago. O app pede o primeiro check-in.

Caso obrigatório: R = 1.500 e D = 1.000 dão sobra de 500; no mês seguinte, R = 1.500 e D = 1.200 levam o acumulado a 800.

## Posso comprar?

- Ela informa o valor da parcela e o número de parcelas (n ≥ 1).
- A primeira parcela cai **sempre** no mês seguinte ao atual. É regra única, sem olhar o fechamento do cartão.
- O app soma a parcela às despesas dos n meses e recalcula.
- Mostra os próximos H meses (horizonte configurável, padrão 3) com a sobra depois da compra.
- Verifica **todos** os meses até max(H, n), inclusive além do horizonte exibido. Se algum ficar negativo, a resposta é um "Não pode" explícito, citando o primeiro mês negativo e quanto falta: "Não pode: em dezembro fica faltando R$ 100".
- Se a projeção já era negativa sem a compra, o app diz isso.
- **Só simula, não grava nada.** Quando ela atualiza a fatura com o valor do app do banco, a parcela já vem incluída. Se o app gravasse a compra, ela seria contada duas vezes.

## Atualização semanal guiada

Em vez de navegar e editar valores, o app pergunta uma conta de cada vez, começando pelo próximo mês: "A fatura do Nubank de novembro ainda está em R$ 900? [Sim] [Mudou]". Com "Mudou", ela digita o novo valor. Ao fim, o app grava os lançamentos alterados de uma vez e a data da revisão. Responder "Sim" não altera lançamento nenhum, então a data da última revisão fica guardada à parte.

## Lembrete

Aviso dentro do app quando fizer mais de 7 dias desde a última atualização semanal. Não há push, porque um site estático não tem servidor. No futuro (fora do escopo por ora), pode haver um e-mail semanal enviado pelo Apps Script.

## Telas

Barra inferior com três itens: **Mês · Posso comprar? · Ajustes**.

- **Check-in:** como descrito acima.
- **Mês:**
  - Navegação ‹ mês ›.
  - No topo: Na conta, Falta pagar e Sobra no fim do mês.
  - Bloco "Próximos meses" com a sobra acumulada dos próximos H meses, com negativos em vermelho.
  - Lista de contas do mês com nome e valor. Um toque no valor abre a edição. Valor padrão aparece em cinza. Não há caixas de marcar.
- **Posso comprar?:** como descrito acima.
- **Ajustes:**
  - Contas: criar, renomear, arquivar, tipo, valor padrão e ordem.
  - Frequência do check-in: toda vez, 1x por dia ou 1x por semana.
  - Horizonte.
  - URL e chave.

## Dados

- O histórico começa no mês atual. Anos anteriores não são importados.
- A carga inicial é feita pelo Fabiano, digitando contas e valores dos próximos meses direto no Google Sheets. A tela de contas chega com Ajustes, na Fase 3.
- A planilha continua legível para ela, com abas e cabeçalhos em PT-BR e uma aba `Resumo` opcional, com contas × meses.

## Fases

| Fase | Entrega |
|---|---|
| 1 — dados e regras | Abas, API, cache local com fila de gravação, cálculo com testes. Plano: `plans/phase-1.md` |
| 2 — substitui a planilha | Telas Check-in e Mês, com o bloco Próximos meses |
| 3 | Posso comprar?, atualização semanal guiada, Ajustes e lembrete |

## Fora do escopo

Lançamento compra a compra, categorias, marcação de pago, push, gravar compras simuladas e importação de histórico.
