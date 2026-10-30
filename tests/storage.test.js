import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForm } from '../src/engine.js';
import { createStore, KEYS, STORAGE_VERSION, sanitizeHistory, sanitizeExposure } from '../src/storage.js';

function fakeStorage(initial = {}, { failWrite = false, failRead = false } = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem(key) { if (failRead) throw new Error('acesso negado'); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) {
      if (failWrite) { const error = new Error('cota cheia'); error.name = 'QuotaExceededError'; throw error; }
      map.set(key, String(value));
    },
    removeItem(key) { map.delete(key); }
  };
}

const makeSession = (seed = 7) => {
  const form = buildForm({ seed });
  return { form, index: 0, answers: {}, startedAt: '2026-10-30T12:00:00.000Z', finishedAt: null };
};

test('sessão é gravada com envelope de versão e lida de volta', () => {
  const storage = fakeStorage();
  const store = createStore(storage);
  const session = makeSession();
  assert.deepEqual(store.saveSession(session), { ok: true });
  const raw = JSON.parse(storage.map.get(KEYS.session));
  assert.equal(raw.__cognitiva, STORAGE_VERSION);
  assert.deepEqual(store.readSession(), session);
});

test('JSON inválido não quebra a tela e é isolado', () => {
  const storage = fakeStorage({ [KEYS.session]: '{isso nao é json' });
  const store = createStore(storage);
  assert.equal(store.readSession(), null);
  assert.equal(store.issues[0].code, 'invalid-json');
  assert.equal(storage.map.has(KEYS.session), false);
  assert.match(storage.map.get(`${KEYS.session}__isolated`), /isso nao é json/);
});

test('estrutura incompatível é isolada em vez de derrubar a sessão', () => {
  const storage = fakeStorage({ [KEYS.session]: JSON.stringify({ __cognitiva: STORAGE_VERSION, data: { form: { items: [{ id: 'x' }] }, index: 0, answers: {}, startedAt: 'x' } }) });
  const store = createStore(storage);
  assert.equal(store.readSession(), null);
  assert.equal(store.issues[0].code, 'invalid-session');
  assert.equal(storage.map.has(`${KEYS.session}__isolated`), true);
});

test('sessão antiga sem envelope é migrada na leitura', () => {
  const session = makeSession(11);
  const storage = fakeStorage({ [KEYS.session]: JSON.stringify(session) });
  const store = createStore(storage);
  assert.equal(store.readSession().form.formId, session.form.formId);
  assert.ok(store.issues.some(issue => issue.code === 'session-legacy'));
});

test('índice fora da faixa, resposta órfã e confiança inválida são reparados', () => {
  const session = makeSession(21);
  session.index = 999;
  session.answers = {
    'item-que-nao-existe': { choice: 1, confidence: 80 },
    [session.form.items[0].id]: { choice: 2, confidence: 180, reasoning: 'x'.repeat(900) }
  };
  const storage = fakeStorage();
  storage.setItem(KEYS.session, JSON.stringify({ __cognitiva: STORAGE_VERSION, data: session }));
  const store = createStore(storage);
  const restored = store.readSession();
  assert.equal(restored.index, restored.form.items.length - 1);
  assert.deepEqual(Object.keys(restored.answers), [session.form.items[0].id]);
  assert.equal(restored.answers[session.form.items[0].id].confidence, 100);
  assert.equal(restored.answers[session.form.items[0].id].reasoning.length, 600);
  assert.ok(store.issues.some(issue => issue.code === 'session-repaired'));
});

test('falha de gravação não lança exceção e informa quota', () => {
  const store = createStore(fakeStorage({}, { failWrite: true }));
  const result = store.saveSession(makeSession());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'quota');
  assert.equal(store.issues.at(-1).code, 'quota');
});

test('sem localStorage a leitura é nula e a gravação falha de forma explícita', () => {
  const store = createStore(null);
  assert.equal(store.readSession(), null);
  assert.equal(store.readHistory().length, 0);
  assert.equal(store.saveSession(makeSession()).ok, false);
  assert.equal(store.isAvailable(), false);
});

test('leitura bloqueada pelo navegador vira aviso, não exceção', () => {
  const store = createStore(fakeStorage({}, { failRead: true }));
  assert.equal(store.readSession(), null);
  assert.equal(store.issues[0].code, 'read-failed');
});

test('histórico inválido é descartado e o válido é limitado a 20', () => {
  const valid = { date: '2026-10-30T12:00:00Z', tier: 'screening', tierName: 'Exploratória', total: 20, correct: 5 };
  const list = Array.from({ length: 30 }, () => valid).concat([{ total: 'x' }, null, { ...valid, correct: 99 }]);
  assert.equal(sanitizeHistory(list).length, 20);
  assert.deepEqual(sanitizeHistory('nada'), []);
  const store = createStore(fakeStorage({ [KEYS.history]: '{"quebrado":' }));
  assert.deepEqual(store.readHistory(), []);
  assert.equal(store.issues[0].code, 'invalid-json');
});

test('exposição é deduplicada e limitada', () => {
  assert.deepEqual(sanitizeExposure(['a', 'a', '', 3, null, 'b']), ['a', 'b']);
  assert.equal(sanitizeExposure(Array.from({ length: 12000 }, (_, i) => `id-${i}`)).length, 10000);
});

test('apagar dados remove sessão, histórico e exposição', () => {
  const storage = fakeStorage();
  const store = createStore(storage);
  store.saveSession(makeSession());
  store.saveHistory([]);
  store.saveExposure(['a']);
  store.clearAll();
  assert.equal(storage.map.size, 0);
});
