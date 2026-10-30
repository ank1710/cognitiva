# Cognitiva: desenvolvimento com orquestrador e workers

Plano inicial e evidências verificadas em 30/10/2026. Complementa o [roadmap do produto](./ROADMAP.md).

## 1. Objetivo e divisão de trabalho

Usar esta sessão como orquestrador: definir escopo e critérios de aceite, preparar tarefas pequenas, revisar diffs, executar validação e integrar os resultados. Usar modelos de menor custo nos harnesses locais para implementar tarefas delimitadas.

Este fluxo é infraestrutura de desenvolvimento. Não adiciona agentes nem chamadas de modelos ao aplicativo dos participantes. A análise educacional opcional da aplicação continua sendo uma decisão separada.

| Papel | Responsabilidade | Quando usar |
| --- | --- | --- |
| Orquestrador, nesta sessão | Arquitetura, priorização, contratos, revisão e integração | Antes e depois de cada tarefa |
| Worker de código | Implementar um único brief com arquivos e aceite explícitos | Correções locais e recursos bem especificados |
| Worker de testes/revisão | Casos independentes, reprodução e revisão de patch | Quando houver isolamento de arquivos ou execução sequencial |
| Pessoa responsável pelo produto | Experimentar a aplicação e aprovar conteúdo e experiência | A cada incremento utilizável |

Começar com **um worker por vez**. Depois de uma tarefa aceita, testar dois workers em worktrees diferentes, com arquivos sob responsabilidade explícita. O orquestrador decide a integração; os workers não alteram o checkout principal.

## 2. Estado confirmado

- Node v22.22.3 e npm 10.9.8; projeto sem dependências externas obrigatórias.
- `npm run check`: **6 testes aprovados, 0 falhas**; auditoria de **900 formulários**, 20 famílias e 2.804 variações distintas nessa execução. Variações não equivalem a itens independentes ou validados.
- Servidor iniciado com `npm run dev`; interface aberta em http://localhost:3000.
- Smoke test no navegador integrado: sessão de 20 itens, resposta e nota, avanço, pausa, refresh, retomada na questão 2 com uma resposta preservada, conclusão, 20 entradas de revisão e resultado restaurado após refresh. O resultado sintético foi 6/20 e o histórico tinha uma entrada. Ao final, os dados sintéticos foram apagados pelo controle da interface e a página ficou na tela inicial.
- Não foram verificados nesta rodada: Safari, dispositivos reais, auditoria completa de acessibilidade, exportação/cópia, funcionamento offline sem servidor, nem análise com provedor externo.
- A pasta veio sem `.git`. Git do sistema falha pela licença do Xcode, mas `/opt/homebrew/bin/git` funciona, versão 2.54.0. Não é necessário aceitar a licença para usar esse Git.

| Harness | Evidência local | Prontidão para delegação |
| --- | --- | --- |
| OpenBot | Aplicativo instalado em `/Applications/OpenBot.app` | Interface/protocolo de automação e modelo ainda não verificados |
| DeepSeek Harness | Aplicativo instalado em `/Applications/DeepSeek Harness.app` | Modelo exato, limites, autenticação e protocolo ainda não verificados |
| Hermes | CLI v0.22.5; suporta pasta de trabalho, modelo/provedor e worktree | Sintaxe conferida no help; nenhuma inferência executada |
| OpenCode | CLI v2.1.4; `run`, modelo explícito e saída JSON | Catálogo lista `opencode/deepseek-v4.1-flash-free`; acesso, qualidade e custo real ainda não testados |
| Codex CLI | Executável não encontrado no PATH desta sessão | Esta sessão pode continuar como orquestrador sem instalar outra CLI |

O nome “free” no catálogo não comprova disponibilidade ou ausência de limites. Não há benchmark entre modelos ou estimativa financeira validada. Nenhum worker externo foi acionado neste levantamento.

## 3. Primeiro uso no Mac

O servidor desta sessão está em http://localhost:3000. Para reiniciar depois:

