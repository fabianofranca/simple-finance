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
- **Switches "Recebi" (Entradas) e "Paguei" (Contas):** só no mês atual, um toque, sem diálogo, e nunca mudam a sobra.
  - Ligar "Recebi" transforma as entradas estimadas em lançamentos (some o "estimado") e soma o total ao "Na conta". Ligar "Paguei" faz o mesmo com as contas e desconta.
  - Desligar faz o inverso no saldo; os lançamentos ficam.
  - Aparece uma confirmação curta, que some com um toque (ex.: "Salário de outubro somado: + R$ 3.000,00 na conta.").
  - Sem check-in no mês, abre o "Atualizar saldo" (`#checkin/recebi` ou `#checkin/paguei`) com a resposta já marcada.
  - Se o valor real vier diferente do estimado, o "Atualizar saldo" corrige o "Na conta".

### Como forçar o lembrete

Na aba `Config` da planilha de teste, apague o valor da chave `ultima_revisao` (sem revisão nenhuma o lembrete aparece) ou digite uma data antiga em ISO, por exemplo `2026-09-20T12:00:00Z`. Reabra o app.

## Roteiro de conferência da Fase 4

No celular, com a planilha de teste (sem implantar o backend de novo):

1. Abra a tela Mês e confira o cartão: na conta + falta receber − falta pagar = sobra.
2. Ligue "Recebi": o "estimado" some das entradas, o "Na conta" sobe e a sobra fica igual.
3. Ligue "Paguei": o "estimado" some das contas, o "Na conta" desce e a sobra fica igual.
4. Desligue um dos dois: o "Na conta" volta, e a pergunta reaparece no "Atualizar saldo".

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
