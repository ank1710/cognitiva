# Cognitiva — operação de desenvolvimento e lançamento

Proposta de trabalho, 30/10/2026. Estado: planejamento e inventário; nenhuma delegação ou mudança de configuração foi executada nesta rodada.

Leia também [plano de desenvolvimento](./DEVELOPMENT-PLAN.md), [roadmap](./ROADMAP.md), [instruções](./AGENTS.md) e [brief inicial](./tasks/T001-confidence-gap.md).

## 1. O que foi observado no OpenBot

Na interface foram encontrados 14 agentes: Leos Agent, Project Partner, Spec Writer, PR Producer, PR Verifier, Bug Reproducer, Debugging Partner, Code Review Partner, Application Security Reviewer, Infosec Lab, Product Design Lead, Launch Coordinator, Campaign Analyst e Customer Support Partner.

Project Partner mostrava Claude Haiku 5.5, esforço Alto. Leos Agent mostrava o alias customizado Deepseek/DeepseekFlash, esforço Baixo. O seletor apresentava provedores Claude, ChatGPT, OpenCode e Personalizado. Isso confirma opções de configuração, não inferência bem-sucedida ou equivalência entre aliases e modelos oficiais.

O aplicativo inclui uma CLI em `/Applications/OpenBot.app/Contents/Resources/cli/openbot-cli.mjs`. O comando de listagem foi tentado e retornou exitCode 5: a API de automação não estava acessível; faltavam os arquivos de conexão de Local scripts. Nenhuma permissão foi habilitada.

A existência e os nomes dos agentes não comprovam cobertura técnica. Seus prompts completos, ferramentas, modelos e capacidade prática ainda precisam de validação por uma tarefa real.

Atualização: foram criados [seis perfis complementares e pacote de importação](./openbot-agents/README.md). As definições estão verificadas localmente, mas seu cadastro e funcionamento no OpenBot ainda não foram confirmados.

## 2. Como coordenar os modelos

Escolher um único lugar para o backlog e um único coordenador responsável por integrar mudanças. Se a operação for transferida ao OpenBot, esta sessão entrega contexto e revisões pontuais; não manter dois coordenadores escrevendo no mesmo checkout.

O agente coordenador do OpenBot pode usar um modelo GPT de maior capacidade disponível na conta. Isso abre outra sessão, com contexto próprio: não transfere automaticamente esta conversa nem comprova que usará o mesmo modelo. Conferir o ID, conta e esforço no seletor, depois validar uma chamada curta.

Workers de implementação podem usar DeepSeek Flash, com modelo/provedor explícitos e limites de execução. Não confundir: o endpoint customizado do OpenBot, o DeepSeek Harness separado e um modelo DeepSeek servido pelo OpenCode são caminhos distintos, com autenticação, recursos e cobrança próprios.

Fluxo: objetivo do produto → especificação com aceite → revisão de arquitetura conforme impacto → implementação isolada → verificações independentes → revisão de segurança/UX quando afetadas → integração → candidato a lançamento → aprovação do responsável pelo produto.

Não acionar todos os agentes para cada alteração. Uma correção de cálculo normalmente exige implementação, testes e revisão; não uma rodada de campanha ou arquitetura completa.

### Começar sem automação adicional

1. Entregar o [handoff](./OPENBOT-HANDOFF.md) ao Project Partner em um tópico do Cognitiva.
2. Confirmar modelo GPT do coordenador e caminho do projeto; não reutilizar silenciosamente contexto de outro produto.
3. Planejar o primeiro lote sem editar o código.
4. Criar o primeiro commit local somente com instrução específica do usuário. O Git já foi inicializado, mas não existe commit; worktrees ainda dependem desse baseline.
5. Preparar uma worktree por implementação e entregar T001 ao worker DeepSeek.
6. Revisar diff, executar `npm run check` e registrar aceite. Sem publicação automática.

### Automatizar depois do primeiro ciclo aceito

