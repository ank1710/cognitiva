import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeFigure, figureMarkup, optionLabel} from '../src/app.js';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const css = readFileSync(new URL('src/styles.css', root), 'utf8');

/* ---------------------------------------------------------------- grades */
test('grade 3x3 recebe descrição em palavras com linha e coluna', () => {
  const text = '· ● ·\n· · ·\n· · ·';
  assert.equal(describeFigure(text), 'grade 3 por 3: linha 1, coluna 2 com "●".');
});

test('grade vazia é descrita sem depender do símbolo', () => {
  assert.match(describeFigure('· · ·\n· · ·\n· · ·'), /todas as células vazias/);
});

test('duas grades no mesmo texto são descritas separadamente', () => {
  const text = 'Antes:\n● · ·\n· · ·\n· · ·\nDepois:\n· · ·\n· ● ·\n· · ·';
  const desc = describeFigure(text);
  assert.match(desc, /Grade 1 de 2/);
  assert.match(desc, /Grade 2 de 2/);
  assert.match(desc, /linha 2, coluna 2 com "●"/);
});

test('sequência numérica não é confundida com grade', () => {
  assert.equal(describeFigure('5  ·  12  ·  19  ·  28  ·  ?'), '');
  assert.equal(describeFigure('Sem figura aqui.'), '');
});

test('markup da grade mantém texto visível e rótulo acessível', () => {
  const out = figureMarkup('· ● ·\n· · ·\n· · ·');
  assert.match(out, /role="img"/);
  assert.match(out, /aria-label="grade 3 por 3: linha 1, coluna 2 com &quot;●&quot;\."/);
  assert.match(out, /grid-cell-mark/);
  assert.match(out, /aria-hidden="true"/);
});

test('conteúdo arbitrário é escapado no markup', () => {
  assert.doesNotMatch(figureMarkup('<img src=x onerror=1>'), /<img/);
  assert.match(figureMarkup('<img src=x onerror=1>'), /&lt;img/);
});

test('rótulo da alternativa nomeia a letra e descreve a grade', () => {
  assert.equal(optionLabel('· · ·\n· ● ·\n· · ·', 1), 'Alternativa B: grade 3 por 3: linha 2, coluna 2 com "●".');
  assert.equal(optionLabel('5', 0), 'Alternativa A: 5');
  assert.match(optionLabel('texto\ncom quebra', 3), /^Alternativa D: texto com quebra$/);
});

/* ---------------------------------------------------------------- HTML */
test('link de salto e região principal focável existem', () => {
  assert.match(html, /<a class="skip-link" href="#mainContent">/);
  assert.match(html, /<main[^>]*id="mainContent"[^>]*tabindex="-1"/);
});

test('barra de progresso declara papel e valores', () => {
  const tag = html.match(/<div[^>]*id="progressBar"[^>]*>/)?.[0] || '';
  assert.match(tag, /role="progressbar"/);
  assert.match(tag, /aria-valuemin="0"/);
  assert.match(tag, /aria-valuemax="20"/);
  assert.match(tag, /aria-valuenow="0"/);
  assert.match(tag, /aria-valuetext=/);
  assert.match(tag, /aria-label="Progresso da avaliação"/);
});

test('enunciado, títulos e aviso aceitam foco programático', () => {
  assert.match(html, /<h1 id="homeTitle" tabindex="-1">/);
  assert.match(html, /<h1 id="resultTitle" tabindex="-1">/);
  assert.match(html, /<h2 id="questionTitle" tabindex="-1"/);
  assert.match(html, /id="storageNotice"[^>]*tabindex="-1"/);
});

test('alternativas são grupo rotulado e o slider tem nome e valor falado', () => {
  assert.match(html, /id="optionList"[^>]*role="group"[^>]*aria-labelledby="questionTitle"/);
  assert.match(html, /id="optionList"[^>]*aria-describedby="questionHelp"/);
  assert.match(html, /id="confidenceInput"[^>]*aria-labelledby="confidenceLabel"/);
  assert.match(html, /id="confidenceInput"[^>]*aria-valuetext=/);
  assert.match(html, /id="confidenceInput"[^>]*aria-describedby="confidenceHelp"/);
});

