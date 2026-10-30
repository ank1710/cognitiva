import {VERSION,TIERS,DIMENSIONS,buildForm,grade,exportReport} from './engine.js';
import {requestAnalysis} from './analysis.js';
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
  function prompt() {return `Analise este resultado exploratório do Cognitiva. É uma bateria NÃO padronizada, sem comparações populacionais ou estimativa de QI. Use apenas os dados fornecidos; não infira diagnósticos, percentis nem superioridade intelectual. Identifique padrões observados, explique calibração e limitações do banco (famílias paramétricas podem se repetir), compare confiança e acertos e proponha exercícios. Se as justificativas contradisserem a escolha, sinalize a ambiguidade.\n\n${JSON.stringify(result(),null,2)}`;}
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
  async function analyze() {
    const btn = $('apiBtn'); btn.disabled = true;
    $('apiStatus').textContent = 'Solicitando análise. Nenhum dado é enviado sem esta ação.';
    const outcome = await requestAnalysis(result());
    if (outcome.ok) {$('aiResult').textContent = outcome.analysis; $('aiResult').classList.remove('hide'); $('apiStatus').textContent = outcome.message;}
    else {$('apiStatus').textContent = outcome.message;}
    btn.disabled = false;
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
  $('copyBtn').onclick = async () => {try {await navigator.clipboard.writeText(prompt()); alert('Relatório copiado. Cole em uma conversa com o ChatGPT.')} catch {download(prompt(), 'cognitiva_prompt.txt', 'text/plain')}};
  $('apiBtn').onclick = analyze;
  $('againBtn').onclick = () => {session = null; store.clearSession(); toHome();};
  $('privacyBtn').onclick = () => alert('Os resultados e as questões vistas ficam neste navegador (localStorage). Nenhum resultado é enviado automaticamente. A análise via API só envia dados quando você confirma pelo botão. Para remover dados, use Apagar meus dados.');
  $('deleteBtn').onclick = () => {
    if (!confirm('Apagar histórico e avaliação local deste navegador?')) return;
    store.clearAll(); session = null;
    renderHome(); show('home');
    notice('Histórico e avaliação local apagados deste navegador.');
    focusHeading('storageNotice');
  };
  renderHome();
  if (session?.finishedAt) {renderResults(); show('result');}
  reportStorageIssues();
  window.__COGNITIVA_V2__ = {buildForm, grade, version: VERSION};
}

if (typeof document !== 'undefined') initApp();
