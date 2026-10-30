/** Armazenamento local versionado e tolerante a falhas.
 * Um JSON inválido, uma sessão de formato antigo ou uma cota cheia não podem
 * impedir a interface de abrir. Dados suspeitos são isolados, não apagados em
 * silêncio, e cada problema é exposto em store.issues para a interface avisar.
 */
import { TIERS, DIMENSIONS } from './engine.js';

export const STORAGE_VERSION = 2;
export const KEYS = Object.freeze({
  session: 'cognitiva_v2_session',
  exposure: 'cognitiva_v2_exposure',
  history: 'cognitiva_v2_history'
});
/** Sufixo das cópias de dados suspeitos. `clearAll` precisa apagá-las também:
 * sem isso, "Apagar meus dados" deixaria o conteúdo bruto no navegador. */
export const ISOLATED_SUFFIX = '__isolated';
export const isolatedKey = key => `${key}${ISOLATED_SUFFIX}`;
const DOMAIN_IDS = new Set(DIMENSIONS.map(d => d.id));
const SIZES = new Set(Object.values(TIERS));
const CHOICES = new Set([0, 1, 2, 3]);
const MAX_EXPOSURE = 10000;
const MAX_HISTORY = 20;

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value : null;

function isItem(value) {
  return isObject(value)
    && typeof value.id === 'string' && value.id.length > 0
    && Array.isArray(value.options) && value.options.length === 4 && value.options.every(o => typeof o === 'string')
    && Number.isInteger(value.answer) && CHOICES.has(value.answer)
    && typeof value.question === 'string'
    && DOMAIN_IDS.has(value.domain);
}

export function validateSession(value) {
  return isObject(value)
    && isObject(value.form)
    && SIZES.has(value.form.items?.length)
    && value.form.items.every(isItem)
    && typeof value.startedAt === 'string';
}

/** Repara divergências recuperáveis (índice fora da faixa, respostas órfãs,
 * confiança fora de 0–100) e informa se houve reparo. Sessão inválida é null. */
export function sanitizeSession(value) {
  if (!validateSession(value)) return { session: null, repaired: false };
  const session = value;
  const items = session.form.items;
  const ids = new Set(items.map(item => item.id));
  const answers = {};
  for (const [id, raw] of Object.entries(isObject(session.answers) ? session.answers : {})) {
    if (!ids.has(id) || !isObject(raw)) continue;
    const answer = {};
    if (Number.isInteger(raw.choice) && CHOICES.has(raw.choice)) answer.choice = raw.choice;
    if (Number.isFinite(raw.confidence)) answer.confidence = Math.max(0, Math.min(100, Math.round(raw.confidence)));
    if (typeof raw.reasoning === 'string' && raw.reasoning.trim()) answer.reasoning = raw.reasoning.slice(0, 600);
    if (Object.keys(answer).length) answers[id] = answer;
  }
  const index = Math.max(0, Math.min(items.length - 1, Number.isInteger(session.index) ? session.index : 0));
  const finishedAt = typeof session.finishedAt === 'string' ? session.finishedAt : null;
  const cleaned = { ...session, answers, index, finishedAt, startedAt: session.startedAt };
  const repaired = index !== session.index
    || finishedAt !== session.finishedAt
    || Object.keys(answers).length !== Object.keys(isObject(session.answers) ? session.answers : {}).length
    || !isObject(session.answers);
  return { session: cleaned, repaired };
}

export function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(entry => isObject(entry) && typeof entry.date === 'string' && SIZES.has(entry.total) && Number.isInteger(entry.correct) && entry.correct >= 0 && entry.correct <= entry.total)
    .slice(0, MAX_HISTORY)
    .map(entry => ({
      date: entry.date,
      tier: Object.hasOwn(TIERS, entry.tier) ? entry.tier : 'screening',
      tierName: text(entry.tierName) || 'Exploratória',
      total: entry.total,
      correct: entry.correct
    }));
}

export function sanitizeExposure(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => typeof id === 'string' && id.length > 0 && id.length < 200))].slice(-MAX_EXPOSURE);
}

