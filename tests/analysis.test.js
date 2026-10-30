import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAnalysis, ANALYSIS_MESSAGES } from '../src/analysis.js';

const fakeResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
});
const report = { app: 'Cognitiva', responses: [{ id: 'x' }] };

test('resposta 200 com análise válida', async () => {
  const r = await requestAnalysis(report, { fetchImpl: async () => fakeResponse(200, { analysis: '  Panorama ok.  ' }) });
  assert.equal(r.ok, true);
  assert.equal(r.analysis, 'Panorama ok.');
});

test('405 em texto puro não gera erro de parsing', async () => {
  const r = await requestAnalysis(report, { fetchImpl: async () => fakeResponse(405, 'Método não permitido') });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'method');
  assert.equal(r.status, 405);
  assert.equal(r.message, ANALYSIS_MESSAGES.method);
});

test('corpo não JSON com status de erro mantém mensagem útil', async () => {
  const r = await requestAnalysis(report, { fetchImpl: async () => fakeResponse(500, '<html>erro</html>') });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'server-error');
  assert.match(r.message, /Tente de novo/);
});

test('503, 429, 413 e 400 têm mensagens específicas', async () => {
  for (const [status, code] of [[503, 'unconfigured'], [429, 'rate-limit'], [413, 'too-large'], [400, 'invalid-payload']]) {
    const r = await requestAnalysis(report, { fetchImpl: async () => fakeResponse(status, { error: 'x' }) });
    assert.equal(r.code, code, `status ${status}`);
    assert.equal(r.message, ANALYSIS_MESSAGES[code]);
  }
});

test('200 sem analysis é resposta inválida, não sucesso vazio', async () => {
  for (const body of [{}, { analysis: '' }, { analysis: 42 }, 'texto solto']) {
    const r = await requestAnalysis(report, { fetchImpl: async () => fakeResponse(200, body) });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid-response');
  }
});

test('falha de rede vira mensagem, sem exceção', async () => {
  const r = await requestAnalysis(report, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'network');
  assert.equal(r.message, ANALYSIS_MESSAGES.network);
});

test('requisição que estoura o tempo é cancelada', async () => {
  const r = await requestAnalysis(report, {
    timeoutMs: 20,
    fetchImpl: (url, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'timeout');
});

test('sem fetch ou com relatório inválido não tenta enviar', async () => {
  const missing = await requestAnalysis(report, { fetchImpl: null });
  assert.equal(missing.code, 'unsupported');
  const invalid = await requestAnalysis(null, { fetchImpl: async () => fakeResponse(200, { analysis: 'x' }) });
  assert.equal(invalid.code, 'invalid-payload');
});

test('timeout continua valendo enquanto o corpo é lido', async () => {
  const r = await requestAnalysis(report, {
    timeoutMs: 20,
    fetchImpl: () => Promise.resolve({
      ok: true,
      status: 200,
      text: () => new Promise(() => { /* corpo travado: nunca resolve */ })
    })
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'timeout');
  assert.equal(r.message, ANALYSIS_MESSAGES.timeout);
});

test('abortar durante a leitura do corpo resulta em timeout, não sucesso parcial', async () => {
  const r = await requestAnalysis(report, {
    timeoutMs: 20,
    fetchImpl: (url, options) => Promise.resolve({
      ok: true,
      status: 200,
      text: () => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })
    })
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'timeout');
});

test('corpo lento mas dentro do prazo é lido até o fim', async () => {
  const r = await requestAnalysis(report, {
    timeoutMs: 500,
    fetchImpl: () => Promise.resolve({
      ok: true,
      status: 200,
      text: () => new Promise(resolve => setTimeout(() => resolve(JSON.stringify({ analysis: 'ok' })), 20))
    })
  });
  assert.equal(r.ok, true);
  assert.equal(r.analysis, 'ok');
});
