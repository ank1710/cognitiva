# Privacidade e dados — Cognitiva 2.0

**Versão avaliada:** `2.0.0-alpha.1` (commit `f3b76db`, main)
**Data da análise:** 30/10/2026
**Método:** leitura do código-fonte implementado + execução dos testes existentes. Nenhuma sessão real de participante foi acessada.
**Natureza deste documento:** mapa técnico de dados e lacunas. Não é parecer jurídico e não certifica conformidade com a LGPD ou qualquer outra norma. Decisões jurídicas devem ser tomadas por responsável qualificado.

---

## 1. Resumo executivo

O Cognitiva é, hoje, um app **local por padrão**: não pede identificação, não tem conta e grava tudo no `localStorage` do navegador. Duas ações quebram esse isolamento, ambas iniciadas pela pessoa: **baixar/copiar o relatório** e **"Analisar via API"**, que envia o relatório a um servidor e deste à OpenAI.

O que já está correto e foi verificado no código:

- Nenhuma transmissão automática de respostas: o envio só existe dentro de `requestAnalysis`, chamada exclusivamente pelo clique em `Analisar via API` (`src/analysis.js:37`, `src/app.js:80`).
- A chave `OPENAI_API_KEY` fica só no servidor e não é devolvida na resposta (`api/analyze.js:14`, teste `tests/analyze-core.test.js:58`).
- A OpenAI recebe apenas `summary` + `responses`, sem `formId`, `tier`, `startedAt`/`finishedAt` (`src/analyze-core.js:24`).
- A análise automática não funciona sem chave no servidor local: responde 503 (`src/analyze-core.js:41-43`).

O que **impede uso público hoje** (detalhe na seção 6):

- "Apagar meus dados" **não apaga** cópias isoladas de dados corrompidos (`*__isolated`) — confirmado por execução (seção 5, risco R1).
- A rota publicada `api/analyze.js` não tem autenticação, rate limit, verificação de origem, orçamento de custo nem registro de uso (`api/analyze.js:8-19`).
- Não existe consentimento registrado, aviso prévio real ao envio, política de retenção nem canal de direitos.
- O texto atual de privacidade afirma coisas que o produto não cumpre ("você confirma pelo botão" sugere confirmação que não existe).

---

## 2. Mapa de dados

### 2.1 Inventário por campo

Tudo abaixo é **dado local** até que a pessoa execute uma ação de envio.

| Dado | Origem | Onde fica | Retenção implementada | Sai do dispositivo? |
|---|---|---|---|---|
| Itens da prova (`form.items[]`: enunciado, contexto, 4 alternativas, `answer`, explicação, `fingerprint`, `templateId`, `domain`, `topic`) | `src/engine.js` (paramétricos) ou `catalog/items.json` (curados) | `cognitiva_v2_session` | Enquanto a sessão existir; substituída ao iniciar nova avaliação | Não (mas vai no relatório exportado/envido) |
| Respostas: `choice` (0–3) | Clique na alternativa | `cognitiva_v2_session` → `answers[id].choice` | idem | Só via relatório (API/cópia/download) |
| Confiança: `confidence` (0–100) | Controle deslizante | `answers[id].confidence` | idem | Só via relatório |
| **Justificativa livre: `reasoning`** | Campo "Qual foi seu raciocínio?" (`maxlength=600`, `index.html:33`) | `answers[id].reasoning`, truncado em 600 caracteres (`src/storage.js:53`, `src/engine.js:102`) | idem | **Sim**, em texto livre, no relatório |
| Índice da questão, `startedAt`, `finishedAt` | Sessão | `cognitiva_v2_session` | idem | `startedAt`/`finishedAt` no download e na cópia; **não** na API |
| `formId`, `seed`-derivados, `tier`, `version` | Engine | `cognitiva_v2_session` | idem | Download/cópia sim; API não |
| Histórico resumido: `date`, `tier`, `tierName`, `total`, `correct` | Fim de cada avaliação (`src/app.js:63-65`) | `cognitiva_v2_history`, máx. **20** entradas (`src/storage.js:18,66-78`) | Indefinida, limitada só por quantidade | Não |
| Questões vistas: lista de `id`/`fingerprint` | Fim de cada avaliação (`src/app.js:66`) | `cognitiva_v2_exposure`, máx. **10.000** ids (`src/storage.js:17,80-83`) | Indefinida | Não |
| Cópia de dado corrompido | Falha de leitura/validação | `cognitiva_v2_session__isolated` (e equivalentes), até 20.000 caracteres (`src/storage.js:94-98`) | **Indefinida; não é apagada por "Apagar meus dados"** | Não, mas permanece no navegador |
| Resultado da análise por IA | Resposta da OpenAI | Apenas em memória, na tela (`src/app.js:80`) | Até recarregar a página | Não é salvo no dispositivo |

