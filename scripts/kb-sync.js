#!/usr/bin/env node
/** Sincroniza o banco de perguntas do Obsidian com o catálogo do Cognitiva.
 *
 *   npm run kb -- status
 *   npm run kb -- check
 *   npm run kb -- import [--dry-run]
 *
 * O vault é lido do sistema de arquivos (não depende do Obsidian aberto).
 * `catalog/items.json` guarda apenas itens approved com contentReview passed.
 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { validateNote, playableItems, isPlayable } from '../src/catalog.js';

const ROOT = resolve(import.meta.dirname, '..');
const CATALOG_PATH = join(ROOT, 'catalog', 'items.json');
const DEFAULT_VAULT = join(homedir(), 'Documents', 'Obsidian Vault');
const ITEMS_SUBDIR = join('Knowledge Base', 'Banco de Perguntas', 'Itens');

function parseArgs(argv) {
  const args = { command: argv[0] || 'status', vault: process.env.OBSIDIAN_VAULT || DEFAULT_VAULT, dryRun: false };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--vault' || arg === '-v') args.vault = resolve(argv[++i] || '');
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.command = 'help';
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return args;
}

async function loadNotes(vault) {
  const dir = join(vault, ITEMS_SUBDIR);
  if (!existsSync(dir)) throw new Error(`Pasta de itens não encontrada: ${dir}`);
  const files = (await readdir(dir)).filter(name => name.toLowerCase().endsWith('.md')).sort();
  const notes = [];
  for (const file of files) {
    const markdown = await readFile(join(dir, file), 'utf8');
    notes.push({ file: basename(file), ...validateNote(markdown, { source: join(dir, file) }) });
  }
  return notes;
}

const countBy = (values, key) => values.reduce((acc, value) => {
  const bucket = key(value);
  acc[bucket] = (acc[bucket] || 0) + 1;
  return acc;
}, {});

async function status(vault) {
  const notes = await loadNotes(vault);
  const items = notes.map(n => n.item).filter(n => n.id);
  return {
    vault,
    notes: notes.length,
    byStatus: countBy(items, i => i.status || 'sem-status'),
    byDomain: countBy(items, i => i.domain || 'invalido'),
    byReview: countBy(items, i => i.contentReview || 'sem-revisao'),
    playable: items.filter(isPlayable).length,
    invalid: notes.filter(n => !n.ok).map(n => ({ file: n.file, errors: n.errors }))
  };
}

async function check(vault) {
  const notes = await loadNotes(vault);
  return {
    vault,
    notes: notes.length,
    ok: notes.every(n => n.ok),
    invalid: notes.filter(n => !n.ok).map(n => ({ file: n.file, errors: n.errors })),
    warnings: notes.filter(n => n.warnings.length).map(n => ({ file: n.file, warnings: n.warnings }))
  };
}

async function importCatalog(vault, dryRun) {
  const notes = await loadNotes(vault);
  const invalid = notes.filter(n => !n.ok);
  if (invalid.length) {
    return { vault, written: false, reason: 'notas inválidas', invalid: invalid.map(n => ({ file: n.file, errors: n.errors })) };
  }
  const approved = notes.map(n => n.item).filter(n => n.status === 'approved' && n.contentReview === 'passed');
  const playable = playableItems(notes.map(n => n.item));
  if (!dryRun) {
    await mkdir(join(ROOT, 'catalog'), { recursive: true });
    await writeFile(CATALOG_PATH, JSON.stringify(playable, null, 2) + '\n', 'utf8');
  }
  return {
    vault,
    written: !dryRun,
    path: CATALOG_PATH,
    approved: approved.length,
    playable: playable.length,
    skipped: notes.length - playable.length,
    byDomain: countBy(playable, i => i.domain)
  };
}

const HELP = `Uso: npm run kb -- <status|check|import> [--vault <pasta>] [--dry-run]

  status   contagem por status, domínio e revisão
  check    valida todas as notas; falha se alguma tiver erro
  import   grava catalog/items.json com itens approved e revisados

Variável de ambiente: OBSIDIAN_VAULT (padrão: ~/Documents/Obsidian Vault)`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help') { console.log(HELP); return 0; }
  if (!['status', 'check', 'import'].includes(args.command)) {
    console.error(`Comando desconhecido: ${args.command}\n\n${HELP}`);
    return 2;
  }
  const result = args.command === 'status' ? await status(args.vault)
    : args.command === 'check' ? await check(args.vault)
      : await importCatalog(args.vault, args.dryRun);
  console.log(JSON.stringify(result, null, 2));
  if (args.command === 'check' && !result.ok) return 1;
  if (args.command === 'import' && result.written === false) return 1;
  return 0;
}

main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
