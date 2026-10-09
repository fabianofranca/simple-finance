# Plano: App de Contas — Entrega (planilha da esposa, link de configuração e carga real)

## Contexto

As Fases 1 a 4 entregaram o app completo, testado pelo Fabiano na planilha de teste. A Entrega coloca o app na mão dela:

1. **Planilha dela:** nova, criada do zero, com o mesmo `Code.gs`.
2. **Link de configuração:** ela abre um link e o app já fica configurado, sem digitar URL nem chave.
3. **Primeiro uso e carga real:** ela cadastra as contas e os valores pelo próprio app, numa sessão junto com o Fabiano.

Hoje, numa planilha vazia, o app abre direto no check-in perguntando "Contas de outubro: Já paguei?" antes de existir qualquer conta. Por isso entra também um ajuste pequeno de primeiro uso.

**Ponto de partida:**
- `src/config.js`: `loadConfig`, `saveConfig`, `clearConfig` e `shortUrl`.
- `src/screens/setup.js`: pede URL e chave.
- `src/app.js`: roteador por hash, `maybeOpenCheckin` na abertura e na volta para a frente da tela.
- `src/checkin.js`: `shouldOpenCheckin`.
- `src/store.js`: `clear()`.
- `src/screens/settings.js`: "Trocar planilha".
- `dev.html` + `src/dev.js`: painel.
- `apps-script/Code.gs`: a `Config` nasce sem a linha `ambiente`, então `seed` e `reset` já ficam bloqueados numa planilha nova.

## Restrições

1. Todas as das fases anteriores continuam: sem build, sem npm, sem framework, centavos no JS, `node --test`, mobile first, PT-BR na interface e código em inglês.
2. **Nenhum segredo no repo.** A URL e a chave dela nunca entram em código, teste, screenshot, PR ou README. Nos testes, use valores falsos (`https://script.google.com/macros/s/AKfyFAKE/exec`, `chave-teste`).
3. **Sem mudança de backend.** O mesmo `Code.gs` serve as duas planilhas.

## Decisões

- **Dona da planilha:** a conta Google do Fabiano. Ele mantém o script e as implantações sem depender da conta dela.
  - A planilha é compartilhada com ela como **Leitora**. Ela vê tudo no Sheets, mas não muda abas e cabeçalhos sem querer, o que quebraria o app.
  - Ela edita os dados pelo app.
- **Formato do link:** `https://fabianofranca.github.io/simple-finance/#conectar?u=<URL codificada>&k=<chave codificada>`.
  - Fica depois do `#`, então não é enviado ao GitHub Pages nem aparece em log de servidor.
  - Quem tiver o link acessa a planilha, a mesma regra da URL de hoje. Se vazar, o Fabiano troca a chave nas Propriedades do script, sem mudar a URL.
- **Ao abrir o link,** o app:
  - **valida:** a URL precisa ser `https://script.google.com/macros/s/<id>/exec` e a chave não pode ser vazia. Link inválido abre a configuração com "Esse link de configuração não está completo. Peça um novo ao Fabiano.";
  - **sem configuração no aparelho:** grava e abre o app;
  - **com a mesma configuração:** só abre o app;
  - **com outra configuração** (o celular do Fabiano, por exemplo): pede confirmação, "Esse link troca a planilha deste aparelho. Os dados guardados aqui serão apagados.". Confirmando, faz o mesmo que "Trocar planilha" (`clearConfig`, `store.clear()`, apaga `sf.snooze`) e grava a nova;
  - **em todos os casos:** tira o link da barra de endereço e do histórico (`history.replaceState`), para a chave não ficar visível nem voltar com "voltar".
- **Colar o link na configuração:** a tela de configuração ganha um campo principal, "Cole aqui o link que você recebeu", e os campos de endereço e chave passam para "Configurar à mão" (recolhido).
  - Isso cobre o iPhone: o app instalado na tela de início tem armazenamento separado do Safari, então quem configurou pelo Safari precisa colar o link dentro do app instalado.
  - No Android, o app instalado divide o armazenamento com o Chrome, e abrir o link uma vez basta.
- **Gerar o link no painel (`dev.html`):** nova seção "Link de configuração", com campos de URL e chave (vazios, sem usar a configuração do aparelho) e três botões:
  - "Gerar chave" cria uma chave aleatória de 32 caracteres com `crypto.getRandomValues`;
  - "Gerar link" monta o link;
  - "Copiar" copia para a área de transferência.
  - Nada disso é gravado. Um aviso diz: "Quem tiver este link acessa a planilha. Mande só para ela."