Nenhum nome, e-mail, telefone, idade, gênero, escolaridade, localização, conta ou identificador de usuário é solicitado ou gerado (`index.html`, `src/app.js`). Também não há `sessionStorage`, `IndexedDB` nem cookies de aplicação — verificado por busca no código.

### 2.2 Onde ficam e quem acessa

- **`localStorage` do navegador**, em texto claro, legível por qualquer script da mesma origem. Não é criptografado, não é sincronizado entre dispositivos e não há conta.
- **Acesso local:** qualquer pessoa com acesso ao mesmo navegador/perfil; a sessão anterior é restaurada automaticamente ao abrir a página (`src/app.js:93`).
- **Servidor local (`scripts/serve.js`):** só serve arquivos estáticos e `POST /api/analyze`; não grava nada em disco (`scripts/serve.js:39-54`). Não há log de corpo de requisição no código.
- **Rota publicada (`api/analyze.js`):** serverless; não escreve banco, mas o provedor de hospedagem pode manter logs de requisição — **não verificado**, depende da configuração da plataforma.
- **OpenAI:** recebe o payload descrito em 2.4.
- **Vault do Obsidian:** ver 2.5.

### 2.3 Fluxos que tiram dados do dispositivo

| Ação | Gatilho | O que sai | Destino | Ação explícita? |
|---|---|---|---|---|
| Avaliação normal | Nenhum | Nada | — | — |
| "Baixar JSON" | Clique (`src/app.js:88`) | Relatório completo (inclui justificativas, gabarito, explicações, `formId`, horários) | Arquivo no computador da pessoa | Sim, e o arquivo fica sob controle dela |
| "Copiar análise para ChatGPT" | Clique (`src/app.js:89`) | Prompt + relatório completo em JSON, na área de transferência | A pessoa cola onde quiser (ex.: ChatGPT) | Sim; o envio em si é feito fora do app |
| "Analisar via API" | Clique (`src/app.js:80` → `src/analysis.js:52`) | `summary` + `responses` (2.4) | Servidor do Cognitiva → OpenAI `POST /v1/responses` | Sim, mas **sem confirmação prévia nem descrição do conteúdo** |
| Importação do catálogo | `npm run kb -- import` | Nada pela rede; lê arquivos locais do vault | `catalog/items.json` | Manual, por quem opera o projeto |

### 2.4 O que exatamente vai para a OpenAI

`src/analyze-core.js:24` monta o corpo compacto assim:

```js
JSON.stringify({ summary: results.summary, responses: results.responses })
```

Com os campos de `exportReport` (`src/engine.js:111`):

**`summary`**
`correct`, `answered`, `total`, `accuracy`, `meanConfidence`, `brierScore`, `confidenceAccuracyGapPoints`, `byDomain[]` (`id`, `title`, `icon`, `total`, `answered`, `correct`, `accuracy`), `byTopic[]` (`topic`, `total`, `answered`, `correct`).

**`responses[]`** — um objeto por questão, nos três tiers (20/60/120):
`id`, `templateId`, `dimension`, `topic`, `question`, `context`, `selected` (texto da alternativa marcada), `correctAnswer` (texto), `isCorrect`, `confidence`, **`reasoning`** (justificativa digitada, até 600 caracteres), `explanation`.

