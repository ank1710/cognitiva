# Privacidade e dados — Cognitiva 2.0

**Versão avaliada:** `2.0.0-alpha.1` — commit `cbbc336` (main, 30/10/2026)
**Data desta revisão:** 30/10/2026
**Método:** leitura do código implementado + execução da suíte de testes. Nenhuma sessão real de participante foi acessada.
**Natureza deste documento:** mapa técnico de dados e lacunas. Não é parecer jurídico e não certifica conformidade com a LGPD ou qualquer outra norma. Decisões jurídicas devem ser tomadas por responsável qualificado.

**Mudança nesta revisão:** incorpora as decisões do usuário de 30/10/2026 e o que foi implementado nas T015a/b/c e **na T016 (retenção local de 90 dias, `cbbc336`)**. O que ainda não está no código permanece marcado como pendente.

---

## 1. Resumo executivo

O Cognitiva continua sendo um app **local por padrão**: sem conta, sem identificação e sem sincronização. A análise por IA virou **piloto fechado por convite**, com autenticação por token, limites de uso e envio minimizado.

**Implementado e verificado no código:**

- Token de convite obrigatório para a análise por IA: sem `PILOT_TOKENS` o servidor responde 503; sem token no cabeçalho, 401; token inválido, 403 (`src/pilot.js:119-146`).
- Limites padrão 20/dia por token, 100/dia global e 4/minuto, configuráveis por ambiente (`src/pilot.js:10-14,75-81,88-116`).
- Justificativa livre só sai do dispositivo com opt-in explícito e `consentTextVersion` válida; sem autorização, o texto não entra no bloco enviado (`src/analyze-core.js:146-205,633-641`; `src/analysis.js:121`).
- Envio minimizado: a IA recebe um bloco de evidência com índices e contagens, **não** o enunciado, o texto das alternativas, a explicação ou o gabarito em texto (`src/analyze-core.js:107-126,146-205`).
- Defesa contra vazamento: se o modelo repetir literalmente uma justificativa autorizada fora do bloco previsto, a resposta é rejeitada com 422 (`src/analyze-core.js:678-694`).
- "Apagar meus dados" agora apaga também as cópias isoladas (`*__isolated`) e o convite da sessão (`src/storage.js:125-139,212-216`; `src/app.js:609-618`).
- **Retenção local de 90 dias** (`RETENTION_DAYS = 90`): sessão e exposição com mais de 90 dias desde a última gravação são apagadas na leitura, junto da cópia isolada; o histórico filtra por data e regrava o que resta; a interface avisa quando algo expirou (`src/storage.js:10,146-200`; `src/app.js:171,304`).
- Cabeçalhos de segurança (CSP, `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`) aplicados nas duas rotas (`src/pilot.js:20-26`; `scripts/serve.js:90`; `api/analyze.js:16`).
- Log de metadados sem conteúdo: status, duração, hash curto do token, tokens e custo estimados (`src/pilot.js:164-179`).
- Devolutiva marcada como `releaseStatus: blocked`, rubrica e prompt versionados (`src/analyze-core.js:15-16,382`).

**Ainda não implementado, limitado ou não verificado:**

- **Expiração só roda na leitura**: não há timer em segundo plano; dados vencidos só somem quando o app abre de novo (`src/storage.js:146-200`).
- **Cópias isoladas não têm carimbo de tempo**: `isolate` grava o texto bruto sem envelope, então a retenção de 90 dias não as alcança por si só; elas saem com "Apagar meus dados" ou quando a chave original expira (`src/storage.js:98-102,152-156,212-216`).
- **Contadores de limite em memória**: cada processo/instância tem seu próprio contador; em serverless, os tetos são por instância (`src/pilot.js:4-6,87-88`).
- **Sem verificação de origem** e sem store compartilhado de limites; sem alerta de custo por limiar e sem auditoria persistente.
- **Consentimento não é registrado**: a versão do texto viaja no payload, mas não há registro durável, revogação nem comprovação.
- O aviso de privacidade da interface continua desatualizado e não menciona retenção, convite nem o que exatamente é enviado (`src/app.js:608`).

