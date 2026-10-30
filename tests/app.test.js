import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, buildAnalysisView, evidenceLabel, modeLabel } from '../src/app.js';

const response = body => ({ ok: true, json: async () => body });

test('loadCatalog devolve a lista de itens revisados', async () => {
  const list = [{ id: 'A' }, { id: 'B' }];
  assert.deepEqual(await loadCatalog({ fetchImpl: async () => response(list) }), list);
});

test('loadCatalog cai em lista vazia quando o arquivo não existe ou o JSON é inválido', async () => {
  assert.deepEqual(await loadCatalog({ fetchImpl: async () => ({ ok: false, status: 404, json: async () => [] }) }), []);
  assert.deepEqual(await loadCatalog({ fetchImpl: async () => response({ items: [] }) }), []);
  assert.deepEqual(await loadCatalog({ fetchImpl: async () => { throw new TypeError('offline'); } }), []);
});

test('loadCatalog não trava quando o corpo da resposta nunca chega', async () => {
  const started = Date.now();
  const list = await loadCatalog({
    timeoutMs: 30,
    fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) })
  });
  assert.deepEqual(list, []);
  assert.ok(Date.now() - started < 1000);
});

const analysisOutcome = (overrides = {}) => ({
  ok: true,
  mode: 'limited',
  rubricVersion: 'rubric-1.0.0',
  promptVersion: 'prompt-1.0.0',
  model: 'gpt-test',
  generatedAt: '2026-10-30T12:00:00.000Z',
  dataFingerprint: 'sha256:abc123',
  technical: {
    audience: 'research',
    sessionSummary: { tier: 'screening', answered: 18, total: 20, globalAccuracy: 0.61 },
    claims: [
      { id: 'C1', level: 'fact', dimension: 'quant', text: 'Acertou 3 de 4 itens.', evidenceIds: ['D:quant:correct', 'D:quant:answered'], caveat: null },
      { id: 'C2', level: 'hypothesis', dimension: 'verbal', text: 'Padrão compatível com leitura longa.', evidenceIds: ['I:6'], caveat: 'hipótese não testada', alternativeExplanations: ['Familiaridade com o formato'] }
    ],
    limitations: ['Amostra sintética, sem generalização.'],
    refused: ['QI', 'percentil']
  },
  ...overrides
});

test('laudo mostra versões, fingerprint, modo e resumo do servidor', () => {
  const view = buildAnalysisView(analysisOutcome());
  const meta = Object.fromEntries(view.meta.map(item => [item.key, item.value]));
  assert.equal(meta.rubricVersion, 'rubric-1.0.0');
  assert.equal(meta.promptVersion, 'prompt-1.0.0');
  assert.equal(meta.model, 'gpt-test');
  assert.equal(meta.dataFingerprint, 'sha256:abc123');
  assert.equal(meta.mode, 'Limitado (amostra parcial)');
  assert.match(meta.generatedAt, /2026/);
  assert.match(view.summaryText, /Respondidas: 18 de 20/);
  assert.match(view.summaryText, /61%/);
});

test('claims trazem nível, dimensão, evidência legível e caveat', () => {
  const view = buildAnalysisView(analysisOutcome());
  assert.equal(view.claims.length, 2);
  assert.equal(view.claims[0].level, 'Fato');
  assert.equal(view.claims[0].dimension, 'Raciocínio quantitativo');
  assert.deepEqual(view.claims[0].evidence.map(item => item.label), ['acertos — Raciocínio quantitativo', 'itens respondidos — Raciocínio quantitativo']);
  assert.equal(view.claims[0].evidence[0].id, 'D:quant:correct');
  assert.equal(view.claims[1].level, 'Hipótese');
  assert.equal(view.claims[1].caveat, 'hipótese não testada');
  assert.equal(view.limitations[0], 'Amostra sintética, sem generalização.');
  assert.deepEqual(view.refused, ['QI', 'percentil']);
});

test('modo insufficient explica a ausência de leitura por dimensão', () => {
  const view = buildAnalysisView(analysisOutcome({ mode: 'insufficient', technical: { ...analysisOutcome().technical, claims: [] } }));
  assert.equal(view.modeLabel, 'Amostra insuficiente');
  assert.match(view.insufficient, /menos de 10 respostas/);
  assert.match(view.insufficient, /não faz leitura por dimensão/);
  assert.equal(view.claims.length, 0);
});

test('ids de evidência viram texto legível sem perder o id original', () => {
  assert.equal(evidenceLabel('G:answered'), 'Questões respondidas na sessão');
  assert.equal(evidenceLabel('I:6'), 'Questão 7');
  assert.equal(evidenceLabel('D:spatial:accuracy'), 'acurácia — Raciocínio visuoespacial');
  assert.equal(evidenceLabel('T:abstrato:correct'), 'acertos — tópico abstrato');
  assert.equal(evidenceLabel('desconhecido'), 'desconhecido');
  assert.equal(modeLabel('full'), 'Completo');
  assert.equal(modeLabel('insufficient'), 'Amostra insuficiente');
});
