import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, resolveHost } from '../scripts/serve.js';

const results20 = {
  app: 'Cognitiva',
  summary: { correct: 1 },
  responses: Array.from({ length: 20 }, (_, i) => ({ id: `i${i}` }))
};

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
  await withServer(async base => {
    const empty = await fetch(`${base}/api/analyze`, { method: 'POST' });
    assert.equal(empty.status, 400);
    assert.match(empty.headers.get('content-type'), /application\/json/);
    const broken = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    assert.equal(broken.status, 400);
    assert.equal((await broken.json()).fallback, 'copy-prompt');
  });
});

test('POST válido sem chave devolve 503 orientando o fallback', async () => {
  delete process.env.OPENAI_API_KEY;
  await withServer(async base => {
    const res = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results: results20 }) });
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
    await withServer(async base => {
      const res = await fetch(`${base}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: results20, dataFingerprint: 'sha256:desatualizado' })
      });
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
    await withServer(async base => {
      const res = await fetch(`${base}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: results20, reasoningAuthorized: true, consentTextVersion: 'consent-0.9.0' })
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.code, 'consent-invalid');
      assert.equal(body.fallback, 'copy-prompt');
    });
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});
