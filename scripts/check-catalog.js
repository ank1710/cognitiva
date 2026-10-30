#!/usr/bin/env node
/** Valida o catálogo versionado (catalog/items.json) sem depender do app.
 *
 * Garante o contrato mínimo que o buildForm espera: lista de itens com id
 * único, quatro alternativas, gabarito inteiro de 0 a 3 e domínio conhecido.
 * Roda no CI como step separado de `npm run check`.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DIMENSIONS } from '../src/engine.js';

export const CATALOG_PATH = resolve(import.meta.dirname, '..', 'catalog', 'items.json');
const DOMAINS = new Set(DIMENSIONS.map(dimension => dimension.id));

/** Valida uma lista já parseada. Devolve todos os erros, não apenas o primeiro. */
export function validateCatalog(items) {
  if (!Array.isArray(items)) return { ok: false, total: 0, errors: ['o catálogo não é uma lista JSON'] };
  const errors = [];
  const seen = new Set();
  items.forEach((item, index) => {
    const label = `item ${index + 1}${item && typeof item.id === 'string' && item.id ? ` (${item.id})` : ''}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${label}: não é um objeto`);
      return;
    }
    if (typeof item.id !== 'string' || !item.id.trim()) errors.push(`${label}: id ausente`);
    else if (seen.has(item.id)) errors.push(`${label}: id duplicado: ${item.id}`);
    else seen.add(item.id);
    if (!Array.isArray(item.options) || item.options.length !== 4) {
      errors.push(`${label}: options deve ter exatamente 4 alternativas`);
    }
    if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer > 3) {
      errors.push(`${label}: answer deve ser inteiro entre 0 e 3`);
    }
    if (!DOMAINS.has(item.domain)) errors.push(`${label}: domain inválido: ${String(item.domain)}`);
  });
  return { ok: errors.length === 0, total: items.length, errors };
}

export async function checkCatalogFile(path = CATALOG_PATH) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    return { ok: false, path, total: 0, errors: [`não foi possível ler o catálogo: ${error.message}`] };
  }
  let items;
  try {
    items = JSON.parse(raw);
  } catch (error) {
    return { ok: false, path, total: 0, errors: [`JSON inválido: ${error.message}`] };
  }
  return { path, ...validateCatalog(items) };
}

async function main() {
  const result = await checkCatalogFile();
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify({ ok: false, errors: [error.message] }, null, 2));
    process.exitCode = 1;
  });
}