**Não são enviados à OpenAI:** `app`, `version`, `methodology`, `formId`, `tier`, `startedAt`, `finishedAt`. O filtro é consequência de o compacto incluir apenas `summary` e `responses` — não é uma decisão documentada em outro lugar.

**Configuração da chamada** (`src/analyze-core.js:52-58`): modelo `gpt-5-mini` (ou `OPENAI_MODEL`), `max_output_tokens: 2200`, `store: false`, instruções fixas em pt-BR que proíbem QI/percentil/diagnóstico e mandam tratar justificativas como dados, não instruções.

**Limites de payload:** 250.000 caracteres no compacto (`src/analyze-core.js:5,25`), 400.000 bytes de corpo no servidor local (`scripts/serve.js:15`), 45 s de timeout do cliente (`src/analysis.js:49`).

> **Ponto que precisa ser comunicado:** `store: false` **não** significa retenção zero. A documentação oficial da OpenAI informa que dados da API não são usados para treino por padrão, mas que logs de monitoramento de abuso — que podem conter prompt e resposta — são retidos por **até 30 dias**, salvo aprovação de controles de retenção (Zero Data Retention / Modified Abuse Monitoring). Fonte: <https://platform.openai.com/docs/guides/your-data> (consultada em 30/10/2026).

### 2.5 O que fica no vault do Obsidian

- Local: `~/Documents/Obsidian Vault/Knowledge Base/Banco de Perguntas/Itens` (ou `OBSIDIAN_VAULT`), lido do disco, sem rede (`scripts/kb-sync.js:18-40`).
- Conteúdo: **notas de itens** — enunciado, alternativas, gabarito, explicação, metadados de revisão. Nenhuma resposta de participante, nenhuma sessão, nenhum resultado de avaliação.
- Dados pessoais presentes: `reviewedBy` e `reviewedAt` no frontmatter (identificam **quem revisou o item**) — `src/catalog.js:109-110,130-131`.
- Publicação: `toEngineItem` copia apenas conteúdo do item e remove `reviewedBy`/`reviewedAt` (`src/catalog.js:146-161`), portanto o nome de revisores **não** vai para `catalog/items.json` nem para o navegador. Estado atual: `catalog/items.json` é `[]`.
- Retenção: indefinida, sob controle de quem mantém o vault. Não há versionamento automático de exclusão.
- Risco de identificação: se as justificativas de revisão dentro da nota citarem pessoas ou casos reais, esse texto pode chegar ao app e ao relatório. Não foi possível verificar o conteúdo do vault sem expor material que não é necessário a esta análise — **não verificado**.

---

## 3. Riscos concretos (priorizados)

