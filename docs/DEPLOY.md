# Deploy do piloto (preparação)

Este documento descreve como publicar o Cognitiva quando o deploy for autorizado.
**Nada aqui foi publicado**: não há conta criada, segredo salvo nem deploy feito.

## Antes de publicar

- O piloto é fechado por convite: sem `PILOT_TOKENS`, `POST /api/analyze` responde `503 pilot-unconfigured`.
- O modo local (sem IA) continua funcionando sem variável nenhuma.
- Nunca versione tokens ou `OPENAI_API_KEY`; use o painel do provedor e `.env.example` só como referência.
- Confirme que o repositório está no commit desejado e que `npm run check` está verde.

## Render Free (Web Service Node)

1. Crie uma conta no Render e conecte o repositório `ank1710/cognitiva`.
2. **New + → Blueprint** aponta para `render.yaml`; se preferir manual, use **New + → Web Service** com:
   - Runtime: Node
   - Build command: `echo 'sem dependências para instalar'` (não há dependências nem `package-lock.json`)
   - Start command: `node scripts/serve.js`
   - Health check path: `/`
   - Plano: Free
3. Preencha no painel as variáveis marcadas com `sync: false`: `PILOT_TOKENS`, `OPENAI_API_KEY`, `OPENAI_MODEL` e os três `PILOT_*` de limite. `HOST=0.0.0.0` já vem no blueprint; `PORT` é injetado pelo Render.
4. O plano Free hiberna depois de ~15 minutos sem tráfego. O primeiro acesso seguinte sofre cold start (dezenas de segundos), inclusive para o health check.

O mesmo `scripts/serve.js` do ambiente local roda no Render: escuta em `0.0.0.0` por causa de `HOST`, serve a interface, valida convite, aplica limites e adiciona os cabeçalhos de segurança.

## Vercel Hobby (site estático + função)

1. Importe o repositório na Vercel; o projeto é estático (`index.html` + `src/` + `catalog/`) e a rota `api/analyze.js` vira uma função serverless.
2. Em **Project Settings → Environment Variables**, configure as mesmas variáveis do Render. Não é necessário build nem instalar dependências.
3. `vercel.json` aplica CSP, `nosniff`, `no-referrer` e `DENY` aos arquivos estáticos; a função já envia os mesmos cabeçalhos por conta própria.
4. **Limitação importante:** os contadores de `PILOT_*` ficam em memória por instância quente. Em serverless, cada instância tem seu próprio contador e eles zeram no cold start; com várias instâncias, os limites reais podem ficar acima do configurado. Para piloto com tráfego relevante, troque o limitador por um store compartilhado (Redis/KV) antes de abrir.
5. O plano Hobby tem limites de uso e de função; confira o painel da Vercel antes de divulgar o link.

## Custo da OpenAI

- A conta da OpenAI é a fonte de cobrança; este repositório não controla fatura.
- Defina um **limite de gasto** no painel da OpenAI (Usage limits) antes de qualquer convite real.
- Os tetos `PILOT_PER_TOKEN_PER_DAY`, `PILOT_GLOBAL_PER_DAY` e `PILOT_PER_TOKEN_PER_MINUTE` limitam volume, não o preço unitário.
- Os logs `pilot-analysis` trazem uma **estimativa** de custo (heurística de 4 caracteres por token e preços de referência configuráveis). Ela serve para acompanhamento, não substitui a fatura.
- `store: false` evita estado da aplicação, mas não elimina logs de abuso do provedor. Não envie dados reais de participantes sem revisão de privacidade.

## Convites: gerar e revogar

Gere um token aleatório e coloque a lista separada por vírgula em `PILOT_TOKENS`:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

- **Conceder:** adicione o token à variável e reinicie/redeploy o serviço. O link fica `https://SEU-DOMINIO/#convite=TOKEN`.
- **Revogar:** remova o token da variável e reinicie/redeploy. Não há armazenamento de convites no servidor; a lista é a única fonte.
- O token vai no fragmento da URL e fica só em `sessionStorage`; não aparece em relatório, prompt ou `localStorage`.

## Verificação local do startCommand

```bash
HOST=0.0.0.0 PORT=3216 node scripts/serve.js
curl -I http://127.0.0.1:3216/
```

Sem `HOST`, o comando continua em `127.0.0.1:3000` (ou na `PORT` informada), como antes.
