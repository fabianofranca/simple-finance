# Simple Finance

App web simples para a esposa do Fabiano gerenciar as contas da casa, no lugar da planilha Excel. O site é estático (GitHub Pages) e usa uma planilha do Google Sheets como banco de dados, via Google Apps Script. Especificação de produto: [`docs/product.md`](docs/product.md). Plano da fase atual: [`plans/phase-7.md`](plans/phase-7.md).

- **`index.html` é o app** (Mês, Check-in, Posso comprar?, Revisar valores e Ajustes).
- **`dev.html` é o painel de desenvolvimento**: mesmo site, mesma configuração e mesmo cache. Abra em `…/simple-finance/dev.html`.

## Backend (primeira vez)

1. Crie uma planilha no Google Sheets e abra *Extensões → Apps Script*.
2. Cole o `apps-script/Code.gs` inteiro, **sem editar nada**.
3. *Configurações do projeto → Propriedades do script*: adicione `SECRET` = uma chave longa e aleatória (ex.: `openssl rand -hex 24`).
4. *Implantar → Nova implantação → App da Web*, com **Executar como: eu** e **Acesso: qualquer pessoa**. Na tela "App não verificado": *Avançado → Acessar*.
5. Copie a URL que termina em `/exec` (nunca a `/dev`).
6. A primeira chamada (ex.: "Testar conexão" no painel) cria as abas.

## Atualizar o backend

Cole o `Code.gs` inteiro de novo e use *Implantar → Gerenciar implantações → Editar → Nova versão*. Assim a URL continua a mesma; uma nova implantação gera URL nova.

Abas e colunas novas do script entram sozinhas na primeira chamada depois da Nova versão, sem mexer nos dados (ex.: `pago` e `pago_em` da Fase 5; aba `Compras` e coluna `cartao` da Fase 6; coluna `excluida` da Fase 7).

## Planilha de teste × planilha da esposa

- **Teste:** tem a linha `ambiente | teste` na aba `Config`. Ela libera "Gerar massa de teste" e "Apagar tudo" no painel e o `SMOKE_FULL` do smoke test. Dá para adicionar pelo app do Sheets no celular.
- **Esposa:** criada do zero na entrega, sem essa linha.
- A aba `Teste` antiga (Fase 0) pode ser apagada.

## GitHub Pages

*Settings → Pages*, branch `main`, pasta raiz.

## Instalar no celular

- **Android:** Chrome → menu ⋮ → "Instalar app" (ou "Adicionar à tela inicial").
- **iPhone:** Safari → Compartilhar → "Adicionar à Tela de Início".

O app abre pelo ícone "Contas", sem a barra do navegador.

## Como o app funciona (Fases 2 a 7 e Entrega)

- Na primeira abertura, pede o link de configuração (abrir o link ou colar na tela; endereço `/exec` e chave só em "Configurar à mão").
- **Primeiro uso:** planilha sem contas ativas mostra "Vamos começar?" na tela Mês, com o botão "Cadastrar contas" (leva a Ajustes), e o check-in não abre sozinho. O primeiro saldo só é pedido depois da primeira conta.
- **Barra inferior:** Mês · Posso comprar? · Ajustes (rotas `#mes`, `#comprar`, `#ajustes`). Check-in e revisão abrem sem a barra.
- O check-in ("Atualizar saldo") pede só o saldo: "Como está outubro?", o campo "Na conta" e "Confirmar". Abre sozinho 1 vez por dia (ajustável em Ajustes). "Agora não" adia até amanhã (com "Toda vez", só pula aquela abertura); "Atualizar saldo de outubro" (na tela Mês) abre à mão.
- A tela Mês tem ‹ › para trocar de mês e "Próximos meses" no mês atual. Tocar no valor edita; "Usar o valor padrão" aparece quando a conta tem padrão.
- **Cartão do mês atual:** Na conta, **Falta receber**, Falta pagar e Sobra no fim do mês. A conta fecha: na conta + falta receber − falta pagar = sobra.
- **Check por item (Fase 5):** à esquerda do nome de cada conta (pago) e de cada entrada (recebido), só no mês atual. Meses passados e futuros não têm check. Um toque, e nunca muda a sobra.
  - Marcar passa o valor de "Falta pagar" (ou "Falta receber") para "Na conta". Se o valor era estimado, vira lançamento e o "estimado" some.
  - Desmarcar devolve o item para "Falta pagar" (ou "Falta receber").
  - Aparece uma confirmação curta, que some com um toque (ex.: "Nubank pago: − R$ 900,00 na conta." ou "Salário recebido: + R$ 3.000,00 na conta.").
  - Cada marcação guarda quando foi feita (`paidAt`). O "Na conta" é o último saldo informado, mais as entradas marcadas depois dele, menos as contas marcadas depois dele. Ao informar um saldo novo, as marcações antigas deixam de mexer no "Na conta".
  - "Usar o valor padrão" num item marcado mantém o lançamento e o check.
  - Se ela pagar no banco, atualizar o saldo e só depois marcar o item, o valor é descontado duas vezes e a sobra aparece menor. O próximo "Atualizar saldo" corrige.