test('status de gravação e de análise usam aria-live educadamente', () => {
  assert.match(html, /id="storageNotice"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="examStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="apiStatus"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('todos os campos do formulário têm rótulo associado', () => {
  const labels = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map(m => m[1]);
  const controls = [...html.matchAll(/<(?:input|textarea|output)\b[^>]*id="([^"]+)"/g)].map(m => m[1]);
  for (const id of controls) {
    const labelled = labels.includes(id) || new RegExp(`id="${id}"[^>]*aria-label=`, 's').test(html) || new RegExp(`id="${id}"[^>]*aria-labelledby=`, 's').test(html);
    assert.ok(labelled, `controle sem rótulo: ${id}`);
  }
});

test('não há ids duplicados no documento', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dup, []);
});

test('botões declaram type para não submeter formulário implicitamente', () => {
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(m => m[0]);
  assert.ok(buttons.length > 0);
  for (const tag of buttons) assert.match(tag, /type="button"/);
});

test('decoração visual não é anunciada', () => {
  assert.match(html, /class="art" aria-hidden="true"/);
  assert.match(html, /class="brand-mark" aria-hidden="true"/);
});

test('o app expõe funções de acessibilidade sem exigir DOM', () => {
  assert.equal(typeof describeFigure, 'function');
  assert.equal(typeof figureMarkup, 'function');
  assert.equal(typeof optionLabel, 'function');
});

/* ---------------------------------------------------------------- CSS */
const contrast = (a, b) => {
  const lum = hex => {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
test('texto principal e secundário atingem AA sobre papel e superfície', () => {
  const token = name => css.match(new RegExp(`--${name}:(#[0-9a-f]{6})`, 'i'))?.[1];
  for (const name of ['ink', 'slate', 'subtle']) {
    const color = token(name);
    assert.ok(color, `token --${name} ausente`);
    for (const bg of ['#ffffff', '#f5f7fb', '#edf0ff']) {
      assert.ok(contrast(color, bg) >= 4.5, `--${name} ${color} sobre ${bg} = ${contrast(color, bg).toFixed(2)}`);
    }
  }
});

test('estado selecionado mantém contraste do texto', () => {
  assert.match(css, /\.choice\[aria-pressed="true"\]\{[^}]*background:#edf0ff/);
  assert.ok(contrast('#15223b', '#edf0ff') >= 7);
});

test('alvos de toque têm pelo menos 44 px nos controles interativos', () => {
  for (const selector of ['.btn', '.mini-btn', '.choice', '.tier-card', '.review summary', '.brand']) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rule = css.match(new RegExp(`${escaped}\\{[^}]*min-height:44px[^}]*\\}`));
    assert.ok(rule, `${selector} sem min-height:44px`);
  }
});

test('layout estreito tem ponto de quebra em 360 px sem rolagem horizontal', () => {
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /@media\(max-width:420px\)\{[\s\S]*html,body\{overflow-x:hidden\}/);
});

test('prefers-reduced-motion desativa transições e animações', () => {
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*transition:none!important[\s\S]*animation:none!important/);
});

/* ------------------------------------------------- laudo técnico (T010) */
test('região do laudo é rotulada e focável, com listas semânticas', () => {
  assert.match(html, /<section id="aiReport"[^>]*tabindex="-1"[^>]*aria-labelledby="aiReportTitle"/);
  assert.match(html, /<h3 id="aiReportTitle">Laudo técnico<\/h3>/);
  assert.match(html, /<ol id="aiClaims"[^>]*aria-labelledby="aiClaimsTitle"/);
  assert.match(html, /<ul id="aiLimitations"[^>]*aria-labelledby="aiLimitationsTitle"/);
  assert.match(html, /<ul id="aiRefused"[^>]*aria-labelledby="aiRefusedTitle"/);
  assert.match(html, /<dl class="analysis-meta" id="aiMeta"/);
});

test('laudo declara audiência de pesquisa e limites clínicos', () => {
  assert.match(html, /Laudo técnico para pesquisa/);
  assert.match(html, /Audiência de pesquisa/);
  assert.match(html, /Não é avaliação clínica e não estima QI, percentil ou diagnóstico/);
});

test('download da análise é um botão explícito e começa oculto', () => {
  assert.match(html, /<button id="analysisDownloadBtn"[^>]*type="button"[^>]*>Baixar análise JSON ↓<\/button>/);
  assert.match(html, /id="analysisDownloadBtn"[^>]*class="[^"]*hide/);
});

test('foco do laudo é visível no CSS', () => {
  assert.match(css, /\.analysis-report:focus\{outline:3px solid #2f4bd8/);
});
