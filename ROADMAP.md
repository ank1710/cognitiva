# Cognitiva — Product Requirements / Roadmap de implementação

## 0. Princípios não negociáveis

- **Público amplo:** não usar um modelo baseado na profissão, em assuntos estudados ou nas preferências de uma pessoa específica. O app precisa atender adultos com perfis variados; adequações para menores ou situações de acessibilidade requerem estudos próprios.
- **Construto versus contexto:** 'raciocínio fluido' é dimensão operacional; 'natureza', 'cotidiano', 'cultura' etc. são cenários, não habilidades. Medir e controlar o efeito do cenário.
- **Cuidado com o rótulo de inteligência:** sem padronização psicométrica, reportar desempenho na bateria, não inteligência geral, QI, percentil ou diagnóstico.
- **Revisão dos itens antes de produção:** toda família precisa de especificação, gabarito independente, verificação de distratores, conteúdo culturalmente acessível, versão e teste.
- **Privacidade por padrão:** não pedir nome, idade, saúde ou outros dados pessoais para a bateria local. Qualquer pesquisa futura precisa de consentimento e governança apropriada.
- **Não confundir muitas variações com muitos itens independentes:** 120 versões de 20 estruturas podem gerar efeitos de treino e redundância.

## 1. Modelo conceitual

```text
AssessmentForm {formId, tier, seed, version, itemIds[]}
Item {
  id, templateId, domain, topic, format, language,
  prompt, context, options, answerKey, explanation,
  generationParameters, contentReviewStatus, difficultyStatus,
  calibrationStats?, itemVersion
}
Response {itemId, selectedOption, confidence?, notes?, timeOnTask?}
Session {formId, answers, completedAt?, consentFlags, appVersion}
Score {rawCorrect, answered, byDomain, byTopic, calibrationMetrics}
```

**Separação de responsabilidades:** UI não calcula a habilidade; engine seleciona itens e computa pontuação; IA apenas interpreta resultados e justificativas de maneira delimitada.

## 2. Marcos

### Marco A — Base 2.0-alpha (entregue neste ZIP)

- [x] Separar engine e interface em módulos.
- [x] Tiers de 20, 60 e 120 itens, equilibrados em número entre cinco dimensões.
- [x] Geração paramétrica, sementes reproduzíveis e identificação de exposição.
- [x] Contextos não restritos a tecnologia/finanças; linguagem acessível.
- [x] Metacognição transversal: confiança por item, diferença confiança/acertos, Brier.
- [x] Pausa/retomada, histórico local, exportação e integração opcional de IA.
- [x] Testes automatizados e auditoria do gerador.
- [ ] Revisão humana completa dos itens e cobertura de acessibilidade.
- [ ] Validar adequação real do tier longo, cuja redundância permanece elevada.

### Marco B — Banco de itens de verdade (PRIORIDADE)

- [x] Pipeline de catálogo: nota de item no Obsidian, validação, revisão e importação para a prova.
- [x] Lote inicial de 10 candidatos estruturalmente distintos em `Itens/` (todos `draft`, revisão humana pendente).
- [ ] Criar catálogo de pelo menos 250–400 **itens candidatos substancialmente distintos** (não apenas permutações de número/cor/nome).
- [ ] Registrar duas revisões independentes por item, além de resolver matematicamente onde possível.
- [ ] Fixar distribuição de tipos de tarefa, carga de leitura, assunto, formato e heurística provisória de dificuldade.
- [ ] Adicionar figuras visuais acessíveis, matrizes, rotação mental, analogias, raciocínio espacial e problemas qualitativamente distintos.
- [ ] Garantir seleção que controle familiaridade cultural, escolaridade requerida, leitura e exposição anterior.
- [ ] Adicionar avaliações equivalentes **para pesquisa**, sem afirmar equivalência estatística antes de testar.

### Marco C — Aplicação pública com múltiplos participantes

- [ ] Definir consentimento, termos, retenção e gestão dos dados conforme aplicável.
- [ ] Introduzir contas opcionais / perfis anônimos e sincronização entre dispositivos; preservar um modo sem conta.
- [ ] Autenticação, proteção contra abuso, rate limits, quotas e limites de custo no endpoint de IA.
- [ ] Mover gabaritos/itens seguros para serviço de avaliação quando houver uso supervisionado; considerar fraude e exposição.
- [ ] Testes cross-browser e acessibilidade (WCAG); suporte a teclado, leitores de tela, contraste e visualizações não dependentes de cor.
- [ ] Observabilidade da plataforma separada de dados sensíveis dos participantes.

### Marco D — Adaptação experimental

- [ ] Medir exposição e desempenho por item (apenas com consentimento e desenho de coleta adequado).
- [ ] Implementar seleção adaptativa provisória com limites e comparação a formulários fixos.
- [ ] Não chamá-la de CAT/TRI calibrado até haver parâmetros estimados a partir de amostras apropriadas.
- [ ] Criar métricas e dashboards para detectar itens com ambiguidades, funcionamento diferencial e efeito de prática.

### Marco E — Validação psicométrica

- [ ] Parceria com psicometristas/psicólogos e revisão ética da coleta.
- [ ] Estudos de validade e confiabilidade, precisão por domínio, formas alternativas e invariância em grupos.
- [ ] Se tecnicamente apropriado, calibrar itens por TRI; comparar modelos e avaliar erro de medida.
- [ ] Considerar amostragem normativa apenas após definição formal de população, construtos e condições de uso.
- [ ] Não apresentar equivalência com escalas de QI sem evidência apropriada e autorização legal/regulatória.

## 3. Critérios de aceite imediatos

1. `npm run check` deve passar.
2. Cada tier deve gerar exatamente 20/60/120 itens com equilíbrio numérico entre as cinco dimensões.
3. Nenhuma prova pode conter exatamente o mesmo `fingerprint` duas vezes.
4. Gabaritos únicos (quatro alternativas) e resposta numérica validada por regra independente, quando aplicável.
5. Formulário com a mesma semente é reproduzível; outra semente normalmente muda os itens.
6. A primeira experiência deve ser compreensível sem conhecer MuleSoft, API, QA, BMW ou outro assunto técnico específico.
7. Aplicação não solicita identidade para começar e não transmite respostas sem ação explícita.
8. Relatórios não atribuem QI, percentil ou conclusão de altas habilidades.

## 4. Riscos abertos

- As 20 famílias ainda são poucas para tiers de 60/120: a exposição a estruturas repetidas pode favorecer quem aprende o formato durante a prova.
- Os contextos não estão uniformemente distribuídos e precisam de uma matriz de balanceamento explícita.
- Pontuações são escores brutos e não comparáveis entre formulários de dificuldade potencialmente diferente.
- Raciocínio causal/sistêmico é uma dimensão exploratória do produto, não uma escala psicométrica estabelecida.
- Níveis de escolaridade, alfabetização, idade, idioma, neurodiversidade e acesso digital podem alterar o desempenho. O app ainda não controla esses efeitos.
- A IA pode produzir interpretações persuasivas sem base estatística: deve se ater aos dados e explicitar incertezas.
