# Simple Finance

App web simples para a esposa do Fabiano gerenciar as contas da casa, no lugar da planilha Excel. O site é estático (GitHub Pages) e usa uma planilha do Google Sheets como banco de dados, via Google Apps Script. Especificação de produto: [`docs/product.md`](docs/product.md). Plano da fase atual: [`plans/phase-4.md`](plans/phase-4.md).

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

## Como o app funciona (Fases 2 a 4)

- Na primeira abertura, pede o endereço (URL `/exec`) e a chave.
- **Barra inferior:** Mês · Posso comprar? · Ajustes (rotas `#mes`, `#comprar`, `#ajustes`). Check-in e revisão abrem sem a barra.
- O check-in abre sozinho 1 vez por dia (ajustável em Ajustes). "Agora não" adia até amanhã (com "Toda vez", só pula aquela abertura); "Atualizar saldo de outubro" (na tela Mês) abre à mão.
- A tela Mês tem ‹ › para trocar de mês e "Próximos meses" no mês atual. Tocar no valor edita; "Usar o valor padrão" aparece quando a conta tem padrão.
- **Cartão do mês atual:** Na conta, **Falta receber**, Falta pagar e Sobra no fim do mês. A conta fecha: na conta + falta receber − falta pagar = sobra.
- **Switches "Recebi" (Entradas) e "Paguei" (Contas):** só no mês atual, e sempre pedem o saldo junto.
  - Com check-in no mês, abre um diálogo (ex.: "Contas de outubro pagas") com o último saldo preenchido; "Confirmar" grava e "Cancelar" não muda nada.
  - Sem check-in no mês, abre o "Atualizar saldo" (`#checkin/recebi` ou `#checkin/paguei`) com a resposta já marcada.
  - Desligar um switch desfaz a marcação, e a pergunta volta no "Atualizar saldo".
- **Posso comprar?:** informe a parcela e a quantidade (1x a 24x) e toque em "Ver". O app responde se pode ou não, com a sobra mês a mês antes e depois da compra.
- **Revisão semanal** (`#revisao`, botão "Revisar valores" na tela Mês): uma pergunta por vez, só sobre o mês que vem. Cada resposta é gravada na hora; a data da última revisão (`lastReviewAt`) só é gravada ao terminar. No fim mostra a sobra antes e depois.
- **Lembrete:** a tela Mês mostra uma faixa com "Revisar agora" quando faz 7 dias ou mais sem revisar, ou quando nunca houve revisão.
- **Ajustes:**
  - Entradas e Contas em listas separadas; ↑ e ↓ reordenam dentro do mesmo tipo.
  - "Nova conta", tocar na conta para editar, "Arquivar" (o histórico continua guardado) e "Reativar" em "Arquivadas".
  - Frequência do check-in: "Toda vez", "1x por dia" ou "1x por semana".
  - Próximos meses: de 1 a 12, vale também para o Posso comprar?.
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
2. Ligue "Recebi" e informe o saldo. Depois ligue "Paguei" e informe o saldo. O cartão continua fechando.
3. Desligue um dos dois: o switch apaga a marcação. Toque em "Atualizar saldo" e veja a pergunta voltar.
4. Abra um diálogo (ligando ou desligando um switch), toque em "Cancelar" e confira que nada mudou.

## Abas e colunas

Para leitura no Sheets. A API trabalha em centavos; a planilha, em reais.

| Aba | Colunas |
|---|---|
| `Contas` | `id`, `nome`, `tipo` (despesa/receita), `valor_padrao`, `ordem`, `ativa` |
| `Lancamentos` | `conta_id`, `mes`, `valor`, `atualizado_em` |
| `Checkins` | `data`, `mes`, `saldo`, `contas_pagas`, `salario_caiu`, `sobra_prevista` |
| `Config` | `chave`, `valor` (`frequencia_checkin`, `horizonte_meses`, `ultima_revisao`, `ambiente`) |

- O mês é texto `YYYY-MM` (não deixe o Sheets converter em data).
- Valores em reais; `ativa`, `contas_pagas` e `salario_caiu` são caixas de seleção.
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
  - `./scripts/smoke-test.sh`: modo padrão, não destrutivo.
  - `SMOKE_FULL=1 ./scripts/smoke-test.sh`: só na planilha de teste. Apaga tudo, roda a suíte completa e termina com a massa de exemplo. Nunca aponte para a planilha da esposa.

## Ícones

`icons/icon.svg` é a fonte. Os PNGs (`icon-192.png`, `icon-512.png` e `apple-touch-icon.png` em 180×180, sem transparência) são gerados renderizando o SVG nesses tamanhos com qualquer ferramenta (ex.: Chromium/Playwright, Inkscape). O script usado não fica no repo.

## Segurança

O repositório é público. A URL do Apps Script e a chave nunca entram no código: ficam no `.env` (ignorado pelo git) e no `localStorage`. Quem tiver a URL e a chave lê e grava na planilha, então não compartilhe os dois.
