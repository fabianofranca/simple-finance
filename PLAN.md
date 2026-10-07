# Plano: App de Contas — Fase 0 (setup e teste de acesso à planilha)

## Contexto

App web simples para gerenciar contas domésticas, usado principalmente no celular por uma pessoa não técnica.

- **Frontend:** site estático hospedado no GitHub Pages (repo público).
- **Backend:** Google Apps Script publicado como "App da Web", vinculado a uma planilha do Google Sheets que funciona como banco de dados.
- **Objetivo desta fase:** validar, de ponta a ponta, que o site no GitHub Pages lê e grava na planilha. A modelagem das contas fica para a próxima fase.

## Restrições

1. **Sem build.** HTML, CSS e JavaScript puros, com ES modules (`<script type="module">`). Nada de npm no frontend.
2. **Nenhum segredo no repositório.** A URL do Apps Script e a chave nunca entram no código. O usuário informa as duas na primeira abertura do app, e elas ficam salvas no `localStorage`.
3. **CORS do Apps Script:**
   - Todo POST usa `Content-Type: text/plain;charset=utf-8`, para evitar o preflight, que o Apps Script não suporta.
   - Não enviar headers customizados.
   - O GET passa a chave por query string.
4. **Mobile first.**
   - Layout para telas a partir de 360px.
   - Botões com área de toque de pelo menos 44px.
   - Suporte a dark mode via `prefers-color-scheme`.
5. **Idioma:** textos da interface em PT-BR; código e nomes de arquivos em inglês.

## Estrutura do repositório

```
/
├── index.html            # tela de configuração + painel de teste
├── src/
│   ├── config.js         # leitura/gravação da config no localStorage
│   ├── api.js            # cliente do Apps Script (get, post, tratamento de erro)
│   └── main.js           # liga a UI às funções
├── styles.css
├── apps-script/
│   └── Code.gs           # backend (copiado manualmente para o editor do Apps Script)
├── scripts/
│   └── smoke-test.sh     # teste via curl usando variáveis de ambiente
├── .env.example          # APPS_SCRIPT_URL= / APPS_SCRIPT_KEY=
├── .gitignore            # inclui .env
└── README.md             # passo a passo de setup
```

Se já existirem `Code.gs` e `index.html` na raiz, use-os como base. Separe o JS inline do `index.html` em `src/` seguindo esta estrutura.

## Contrato da API (Apps Script)

| Método | Request | Response de sucesso |
|---|---|---|
| GET | `?key=<chave>` | `{ "ok": true, "rows": [ {coluna: valor}, ... ] }` |
| POST | body `{ "key", "action": "append", "row": {...} }` | `{ "ok": true }` |
| POST | body `{ "key", "action": "ping" }` | `{ "ok": true, "time": "<ISO>" }` |

- **Erros:** sempre retornam `{ "ok": false, "error": "<codigo>" }`. Os códigos possíveis são `unauthorized`, `invalid_json` e `unknown_action`.
- **Planilha:** a primeira linha da aba `Teste` é o cabeçalho. Se a aba não existir, o script cria.
- **Gravação:** todo POST de escrita usa `LockService.getScriptLock()`.
- **Chave:** a chave fica numa constante `SECRET` no topo do `Code.gs`, com o valor placeholder `troque-por-uma-chave-longa`.

## Tarefas

### 1. Backend (`apps-script/Code.gs`)
- Implementar `doGet` e `doPost` conforme o contrato.
- Incluir a action `ping`.
- Adicionar comentários curtos explicando como implantar.
- **Aceite:** o código não usa nada fora de `SpreadsheetApp`, `ContentService` e `LockService`.

### 2. Frontend
- **`config.js`:** funções `loadConfig()`, `saveConfig({url, key})` e `clearConfig()`. Toda leitura do `localStorage` fica em try/catch.
- **`api.js`:**
  - Funções `getRows()`, `appendRow(row)` e `ping()`.
  - Cada chamada mede a latência em ms e lança um `Error` com mensagem em PT-BR quando `ok` for `false` ou a rede falhar.
  - Timeout de 15s via `AbortController`.
- **`index.html` + `main.js`:**
  - Seção de configuração com URL, chave e os botões "Salvar" e "Apagar".
  - Botões "Testar conexão" (ping), "Ler planilha" e "Gravar linha de teste".
  - Área de resultado que mostra o JSON formatado e a latência.
  - Erros aparecem em destaque, com uma dica de causa provável. Por exemplo, um erro de rede costuma indicar implantação sem acesso "qualquer pessoa" ou URL `/dev` em vez de `/exec`.
- **Aceite:** abrir `index.html` via `python3 -m http.server` funciona sem erros no console.

### 3. Smoke test (`scripts/smoke-test.sh`)
- Ler `APPS_SCRIPT_URL` e `APPS_SCRIPT_KEY` do `.env`.
- Fazer, nesta ordem: ping, append de uma linha com timestamp e GET para confirmar que a linha aparece.
- Usar `curl -L`, porque o Apps Script responde com redirect 302.
- Sair com código diferente de zero em qualquer falha.

### 4. README.md
Passo a passo enxuto, em PT-BR:
1. Criar a planilha e abrir *Extensões → Apps Script*.
2. Colar o `Code.gs` e trocar o `SECRET`.
3. Implantar como App da Web, com "Executar como: eu" e "Acesso: qualquer pessoa". Na tela "App não verificado", clicar em *Avançado → Acessar*.
4. Ao alterar o script, usar *Gerenciar implantações → Editar → Nova versão*, para manter a mesma URL.
5. Ativar o GitHub Pages em *Settings → Pages*, com a branch `main` e a pasta raiz.
6. Rodar o smoke test localmente.

### 5. Pausas obrigatórias (ações manuais do usuário)
Pare e peça ao usuário para executar e confirmar:
- **Depois da tarefa 1:** criar a planilha, colar o script, implantar e preencher o `.env` com a URL e a chave.
- **Depois das tarefas 2 e 3:** rode você mesmo o `scripts/smoke-test.sh` e reporte o resultado.
- **Antes do push:** confirmar que `.env` está no `.gitignore` e que nenhuma URL `script.google.com` aparece em arquivos versionados. Use `git grep script.google.com`, que deve retornar vazio fora do README e de placeholders.

## Fora do escopo desta fase
- Modelagem das contas (vencimento, categorias, status de pagamento). Ela vem da planilha Excel existente e será definida na próxima fase.
- Edição e exclusão de linhas, cache offline e sincronização.
- Qualquer framework ou etapa de build.

## Critério de pronto
- O smoke test passa localmente.
- O site publicado no GitHub Pages, aberto no celular, salva a config, faz ping, grava e lê a linha de teste.
- A linha aparece na planilha.