| # | Risco | Gatilho | Consequência | Evidência |
|---|---|---|---|---|
| **R1** | Exclusão incompleta | Sessão corrompida/antiga é lida e isolada; depois a pessoa clica "Apagar meus dados" | Cópia bruta do conteúdo (até 20.000 caracteres, podendo conter justificativas) **permanece** no navegador; o texto da UI sugere que tudo foi apagado | `src/storage.js:94-98` grava `*__isolated`; `src/storage.js:156` apaga só `KEYS`. Reproduzido em execução (seção 5) |
| **R2** | Justificativa livre com dado pessoal | Pessoa escreve nome, escola, idade, relato de saúde ou de terceiros no campo de raciocínio | Texto vai ao servidor e à OpenAI, fica em logs de abuso por até 30 dias e no JSON baixado; não há aviso, filtro nem orientação | `index.html:33` (campo livre, 600 caracteres); `src/engine.js:102`; `src/analyze-core.js:24,57` |
| **R3** | Rota pública sem autenticação nem rate limit | Qualquer pessoa descobre `POST /api/analyze` e envia payloads válidos (`app:"Cognitiva"`, 20 respostas) | Uso da chave do projeto por terceiros, custo ilimitado e negação de serviço para usuários legítimos | `api/analyze.js:8-19`; `src/analyze-core.js:20-29` (validação só de forma) |
| **R4** | Ausência de limite de custo | Requisições repetidas ou concorrentes | Fatura cresce sem teto por requisição, por IP ou por dia; `max_output_tokens` limita só a saída | `api/analyze.js`; `src/analyze-core.js:54`; nenhuma quota no repositório |
| **R5** | Aviso de privacidade incompleto e impreciso | Pessoa clica "Analisar via API" | Envia sem saber que vão justificativas, enunciados e gabarito; o alerta diz que "confirma pelo botão", mas o clique já envia; não cita OpenAI nem retenção | `src/app.js:91`; `src/app.js:80`; `index.html:43` |
| **R6** | Retenção indefinida no dispositivo | Uso normal; sessão concluída | Justificativas e gabaritos ficam no `localStorage` para sempre até exclusão manual; sem TTL, sem aviso de expiração | `src/storage.js:9-13,112`; ausência de rotina de limpeza |
| **R7** | Dispositivo compartilhado | Próxima pessoa abre o app no mesmo navegador | Vê o relatório anterior completo, incluindo justificativas, sem barreira | `src/app.js:93` restaura resultado automaticamente; `index.html:39` |
| **R8** | Identificação indireta | Justificativa + contexto do item + horários + histórico | Reidentificação plausível em amostras pequenas, mesmo sem nome; `id` de item é pseudônimo, não anonimização | `src/engine.js:111`; `src/storage.js:71-77` |
| **R9** | Sem registro de acesso/uso da IA | Uso da rota publicada | Não há como auditar quem enviou, quando, com que custo, nem atender pedido de exclusão de log | ausência de log em `api/analyze.js` e `scripts/serve.js` |
| **R10** | Sem consentimento registrado | Início da avaliação | Não há tela de consentimento nem `consentFlags`, apesar de o modelo de dados do roadmap prever o campo | `ROADMAP.md:23`; nenhuma ocorrência de `consent` em `src/` |
| **R11** | Sem controle de idade | Acesso público | Crianças/adolescentes podem usar sem base específica nem consentimento de responsável; o roadmap já declara que menores exigem estudo próprio | `ROADMAP.md:5`; `index.html` sem verificação |
| **R12** | Sem CSP e conteúdo em `innerHTML` | XSS ou extensão maliciosa | Qualquer script na origem lê todo o `localStorage` (respostas e justificativas) | `index.html:3-10` sem `Content-Security-Policy`; `src/app.js:6,50,78` |
| **R13** | Erros do provedor sem detalhe | Falha 5xx/429 da OpenAI | Usuário recebe mensagem genérica; não há indicação de que o envio pode ter ocorrido | `src/analyze-core.js:64-68`; `src/analysis.js:28-35` |

**Observação sobre R3/R4:** o próprio código e o README já declaram que a rota não está pronta para exposição pública (`api/analyze.js:4`, `README.md:90`). O risco existe se essa advertência for ignorada no deploy.

---

## 4. Textos propostos para a interface

> Propostas prontas para aplicação, mas **não aplicadas** — a interface está sob responsabilidade de outro agente. Os textos abaixo pressupõem a correção de R1 (exclusão das chaves `*__isolated`); sem essa correção, a frase sobre exclusão seria falsa.

### 4.1 Texto do painel "Privacidade" (substitui o `alert` de `src/app.js:91`)

```text
Privacidade e seus dados

A avaliação, o histórico e as questões que você já viu ficam apenas neste
navegador (armazenamento local). Não há conta, cadastro nem sincronização
entre dispositivos.

Nada é enviado automaticamente. Seus resultados só saem deste dispositivo
em três ações suas:
• Baixar JSON — gera um arquivo no seu computador.
• Copiar análise para ChatGPT — copia o relatório para você colar onde quiser.
• Analisar via API — envia o relatório a um servidor do Cognitiva e à OpenAI.

"Apagar meus dados" remove a avaliação, o histórico e as questões vistas
deste navegador. Não remove arquivos que você baixou, cópias que você colou
em outro serviço nem o resultado de uma análise já enviada.

Em computador compartilhado, use "Apagar meus dados" ao terminar.
```