- **Posso comprar?:** informe a parcela e a quantidade (1x a 24x) e toque em "Ver". O app responde se pode ou não, com a sobra mês a mês antes e depois da compra. "Ver" só simula.
- **Vou comprar (Fase 6):** só aparece com "Pode comprar". Com "Não pode", não há botão.
  - O toque pergunta "Em qual cartão?", com um botão por cartão ativo (na ordem das contas) e "Cancelar". Um toque no cartão lança, sem confirmação extra: dá para desfazer em Ajustes.
  - Sem nenhum cartão marcado, aparece "Marque quais contas são cartão em Ajustes." com o botão "Ir para Ajustes".
  - Lançar soma a parcela no valor do cartão em cada mês da compra: os mesmos meses da simulação, a partir do mês seguinte. Mês estimado vira lançamento (padrão + parcela) e o "estimado" some. A marcação de pago fica como está.
  - **Por que não conta duas vezes:** a parcela entra no valor da fatura, e não numa linha à parte. Quando ela atualiza a fatura com o valor do app do banco (na tela Mês ou na revisão), o valor novo substitui o anterior, que já tinha a parcela.
  - Depois de lançar, a faixa confirma ("Lançado no Nubank: 3 parcelas de R$ 150,00, de novembro a janeiro.") e o formulário volta ao início (valor vazio e 1x).
  - A compra e os valores do cartão vão numa chamada só (`savePurchase`), para nunca ficar metade gravada. A compra vira uma linha na aba `Compras`.
