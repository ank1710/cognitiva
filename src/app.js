import {VERSION,TIERS,DIMENSIONS,buildForm,grade,exportReport} from './engine.js';
import {requestAnalysis, withoutReasoning} from './analysis.js';
import {createStore,KEYS} from './storage.js';

/* ---------------------------------------------------------------------------
 * Descrição textual de grades
 * Itens espaciais desenham uma grade 3×3 com "·" nas células vazias e um símbolo
 * no marcador. Cor e símbolo sozinhos não bastam: toda grade recebe uma
 * descrição em palavras (linha/coluna) usada como rótulo acessível.
 * ------------------------------------------------------------------------- */
const GRID_EMPTY = '·';
const isGridRow = cells => cells.length === 3 && cells.every(c => c.length === 1);
function gridBlocks(text) {
  const blocks = []; let current = null;
  for (const line of String(text ?? '').split('\n')) {
    const cells = line.trim().split(/\s+/).filter(Boolean);
    if (isGridRow(cells) && cells.includes(GRID_EMPTY)) {
      if (!current) { current = []; blocks.push(current); }
      current.push(cells);
    } else current = null;
  }
  return blocks.filter(rows => rows.length === 3);
}
export function describeFigure(text) {
  const blocks = gridBlocks(text);
  if (!blocks.length) return '';
  return blocks.map((rows, blockIndex) => {
    const marked = [];
    rows.forEach((row, r) => row.forEach((cell, c) => {
      if (cell !== GRID_EMPTY) marked.push(`linha ${r + 1}, coluna ${c + 1} com "${cell}"`);
    }));
    const prefix = blocks.length > 1 ? `Grade ${blockIndex + 1} de ${blocks.length}, ` : '';
    const size = `grade ${rows.length} por ${rows[0].length}`;
    const body = marked.length ? marked.join('; ') : 'todas as células vazias';
    return `${prefix}${size}: ${body}.`;
  }).join(' ');
}
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'}[c]));
/** HTML seguro: mantém a grade visível e acrescenta o rótulo em palavras. */
export function figureMarkup(text) {
  const desc = describeFigure(text);
  const body = String(text ?? '').split('\n').map(line => {
    const cells = line.trim().split(/\s+/).filter(Boolean);
    if (!isGridRow(cells)) return escapeHtml(line);
    const rendered = cells.map(cell => cell === GRID_EMPTY
      ? '<span class="grid-cell" aria-hidden="true">·</span>'
      : `<span class="grid-cell grid-cell-mark" aria-hidden="true">${escapeHtml(cell)}</span>`).join('');
    return `<span class="grid-row">${rendered}</span>`;
  }).join('\n');
  return desc
    ? `<span class="figure" role="img" aria-label="${escapeHtml(desc)}">${body}</span>`
    : body;
}
/** Rótulo curto e falado para uma alternativa (texto livre ou grade). */
export function optionLabel(text, index) {
  const letter = 'ABCD'[index];
  const desc = describeFigure(text);
  const spoken = desc || String(text ?? '').replace(/\s+/g, ' ').trim();
  return `Alternativa ${letter}: ${spoken}`;
}

/* ---------------------------------------------------------------------------
 * Laudo técnico (F1b)
 * Funções puras para transformar o schema analysis-2 em dados de exibição.
 * A interface não recalcula estatística: todo número vem do servidor.
 * ------------------------------------------------------------------------- */
const MODE_LABELS = Object.freeze({
  full: 'Completo',
  limited: 'Limitado (amostra parcial)',
  insufficient: 'Amostra insuficiente'
});
const METRIC_LABELS = Object.freeze({
  total: 'total de itens',
  answered: 'itens respondidos',
  correct: 'acertos',
  accuracy: 'acurácia',
  meanConfidence: 'confiança média',
  n: 'respostas com confiança'
});

export function modeLabel(mode) {
  return MODE_LABELS[mode] || 'Não informado';
}

/** Traduz um evidenceId do bloco E para texto legível, mantendo o id no title. */
export function evidenceLabel(id) {
  const value = String(id ?? '');
  const global = {
    'G:answered': 'Questões respondidas na sessão',
    'G:total': 'Total de questões da sessão',
    'G:accuracy': 'Acurácia global entre respondidas',
    'G:meanConfidence': 'Confiança média declarada',
    'G:brier': 'Brier Score da sessão',
    'G:gap': 'Diferença confiança × acerto',
    'S:distinctStructures': 'Estruturas distintas no formulário',
    'S:parametricShare': 'Proporção de itens paramétricos'
  }[value];
  if (global) return global;
  const dimension = /^D:([^:]+):(.+)$/.exec(value);
  if (dimension) {
    const title = DIMENSIONS.find(d => d.id === dimension[1])?.title || dimension[1];
    return `${METRIC_LABELS[dimension[2]] || dimension[2]} — ${title}`;
  }
  const item = /^I:(\d+)$/.exec(value);
  if (item) return `Questão ${Number(item[1]) + 1}`;
  const topic = /^T:([^:]+):(.+)$/.exec(value);
  if (topic) {
    const metric = topic[2] === 'correct' ? 'acertos' : topic[2] === 'answered' ? 'respondidas' : 'total de itens';
    return `${metric} — tópico ${topic[1]}`;
  }
  return value || 'evidência não informada';
}

