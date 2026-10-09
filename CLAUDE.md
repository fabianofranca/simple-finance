# App de Contas — contexto do projeto

## Objetivo
App web bem simples para a esposa do Fabiano gerenciar as contas da casa. Hoje ela controla tudo numa planilha Excel e tem dificuldade com isso. O app deve reproduzir o funcionamento dessa planilha de forma mais amigável, principalmente no celular.

- **Usuária final:** não técnica. Prioridades: simplicidade, poucos toques, textos claros em PT-BR.
- **Desenvolvedor:** Fabiano, dev sênior (Android/iOS, Kotlin), aprendendo Java. Prefere comunicação direta e pragmática, sempre em PT-BR.
- **Princípio de produto:** mais humano, menos planilha. Sempre que der, o app pergunta em vez de pedir para preencher campos.

## Decisões técnicas (já fechadas)
| Tema | Decisão | Motivo |
|---|---|---|
| Hospedagem | GitHub Pages (repo público) | Grátis, sem servidor |
| Backend/dados | Google Apps Script como App da Web, vinculado a uma planilha Google Sheets | Evita setup no Google Cloud Console (OAuth, Client ID), que o Fabiano achou complexo demais. Bônus: a esposa pode ver os dados direto no Sheets |
| Alternativa descartada | Drive API + Google Identity Services com JSON no Drive | Exige projeto no Cloud, tela de consentimento e Client ID |
| Frontend | HTML/CSS/JS puros com ES modules, sem build | Simplicidade |
| Segurança | Chave secreta validada no Apps Script. A URL e a chave são digitadas pelo usuário no primeiro acesso e ficam no `localStorage`, nunca no repo | O repo é público e a URL do Apps Script funciona como senha |
| Ambientes | A planilha da Fase 0 é a de teste do Fabiano (massa de teste gerada pelo app, liberada por `ambiente = teste` na aba Config). A planilha da esposa é criada do zero na entrega | Testar pelo celular à vontade sem risco aos dados dela |
| Testes | `node --test` nativo, sem npm | Sem dependências nem build |

## Pegadinhas conhecidas
- **CORS:** todo POST usa `Content-Type: text/plain;charset=utf-8` e nenhum header customizado. O Apps Script não suporta preflight.
- **Redirect:** o Apps Script responde com 302. No `curl` use `-L`; o `fetch` segue sozinho.
- **Mudanças no script:** use *Gerenciar implantações → Editar → Nova versão* para manter a mesma URL. Uma nova implantação gera URL nova. Cole o arquivo inteiro, sem editar: a chave fica nas Propriedades do script.
- **Erros de CORS ou de rede:** quase sempre o acesso não está como "qualquer pessoa", ou a URL usada é a `/dev` em vez da `/exec`.
- **Latência:** cada chamada leva de 1 a 2 segundos. Fases futuras devem usar cache local e salvar em segundo plano.