- **Primeiro uso:**
  - **Sem nenhuma conta ativa,** o check-in não abre sozinho: não faz sentido perguntar das contas antes de elas existirem. A tela Mês mostra "Vamos começar? Cadastre o salário e as contas da casa." e o botão "Cadastrar contas", que leva a `#ajustes`.
  - **Primeiro check-in:** com conta ativa e nenhum check-in ainda, voltar para a tela Mês abre o check-in. É o primeiro saldo, obrigatório. Isso só vale enquanto não existe nenhum check-in, para não abrir a cada troca de aba com "Toda vez".

## Regras

**`src/config.js` (puro):**
- `parseConfigLink(text)` aceita o link inteiro, só o trecho depois do `#` ou o texto colado com espaços em volta.
  - Devolve `{ url, key }` com os dois decodificados, ou `null` se faltar algo ou a URL não for `https://script.google.com/macros/s/<id>/exec`.
  - Aceita a URL com `/exec/` no fim e ignora parâmetros extras.
- `buildConfigLink(base, { url, key })` devolve `base + '#conectar?u=' + encodeURIComponent(url) + '&k=' + encodeURIComponent(key)`.
  - `parseConfigLink(buildConfigLink(...))` deve devolver o mesmo par.
- `sameConfig(a, b)` compara URL e chave, aparando espaços.
- `generateKey(randomBytes)` gera 32 caracteres `[A-Za-z0-9]`. A fonte de aleatoriedade vem por parâmetro, para o teste ser determinístico. A tela passa `crypto.getRandomValues`.

**`src/checkin.js`:** `shouldOpenCheckin` devolve `false` sem conta ativa. O resto não muda.

## Tarefas

Cada tarefa vira um PR.
- T1 vem primeiro.
- T2 e T3 dependem da T1 e podem rodar em paralelo, porque mexem em arquivos diferentes.
- T4 vem depois da T2, porque as duas mexem em `src/app.js`.
- T5 fica por último.

### T1. Lógica pura + testes (`src/config.js`, `src/checkin.js`, `tests/config.test.js`, `tests/checkin.test.js`)
- Implementar `parseConfigLink`, `buildConfigLink`, `sameConfig` e `generateKey` conforme as regras, e mudar o `shouldOpenCheckin` para não abrir sem conta ativa.
- Casos mínimos:
  - ida e volta do link com caracteres especiais na chave (`+`, `/`, `=`, `&`, `#`, acento);
  - o link inteiro, só o hash e o texto colado com espaços;
  - URL `/dev`, outro host, sem `u` ou sem `k`;
  - `generateKey` com fonte fixa;
  - `shouldOpenCheckin` sem contas, só com conta arquivada e com conta ativa.
- **Aceite:** `node --test` passa.

### T2. Abrir e colar o link (`src/app.js`, `src/screens/setup.js`, `styles/app.css` se precisar)
- **Na abertura e no `hashchange`,** `#conectar?...` é tratado antes do roteador, conforme as decisões: validar, confirmar a troca, gravar, limpar o cache se trocou, `replaceState` sem o link e abrir `#mes`.
- **Tela de configuração:** campo principal "Cole aqui o link que você recebeu" com "Conectar", e "Configurar à mão" recolhido com os campos de hoje.
  - O "Conectar" testa a conexão como o "Salvar" de hoje, com as mesmas mensagens de erro.
- **Roteiro** (Playwright no backend local do scratchpad, 360×800, sem erros no console):
  - abrir o link sem configuração cai no app configurado, sem o link na URL, e "voltar" não traz o link de volta;
  - abrir um link de outra planilha pede confirmação: "Cancelar" mantém tudo, e "Confirmar" troca e limpa o cache;
  - o mesmo link de novo não pergunta nada;
  - um link inválido abre a configuração com a mensagem;
  - colar o link na configuração conecta.

### T3. Painel: gerar chave e link (`dev.html`, `src/dev.js`, `styles.css`)
- Nova seção "Link de configuração" conforme as decisões. A base do link é o endereço do app, na mesma pasta do `dev.html` (`new URL('./', location.href)`). O link mostrado é selecionável, e o "Copiar" mostra "Copiado!".
- **Roteiro:** "Gerar chave" preenche 32 caracteres; "Gerar link" com URL e chave falsas dá um link que, aberto, configura o app (usar o backend local); URL inválida mostra erro e não gera link.