- **Revisão semanal** (`#revisao`, botão "Revisar valores" na tela Mês): uma pergunta por vez, só sobre o mês que vem. Cada resposta é gravada na hora; a data da última revisão (`lastReviewAt`) só é gravada ao terminar. No fim mostra a sobra antes e depois.
- **Lembrete:** a tela Mês mostra uma faixa com "Revisar agora" quando faz 7 dias ou mais sem revisar, ou quando nunca houve revisão.
- **Ajustes:**
  - Entradas e Contas em listas separadas; ↑ e ↓ reordenam dentro do mesmo tipo.
  - "Nova conta", tocar na conta para editar, "Arquivar", "Reativar" e "Excluir" em "Arquivadas".
  - **Arquivar (Fase 7):** apaga os valores dos meses seguintes ao atual e mantém o mês atual e o passado (histórico). Por isso a conta arquivada não reaparece nos meses futuros e deixa de entrar na sobra e nos Próximos meses. A confirmação diz quanto sai: "Arquivar Nubank? O histórico fica guardado. Os valores de novembro em diante (R$ 2.300,00) serão apagados." (sem valores futuros: "Arquivar Nubank? O histórico fica guardado."). Reativar não traz os valores de volta.
  - **Excluir (Fase 7):** só nas Arquivadas, ao lado de "Reativar". A conta sai de Ajustes de vez, sem "Reativar". A linha fica na planilha com `excluida` marcada, então os meses passados continuam mostrando o nome e os valores dela. Apaga também os valores dos meses seguintes ao atual (cobre contas arquivadas antes da Fase 7, que ainda têm valores futuros). Quando a última arquivada é excluída, a seção "Arquivadas" some.
  - Contas arquivadas antes da Fase 7 mantêm os valores futuros até serem excluídas, ou reativadas e arquivadas de novo. O app não apaga nada sozinho.
  - **"É cartão de crédito":** na edição de uma Conta (some com "Entrada"). Marca onde o "Vou comprar" pode lançar. Na lista, os cartões têm a etiqueta "cartão".
  - Frequência do check-in: "Toda vez", "1x por dia" ou "1x por semana".
  - Próximos meses: de 1 a 12, vale também para o Posso comprar?.
  - **Últimas compras (Fase 6):** as compras mais recentes lançadas pelo "Vou comprar" e ainda não desfeitas, da mais nova para a mais antiga. Só entram compras de cartões ativos (Fase 7): ao arquivar um cartão, as compras dele saem da lista, e reativar o cartão as traz de volta.
    - Cada item: "R$ 150,00 × 3 · Nubank" (com 1 parcela, sem o "× 1") e "Lançada em 15/10 · novembro a janeiro", com o botão "Desfazer". Lista vazia: "Nenhuma compra lançada pelo Posso comprar?.".
    - "Mostrar as últimas" (− n +): de 1 a 20, padrão 5. Além do limite, a compra some da lista, mas continua na aba `Compras`; só não dá mais para desfazer pelo app.
    - "Desfazer" confirma com o valor que sai: "R$ 150,00 por mês será removido do Nubank, de novembro a janeiro." (com 1 parcela: "R$ 150,00 será removido do Nubank em novembro.").
    - Se algum mês mudou depois da compra (ex.: ela editou a fatura), subtrai mesmo assim e avisa na mesma confirmação: "O valor de novembro mudou depois da compra. Confira depois.".
    - Nenhum mês fica negativo: se a subtração passar de zero, fica em 0.
    - Mês que fica com o valor que teria sem lançamento (o padrão, ou 0 sem padrão) e não está marcado como pago perde o lançamento: volta a "estimado", ou a "—".
    - Depois de desfazer, a compra sai da lista, a faixa avisa "Compra desfeita." e, na planilha, a linha ganha `desfeita_em` (nunca é apagada).
  - "Trocar planilha" apaga do aparelho o endereço, a chave, os dados em cache e as gravações ainda não enviadas, e volta à configuração.
- Estados de gravação: "Salvando…" e "Sem internet, vou tentar de novo".

## Painel de desenvolvimento (`dev.html`)

Na primeira abertura, informe a URL `/exec` e a chave e toque em *Salvar configuração* (ficam só no `localStorage`, compartilhado com o app).

- **Estado da fila** (sempre visível): "Tudo salvo", "Enviando…" ou "N gravação(ões) pendente(s)". Em erro de chave ou de dados, aparecem *Tentar de novo* e *Descartar pendências*.
- **Testar conexão:** `ping`, mostra a latência.
- **Carregar dados:** busca tudo no servidor (reaplicando a fila pendente).
- **Ver previsão:** mostra o mês atual (na conta, falta pagar, sobra no fim do mês) e a sobra acumulada dos próximos 3 meses.
- **Regravar ajustes:** grava os ajustes atuais de novo (idempotente); serve para testar a fila.
- **Gerar massa de teste / Apagar tudo:** só aparecem na planilha de teste.
- **Link de configuração:** informe a URL `/exec` e a chave (ou toque em "Gerar chave" para criar uma de 32 caracteres), toque em "Gerar link" e depois em "Copiar". Nada é gravado nem usa a configuração do aparelho.

Roteiro de conferência do painel (Fase 1):

1. *Gerar massa de teste*, depois *Ver previsão*.
2. Conferir com a tabela da massa: sobra no fim do mês atual **R$ 850**; próximos meses **R$ 1.600, R$ 1.700 e R$ 50**; meses seguintes da massa **R$ 400 e R$ 1.250**.
3. Modo avião, *Regravar ajustes*: deve mostrar 1 pendente.
4. Rede de volta: a fila esvazia e volta para "Tudo salvo".