### 4.2 Aviso antes de enviar para a análise por IA (modal de confirmação)

Obrigatório antes do `POST`: descrever o conteúdo e exigir confirmação explícita. Texto-alvo:

```text
Enviar relatório para análise por IA?

Serão enviados ao servidor do Cognitiva e à OpenAI (API, modelo gpt-5-mini):

• acertos, taxa de acerto e confiança por dimensão e por contexto;
• para cada uma das N questões: enunciado, contexto, alternativa que você
  marcou, alternativa correta, explicação, sua confiança e o texto que você
  escreveu em "Qual foi seu raciocínio?".

Não enviamos nome, e-mail, identificador de conta, horários da sessão nem
o identificador do formulário. O servidor e a OpenAI veem o endereço IP da
conexão, como em qualquer acesso à internet.

A OpenAI não usa esses dados para treinar modelos, mas pode mantê-los em
registros de segurança por até 30 dias. O texto da análise aparece só nesta
tela e não é salvo por nós.

Evite escrever dados pessoais seus ou de outras pessoas nas justificativas.

[Cancelar]  [Enviar para análise]
```

Complemento de estado durante o envio (substitui `src/app.js:80`):
`"Enviando o relatório para análise. Isso pode levar até 45 segundos."`

### 4.3 Rótulos e microtextos

| Onde | Hoje | Proposta |
|---|---|---|
| `index.html:12` (chip do topo) | "Dados locais" | "Dados neste navegador" |
| `index.html:27` (botão) | "Apagar meus dados" | Manter, com confirmação: "Apagar avaliação, histórico e questões vistas deste navegador? Arquivos já baixados e textos já copiados não são afetados." |
| `index.html:43` (status da API) | "A análise automática exige backend publicado com uma chave de API segura." | "A análise automática envia seu relatório, incluindo as justificativas que você escreveu, para a OpenAI. Você verá o que será enviado antes de confirmar." |
| `index.html:33` (campo de raciocínio) | placeholder genérico | Acrescentar acima: "Não inclua nome, contato, dados de saúde ou informações de outras pessoas." |
| Resultado | — | "Este relatório fica neste navegador até você apagá-lo ou iniciar outra avaliação." |

### 4.4 Texto do consentimento no início (Marco C)

Só é necessário quando houver conta, coleta para pesquisa ou envio por padrão; no modo local atual, o aviso informativo de 4.1 é suficiente. Se houver pesquisa:

```text
[ ] Li o aviso de privacidade e concordo em participar desta avaliação
    exploratória. Entendo que posso parar a qualquer momento e apagar meus
    dados neste navegador.
[ ] (Opcional, separado) Autorizo o uso das minhas respostas, de forma
    pseudonimizada, para melhorar o banco de questões.
```

As duas caixas precisam ser independentes e **desmarcadas por padrão**; recusar a segunda não pode bloquear o uso do app.

---

## 5. Verificação executada

| Verificação | Comando/arquivo | Resultado |
|---|---|---|
| Suíte existente passa | `npm test` | 51 testes, 51 aprovados, 0 falhas |
| Exclusão deixa cópia isolada | script Node com `localStorage` em memória, importando `src/storage.js` | Antes: `['cognitiva_v2_session__isolated']`. Depois de `clearAll()`: `['cognitiva_v2_session__isolated']` — **a cópia permanece** |
| Nenhum envio fora do clique | `src/analysis.js:37` chamado apenas em `src/app.js:80` | Confirmado por leitura |
| Sem `sessionStorage`/`IndexedDB`/cookies | busca em `src/`, `index.html`, `api/`, `scripts/` | Nenhuma ocorrência de armazenamento além de `localStorage` |
| Sem consentimento implementado | busca por `consent` em `src/`, `index.html` | Nenhuma ocorrência |
| Chave não vaza na resposta | `tests/analyze-core.test.js:58` | Aprovado |

