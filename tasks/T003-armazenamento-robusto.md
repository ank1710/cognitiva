# T003 — Armazenamento local robusto

Status: accepted. Implementada em `src/storage.js` com testes em `tests/storage.test.js`.

## Objetivo

Uma sessão salva não pode impedir a interface de abrir. JSON inválido, formato antigo, índice fora da faixa, respostas órfãs e falha de gravação devem ser tratados com aviso claro, sem apagar dados em silêncio.

## Reprodução

`safeRead` aceitava qualquer JSON válido: `{"a":1}` na chave da sessão derrubava a tela ao ler `session.form.items`. `save` chamava `localStorage.setItem` sem tratar cota ou bloqueio do navegador, então a avaliação quebrava no meio.

## Escopo

- `src/storage.js`: envelope versionado, validação, reparo, isolamento de dados corrompidos e gravação tolerante a falha.
- `src/app.js`: usa o store; aviso visível em `#storageNotice`.
- `index.html`: faixa de aviso acessível (`role="status"`, `aria-live`).
- `tests/storage.test.js`: regressões.

## Comportamento

| Situação | Resultado |
|---|---|
| JSON inválido | dado copiado para `<chave>__isolated` e removido da chave principal; aviso |
| Estrutura incompatível | mesma isolação; a pessoa começa uma nova avaliação |
| Sessão sem envelope (v1) | migrada na leitura; aviso de ajuste |
| Índice fora da faixa, resposta órfã, confiança > 100 | reparados; aviso de ajuste |
| Cota cheia ou gravação bloqueada | sessão continua na aba; aviso de que pode ser perdida |
| `localStorage` ausente | avaliação funciona sem persistência, com aviso |

## Aceite

1. Nenhuma leitura lança exceção.
2. Dados suspeitos são isolados e recuperáveis, nunca sobrescritos em silêncio.
3. Falha de gravação é informada na interface.
4. Jornada verificada no navegador: corrupção → aviso; iniciar → responder → recarregar → retomar.
5. `npm run check` aprovado.