## Roteiro de conferência da Fase 2

No celular, com a planilha de teste:

1. Implante o `Code.gs` atual (*Gerenciar implantações → Editar → Nova versão*).
2. No `dev.html`, toque em *Apagar tudo* e depois *Gerar massa de teste* (assim a `Config` fica com o check-in diário).
3. Abra o app, adicione à tela inicial e abra pelo ícone.
4. A tela Mês mostra Sobra **R$ 850,00** e, em Próximos meses, **R$ 1.600,00 / R$ 1.700,00 / R$ 50,00**.
5. Edite o Nubank do mês para **1.000,00**: a sobra vai para **R$ 750,00**.
6. Toque em *Atualizar saldo de outubro*, informe um saldo menor e confirme: aparece "Sua sobra … caiu …".
7. Modo avião, edite um valor: aparece "Sem internet, vou tentar de novo". Com a rede de volta, a mensagem some.

## Roteiro de conferência da Fase 3

No celular, com a planilha de teste (não precisa implantar o backend de novo):

1. Abra o app e navegue pela barra: Mês, Posso comprar?, Ajustes e de volta ao Mês.
2. Em Posso comprar?, teste um caso que pode (parcela pequena) e um que não pode (parcela maior que a sobra de algum mês). Confira os números com a sobra dos próximos meses na tela Mês.
3. Toque em "Revisar valores" na tela Mês, mude o valor de uma fatura e termine. Confira o antes e o depois no fim e na tela Mês.
4. Force o lembrete (veja abaixo), reabra o app e toque em "Revisar agora".
5. Em Ajustes: crie uma conta (ex.: "Farmácia", R$ 80,00), suba com ↑, arquive e reative. Mude a frequência do check-in e a quantidade de meses e veja o efeito em Mês e "Próximos meses".
6. "Trocar planilha" só se quiser testar: ele vai pedir URL e chave de novo.

### Como forçar o lembrete

Na aba `Config` da planilha de teste, apague o valor da chave `ultima_revisao` (sem revisão nenhuma o lembrete aparece) ou digite uma data antiga em ISO, por exemplo `2026-09-20T12:00:00Z`. Reabra o app.

## Roteiro de conferência da Fase 4

No celular, com a planilha de teste (sem implantar o backend de novo):

1. Abra a tela Mês e confira o cartão: na conta + falta receber − falta pagar = sobra.
2. Ligue "Recebi": o "estimado" some das entradas, o "Na conta" sobe e a sobra fica igual.
3. Ligue "Paguei": o "estimado" some das contas, o "Na conta" desce e a sobra fica igual.
4. Desligue um dos dois: o "Na conta" volta, e a pergunta reaparece no "Atualizar saldo".

Na Fase 5, esses switches foram substituídos pelo check por item (veja o roteiro da Fase 5).

## Roteiro de conferência da Fase 5

No celular, com a planilha de teste.

**Pausa 1: Nova versão do script**

1. Cole o `apps-script/Code.gs` inteiro de novo e use *Gerenciar implantações → Editar → Nova versão*.
2. Abra o app uma vez. Na aba `Lancamentos`, as colunas `pago` e `pago_em` devem aparecer no fim do cabeçalho. Faça o mesmo na planilha dela, se já tiver sido criada.

**Pausa 2: uso no celular**

1. Na tela Mês, marque e desmarque contas e entradas, vendo o "Na conta" e a sobra.
2. Confira que a sobra não muda ao marcar.
3. Toque em "Atualizar saldo": ele pede só o saldo. Confirme e veja o cartão fechar (na conta + falta receber − falta pagar = sobra).
4. Na aba `Lancamentos` da planilha, confira que o check aparece em `pago` e a data em `pago_em`.

## Roteiro de conferência da Fase 6

No celular, com a planilha de teste.

**Pausa 1: Nova versão do script**