export function createStore(storage = globalThis.localStorage) {
  const issues = [];
  const record = (code, key) => { issues.push({ code, key }); return issues[issues.length - 1]; };

  const readRaw = key => {
    if (!storage) { record('unavailable', key); return undefined; }
    try { return storage.getItem(key); } catch { record('read-failed', key); return undefined; }
  };

  const isolate = (key, raw, code) => {
    record(code, key);
    try { storage.setItem(isolatedKey(key), String(raw).slice(0, 20000)); } catch { /* isolamento é melhor esforço */ }
    try { storage.removeItem(key); } catch { /* leitura seguirá com o fallback */ }
  };

  const decode = key => {
    const raw = readRaw(key);
    if (raw === undefined || raw === null) return { present: false };
    let parsed;
    try { parsed = JSON.parse(raw); } catch { isolate(key, raw, 'invalid-json'); return { present: false, corrupt: true }; }
    const value = isObject(parsed) && parsed.__cognitiva === STORAGE_VERSION ? parsed.data : parsed;
    return { present: true, value, raw, legacy: !(isObject(parsed) && parsed.__cognitiva === STORAGE_VERSION) };
  };

  const write = (key, value) => {
    if (!storage) return { ok: false, code: 'unavailable' };
    try {
      storage.setItem(key, JSON.stringify({ __cognitiva: STORAGE_VERSION, savedAt: new Date().toISOString(), data: value }));
      return { ok: true };
    } catch (error) {
      const code = error?.name === 'QuotaExceededError' || error?.code === 22 ? 'quota' : 'write-failed';
      record(code, key);
      return { ok: false, code };
    }
  };

  const remove = key => {
    if (!storage) return false;
    try { storage.removeItem(key); return true; } catch { return false; }
  };

  /** Apaga as cópias isoladas das chaves conhecidas. Devolve as chaves que
   * foram realmente removidas. Chaves de terceiros nunca são tocadas. */
  const purgeIsolated = (keys = Object.values(KEYS)) => {
    const removed = [];
    for (const key of keys) {
      const copy = isolatedKey(key);
      if (remove(copy)) removed.push(copy);
    }
    return removed;
  };

  const readSession = () => {
    const decoded = decode(KEYS.session);
    if (!decoded.present) return null;
    const { session, repaired } = sanitizeSession(decoded.value);
    if (!session) { isolate(KEYS.session, decoded.raw, 'invalid-session'); return null; }
    if (repaired || decoded.legacy) record(repaired ? 'session-repaired' : 'session-legacy', KEYS.session);
    return session;
  };

  const readHistory = () => {
    const decoded = decode(KEYS.history);
    if (!decoded.present) return [];
    const list = sanitizeHistory(decoded.value);
    if (!Array.isArray(decoded.value)) { isolate(KEYS.history, decoded.raw, 'invalid-history'); return []; }
    return list;
  };

  const readExposure = () => {
    const decoded = decode(KEYS.exposure);
    if (!decoded.present) return [];
    if (!Array.isArray(decoded.value)) { isolate(KEYS.exposure, decoded.raw, 'invalid-exposure'); return []; }
    return sanitizeExposure(decoded.value);
  };

  return {
    issues,
    readSession,
    readHistory,
    readExposure,
    saveSession: session => write(KEYS.session, session),
    saveHistory: list => write(KEYS.history, sanitizeHistory(list)),
    saveExposure: list => write(KEYS.exposure, sanitizeExposure(list)),
    clearSession: () => remove(KEYS.session),
    purgeIsolated,
    clearAll: () => {
      const removed = purgeIsolated();
      for (const key of Object.values(KEYS)) if (remove(key)) removed.push(key);
      return removed;
    },
    isAvailable: () => {
      if (!storage) return false;
      const probe = '__cognitiva_probe__';
      try { storage.setItem(probe, '1'); storage.removeItem(probe); return true; } catch { record('unavailable', probe); return false; }
    }
  };
}