**Não verificado (limitações desta análise):**

- Conteúdo real das notas do vault (não acessado; só o pipeline de leitura foi lido).
- Configuração efetiva de hospedagem, logs de plataforma e cabeçalhos HTTP em produção (não há deploy observado).
- Comportamento real de retenção na conta OpenAI usada (depende do plano e dos controles aprovados).
- Teste em navegadores reais, com dados sintéticos, dos fluxos de exclusão e de restauração em dispositivo compartilhado.
- Existência de cópias em backup do navegador, sincronização de perfil do sistema operacional ou cache de disco — fora do alcance do app.

---

## 6. O que NÃO está pronto para uso público hoje

1. **Exclusão de dados**: não apaga as chaves `*__isolated`; logo, "Apagar meus dados" não cumpre o que promete (R1).
2. **Aviso e consentimento**: não há descrição verificável do que é enviado, nem confirmação antes do envio à IA, nem registro de consentimento (R5, R10).
3. **Rota de IA publicada**: sem autenticação, rate limit, verificação de origem, quota de custo, timeout no upstream e auditoria de uso (R3, R4, R9).
4. **Retenção**: nenhuma política ou mecanismo de expiração para dados locais ou para logs do servidor (R6).
5. **Direitos da pessoa**: não existe canal para acesso, correção, portabilidade ou eliminação de dados já enviados à IA (o download cobre só o dado local).
6. **Público sensível**: sem controle de idade, sem avaliação de uso por menores, sem adaptação para leitores de tela — e o próprio roadmap condiciona esses usos a estudos próprios (R11).
7. **Segurança do armazenamento**: dados em texto claro no navegador, sem CSP, em dispositivo potencialmente compartilhado (R7, R12).
8. **Enquadramento**: o produto é exploratório e não padronizado; qualquer texto público que sugira avaliação de inteligência, QI ou diagnóstico agrava o risco e contraria `README.md:5` e `ROADMAP.md:7`.

Até que os itens 1–3 sejam resolvidos, a recomendação é manter a análise por IA disponível apenas no ambiente local, com a chave ausente (comportamento 503 já implementado), e não publicar `api/analyze.js`.

---

## 7. Checklist mínimo do Marco C

Critérios de aceite verificáveis. Status atual: todos **reprovados**, exceto onde indicado.