---

## 2. Mapa de dados

### 2.1 Inventário por campo

| Dado | Origem | Onde fica | Retenção implementada | Sai do dispositivo? |
|---|---|---|---|---|
| Itens da prova (`form.items[]`: enunciado, contexto, 4 alternativas, `answer`, explicação, `fingerprint`, `templateId`, `domain`, `topic`, `origin`, `structureId`) | `src/engine.js` (paramétricos) ou `catalog/items.json` (curados) | `cognitiva_v2_session` | **90 dias** desde a última gravação; removida na leitura (`src/storage.js:10,146-156,167`) | Não |
| Resposta marcada: `choice` (0–3) | Clique | `cognitiva_v2_session` → `answers[id].choice` | idem | Só como **índice** e booleano de acerto no envio à IA |
| Confiança: `confidence` (0–100) | Controle deslizante | `answers[id].confidence` | idem | Sim |
| **Justificativa livre: `reasoning`** | Campo "Qual foi seu raciocínio?" (`maxlength=600`, `index.html:38`) | `answers[id].reasoning`, truncado em 600 (`src/storage.js:57`, `src/engine.js:102`) | idem | **Somente com opt-in**; sem opt-in a IA recebe apenas comprimento e "vazio/não vazio" |
| Índice da questão, `startedAt`, `finishedAt` | Sessão | `cognitiva_v2_session` | idem | Download/cópia sim; **não** no envio à IA |
| `formId`, `tier`, `version` | Engine | `cognitiva_v2_session` | idem | `tier` sim (na evidência); `formId`, horários e `version` não |
| Histórico resumido: `date`, `tier`, `tierName`, `total`, `correct` | Fim da avaliação (`src/app.js`) | `cognitiva_v2_history`, máx. 20 entradas (`src/storage.js:22,70-82`) | **90 dias por entrada**; na leitura, entradas antigas são descartadas e o restante é regravado (`src/storage.js:158-191`) | Não |
| Questões vistas: ids/`fingerprint` | Fim da avaliação | `cognitiva_v2_exposure`, máx. 10.000 ids (`src/storage.js:21,84-87`) | **90 dias** desde a última gravação; removida na leitura (`src/storage.js:193-200`) | Não |
| **Token de convite** | Link `#convite=...` | `sessionStorage` → `cognitiva_v2_invite` (`src/app.js:172-214,498`) | Até fechar a aba; removido por "Apagar meus dados" | Sim, no cabeçalho `Authorization` de cada chamada |
| Cópia de dado corrompido | Falha de leitura/validação | `cognitiva_v2_*__isolated`, até 20.000 caracteres (`src/storage.js:98-102`) | **Sem carimbo de tempo**: não expira pelos 90 dias; sai com "Apagar meus dados" ou quando a chave original expira (`src/storage.js:152-156,212-216`) | Não |
| Resultado da análise por IA | Resposta do servidor | Memória da aba; pode ser baixado em JSON pelo botão "Baixar análise JSON" | Até recarregar a página | Não é enviado a lugar algum pelo app |
| Log de metadados da análise | Servidor | `console.log` (stdout do processo / plataforma) (`src/pilot.js:164-179`) | Depende da plataforma — **não verificado** | Sim, para o log da hospedagem |

Nenhum nome, e-mail, telefone, idade, escolaridade, localização ou identificador de conta é solicitado. O `token` de convite é credencial de acesso, não identidade — mas correlaciona uso (ver 2.6).

### 2.2 Onde ficam e quem acessa

