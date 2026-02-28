/* ═══════════════════════════════════════════════════════
   KQL Practice App  –  app.js
   Features: Save/resume progress, retry wrong answers (½ pts), PWA-ready
   ═══════════════════════════════════════════════════════ */

// ─── Constants ────────────────────────────────────────────
const SAVE_KEY    = 'kql-progress-v2';

// Pool of plausible-but-wrong KQL tokens used as drag distractors
const DISTRACTORS = [
  'limit', 'take', 'top', 'distinct', 'sample',
  'mv-expand', 'parse', 'evaluate', 'facet', 'datatable',
  'make_list()', 'make_set()', 'dcount()', 'arg_max()', 'arg_min()',
  'percentile()', 'variance()', 'stdev()',
  '1d', '7d', '30d', '1h', '6h', '24h',
  'kind=leftouter', 'kind=inner', 'kind=fullouter',
  'toupper()', 'split()', 'replace()', 'trim()', 'strlen()',
  'extract()', 'parse_json()', 'todynamic()',
  'TimeGenerated', 'Computer', 'EventID', 'Message',
  'SourceIP', 'DestinationIP', 'Account', 'ProcessName',
  'has_any()', 'has_all()', 'in~', 'between',
  'asc', 'desc', 'true', 'false', 'null',
  'project-rename', 'project-away', 'serialize',
  'countif()', 'sumif()', 'maxif()', 'minif()',
  '!=', '!~', '!contains', '!has', '!in',
  '>=', '<=', 'ago()', 'now()', 'bin()',
  'tostring()', 'toint()', 'todouble()', 'tolower()',
  'iif()', 'coalesce()', 'isnotnull()', 'isnull()',
];

function getDistractors(answer, count) {
  const lower = new Set(answer.map(t => t.toLowerCase()));
  const pool  = DISTRACTORS.filter(d => !lower.has(d.toLowerCase()));
  return shuffle(pool).slice(0, count);
}
const PTS_CORRECT = 10;
const PTS_HINT    = 5;   // correct but used hint
const PTS_RETRY   = 5;   // correct on retry
const PTS_RETRY_H = 3;   // correct on retry with hint

// ─── State ────────────────────────────────────────────────
let allQuestions      = [];
let sessionQuestions  = [];
let currentIdx        = 0;
let score             = 0;
let correctCount      = 0;
let attempted         = 0;
let hintUsed          = false;
let answered          = false;
let startLevel        = 1;
let wrongIds          = new Set();  // IDs answered incorrectly this session
let isRetryMode       = false;

// Per-level tracking  { level: { c: correct, t: total } }
const levelStats = { 1:{c:0,t:0}, 2:{c:0,t:0}, 3:{c:0,t:0}, 4:{c:0,t:0}, 5:{c:0,t:0} };

// Drag state
let bankTokens   = [];   // [{id, text}]
let answerTokens = [];   // [{id, text}]

