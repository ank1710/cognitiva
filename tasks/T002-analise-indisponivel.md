# T002 — Tratar indisponibilidade da análise por IA

Status: accepted. Implementada com testes em `tests/analysis.test.js`, `tests/analyze-core.test.js` e `tests/serve.test.js`.

## Objetivo

Quando a análise automática não estiver disponível (servidor local, sem chave, método errado, limite ou rede), a interface mostra uma orientação útil em português e mantém o caminho de copiar o relatório. Nenhum erro de parsing vaza para a pessoa.

## Reprodução

Com `npm run dev`, o botão **Analisar via API** recebia `405` com corpo de texto puro. `src/app.js` chamava `resp.json()` antes de tratar o status, então o erro exibido era de JSON, não a causa real.

## Escopo

- `src/analysis.js`: cliente resiliente, códigos de falha e mensagens.
- `src/analyze-core.js`: validação e chamada ao provedor, compartilhados.
- `api/analyze.js`: adaptador do endpoint publicado.
- `scripts/serve.js`: rota `POST /api/analyze` no servidor local.
- `src/app.js`: uso do cliente, sem `try/catch` de parsing.
- `tests/*.test.js`: regressões.

## Aceite

1. Resposta não JSON não gera erro de parsing.
2. 405, 503, 429, 413 e 400 têm mensagens específicas; o botão volta a ficar habilitado.
3. Servidor local responde JSON consistente em sucesso e falha.
4. Nada é enviado sem clique explícito; a chave nunca chega ao cliente.
5. `npm run check` aprovado.

## Limitações

O caminho de sucesso local exige `OPENAI_API_KEY` no ambiente do servidor. A publicação continua exigindo autenticação, rate limit e revisão de privacidade (Marco C).
