import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CSP,
  SECURITY_HEADERS,
  DEFAULT_LIMITS,
  parseTokens,
  tokenFingerprint,
  tokenMatches,
  findToken,
  tokenFromHeaders,
  limitsFromEnv,
  createRateLimiter,
  createPilotGate,
  estimateCostUsd,
  logAnalysisMeta
} from '../src/pilot.js';

test('PILOT_TOKENS aceita vírgulas, espaços e remove repetidos', () => {
  assert.deepEqual(parseTokens({ PILOT_TOKENS: ' a , b ,, a ' }), ['a', 'b']);
  assert.deepEqual(parseTokens({}), []);
});

test('fingerprint do token tem 6 hex e não expõe o token', () => {
  const fingerprint = tokenFingerprint('convite-secreto');
  assert.match(fingerprint, /^[0-9a-f]{6}$/);
  assert.equal(fingerprint, tokenFingerprint('convite-secreto'));
  assert.notEqual(fingerprint, tokenFingerprint('outro-convite'));
});

test('comparação de token aceita igual e rejeita diferente', () => {
  assert.equal(tokenMatches('abc', 'abc'), true);
  assert.equal(tokenMatches('abc', 'abd'), false);
  assert.equal(tokenMatches('', 'abc'), false);
  assert.equal(findToken('b', ['a', 'b', 'c']), 'b');
  assert.equal(findToken('z', ['a', 'b']), null);
  assert.equal(findToken('', ['a']), null);
});

test('token vem de Authorization: Bearer ou x-pilot-token', () => {
  assert.equal(tokenFromHeaders({ authorization: 'Bearer convite-1' }), 'convite-1');
  assert.equal(tokenFromHeaders({ authorization: 'bearer   convite-1  ' }), 'convite-1');
  assert.equal(tokenFromHeaders({ 'x-pilot-token': 'convite-2' }), 'convite-2');
  assert.equal(tokenFromHeaders({ authorization: 'Basic abc' }), null);
  assert.equal(tokenFromHeaders({}), null);
});

test('limites têm padrão e aceitam override válido', () => {
  assert.deepEqual(limitsFromEnv({}), DEFAULT_LIMITS);
  assert.deepEqual(limitsFromEnv({
    PILOT_PER_TOKEN_PER_DAY: '7',
    PILOT_GLOBAL_PER_DAY: '30',
    PILOT_PER_TOKEN_PER_MINUTE: '2'
  }), { perTokenPerDay: 7, globalPerDay: 30, perTokenPerMinute: 2 });
  assert.deepEqual(limitsFromEnv({ PILOT_PER_TOKEN_PER_DAY: '0', PILOT_GLOBAL_PER_DAY: 'x' }), {
    perTokenPerDay: DEFAULT_LIMITS.perTokenPerDay,
    globalPerDay: DEFAULT_LIMITS.globalPerDay,
    perTokenPerMinute: DEFAULT_LIMITS.perTokenPerMinute
  });
});

test('limitador bloqueia por minuto e libera no minuto seguinte', () => {
  let now = Date.UTC(2026, 9, 30, 12, 0, 0);
  const limiter = createRateLimiter({ now: () => now, limits: { perTokenPerMinute: 1, perTokenPerDay: 10, globalPerDay: 10 } });
  assert.equal(limiter.check('token').ok, true);
  const blocked = limiter.check('token');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'token-minute');
  assert.ok(blocked.retryAfter >= 1 && blocked.retryAfter <= 60);
  now += 60_000;
  assert.equal(limiter.check('token').ok, true);
});

test('limitador bloqueia o dia por token e reinicia no dia UTC seguinte', () => {
  let now = Date.UTC(2026, 9, 30, 12, 0, 0);
  const limiter = createRateLimiter({ now: () => now, limits: { perTokenPerMinute: 100, perTokenPerDay: 1, globalPerDay: 10 } });
  assert.equal(limiter.check('token').ok, true);
  const blocked = limiter.check('token');
  assert.equal(blocked.reason, 'token-day');
  assert.ok(blocked.retryAfter >= 1);
  now += 86_400_000;
  assert.equal(limiter.check('token').ok, true);
});