function formatTimestamp(value) {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

function summaryText(summary) {
  if (!summary || typeof summary !== 'object') return 'Resumo da sessão não informado.';
  const accuracy = typeof summary.globalAccuracy === 'number' ? `${Math.round(summary.globalAccuracy * 100)}%` : '—';
  const tier = { screening: 'Exploratória', standard: 'Intermediária', deep: 'Aprofundada' }[summary.tier] || 'não informada';
  return `Modalidade: ${tier} · Respondidas: ${summary.answered ?? '—'} de ${summary.total ?? '—'} · Acurácia global: ${accuracy}`;
}

/** Converte o envelope analysis-2 em uma estrutura pronta para renderização. */
export function buildAnalysisView(outcome) {
  const technical = outcome?.technical && typeof outcome.technical === 'object' ? outcome.technical : {};
  const rawClaims = Array.isArray(technical.claims) ? technical.claims : [];
  const claims = rawClaims
    .filter(claim => claim && typeof claim.text === 'string' && claim.text.trim())
    .map((claim, index) => ({
      id: typeof claim.id === 'string' && claim.id ? claim.id : `C${index + 1}`,
      level: claim.level === 'hypothesis' ? 'Hipótese' : 'Fato',
      levelKey: claim.level === 'hypothesis' ? 'hypothesis' : 'fact',
      text: claim.text.trim(),
      dimension: claim.dimension ? (DIMENSIONS.find(d => d.id === claim.dimension)?.title || claim.dimension) : null,
      evidence: (Array.isArray(claim.evidenceIds) ? claim.evidenceIds : [])
        .map(id => ({ id: String(id), label: evidenceLabel(id) })),
      caveat: typeof claim.caveat === 'string' && claim.caveat.trim() ? claim.caveat.trim() : null
    }));
  const insufficient = outcome?.mode === 'insufficient'
    ? 'A sessão tem menos de 10 respostas. Esta análise não faz leitura por dimensão: mostra apenas contagens e limites. Responda mais questões e gere a análise novamente.'
    : null;
  return {
    mode: outcome?.mode || null,
    modeLabel: modeLabel(outcome?.mode),
    meta: [
      { key: 'rubricVersion', label: 'Versão da rubrica', value: outcome?.rubricVersion || '—' },
      { key: 'promptVersion', label: 'Versão do prompt', value: outcome?.promptVersion || '—' },
      { key: 'model', label: 'Modelo', value: outcome?.model || '—' },
      { key: 'generatedAt', label: 'Gerado em', value: formatTimestamp(outcome?.generatedAt) },
      { key: 'dataFingerprint', label: 'Fingerprint do relatório', value: outcome?.dataFingerprint || '—' },
      { key: 'mode', label: 'Modo da análise', value: modeLabel(outcome?.mode) }
    ],
    summaryText: summaryText(technical.sessionSummary),
    claims,
    limitations: (Array.isArray(technical.limitations) ? technical.limitations : []).filter(text => typeof text === 'string' && text.trim()),
    refused: (Array.isArray(technical.refused) ? technical.refused : []).filter(text => typeof text === 'string' && text.trim()),
    insufficient
  };
}

/** Versão vigente do texto de opt-in. Espelha CONSENT_TEXT_VERSION do
 * analyze-core (o módulo do servidor usa node:crypto e não é importável no
 * navegador). Deve ser atualizada junto com o texto de index.html. */
export const CONSENT_TEXT_VERSION = 'consent-1.0.0';
export const PREVIEW_LABEL = 'Prévia interna — não é devolutiva oficial';

/* ---------------------------------------------------------------------------
 * Convite do piloto
 * O token chega no fragmento (#convite=...) e nunca na query string: fragmento
 * não é enviado ao servidor nem aparece em referer/log de acesso. Fica só em
 * sessionStorage, some ao fechar a aba e nunca entra no relatório ou no prompt.
 * ------------------------------------------------------------------------- */
export const INVITE_STORAGE_KEY = 'cognitiva_v2_invite';

export function parseInviteHash(hash) {
  const value = String(hash ?? '');
  if (!value.startsWith('#')) return null;
  const token = new URLSearchParams(value.slice(1)).get('convite');
  return token && token.trim() ? token.trim() : null;
}

/** Formato aceitável para o convite vindo da URL. Rejeita espaços, HTML e
 * strings longas demais; não tenta adivinhar o token do servidor. */
export function isValidInviteToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9._~+/=-]{1,512}$/.test(token);
}

