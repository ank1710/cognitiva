# Agentes complementares para o OpenBot

Perfis originais criados em 30/10/2026 para completar as responsabilidades previstas no [plano da fábrica](../FABRICA-SOFTWARE.md). Não foram copiados agentes de terceiros. Os agentes existentes de segurança da aplicação, design, campanha e suporte não são duplicados.

## Estado

As seis definições estão prontas, com instruções completas e independentes de arquivos auxiliares. O pacote recomendado agora é [cognitiva-agentes-transferencia-v2.zip](./cognitiva-agentes-transferencia-v2.zip), com [openbot-transfer.json](./openbot-transfer.json) na raiz, formato `openbot-instance-transfer`, versão 1. Não inclui arquivos do projeto, sessões de participantes, credenciais, configurações do servidor, rotinas, plugins nem permissões adicionais.

O pacote anterior, `cognitiva-agentes-2026-10-30.zip`, usa `openbot-agent-import`, destinado ao fluxo de importação de agentes de outros aplicativos. Ele foi recusado na tela **Transferência**, que espera outro formato. A orientação anterior de importação estava incompleta. Para a tela de Transferência, use o pacote v2 acima.

A instalação na interface do OpenBot ainda não foi confirmada. As tentativas de abrir a criação por automação exibiram o menu, mas não chegaram ao formulário/salvamento. A API Local scripts também não está habilitada. Nenhum banco de dados interno do aplicativo foi alterado.

## Importar

1. No OpenBot, abrir **configurações do servidor → Transferência → Importar neste servidor**.
2. Clicar em **Escolher arquivo…** e selecionar `cognitiva-agentes-transferencia-v2.zip`, nesta pasta.
3. Conferir a prévia: seis novos agentes, zero rotinas, zero arquivos de workspace e nenhuma configuração de conta/servidor a importar.
4. Confirmar a importação uma única vez. Se houver dúvida sobre o resultado, conferir a lista antes de repetir para evitar duplicatas.
5. Conferir modelo/provedor, esforço e permissões de cada agente antes de enviar tarefas. O pacote v2 define OpenCode com `opencode/deepseek-v4.1-flash-free`, esforço médio, e não define contas. O modelo constava no catálogo local; disponibilidade de inferência e limites não foram testados. Se o aplicativo avisar que substituiu o modelo, conferir a seleção antes de executar.

## Papéis e primeiro teste

| Agente | Responsabilidade | Solicitação de validação sugerida |
| --- | --- | --- |
| [Arquiteto de Sistemas](./arquiteto-sistemas.md) | Arquitetura, dados, integrações, falhas e decisões | Revisar arquitetura do Cognitiva em leitura; propor o menor caminho para piloto web/mobile |
| [QA de Jornadas](./qa-jornadas.md) | Jornadas, regressões, acessibilidade e recuperação | Preparar matriz de testes com diferenças entre verificado e ainda não executado |
| [Performance e Confiabilidade](./performance-confiabilidade.md) | Medições, capacidade, custos e operação | Definir baseline e plano de medição antes de otimizar |
| [Privacidade e Dados](./privacidade-dados.md) | Fluxos de dados, minimização, retenção e exclusão | Mapear armazenamento local, exportação e análise opcional por IA com dados sintéticos |
| [Conteúdo e Metodologia](./conteudo-metodologia.md) | Gabaritos, itens, ambiguidade e limites da interpretação | Resolver um lote pequeno de itens independentemente e registrar revisão |
| [Engenharia Mobile](./engenharia-mobile.md) | Android, iOS, builds, distribuição e testes | Diagnosticar ambiente e prontidão sem instalar ferramentas ou publicar |

Critério para validar um agente: entregar artefato específico, apontar evidências e limitações, respeitar o escopo e não apresentar verificações planejadas como executadas. Cadastro não comprova competência; esses testes ainda não foram enviados.

Use GPT para decisões complexas e revisão, e DeepSeek para tarefas delimitadas conforme a escolha do coordenador. Não é necessário acionar os seis juntos. A importação não migra esta conversa, não inicia tarefas e não habilita automação.

## Verificação do pacote

No pacote v2 foram conferidos: JSON, manifesto na raiz, formato/versão, seis chaves únicas, campos obrigatórios e seus tamanhos, instruções em português, ausência de rotinas, configurações e caminhos de arquivos importados, integridade do ZIP e manifesto idêntico ao arquivo fonte. Os campos foram comparados ao schema de transferência da versão instalada do OpenBot, 0.54.0. Isso não equivale à execução do decoder completo nem à importação: a aceitação final pelo aplicativo ainda depende da prévia/importação.

Fonte do formato v2: schema `instance-transfer-manifest` da versão instalada do OpenBot, inspecionado em leitura. O manifesto de importação original segue a documentação distribuída em `Contents/Resources/agent-import/grok-bot/SKILL.md`; esses dois fluxos têm formatos diferentes.
