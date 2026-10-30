/** Cliente da análise opcional por IA.
 * Nenhum dado sai do navegador sem uma chamada explícita a requestAnalysis.
 * Falhas de rede, respostas não JSON e códigos de erro do servidor viram
 * mensagens em português, nunca exceções com stack para a interface.
 */
export const ANALYSIS_MESSAGES = Object.freeze({
  unsupported: 'Análise automática não está disponível neste navegador. Use Copiar análise para ChatGPT.',
  timeout: 'A análise demorou mais que o esperado e foi cancelada. Seus resultados continuam salvos; tente de novo ou use Copiar análise para ChatGPT.',
  network: 'Não foi possível falar com o servidor de análise. Verifique a conexão e tente de novo; seus resultados continuam salvos neste dispositivo.',
  method: 'Este servidor não aceita análise automática (método não permitido). Use Copiar análise para ChatGPT.',
  unconfigured: 'A análise automática ainda não está configurada no servidor. Use Copiar análise para ChatGPT.',
  'rate-limit': 'O limite de uso da análise automática foi atingido. Tente mais tarde ou use Copiar análise para ChatGPT.',
  'invalid-payload': 'O relatório enviado não foi aceito pelo servidor. Baixe o JSON e confira se a sessão está completa.',
  'too-large': 'O relatório é grande demais para a análise automática. Use Copiar análise para ChatGPT com o JSON baixado.',
  'invalid-response': 'O servidor respondeu em um formato inesperado. Nada foi perdido; use Copiar análise para ChatGPT.',
  'invalid-schema': 'A análise voltou em um formato que não passou na validação da rubrica. Nada foi perdido; use Copiar análise para ChatGPT.',
  'stale-report': 'O relatório mudou depois do envio, então a análise foi descartada. Gere a análise novamente a partir do relatório atual.',
  'consent-invalid': 'O consentimento para enviar justificativas não confere. Reabra o aviso, marque a autorização e tente de novo.',
  'invite-required': 'A análise automática é um piloto por convite. Abra o link de convite para habilitar; o Copiar análise para ChatGPT continua disponível.',
  'invite-invalid': 'Convite inválido ou expirado; abra o link de convite novamente.',
  'server-error': 'O serviço de análise não conseguiu processar a solicitação. Tente de novo mais tarde.',
  empty: 'A análise voltou vazia. Tente de novo ou use Copiar análise para ChatGPT.'
});

const failure = (code, status = null, detail = null, extra = {}) => ({
  ok: false,
  status,
  code,
  message: ANALYSIS_MESSAGES[code] || ANALYSIS_MESSAGES['server-error'],
  ...(detail ? { detail: String(detail).slice(0, 300) } : {}),
  ...extra
});

function codeForStatus(status) {
  if (status === 401) return 'invite-required';
  if (status === 403) return 'invite-invalid';
  if (status === 405) return 'method';
  if (status === 409) return 'stale-report';
  if (status === 422) return 'invalid-schema';
  if (status === 503) return 'unconfigured';
  if (status === 429) return 'rate-limit';
  if (status === 413) return 'too-large';
  if (status === 400) return 'invalid-payload';
  return 'server-error';
}

/** Remove o texto livre do relatório antes de enviá-lo. Com o opt-in desligado,
 * a justificativa não deve nem chegar ao servidor: o servidor a removeria de E,
 * mas o corpo HTTP já teria saído do dispositivo. */
export function withoutReasoning(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.responses)) return result;
  return {
    ...result,
    responses: result.responses.map(response => {
      if (!response || typeof response !== 'object') return response;
      const { reasoning, ...rest } = response;
      return rest;
    })
  };
}

