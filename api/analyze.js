/** Optional Vercel serverless endpoint.
 * Never exposes OPENAI_API_KEY to the browser.
 * This endpoint receives ONLY results when the user explicitly clicks "Analisar via API".
 * WARNING: PUBLIC deployment requires authentication, rate limits, costs limits, abuse monitoring and privacy review. Do not make this endpoint publicly available without safeguards.
 */
import { analyzeResults } from '../src/analyze-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const { status, body } = await analyzeResults(req.body, {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-5-mini'
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}
