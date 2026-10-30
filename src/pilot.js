/** Piloto fechado por convite (Marco C).
 *
 * A análise por IA só roda com um token de PILOT_TOKENS. O modo local sem IA
 * continua livre. Contadores ficam em memória: em serverless cada instância
 * tem seu próprio contador; a troca por store compartilhado está documentada
 * no README. Nenhum token ou conteúdo de participante é registrado em log.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export const DEFAULT_LIMITS = Object.freeze({
  perTokenPerDay: 20,
  globalPerDay: 100,
  perTokenPerMinute: 4
});
export const PILOT_UNCONFIGURED_MESSAGE = 'O piloto por convite ainda não está configurado neste servidor. Use Copiar análise para ChatGPT.';
export const RATE_LIMIT_MESSAGE = 'O limite de uso do piloto foi atingido. Tente mais tarde ou use Copiar análise para ChatGPT.';
const DAY_MS = 86400000;
const MINUTE_MS = 60000;

export const CSP = "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY'
});

const sha256 = value => createHash('sha256').update(String(value)).digest();

/** Prefixo curto e estável do hash, para correlacionar logs sem expor o token. */
export function tokenFingerprint(token) {
  return createHash('sha256').update(String(token)).digest('hex').slice(0, 6);
}

/** Chave interna do limitador: hash completo evita colisão de prefixo. */
const tokenKey = token => createHash('sha256').update(String(token)).digest('hex');

export function parseTokens(env = process.env) {
  const raw = typeof env.PILOT_TOKENS === 'string' ? env.PILOT_TOKENS : '';
  return [...new Set(raw.split(',').map(token => token.trim()).filter(Boolean))];
}

/** Compara em tempo constante usando hashes de tamanho fixo. */
export function tokenMatches(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string') return false;
  return timingSafeEqual(sha256(candidate), sha256(expected));
}

/** Testa todos os tokens, sem sair no primeiro acerto (evita vazar posição). */
export function findToken(candidate, tokens) {
  if (typeof candidate !== 'string' || !candidate || !Array.isArray(tokens) || tokens.length === 0) return null;
  let found = null;
  for (const token of tokens) {
    if (tokenMatches(candidate, token) && found === null) found = token;
  }
  return found;
}

/** Authorization: Bearer <token>; no servidor local também x-pilot-token. */
export function tokenFromHeaders(headers = {}) {
  const authorization = headers.authorization ?? headers.Authorization;
  if (typeof authorization === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match && match[1].trim()) return match[1].trim();
  }
  const pilot = headers['x-pilot-token'] ?? headers['X-Pilot-Token'];
  return typeof pilot === 'string' && pilot.trim() ? pilot.trim() : null;
}

const positiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function limitsFromEnv(env = process.env) {
  return {
    perTokenPerDay: positiveInt(env.PILOT_PER_TOKEN_PER_DAY, DEFAULT_LIMITS.perTokenPerDay),
    globalPerDay: positiveInt(env.PILOT_GLOBAL_PER_DAY, DEFAULT_LIMITS.globalPerDay),
    perTokenPerMinute: positiveInt(env.PILOT_PER_TOKEN_PER_MINUTE, DEFAULT_LIMITS.perTokenPerMinute)
  };
}

const utcDay = ms => new Date(ms).toISOString().slice(0, 10);
const secondsToNextDay = ms => Math.max(1, Math.ceil((Math.floor(ms / DAY_MS) + 1) * DAY_MS / 1000 - ms / 1000));
const secondsToNextMinute = ms => Math.max(1, Math.ceil((Math.floor(ms / MINUTE_MS) + 1) * MINUTE_MS / 1000 - ms / 1000));