export function readStoredInvite(storage = globalThis.sessionStorage) {
  if (!storage) return null;
  try {
    const token = storage.getItem(INVITE_STORAGE_KEY);
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

export function storeInvite(storage, token) {
  if (!storage || typeof token !== 'string' || !token.trim()) return false;
  try {
    storage.setItem(INVITE_STORAGE_KEY, token.trim());
    return true;
  } catch {
    return false;
  }
}

export function clearStoredInvite(storage = globalThis.sessionStorage) {
  if (!storage) return;
  try { storage.removeItem(INVITE_STORAGE_KEY); } catch { /* sessão bloqueada */ }
}

/** Mensagem de espera do 429, sem interpolar nada além dos segundos. */
export function retryMessage(seconds) {
  const wait = Math.max(0, Math.ceil(Number(seconds) || 0));
  return wait > 0
    ? `Limite de uso atingido. Aguarde ${wait} s e tente de novo.`
    : 'Limite de uso atingido. Tente de novo em instantes.';
}

/** Converte o participant devolvido pelo servidor em dados de exibição.
 * F3 não está implementada: a UI nunca trata a saída como devolutiva oficial,
 * mesmo que o campo venha com outro releaseStatus. */
export function buildParticipantView(outcome) {
  const participant = outcome?.participant;
  if (!participant || typeof participant !== 'object') return null;
  const sections = (Array.isArray(participant.sections) ? participant.sections : [])
    .filter(section => section && typeof section.text === 'string' && section.text.trim())
    .map(section => ({
      title: typeof section.title === 'string' && section.title.trim() ? section.title.trim() : 'Resumo',
      text: section.text.trim(),
      sourceClaimIds: Array.isArray(section.sourceClaimIds) ? section.sourceClaimIds.map(String) : []
    }));
  const exercises = (Array.isArray(participant.exercises) ? participant.exercises : [])
    .filter(exercise => exercise && typeof exercise.text === 'string' && exercise.text.trim())
    .map(exercise => ({
      text: exercise.text.trim(),
      dimension: typeof exercise.targetsDimension === 'string'
        ? (DIMENSIONS.find(d => d.id === exercise.targetsDimension)?.title || exercise.targetsDimension)
        : null,
      why: typeof exercise.why === 'string' && exercise.why.trim() ? exercise.why.trim() : null,
      sourceClaimIds: Array.isArray(exercise.sourceClaimIds) ? exercise.sourceClaimIds.map(String) : []
    }));
  return {
    badge: PREVIEW_LABEL,
    releaseStatus: participant.releaseStatus || 'blocked',
    rubricVersion: typeof outcome?.rubricVersion === 'string' && outcome.rubricVersion ? outcome.rubricVersion : null,
    model: typeof outcome?.model === 'string' && outcome.model ? outcome.model : null,
    modelLabel: typeof outcome?.model === 'string' && outcome.model
      ? (outcome.model === 'none' ? 'não utilizado (análise determinística)' : outcome.model)
      : 'não informado',
    previewNote: (participant.releaseStatus || 'blocked') === 'blocked'
      ? 'Prévia: ainda não revisada por uma pessoa responsável.'
      : null,
    sections,
    exercises,
    closing: typeof participant.closing === 'string' && participant.closing.trim() ? participant.closing.trim() : PREVIEW_LABEL
  };
}

/** Carrega o catálogo revisado sem nunca rejeitar: arquivo ausente, JSON
 * inválido ou servidor lento caem em lista vazia e a prova segue paramétrica.
 * O timeout curto evita segurar o botão "Começar" indefinidamente. */
export function loadCatalog({ fetchImpl, timeoutMs = 1500 } = {}) {
  const doFetch = fetchImpl !== undefined ? fetchImpl : (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return Promise.resolve([]);
  let timer = null;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve([]), timeoutMs); });
  const load = (async () => {
    try {
      const response = await doFetch('/catalog/items.json', { cache: 'no-store' });
      if (!response?.ok) return [];
      const list = await response.json();
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  })();
  return Promise.race([load, timeout]).finally(() => clearTimeout(timer));
}

export function initApp() {
  const $ = id => document.getElementById(id);
  const store = createStore();
  const esc = escapeHtml;
  let tier = 'screening', session = store.readSession(), currentView = 'home', catalog = [];
  let lastAnalysis = null;
  let invite = readStoredInvite(window.sessionStorage);
  let retryTimer = null;
  const catalogReady = loadCatalog();
  catalogReady.then(list => { catalog = list; });
  function notice(message) {const el = $('storageNotice'); if (!el) return; el.textContent = message || ''; el.classList.toggle('hide', !message);}
  function announceStatus(message) {const el = $('examStatus'); if (!el || el.textContent === message) return; el.textContent = message;}
  let storageChecked = null;
  function storageAvailable() {if (storageChecked === null) storageChecked = store.isAvailable(); return storageChecked;}
  function reportStorageIssues() {
    const issues = store.issues.map(i => i.code);
    if (issues.includes('invalid-json') || issues.includes('invalid-session')) return notice('Uma sessão salva não pôde ser lida e foi isolada (cópia em ' + KEYS.session + '__isolated). Você pode começar uma nova avaliação.');
    if (issues.includes('quota') || issues.includes('write-failed')) return notice('O navegador não permitiu salvar. A avaliação continua nesta aba, mas pode ser perdida ao fechar.');
    if (!storageAvailable()) return notice('Este navegador está com o armazenamento local bloqueado. Você pode fazer a avaliação, mas nada será salvo se a página fechar.');
    if (issues.includes('session-repaired') || issues.includes('session-legacy')) return notice('Sua sessão salva foi ajustada para abrir corretamente. Confira as respostas antes de continuar.');
  }
  function focusHeading(id) {const el = $(id); if (el) el.focus({preventScroll: true});}
  function show(name) {
    currentView = name;
    for (const view of ['home', 'exam', 'result']) $(view + 'View').classList.toggle('hide', view !== name);
    window.scrollTo(0, 0);
    if (name === 'home') focusHeading('homeTitle');
    else if (name === 'result') focusHeading('resultTitle');
  }
  function persist() {if (!session) return; const result = store.saveSession(session); if (!result.ok) reportStorageIssues();}
  function answer(q) {return session.answers[q.id] || {};}
  function current() {return session.form.items[session.index];}
  function toHome() {renderHome(); show('home');}
  function renderHome() {
    $('dimensionCards').innerHTML = DIMENSIONS.map(d => `<div class="domain-card"><div class="domain-icon" aria-hidden="true">${d.icon}</div><h3>${esc(d.title)}</h3><p class="muted small">${esc(d.desc)}</p></div>`).join('');
    $('resumeBtn').classList.toggle('hide', !session || Boolean(session.finishedAt));
    const history = store.readHistory();
    $('historyList').innerHTML = history.length ? history.map(h => `<div class="history-row"><div><strong>${esc(h.tierName)}</strong><div class="tiny">${esc(new Date(h.date).toLocaleDateString('pt-BR'))}</div></div><span>${h.correct}/${h.total} acertos</span></div>`).join('') : 'Nenhuma avaliação concluída neste dispositivo.';
  }
  async function start(fresh) {
    if (!fresh && session && !session.finishedAt) {renderQuestion(); show('exam'); focusHeading('questionTitle'); return;}
    if (fresh && session && !session.finishedAt && Object.keys(session.answers).length && !confirm('Iniciar outra avaliação substituirá a sessão em andamento. Continuar?')) return;
    // Espera o catálogo já iniciado; se ainda não chegou, o timeout do
    // carregamento libera a prova com itens paramétricos.
    const loaded = await catalogReady;
    if (Array.isArray(loaded)) catalog = loaded;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const seen = store.readExposure();
    const form = buildForm({tier, seed, seen, catalog});
    session = {form, index: 0, answers: {}, startedAt: new Date().toISOString(), finishedAt: null};
    persist(); renderQuestion(); show('exam'); focusHeading('questionTitle');
  }
  /**
   * Renderiza a questão atual. Com focus=true, leva o foco ao enunciado
   * (h2 com tabindex=-1); o prefixo oculto informa a posição ao leitor de tela.
   */
  function renderQuestion({focus = false} = {}) {
    const q = current(), a = answer(q);
    const total = session.form.items.length;
    const done = session.form.items.filter(x => Number.isInteger(answer(x).choice)).length;
    $('tierLabel').textContent = `${total} questões`;
    $('questionDimension').textContent = DIMENSIONS.find(d => d.id === q.domain).title;
    $('topicLabel').textContent = `Contexto: ${q.topic}`;
    $('progressLabel').textContent = `Respondidas: ${done} / ${total}`;
    $('questionNumber').textContent = `Questão ${session.index + 1} de ${total}`;
    $('progressFill').style.width = `${done / total * 100}%`;
    const bar = $('progressBar');
    if (bar) {
      bar.setAttribute('aria-valuenow', String(done));
      bar.setAttribute('aria-valuemax', String(total));
      bar.setAttribute('aria-valuetext', `${done} de ${total} respondidas`);
    }
    $('questionHeadingPrefix').textContent = `Questão ${session.index + 1} de ${total}. `;
    $('questionTitleText').textContent = q.question;
    if (q.context) {
      $('questionContext').innerHTML = figureMarkup(q.context);
      $('questionContext').classList.remove('hide');
    } else {
      $('questionContext').textContent = '';
      $('questionContext').classList.add('hide');
    }
    $('optionList').innerHTML = q.options.map((text, i) => `<button class="choice" type="button" data-option="${i}" aria-pressed="${a.choice === i}" aria-label="${esc(optionLabel(text, i))}"><span class="choice-key" aria-hidden="true">${'ABCD'[i]}</span><span class="choice-text">${figureMarkup(text)}</span></button>`).join('');
    document.querySelectorAll('[data-option]').forEach(btn => btn.onclick = () => selectOption(btn));
    const confidence = Number.isFinite(a.confidence) ? a.confidence : 50;
    $('confidenceInput').value = confidence;
    $('confidenceInput').setAttribute('aria-valuetext', Number.isFinite(a.confidence) ? `${a.confidence} por cento` : 'Não informada');
    $('confidenceText').textContent = Number.isFinite(a.confidence) ? `${a.confidence}%` : 'Não informada';
    $('notes').value = a.reasoning || '';
    $('prevBtn').disabled = session.index === 0;
    $('nextBtn').textContent = session.index === total - 1 ? 'Concluir →' : 'Próxima →';
    if (focus) focusHeading('questionTitle');
  }
  /** Seleciona sem reconstruir a lista, para o foco permanecer no botão. */
  function selectOption(btn) {
    const q = current();
    const choice = Number(btn.dataset.option);
    session.answers[q.id] = {...answer(q), choice};
    persist();
    document.querySelectorAll('[data-option]').forEach(other => other.setAttribute('aria-pressed', String(other === btn)));
    const total = session.form.items.length;
    const done = session.form.items.filter(x => Number.isInteger(answer(x).choice)).length;
    $('progressLabel').textContent = `Respondidas: ${done} / ${total}`;
    $('progressFill').style.width = `${done / total * 100}%`;
    const bar = $('progressBar');
    if (bar) {
      bar.setAttribute('aria-valuenow', String(done));
      bar.setAttribute('aria-valuetext', `${done} de ${total} respondidas`);
    }
    announceStatus(`Alternativa ${'ABCD'[choice]} selecionada. ${done} de ${total} respondidas.`);
  }
  function move(by) {
    session.index = Math.max(0, Math.min(session.form.items.length - 1, session.index + by));
    persist(); renderQuestion({focus: true});
  }
  function finalize() {
    if (session.finishedAt) return;
    const count = session.form.items.filter(q => Number.isInteger(answer(q).choice)).length;
    if (count < session.form.items.length && !confirm(`Você respondeu ${count} de ${session.form.items.length} questões. Concluir mesmo assim?`)) return;
    session.finishedAt = new Date().toISOString(); persist();
    const stats = grade(session.form, session.answers), history = store.readHistory();
    history.unshift({date: session.finishedAt, tier: session.form.tier, tierName: {screening: 'Exploratória',standard: 'Intermediária',deep: 'Aprofundada'}[session.form.tier], total: session.form.items.length, correct: stats.correct});
    store.saveHistory(history);
    store.saveExposure([...store.readExposure(),...session.form.items.map(i => i.id)]);
    renderResults(); show('result');
    if (!store.isAvailable()) reportStorageIssues();
  }
  function result() {return exportReport(session.form, session.answers, session.startedAt, session.finishedAt);}
  function download(text, name, type = 'application/json') {const blob = new Blob([text], {type}); const url = URL.createObjectURL(blob); const el = document.createElement('a'); el.href = url; el.download = name; el.click(); setTimeout(() => URL.revokeObjectURL(url), 500);}
  function prompt() {
    // O mesmo opt-in vale para o caminho de copiar: sem autorização, o texto
    // livre não entra no prompt que a pessoa vai colar em outro serviço.
    const data = $('reasoningConsent')?.checked ? result() : withoutReasoning(result());
    return `Analise este resultado exploratório do Cognitiva. É uma bateria NÃO padronizada, sem comparações populacionais ou estimativa de QI. Use apenas os dados fornecidos; não infira diagnósticos, percentis nem superioridade intelectual. Identifique padrões observados, explique calibração e limitações do banco (famílias paramétricas podem se repetir), compare confiança e acertos e proponha exercícios. Se as justificativas contradisserem a escolha, sinalize a ambiguidade.\n\n${JSON.stringify(data,null,2)}`;
  }
  function renderResults() {
    const score = grade(session.form, session.answers), total = session.form.items.length;
    $('resultScore').textContent = `${score.correct}/${total}`;
    $('statGrid').innerHTML = [['Acertos', `${score.correct}/${total}`],['Precisão', score.accuracy === null ? '—' : `${Math.round(score.accuracy * 100)}%`],['Confiança média', score.meanConfidence === null ? '—' : `${Math.round(score.meanConfidence)}%`],['Brier', score.brier === null ? '—' : score.brier.toFixed(3)]].map(([name, val]) => `<div class="results-stat"><strong>${val}</strong><span class="muted small">${name}</span></div>`).join('');
    $('domainGraph').innerHTML = score.byDomain.map(d => {
      const pct = Math.round(d.correct / d.total * 100);
      return `<div class="dimension-item"><div class="info-line"><strong class="small">${esc(d.title)}</strong><span class="small">${d.correct} de ${d.total} acertos (${pct}%)</span></div><div class="dimension-bar" role="progressbar" aria-label="${esc(d.title)}" aria-valuemin="0" aria-valuemax="${d.total}" aria-valuenow="${d.correct}" aria-valuetext="${d.correct} de ${d.total} acertos"><div class="dimension-fill" style="width:${pct}%"></div></div></div>`;
    }).join('');
    $('confidenceSummary').innerHTML = `<p class="small">${score.meanConfidence === null ? 'Você não registrou confiança.' : `Confiança média de ${Math.round(score.meanConfidence)}%. A diferença para a taxa de acertos foi de ${Math.round(score.confidenceGap)} pontos percentuais.`}</p><p class="small">${score.brier === null ? 'O Brier Score não pôde ser calculado.' : `Brier Score: ${score.brier.toFixed(3)} (menor é melhor, nesta amostra).`}</p>`;
    $('reviewList').innerHTML = score.entries.map((e, i) => {
      const number = String(i + 1).padStart(2, '0');
      const status = e.selected === null ? 'Não respondida' : e.correct ? 'Correta' : 'Incorreta';
      return `<details><summary><span class="review-number" aria-hidden="true">${number} · </span>${esc(e.question)} — ${status}</summary><p><strong>Posição:</strong> questão ${i + 1} de ${score.entries.length}</p><p><strong>Contexto:</strong> ${esc(e.context)}</p><p><strong>Resposta:</strong> ${e.selected === null ? '—' : esc(e.options[e.selected])}</p><p><strong>Correta:</strong> ${esc(e.options[e.answer])}</p><p><strong>Explicação:</strong> ${esc(e.explanation)}</p>${e.reasoning ? `<p><strong>Seu raciocínio:</strong> ${esc(e.reasoning)}</p>` : ''}</details>`;
    }).join('');
  }
  function renderParticipant(outcome) {
    const view = buildParticipantView(outcome);
    if (!view) {
      $('aiParticipant').classList.add('hide');
      return false;
    }
    $('aiParticipantBadge').textContent = view.badge;
    $('aiRubricVersion').textContent = view.rubricVersion || '—';
    $('aiModelName').textContent = view.modelLabel;
    $('aiDisclosurePreview').textContent = view.previewNote || '';
    $('aiDisclosurePreview').classList.toggle('hide', !view.previewNote);
    $('aiParticipantSections').innerHTML = view.sections.length
      ? view.sections.map(section => `<div class="participant-section"><h4 class="analysis-subtitle">${esc(section.title)}</h4><p>${esc(section.text)}</p></div>`).join('')
      : '<p class="small muted">Nenhuma seção foi gerada para esta prévia.</p>';
    $('aiExercises').innerHTML = view.exercises.length
      ? view.exercises.map(exercise => `<li>${esc(exercise.text)}${exercise.dimension ? ` <span class="participant-dimension">Dimensão de destino: ${esc(exercise.dimension)}</span>` : ''}${exercise.why ? `<span class="participant-why"> ${esc(exercise.why)}</span>` : ''}</li>`).join('')
      : '<li class="small muted">Nenhum exercício foi descrito nesta prévia.</li>';
    $('aiParticipantClosing').textContent = view.closing;
    $('aiParticipant').classList.remove('hide');
    return true;
  }
  function renderAnalysis(outcome) {
    const view = buildAnalysisView(outcome);
    lastAnalysis = outcome;
    $('aiMeta').innerHTML = view.meta.map(item => `<div class="analysis-meta-row"><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`).join('');
    $('aiSummary').textContent = view.summaryText;
    $('aiInsufficient').textContent = view.insufficient || '';
    $('aiInsufficient').classList.toggle('hide', !view.insufficient);
    $('aiClaims').innerHTML = view.claims.length ? view.claims.map(claim => {
      const evidence = claim.evidence.map(item => `<span class="analysis-evidence" title="${esc(item.id)}">${esc(item.label)}</span>`).join(' · ');
      return `<li class="analysis-claim"><p class="analysis-claim-head"><span class="analysis-level ${claim.levelKey}">${claim.level}</span>${claim.dimension ? `<span class="analysis-dimension">Dimensão: ${esc(claim.dimension)}</span>` : ''}<span class="analysis-claim-id">${esc(claim.id)}</span></p><p class="analysis-claim-text">${esc(claim.text)}</p><p class="analysis-evidence-line small muted">Evidência: ${evidence || 'não informada'}</p>${claim.caveat ? `<p class="small muted">${esc(claim.caveat)}</p>` : ''}</li>`;
    }).join('') : '<li class="small muted">Nenhuma leitura por dimensão foi gerada para esta sessão.</li>';
    $('aiLimitations').innerHTML = view.limitations.map(text => `<li>${esc(text)}</li>`).join('');
    $('aiRefused').innerHTML = view.refused.map(text => `<li>${esc(text)}</li>`).join('');
    $('aiReport').classList.remove('hide');
    $('analysisDownloadBtn').classList.remove('hide');
    // A prévia é o artefato novo; se existir, o foco vai para ela e o laudo
    // continua imediatamente acima, na mesma região.
    const hasParticipant = renderParticipant(outcome);
    (hasParticipant ? $('aiParticipant') : $('aiReport')).focus({preventScroll: true});
  }
  function updateInviteUi() {
    const btn = $('apiBtn');
    const hasInvite = Boolean(invite);
    if (!hasInvite) {
      btn.disabled = true;
      $('inviteStatus').textContent = 'A análise automática é um piloto por convite. Abra o link de convite para habilitar; o Copiar análise para ChatGPT continua disponível.';
      $('apiStatus').textContent = 'Sem convite, a análise automática fica desabilitada. O Copiar análise para ChatGPT continua ativo.';
    } else {
      btn.disabled = Boolean(retryTimer);
      $('inviteStatus').textContent = 'Convite ativo nesta sessão.';
      $('apiStatus').textContent = 'A análise automática está disponível com o convite desta sessão.';
    }
  }

  /** Aplica o convite do fragmento. Roda na carga e em hashchange/pageshow,
   * para cobrir navegação no mesmo documento. replaceState não dispara
   * hashchange, então não há loop. Fragmento inválido preserva a URL e avisa. */
  function applyInviteFromHash() {
    const hash = window.location.hash;
    const linked = parseInviteHash(hash);
    const hasInviteParam = hash.startsWith('#') && new URLSearchParams(hash.slice(1)).has('convite');
    if (linked && isValidInviteToken(linked)) {
      storeInvite(window.sessionStorage, linked);
      invite = linked;
      try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* histórico indisponível */ }
      updateInviteUi();
      return true;
    }
    if (hasInviteParam) {
      $('inviteStatus').textContent = 'Link de convite inválido. Confira o link recebido; o Copiar análise para ChatGPT continua disponível.';
    }
    return false;
  }

  /** Contagem regressiva do 429 baseada em relógio; reabilita no fim. */
  function startRetry(seconds) {
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
    const total = Math.max(0, Math.ceil(Number(seconds) || 0));
    const btn = $('apiBtn');
    if (!total) { updateInviteUi(); return; }
    const deadline = Date.now() + total * 1000;
    const tick = () => {
      // Usa o relógio, não a quantidade de ticks: abas em segundo plano
      // podem ter timers atrasados, mas o prazo real permanece o mesmo.
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining <= 0) {
        clearInterval(retryTimer); retryTimer = null;
        $('apiStatus').textContent = invite
          ? 'Você já pode tentar a análise novamente.'
          : 'Sem convite, a análise automática continua desabilitada.';
        btn.disabled = !invite;
        return;
      }
      $('apiStatus').textContent = retryMessage(remaining);
      btn.disabled = true;
    };
    tick();
    retryTimer = setInterval(tick, 1000);
  }

  async function analyze() {
    const btn = $('apiBtn');
    if (!invite) {
      $('apiStatus').textContent = 'Abra o link de convite para usar a análise automática. O Copiar análise para ChatGPT continua disponível.';
      btn.disabled = true;
      return;
    }
    const authorized = Boolean($('reasoningConsent')?.checked);
    btn.disabled = true;
    $('apiStatus').textContent = authorized
      ? 'Solicitando análise com seus comentários autorizados. Nenhum dado é enviado sem esta ação.'
      : 'Solicitando análise sem enviar seus comentários. Nenhum dado é enviado sem esta ação.';
    // O fingerprint é calculado no servidor (bloco E + node:crypto). O navegador
    // não replica essa lógica; por isso expectedFingerprint fica nulo e o valor
    // devolvido é exibido no laudo, não reenviado. O convite vai só no header.
    const outcome = await requestAnalysis(result(), {
      token: invite,
      reasoningAuthorized: authorized,
      consentTextVersion: authorized ? CONSENT_TEXT_VERSION : null
    });
    if (outcome.ok) {
      renderAnalysis(outcome);
      $('apiStatus').textContent = outcome.message;
      btn.disabled = false;
      return;
    }
    if (outcome.code === 'consent-invalid') {
      $('apiStatus').textContent = `${outcome.message} Você pode desmarcar a autorização e tentar de novo; o resultado continua salvo.`;
      btn.disabled = false;
    } else if (outcome.code === 'invite-required' || outcome.code === 'invite-invalid') {
      $('apiStatus').textContent = 'Convite inválido ou expirado; abra o link de convite novamente. O resultado continua salvo.';
      btn.disabled = false;
    } else if (outcome.code === 'rate-limit') {
      startRetry(outcome.retryAfter);
    } else {
      $('apiStatus').textContent = outcome.message;
      btn.disabled = false;
    }
  }
  $('homeLink').onclick = e => {e.preventDefault(); toHome();};
  $('startBtn').onclick = () => start(true);
  $('resumeBtn').onclick = () => start(false);
  document.querySelectorAll('[data-tier]').forEach(btn => btn.onclick = () => {tier = btn.dataset.tier; document.querySelectorAll('[data-tier]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));});
  $('confidenceInput').oninput = e => {
    const q = current();
    const value = Number(e.target.value);
    session.answers[q.id] = {...answer(q), confidence: value};
    $('confidenceText').textContent = `${value}%`;
    $('confidenceInput').setAttribute('aria-valuetext', `${value} por cento`);
    persist();
  };
  $('notes').oninput = e => {const q = current(); session.answers[q.id] = {...answer(q), reasoning: e.target.value}; persist();};
  $('prevBtn').onclick = () => move(-1);
  $('nextBtn').onclick = () => session.index === session.form.items.length - 1 ? finalize() : move(1);
  $('finishBtn').onclick = finalize; $('pauseBtn').onclick = toHome;
  $('downloadBtn').onclick = () => download(JSON.stringify(result(),null,2), `cognitiva_${session.form.tier}_${Date.now()}.json`);
  $('analysisDownloadBtn').onclick = () => {
    if (!lastAnalysis) return;
    const fingerprint = String(lastAnalysis.dataFingerprint || '').replace(/[^a-z0-9]/gi, '').slice(-16) || String(Date.now());
    download(JSON.stringify(lastAnalysis, null, 2), `analysis-${fingerprint}.json`);
  };
  $('copyBtn').onclick = async () => {try {await navigator.clipboard.writeText(prompt()); alert('Relatório copiado. Cole em uma conversa com o ChatGPT.')} catch {download(prompt(), 'cognitiva_prompt.txt', 'text/plain')}};
  $('apiBtn').onclick = analyze;
  const consentVersionLabel = $('consentVersionLabel');
  if (consentVersionLabel) consentVersionLabel.textContent = CONSENT_TEXT_VERSION;
  $('reasoningConsent').onchange = () => {
    const authorized = $('reasoningConsent').checked;
    $('consentState').textContent = authorized
      ? 'Seus comentários serão enviados ao provedor apenas nesta análise.'
      : 'Sem autorização, seus comentários não são enviados ao servidor de análise.';
  };
  $('againBtn').onclick = () => {session = null; store.clearSession(); toHome();};
  $('privacyBtn').onclick = () => alert('Os resultados e as questões vistas ficam neste navegador (localStorage). Nenhum resultado é enviado automaticamente. A análise via API só envia dados quando você confirma pelo botão. Para remover dados, use Apagar meus dados.');
  $('deleteBtn').onclick = () => {
    if (!confirm('Apagar histórico, avaliação local e convite desta sessão?')) return;
    store.clearAll();
    clearStoredInvite(window.sessionStorage);
    invite = null;
    session = null;
    renderHome(); show('home');
    updateInviteUi();
    notice('Histórico, avaliação local e convite desta sessão apagados deste navegador.');
    focusHeading('storageNotice');
  };
  updateInviteUi();
  applyInviteFromHash();
  window.addEventListener('hashchange', applyInviteFromHash);
  window.addEventListener('pageshow', applyInviteFromHash);
  renderHome();
  if (session?.finishedAt) {renderResults(); show('result');}
  reportStorageIssues();
  window.__COGNITIVA_V2__ = {buildForm, grade, version: VERSION};
}

if (typeof document !== 'undefined') initApp();
