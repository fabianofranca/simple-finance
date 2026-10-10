# Especificação de produto — App de Contas

Fonte de verdade das decisões de produto para as Fases 1 a 5 e a Entrega. Mudou alguma regra? Atualize este arquivo antes do código.

## Problema

Hoje ela controla as contas numa planilha Excel:

- Uma aba por ano, uma coluna por mês, uma linha por conta.
- A linha é o que fizer sentido para ela. Às vezes é macro: no cartão (Nubank, Inter, Renner, C&A) ela lança o total da fatura do mês e vai corrigindo, sem lançar compra por compra. Às vezes é específica, como a unha.
- No rodapé ficam o total de despesas, uma linha de salário e a diferença salário − despesas.
- A coluna é o **mês em que ela paga**: uma compra no cartão em outubro entra na coluna de novembro.

O que dói:

1. **Ela não vê o fluxo de caixa.** Cada mês aparece isolado. Exemplo: ganhou 1.500 e gastou 1.000, sobraram 500. No mês seguinte ganhou 1.500 e gastou 1.200, sobraram 300. O acumulado deveria mostrar 800.
2. **Ela se perde nas parcelas.** Faz muitas compras parceladas e não sabe se vai ficar negativa ao comprar.

No começo, a decisão foi que ela não marcaria conta por conta como paga. Na Fase 5 o Fabiano mudou isso: cada item tem um check simples na tela Mês, de um toque. O resto continua valendo: se o app parecer planilha, ela abandona.

## Princípio

**Mais humano, menos planilha.** Sempre que der, o app pergunta em vez de pedir para preencher campos. Poucos toques e textos claros em PT-BR.

## Conceitos

- **Conta:** nome livre, tipo (despesa ou receita; salário é receita), valor padrão opcional (para recorrentes como salário e unha), ordem e situação (ativa ou arquivada). Não tem dia de vencimento nem categoria.
- **Lançamento:** valor de uma conta num mês de pagamento. Pode estar marcado como pago (conta) ou recebido (entrada), com o momento em que foi marcado.
- **Valor efetivo** de uma conta no mês: o lançamento, se existir. Se não existir, o valor padrão, exibido em cinza como estimativa. Se também não houver valor padrão, 0. Conta arquivada não usa valor padrão, mas os lançamentos dela continuam valendo.
- **R(m)** e **D(m):** soma dos valores efetivos das receitas e das despesas do mês `m`.

## Check-in

Uma tela só. Abre sozinha conforme a frequência configurada (padrão: **1x por dia**) e também pode ser aberta manualmente, pelo botão "Atualizar saldo de outubro" da tela Mês.

```
Como está outubro?
Na conta:            R$ 500,00   [alterar]
                  [Confirmar]
```

- **Quando abre sozinha:** sem nenhum check-in, sempre (é a base do cálculo). Com "toda vez", a cada abertura do app. Com "1x por dia", se o último check-in não foi hoje. Com "1x por semana", se faz 7 dias ou mais do último. O app confere ao abrir e quando volta para a frente da tela. Se já existe check-in, ela pode tocar em "Agora não", e o app só pergunta de novo no dia seguinte (com "toda vez", na próxima abertura do app).
- "Na conta" vem preenchido com o saldo que o cartão do mês mostra, e ela confirma ou altera. É o saldo em conta, sem desconto nenhum. Sem check-in anterior, o campo vem vazio e é obrigatório.
- O check-in pergunta **só o saldo**. O que foi pago ou recebido é marcado item a item na tela Mês (Fase 5); as perguntas "Já paguei / Já caiu" das fases anteriores saíram.
- **Educativo:** ao confirmar, se a sobra prevista do mês caiu em relação ao check-in anterior do mesmo mês, a tela Mês mostra um aviso como "Sua sobra de outubro caiu R$ 120,00 desde 03/10", que some com um toque.

## Cálculo (fluxo de caixa)

A base é o último check-in: saldo `S`, mês `A` e momento `at`.

