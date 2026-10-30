import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, buildAnalysisView, buildParticipantView, evidenceLabel, modeLabel, CONSENT_TEXT_VERSION, PREVIEW_LABEL, INVITE_STORAGE_KEY, parseInviteHash, readStoredInvite, storeInvite, clearStoredInvite, retryMessage } from '../src/app.js';

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

const participantOutcome = (overrides = {}) => ({
  participant: {
    audience: 'participant',
    releaseStatus: 'blocked',
    signedBy: null,
    derivedFromClaims: ['C1'],
    sections: [
      { title: 'O que esta sessão mostrou', text: 'Acertou 3 de 4 itens de raciocínio quantitativo.', sourceClaimIds: ['C1'] }
    ],
    exercises: [
      { text: 'Descrever um problema de proporção em voz alta.', targetsDimension: 'quant', why: 'Descreve um exercício de prática.', sourceClaimIds: ['C1'] }
    ],
    closing: 'prévia interna — não é avaliação clínica nem devolutiva oficial',
    ...overrides
  }
});

test('devolutiva em prévia mantém rótulo e separa seções e exercícios', () => {
  const view = buildParticipantView(participantOutcome());
  assert.equal(view.badge, PREVIEW_LABEL);
  assert.match(view.badge, /Prévia interna/);
  assert.equal(view.sections.length, 1);
  assert.equal(view.sections[0].title, 'O que esta sessão mostrou');
  assert.equal(view.exercises.length, 1);
  assert.equal(view.exercises[0].dimension, 'Raciocínio quantitativo');
  assert.equal(view.exercises[0].why, 'Descreve um exercício de prática.');
  assert.match(view.closing, /não é avaliação clínica/);
});

test('a UI nunca promove a devolutiva a oficial (F3 fora de escopo)', () => {
  const view = buildParticipantView(participantOutcome({ releaseStatus: 'ready', signedBy: 'Dra. Exemplo' }));
  assert.equal(view.badge, PREVIEW_LABEL);
});

test('sem participant não há seção de devolutiva', () => {
  assert.equal(buildParticipantView({ technical: {} }), null);
  assert.equal(buildParticipantView(null), null);
});

test('a versão do consentimento na UI espelha consent-1.0.0', () => {
  assert.equal(CONSENT_TEXT_VERSION, 'consent-1.0.0');
});

test('bloco de transparência recebe rubrica, modelo e aviso de prévia', () => {
  const base = participantOutcome().participant;
  const view = buildParticipantView({ rubricVersion: 'rubric-1.0.0', model: 'gpt-test', participant: base });
  assert.equal(view.rubricVersion, 'rubric-1.0.0');
  assert.equal(view.model, 'gpt-test');
  assert.match(view.previewNote, /Prévia: ainda não revisada por uma pessoa responsável/);
});

test('releaseStatus ready não vira devolutiva oficial na UI, mas dispensa o aviso de prévia', () => {
  const base = participantOutcome({ releaseStatus: 'ready' }).participant;
  const view = buildParticipantView({ rubricVersion: 'rubric-1.0.0', model: 'gpt-test', participant: base });
  assert.equal(view.badge, PREVIEW_LABEL);
  assert.equal(view.previewNote, null);
});

test('sem rubrica ou modelo o bloco mostra marcador, não texto inventado', () => {
  const view = buildParticipantView(participantOutcome());
  assert.equal(view.rubricVersion, null);
  assert.equal(view.model, null);
});

test('modelo determinístico aparece em linguagem simples', () => {
  const base = participantOutcome().participant;
  const view = buildParticipantView({ rubricVersion: 'rubric-1.0.0', model: 'none', participant: base });
  assert.equal(view.model, 'none');
  assert.equal(view.modelLabel, 'não utilizado (análise determinística)');
});

const memoryStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
};

test('convite é lido do fragmento e não da query string', () => {
  assert.equal(parseInviteHash('#convite=abc123'), 'abc123');
  assert.equal(parseInviteHash('#outro=1&convite=abc123'), 'abc123');
  assert.equal(parseInviteHash('#convite=%20abc%20'), 'abc');
  assert.equal(parseInviteHash('#convite='), null);
  assert.equal(parseInviteHash(''), null);
  assert.equal(parseInviteHash('#outro=abc'), null);
  // A query string não é fragmento: o app nunca a lê para o convite.
  assert.equal(parseInviteHash('?convite=abc123'), null);
});

test('convite fica em sessionStorage e sai no clear', () => {
  const storage = memoryStorage();
  assert.equal(readStoredInvite(storage), null);
  assert.equal(storeInvite(storage, ' convite-1 '), true);
  assert.equal(storage.map.get(INVITE_STORAGE_KEY), 'convite-1');
  assert.equal(readStoredInvite(storage), 'convite-1');
  clearStoredInvite(storage);
  assert.equal(readStoredInvite(storage), null);
  assert.equal(storage.map.has(INVITE_STORAGE_KEY), false);
});

test('storage bloqueado não derruba a leitura nem a escrita', () => {
  const blocked = {
    getItem() { throw new Error('bloqueado'); },
    setItem() { throw new Error('bloqueado'); },
    removeItem() { throw new Error('bloqueado'); }
  };
  assert.equal(readStoredInvite(blocked), null);
  assert.equal(storeInvite(blocked, 'x'), false);
  assert.doesNotThrow(() => clearStoredInvite(blocked));
  assert.doesNotThrow(() => parseInviteHash(undefined));
});

test('mensagem de 429 informa a espera em segundos', () => {
  assert.match(retryMessage(14), /Aguarde 14 s/);
  assert.match(retryMessage(0), /em instantes/);
  assert.match(retryMessage('3'), /Aguarde 3 s/);
});