// ─── Persistence ──────────────────────────────────────────
function saveProgress() {
  if (isRetryMode) return; // don't overwrite main save during retry
  const state = {
    version: 2,
    ts: Date.now(),
    startLevel,
    sessionIds:  sessionQuestions.map(q => q.id),
    currentIdx,
    score,
    correctCount,
    attempted,
    levelStats:  JSON.parse(JSON.stringify(levelStats)),
    wrongIds:    [...wrongIds],
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {}
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function clearSaved() {
  try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
}

function buildIdMap() {
  return Object.fromEntries(allQuestions.map(q => [q.id, q]));
}

// ─── Init ─────────────────────────────────────────────────
function init() {
  allQuestions = window.QUESTIONS || [];

  // Wire up buttons
  document.getElementById('start-btn').addEventListener('click', startQuiz);
  document.getElementById('hint-btn').addEventListener('click', showHint);
  document.getElementById('submit-btn').addEventListener('click', submitAnswer);
  document.getElementById('next-btn').addEventListener('click', nextQuestion);
  document.getElementById('skip-btn').addEventListener('click', skipQuestion);
  document.getElementById('clear-btn').addEventListener('click', clearDrag);
  document.getElementById('restart-btn').addEventListener('click', () => { clearSaved(); showScreen('welcome-screen'); });
  document.getElementById('back-home-btn').addEventListener('click', () => { clearSaved(); showScreen('welcome-screen'); });
  document.getElementById('retry-btn').addEventListener('click', startRetry);
  document.getElementById('continue-btn').addEventListener('click', continueSaved);
  document.getElementById('new-game-btn').addEventListener('click', () => {
    clearSaved();
    hide('continue-banner');
  });

  // Check for saved progress
  const saved = loadSaved();
  if (saved && saved.sessionIds && saved.currentIdx < saved.sessionIds.length) {
    const pct = Math.round((saved.currentIdx / saved.sessionIds.length) * 100);
    document.getElementById('continue-detail').textContent =
      `Level ${saved.startLevel || 1} · Q${saved.currentIdx + 1} of ${saved.sessionIds.length} · Score ${saved.score}`;
    show('continue-banner');
  }
}

// ─── Continue saved session ────────────────────────────────
function continueSaved() {
  const saved = loadSaved();
  if (!saved) return;

  hide('continue-banner');
  isRetryMode = false;

  // Restore state
  startLevel   = saved.startLevel || 1;
  currentIdx   = saved.currentIdx || 0;
  score        = saved.score || 0;
  correctCount = saved.correctCount || 0;
  attempted    = saved.attempted || 0;
  wrongIds     = new Set(saved.wrongIds || []);
  if (saved.levelStats) {
    [1,2,3,4,5].forEach(l => {
      if (saved.levelStats[l]) {
        levelStats[l].c = saved.levelStats[l].c || 0;
        levelStats[l].t = saved.levelStats[l].t || 0;
      }
    });
  }

  // Rebuild session from saved IDs
  const map = buildIdMap();
  sessionQuestions = (saved.sessionIds || []).map(id => map[id]).filter(Boolean);

  updateScore();
  showScreen('quiz-screen');
  renderQuestion();
}

// ─── Start fresh quiz ──────────────────────────────────────
function startQuiz() {
  clearSaved();
  hide('continue-banner');
  startLevel   = parseInt(document.getElementById('start-level').value) || 1;
  isRetryMode  = false;

  // Reset all stats
  score = 0; correctCount = 0; attempted = 0;
  wrongIds = new Set();
  [1,2,3,4,5].forEach(l => { levelStats[l].c = 0; levelStats[l].t = 0; });

  // Shuffle within each level
  sessionQuestions = [];
  [1,2,3,4,5].forEach(lvl => {
    if (lvl < startLevel) return;
    sessionQuestions.push(...shuffle(allQuestions.filter(q => q.difficulty === lvl)));
  });

  currentIdx = 0;
  showScreen('quiz-screen');
  renderQuestion();
}

// ─── Retry wrong answers ───────────────────────────────────
function startRetry() {
  if (wrongIds.size === 0) return;
  isRetryMode = true;

  const map = buildIdMap();
  sessionQuestions = shuffle([...wrongIds].map(id => map[id]).filter(Boolean));
  wrongIds = new Set(); // Reset for tracking retry misses
  currentIdx = 0;

  hide('retry-btn');
  updateScore();
  showScreen('quiz-screen');
  renderQuestion();
}

// ─── Screen management ────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── Render question ──────────────────────────────────────
function renderQuestion() {
  if (currentIdx >= sessionQuestions.length) {
    showEndScreen();
    return;
  }

  const q = sessionQuestions[currentIdx];
  answered = false;
  hintUsed = false;

  // Retry ribbon
  document.getElementById('retry-ribbon').hidden = !isRetryMode;

  // Meta
  document.getElementById('diff-badge').textContent = `Level ${q.difficulty}`;
  document.getElementById('diff-badge').className   = `diff-badge diff-${q.difficulty}`;
  document.getElementById('q-topic').textContent     = q.topic || '';
  document.getElementById('q-type-badge').textContent = q.type === 'fill' ? 'Fill in the Blank' : 'Arrange Tokens';
  document.getElementById('q-num').textContent       = `Q${currentIdx + 1}`;
  document.getElementById('q-text').textContent      = q.question;

  // Reset UI
  hide('hint-box');
  hide('feedback-box');
  show('hint-btn');
  show('skip-btn');
  show('submit-btn');
  hide('next-btn');
  document.getElementById('fill-container').hidden = true;
  document.getElementById('drag-container').hidden = true;

  if (q.type === 'fill') {
    hide('clear-btn');
    renderFill(q);
  } else {
    show('clear-btn');
    renderDrag(q);
  }

  updateProgress();
  updateScore();
  // Scroll to top of card on mobile
  document.getElementById('q-card').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// ── Fill in the Blank ─────────────────────────────────────
function renderFill(q) {
  document.getElementById('fill-container').hidden = false;
  const body = document.getElementById('fill-body');

  const parts = q.template.split('___');
  let html = '';
  parts.forEach((part, i) => {
    html += `<span class="kql-segment">${syntaxHighlight(part)}</span>`;
    if (i < parts.length - 1) {
      html += `<input class="blank-input" data-blank="${i}" placeholder="?" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" />`;
    }
  });
  body.innerHTML = html;

  const first = body.querySelector('.blank-input');
  if (first) {
    // Slight delay so iOS keyboard doesn't fight the scroll
    setTimeout(() => first.focus(), 300);
  }

  body.querySelectorAll('.blank-input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submitAnswer(); });
  });
}

function syntaxHighlight(code) {
  return escapeHtml(code)
    .replace(/\b(where|project|summarize|extend|order|sort|by|join|union|let|take|limit|top|count|distinct|parse|mv-expand|mv-apply|evaluate|find|range|lookup|not|and|or|in|between|contains|has|startswith|endswith|matches|regex|kind|on|with|asc|desc|step|from|to|make-series|datatable|print|facet|partition)\b/g,
      '<span class="kql-keyword">$1</span>')
    .replace(/&quot;[^&]*&quot;/g, s => `<span class="kql-string">${s}</span>`)
    .replace(/\b(\d+(?:\.\d+)?[dhm]?)\b/g, '<span class="kql-number">$1</span>');
}

// ── Drag and Drop ─────────────────────────────────────────
function renderDrag(q) {
  document.getElementById('drag-container').hidden = false;

  const distractors = getDistractors(q.answer, 3);
  const allTokens   = shuffle([...q.answer, ...distractors]);
  bankTokens   = allTokens.map((text, i) => ({ id: `t${i}`, text }));
  answerTokens = [];

  renderBank();
  renderAnswerArea();
}

function renderBank() {
  const bank = document.getElementById('token-bank');
  bank.innerHTML = '';
  bankTokens.forEach(tok => {
    bank.appendChild(makeChip(tok, 'bank-chip', () => moveToAnswer(tok)));
  });
}

function renderAnswerArea() {
  const area        = document.getElementById('answer-area');
  const placeholder = document.getElementById('answer-placeholder');
  area.innerHTML = '';

  if (answerTokens.length === 0) {
    area.appendChild(placeholder);
  } else {
    answerTokens.forEach((tok, idx) => {
      area.appendChild(makeChip(tok, 'answer-chip', () => moveToBank(tok, idx)));
    });
  }
  updatePreview();
}

function makeChip(tok, cls, clickFn) {
  const div = document.createElement('div');
  div.className = `token-chip ${cls}`;
  div.textContent = tok.text;
  div.dataset.id  = tok.id;
  div.dataset.token = tok.text;
  div.addEventListener('click', clickFn);
  return div;
}

function moveToAnswer(tok) {
  if (answered) return;
  bankTokens   = bankTokens.filter(t => t.id !== tok.id);
  answerTokens = [...answerTokens, tok];
  renderBank();
  renderAnswerArea();
}

function moveToBank(tok, idx) {
  if (answered) return;
  answerTokens.splice(idx, 1);
  bankTokens = [...bankTokens, tok];
  renderBank();
  renderAnswerArea();
}

function clearDrag() {
  if (answered) return;
  bankTokens   = [...bankTokens, ...answerTokens];
  answerTokens = [];
  renderBank();
  renderAnswerArea();
}

function updatePreview() {
  document.getElementById('answer-preview').textContent =
    answerTokens.length ? answerTokens.map(t => t.text).join(' ') : '—';
}

// ─── Submit Answer ────────────────────────────────────────
function submitAnswer() {
  if (answered) return;
  const q = sessionQuestions[currentIdx];

  const isCorrect = q.type === 'fill' ? checkFill(q) : checkDrag(q);

  answered = true;
  attempted++;
  levelStats[q.difficulty].t++;

  if (isCorrect) {
    correctCount++;
    levelStats[q.difficulty].c++;
    const pts = isRetryMode
      ? (hintUsed ? PTS_RETRY_H : PTS_RETRY)
      : (hintUsed ? PTS_HINT    : PTS_CORRECT);
    score += pts;
    showFeedback(true, q, pts);
  } else {
    wrongIds.add(q.id);
    showFeedback(false, q, 0);
  }

  updateScore();
  updateProgress();
  saveProgress();  // persist after every answer

  hide('submit-btn');
  hide('skip-btn');
  hide('hint-btn');
  show('next-btn');
}

function checkFill(q) {
  const inputs = document.querySelectorAll('#fill-body .blank-input');
  let allOk = true;
  inputs.forEach((inp, i) => {
    const val      = inp.value.trim().toLowerCase();
    const expected = q.answers[i];
    const match    = Array.isArray(expected)
      ? expected.some(e => val === e.toLowerCase())
      : val === String(expected).toLowerCase();
    inp.classList.remove('correct-input', 'wrong-input');
    inp.classList.add(match ? 'correct-input' : 'wrong-input');
    if (!match) allOk = false;
  });
  return allOk;
}

function checkDrag(q) {
  const user = answerTokens.map(t => t.text.toLowerCase());
  const corr = q.answer.map(t => t.toLowerCase());
  return user.length === corr.length && user.every((t, i) => t === corr[i]);
}

// ─── Feedback ─────────────────────────────────────────────
function showFeedback(correct, q, pts) {
  const box = document.getElementById('feedback-box');
  box.hidden = false;
  box.className = `feedback-box ${correct ? 'correct' : 'wrong'} fade-in`;

  // Build the correct answer string
  let answerStr = '';
  if (q.type === 'fill') {
    let tpl = q.template;
    q.answers.forEach(a => {
      tpl = tpl.replace('___', Array.isArray(a) ? a[0] : a);
    });
    answerStr = tpl;
  } else {
    answerStr = q.answer.join(' ');
  }

  const ptsStr = pts > 0 ? ` &nbsp;+${pts} pts` : '';
  box.innerHTML = `
    <div class="fb-title">${correct ? '✅ Correct!' + ptsStr : '❌ Incorrect'}</div>
    <div class="fb-answer">${escapeHtml(answerStr)}</div>
    ${q.hint ? `<div class="fb-hint">💡 ${escapeHtml(q.hint)}</div>` : ''}
  `;

  if (!correct) {
    box.classList.add('shake');
    // Highlight wrong answer chips
    document.querySelectorAll('.answer-chip').forEach(c => {
      c.style.borderColor = 'var(--error)';
      c.style.background  = 'rgba(239,68,68,.18)';
    });
  }

  // Scroll feedback into view on mobile
  setTimeout(() => box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 100);
}

// ─── Hint ─────────────────────────────────────────────────
function showHint() {
  const q = sessionQuestions[currentIdx];
  if (!q || !q.hint || answered) return;
  hintUsed = true;
  document.getElementById('hint-text').textContent = q.hint;
  show('hint-box');
}

// ─── Navigation ───────────────────────────────────────────
function nextQuestion() { currentIdx++; renderQuestion(); }

function skipQuestion() {
  attempted++;
  levelStats[sessionQuestions[currentIdx].difficulty].t++;
  wrongIds.add(sessionQuestions[currentIdx].id); // skipped = wrong for retry purposes
  currentIdx++;
  saveProgress();
  renderQuestion();
}

// ─── Progress & Score ─────────────────────────────────────
function updateProgress() {
  const total = sessionQuestions.length;
  const pct   = total > 0 ? (currentIdx / total) * 100 : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent =
    isRetryMode ? `Retry ${currentIdx} / ${total}` : `${currentIdx} / ${total}`;
}

function updateScore() {
  document.getElementById('score-val').textContent = score;
}

// ─── End Screen ───────────────────────────────────────────
function showEndScreen() {
  clearSaved(); // Session done – clear save

  const acc = attempted > 0 ? Math.round((correctCount / attempted) * 100) : 0;

  document.getElementById('end-title').textContent = isRetryMode ? 'Retry Complete!' : 'Practice Complete!';
  document.getElementById('end-score').textContent   = score;
  document.getElementById('end-correct').textContent = correctCount;
  document.getElementById('end-total').textContent   = attempted;
  document.getElementById('end-acc').textContent     = acc + '%';

  // Level breakdown
  const breakdown = document.getElementById('level-results');
  breakdown.innerHTML = '';
  [1,2,3,4,5].forEach(lvl => {
    const st = levelStats[lvl];
    if (st.t === 0) return;
    const a = Math.round((st.c / st.t) * 100);
    const row = document.createElement('div');
    row.className = 'lvl-result-row';
    row.innerHTML = `
      <span class="lvl-name lp-${lvl}" style="border-color:var(--l${lvl});color:var(--l${lvl})">Level ${lvl}</span>
      <span>${st.c} / ${st.t} correct</span>
      <span class="lvl-acc">${a}%</span>
    `;
    breakdown.appendChild(row);
  });

  // Retry button: show if there are wrong answers from this session
  const retryBtn = document.getElementById('retry-btn');
  if (wrongIds.size > 0) {
    retryBtn.textContent = `🔁 Retry ${wrongIds.size} Wrong Answer${wrongIds.size === 1 ? '' : 's'} (½ pts)`;
    show('retry-btn');
  } else {
    hide('retry-btn');
  }

  showScreen('end-screen');
}

// ─── Utility ──────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function show(id) { const el = document.getElementById(id); if (el) el.hidden = false; }
function hide(id) { const el = document.getElementById(id); if (el) el.hidden = true; }

// ─── Boot ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