- **Na conta** = `S` + entradas marcadas como recebidas **depois** de `at` − contas marcadas como pagas **depois** de `at`. Um saldo informado já inclui o que foi pago antes dele.
- **Pendentes do mês m:** soma dos valores efetivos dos itens **sem** marcação (item estimado conta como não marcado): `R'(m)` das entradas e `D'(m)` das contas.
- Sobra no fim do mês A = `Na conta + R'(A) − D'(A)`
- Para k ≥ 1: `Sobra(A+k) = Sobra(A+k−1) + R'(A+k) − D'(A+k)`
- Falta receber no mês atual = `R'(A)`; Falta pagar = `D'(A)`. Com check-in no mês, o cartão fecha: na conta + falta receber − falta pagar = sobra.
- Marcar ou desmarcar um item **nunca muda a sobra**: só passa o valor entre "Falta pagar/receber" e "Na conta".
- Erro aceito (conservador): se ela pagar no banco, atualizar o saldo e só depois marcar o item, o valor é descontado duas vezes até o próximo "Atualizar saldo".
- Se o último check-in é de um mês anterior ao atual, a projeção segue a mesma regra a partir de A.
- Sem nenhum check-in, a base é S = 0, A = mês atual. O app pede o primeiro check-in (depois da primeira conta).

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

Em vez de navegar e editar valores, o app pergunta uma conta de cada vez.

- Revisa só o **próximo mês** (mês atual + 1) e só as **contas de despesa ativas**, na ordem das contas. Salário e outras entradas ficam de fora.
- Uma conta por vez, com progresso ("2 de 5"):
  - com valor: "Nubank · novembro — Ainda está em R$ 1.000,00?" [Sim] [Mudou]. Se o valor vem do padrão, a pergunta deixa claro que é estimado;
  - sem valor: "C&A · novembro — Já sabe quanto vai ser em novembro?" [Ainda não sei] [Informar];
  - sempre há "Pular".
- "Sim", "Pular" e "Ainda não sei" não gravam nada. "Mudou" e "Informar" abrem o campo de valor, e "Salvar" grava **na hora**, para nada se perder se ela parar no meio.
- No fim: "Pronto! Sua sobra de novembro ficou em R$ 1.400,00 (antes R$ 1.600,00)", comparando com a sobra calculada no início da revisão. Se não mudou: "Pronto! Sua sobra de novembro continua em R$ 1.600,00". O botão "Ver os próximos meses" leva ao Mês.
- A data da última revisão (`ultima_revisao`) só é gravada ao concluir. Sair no meio mantém o que já foi salvo e não conta como revisão. Como "Sim" não altera lançamento nenhum, essa data fica guardada à parte.

## Lembrete

Faixa no topo da tela Mês quando ela nunca revisou ou faz 7 dias ou mais desde a última revisão (quem revisa todo domingo vê a faixa no domingo seguinte):

- "Faz 9 dias que você não revisa as contas." [Revisar agora]
- sem revisão anterior: "Que tal revisar as contas do mês que vem?" [Revisar agora]

A faixa some quando a revisão termina. A tela Mês tem também um botão fixo "Revisar valores". Não há push, porque um site estático não tem servidor. No futuro (fora do escopo por ora), pode haver um e-mail semanal enviado pelo Apps Script.

## Telas

Barra inferior com três itens: **Mês · Posso comprar? · Ajustes**. Aparece nessas três telas e some nas telas de fluxo (Check-in e Revisão) e na configuração. Trocar de item não empilha histórico. Toques de pelo menos 44px, item ativo destacado e espaço para a área segura do iPhone.

O app é instalável na tela inicial do celular (ícone "Contas", abre sem a barra do navegador). O painel de desenvolvimento fica em `dev.html`, fora do app, sem link a partir dele.

- **Check-in:** como descrito acima.
- **Mês:**
  - Navegação ‹ outubro de 2026 ›, de 12 meses para trás até 12 meses para frente do mês atual.
  - No topo, conforme o mês:
    - mês atual: Na conta, Falta receber, Falta pagar e Sobra no fim do mês (com check-in no mês, a conta fecha na tela: na conta + falta receber − falta pagar = sobra);
    - mês futuro: Entra, Sai e Sobra prevista no fim do mês;
    - mês passado: Entrou e Saiu, sem sobra.
  - Bloco "Próximos meses" (só no mês atual) com a sobra acumulada dos próximos H meses, com negativos em vermelho. Tocar num mês abre esse mês.
  - Lista do mês em duas partes, "Entradas" e "Contas", na ordem das contas, com nome e valor. Valor padrão aparece em cinza com a palavra "estimado"; sem valor, aparece "—". Conta arquivada só aparece se tiver lançamento no mês.
  - No mês atual, cada linha tem um **check simples** à esquerda do nome: em Contas quer dizer "pago"; em Entradas, "recebido". É um toque só e nunca muda a sobra: marcar passa o valor de "Falta pagar/receber" para "Na conta" (se era estimado, vira lançamento e o "estimado" some); desmarcar devolve. Uma confirmação curta mostra o que aconteceu ("Nubank pago: − R$ 900,00 na conta."). Meses passados e futuros não têm check.
  - Um toque no valor abre a edição. Se a conta tem valor padrão, há também "Usar o valor padrão", que apaga o lançamento do mês (num item marcado, grava o valor padrão e mantém a marcação).
  - Rodapé: o botão "Atualizar saldo de outubro" (com o nome do mês corrente) aparece em todos os meses e sempre atualiza o saldo do mês corrente, mesmo quando um mês passado ou futuro está na tela. Ao lado, "Revisar valores" abre a revisão semanal.
  - No topo, a faixa do lembrete, quando for a hora.
  - Gravação em segundo plano, com aviso discreto em linguagem humana: "Salvando…", "Sem internet, vou tentar de novo" ou "Não consegui salvar." com "Tentar de novo".
