import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeResults,
  validateResults,
  buildEvidence,
  validateAnalysis,
  RUBRIC_VERSION,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  MAX_COMPACT_LENGTH
} from '../src/analyze-core.js';

const DIMENSIONS = ['fluid', 'quant', 'verbal', 'spatial', 'systems'];

/** Relatório sintético com 20 itens (4 por dimensão). `answered` marca as
 * primeiras N respostas como respondidas, na ordem das dimensões. */
function makeReport({ tier = 'screening', answered = 20, correctByDimension = { quant: 3 } } = {}) {
  const responses = [];
  let index = 0;
  for (const dimension of DIMENSIONS) {
    for (let position = 0; position < 4; position++) {
      const hasAnswer = index < answered;
      const isCorrect = hasAnswer && position < (correctByDimension[dimension] ?? 0);
      responses.push({
        id: `r${index}`,
        templateId: `familia-${dimension}`,
        dimension,
        topic: 'abstrato',
        question: 'Enunciado sintético.',
        context: '',
        selected: hasAnswer ? (isCorrect ? 'Alternativa A' : 'Alternativa B') : null,
        correctAnswer: 'Alternativa A',
        isCorrect: hasAnswer ? isCorrect : null,
        confidence: hasAnswer ? 80 : null,
        reasoning: hasAnswer ? 'Comentário sintético do participante.' : '',
        explanation: 'Explicação sintética.',
        origin: 'parametric',
        familyId: `familia-${dimension}`,
        structureId: `familia-${dimension}`,
        contentReviewStatus: 'not-reviewed',
        selectedIndex: hasAnswer ? (isCorrect ? 0 : 1) : null,
        correctIndex: 0
      });
      index++;
    }
  }
  return {
    app: 'Cognitiva',
    version: '2.0.0-alpha.1',
    tier,
    summary: { correct: 3, answered, total: 20 },
    responses
  };
}

const goodTechnical = (overrides = {}) => ({
  audience: 'research',
  claims: [{
    id: 'C1',
    level: 'fact',
    dimension: 'quant',
    text: 'Acertou 3 de 4 itens de raciocínio quantitativo.',
    evidenceIds: ['D:quant:correct', 'D:quant:answered'],
    caveat: null
  }],
  limitations: ['Leitura descritiva de uma sessão sintética, sem generalização.'],
  refused: ['QI', 'percentil'],
  ...overrides
});

const envelope = technical => ({ schemaVersion: SCHEMA_VERSION, technical });

const okFetch = payload => async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    output: [{ content: [{ type: 'output_text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] }]
  })
});

const run = (report, payload, options = {}) => analyzeResults(
  { results: report },
  { apiKey: 'sk-teste', model: 'gpt-test', fetchImpl: okFetch(payload), ...options }
);

test('bloco E é determinístico e o fingerprint é estável (AC-1)', () => {
  const first = buildEvidence(makeReport());
  const second = buildEvidence(makeReport());
  assert.deepEqual(first.evidence, second.evidence);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^sha256:[0-9a-f]{64}$/);
  const different = buildEvidence(makeReport({ tier: 'standard' }));
  assert.notEqual(first.fingerprint, different.fingerprint);
});

test('bloco E não carrega justificativa, enunciado nem PII (AC-10)', () => {
  const report = makeReport();
  report.responses[0].reasoning = 'Fulano estuda na escola municipal X.';
  report.responses[0].question = 'Enunciado confidencial do item.';
  const { evidence } = buildEvidence(report);
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /Fulano/);
  assert.doesNotMatch(serialized, /Enunciado confidencial/);
  assert.equal(evidence.consent.scope, 'none');
  assert.equal(evidence.consent.reasoningIncluded, false);
  assert.equal(evidence.items[0].reasoningChars, 'Fulano estuda na escola municipal X.'.length);
});

test('sessão com menos de 10 respostas vira insufficient sem chamar o provedor (AC-5)', async () => {
  let called = false;
  const r = await analyzeResults(
    { results: makeReport({ answered: 8 }) },
    { apiKey: 'sk-teste', fetchImpl: async () => { called = true; } }
  );
  assert.equal(called, false);
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'insufficient');
  assert.ok(r.body.technical.claims.every(claim => claim.level === 'fact'));
  assert.ok(r.body.technical.limitations.some(text => /insuficiente/i.test(text)));
  assert.equal(r.body.model, 'none');
});

