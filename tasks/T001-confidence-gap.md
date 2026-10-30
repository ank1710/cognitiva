# T001 — Comparar confiança e acertos na mesma amostra

Status: ready. Não iniciada por um worker.

## Objetivo

Corrigir `confidenceGap` para comparar confiança média com a taxa de acertos das mesmas respostas que informaram confiança. Manter a acurácia geral sobre todas as respostas como medida separada.

## Contexto e reprodução

Leia [AGENTS](../AGENTS.md). Em `grade`, `rated` contém somente respostas marcadas com confiança, mas o gap usa `correct / completed.length`.

```js
const f = buildForm({seed: 4});
const [a, b] = f.items;
const score = grade(f, {
  [a.id]: {choice: a.answer, confidence: 100},
  [b.id]: {choice: (b.answer + 1) % 4}
});
```

Atual: `accuracy = 0.5`, `meanConfidence = 100`, `confidenceGap = 50`.
Esperado: `accuracy = 0.5`, `meanConfidence = 100`, `confidenceGap = 0`.

## Escopo

Arquivos permitidos: [engine](../src/engine.js) e [testes](../tests/engine.test.js).

Não editar UI, estilos, API, versão, documentação, comandos existentes ou outros cálculos. Não adicionar dependências. Preserve o formato do relatório exportado e o nome do campo `confidenceAccuracyGapPoints`.

## Aceite

1. Confiança em parte das respostas usa somente essa parte para calcular o gap.
2. Sem confiança em nenhuma resposta marcada, gap é `null`.
3. Confiança sem escolha marcada não entra na amostra.
4. Com confiança em todas as respostas, comportamento anterior permanece.
5. Testar tanto acertos quanto erros no subconjunto com confiança, para evitar uma correção que apenas retorne zero.
6. Acurácia geral, Brier e resultados por dimensão não mudam. Exportação reflete o gap corrigido.
7. Testes existentes preservados; `npm run check` aprovado.

## Entrega

Retorne resumo curto, arquivos alterados, resultado real dos checks e limitações. Não faça commit nem integração. Se não puder rodar um check, declare exatamente por quê.
