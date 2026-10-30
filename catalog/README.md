# Catálogo de itens revisados

`items.json` é **gerado** por `npm run kb -- import` a partir do banco de perguntas do Obsidian. Não edite à mão.

## Regras

- Só entra no catálogo item com `status: approved` **e** `contentReview: passed`.
- Item `approved` sem `contentReview: passed` é rejeitado na validação.
- Notas com erro bloqueante impedem a importação inteira: o catálogo anterior é preservado.
- Duplicidade de `id` mantém a primeira ocorrência; versões novas substituem a nota no vault, não o id.
- A prova usa itens do catálogo primeiro e completa as vagas com famílias paramétricas (`origin: parametric`).

## Comandos

```bash
npm run kb -- status     # contagem por status, domínio e revisão
npm run kb -- check      # valida as notas; falha se alguma tiver erro
npm run kb -- import     # grava catalog/items.json
npm run kb -- import --dry-run
```

Vault padrão: `~/Documents/Obsidian Vault`. Outro caminho: `--vault <pasta>` ou `OBSIDIAN_VAULT`.

## Fluxo de revisão

1. Item nasce `draft` / `contentReview: pending` (template em `Knowledge Base/Templates/Item.md`).
2. Uma pessoa revisa enunciado, alternativas, gabarito independente e justificativa.
3. Ao aprovar: `status: approved`, `contentReview: passed`, `reviewedBy`, `reviewedAt`, `version` incrementada.
4. `npm run kb -- import` e `npm run check`.

O catálogo vazio é o estado correto enquanto não houver revisão humana registrada.