test('limitador global soma tokens diferentes', () => {
  let now = Date.UTC(2026, 9, 30, 12, 0, 0);
  const limiter = createRateLimiter({ now: () => now, limits: { perTokenPerMinute: 100, perTokenPerDay: 100, globalPerDay: 1 } });
  assert.equal(limiter.check('a').ok, true);
  const blocked = limiter.check('b');
  assert.equal(blocked.reason, 'global-day');
  assert.ok(blocked.retryAfter >= 1);
});

test('gate sem PILOT_TOKENS devolve 503 pilot-unconfigured', () => {
  const gate = createPilotGate({ env: {} });
  assert.equal(gate.configured, false);
  const result = gate.authorize({ authorization: 'Bearer qualquer' });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'pilot-unconfigured');
  assert.equal(result.body.fallback, 'copy-prompt');
});

test('gate exige convite e rejeita token inválido', () => {
  const gate = createPilotGate({ env: { PILOT_TOKENS: 'convite-a,convite-b' } });
  assert.equal(gate.authorize({}).status, 401);
  assert.equal(gate.authorize({}).body.code, 'invite-required');
  assert.equal(gate.authorize({ authorization: 'Bearer errado' }).status, 403);
  assert.equal(gate.authorize({ authorization: 'Bearer errado' }).body.code, 'invite-invalid');
  const ok = gate.authorize({ authorization: 'Bearer convite-b' });
  assert.equal(ok.ok, true);
  assert.match(ok.tokenHash, /^[0-9a-f]{6}$/);
});

test('gate devolve 429 com Retry-After ao estourar o limite', () => {
  let now = Date.UTC(2026, 9, 30, 12, 0, 0);
  const gate = createPilotGate({
    env: { PILOT_TOKENS: 'convite', PILOT_PER_TOKEN_PER_MINUTE: '1' },
    now: () => now
  });
  assert.equal(gate.authorize({ authorization: 'Bearer convite' }).ok, true);
  const blocked = gate.authorize({ authorization: 'Bearer convite' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'rate-limit');
  assert.ok(blocked.retryAfter >= 1 && blocked.retryAfter <= 60);
  assert.match(blocked.tokenHash, /^[0-9a-f]{6}$/);
});

test('estimativa de custo usa 4 caracteres por token e preços configuráveis', () => {
  const estimate = estimateCostUsd({ inputChars: 4000, outputChars: 400 }, {});
  assert.equal(estimate.inputTokens, 1000);
  assert.equal(estimate.outputTokens, 100);
  assert.equal(estimate.usd, 0.00045);
  const free = estimateCostUsd({ inputChars: 4000, outputChars: 400 }, { PILOT_PRICE_INPUT_PER_MTOK: '0', PILOT_PRICE_OUTPUT_PER_MTOK: '0' });
  assert.equal(free.usd, 0);
});

test('log de metadados tem só campos operacionais e nenhum conteúdo', () => {
  const lines = [];
  const entry = logAnalysisMeta({
    status: 200,
    startedAt: 1000,
    tokenHash: 'abcdef',
    inputChars: 4000,
    outputChars: 400,
    now: () => 2000,
    logger: { log: line => lines.push(line) },
    env: {}
  });
  assert.equal(lines.length, 1);
  assert.equal(entry.durationMs, 1000);
  assert.equal(entry.status, 200);
  assert.equal(entry.tokenHash, 'abcdef');
  assert.equal(entry.estimatedInputTokens, 1000);
  const parsed = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(parsed).sort(), [
    'durationMs', 'estimatedCostUsd', 'estimatedInputTokens', 'estimatedOutputTokens', 'event', 'status', 'timestamp', 'tokenHash'
  ]);
  assert.doesNotMatch(lines[0], /reasoning|prompt|resposta/i);
});

test('cabeçalhos de segurança cobrem CSP, nosniff, referrer e frame', () => {
  assert.match(CSP, /script-src 'self'/);
  assert.match(CSP, /style-src 'self' 'unsafe-inline'/);
  assert.match(CSP, /img-src 'self' data:/);
  assert.match(CSP, /connect-src 'self'/);
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.match(CSP, /base-uri 'none'/);
  assert.match(CSP, /form-action 'self'/);
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.equal(SECURITY_HEADERS['Referrer-Policy'], 'no-referrer');
  assert.equal(SECURITY_HEADERS['X-Frame-Options'], 'DENY');
});