O OpenBot oferece CLI com `list`, `run`, `status` e ajustes de modelo. Para utilizá-la, a função Local scripts precisa estar habilitada para os agentes necessários, com acesso e escopo revisados. Começar pelo mínimo necessário, sem habilitar todos os agentes.

Exemplo de consulta, sem enviar tarefa:

```sh
node /Applications/OpenBot.app/Contents/Resources/cli/openbot-cli.mjs list --json
```

Uma futura entrega deve usar ID estável de tarefa/tentativa e guardar o identificador retornado. O timeout da CLI encerra a espera, mas o trabalho pode continuar: consultar `status` antes de reenviar. Não imprimir tokens nem copiar credenciais para documentos.

## 3. Cobertura dos domínios

"Complementar" abaixo significa definir e validar uma responsabilidade; não exige criar mais um agente imediatamente.

| Domínio | Agente existente aproveitável | Complemento e entrega exigida |
| --- | --- | --- |
| Produto e viabilidade comercial | Project Partner + Launch Coordinator | Público inicial, problema, proposta de valor, alternativas, hipótese de preço e experimento de demanda |
| Especificação | Spec Writer | Fluxo, estados, casos negativos, arquivos permitidos, aceite verificável |
| Arquitetura | Sem papel dedicado identificado | Responsável por fronteiras, dados, integrações, offline, falhas, compatibilidade mobile e decisões registradas |
| Implementação | PR Producer + Debugging Partner | Validar aptidão para implementar; DeepSeek como worker; patch pequeno e verificações reais |
| Revisão | Code Review Partner + PR Verifier | Revisão independente, reprodução de falhas e aceite por evidência; aceitar diff local sem exigir PR remoto |
| QA da jornada | Bug Reproducer + PR Verifier | Complementar regressão de ponta a ponta, navegadores, aparelhos, armazenamento, exportação e atualização |
| Segurança da aplicação | Application Security Reviewer | Modelo de ameaças, testes por cenário, acesso, payloads, segredos, abuso e custos de IA |
| Infraestrutura e operação | Infosec Lab, com escopo específico | Segurança de rede não substitui SRE: disponibilidade, deploy, recuperação, rollback, logs e resposta a incidentes |
| Performance e capacidade | Sem papel dedicado identificado | Medir carregamento e geração/scoring em aparelhos modestos; testar pico de tráfego e custo de serviços opcionais |
| UI/UX e acessibilidade | Product Design Lead | Clareza, conforto ao receber resultados, teclado, leitor de tela, contraste e interface mobile; teste com pessoas |
| Privacidade e dados | Sem papel dedicado identificado | Mapa de dados, minimização, retenção, exclusão, consentimento e revisão especializada quando necessária |
| Conteúdo e metodologia | Sem papel dedicado identificado | Revisão independente de itens, gabaritos, distratores, efeitos de contexto e limites das interpretações; participação humana especializada |
| Distribuição mobile | Sem papel dedicado identificado | Build/assinatura, persistência, ciclo de vida, TestFlight/Play Console e materiais de loja |
| Aquisição e monetização | Launch Coordinator + Campaign Analyst | Complementar estratégia, roteiros TikTok, oferta, medição de conversão, economia por usuário e experimentos de preço |
| Suporte e aprendizado | Customer Support Partner | Canal, triagem, feedback recorrente, incidentes e atualização do backlog |

Papéis podem ser agrupados: coordenador/arquitetura; QA; performance/operação/mobile; privacidade/conteúdo com especialistas humanos; crescimento. Revisões críticas precisam de evidências próprias, mesmo que usem o mesmo modelo em outra sessão. Concordância entre agentes não é prova de correção.

## 4. Critérios antes de ampliar o lançamento

Cada domínio registra `aprovado`, `reprovado`, `não verificado` ou `não aplicável`, com justificativa, versão do candidato, comando/ambiente, resultado e responsável. Pendência crítica bloqueia o lançamento; testes não executados não viram aprovação.