- **`localStorage`** (`session`, `history`, `exposure`, cópias isoladas) em texto claro, acessível a qualquer script da mesma origem. Sem criptografia, sem sincronização. A retenção de 90 dias é aplicada **na leitura** de cada chave: o que venceu é removido e a interface informa (`src/storage.js:146-200`; `src/app.js:171,304`). O relógio de referência é o `savedAt` do envelope (última gravação) e, no histórico, a data de cada entrada.
- **`sessionStorage`** guarda o token de convite; some ao fechar a aba e é apagado pelo botão de exclusão (`src/app.js:212-214,612`).
- **Navegador compartilhado:** a sessão concluída é restaurada automaticamente na abertura (`src/app.js:624-625`), então a próxima pessoa vê o relatório anterior, inclusive justificativas.
- **Servidor local:** escuta em `127.0.0.1` por padrão; `HOST` permite expor de propósito (`scripts/serve.js:17,21-24,123-129`). Serve só `/`, `/index.html`, `/src/*` e `/catalog/*`, bloqueando dotfiles e traversal (`scripts/serve.js:28-32,103-119`).
- **Rota publicada:** `api/analyze.js` não escreve banco; logs da plataforma podem conter metadados de requisição — **não verificado**.
- **OpenAI:** recebe o bloco de evidência descrito em 2.4.

### 2.3 Fluxos que tiram dados do dispositivo

| Ação | Gatilho | O que sai | Destino | Ação explícita? |
|---|---|---|---|---|
| Avaliação normal | — | Nada | — | — |
| "Baixar relatório JSON" | Clique | Relatório completo: enunciados, alternativas, gabarito em texto, explicações, justificativas, `formId`, horários | Arquivo local | Sim; fica sob controle da pessoa |
| "Copiar análise para ChatGPT" | Clique | Prompt + relatório completo em JSON | Área de transferência; a pessoa cola onde quiser | Sim; o envio ocorre fora do app |
| "Analisar via API" | Clique + convite ativo (+ opt-in das justificativas) | Bloco de evidência (2.4) | Servidor do Cognitiva → OpenAI `POST /v1/responses` | Sim; exige token e o botão só habilita com convite (`src/app.js:478-526`) |
| Importação do catálogo | `npm run kb -- import` | Nada pela rede | `catalog/items.json` | Manual, por quem opera |

### 2.4 O que exatamente vai para a OpenAI

O navegador envia o relatório completo mais `reasoningAuthorized` e `consentTextVersion` (`src/analysis.js:119-124`). O **servidor** monta `buildEvidence` (`src/analyze-core.js:146-205`) e envia apenas esse bloco E. O relatório bruto não é repassado.

**Bloco enviado:**

- `session`: `tier`, `total`, `answered`, `unanswered`, `partial`.
- `global`: `accuracy`, `meanConfidence`, `brier`, `gap`, `gapSign`, `confidenceCoverage`.
- `byDimension[]`: acertos, respondidas, confiança média, `n`, precisão calibrada.
- `byTopic[]`: `topic`, `total`, `answered`, `correct`.
- `items[]` — por questão: `evidenceId`, `dimension`, `isCorrect`, `confidence`, `confidenceBand`, `reasoningChars`, `reasoningEmpty`, `selectedIndex`, `correctIndex`, `origin`, `familyId`, `structureId`, `contentReviewStatus`. **`reasoning` só entra se `reasoningAuthorized === true`.**
- `structure`: estruturas distintas, itens por estrutura, fração paramétrica.
- `consent`: `reasoningIncluded`, `scope` (`full_text`/`none`), `consentTextVersion`.
- `limits`: `mode` (`full`/`limited`/`insufficient`) e dimensões suprimidas.
- `dataFingerprint`: `sha256:` do bloco, para detectar relatório desatualizado (`src/analyze-core.js:203,642-644`).

**Não são enviados:** enunciado, texto do contexto, texto das alternativas, texto da resposta correta, explicação do gabarito, `formId`, `startedAt`, `finishedAt`, `version`, nome, e-mail, conta. Também não há justificativa sem opt-in. Verificado por teste: o bloco serializado não contém "Enunciado confidencial" nem o texto "Fulano estuda na escola municipal X" quando não autorizado (`tests/analyze-core.test.js:111-124`).

**Configuração da chamada:** `gpt-5-mini` (ou `OPENAI_MODEL`), `max_output_tokens: 3000`, `store: false`, instruções de rubrica versionada (`src/analyze-core.js:15-16,649-662`).

**Limites de payload:** 250.000 caracteres no compacto usado para validação, 400.000 bytes de corpo no servidor local, 20/60/120 respostas aceitas (`src/analyze-core.js:12-13,615-624`; `scripts/serve.js:16`).

