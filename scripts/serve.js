import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeResults, UNCONFIGURED_MESSAGE } from '../src/analyze-core.js';
import { createPilotGate, logAnalysisMeta, SECURITY_HEADERS } from '../src/pilot.js';

const ROOT = resolve(import.meta.dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};
const MAX_BODY_BYTES = 400000;
const DEFAULT_HOST = '127.0.0.1';
const ALLOWED_PREFIXES = ['/src/', '/catalog/'];

/** Host de escuta: loopback por padrão; `HOST` permite expor de propósito. */
export function resolveHost(env = process.env) {
  const value = typeof env.HOST === 'string' ? env.HOST.trim() : '';
  return value || DEFAULT_HOST;
}

/** Só a interface e seus assets. Qualquer segmento com ponto inicial
 * (dotfile/dotdir, inclusive `.git` e `.env`) fica de fora. */
export function isAllowedPath(pathname) {
  if (pathname === '/' || pathname === '/index.html') return true;
  if (pathname.split('/').some(segment => segment.startsWith('.'))) return false;
  return ALLOWED_PREFIXES.some(prefix => pathname.startsWith(prefix) && pathname.length > prefix.length);
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return { ok: false, status: 413 };
    chunks.push(chunk);
  }
  if (!size) return { ok: false, status: 400 };
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { ok: false, status: 400 };
  }
}

async function handleAnalyze(req, res, pilot) {
  const startedAt = Date.now();
  const finish = (status, body, headers = {}, tokenHash = null, inputChars = 0, outputChars = 0) => {
    logAnalysisMeta({ status, startedAt, tokenHash, inputChars, outputChars });
    return sendJson(res, status, body, headers);
  };

  if (req.method !== 'POST') {
    return finish(405, { error: 'Método não permitido.', fallback: 'copy-prompt' }, { Allow: 'POST' });
  }
  // Convite antes de ler o corpo: sem token não há trabalho nem dado processado.
  const gate = pilot.authorize(req.headers);
  if (!gate.ok) {
    if (gate.retryAfter) res.setHeader('Retry-After', String(gate.retryAfter));
    return finish(gate.status, gate.body, {}, gate.tokenHash);
  }
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    const error = parsed.status === 413 ? 'Resultado excede o tamanho permitido.' : 'Corpo da solicitação inválido.';
    return finish(parsed.status, { error, fallback: 'copy-prompt' }, {}, gate.tokenHash);
  }
  const inputChars = JSON.stringify(parsed.value).length;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return finish(503, { error: UNCONFIGURED_MESSAGE, fallback: 'copy-prompt' }, {}, gate.tokenHash, inputChars);
  }
  const { status, body } = await analyzeResults(parsed.value, { apiKey, model: process.env.OPENAI_MODEL || 'gpt-5-mini', expectedFingerprint: parsed.value?.dataFingerprint });
  return finish(status, body, {}, gate.tokenHash, inputChars, typeof body?.analysis === 'string' ? body.analysis.length : 0);
}

export function createServer() {
  // O limitador é por processo: em serverless cada instância tem o seu.
  const pilot = createPilotGate();
  return http.createServer(async (req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return sendJson(res, 400, { error: 'Requisição inválida.' });
    }
    if (pathname === '/api/analyze') return handleAnalyze(req, res, pilot);

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
      return res.end('Método não permitido');
    }
    if (!isAllowedPath(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
    let path;
    try {
      path = resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (path !== ROOT && !path.startsWith(ROOT + sep)) throw Error('path');
      const info = await stat(path);
      if (!info.isFile()) throw Error('not a file');
      const bytes = await readFile(path);
      res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(bytes);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT || 3000);
  const HOST = resolveHost();
  createServer().listen(PORT, HOST, () => {
    const shown = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
    console.log(`Cognitiva 2.0 escutando em ${HOST}:${PORT} (abra http://${shown}:${PORT})`);
  });
}