| # | Item | Critério de aceite | Evidência exigida | Status |
|---|---|---|---|---|
| C1 | Consentimento informado | Antes de qualquer envio, modal lista os campos exatos e exige ação positiva; recusa mantém tudo local; registro de consentimento com data e versão do texto quando houver conta ou pesquisa | Captura de tela do modal + teste automatizado de que `fetch` não é chamado sem confirmação | Reprovado |
| C2 | Aviso de privacidade acessível | Página/ painel permanente, em pt-BR, coerente com o comportamento; declara o que sai, para quem, por quanto tempo e como apagar | Revisão de texto + link acessível em todas as telas | Reprovado (existe só um `alert`) |
| C3 | Retenção definida | Prazo explícito para dados locais (ex.: aviso e expiração após N dias) e para logs do servidor; exclusão automática comprovada | Teste que simula passagem de tempo e verifica remoção | Reprovado |
| C4 | Exclusão completa | "Apagar meus dados" remove `session`, `history`, `exposure` **e** todas as chaves `*__isolated`; teste automatizado cobre o caso corrompido; a UI declara o que não é alcançado (arquivos baixados, textos copiados, análise já enviada) | Teste unitário de `clearAll` com chave isolada presente + teste de integração na UI | Reprovado (reproduzido) |
| C5 | Minimização no envio | Enviar apenas o necessário: justificativa opcional para a análise (opt-in separado), truncamento explícito, remoção de qualquer campo não usado e possibilidade de analisar sem justificativas | Diff de `analyze-core.js` + teste do payload | Reprovado (justificativa sempre inclusa) |
| C6 | Autenticação / abuso | Rota exige credencial ou token de sessão legítima, verifica origem, rejeita payload anônimo e limita requisições por IP/usuário e por janela de tempo | Teste de carga com 429 + teste de requisição sem credencial | Reprovado |
| C7 | Limites de custo | Teto por requisição, por usuário/dia e global; alerta ao atingir 80%; bloqueio ao atingir 100%; `max_output_tokens` e tamanho de entrada documentados | Configuração versionada + teste de orçamento esgotado | Reprovado |
| C8 | Registro de acesso (auditoria) sem dado sensível | Log de metadados (timestamp, status, duração, custo estimado, origem) sem prompt/resposta/justificativa; retenção definida; acesso restrito e auditável | Amostra de log + política de retenção + teste que garante ausência de `reasoning` no log | Reprovado |
| C9 | Segurança em repouso e em trânsito | HTTPS obrigatório em produção, `Content-Security-Policy` restritiva, sem `innerHTML` com dado não escapado, aviso claro em dispositivo compartilhado | Cabeçalhos verificados por `curl -I`; teste de CSP; revisão de `innerHTML` | Reprovado |
| C10 | Direitos da pessoa | Canal de contato e procedimento documentado para acesso, correção, portabilidade e eliminação; prazo de resposta definido; dados já enviados à IA cobertos pelo procedimento | Página de contato + procedimento interno + teste de exportação completa | Reprovado |
| C11 | Público e menores | Política de idade mínima ou fluxo específico com consentimento de responsável; avaliação de risco para menores documentada | Texto publicado + registro da avaliação | Reprovado |
| C12 | Transparência sobre a IA | Aviso claro de que a análise é gerada por IA, pode errar, não é avaliação clínica e não é salva; provedor e modelo informados | Texto na tela + teste de conteúdo | Parcial (há aviso metodológico, mas não sobre provedor/retenção) |
| C13 | Teste de isolamento entre pessoas | Em navegador limpo, nenhum dado de outra sessão aparece; após exclusão, nova sessão começa vazia | Teste E2E com dados sintéticos | Reprovado |
| C14 | Base legal e governança | Encarregado/responsável definido, base legal por finalidade (operação local, análise por IA, pesquisa) documentada e revisada por responsável qualificado | Documento jurídico assinado | Não verificado (fora do escopo técnico) |

---

## 8. Recomendações imediatas (antes de qualquer publicação)

1. Corrigir `clearAll` para remover também `Object.keys(storage)` que comecem com as chaves conhecidas + sufixo `__isolated` (ou manter um registro das chaves criadas) — `src/storage.js:156`.
2. Trocar o `alert` de privacidade por painel com o texto de 4.1 e adicionar confirmação com o texto de 4.2 antes do `POST`.
3. Tratar a justificativa como opt-in separado para a análise por IA, com opção "enviar sem minhas justificativas".
4. Se a rota for publicada, implementar C6–C8 antes de qualquer tráfego real.
5. Documentar retenção local (ex.: 30 dias com aviso) e criar rotina de expiração.
6. Manter `catalog/items.json` sem identificação de revisores — o código já faz isso; incluir teste de regressão.

---

## 9. Referências

- Código: `src/storage.js`, `src/analysis.js`, `src/analyze-core.js`, `src/app.js`, `api/analyze.js`, `scripts/serve.js`, `index.html`.
- Requisitos internos: `README.md:85-92`, `ROADMAP.md:9,54-61,86`.
- OpenAI, *Data controls in the OpenAI platform*: <https://platform.openai.com/docs/guides/your-data> (retenção de logs de abuso de até 30 dias; dados da API não usados para treino por padrão).
- LGPD, Lei nº 13.709/2018, texto oficial: <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm> — referência para conceitos de dado pessoal, dado sensível, bases legais, direitos e transferência internacional. A aplicação desses dispositivos ao produto requer análise jurídica própria.