> **Retenção do provedor:** `store: false` **não** significa retenção zero. A documentação oficial da OpenAI informa que dados da API não são usados para treino por padrão, mas que logs de monitoramento de abuso — que podem conter prompt e resposta — ficam por **até 30 dias**, salvo controles aprovados (Zero Data Retention / Modified Abuse Monitoring). Fonte: <https://platform.openai.com/docs/guides/your-data> (consultada em 30/10/2026).

### 2.5 O que fica no vault do Obsidian

- Local: `~/Documents/Obsidian Vault/Knowledge Base/Banco de Perguntas/Itens` (ou `OBSIDIAN_VAULT`), lido do disco sem rede (`scripts/kb-sync.js:18-40`).
- Conteúdo: **notas de itens** — enunciado, alternativas, gabarito, explicação, metadados de revisão. Nenhuma resposta de participante, sessão ou resultado.
- Dados pessoais: `reviewedBy` e `reviewedAt`, que identificam **quem revisou o item** (`src/catalog.js:109-110,130-131`).
- Publicação: `toEngineItem` copia só conteúdo do item e descarta `reviewedBy`/`reviewedAt` (`src/catalog.js:146-161`); o nome de revisores não vai para `catalog/items.json` nem para o navegador.
- Retenção: indefinida, sob controle de quem mantém o vault.
- Conteúdo real das notas: **não verificado** nesta análise (não foi necessário acessar).

### 2.6 Identificação indireta

Não há identificador de pessoa. Porém:

- o `tokenFingerprint` (6 hex) no log correlaciona chamadas do mesmo convite sem expor o token (`src/pilot.js:31-33,139,172`) — é pseudônimo, não anonimização;
- `dataFingerprint` liga um laudo ao relatório exato;
- em amostras pequenas, justificativas autorizadas + conjunto de respostas + data podem reidentificar alguém;
- o convite é compartilhável; duas pessoas usando o mesmo convite aparecem como o mesmo `tokenFingerprint`.

---

## 3. Riscos concretos (priorizados)

| # | Risco | Gatilho | Consequência | Situação | Evidência |
|---|---|---|---|---|---|
| R1 | Exclusão incompleta | Sessão corrompida isolada + "Apagar meus dados" | Cópia bruta permanecia no navegador | **Resolvido** | `src/storage.js:125-139,212-216`; testes `tests/storage.test.js:124,134,149` |
| R2 | Justificativa com dado pessoal | Pessoa escreve nome/escola/saúde no campo livre e autoriza o envio | Texto vai à OpenAI, fica em log de abuso por até 30 dias e pode virar laudo | **Mitigado, não eliminado** | Opt-in e aviso específico (`index.html:49-53`); ainda é texto livre, sem orientação no campo nem limite de conteúdo |
| R3 | Abuso da rota de IA | Terceiro obtém um convite válido (compartilhado, vazado) | Consome cota e custo do piloto; 20/dia por token e 100/dia global limitam, mas não identificam | **Mitigado, residual** | `src/pilot.js:10-14,119-146`; contadores em memória (`src/pilot.js:4-6,87-88`) |
| R4 | Limite de custo contornável | Múltiplas instâncias serverless ou reinício do processo | Cada instância recomeça os contadores; teto global real pode ser N × 100/dia | **Aberto** | comentário explícito em `api/analyze.js:12`; `scripts/serve.js:87` |
| R5 | Aviso desatualizado | Pessoa abre "Privacidade" | Texto não menciona convite, retenção de 90 dias, o que exatamente é enviado nem a OpenAI; diz "confirma pelo botão" | **Aberto** | `src/app.js:608`; `index.html:13` ainda exibe "Dados locais" |
| R6 | Retenção local | Uso normal; dados vencidos | Sessão, histórico e exposição com mais de 90 dias são apagados na leitura, com aviso; resíduo: cópias isoladas não têm `savedAt` e não expiram por si, e não há timer em segundo plano | **Resolvido** para os dados principais, com resíduos | `src/storage.js:10,146-200`; `src/app.js:171,304`; testes `tests/storage.test.js:190-263` |
| R7 | Dispositivo compartilhado | Próxima pessoa abre o app | Vê o relatório anterior, inclusive justificativas | **Aberto** | `src/app.js:624-625` |
| R8 | Identificação indireta | Justificativa autorizada + conjunto de respostas | Reidentificação plausível em amostra pequena | **Aberto** | seção 2.6 |
| R9 | Auditoria não persistente | Qualquer análise | Log vai só para stdout; sem store, sem prazo, sem consulta; impossível atender pedido de exclusão de log com garantia | **Parcial** | `src/pilot.js:164-179`; `api/analyze.js:12` |
| R10 | Consentimento sem registro | Pessoa autoriza justificativas | A versão do texto viaja no payload e o `consentId` é derivado do fingerprint; nada é guardado nem revogável | **Parcial** | `src/analyze-core.js:18,540,633-641` |
| R11 | Sem controle de idade | Acesso ao piloto | Menores podem usar sem base específica nem consentimento de responsável | **Aberto** | `ROADMAP.md:5` |
| R12 | Dados locais em texto claro | XSS, extensão, acesso físico ao perfil | Leitura de respostas e justificativas; CSP reduz superfície, não protege o armazenamento | **Mitigado, residual** | CSP em `src/pilot.js:20-26`; `src/storage.js:116` |
| R13 | Erro genérico do provedor | Falha 5xx/429 da OpenAI | Usuário não sabe se o envio ocorreu | **Aberto** | `src/analyze-core.js:663-671` |
| R14 | Convite em link | Link repassado a terceiros | Uso fora do grupo convidado; sem vínculo com pessoa | **Aceito no piloto** | `src/app.js:172-214` |

