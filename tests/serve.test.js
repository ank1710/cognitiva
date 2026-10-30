import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, resolveHost } from '../scripts/serve.js';

const PILOT_TOKEN = 'convite-teste';
const results20 = {
  app: 'Cognitiva',
  summary: { correct: 1 },
  responses: Array.from({ length: 20 }, (_, i) => ({ id: `i${i}` }))
};
const authHeaders = (token = PILOT_TOKEN) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
const post = (body, token = PILOT_TOKEN) => ({ method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) });

function clearPilotEnv() {
  for (const name of ['PILOT_TOKENS', 'PILOT_PER_TOKEN_PER_MINUTE', 'PILOT_PER_TOKEN_PER_DAY', 'PILOT_GLOBAL_PER_DAY']) {
    delete process.env[name];
  }
}

async function withServer(run) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/** Liga o piloto antes de criar o servidor; o gate lê o env no createServer. */
async function withPilot(run, env = {}) {
  clearPilotEnv();
  process.env.PILOT_TOKENS = env.PILOT_TOKENS || PILOT_TOKEN;
  for (const [name, value] of Object.entries(env)) process.env[name] = String(value);
  try {
    await withServer(run);
  } finally {
    clearPilotEnv();
  }
}

test('GET /api/analyze devolve 405 JSON com Allow', async () => {
  delete process.env.OPENAI_API_KEY;
  await withServer(async base => {
    const res = await fetch(`${base}/api/analyze`);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST');
    const body = await res.json();
    assert.match(body.error, /Método não permitido/);
  });
});

test('POST sem corpo e com JSON quebrado devolve 400, não HTML', async () => {
  await withPilot(async base => {
    const empty = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${PILOT_TOKEN}` } });
    assert.equal(empty.status, 400);
    assert.match(empty.headers.get('content-type'), /application\/json/);
    const broken = await fetch(`${base}/api/analyze`, { method: 'POST', headers: authHeaders(), body: '{oops' });
    assert.equal(broken.status, 400);
    assert.equal((await broken.json()).fallback, 'copy-prompt');
  });
});

test('POST válido sem chave devolve 503 orientando o fallback', async () => {
  delete process.env.OPENAI_API_KEY;
  await withPilot(async base => {
    const res = await fetch(`${base}/api/analyze`, post({ results: results20 }));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /não está configurada/);
    assert.equal(body.fallback, 'copy-prompt');
  });
});

test('servidor continua entregando a interface e bloqueia path traversal', async () => {
  await withServer(async base => {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    const escape = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
    assert.equal(escape.status, 404);
  });
});

test('não serve dotfiles, .git nem .env', async () => {
  await withServer(async base => {
    for (const path of ['/.git/config', '/.git/HEAD', '/.env', '/src/.env', '/catalog/.env', '/.git']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 404, path);
    }
  });
});

test('serve apenas a interface, /src/ e /catalog/', async () => {
  await withServer(async base => {
    for (const path of ['/', '/index.html', '/src/app.js', '/src/analysis.js', '/catalog/items.json']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, path);
    }
    for (const path of ['/README.md', '/package.json', '/tests/serve.test.js', '/scripts/serve.js', '/api/analyze.js']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 404, path);
    }
  });
});

test('host padrão é loopback e HOST explícito é respeitado', () => {
  assert.equal(resolveHost({}), '127.0.0.1');
  assert.equal(resolveHost({ HOST: '' }), '127.0.0.1');
  assert.equal(resolveHost({ HOST: '   ' }), '127.0.0.1');
  assert.equal(resolveHost({ HOST: '0.0.0.0' }), '0.0.0.0');
});

test('POST com fingerprint desatualizado devolve 409 stale-report', async () => {
  process.env.OPENAI_API_KEY = 'sk-teste-local';
  try {
    await withPilot(async base => {
      const res = await fetch(`${base}/api/analyze`, post({ results: results20, dataFingerprint: 'sha256:desatualizado' }));
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.code, 'stale-report');
      assert.equal(body.fallback, 'copy-prompt');
    });
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});

test('POST com opt-in de justificativas e versão divergente devolve 400 consent-invalid', async () => {
  process.env.OPENAI_API_KEY = 'sk-teste-local';
  try {
    await withPilot(async base => {
      const res = await fetch(`${base}/api/analyze`, post({ results: results20, reasoningAuthorized: true, consentTextVersion: 'consent-0.9.0' }));
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.code, 'consent-invalid');
      assert.equal(body.fallback, 'copy-prompt');
    });
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});

test('sem PILOT_TOKENS a rota responde 503 pilot-unconfigured', async () => {
  clearPilotEnv();
  await withServer(async base => {
    const res = await fetch(`${base}/api/analyze`, post({ results: results20 }));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, 'pilot-unconfigured');
    assert.equal(body.fallback, 'copy-prompt');
  });
});

test('sem token responde 401 invite-required', async () => {
  await withPilot(async base => {
    const res = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results: results20 }) });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, 'invite-required');
  });
});

test('token inválido responde 403 invite-invalid', async () => {
  await withPilot(async base => {
    const res = await fetch(`${base}/api/analyze`, post({ results: results20 }, 'convite-errado'));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'invite-invalid');
  });
});

test('x-pilot-token funciona no servidor local', async () => {
  delete process.env.OPENAI_API_KEY;
  await withPilot(async base => {
    const res = await fetch(`${base}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pilot-token': PILOT_TOKEN },
      body: JSON.stringify({ results: results20 })
    });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /não está configurada/);
  });
});

