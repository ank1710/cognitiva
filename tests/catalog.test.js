import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, parseOptions, validateNote, isPlayable, playableItems, toEngineItem } from '../src/catalog.js';
import { buildForm, DIMENSIONS } from '../src/engine.js';

const note = ({ overrides = {}, sections = {} } = {}) => {
  const fm = {
    id: 'FLUIDO-SEQ-0001',
    templateId: 'fluido-sequencia',
    domain: 'fluid',
    topic: 'sequencias',
    format: 'multipla-escolha',
    language: 'pt-BR',
    difficulty: '2',
    answerKey: 'C',
    status: 'approved',
    contentReview: 'passed',
    version: '1',
    created: '2026-10-30',
    reviewedBy: 'revisor-a',
    reviewedAt: '2026-10-30',
    ...overrides
  };
  const body = {
    enunciado: 'Qual número completa a sequência: 2, 6, 12, 20, __?',
    contexto: 'Nenhum.',
    alternativas: '- A) 24\n- B) 28\n- C) 30\n- D) 36',
    'gabarito-e-justificativa': '**C) 30** — as diferenças crescem 4, 6, 8, 10.',
    ...sections
  };
  return `---\n${Object.entries(fm).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n` +
    Object.entries(body).map(([key, value]) => `## ${key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n\n${value}`).join('\n\n') + '\n';
};

test('lê frontmatter e seções', () => {
  const { frontmatter, body } = parseFrontmatter(note());
  assert.equal(frontmatter.answerKey, 'C');
  assert.match(body, /## Enunciado/);
  assert.equal(parseOptions('- A) um\n- **B)** dois\n- C) três\n- D) quatro').length, 4);
});

test('nota aprovada vira item jogável com gabarito e justificativa', () => {
  const result = validateNote(note());
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.item.answer, 2);
  assert.equal(result.item.options[2], '30');
  assert.equal(result.item.explanation, 'as diferenças crescem 4, 6, 8, 10.');
  assert.equal(isPlayable(result.item), true);
  const engine = toEngineItem(result.item);
  assert.equal(engine.origin, 'curated');
  assert.equal(engine.options.length, 4);
});

test('domínio aceita alias do vault e normaliza', () => {
  for (const [alias, expected] of [['raciocinio-fluido', 'fluid'], ['numerico', 'quant'], ['espacial', 'spatial'], ['sistemas', 'systems']]) {
    const result = validateNote(note({ overrides: { domain: alias } }));
    assert.equal(result.item.domain, expected, alias);
  }
});

test('erros bloqueantes impedem o item de entrar em prova', () => {
  const cases = [
    { overrides: { answerKey: 'E' }, match: /answerKey/ },
    { overrides: { status: 'approved', contentReview: 'pending' }, match: /approved exige/ },
    { overrides: { format: 'quiz' }, match: /format/ },
    { overrides: { difficulty: '9' }, match: /difficulty/ },
    { overrides: { language: 'en' }, match: /pt-BR/ },
    { overrides: { created: '30/10/2026' }, match: /created/ },
    { sections: { alternativas: '- A) 30\n- B) 30\n- C) 24\n- D) 36' }, match: /duplicadas/ },
    { sections: { alternativas: '- A) 30\n- B) 24\n- C) 36' }, match: /esperadas 4/ },
    { sections: { 'gabarito-e-justificativa': '' }, match: /Gabarito/ }
  ];
  for (const item of cases) {
    const result = validateNote(note(item));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => item.match.test(error)), `${item.match} em ${result.errors.join('; ')}`);
  }
});

test('gabarito fora de ordem é rejeitado', () => {
  const markdown = note({ sections: { alternativas: '- A) 24\n- C) 30\n- B) 28\n- D) 36' } });
  const result = validateNote(markdown);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /ordem das alternativas/);
});

test('rascunho e item reprovado não são jogáveis', () => {
  const draft = validateNote(note({ overrides: { status: 'draft', contentReview: 'pending' } }));
  const failed = validateNote(note({ overrides: { contentReview: 'failed' } }));
  assert.equal(draft.ok, true);
  assert.equal(isPlayable(draft.item), false);
  assert.equal(isPlayable(failed.item), false);
  assert.equal(playableItems([draft.item, failed.item]).length, 0);
});

test('editores e versões do mesmo id não duplicam o catálogo', () => {
  const a = validateNote(note()).item;
  const b = { ...a, version: 2 };
  assert.equal(playableItems([a, b]).length, 1);
});

test('prova usa itens do catálogo antes das famílias paramétricas', () => {
  const base = validateNote(note()).item;
  const catalog = DIMENSIONS.flatMap(dim => Array.from({ length: 5 }, (_, i) => ({
    ...toEngineItem({ ...base, id: `${dim.id.toUpperCase()}-000${i}`, domain: dim.id, options: ['a', 'b', 'c', 'd'], answer: 0 })
  })));
  const form = buildForm({ tier: 'screening', seed: 42, catalog });
  assert.equal(form.items.length, 20);
  assert.equal(form.items.every(item => item.origin === 'curated'), true);
  assert.equal(new Set(form.items.map(item => item.id)).size, 20);
  for (const dim of DIMENSIONS) assert.equal(form.items.filter(item => item.domain === dim.id).length, 4);
});

test('catálogo parcial completa com famílias paramétricas e prefere item não visto', () => {
  const base = validateNote(note()).item;
  const catalog = [toEngineItem({ ...base, id: 'FLUIDO-UNICO-1', domain: 'fluid' })];
  const form = buildForm({ tier: 'screening', seed: 7, catalog });
  assert.equal(form.items.filter(item => item.origin === 'curated').length, 1);
  assert.equal(form.items.filter(item => item.origin === 'parametric').length, 19);

  const six = Array.from({ length: 6 }, (_, i) => toEngineItem({ ...base, id: `FLUIDO-EXTRA-${i}`, domain: 'fluid' }));
  const seen = ['FLUIDO-EXTRA-0', 'FLUIDO-EXTRA-1'];
  const chosen = buildForm({ tier: 'screening', seed: 8, catalog: six, seen }).items
    .filter(item => item.origin === 'curated' && item.domain === 'fluid')
    .map(item => item.id);
  assert.equal(chosen.length, 4);
  assert.equal(chosen.some(id => seen.includes(id)), false);
});

test('item de catálogo malformado é ignorado em vez de quebrar a prova', () => {
  const form = buildForm({ tier: 'screening', seed: 3, catalog: [{ id: 'x' }, { id: 'y', domain: 'fluid', options: ['a', 'a', 'b', 'c'], answer: 0, question: 'q' }, null] });
  assert.equal(form.items.length, 20);
  assert.equal(form.items.every(item => item.origin === 'parametric'), true);
});
