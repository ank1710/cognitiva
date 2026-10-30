import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { status, check, importCatalog } from '../scripts/kb-sync.js';

const ITEMS = join('Knowledge Base', 'Banco de Perguntas', 'Itens');

function note({ id = 'FLUIDO-SEQ-0001', version = 1 } = {}) {
  const fm = {
    id,
    templateId: 'fluido-sequencia',
    domain: 'fluid',
    topic: 'sequencias',
    format: 'multipla-escolha',
    language: 'pt-BR',
    difficulty: '2',
    answerKey: 'C',
    status: 'approved',
    contentReview: 'passed',
    version: String(version),
    created: '2026-10-30',
    reviewedBy: 'revisor-a',
    reviewedAt: '2026-10-30'
  };
  const body = {
    enunciado: 'Qual número completa a sequência: 2, 6, 12, 20, __?',
    contexto: 'Nenhum.',
    alternativas: '- A) 24\n- B) 28\n- C) 30\n- D) 36',
    'gabarito-e-justificativa': '**C) 30** — as diferenças crescem 4, 6, 8, 10.'
  };
  return `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n` +
    Object.entries(body).map(([key, value]) => `## ${key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n\n${value}`).join('\n\n') + '\n';
}

async function tempVault(notes) {
  const root = await mkdtemp(join(tmpdir(), 'cognitiva-kb-'));
  const dir = join(root, ITEMS);
  await mkdir(dir, { recursive: true });
  for (const [file, markdown] of Object.entries(notes)) await writeFile(join(dir, file), markdown, 'utf8');
  return root;
}

test('status conta jogáveis únicos e lista ids duplicados', async () => {
  const vault = await tempVault({ 'a.md': note({ id: 'DUP-1' }), 'b.md': note({ id: 'DUP-1', version: 2 }) });
  try {
    const result = await status(vault);
    assert.equal(result.playable, 1);
    assert.deepEqual(result.duplicates, ['DUP-1']);
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('check avisa sobre id duplicado sem reprovar as notas', async () => {
  const vault = await tempVault({ 'a.md': note({ id: 'DUP-1' }), 'b.md': note({ id: 'DUP-1' }) });
  try {
    const result = await check(vault);
    assert.equal(result.ok, true);
    assert.deepEqual(result.duplicates, ['DUP-1']);
    assert.ok(result.warnings.some(w => w.warnings.some(text => /duplicad/.test(text))));
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('import grava um item e informa o duplicado descartado', async () => {
  const vault = await tempVault({ 'a.md': note({ id: 'DUP-1' }), 'b.md': note({ id: 'DUP-1' }) });
  const target = join(vault, 'catalog', 'items.json');
  try {
    const result = await importCatalog(vault, false, target);
    assert.equal(result.written, true);
    assert.equal(result.playable, 1);
    assert.deepEqual(result.duplicates, ['DUP-1']);
    assert.equal(result.ignoredDuplicates, 1);
    const saved = JSON.parse(await readFile(target, 'utf8'));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, 'DUP-1');
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('dry-run não grava o catálogo', async () => {
  const vault = await tempVault({ 'a.md': note() });
  const target = join(vault, 'catalog', 'items.json');
  try {
    const result = await importCatalog(vault, true, target);
    assert.equal(result.written, false);
    assert.equal(result.playable, 1);
    assert.equal(existsSync(target), false);
  } finally { await rm(vault, { recursive: true, force: true }); }
});
