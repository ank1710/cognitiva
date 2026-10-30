# Cognitiva 2.0 — alpha pública (base de desenvolvimento)

Protótipo funcional de avaliação educacional de raciocínio, **para pessoas com diferentes formações**, desenvolvido sem bibliotecas ou serviços externos obrigatórios. Interface em português do Brasil.

> **Aviso metodológico:** este não é um teste de inteligência padronizado. Não estima QI, percentis, diagnóstico ou altas habilidades. Não há calibração de itens, normas populacionais ou evidência de validade. Questões dinâmicas podem repetir estruturas semelhantes; os tiers diferem por tamanho, **não por precisão comprovada**.

## MacBook — executar localmente

Pré-requisito: Node.js **20 ou superior**, Git opcional, VS Code/Codex ou outra ferramenta de codificação de sua preferência.

1. Extraia o ZIP e abra o Terminal na pasta `cognitiva-v2`.
2. Execute:

```bash
node --version
npm run check
npm run dev
```

3. Abra **http://localhost:3000** no navegador.

Nenhum `npm install` é necessário nesta versão: o projeto usa JavaScript e Node.js nativos. `npm run check` roda os testes automatizados e auditorias de geração; `npm run dev` inicia servidor local para suportar módulos JavaScript.

O arquivo `index.html` precisa de um servidor HTTP: abri-lo diretamente por `file://` pode impedir importações de módulos.

## O que funciona nesta alpha

- Três modalidades de **20, 60 e 120 itens**; sessões variáveis com semente aleatória.
- **Cinco dimensões operacionais**: fluido, quantitativo, verbal, visuoespacial e raciocínio causal/sistêmico.
- **20 famílias de problemas paramétricos** (quatro por dimensão). Elas conseguem produzir milhares de combinações; isso **não** equivale a milhares de itens psicometricamente independentes.
- Contextos sociais, culturais, cotidianos, científicos, naturais e abstratos, evitando temas específicos de engenharia de software e banco.
- Correção local, explicações, notas opcionais, Brier Score, confiança subjetiva, resultados por habilidade e relatório JSON.
- Sessões que podem ser pausadas, resultado restaurado após atualizar a página e histórico das últimas 20 sessões no mesmo navegador.
- Rastreamento de questões vistas nesse navegador para diminuir repetição imediata (não garante equivalência de dificuldade).
- Compartilhamento deliberado com ChatGPT por copiar prompt/baixar JSON e endpoint opcional para OpenAI API.
- Layout responsivo para smartphone e desktop.

## Estrutura

```text
cognitiva-v2/
├── index.html           interface, sem dependências
├── src/
│   ├── app.js           estado da UI, sessões, eventos, relatórios
│   ├── engine.js        configuração de tiers, banco de famílias, motor, scoring
│   └── styles.css       tema visual
├── tests/
│   └── engine.test.js   testes determinísticos e invariantes
├── scripts/
│   ├── serve.js         servidor HTTP local
│   └── audit.js         auditoria de 900 formulários gerados
├── api/
│   └── analyze.js       exemplo de rota serverless opcional, NÃO pronta para exposição pública
└── ROADMAP.md           requisitos, qualidade e próximos marcos
```

## Objetivo do produto: medir habilidade, não familiaridade com a profissão

A dimensão cognitiva (por exemplo, raciocínio quantitativo) é distinta do contexto usado no enunciado (por exemplo, cotidiano ou natureza). É uma separação de **intenção de projeto**, ainda não uma evidência de que o desempenho seja independente de escolaridade, leitura, idade ou cultura.

`src/engine.js` define metadados por item: dimensão (`domain`), contexto (`topic`), família (`templateId`), chave de exposição (`fingerprint`), versão e regra de correção. O histórico local evita fornecer exatamente o mesmo item tão cedo quanto possível. Ao remover dados do navegador, o histórico de exposição é apagado.

Metacognição é tratada principalmente como **medida transversal**, comparando a confiança informada com a correção, além das justificativas livres. Não usamos uma suposta escala de metacognição de apenas quatro perguntas.

## Segurança e privacidade

- O funcionamento offline/local usa `localStorage` e não envia respostas automaticamente. Não requer identificação.
- Cada navegador/dispositivo mantém seus próprios dados; **não existem contas nem sincronização**. Um dispositivo compartilhado também compartilha o histórico local, a menos que seja apagado.
- O botão **Analisar via API** envia o relatório ao backend somente quando acionado. Esse fluxo é opcional.
- **NÃO exponha `api/analyze.js` a usuários públicos sem autenticação, proteção contra abuso, rate limiting, limites de custo, validação de payload, consentimento e política de dados.** A rota é apenas ponto de partida para desenvolvimento.
- Não inclua a chave `OPENAI_API_KEY` no código frontend. Se utilizar a API, configure-a somente no ambiente de servidor.
- Respostas corretas e código de geração ficam visíveis no cliente: é adequado para um laboratório educacional, **não** para testes protegidos, certificação ou comparação oficial entre pessoas.

## Próximos passos

Leia `ROADMAP.md` antes de construir novos recursos. **Prioridade imediata:** ampliar diversidade de *famílias estruturalmente distintas*, revisar cada gabarito, adicionar regras de acessibilidade e controle de exposição em múltiplos dispositivos; só depois pensar em CAT/TRI, IA para geração ao vivo e normas populacionais.

## Testes

```bash
npm test          # testes de unidades/invariantes
npm run audit     # 900 formulários gerados, formatos e consistência
npm run check     # ambos
```

A auditoria automática **não** verifica se as questões medem inteligência, se são justas para diferentes públicos, nem se a dificuldade informada corresponde ao comportamento real de participantes. Essas são etapas de pesquisa e revisão humana.