| Área | Evidência mínima para o primeiro piloto |
| --- | --- |
| Correção | T001 corrigida, falha local de IA tratada, regressões e auditoria aprovadas; gabaritos do lote do piloto revisados |
| Experiência | Jornada curta compreensível; feedback de participantes; resultado explica o que a pontuação significa e seus limites |
| Dispositivos | Testes em Android e iPhone reais, além do desktop, incluindo pausa, retorno do segundo plano e recuperação |
| Dados | Persistência, exportação e exclusão testadas; comportamento em falha de gravação; dados reais fora dos prompts de desenvolvimento |
| Segurança | Sem achados críticos/altos abertos sem tratamento; endpoint de IA permanece desabilitado se suas proteções não estiverem prontas |
| Performance | Medições em rede/aparelho definidos, metas acordadas antes do aceite e sem bloqueios perceptíveis na jornada; carga do backend quando existir |
| Operação | Candidato reproduzível, versão identificável, monitoramento e procedimento de recuperação/rollback testado |
| Comercial | Proposta de valor compreensível, destino do tráfego funcionando, suporte e métricas do experimento definidos |

Contas, sincronização, pagamentos, ranking e adaptação não são requisitos automáticos do primeiro piloto. Se entrarem no escopo, ganham análise de dados, segurança, falhas e operação próprias. Não dimensionar uma infraestrutura grande antes de medir demanda; prever limites e contingência para picos vindos do TikTok.

## 5. Lançar pelo TikTok

Hipótese inicial a validar: adultos interessados em praticar raciocínio e entender estratégias de resolução. Linguagem proposta: desafios educacionais e exercícios comentados. Evitar promessas de QI, diagnóstico ou comparação populacional que o produto não sustenta.

1. Definir a oferta: o que é gratuito, benefício de concluir a sessão e hipótese de receita. Se não houver decisão, começar com piloto gratuito e medir utilidade, sem prometer assinatura futura como fato.
2. Preparar uma página mobile curta, explicação do produto e um CTA direto. A primeira experiência deve funcionar sem cadastro obrigatório.
3. Criar três linhas de conteúdo e duas aberturas por linha: desafio com explicação; erro de raciocínio comum; demonstração de confiança versus verificação. São seis conceitos iniciais, não campanha já produzida.
4. Usar exemplos sintéticos e material próprio/licenciado. Não publicar sessões pessoais ou depoimentos sem autorização específica.
5. Experimentar primeiro com grupo pequeno e conteúdo orgânico. Para campanha paga, verificar políticas e configurar orçamento antes de gastar.
6. Medir o funil: visualização → clique → visita → início → conclusão → retorno → compra, se houver. Registrar origem por campanha sem colocar respostas, justificativas ou resultados individuais nos identificadores de marketing.
7. Medir duração ativa separadamente do tempo entre início e fim: uma sessão pausada não é tempo efetivo de avaliação.
8. Decidir a próxima ação pela etapa do funil: poucos cliques sugerem rever criativo/oferta; muitos inícios e poucas conclusões sugerem rever a experiência; conclusão sem retorno exige investigar utilidade recorrente. São hipóteses a testar.

Se houver monetização, acompanhar receita líquida, taxas, reembolsos, custo de IA/infraestrutura e suporte por usuário. CAC só faz sentido com atribuição e período definidos; não inferir vendabilidade de uma única pontuação ou quantidade de visualizações.

## 6. Primeiro lote operacional

1. Confirmar o coordenador e o worker reais no OpenBot; fazer uma chamada curta com conteúdo sintético.
2. Preparar baseline Git com autorização para commit e worktree de T001.
3. Executar e aceitar T001.
4. Corrigir indisponibilidade local da IA e robustez do armazenamento, em tarefas separadas.
5. Product Design Lead e QA revisam relatório e jornada curta; revisor de conteúdo confere o lote de itens.
6. Medir performance mobile e preparar piloto web HTTPS.
7. Launch Coordinator e Campaign Analyst executam o experimento de aquisição somente após o destino estar utilizável e mensurável.

Não foram feitos nesta rodada: configuração de agentes, chamadas de inferência, envio de mensagens, publicação, criação de campanha ou testes novos do aplicativo.