```sh
cd '/Users/leonardozanattaribeiro/cognitiva-v2 2'
npm run check
npm run dev
```

Abrir a URL no navegador; não abrir o HTML diretamente. Não precisa executar `npm install`. Encerrar o servidor com Ctrl+C no terminal em que foi iniciado.

Antes de ampliar o produto, fazer uma avaliação curta pessoal e observar clareza dos enunciados, leitura das grades, duração, confiança, pausa e compreensão do relatório. Registrar problemas com passos e resultado esperado.

## 4. Preparar delegação

1. Criar repositório local e um commit de baseline revisado, incluindo código original, testes e documentos. Usar o Git do Homebrew caso o Git padrão continue bloqueado. Não publicar remoto automaticamente.
2. Definir o modelo/provedor de um worker e limites de execução. Confirmar quais ferramentas ele pode usar. A instalação do harness não comprova que a autenticação está funcionando.
3. Criar uma worktree por tarefa a partir do mesmo commit conhecido, fora da pasta servida. Exemplo após existir o baseline:

   ```sh
   /opt/homebrew/bin/git worktree add -b worker/T001 ../cognitiva-T001 HEAD
   ```

4. Entregar ao worker o [brief T001](./tasks/T001-confidence-gap.md) e as [instruções do repositório](./AGENTS.md). Em interfaces gráficas, selecionar a worktree como projeto e colar o brief. Verificar que o harness realmente carregou as instruções.
5. O worker devolve mudanças, resultados de validação e pendências. O orquestrador revisa o diff e roda as verificações no resultado integrado antes de aceitar a tarefa.

Worktree evita colisão de arquivos; não é sandbox de segurança. Restringir ferramentas e acesso a credenciais conforme o harness. Não copiar dados reais de participantes ou segredos para prompts e logs.

### Opções de execução, depois da preparação

OpenCode, executado **dentro da worktree**, com modelo listado localmente:

```sh
opencode run --model opencode/deepseek-v4.1-flash-free \
  --format json --file tasks/T001-confidence-gap.md \
  'Implemente somente T001, respeite AGENTS.md e devolva evidências de validação.'
```

Hermes também permite `chat --query-file`, `--in`, `--provider`, `--model`, `--max-turns` e `--run-budget`. Escolher os valores depois de confirmar o modelo/provedor configurado; não inventar um identificador para “DeepSeek Flash”. O modo global `hermes -z` informa no help que contorna aprovações: não usá-lo como configuração padrão de workers.

Estas são rotas possíveis, não uma integração automatizada já construída. Para OpenBot/DeepSeek Harness, começar com entrega manual de briefs; automatizar somente após verificar API, CLI, ACP ou outro protocolo suportado. Não pressupor que uma sessão pode controlar outra interface automaticamente.

## 5. Protocolo de tarefa e custos

Cada brief precisa conter: objetivo, reprodução, arquivos permitidos, itens fora do escopo, critérios de aceite, verificações e formato de entrega. Estados: `ready → running → review → accepted`; usar `blocked` com motivo quando necessário.

- Primeira rodada: uma tarefa e uma tentativa; no máximo uma correção após revisão antes de escalar ao orquestrador.
- Fornecer apenas arquivos/contexto relevantes. Evitar enviar toda a conversa do orquestrador a cada worker.
- Registrar harness, modelo exato, provedor, tempo, tokens/custo quando disponíveis, verificações e motivo de rejeição. Campo indisponível deve ficar “desconhecido”.
- Limites de tempo/iterações não são limites financeiros. Configurar teto de gasto no provedor quando suportado, antes de processamento pago em lote.
- Não fazer fallback automático para modelo mais caro. Em timeout depois de possível aceitação remota, verificar o estado antes de reenviar e arriscar cobrança duplicada.
- Comparar custo **por tarefa aceita**, incluindo retrabalho e revisão do orquestrador. Usar o modelo maior para ambiguidade, arquitetura, segurança e falhas repetidas.

## 6. Backlog em ordem sugerida

