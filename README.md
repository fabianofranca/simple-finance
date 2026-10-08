# Simple Finance

App web simples para a esposa do Fabiano gerenciar as contas da casa, no lugar da planilha Excel. O site é estático (GitHub Pages) e usa uma planilha do Google Sheets como banco de dados, via Google Apps Script. Especificação de produto: [`docs/product.md`](docs/product.md). Plano da fase atual: [`plans/phase-1.md`](plans/phase-1.md).

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

## Painel de desenvolvimento

O `index.html` é um painel de desenvolvimento até a Fase 2 trazer as telas de verdade. Na primeira abertura, informe a URL `/exec` e a chave e toque em *Salvar configuração* (ficam só no `localStorage`).

- **Estado da fila** (sempre visível): "Tudo salvo", "Enviando…" ou "N gravação(ões) pendente(s)". Em erro de chave ou de dados, aparecem *Tentar de novo* e *Descartar pendências*.
- **Testar conexão:** `ping`, mostra a latência.
- **Carregar dados:** busca tudo no servidor (reaplicando a fila pendente).
- **Ver previsão:** mostra o mês atual (na conta, falta pagar, sobra no fim do mês) e a sobra acumulada dos próximos 3 meses.
- **Regravar ajustes:** grava os ajustes atuais de novo (idempotente); serve para testar a fila.
- **Gerar massa de teste / Apagar tudo:** só aparecem na planilha de teste.

Roteiro de conferência no celular:

1. *Gerar massa de teste*, depois *Ver previsão*.
2. Conferir com a tabela da massa: sobra no fim do mês atual **R$ 850**; próximos meses **R$ 1.600, R$ 1.700 e R$ 50**; meses seguintes da massa **R$ 400 e R$ 1.250**.
3. Modo avião, *Regravar ajustes*: deve mostrar 1 pendente.
4. Rede de volta: a fila esvazia e volta para "Tudo salvo".

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

## Segurança

O repositório é público. A URL do Apps Script e a chave nunca entram no código: ficam no `.env` (ignorado pelo git) e no `localStorage`. Quem tiver a URL e a chave lê e grava na planilha, então não compartilhe os dois.