test('dimensão com menos de 3 respostas é suprimida e declarada (AC-6)', async () => {
  const report = makeReport();
  for (const response of report.responses.filter(r => r.dimension === 'systems')) {
    response.selected = null;
    response.isCorrect = null;
    response.confidence = null;
  }
  const result = await analyzeResults(
    { results: report },
    {
      apiKey: 'sk-teste',
      fetchImpl: okFetch(envelope(goodTechnical({
        claims: [{
          id: 'C1',
          level: 'hypothesis',
          dimension: 'systems',
          text: 'O padrão sugere dificuldade com dependências.',
          evidenceIds: ['D:systems:answered'],
          caveat: 'hipótese não testada',
          alternativeExplanations: ['Familiaridade com o formato']
        }]
      })))
    }
  );
  assert.equal(result.status, 422);
  assert.equal(result.body.code, 'invalid-schema');
  assert.match(result.body.detail, /suprimida/);
});

test('sucesso devolve o envelope analysis-2 com versões e fingerprint (AC-7)', async () => {
  const report = makeReport();
  const expected = buildEvidence(report);
  const r = await run(report, envelope(goodTechnical()));
  assert.equal(r.status, 200);
  assert.equal(r.body.schemaVersion, 'analysis-2');
  assert.equal(r.body.rubricVersion, RUBRIC_VERSION);
  assert.equal(r.body.promptVersion, PROMPT_VERSION);
  assert.equal(r.body.model, 'gpt-test');
  assert.match(r.body.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(r.body.dataFingerprint, expected.fingerprint);
  assert.equal(r.body.technical.claims.length, 1);
  assert.match(r.body.analysis, /raciocínio quantitativo/);
  assert.equal(r.body.technical.sessionSummary.answered, 20);
});

test('o resumo da sessão vem do servidor, não do modelo', async () => {
  const r = await run(makeReport(), envelope(goodTechnical({ sessionSummary: { answered: 99, total: 99 } })));
  assert.equal(r.status, 200);
  assert.equal(r.body.technical.sessionSummary.answered, 20);
  assert.equal(r.body.technical.sessionSummary.total, 20);
});

test('claim sem evidenceIds rejeita a resposta inteira (AC-2)', async () => {
  const r = await run(makeReport(), envelope(goodTechnical({
    claims: [{ id: 'C1', level: 'fact', dimension: 'quant', text: 'Acertou 3 de 4.', evidenceIds: [], caveat: null }]
  })));
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'invalid-schema');
  assert.match(r.body.detail, /evidenceIds/);
});

test('evidenceId desconhecido rejeita a resposta inteira (AC-2)', async () => {
  const r = await run(makeReport(), envelope(goodTechnical({
    claims: [{ id: 'C1', level: 'fact', dimension: 'quant', text: 'Acertou 3 de 4.', evidenceIds: ['D:quant:nao-existe'], caveat: null }]
  })));
  assert.equal(r.status, 422);
  assert.match(r.body.detail, /desconhecido/);
});

test('número adulterado em claim fact é rejeitado (AC-3)', async () => {
  const r = await run(makeReport(), envelope(goodTechnical({
    claims: [{
      id: 'C1',
      level: 'fact',
      dimension: 'quant',
      text: 'Acertou 99 de 4 itens de raciocínio quantitativo.',
      evidenceIds: ['D:quant:correct', 'D:quant:answered'],
      caveat: null
    }]
  })));
  assert.equal(r.status, 422);
  assert.match(r.body.detail, /número sem correspondência/);
  assert.match(r.body.detail, /99/);
});

test('frase proibida rejeita citando a expressão (AC-4)', async () => {
  const r = await run(makeReport(), envelope(goodTechnical({
    claims: [{
      id: 'C1',
      level: 'fact',
      dimension: 'quant',
      text: 'O resultado sugere QI elevado.',
      evidenceIds: ['D:quant:correct'],
      caveat: null
    }]
  })));
  assert.equal(r.status, 422);
  assert.match(r.body.detail, /expressão proibida: QI/);
});

test('hipótese sem alternativa concorrente é rejeitada', async () => {
  const r = await run(makeReport(), envelope(goodTechnical({
    claims: [{
      id: 'C1',
      level: 'hypothesis',
      dimension: 'quant',
      text: 'O padrão sugere dificuldade com percentuais.',
      evidenceIds: ['D:quant:accuracy'],
      caveat: 'hipótese não testada'
    }]
  })));
  assert.equal(r.status, 422);
  assert.match(r.body.detail, /alternativa concorrente/);
});