1. Cole o `apps-script/Code.gs` inteiro de novo e use *Gerenciar implantações → Editar → Nova versão*.
2. Abra o app uma vez. Devem aparecer a aba `Compras` (vazia, com o cabeçalho `id`, `data`, `conta_id`, `parcela`, `parcelas`, `primeiro_mes`, `desfeita_em`) e a coluna `cartao` no fim do cabeçalho de `Contas`, desmarcada. Faça o mesmo na planilha dela, se já tiver sido criada.
3. A linha `compras_na_lista` da `Config` ainda não aparece: ela só entra quando o limite for mudado em Ajustes (até lá o app usa 5). Numa planilha nova, ou depois de "Gerar massa de teste"/"Apagar tudo", ela já vem.

**Pausa 2: marcar os cartões**

1. Em Ajustes, toque em cada cartão (Nubank, Inter, Renner, C&A), marque "É cartão de crédito" e salve. Na lista aparece a etiqueta "cartão" e, na aba `Contas`, a caixa `cartao` fica marcada. A massa de teste já vem com os quatro marcados.
2. Confira que a opção some ao trocar o tipo para "Entrada".

**Pausa 3: uso no celular**

1. Em Posso comprar?, simule uma compra que cabe (ex.: R$ 150,00 em 3x), toque em "Vou comprar" e escolha o Nubank. A faixa confirma o lançamento e o formulário volta ao início.
2. Na tela Mês, vá de novembro a janeiro (›): o Nubank tem R$ 150,00 a mais em cada mês, e o que era "estimado" ou "—" virou lançamento. O mês atual não muda.
3. Simule uma compra que não cabe: não aparece "Vou comprar".
4. Em Ajustes → Últimas compras, toque em "Desfazer" na compra: a confirmação mostra o valor e os meses. Confirme e veja os valores voltarem na tela Mês (mês sem lançamento antes volta a "estimado" ou "—"). Na aba `Compras`, a linha continua lá, com `desfeita_em` preenchido.
5. Lance outra compra, edite na tela Mês o valor do cartão num dos meses dela e desfaça a compra: a confirmação avisa "O valor de … mudou depois da compra. Confira depois.".
6. Com duas compras na lista, mude "Mostrar as últimas" para 1: só a mais recente aparece, e a outra continua na aba `Compras`. Volte para 5 e confira a linha `compras_na_lista` na `Config`.

## Roteiro de conferência da Fase 7

No celular, com a planilha de teste.

**Pausa 1: Nova versão do script**

1. Cole o `apps-script/Code.gs` inteiro de novo e use *Gerenciar implantações → Editar → Nova versão*, **nas duas planilhas** (a de teste e a dela, se já tiver sido criada).
2. Abra o app uma vez. A coluna `excluida` deve aparecer no fim do cabeçalho de `Contas`, desmarcada.

**Pausa 2: uso no celular**

1. Em Ajustes, arquive uma conta que tenha valores nos meses seguintes (ex.: Nubank da massa de teste). A confirmação diz quanto sai: "Os valores de novembro em diante (R$ …) serão apagados.". Confirme.
2. Na tela Mês, vá aos meses seguintes (›): a conta não aparece mais. No mês atual ela continua, e a sobra e os Próximos meses já não contam os valores dela.
3. Reative a conta: os valores apagados não voltam (ela aparece com "estimado" ou "—").
4. Arquive de novo, abra "Arquivadas" e toque em "Excluir". Confirme: a conta some de Ajustes.
5. Na tela Mês, volte aos meses passados: a conta continua lá, com o nome e os valores. Na aba `Contas`, a linha continua, com `excluida` marcada.
6. Com a última arquivada excluída, a seção "Arquivadas" some.
7. Em Ajustes → Últimas compras, confira que as compras de um cartão arquivado não aparecem.

**Pausa 3: planilha dela**

Na planilha dela, resolva a conta que reaparecia: "Excluir" (se já estiver arquivada) ou "Reativar" e "Arquivar" de novo.

## Entrega: planilha da esposa

