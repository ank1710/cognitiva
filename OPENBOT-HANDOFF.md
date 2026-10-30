# Texto para iniciar o Cognitiva no OpenBot

Copie o bloco abaixo para um tópico do Project Partner. Primeiro selecione o modelo de orquestração desejado no OpenBot; o texto não troca o modelo por si só.

```text
Vamos coordenar o desenvolvimento do Cognitiva neste projeto:
/Users/leonardozanattaribeiro/cognitiva-v2 2

Responda em português do Brasil. Comece com planejamento e leitura, sem alterar código, configurações ou permissões.

Leia AGENTS.md, README.md, ROADMAP.md, DEVELOPMENT-PLAN.md,
FABRICA-SOFTWARE.md e tasks/T001-confidence-gap.md.

Você será o coordenador. Confirme seu modelo/provedor real e as ferramentas disponíveis. Se não conseguir verificar, diga "não verificado". Não afirme que esta sessão é a mesma conversa que criou os documentos.

Quero usar um modelo GPT de maior capacidade para arquitetura, especificação,
revisão e integração, e DeepSeek Flash para implementações pequenas.
Antes de delegar, identifique o caminho real: endpoint customizado OpenBot,
OpenCode ou DeepSeek Harness separado. Não substitua modelos nem habilite
fallback mais caro silenciosamente.

Confira os agentes existentes e proponha responsáveis por:
produto/oferta; arquitetura; código; QA; segurança; privacidade/dados;
performance/operação; UI/UX/acessibilidade; conteúdo/metodologia;
distribuição mobile; TikTok/conversão; suporte.
Para cada área indique agente, lacuna, entrega e critério de aceite.
Não precisamos criar um agente por área nem acionar todos a cada tarefa.

O Git local já foi inicializado, mas ainda não tem commit nem remoto.
Não faça commit, push, instalação, publicação ou alteração de credenciais
sem instrução específica. Workers só podem editar a worktree atribuída.
Enquanto não existir baseline, relate essa dependência antes de implementar.

A primeira tarefa de código é T001. Use somente os arquivos autorizados
pelo brief e dados sintéticos. Não envie relatórios reais de participantes.
Quem revisa deve examinar o diff e executar os checks; não aceite só a
afirmação do worker de que os testes passaram.

Organize o primeiro lote de até três tarefas, com dependências,
arquivos permitidos, critérios de aceite e verificações.
Registre modelo, tempo e custo quando disponíveis; caso contrário,
registre "desconhecido". Não reinicie uma tarefa em timeout sem consultar
se ela continua rodando.

Objetivo de lançamento: piloto de exercícios educacionais, com relatório
claro e itens revisados, atraindo adultos pelo TikTok. O aplicativo não é
um teste padronizado e não pode prometer QI, diagnóstico ou percentil.
Contas, pagamentos e IA pública só entram com escopo e proteções próprios.

Entregue primeiro o plano operacional e as dependências verificadas.
Não comece a implementar nem lançar campanhas neste primeiro turno.
```

Critério para o handoff funcionar: o agente identifica o projeto correto, confirma o que consegue verificar e devolve tarefas com aceite. A mera leitura ou aceitação deste texto não comprova que a delegação está funcionando.