test('justificativa literal fora do bloco E é rejeitada (AC-10)', async () => {
  const report = makeReport();
  report.responses[0].reasoning = 'Fulano estuda na escola municipal X.';
  const r = await run(report, envelope(goodTechnical({
    claims: [{
      id: 'C1',
      level: 'fact',
      dimension: 'quant',
      text: 'Fulano estuda na escola municipal X.',
      evidenceIds: ['D:quant:correct'],
      caveat: null
    }]
  })));
  assert.equal(r.status, 422);
  assert.match(r.body.detail, /justificativa literal/);
});

test('formato de chave de API na saída do modelo é rejeitado', async () => {
  const r = await run(makeReport(), envelope(goodTechnical({
    claims: [{
      id: 'C1',
      level: 'fact',
      dimension: 'quant',
      text: 'Acertou 3 de 4 com sk-abcdefgh123.',
      evidenceIds: ['D:quant:correct'],
      caveat: null
    }]
  })));
  assert.equal(r.status, 422);
  assert.match(r.body.detail, /chave de API/);
});

test('mesmo relatório e mesma saída do modelo produzem o mesmo envelope auditável', async () => {
  const first = await run(makeReport(), envelope(goodTechnical()));
  const second = await run(makeReport(), envelope(goodTechnical()));
  assert.equal(first.body.dataFingerprint, second.body.dataFingerprint);
  assert.deepEqual(first.body.technical.claims, second.body.technical.claims);
});

test('resposta do provedor sem JSON válido vira 502 com fallback', async () => {
  const r = await run(makeReport(), 'texto solto sem JSON');
  assert.equal(r.status, 502);
  assert.equal(r.body.code, 'invalid-schema');
  assert.equal(r.body.fallback, 'copy-prompt');
});

test('limite do provedor, 5xx e falha de rede viram 429 e 502', async () => {
  const limited = await analyzeResults({ results: makeReport() }, { apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
  assert.equal(limited.status, 429);
  const broken = await analyzeResults({ results: makeReport() }, { apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  assert.equal(broken.status, 502);
  const offline = await analyzeResults({ results: makeReport() }, { apiKey: 'k', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(offline.status, 502);
});

test('sem chave devolve 503 com orientação, sem chamar a IA (AC-8)', async () => {
  let called = false;
  const r = await analyzeResults({ results: makeReport() }, { apiKey: '', fetchImpl: async () => { called = true; } });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /não está configurada/);
  assert.equal(r.body.fallback, 'copy-prompt');
  assert.equal(called, false);
});

test('payload inválido devolve 400 e tamanho 19 não é aceito', async () => {
  assert.equal(validateResults(null).status, 400);
  assert.equal(validateResults({ app: 'Outro', responses: [] }).status, 400);
  const nineteen = { app: 'Cognitiva', responses: Array.from({ length: 19 }, () => ({})) };
  assert.equal(validateResults(nineteen).status, 400);
  const r = await analyzeResults({ results: nineteen }, { apiKey: 'k', fetchImpl: okFetch(envelope(goodTechnical())) });
  assert.equal(r.status, 400);
});

test('payload acima do limite devolve 413 sem chamar a IA', async () => {
  const huge = makeReport();
  huge.responses[0].question = 'x'.repeat(MAX_COMPACT_LENGTH + 10);
  assert.equal(validateResults(huge).status, 413);
  let called = false;
  const r = await analyzeResults({ results: huge }, { apiKey: 'k', fetchImpl: async () => { called = true; } });
  assert.equal(r.status, 413);
  assert.equal(called, false);
});

test('fingerprint divergente devolve 409 stale-report sem chamar a IA', async () => {
  let called = false;
  const r = await analyzeResults(
    { results: makeReport() },
    { apiKey: 'k', expectedFingerprint: 'sha256:desatualizado', fetchImpl: async () => { called = true; } }
  );
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'stale-report');
  assert.equal(called, false);
});

test('a chave nunca aparece no corpo devolvido', async () => {
  const r = await analyzeResults({ results: makeReport() }, { apiKey: 'sk-segredo', fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  assert.doesNotMatch(JSON.stringify(r), /sk-segredo/);
});

test('validateAnalysis aceita laudo técnico completo e recusa schema desconhecido', () => {
  const { evidence } = buildEvidence(makeReport());
  const good = envelope(goodTechnical());
  assert.equal(validateAnalysis(good, evidence).ok, true);
  const bad = validateAnalysis({ schemaVersion: 'analysis-1', technical: goodTechnical() }, evidence);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /schemaVersion/);
});
