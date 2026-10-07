# Simple Finance

App web simples para contas domésticas. O site é estático (GitHub Pages) e usa uma planilha do Google Sheets como banco de dados, via Google Apps Script.

Esta é a **Fase 0**: validar que o site lê e grava na planilha.

## Setup

1. Crie uma planilha no Google Sheets e abra *Extensões → Apps Script*.
2. Apague o conteúdo do editor e cole o `apps-script/Code.gs`. Troque o valor de `SECRET` por uma chave longa e aleatória (por exemplo, `openssl rand -hex 24`). **Troque só no editor do Apps Script, nunca no repositório.**
3. Clique em *Implantar → Nova implantação → App da Web*, com **Executar como: eu** e **Acesso: qualquer pessoa**. Na tela "App não verificado", clique em *Avançado → Acessar*. Copie a URL que termina em `/exec`.
4. Ao alterar o script, use *Implantar → Gerenciar implantações → Editar → Nova versão*, para manter a mesma URL.
5. Ative o GitHub Pages em *Settings → Pages*, com a branch `main` e a pasta raiz.
6. Rode o smoke test localmente:
   ```bash
   cp .env.example .env   # preencha APPS_SCRIPT_URL e APPS_SCRIPT_KEY
   ./scripts/smoke-test.sh
   ```

## Rodar o site localmente

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`, informe a URL e a chave na primeira abertura e use os botões de teste. A configuração fica salva só no `localStorage` do navegador.

## Segurança

O repositório é público. A URL do Apps Script e a chave **nunca** entram no código: o `.env` está no `.gitignore` e o app pede os dois valores na primeira abertura. Quem tiver a URL e a chave lê e grava na planilha, então não compartilhe os dois.
