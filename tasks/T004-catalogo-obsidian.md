# T004 — Catálogo de itens revisados via Obsidian

Status: accepted. Implementada em `src/catalog.js`, `scripts/kb-sync.js` e `catalog/`, com testes em `tests/catalog.test.js`.

## Objetivo

Tirar os itens revisados do código e colocá-los no banco de perguntas do Obsidian, com validação e versionamento. A prova usa item revisado quando existe e completa o restante com famílias paramétricas. Item não aprovado nunca entra em prova.

## Escopo

- `src/catalog.js`: frontmatter, seções, alternativas, validação, normalização de domínio e filtro de jogabilidade.
- `scripts/kb-sync.js`: `status`, `check`, `import` (e `--dry-run`), lendo o vault do disco.
- `catalog/items.json`: artefato gerado; começa vazio.
- `src/engine.js`: `buildForm` aceita `catalog` e prioriza itens revisados por dimensão.
- `src/app.js`: carrega `/catalog/items.json` e passa o catálogo para a prova.
- README do vault, template de item e `catalog/README.md` alinhados ao schema real.

## Regras de aceite

1. `approved` exige `contentReview: passed`; os demais estados ficam fora da prova.
2. Nota inválida (gabarito, alternativas, domínio, datas, seções) falha em `check` e bloqueia o `import`.
3. Catálogo parcial não quebra a prova: completa com famílias paramétricas.
4. Catálogo grande preenche a prova sem duplicar `id` e prefere itens ainda não vistos.
5. Item malformado no JSON é ignorado, não derruba a geração.
6. `npm run check` aprovado.

## Verificado no navegador

Com um catálogo de teste contendo `QUANT-BOMBAS-0201` aprovado, a prova de 20 itens incluiu o item revisado (`origin: curated`). O catálogo foi restaurado vazio depois do teste e os dados sintéticos do navegador foram apagados.

## Limitações

O lote inicial tem 10 candidatos `draft` com revisão pendente. Nenhum item foi aprovado por uma pessoa; o catálogo permanece vazio até que isso aconteça. Figuras, matrizes e itens visuais ainda não têm representação no schema.