---

## 4. Textos propostos para a interface

> Propostas, **não aplicadas** — a interface é de outro agente. O bloco de consentimento já existe e está correto no essencial; o restante continua pendente.

### 4.1 Painel "Privacidade" (substitui o `alert` de `src/app.js:608`)

```text
Privacidade e seus dados

A avaliação, o histórico e as questões que você já viu ficam apenas neste
navegador (armazenamento local). Não há conta nem sincronização.

Nada é enviado automaticamente. Seus resultados só saem deste dispositivo
em três ações suas:
• Baixar relatório JSON — gera um arquivo no seu computador.
• Copiar análise para ChatGPT — copia o relatório para você colar onde quiser.
• Analisar via API — envia um resumo da sessão e as questões vistas a um
  servidor do Cognitiva e à OpenAI. Esta análise está disponível apenas com
  convite e não envia o texto das questões, das alternativas nem do gabarito.
  Seus comentários escritos só são enviados se você marcar a autorização.

"Apagar meus dados" remove avaliação, histórico, questões vistas, cópias de
dados corrompidos e o convite desta aba. Não remove arquivos que você baixou,
textos que você colou em outro serviço nem laudos já gerados.

Em computador compartilhado, use "Apagar meus dados" ao terminar.
```

### 4.2 Aviso de retenção

A expiração está implementada (T016, `cbbc336`). O texto pode ser publicado na tela inicial e no painel de privacidade:

```text
Guardamos seus dados neste navegador por até 90 dias após a última
atualização. Depois disso, avaliação, histórico e questões vistas são
apagados quando você abrir o app novamente. Você pode apagar antes, a
qualquer momento.
```

A ressalva "quando você abrir o app novamente" é necessária: não há timer em segundo plano (`src/storage.js:146-200`). O aviso já aparece quando algo expira (`src/app.js:171,304`).

### 4.3 Aviso antes de enviar para a análise por IA

Hoje o envio ocorre direto no clique, sem modal. O bloco de consentimento cobre as justificativas, mas não descreve o restante do envio. Texto-alvo para um modal de confirmação:

