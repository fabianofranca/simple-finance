# App de Contas — contexto do projeto

## Objetivo
App web bem simples para a esposa do Fabiano gerenciar as contas da casa. Hoje ela controla tudo numa planilha Excel e tem dificuldade com isso. O app deve reproduzir o funcionamento dessa planilha de forma mais amigável, principalmente no celular.

- **Usuária final:** não técnica. Prioridades: simplicidade, poucos toques, textos claros em PT-BR.
- **Desenvolvedor:** Fabiano, dev sênior (Android/iOS, Kotlin), aprendendo Java. Prefere comunicação direta e pragmática, sempre em PT-BR.

## Decisões técnicas (já fechadas)
| Tema | Decisão | Motivo |
|---|---|---|
| Hospedagem | GitHub Pages (repo público) | Grátis, sem servidor |
| Backend/dados | Google Apps Script como App da Web, vinculado a uma planilha Google Sheets | Evita setup no Google Cloud Console (OAuth, Client ID), que o Fabiano achou complexo demais. Bônus: a esposa pode ver os dados direto no Sheets |
| Alternativa descartada | Drive API + Google Identity Services com JSON no Drive | Exige projeto no Cloud, tela de consentimento e Client ID |
| Frontend | HTML/CSS/JS puros com ES modules, sem build | Simplicidade |
| Segurança | Chave secreta validada no Apps Script. A URL e a chave são digitadas pelo usuário no primeiro acesso e ficam no `localStorage`, nunca no repo | O repo é público e a URL do Apps Script funciona como senha |

## Pegadinhas conhecidas
- **CORS:** todo POST usa `Content-Type: text/plain;charset=utf-8` e nenhum header customizado. O Apps Script não suporta preflight.
- **Redirect:** o Apps Script responde com 302. No `curl` use `-L`; o `fetch` segue sozinho.
- **Mudanças no script:** use *Gerenciar implantações → Editar → Nova versão* para manter a mesma URL. Uma nova implantação gera URL nova.
- **Erros de CORS ou de rede:** quase sempre o acesso não está como "qualquer pessoa", ou a URL usada é a `/dev` em vez da `/exec`.
- **Latência:** cada chamada leva de 1 a 2 segundos. Fases futuras devem usar cache local e salvar em segundo plano.

## Arquivos
- `PLAN.md`: plano da Fase 0 (setup e teste de leitura e gravação na planilha). É a fonte de verdade da fase atual.
- `Code.gs`: backend inicial, com GET que lê as linhas e POST com `action: append`.
- `index.html`: página de teste inicial, que vai ser separada em `src/` conforme o plano.

## Status
- [x] Arquitetura definida
- [x] Plano da Fase 0 escrito
- [ ] Fase 0 executada: smoke test passando e teste validado no celular da esposa
- [ ] Fase 1: modelar os dados a partir da planilha Excel dela. O Fabiano ainda vai explicar como a planilha funciona (colunas, abas, fórmulas, uso no dia a dia)
- [ ] Fase 2 em diante: telas do app (a ideia inicial é uma lista do mês com botão "paguei" e destaque para vencimentos)

## Como trabalhar neste repo
- **Fases:** cada fase tem seu próprio plano em Markdown, aprovado pelo Fabiano antes de executar.
- **Execução:** Sonnet com esforço médio.
- **Ações manuais:** o que só o Fabiano pode fazer (planilha, implantação, `.env`, GitHub Pages) vira uma pausa explícita com passo a passo.
- **Commits:** nunca fazer commit ou push sem confirmação.
- **Escopo:** não adicionar frameworks, build ou dependências sem discutir antes.
- **Este arquivo:** atualize a seção Status ao concluir cada etapa.
