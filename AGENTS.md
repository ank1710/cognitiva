# Cognitiva: instruções para agentes

- Leia [README](./README.md), [ROADMAP](./ROADMAP.md) e o brief da tarefa antes de editar.
- Use JavaScript/Node nativos e as dependências existentes. A versão atual não exige instalação de pacotes.
- Trabalhe somente nos arquivos autorizados pelo brief. Preserve testes existentes e mudanças de outras pessoas.
- Workers devem usar a pasta/worktree atribuída. Não faça alterações no checkout principal nem integre trabalho de outro worker.
- Não faça commit, push, publicação, instalação ou alteração de credenciais sem instrução específica para isso.
- Interface e conteúdo do produto permanecem em português do Brasil.
- Não descreva o produto como teste padronizado; não atribua QI, percentil, diagnóstico ou superioridade intelectual.
- Não envie dados reais de participantes para modelos. Use sessões sintéticas na validação.
- Novos itens exigem gabarito independente e revisão; variações de parâmetros não contam como estruturas independentes.
- Itens revisados ficam no vault do Obsidian (`Knowledge Base/Banco de Perguntas/Itens`), não no código. Só `status: approved` com `contentReview: passed` entra em prova; rode `npm run kb -- check` e `npm run kb -- import` depois de mudar o banco.
- Rode `npm run check` para alterações funcionais. Acrescente testes de regressão quando houver comportamento relevante não coberto. Para UI, verifique também a jornada afetada no navegador quando possível.
- Entregue: arquivos alterados, comportamento corrigido, verificações realmente executadas e limitações. Nunca afirme que um teste passou sem executá-lo.
- Se o escopo exigir outros arquivos, um contrato diferente ou mudanças na metodologia, pare e relate ao orquestrador.