## Arquivos
- `PLAN.md`: plano da Fase 0 (concluída).
- `docs/product.md`: especificação de produto, fonte de verdade das decisões.
- `plans/phase-1.md`: plano da Fase 1.
- `plans/phase-2.md`: plano da Fase 2.
- `plans/phase-3.md`: plano da Fase 3.
- `apps-script/Code.gs`: backend. GET devolve tudo (contas, lançamentos, check-ins, ajustes); POST com `saveAccount`, `saveEntries`, `saveCheckin`, `saveSettings`, `ping`, e `seed`/`reset` só com `ambiente = teste`. Chave nas Propriedades do script; cola-se o arquivo inteiro, sem editar.
- `index.html`: o app (casca, faixa de aviso, manifest e metas de iOS).
- `dev.html` + `src/dev.js` + `styles.css`: painel de desenvolvimento (fora do app; mesma config e cache).
- `src/config.js`: URL e chave no `localStorage`.
- `src/api.js`: cliente do Apps Script (`loadAll`, `save*`, `seed`, `reset`, `ping`), com timeout e medição de latência.
- `src/store.js`: cache local e fila de gravação em segundo plano; `clear()` apaga dados e fila (trocar planilha).
- `src/forecast.js`: cálculo do fluxo de caixa (módulo puro).
- `src/app.js`: roteador por hash (`#mes`, `#mes/AAAA-MM`, `#comprar`, `#ajustes`, `#revisao`, `#checkin`, `#checkin/auto`), barra inferior (Mês · Posso comprar? · Ajustes), faixa de aviso e abertura automática do check-in.
- `src/screens/`: telas `setup.js` (configuração), `month.js` (Mês), `checkin.js` (Check-in), `buy.js` (Posso comprar?), `review.js` (Revisão) e `settings.js` (Ajustes), no contrato `mount(el, ctx)` → `unmount()`.
- `src/screens/ui.js`: helpers de tela (`h`, `money`, `queueLine`, `confirmDialog`).
- `src/money.js`, `src/checkin.js`, `src/month-view.js`, `src/buy-view.js`, `src/review.js`, `src/accounts.js`: lógica pura das telas (dinheiro pt-BR, regras do check-in, o que a tela Mês exibe, resposta do Posso comprar?, perguntas e lembrete da revisão, ordem e arquivo das contas).
- `styles/`: `app.css` (tokens e base), `month.css`, `checkin.css`, `buy.css`, `review.css`, `settings.css`.
- `manifest.webmanifest` + `icons/`: app instalável na tela inicial (`icon.svg` é a fonte dos PNGs).
- `tests/`: testes com `node --test`.
- `scripts/smoke-test.sh`: teste via `curl`; modo padrão (não destrutivo) e `SMOKE_FULL=1` (só na planilha de teste).
- `README.md`: setup, painel, abas e desenvolvimento.

## Status
- [x] Arquitetura definida
- [x] Plano da Fase 0 escrito
- [x] Fase 0 executada: smoke test passando e teste validado no celular
- [x] Planilha explicada e solução de produto definida (docs/product.md)
- [x] Plano da Fase 1 escrito (plans/phase-1.md)
- [x] Fase 1 executada: dados e regras (abas, API, cache, cálculo com testes); smoke test e teste no celular OK
- [x] Plano da Fase 2 escrito (plans/phase-2.md)
- [x] Fase 2 executada: telas Check-in e Mês, app instalável; roteiro validado no celular
- [x] Plano da Fase 3 escrito (plans/phase-3.md)
- [x] Fase 3 executada: Posso comprar?, revisão semanal guiada, Ajustes, barra inferior e lembrete; roteiro validado no celular
- [ ] Entrega: planilha da esposa, link de configuração e carga real

## Como trabalhar neste repo
- **Fases:** cada fase tem seu próprio plano em Markdown, aprovado pelo Fabiano antes de executar.
- **Papéis:** a sessão principal é a coordenadora. Junto com o Fabiano, ela atua como produto e arquitetura para fechar a solução. Na execução, quebra cada etapa em tarefas e delega para subagentes, escolhendo modelo e esforço conforme a complexidade de cada tarefa.
- **Paralelismo:** tarefas que mexem nos mesmos arquivos rodam em sequência. Tarefas independentes podem rodar em paralelo, cada uma isolada.
- **Branches e PRs:** um PR por tarefa, cada um na sua própria branch. O agente faz commit e push na branch da tarefa; a coordenadora revisa o diff e abre o PR. O `main` só muda com aprovação e merge do Fabiano.
- **Ações manuais:** o que só o Fabiano pode fazer (planilha, implantação, `.env`, GitHub Pages) vira uma pausa explícita com passo a passo.
- **Escopo:** não adicionar frameworks, build ou dependências sem discutir antes.
- **Este arquivo:** atualize a seção Status ao concluir cada etapa.