/** Limitador em memória por dia UTC e por minuto. `now` é injetável em teste. */
export function createRateLimiter({ now = () => Date.now(), limits = DEFAULT_LIMITS } = {}) {
  const perTokenDay = new Map();
  const perTokenMinute = new Map();
  let globalDayKey = '';
  let globalDayCount = 0;

  return {
    check(token) {
      const ms = now();
      const day = utcDay(ms);
      const minute = Math.floor(ms / MINUTE_MS);
      const key = tokenKey(token);
      if (globalDayKey !== day) { globalDayKey = day; globalDayCount = 0; }
      const dayEntry = perTokenDay.get(key);
      const dayCount = dayEntry && dayEntry.day === day ? dayEntry.count : 0;
      const minuteEntry = perTokenMinute.get(key);
      const minuteCount = minuteEntry && minuteEntry.minute === minute ? minuteEntry.count : 0;

      if (globalDayCount >= limits.globalPerDay) return { ok: false, reason: 'global-day', retryAfter: secondsToNextDay(ms) };
      if (dayCount >= limits.perTokenPerDay) return { ok: false, reason: 'token-day', retryAfter: secondsToNextDay(ms) };
      if (minuteCount >= limits.perTokenPerMinute) return { ok: false, reason: 'token-minute', retryAfter: secondsToNextMinute(ms) };

      globalDayCount += 1;
      perTokenDay.set(key, { day, count: dayCount + 1 });
      perTokenMinute.set(key, { minute, count: minuteCount + 1 });
      return { ok: true };
    }
  };
}

/** Gate de convite + limite. Sem PILOT_TOKENS, tudo responde 503. */
export function createPilotGate({ env = process.env, now } = {}) {
  const tokens = parseTokens(env);
  const limits = limitsFromEnv(env);
  const limiter = createRateLimiter({ now, limits });
  return {
    configured: tokens.length > 0,
    limits,
    authorize(headers = {}) {
      if (!tokens.length) {
        return { ok: false, status: 503, tokenHash: null, body: { error: PILOT_UNCONFIGURED_MESSAGE, code: 'pilot-unconfigured', fallback: 'copy-prompt' } };
      }
      const candidate = tokenFromHeaders(headers);
      if (!candidate) {
        return { ok: false, status: 401, tokenHash: null, body: { error: 'convite necessário', code: 'invite-required', fallback: 'copy-prompt' } };
      }
      const matched = findToken(candidate, tokens);
      if (!matched) {
        return { ok: false, status: 403, tokenHash: null, body: { error: 'convite inválido', code: 'invite-invalid', fallback: 'copy-prompt' } };
      }
      const allowed = limiter.check(matched);
      const tokenHash = tokenFingerprint(matched);
      if (!allowed.ok) {
        return { ok: false, status: 429, tokenHash, retryAfter: allowed.retryAfter, reason: allowed.reason, body: { error: RATE_LIMIT_MESSAGE, code: 'rate-limit', fallback: 'copy-prompt' } };
      }
      return { ok: true, tokenHash };
    }
  };
}

const nonNegativeNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/** Estimativa de custo: heurística de 4 caracteres por token. Os preços são
 * referências configuráveis, não fatura do provedor. */
export function estimateCostUsd({ inputChars = 0, outputChars = 0 } = {}, env = process.env) {
  const inputRate = nonNegativeNumber(env.PILOT_PRICE_INPUT_PER_MTOK, 0.25);
  const outputRate = nonNegativeNumber(env.PILOT_PRICE_OUTPUT_PER_MTOK, 2);
  const inputTokens = Math.ceil(Math.max(0, inputChars) / 4);
  const outputTokens = Math.ceil(Math.max(0, outputChars) / 4);
  const usd = (inputTokens / 1e6) * inputRate + (outputTokens / 1e6) * outputRate;
  return { inputTokens, outputTokens, usd: Number(usd.toFixed(6)) };
}

/** Log de metadados, sem corpo, prompt, resposta ou justificativa. */
export function logAnalysisMeta({ status, startedAt, tokenHash = null, inputChars = 0, outputChars = 0, env = process.env, now = Date.now, logger = console }) {
  const estimate = estimateCostUsd({ inputChars, outputChars }, env);
  const entry = {
    event: 'pilot-analysis',
    timestamp: new Date(now()).toISOString(),
    status,
    durationMs: Math.max(0, now() - startedAt),
    tokenHash,
    estimatedInputTokens: estimate.inputTokens,
    estimatedOutputTokens: estimate.outputTokens,
    estimatedCostUsd: estimate.usd
  };
  logger.log(JSON.stringify(entry));
  return entry;
}