Passo a passo para colocar o app na mão dela. Detalhes e decisões em [`plans/delivery.md`](plans/delivery.md).

### Criar a planilha dela

Na conta Google do Fabiano (assim ele mantém o script e as implantações):

1. Crie uma planilha nova, por exemplo "Contas da casa", e abra *Extensões → Apps Script*.
2. Cole o `apps-script/Code.gs` inteiro, **sem editar**.
3. No painel (`dev.html`), toque em "Gerar chave" (seção "Link de configuração") e copie a chave.
4. No Apps Script, *Configurações do projeto → Propriedades do script → Adicionar*: nome `SECRET`, valor igual à chave.
5. *Implantar → Nova implantação → App da Web*, com **Executar como: eu** e **Acesso: qualquer pessoa**. Autorize e copie a URL `/exec`.
6. Abra a planilha e confira que as abas foram criadas e que a `Config` **não** tem a linha `ambiente`.

### Gerar e testar o link

1. No painel (`dev.html`), seção "Link de configuração": informe a URL `/exec` e a chave, toque em "Gerar link" e depois em "Copiar".
2. Teste numa **aba anônima**, que tem armazenamento próprio. O app deve abrir vazio, com "Vamos começar?". Não cadastre nada ali.

O link tem o formato `https://fabianofranca.github.io/simple-finance/#conectar?u=<URL>&k=<chave>`. Fica depois do `#`, então não vai para o GitHub Pages, e o app o tira da barra de endereço e do histórico depois de usado. Quem tiver o link acessa a planilha: se vazar, troque a `SECRET` nas Propriedades do script (a URL continua a mesma).

### Compartilhar e mandar

- Compartilhe a planilha com ela como *Leitor*: ela vê tudo no Sheets, mas não muda abas e cabeçalhos sem querer. Ela edita os dados pelo app.
- Mande o link só para ela, pelo WhatsApp.

### Sessão de carga com ela

No celular dela, junto com o Fabiano:

1. Abra o link.
2. Instale o app. **Android:** menu do Chrome → "Instalar app". **iPhone:** Compartilhar → "Adicionar à Tela de Início", abra pelo ícone e **cole o link** na tela de configuração (o app instalado tem armazenamento separado do Safari).
3. Toque em "Cadastrar contas" e cadastre o Salário (Entrada, com valor padrão) e as contas da casa. Recorrentes, como Unha, levam valor padrão; faturas ficam sem padrão. Nos cartões, marque "É cartão de crédito".
4. Volte ao Mês: o primeiro check-in pede o saldo de hoje.
5. Preencha as faturas do mês atual e as dos próximos meses que ela já souber (›).
6. Marque o check das contas já pagas e das entradas já recebidas no mês. Depois toque em "Atualizar saldo de outubro" e confirme de novo o saldo real do banco: o que já tinha saído antes do primeiro saldo seria descontado duas vezes sem esse passo. Confira a sobra e os Próximos meses com ela.
7. Faça um "Posso comprar?" de exemplo. "Vou comprar" lança de verdade: se tocar só para mostrar, desfaça em Ajustes → Últimas compras.
8. Em Ajustes, escolha a frequência do check-in.

**Atenção:** abrir o link dela no celular do Fabiano troca a planilha daquele aparelho (o app pergunta antes e apaga os dados guardados ali). Para voltar à de teste, abra o link de teste ou use "Trocar planilha" em Ajustes.

## Abas e colunas

Para leitura no Sheets. A API trabalha em centavos; a planilha, em reais.

| Aba | Colunas |
|---|---|
| `Contas` | `id`, `nome`, `tipo` (despesa/receita), `valor_padrao`, `ordem`, `ativa`, `cartao` (caixa de seleção, "É cartão de crédito"), `excluida` (caixa de seleção, conta excluída em Ajustes) |
| `Lancamentos` | `conta_id`, `mes`, `valor`, `atualizado_em`, `pago` (caixa de seleção), `pago_em` (data ISO de quando foi marcado) |
| `Checkins` | `data`, `mes`, `saldo`, `contas_pagas`, `salario_caiu`, `sobra_prevista` |
| `Compras` | `id`, `data` (ISO de quando foi lançada), `conta_id` (o cartão), `parcela`, `parcelas`, `primeiro_mes`, `desfeita_em` (ISO ou vazio) |
| `Config` | `chave`, `valor` (`frequencia_checkin`, `horizonte_meses`, `compras_na_lista`, `ultima_revisao`, `ambiente`) |