test('limite por minuto devolve 429 com Retry-After', async () => {
  delete process.env.OPENAI_API_KEY;
  await withPilot(async base => {
    const first = await fetch(`${base}/api/analyze`, post({ results: results20 }));
    assert.equal(first.status, 503);
    const second = await fetch(`${base}/api/analyze`, post({ results: results20 }));
    assert.equal(second.status, 429);
    const body = await second.json();
    assert.equal(body.code, 'rate-limit');
    const retry = Number(second.headers.get('retry-after'));
    assert.ok(Number.isInteger(retry) && retry > 0 && retry <= 60, `Retry-After: ${retry}`);
  }, { PILOT_PER_TOKEN_PER_MINUTE: 1 });
});

test('limite diário por token devolve 429', async () => {
  delete process.env.OPENAI_API_KEY;
  await withPilot(async base => {
    assert.equal((await fetch(`${base}/api/analyze`, post({ results: results20 }))).status, 503);
    const second = await fetch(`${base}/api/analyze`, post({ results: results20 }));
    assert.equal(second.status, 429);
    assert.equal((await second.json()).code, 'rate-limit');
    assert.ok(Number(second.headers.get('retry-after')) > 0);
  }, { PILOT_PER_TOKEN_PER_MINUTE: 100, PILOT_PER_TOKEN_PER_DAY: 1 });
});

test('limite diário global soma tokens diferentes', async () => {
  delete process.env.OPENAI_API_KEY;
  await withPilot(async base => {
    assert.equal((await fetch(`${base}/api/analyze`, post({ results: results20 }))).status, 503);
    const second = await fetch(`${base}/api/analyze`, post({ results: results20 }, 'convite-outro'));
    assert.equal(second.status, 429);
    assert.equal((await second.json()).code, 'rate-limit');
  }, { PILOT_TOKENS: `${PILOT_TOKEN},convite-outro`, PILOT_PER_TOKEN_PER_MINUTE: 100, PILOT_GLOBAL_PER_DAY: 1 });
});

test('respostas estáticas e da API trazem os cabeçalhos de segurança', async () => {
  await withPilot(async base => {
    for (const url of [`${base}/`, `${base}/src/app.js`]) {
      const res = await fetch(url);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
      assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
    }
    const api = await fetch(`${base}/api/analyze`, post({ results: results20 }));
    assert.match(api.headers.get('content-security-policy'), /default-src|script-src 'self'/);
    assert.equal(api.headers.get('x-frame-options'), 'DENY');
  });
});

test('log de metadados não vaza justificativa nem corpo', async () => {
  delete process.env.OPENAI_API_KEY;
  const logs = [];
  const original = console.log;
  console.log = entry => { logs.push(String(entry)); };
  try {
    await withPilot(async base => {
      const body = { results: { ...results20, responses: results20.responses.map((response, index) => index === 0 ? { ...response, reasoning: 'texto sensível do participante' } : response) } };
      const res = await fetch(`${base}/api/analyze`, post(body));
      assert.equal(res.status, 503);
    });
  } finally {
    console.log = original;
  }
  const analysisLogs = logs.filter(line => line.includes('pilot-analysis'));
  assert.equal(analysisLogs.length, 1);
  assert.doesNotMatch(analysisLogs[0], /texto sensível/);
  assert.doesNotMatch(analysisLogs[0], /reasoning/);
  const entry = JSON.parse(analysisLogs[0]);
  for (const key of ['timestamp', 'status', 'durationMs', 'tokenHash', 'estimatedCostUsd']) assert.ok(key in entry, key);
  assert.equal(entry.status, 503);
  assert.match(entry.tokenHash, /^[0-9a-f]{6}$/);
});