- **Revisão:** como descrito em "Atualização semanal guiada".
- **Posso comprar?:**
  - Campos "Valor da parcela" (teclado numérico) e "Parcelas" (− n +, de 1 a 24, começa em 1), e o botão "Ver".
  - Resposta grande: "Pode comprar" ou "Não pode", com o primeiro mês negativo e quanto falta. Se a previsão já fica negativa sem a compra, o app diz isso antes.
  - Lista dos próximos H meses com a sobra antes → depois da compra, negativos em vermelho.
- **Ajustes:**
  - Contas: lista das ativas na ordem, com nome, tipo e valor padrão. Tocar abre a edição (nome, "Conta" ou "Entrada", valor padrão opcional). Setas ↑↓ mudam a ordem. "Arquivar" em vez de excluir, com confirmação; o histórico nunca é apagado. Seção "Arquivadas", recolhida, com "Reativar". "Nova conta" pede nome, tipo e valor padrão opcional e entra no fim da lista.
  - Check-in: "Toda vez", "1x por dia" ou "1x por semana".
  - Próximos meses: horizonte de 1 a 12 meses, usado no Mês e no Posso comprar?.
  - Conexão: o endereço da planilha resumido e "Trocar planilha", com confirmação (apaga URL, chave e dados guardados no aparelho e volta para a configuração).
  - Tudo grava em segundo plano, com o mesmo aviso de gravação da tela Mês.

## Dados

- O histórico começa no mês atual. Anos anteriores não são importados.
- **Ambiente de teste:** a planilha do Fabiano (a da Fase 0). A massa de teste é gerada pelo painel, e só funciona se a aba `Config` tiver a linha `ambiente = teste`.
- **Planilha da esposa:** criada do zero na entrega, na conta do Fabiano e compartilhada com ela como Leitora, sem a linha `ambiente`. No mesmo passo, o Fabiano manda para ela um link de configuração (URL e chave num link), para ela não digitar nada. A carga real é feita pelo próprio app (telas Mês e Ajustes), sem digitar no Sheets.
- **Link de configuração:** `…/simple-finance/#conectar?u=<URL>&k=<chave>`, gerado no painel. Abrir o link configura o aparelho e tira o link da barra de endereço. Se o aparelho já estiver ligado a outra planilha, o app pede confirmação antes de trocar e apaga os dados guardados. Na tela de configuração, ela também pode colar o link (necessário no iPhone, onde o app instalado não enxerga o que foi configurado no Safari).
- **Primeiro uso:** sem nenhuma conta ativa, o check-in não abre sozinho; a tela Mês convida a cadastrar o salário e as contas ("Cadastrar contas" → Ajustes). Com a primeira conta cadastrada, voltar ao Mês abre o primeiro check-in.
- A planilha continua legível para ela, com abas e cabeçalhos em PT-BR e uma aba `Resumo` opcional, com contas × meses.

## Fases

| Fase | Entrega |
|---|---|
| 1 — dados e regras | Abas, API, cache local com fila de gravação, cálculo com testes. Plano: `plans/phase-1.md` |
| 2 — substitui a planilha | Telas Check-in e Mês (com Próximos meses), app instalável. Plano: `plans/phase-2.md` |
| 3 | Posso comprar?, revisão semanal guiada, Ajustes, barra inferior e lembrete. Plano: `plans/phase-3.md` |
| 4 — usabilidade | "Falta receber" no cartão do mês e switches "Recebi"/"Paguei" na tela Mês. Plano: `plans/phase-4.md` |
| 5 — pago por item | Check por item na tela Mês (substitui os switches) e "Atualizar saldo" só com o saldo. Plano: `plans/phase-5.md` |
| Entrega | Planilha da esposa, link de configuração, primeiro uso e carga real. Plano: `plans/delivery.md` |

## Fora do escopo

Lançamento compra a compra, categorias, data de vencimento, push, gravar compras simuladas e importação de histórico.
