/** Optional Vercel serverless endpoint.
 * Never exposes OPENAI_API_KEY to the browser.
 * This endpoint receives ONLY results when the user explicitly clicks "Analisar via API".
 * Piloto fechado por convite: exige PILOT_TOKENS e o header Authorization: Bearer <token>.
 * WARNING: PUBLIC deployment also requires origin checks, shared rate-limit store,
 * cost alerts, abuse monitoring and privacy review. Do not make this endpoint
 * publicly available without those safeguards.
 */
import { analyzeResults } from '../src/analyze-core.js';
import { createPilotGate, logAnalysisMeta, SECURITY_HEADERS } from '../src/pilot.js';

// Em serverless o gate vive por instância quente; os contadores são locais.
const pilot = createPilotGate();

export default async function handler(req, res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  res.setHeader('Cache-Control', 'no-store');
  const startedAt = Date.now();
  const finish = (status, body, tokenHash = null, inputChars = 0, outputChars = 0) => {
    logAnalysisMeta({ status, startedAt, tokenHash, inputChars, outputChars });
    return res.status(status).json(body);
  };

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return finish(405, { error: 'Método não permitido.', fallback: 'copy-prompt' });
  }
  const gate = pilot.authorize(req.headers);
  if (!gate.ok) {
    if (gate.retryAfter) res.setHeader('Retry-After', String(gate.retryAfter));
    return finish(gate.status, gate.body, gate.tokenHash);
  }
  const inputChars = JSON.stringify(req.body ?? {}).length;
  const { status, body } = await analyzeResults(req.body, {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    expectedFingerprint: req.body?.dataFingerprint
  });
  return finish(status, body, gate.tokenHash, inputChars, typeof body?.analysis === 'string' ? body.analysis.length : 0);
}