```text
Enviar resumo para análise por IA?

Serão enviados ao servidor do Cognitiva e à OpenAI (API, modelo gpt-5-mini):

• acertos, confiança média e calibração por dimensão e por contexto;
• para cada questão: se você acertou, sua confiança e os índices da
  alternativa marcada e da correta;
• a estrutura e a origem do item (revisado ou gerado).
• Seus comentários escritos, SOMENTE se você marcar a autorização abaixo.

Não enviamos o texto das questões, das alternativas, das explicações, seu
nome, e-mail, identificador de conta nem os horários da sessão. O servidor e
a OpenAI veem o endereço IP da conexão, como em qualquer acesso à internet.

A OpenAI não usa esses dados para treinar modelos, mas pode mantê-los em
registros de segurança por até 30 dias. O laudo aparece só nesta tela e não é
salvo por nós.

[ ] Autorizo o envio dos meus comentários escritos (versão consent-1.0.0)
[Cancelar]  [Enviar para análise]
```

### 4.4 Rótulos e microtextos

| Onde | Hoje | Proposta |
|---|---|---|
| `index.html:13` (chip) | "Dados locais" | "Dados neste navegador" com link para Privacidade |
| `index.html:38` (campo de raciocínio) | placeholder genérico | Acrescentar: "Não inclua nome, contato, dados de saúde ou informações de outras pessoas." |
| `index.html:49-53` (consentimento) | Correto; cita "O Cognitiva não controla a retenção do provedor" | Acrescentar "até 30 dias" (fonte oficial), mantendo o resto |
| `src/app.js:611` (confirmação de exclusão) | "Apagar histórico, avaliação local e convite desta sessão?" | "Apagar avaliação, histórico, questões vistas, cópias isoladas e convite desta aba? Arquivos baixados e textos copiados não são afetados." |
| Resultado | — | "Este relatório fica neste navegador até você apagar ou iniciar outra avaliação." |

---

## 5. Verificação executada

| Verificação | Comando/arquivo | Resultado |
|---|---|---|
| Suíte completa | `npm test` | **204 testes, 204 aprovados, 0 falhas** |
| Exclusão cobre cópias isoladas | `tests/storage.test.js:124,134,149,158,170,177` | Aprovado |
| Retenção de 90 dias: 91 dias removido, 89 preservado, histórico misto, exposição, issue `expired`, legado e `clearAll` | `tests/storage.test.js:190-263` | Aprovado |
| Sem justificativa nem enunciado no envio sem opt-in | `tests/analyze-core.test.js:111-124` | Aprovado |
| Fingerprint determinístico e sensível ao consentimento | `tests/analyze-core.test.js:102-106` | Aprovado |
| Token: parsing, comparação em tempo constante, limites por minuto/dia/global, 401/403/429/503 | `tests/pilot.test.js:19-126` | Aprovado |
| Log sem conteúdo | `tests/pilot.test.js:137` | Aprovado |
| Cabeçalhos de segurança | `tests/pilot.test.js:161` | Aprovado |
| Chave nunca aparece na resposta | `tests/analyze-core.test.js` | Aprovado |

**Limitações conhecidas (verificadas por leitura):**

- Momento da expiração: ela só roda na leitura; um app fechado por mais de 90 dias só apaga os dados quando for aberto de novo.
- Cópias isoladas: não têm carimbo de tempo e por isso não expiram pela regra dos 90 dias (saem por exclusão manual ou quando a chave original expira).

**Não verificado:**
- Comportamento real dos contadores em serverless (múltiplas instâncias).
- Configuração de logs e retenção da plataforma de hospedagem (nada publicado).
- Retenção efetiva na conta OpenAI usada (depende de plano e controles aprovados).
- Conteúdo do vault do Obsidian.
- Teste E2E em navegadores reais de exclusão, isolamento entre pessoas e dispositivo compartilhado.
- Cópias em backup do navegador ou sincronização de perfil do sistema operacional.

---

## 6. O que o piloto local NÃO resolve

O piloto por convite melhora o controle de acesso, mas não transforma o produto em serviço público. Continuam em aberto:

