# Análise opcional por IA — contrato, dados e requisitos

**Versão:** `2.0.0-alpha.1` (commit `f3b76db`)
**Complementa:** `docs/PRIVACIDADE.md`
**Escopo:** descreve o fluxo implementado e os requisitos técnicos para que ele possa operar publicamente. Não é parecer jurídico.

---

## 1. Fluxo como implementado

```text
[Resultado na tela]
   │ clique em "Analisar via API"  (src/app.js:80)
   ▼
requestAnalysis(result)  (src/analysis.js:37)
   │ POST /api/analyze  { results: relatórioCompleto }  (src/analysis.js:52-57)
   │ timeout 45 s, AbortController                       (src/analysis.js:49)
   ▼
Servidor (scripts/serve.js:39-54  ou  api/analyze.js:8-19)
   │ sem chave  → 503 + fallback "Copiar análise"       (src/analyze-core.js:41-43)
   │ valida app/tamanho (400/413)                        (src/analyze-core.js:20-29)
   ▼
validateResults → compact = {summary, responses}        (src/analyze-core.js:24)
   ▼
OpenAI POST /v1/responses                                (src/analyze-core.js:49-58)
   modelo gpt-5-mini | max_output_tokens 2200 | store:false
   ▼
resposta → extrai output_text → {analysis}               (src/analyze-core.js:31-38,69-71)
   ▼
Texto exibido em memória, não persistido                 (src/app.js:80)
```

Nenhuma outra rota do app transmite dados. O servidor local não grava requisições em disco (`scripts/serve.js`).

---

## 2. Campos enviados

### Para o servidor do Cognitiva
O relatório completo do navegador (`src/engine.js:111`): `app`, `version`, `methodology`, `formId`, `tier`, `startedAt`, `finishedAt`, `summary`, `responses[]`.

Os campos de topo servem para validação e não são repassados: o compacto enviado à OpenAI contém somente `summary` e `responses`.

### Para a OpenAI
- `summary`: acertos, respondidas, total, precisão, confiança média, Brier, lacuna confiança–acerto, `byDomain[]` e `byTopic[]`.
- `responses[]` por questão: `id`, `templateId`, `dimension`, `topic`, `question`, `context`, `selected`, `correctAnswer`, `isCorrect`, `confidence`, **`reasoning`**, `explanation`.

Não vão: nome, e-mail, conta, `formId`, `tier`, horários, IP como campo (o IP é visível na conexão).

Instruções fixas (`src/analyze-core.js:10-18`) proíbem QI, percentil, diagnóstico e mandam tratar justificativas como dados — não como instruções. Essa última parte é uma defesa relevante contra injeção de prompt pelo texto livre.

---

## 3. Retenção do provedor

`store: false` (`src/analyze-core.js:55`) evita o estado de aplicação da Responses API, mas **não** elimina os logs de monitoramento de abuso. Segundo a documentação oficial da OpenAI ([Data controls](https://platform.openai.com/docs/guides/your-data), consultada em 30/10/2026):

- dados da API não são usados para treinar modelos por padrão;
- logs de monitoramento de abuso podem conter prompt e resposta e são mantidos por **até 30 dias**;
- retenção menor exige aprovação de Zero Data Retention ou Modified Abuse Monitoring na organização/projeto.

Consequência para o aviso ao usuário: a frase correta é "até 30 dias em registros de segurança", não "não retemos nada".

---

## 4. Requisitos para exposição pública

Todos reprovados no estado atual. Ordem sugerida de implementação:

| Ordem | Requisito | Implementação mínima | Teste de aceite |
|---|---|---|---|
| 1 | Confirmação prévia | Modal com os campos exatos; só chamar `requestAnalysis` após ação positiva | `fetch` não é chamado sem confirmação |
| 2 | Autenticação/antiabuso | Token de sessão ou assinatura de origem + rate limit por IP e por sessão | requisição anônima → 401/403; excesso → 429 |
| 3 | Limite de custo | Teto por requisição, por janela e diário; bloqueio ao atingir; `max_output_tokens` documentado | teste com orçamento esgotado → 429/503 |
| 4 | Timeout no upstream | `AbortController` no `fetch` do servidor (hoje ausente em `src/analyze-core.js:49`) | chamada lenta é abortada e devolve 504/502 |
| 5 | Minimização | Envio opcional sem `reasoning`; truncar e sinalizar campos removidos | payload sem justificativas é aceito |
| 6 | Auditoria sem conteúdo | Log de timestamp, status, duração, custo estimado e origem; nunca prompt/resposta/justificativa | grep no log não encontra `reasoning` |
| 7 | Retenção e exclusão | Política com prazo para logs; procedimento de eliminação; canal de contato | documento + teste de expiração |
| 8 | Cabeçalhos | HTTPS, CSP, `Cache-Control: no-store` (já presente), sem CORS aberto | `curl -I` em produção |

Detalhes de critério por item estão em `docs/PRIVACIDADE.md`, seção 7 (C1–C14).

---

## 5. Riscos específicos deste fluxo

1. **Custo aberto**: qualquer chamador que descubra a rota pode consumir a chave; a validação aceita qualquer JSON com `app:"Cognitiva"` e 20/60/120 respostas, sem verificar se a sessão é legítima (`src/analyze-core.js:20-29`).
2. **Conteúdo livre**: a justificativa é o único campo com dado imprevisível; é também o de maior valor analítico. A tensão precisa ser resolvida por escolha explícita da pessoa, não por padrão.
3. **Sem timeout no upstream**: o cliente desiste em 45 s, mas a função do servidor continua e pode gerar custo mesmo após o usuário ver erro.
4. **Mensagem de erro genérica**: em 5xx o usuário não sabe se o envio ocorreu (`src/analyze-core.js:64-68`); para transparência, informar que a solicitação pode ter sido processada.
5. **Resultado não persistido**: bom para privacidade, mas a pessoa perde a análise ao recarregar — o que pode levá-la a copiar o texto para outro serviço, ampliando a exposição. Vale oferecer "baixar análise" com aviso.

---

## 6. Evidências já existentes

- `tests/analyze-core.test.js:16` — sem chave → 503 sem chamar a IA.
- `tests/analyze-core.test.js:33` — payload acima do limite → 413 sem chamar a IA.
- `tests/analyze-core.test.js:58` — a chave nunca aparece na resposta.
- `tests/analysis.test.js:67` — sem `fetch` ou relatório inválido, nenhum envio.
- `tests/serve.test.js:44` — servidor local sem chave responde 503 com fallback.
- Execução local: `npm test` → 51/51 aprovados.

Não há teste que verifique ausência de justificativas no payload, confirmação prévia, rate limit, timeout do servidor ou conteúdo de log — lacunas a cobrir quando os itens acima forem implementados.