/** Schema analysis-2 esperado na resposta do servidor (F1: só o laudo técnico). */
const ANALYSIS_SCHEMA_VERSION = 'analysis-2';
function schemaProblem(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'corpo vazio';
  if (body.schemaVersion !== ANALYSIS_SCHEMA_VERSION) return `schemaVersion ${body.schemaVersion || 'ausente'}`;
  const technical = body.technical;
  if (!technical || typeof technical !== 'object') return 'technical ausente';
  for (const field of ['claims', 'limitations', 'refused']) {
    if (!Array.isArray(technical[field])) return `technical.${field} ausente`;
  }
  for (const field of ['rubricVersion', 'promptVersion', 'model', 'generatedAt', 'dataFingerprint']) {
    if (typeof body[field] !== 'string' || !body[field]) return `${field} ausente`;
  }
  if (!body.dataFingerprint.startsWith('sha256:')) return 'dataFingerprint inválido';
  const participant = body.participant;
  if (!participant || typeof participant !== 'object') return 'participant ausente';
  if (participant.audience !== 'participant') return 'participant.audience inválido';
  if (participant.releaseStatus !== 'blocked' && participant.releaseStatus !== 'ready') return 'participant.releaseStatus inválido';
  if (!Array.isArray(participant.sections) || !Array.isArray(participant.exercises)) return 'participant.sections/exercises ausente';
  if (!Array.isArray(participant.derivedFromClaims)) return 'participant.derivedFromClaims ausente';
  if (typeof body.analysis !== 'string' || !body.analysis.trim()) return 'analysis ausente';
  return null;
}

const retryAfterSeconds = headers => {
  const raw = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.ceil(parsed) : null;
};

export async function requestAnalysis(result, { fetchImpl, timeoutMs = 45000, signal, token = null, expectedFingerprint = null, reasoningAuthorized = false, consentTextVersion = null } = {}) {
  // Sem convite não há chamada: o modo local continua e o token nunca é inventado.
  if (typeof token !== 'string' || !token.trim()) return failure('invite-required');
  const doFetch = fetchImpl !== undefined ? fetchImpl : (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return failure('unsupported');
  if (!result || typeof result !== 'object') return failure('invalid-payload');

  const Controller = typeof AbortController === 'function' ? AbortController : null;
  const controller = Controller ? new Controller() : null;
  const abort = () => controller?.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener?.('abort', abort, { once: true });

  let timedOut = false;
  const timer = controller && timeoutMs > 0 ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : null;
  const aborted = controller ? new Promise((_, reject) => {
    const error = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (controller.signal.aborted) return reject(error());
    controller.signal.addEventListener('abort', () => reject(error()), { once: true });
  }) : null;
  aborted?.catch(() => { /* consumido pelo race ou ignorado após abort */ });

  try {
    let response;
    try {
      response = await doFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.trim()}` },
        body: JSON.stringify({
          results: reasoningAuthorized === true ? result : withoutReasoning(result),
          reasoningAuthorized: reasoningAuthorized === true,
          consentTextVersion: reasoningAuthorized === true ? consentTextVersion : null,
          ...(expectedFingerprint ? { dataFingerprint: expectedFingerprint } : {})
        }),
        ...(controller ? { signal: controller.signal } : {})
      });
    } catch {
      return failure(timedOut ? 'timeout' : 'network');
    }

    const status = Number(response?.status) || 0;
    let raw = '';
    try {
      // O timer segue ativo até o corpo terminar: abortar no meio da leitura
      // precisa virar mensagem de timeout, nunca sucesso parcial.
      raw = await (aborted ? Promise.race([response.text(), aborted]) : response.text());
    } catch {
      if (timedOut) return failure('timeout');
      raw = '';
    }
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }

    if (!response?.ok) {
      const reported = body && typeof body === 'object' ? body.code : null;
      const code = reported === 'pilot-unconfigured' ? 'unconfigured'
        : ['invalid-schema', 'stale-report', 'consent-invalid', 'invite-required', 'invite-invalid'].includes(reported) ? reported
          : codeForStatus(status);
      const detail = body && typeof body === 'object' ? body.detail || body.error || body.message : null;
      const retryAfter = status === 429 ? retryAfterSeconds(response.headers) : null;
      return failure(code, status, detail || (raw ? raw.slice(0, 120) : null), retryAfter === null ? {} : { retryAfter });
    }
    const problem = schemaProblem(body);
    if (problem) return failure('invalid-schema', status || null, `schema: ${problem}`);
    return {
      ok: true,
      status,
      code: 'ok',
      analysis: body.analysis.trim(),
      schemaVersion: body.schemaVersion,
      rubricVersion: body.rubricVersion,
      promptVersion: body.promptVersion,
      mode: body.mode,
      model: body.model,
      generatedAt: body.generatedAt,
      dataFingerprint: body.dataFingerprint,
      evidenceSnapshotId: body.evidenceSnapshotId,
      justificationConsent: body.justificationConsent,
      technical: body.technical,
      participant: body.participant,
      message: 'Análise interpretativa concluída. Não é avaliação clínica.'
    };
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
  }
}