### T4. Primeiro uso (`src/app.js`, `src/screens/month.js`, `styles/month.css`)
- **Tela Mês sem nenhuma conta ativa:** mostra o convite com "Cadastrar contas" → `#ajustes`, no lugar das listas vazias. O cartão continua, com zeros.
- **`src/app.js`:** ao entrar em `#mes` com conta ativa e nenhum check-in, abre `#checkin/auto`. A regra de abertura e volta para a frente da tela continua igual.
- **Roteiro:** planilha vazia (`reset` sem `seed`) abre no Mês com o convite e sem check-in. Depois:
  1. criar o "Salário" em Ajustes;
  2. voltar ao Mês abre o check-in com o saldo obrigatório;
  3. confirmar volta ao Mês com o cartão certo;
  4. trocar de aba e voltar não abre o check-in de novo.

### T5. README + CLAUDE.md + docs/product.md
- **README:** nova seção "Entrega: planilha da esposa", com o passo a passo das pausas abaixo, como gerar o link e o roteiro da sessão de carga.
- **CLAUDE.md:** Arquivos (`plans/delivery.md`, helpers novos do `config.js`, rota `#conectar`) e Status.
- **`docs/product.md`:** o link de configuração e o primeiro uso, se ainda faltar algo depois deste plano.

**Comum a T2–T4:** o backend local que carrega o `Code.gs` real fica no scratchpad, nunca no repo. Os screenshots vão no PR.

## Pausas obrigatórias (ações manuais do Fabiano)

1. **Criar a planilha dela** (na conta do Fabiano):
   1. Crie uma planilha nova, por exemplo "Contas da casa", e abra *Extensões → Apps Script*.
   2. Cole o `Code.gs` inteiro, sem editar.
   3. No painel (`dev.html`), toque em "Gerar chave" e copie a chave.
   4. No Apps Script, vá em *Configurações do projeto → Propriedades do script → Adicionar*, com nome `SECRET` e valor igual à chave.
   5. *Implantar → Nova implantação → App da Web*: executar como "Eu", acesso "Qualquer pessoa". Autorize e copie a URL `/exec`.
   6. Abra a planilha e confira que as abas foram criadas e que a `Config` **não** tem a linha `ambiente`.
2. **Testar sem mexer no seu celular:** no painel, gere o link com a URL e a chave dela e abra-o numa **aba anônima**, que tem armazenamento próprio. O app deve abrir vazio, com o convite "Cadastrar contas". Não cadastre nada ali.
3. **Compartilhar** a planilha com ela como *Leitor* (opcional, para ela ver no Sheets).
4. **Mandar o link** pelo WhatsApp, só para ela.
5. **Sessão de carga, junto com ela, no celular dela:**
   1. Abra o link.
   2. Instale o app: no Android, menu do Chrome → "Instalar app"; no iPhone, Compartilhar → "Adicionar à Tela de Início", depois abra pelo ícone e cole o link na configuração.
   3. Em "Cadastrar contas", cadastre o Salário (Entrada, com valor padrão) e as contas da casa (Nubank, Inter, Renner, C&A, Unha…). Recorrentes, como Unha, levam valor padrão; faturas ficam sem padrão.
   4. Volte ao Mês: o primeiro check-in pede o saldo de hoje e se as contas e o salário do mês já foram pagos e recebidos.
   5. Preencha as faturas do mês atual na tela Mês, e as dos próximos meses que ela já souber (›).
   6. Ligue "Recebi" e "Paguei" se for o caso, e confira a sobra e os Próximos meses com ela.
   7. Faça um "Posso comprar?" de exemplo.
   8. Em Ajustes, escolha a frequência do check-in.

## Fora do escopo
- Importar a planilha Excel antiga (o histórico começa no mês atual, como já decidido).
- E-mail ou push de lembrete, contas por pessoa, mais de uma planilha no mesmo aparelho.
- Mudanças no backend.

## Critério de pronto
- `node --test` passa com os casos da T1.
- Os roteiros de T2 a T4 rodam sem erros no console, com screenshots nos PRs.
- Pausas 1 e 2: o link abre o app vazio na aba anônima, e a `Config` da planilha dela não tem `ambiente`.
- Pausa 5 feita com ela: o app instalado no celular dela, as contas cadastradas e o primeiro check-in feito.