| Ordem | Entrega | Aceite e responsável sugerido |
| --- | --- | --- |
| 0 | Baseline Git e primeira experiência pessoal | Recuperação possível; execução local reproduzível; orquestrador + usuário |
| 1 / T001 | Corrigir comparação confiança/acertos | Mesma amostra nas duas medidas; testes de confiança parcial; worker de engine |
| 2 | Tratar indisponibilidade da análise local | Sem erro de parsing exposto; resposta consistente e orientação útil; worker de UI/servidor |
| 3 | Robustez de armazenamento | Tratar JSON com estrutura inválida, versões incompatíveis e falha de gravação sem quebrar a interface; worker de UI |
| 4 | Acessibilidade e testes de jornada | Foco, teclado, leitura das grades e telas pequenas; exportar, apagar dados, sessões parciais e tiers 60/120 verificados |
| 5 | Catálogo e revisão de itens | Esquema de revisão/versionamento e pequeno lote realmente distinto, com gabarito independente e revisão humana |
| 6 | Crescer banco de candidatos | Ampliar por lotes revisados rumo aos 250–400 candidatos do roadmap; controlar contexto, leitura, exposição e ambiguidade |
| 7 | Piloto com múltiplos participantes | Consentimento, retenção, perfis/sincronização, autenticação e controles de custo antes de exposição pública |

Reproduções que motivaram as tarefas já aceitas:

- [T001] Em [grade](./src/engine.js), uma resposta correta com confiança 100% e outra incorreta sem confiança geravam média de confiança 100%, acurácia global 50% e gap 50 pontos. Corrigido: o gap usa só o subconjunto com confiança; a acurácia global continua separada.
- [T002] `POST /api/analyze` no servidor local retornava **405** em texto puro e a UI chamava `resp.json()` antes de tratar o status. Corrigido: rota local em JSON, cliente resiliente e mensagens específicas. O caminho de sucesso local ainda exige `OPENAI_API_KEY` no servidor.
- [T003] Armazenamento: `safeRead` aceitava qualquer JSON válido e `save` não tratava exceções de `localStorage`. Corrigido: envelope v2, validação, reparo e isolamento de dados suspeitos.

Não adicionar contas, banco de dados ou geração ao vivo de questões antes de validar a experiência básica. O banco paramétrico tem 20 estruturas e o catálogo revisado ainda está vazio; a auditoria de código não estabelece validade psicométrica. Modelos podem propor candidatos, mas não substituem revisão humana/especializada.

## 7. Estado em 30/10/2026

| Item | Estado | Evidência |
| --- | --- | --- |
| Baseline Git + remoto | aceito | `bac6fe2` em `github.com/ank1710/cognitiva`; worktree `worker/T001` |
| T001 confiança × acertos | aceito | `4db250d` |
| T002 análise indisponível | aceito | cliente resiliente, rota local `POST /api/analyze` |
| T003 armazenamento robusto | aceito | envelope v2, isolamento de dados corrompidos |
| T004 catálogo + Obsidian | aceito | `npm run kb -- check/import`, item revisado ocupando vaga na prova |
| Conteúdo revisado | pendente | 10 candidatos `draft`; nenhum `approved` |

Próximo passo: revisão humana do lote inicial e ampliação por lotes, não automação de aprovação.

## 8. Critério para automatizar o orquestrador

Depois de 2–3 tarefas aceitas, implementar um adaptador mínimo para **um** harness: recebe brief + pasta + modelo explícito; produz status, patch e relatório; respeita limites; não integra sozinho. Validar falha, timeout, cancelamento e execução duplicada antes de adicionar o próximo adaptador.

Saída mínima de worker: `taskId`, `harness`, `model`, `status`, `changedFiles`, `checks`, `usage`, `limitations`. Aceitação depende de execução independente dos checks pelo orquestrador.

Referência oficial para eventual automação com Codex: [modo não interativo](https://developers.openai.com/codex/noninteractive), incluindo saída JSON e schema. Os comandos dos demais harnesses acima foram conferidos no help local, não na documentação do Codex.
