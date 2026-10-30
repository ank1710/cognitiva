import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAnalysis, withoutReasoning, ANALYSIS_MESSAGES } from '../src/analysis.js';

const fakeResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
});
const report = { app: 'Cognitiva', responses: [{ id: 'x' }] };
const FINGERPRINT = `sha256:${'a'.repeat(64)}`;

const envelope = (overrides = {}) => ({
  schemaVersion: 'analysis-2',
  rubricVersion: 'rubric-1.0.0',
  promptVersion: 'prompt-1.1.0',
  mode: 'full',
  model: 'gpt-test',
  generatedAt: '2026-10-30T12:00:00.000Z',
  dataFingerprint: FINGERPRINT,
  evidenceSnapshotId: FINGERPRINT,
  justificationConsent: { authorized: false, scope: 'none', consentId: null },
  participant: {
    audience: 'participant',
    releaseStatus: 'blocked',
    signedBy: null,
    derivedFromClaims: ['C1'],
    sections: [{ title: 'O que a sessão mostrou', text: 'Acertou 3 de 4.', sourceClaimIds: ['C1'] }],
    exercises: [],
    closing: 'prévia interna — não é avaliação clínica nem devolutiva oficial'
  },
  technical: {
    audience: 'research',
    sessionSummary: { tier: 'screening', answered: 20, total: 20, globalAccuracy: 0.6 },
    claims: [{ id: 'C1', level: 'fact', dimension: 'quant', text: 'Acertou 3 de 4.', evidenceIds: ['D:quant:correct'], caveat: null }],
    limitations: ['Leitura descritiva.'],
    refused: ['QI']
  },
  analysis: '  Panorama ok.  ',
  ...overrides
});

test('resposta 200 com envelope analysis-2 válido', async () => {
  const r = await requestAnalysis(report, { fetchImpl: async () => fakeResponse(200, envelope()) });
  assert.equal(r.ok, true);
  assert.equal(r.analysis, 'Panorama ok.');
  assert.equal(r.rubricVersion, 'rubric-1.0.0');
  assert.equal(r.promptVersion, 'prompt-1.1.0');
  assert.equal(r.model, 'gpt-test');
  assert.equal(r.dataFingerprint, FINGERPRINT);
  assert.equal(r.technical.claims.length, 1);
  assert.equal(r.participant.releaseStatus, 'blocked');
  assert.deepEqual(r.participant.derivedFromClaims, ['C1']);
});

test('schema desconhecido vira invalid-schema, não sucesso parcial', async () => {
  for (const body of [
    { analysis: 'texto antigo' },
    envelope({ schemaVersion: 'analysis-1' }),
    envelope({ rubricVersion: undefined }),
    envelope({ dataFingerprint: 'md5:abc' }),
    envelope({ technical: { claims: [] } }),
    envelope({ participant: undefined }),
    envelope({ participant: { audience: 'participant' } })
  ]) {
    const r = await requestAnalysis(report, { fetchImpl: async () => fakeResponse(200, body) });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid-schema');
    assert.equal(r.message, ANALYSIS_MESSAGES['invalid-schema']);
  }
});

test('409 do servidor vira stale-report com detalhe', async () => {
  const r = await requestAnalysis(report, {
    fetchImpl: async () => fakeResponse(409, { error: 'Relatório mudou.', code: 'stale-report', fallback: 'copy-prompt' })
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'stale-report');
  assert.equal(r.message, ANALYSIS_MESSAGES['stale-report']);
  assert.match(r.detail, /Relatório mudou/);
});

test('400 do servidor vira consent-invalid', async () => {
  const r = await requestAnalysis(report, {
    fetchImpl: async () => fakeResponse(400, { error: 'consentimento', code: 'consent-invalid', fallback: 'copy-prompt' })
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'consent-invalid');
  assert.equal(r.message, ANALYSIS_MESSAGES['consent-invalid']);
});

test('422 com code invalid-schema preserva o detalhe da rubrica', async () => {
  const r = await requestAnalysis(report, {
    fetchImpl: async () => fakeResponse(422, { error: 'rubrica', code: 'invalid-schema', detail: 'expressão proibida: QI' })
  });
  assert.equal(r.code, 'invalid-schema');
  assert.match(r.detail, /expressão proibida/);
});

test('fingerprint esperado vai no corpo da requisição', async () => {
  let sent = null;
  await requestAnalysis(report, {
    expectedFingerprint: FINGERPRINT,
    fetchImpl: async (url, options) => {
      sent = JSON.parse(options.body);
      return fakeResponse(200, envelope());
    }
  });
  assert.equal(sent.dataFingerprint, FINGERPRINT);
  assert.deepEqual(sent.results, report);
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

test('sem fetch ou com relatório inválido não tenta enviar', async () => {
  const missing = await requestAnalysis(report, { fetchImpl: null });
  assert.equal(missing.code, 'unsupported');
  const invalid = await requestAnalysis(null, { fetchImpl: async () => fakeResponse(200, envelope()) });
  assert.equal(invalid.code, 'invalid-payload');
});

test('opt-in de justificativas viaja no corpo com a versão vigente', async () => {
  let sent = null;
  await requestAnalysis(report, {
    reasoningAuthorized: true,
    consentTextVersion: 'consent-1.0.0',
    fetchImpl: async (url, options) => {
      sent = JSON.parse(options.body);
      return fakeResponse(200, envelope());
    }
  });
  assert.equal(sent.reasoningAuthorized, true);
  assert.equal(sent.consentTextVersion, 'consent-1.0.0');
});

test('sem opt-in o corpo declara reasoningAuthorized false e remove o texto livre', async () => {
  const withReasoning = {
    ...report,
    responses: [{ id: 'x', reasoning: 'Meu nome é Fulano e estudo na escola X.' }]
  };
  let sent = null;
  await requestAnalysis(withReasoning, {
    fetchImpl: async (url, options) => {
      sent = JSON.parse(options.body);
      return fakeResponse(200, envelope());
    }
  });
  assert.equal(sent.reasoningAuthorized, false);
  assert.equal(sent.consentTextVersion, null);
  assert.equal('reasoning' in sent.results.responses[0], false);
  assert.doesNotMatch(JSON.stringify(sent), /Fulano/);
});

test('withoutReasoning não altera o relatório original', () => {
  const original = { ...report, responses: [{ id: 'x', reasoning: 'texto', confidence: 80 }] };
  const clean = withoutReasoning(original);
  assert.equal(clean.responses[0].reasoning, undefined);
  assert.equal(clean.responses[0].confidence, 80);
  assert.equal(original.responses[0].reasoning, 'texto');
});

test('com opt-in o texto livre é enviado no corpo', async () => {
  const withReasoning = { ...report, responses: [{ id: 'x', reasoning: 'texto autorizado' }] };
  let sent = null;
  await requestAnalysis(withReasoning, {
    reasoningAuthorized: true,
    consentTextVersion: 'consent-1.0.0',
    fetchImpl: async (url, options) => {
      sent = JSON.parse(options.body);
      return fakeResponse(200, envelope());
    }
  });
  assert.match(JSON.stringify(sent), /texto autorizado/);
});
