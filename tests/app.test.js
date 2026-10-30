import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../src/app.js';

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
