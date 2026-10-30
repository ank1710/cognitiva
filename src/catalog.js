/** Catálogo de itens revisados.
 * Converte notas do Obsidian (frontmatter + seções) em itens que a engine
 * entende. Só item `approved` com `contentReview: passed` é jogável; todo o
 * resto permanece no banco de candidatos e nunca entra em prova.
 */
import { DIMENSIONS } from './engine.js';

export const DOMAIN_ALIASES = Object.freeze({
  fluid: 'fluid',
  'raciocinio-fluido': 'fluid',
  fluido: 'fluid',
  quant: 'quant',
  numerico: 'quant',
  quantitativo: 'quant',
  verbal: 'verbal',
  spatial: 'spatial',
  espacial: 'spatial',
  visuoespacial: 'spatial',
  systems: 'systems',
  sistemas: 'systems',
  causal: 'systems'
});
export const DOMAIN_IDS = Object.freeze(DIMENSIONS.map(d => d.id));
export const STATUSES = Object.freeze(['draft', 'in-review', 'approved', 'retired']);
export const REVIEWS = Object.freeze(['pending', 'passed', 'failed']);
export const FORMATS = Object.freeze(['multipla-escolha', 'verdadeiro-falso', 'resposta-curta']);
const LETTERS = 'ABCD';

const stripQuotes = value => value.replace(/^["']|["']$/g, '').trim();
const slug = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '-');

export function parseFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(markdown || ''));
  if (!match) return { frontmatter: {}, body: String(markdown || '') };
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!pair) continue;
    const [, key, rawValue] = pair;
    if (!rawValue) { frontmatter[key] = ''; continue; }
    frontmatter[key] = stripQuotes(rawValue);
  }
  return { frontmatter, body: String(markdown || '').slice(match[0].length).trim() };
}

export function parseSections(body) {
  const sections = {};
  let current = null;
  let buffer = [];
  const flush = () => {
    if (!current) return;
    sections[current] = buffer.join('\n').trim();
  };
  for (const line of String(body || '').split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) { flush(); current = slug(heading[1]); buffer = []; continue; }
    if (current) buffer.push(line);
  }
  flush();
  return sections;
}

export function parseOptions(section) {
  const options = [];
  for (const line of String(section || '').split(/\r?\n/)) {
    const match = /^-\s*(?:\*\*)?([A-D])[).]?(?:\*\*)?\s*(.+?)\s*$/.exec(line.trim());
    if (match) options.push({ letter: match[1], text: match[2].replace(/\*\*/g, '').trim() });
  }
  return options;
}

function cleanExplanation(section) {
  const text = String(section || '').replace(/\*\*/g, '').trim();
  const labeled = /^([A-D])[).]\s*[\s\S]*?(?:—|–|-|:)\s+([\s\S]+)$/.exec(text);
  if (labeled) return labeled[2].trim();
  return text.replace(/^[A-D][).]\s*/, '').trim();
}

/** Valida uma nota completa. Devolve erros bloqueantes e avisos não bloqueantes. */
export function validateNote(markdown, { source = 'nota' } = {}) {
  const { frontmatter: fm, body } = parseFrontmatter(markdown);
  const sections = parseSections(body);
  const errors = [];
  const warnings = [];
  const domain = DOMAIN_ALIASES[slug(fm.domain)];
  const options = parseOptions(sections.alternativas);
  const answerLetter = String(fm.answerKey || '').trim().toUpperCase();
  const answer = LETTERS.indexOf(answerLetter);

  if (!/^[A-Za-z0-9][\w-]{2,64}$/.test(fm.id || '')) errors.push('id ausente ou fora do padrão');
  if (!fm.templateId) errors.push('templateId ausente');
  if (!domain) errors.push(`domain inválido: ${fm.domain || 'vazio'}`);
  if (!fm.topic) errors.push('topic ausente');
  if (!FORMATS.includes(fm.format)) errors.push(`format inválido: ${fm.format || 'vazio'}`);
  if (fm.language !== 'pt-BR') errors.push(`language deve ser pt-BR: ${fm.language || 'vazio'}`);
  const difficulty = Number(fm.difficulty);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) errors.push('difficulty deve ser inteiro de 1 a 5');
  if (options.length !== 4) errors.push(`alternativas: esperadas 4, encontradas ${options.length}`);
  if (new Set(options.map(o => o.text)).size !== options.length) errors.push('alternativas duplicadas');
  if (answer < 0) errors.push(`answerKey deve ser A, B, C ou D: ${fm.answerKey || 'vazio'}`);
  if (options.length && answer >= 0 && options[answer]?.letter !== answerLetter) errors.push('ordem das alternativas não corresponde ao answerKey');
  if (!STATUSES.includes(fm.status)) errors.push(`status inválido: ${fm.status || 'vazio'}`);
  if (!REVIEWS.includes(fm.contentReview)) errors.push(`contentReview inválido: ${fm.contentReview || 'vazio'}`);
  if (!Number.isInteger(Number(fm.version)) || Number(fm.version) < 1) errors.push('version deve ser inteiro >= 1');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.created || '')) errors.push('created deve ser AAAA-MM-DD');
  if (!sections.enunciado) errors.push('seção "Enunciado" ausente');
  if (!sections['gabarito-e-justificativa']) errors.push('seção "Gabarito e justificativa" ausente');
  if (fm.status === 'approved' && fm.contentReview !== 'passed') errors.push('approved exige contentReview: passed');
  if (fm.status === 'approved' && !fm.reviewedBy) warnings.push('approved sem reviewedBy');
  if (fm.status === 'approved' && !fm.reviewedAt) warnings.push('approved sem reviewedAt');

  const item = {
    id: fm.id,
    templateId: fm.templateId,
    domain,
    topic: slug(fm.topic),
    format: fm.format,
    language: fm.language,
    difficulty,
    options: options.map(o => o.text),
    answer: answer >= 0 ? answer : null,
    answerKey: answerLetter,
    question: sections.enunciado || '',
    context: sections.contexto || '',
    explanation: cleanExplanation(sections['gabarito-e-justificativa']),
    status: fm.status,
    contentReview: fm.contentReview,
    version: Number(fm.version) || 1,
    created: fm.created || '',
    reviewedBy: fm.reviewedBy || null,
    reviewedAt: fm.reviewedAt || null,
    source
  };
  return { ok: errors.length === 0, item, errors, warnings, frontmatter: fm, sections };
}

export const isPlayable = item => Boolean(item)
  && item.status === 'approved'
  && item.contentReview === 'passed'
  && DOMAIN_IDS.includes(item.domain)
  && item.options?.length === 4
  && Number.isInteger(item.answer) && item.answer >= 0 && item.answer < 4
  && typeof item.id === 'string' && item.id.length > 0;

/** Formato que a engine consome. */
export function toEngineItem(item) {
  return {
    id: item.id,
    templateId: item.templateId,
    domain: item.domain,
    topic: item.topic,
    question: item.question,
    context: item.context,
    options: [...item.options],
    answer: item.answer,
    explanation: item.explanation,
    difficulty: `nível ${item.difficulty}`,
    origin: 'curated',
    version: item.version
  };
}

export function playableItems(notes) {
  const seen = new Set();
  const items = [];
  for (const note of notes) {
    if (!isPlayable(note)) continue;
    if (seen.has(note.id)) continue;
    seen.add(note.id);
    items.push(toEngineItem(note));
  }
  return items;
}