1. **Nada publicado**: a decisão é hospedar só localmente. `api/analyze.js` segue apto apenas a piloto controlado; sem store compartilhado, verificação de origem, alerta de custo e auditoria persistente, não deve receber tráfego aberto.
2. **Sem contas**: não há identidade, então não há como atender acesso, correção, portabilidade ou eliminação por pessoa; o `tokenFingerprint` agrupa uso, não pessoas.
3. **Dados no navegador**: ficam em texto claro, por dispositivo, sem sincronização e sem backup; apagar é local e não alcança o que já foi enviado.
4. **Retenção**: 90 dias implementados e testados, mas aplicados na abertura do app; não há expiração em segundo plano, e cópias isoladas de dados corrompidos ficam sem prazo até exclusão manual.
5. **Consentimento**: o opt-in das justificativas é real e versionado, mas não há registro durável, revogação nem comprovação de quem consentiu.
6. **Auditoria**: log de metadados existe, mas é efêmero e não consultável.
7. **Público sensível**: sem política para menores, sem avaliação de acessibilidade para leitores de tela.
8. **Devolutiva**: `releaseStatus: blocked` — prévia interna, sem assinatura, sem base psicométrica. Não deve ser apresentada como laudo, avaliação clínica ou devolutiva oficial.
9. **Enquadramento**: qualquer texto público que sugira QI, percentil ou diagnóstico contraria `README.md:5` e `ROADMAP.md:7`.

---

## 7. Checklist do Marco C

Status conforme o vocabulário do projeto: **aprovado**, **reprovado**, **não verificado**, **não aplicável**. "Cobertura atual" descreve o que existe, mesmo quando insuficiente.

| # | Item | Critério de aceite | Cobertura atual | Status |
|---|---|---|---|---|
| C1 | Consentimento informado no envio | Antes de enviar justificativas, opt-in explícito, desmarcado por padrão, com versão do texto; sem opt-in, nada de texto livre sai | Caixa de consentimento com `consent-1.0.0`, validada no servidor e no cliente (`index.html:49-53`; `src/analyze-core.js:18,633-641`) | **Aprovado** |
| C1b | Registro formal de consentimento | Consentimento durável e verificável: quem, quando, qual versão, qual escopo; possibilidade de revogação | A versão viaja no payload e o `consentId` é derivado do fingerprint; nada é persistido nem revogável (`src/analyze-core.js:540`) | **Reprovado** |
| C2 | Aviso de privacidade acessível | Painel permanente, coerente com o comportamento, declarando o que sai, para quem, por quanto tempo e como apagar | Só um `alert` desatualizado (`src/app.js:608`) | **Reprovado** |
| C3 | Retenção definida | Prazo explícito para os dados locais e remoção automática comprovada por teste; logs operacionais têm critério próprio em C8 | `RETENTION_DAYS = 90`; sessão e exposição expiram na leitura, histórico é filtrado e regravado, isolados da chave expirada são removidos, interface avisa; testes cobrem 91/89 dias, histórico misto, legado e `clearAll` (`src/storage.js:10,146-200`; `tests/storage.test.js:190-263`) | **Aprovado** |
| C4 | Exclusão completa | Remove sessão, histórico, exposição, isolados e convite; teste cobre o caso corrompido; UI declara o que não alcança | Implementado e testado (`src/storage.js:212-216`; `tests/storage.test.js:124-177`) | **Aprovado** |
| C5 | Minimização no envio | Só o necessário: sem enunciado, alternativas ou gabarito em texto; justificativa opcional; defesa contra vazamento | Bloco E com índices e contagens; verificação de vazamento (`src/analyze-core.js:107-205,678-694`) | **Aprovado** |
| C6 | Autenticação / abuso | Rota exige credencial; rejeita anônimo; limita por token e global | Token obrigatório, 401/403/429, limites 20/dia, 100/dia, 4/min (`src/pilot.js:119-146`); residual: contador por instância e sem checagem de origem | **Reprovado** |
| C7 | Limites de custo | Teto por requisição, por janela e global; alerta ao aproximar; bloqueio ao atingir | Cotas por contagem + estimativa de custo no log; sem orçamento em dólar nem alerta (`src/pilot.js:153-162`) | **Reprovado** |
| C8 | Auditoria sem dado sensível | Log de metadados sem prompt/resposta/justificativa; retenção definida; acesso restrito | Metadados sem conteúdo, apenas em stdout, sem retenção definida (`src/pilot.js:164-179`) | **Reprovado** (conteúdo correto, persistência ausente) |
| C9 | Segurança em trânsito e no navegador | HTTPS em produção, CSP, sem injeção, aviso em dispositivo compartilhado | CSP, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, allowlist de caminhos e loopback padrão (`src/pilot.js:20-26`; `scripts/serve.js:17-32`); HTTPS não aplicável (não publicado); falta o aviso de dispositivo compartilhado | **Reprovado** |
| C10 | Direitos da pessoa | Canal e procedimento para acesso, correção, portabilidade e eliminação; prazo definido | Nada além do download local | **Reprovado** |
| C11 | Público e menores | Política de idade ou fluxo com consentimento de responsável; risco documentado | Nada | **Reprovado** |
| C12 | Transparência sobre a IA | Declara IA, versão de rubrica/prompt/modelo, possibilidade de erro, ausência de valor clínico e que não é salva | Laudo com versão, `model`, `dataFingerprint`, avisos e `releaseStatus: blocked` (`src/analyze-core.js:15-16,382,524-560`) | **Aprovado** |
| C13 | Teste de isolamento entre pessoas | Navegador limpo não mostra dados de outra sessão; após exclusão, começa vazio | Sem teste E2E; restauração automática existe (`src/app.js:624-625`) | **Reprovado** |
| C14 | Base legal e governança | Responsável/encarregado definido; base legal por finalidade; revisão jurídica | Nenhum documento | **Não verificado** (fora do escopo técnico) |

