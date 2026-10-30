import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeResults, validateResults, MAX_COMPACT_LENGTH } from '../src/analyze-core.js';

const results20 = () => ({
  app: 'Cognitiva',
  summary: { correct: 5 },
  responses: Array.from({ length: 20 }, (_, i) => ({ id: `i${i}`, question: 'q' }))
});
const okFetch = (analysis = 'Panorama') => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ output: [{ content: [{ type: 'output_text', text: analysis }] }] })
});

test('sem chave devolve 503 com orientação, sem chamar a IA', async () => {
  let called = false;
  const r = await analyzeResults({ results: results20() }, { apiKey: '', fetchImpl: async () => { called = true; } });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /não está configurada/);
  assert.equal(called, false);
});

test('payload inválido devolve 400 e tamanho 19 não é aceito', async () => {
  assert.equal(validateResults(null).status, 400);
  assert.equal(validateResults({ app: 'Outro', responses: [] }).status, 400);
  const nineteen = { app: 'Cognitiva', responses: Array.from({ length: 19 }, () => ({})) };
  assert.equal(validateResults(nineteen).status, 400);
  const r = await analyzeResults({ results: nineteen }, { apiKey: 'k', fetchImpl: okFetch() });
  assert.equal(r.status, 400);
});

test('payload acima do limite devolve 413 sem chamar a IA', async () => {
  const huge = results20();
  huge.responses[0].question = 'x'.repeat(MAX_COMPACT_LENGTH + 10);
  assert.equal(validateResults(huge).status, 413);
});

test('caminho feliz devolve o texto da análise', async () => {
  const r = await analyzeResults({ results: results20() }, { apiKey: 'k', fetchImpl: okFetch('Análise ok.') });
  assert.equal(r.status, 200);
  assert.equal(r.body.analysis, 'Análise ok.');
});

test('limite do provedor e falha de rede viram 429 e 502', async () => {
  const limited = await analyzeResults({ results: results20() }, { apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
  assert.equal(limited.status, 429);
  const broken = await analyzeResults({ results: results20() }, { apiKey: 'k', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(broken.status, 502);
});

test('resposta do provedor sem texto não é tratada como sucesso', async () => {
  const r = await analyzeResults({ results: results20() }, { apiKey: 'k', fetchImpl: okFetch('   ') });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /não retornou texto/);
});

test('a chave nunca aparece no corpo devolvido', async () => {
  const r = await analyzeResults({ results: results20() }, { apiKey: 'sk-segredo', fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  assert.doesNotMatch(JSON.stringify(r), /sk-segredo/);
});
