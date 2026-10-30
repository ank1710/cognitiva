import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateCatalog, checkCatalogFile } from '../scripts/check-catalog.js';

const item = (overrides = {}) => ({
  id: 'ITEM-1',
  domain: 'fluid',
  options: ['a', 'b', 'c', 'd'],
  answer: 0,
  ...overrides
});

test('catálogo mínimo válido passa', () => {
  const result = validateCatalog([item(), item({ id: 'ITEM-2', domain: 'quant', answer: 3 })]);
  assert.deepEqual(result, { ok: true, total: 2, errors: [] });
});

test('id duplicado é rejeitado', () => {
  const result = validateCatalog([item(), item()]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /id duplicado: ITEM-1/);
});

test('id ausente, opções e gabarito inválidos são rejeitados', () => {
  const result = validateCatalog([
    item({ id: '' }),
    item({ id: 'ITEM-2', options: ['a', 'b', 'c'] }),
    item({ id: 'ITEM-3', answer: 4 }),
    item({ id: 'ITEM-4', answer: 1.5 }),
    item({ id: 'ITEM-5', answer: '0' })
  ]);
  assert.equal(result.ok, false);
  const errors = result.errors.join('\n');
  assert.match(errors, /id ausente/);
  assert.match(errors, /exatamente 4 alternativas/);
  assert.match(errors, /answer deve ser inteiro entre 0 e 3/);
});

test('domínio desconhecido e item não objeto são rejeitados', () => {
  const result = validateCatalog([item({ domain: 'inexistente' }), null, ['x']]);
  assert.equal(result.ok, false);
  assert.equal(result.total, 3);
  assert.match(result.errors.join(' '), /domain inválido: inexistente/);
  assert.match(result.errors.join(' '), /não é um objeto/);
});

test('catálogo que não é lista é rejeitado', () => {
  assert.equal(validateCatalog({ items: [] }).ok, false);
  assert.equal(validateCatalog('[]').ok, false);
});

test('catálogo versionado atual passa na validação real', async () => {
  const path = resolve(import.meta.dirname, '..', 'catalog', 'items.json');
  const items = JSON.parse(await readFile(path, 'utf8'));
  assert.ok(Array.isArray(items) && items.length > 0, 'catalog/items.json vazio ou inválido');
  const result = await checkCatalogFile(path);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.total, items.length);
});