### Continua reprovado

C1b, C2, C6, C7, C8, C9, C10, C11, C13 e C14 — em C6 e C9 o desenho existe, mas falta o resíduo indicado na tabela (contador compartilhado, checagem de origem, aviso de dispositivo compartilhado).

**Aprovados (5):** C1 (opt-in das justificativas), C3 (retenção de 90 dias, com as limitações registradas em §5), C4 (exclusão completa), C5 (minimização no envio) e C12 (transparência sobre a IA).

**Não verificado (1):** C14 (base legal e governança), fora do escopo técnico.

---

## 8. Recomendações imediatas

1. Retenção: T016 concluída (`cbbc336`). Restam dois ajustes baratos — carimbar `savedAt` nas cópias isoladas para que também expirem, e publicar o texto de 4.2 deixando claro que a limpeza ocorre na próxima abertura do app.
2. Substituir o `alert` de privacidade (4.1) e acrescentar o modal de confirmação (4.3) — hoje o botão envia sem descrever o envio.
3. Trocar os contadores em memória por store compartilhado antes de qualquer deploy serverless; enquanto isso, manter apenas local.
4. Adicionar orçamento em dólar com alerta e bloqueio, além das cotas por contagem.
5. Persistir o log de metadados com prazo de retenção e acesso restrito; nunca incluir prompt, resposta ou justificativa.
6. Registrar consentimento de forma durável (versão, data, escopo) se houver qualquer uso de pesquisa.
7. Manter `catalog/items.json` sem identificação de revisores — já garantido por código; incluir teste de regressão.
8. Atualizar `docs/ANALISE-IA.md`, que ainda descreve o payload antigo (enunciados e justificativas sempre enviados) e não reflete o bloco E.

---

## 9. Referências

- Código: `src/storage.js`, `src/pilot.js`, `src/analysis.js`, `src/analyze-core.js`, `src/app.js`, `api/analyze.js`, `scripts/serve.js`, `index.html`.
- Requisitos internos: `README.md:85-92`, `ROADMAP.md:5,9,54-61,86`, `docs/SPEC-ANALISE-IA.md` (spec v2).
- OpenAI, *Data controls in the OpenAI platform*: <https://platform.openai.com/docs/guides/your-data> — dados da API não usados para treino por padrão; logs de abuso por até 30 dias; `store: false` não equivale a retenção zero.
- LGPD, Lei nº 13.709/2018, texto oficial: <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm> — referência para dado pessoal, dado sensível, bases legais, direitos e transferência internacional. A aplicação ao produto exige análise jurídica própria.