- O mês é texto `YYYY-MM` (não deixe o Sheets converter em data).
- Valores em reais; `ativa`, `cartao`, `excluida`, `pago`, `contas_pagas` e `salario_caiu` são caixas de seleção.
- `cartao` vale só para despesa: numa receita o script grava sempre desmarcado.
- `excluida`: a conta excluída em Ajustes não é apagada da planilha, para os meses passados continuarem com o nome e os valores. Ela não volta pelo app. Para desfazer, desmarque `excluida` e marque `ativa` na planilha (o script recusa conta excluída e ativa ao mesmo tempo, então desmarque `excluida` primeiro ou junto).
- `Compras` guarda cada "Vou comprar". Desfazer preenche `desfeita_em`; a linha nunca é apagada. Compras além do limite da lista em Ajustes continuam aqui, para consulta.
- Nos meses da compra, o `atualizado_em` do lançamento do cartão é o `data` da compra (ou o `desfeita_em`, ao desfazer). É assim que o app percebe que um mês mudou depois da compra.
- `compras_na_lista` (1 a 20) é o tamanho da lista de Últimas compras. Numa planilha que já existia antes da Fase 6, a linha só aparece quando o limite for mudado em Ajustes (até lá o app usa 5); numa planilha nova, ou depois de seed/reset, ela já vem.
- O script lê pelo cabeçalho, então dá para reordenar colunas.
- Evite editar `id` e `conta_id` à mão sem necessidade.

## Aba `Resumo` (opcional, só leitura)

Visão de contas × meses. Crie uma aba `Resumo` e cole na A1 (fórmula em locale pt-BR, **a validar na planilha real**):

```
=QUERY({ARRAYFORMULA(SEERRO(PROCV(Lancamentos!A2:A;Contas!A2:B;2;FALSO)))\Lancamentos!B2:C};"select Col1, sum(Col3) where Col1 is not null group by Col1 pivot Col2";0)
```

Ela mostra só lançamentos, sem os valores padrão.

## Desenvolvimento

- Node ≥ 22.7. Testes: `node --test` na raiz (sem npm).
- Servir local: `python3 -m http.server 8000` e abra `http://localhost:8000`.
- Smoke test: `cp .env.example .env` e preencha `APPS_SCRIPT_URL` e `APPS_SCRIPT_KEY` (o `.env` está no `.gitignore`).
  - `./scripts/smoke-test.sh`: modo padrão, não destrutivo. Usa a conta arquivada "smoke-test" (inclusive a ida e volta de `deleted`, que termina desmarcado) e lançamentos em 2099. Não grava compra, porque as linhas da aba `Compras` não se apagam pela API: só confere que um `savePurchase` inválido não grava nada.
  - `SMOKE_FULL=1 ./scripts/smoke-test.sh`: só na planilha de teste. Apaga tudo, roda a suíte completa (inclusive lançar, reenviar e desfazer uma compra em 2099) e termina com a massa de exemplo. Nunca aponte para a planilha da esposa.
  - Os dois modos falham com uma dica se o script publicado ainda não é o da Fase 7.

## Ícones

`icons/icon.svg` é a fonte. Os PNGs (`icon-192.png`, `icon-512.png` e `apple-touch-icon.png` em 180×180, sem transparência) são gerados renderizando o SVG nesses tamanhos com qualquer ferramenta (ex.: Chromium/Playwright, Inkscape). O script usado não fica no repo.

## Segurança

O repositório é público. A URL do Apps Script e a chave nunca entram no código: ficam no `.env` (ignorado pelo git) e no `localStorage`. Quem tiver a URL e a chave lê e grava na planilha, então não compartilhe os dois.
