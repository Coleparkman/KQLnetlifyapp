/* ═══════════════════════════════════════════════════════
   KQL Practice App  –  app.js
   ═══════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────
let allQuestions = [];
let sessionQuestions = [];
let currentIdx = 0;
let score = 0;
let correctCount = 0;
let attempted = 0;
let hintUsed = false;
let answered = false;
let startLevel = 1;

// Per-level tracking
const levelStats = { 1:{correct:0,total:0}, 2:{correct:0,total:0}, 3:{correct:0,total:0}, 4:{correct:0,total:0}, 5:{correct:0,total:0} };

// Drag state
let bankTokens = [];   // {id, text} objects in bank
let answerTokens = []; // {id, text} objects in answer area

// ─── Helpers ─────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────────
function init() {
  allQuestions = window.QUESTIONS || [];

  document.getElementById('start-btn').addEventListener('click', startQuiz);
  document.getElementById('hint-btn').addEventListener('click', showHint);
  document.getElementById('submit-btn').addEventListener('click', submitAnswer);
  document.getElementById('next-btn').addEventListener('click', nextQuestion);
  document.getElementById('skip-btn').addEventListener('click', skipQuestion);
  document.getElementById('clear-btn').addEventListener('click', clearDrag);
  document.getElementById('restart-btn').addEventListener('click', () => showScreen('welcome-screen'));
  document.getElementById('back-home-btn').addEventListener('click', () => showScreen('welcome-screen'));
}

function startQuiz() {
  startLevel = parseInt(document.getElementById('start-level').value) || 1;

  // Reset stats
  score = 0; correctCount = 0; attempted = 0;
  Object.keys(levelStats).forEach(k => { levelStats[k].correct = 0; levelStats[k].total = 0; });

  // Build question list: shuffle within each difficulty level
  sessionQuestions = [];
  [1,2,3,4,5].forEach(lvl => {
    if (lvl < startLevel) return;
    const group = shuffle(allQuestions.filter(q => q.difficulty === lvl));
    sessionQuestions.push(...group);
  });

  currentIdx = 0;
  showScreen('quiz-screen');
  renderQuestion();
}

// ─── Screen management ────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── Question Rendering ───────────────────────────────────
function renderQuestion() {
  if (currentIdx >= sessionQuestions.length) {
    showEndScreen();
    return;
  }

  const q = sessionQuestions[currentIdx];
  answered = false;
  hintUsed = false;

  // Meta
  document.getElementById('diff-badge').textContent = `Level ${q.difficulty}`;
  document.getElementById('diff-badge').className = `diff-badge diff-${q.difficulty}`;
  document.getElementById('q-topic').textContent = q.topic || '';
  document.getElementById('q-type-badge').textContent = q.type === 'fill' ? 'Fill in the Blank' : 'Arrange the Tokens';
  document.getElementById('q-num').textContent = `Q${currentIdx + 1}`;
  document.getElementById('q-text').textContent = q.question;

  // Hide hint/feedback
  hide('hint-box');
  hide('feedback-box');

  // Footer buttons
  show('hint-btn');
  show('skip-btn');
  show('submit-btn');
  hide('next-btn');

  // Clear containers
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
}

// ── Fill in the Blank ──────────────────────────────────────
function renderFill(q) {
  document.getElementById('fill-container').hidden = false;
  const body = document.getElementById('fill-body');

  // Split template on ___ and insert inputs
  const parts = q.template.split('___');
  let html = '';
  parts.forEach((part, i) => {
    html += `<span class="kql-segment">${syntaxHighlight(part)}</span>`;
    if (i < parts.length - 1) {
      html += `<input class="blank-input" data-blank="${i}" placeholder="?" autocomplete="off" autocorrect="off" spellcheck="false" />`;
    }
  });
  body.innerHTML = html;

  // Focus first input
  const first = body.querySelector('.blank-input');
  if (first) first.focus();

  // Enter key submits
  body.querySelectorAll('.blank-input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitAnswer();
    });
  });
}

function syntaxHighlight(code) {
  // Very basic KQL syntax colouring
  return escapeHtml(code)
    .replace(/\b(where|project|summarize|extend|order|sort|by|join|union|let|take|limit|top|count|distinct|parse|mv-expand|mv-apply|evaluate|find|range|lookup|not|and|or|in|between|contains|has|startswith|endswith|matches|regex|kind|on|with|asc|desc|step|from|to)\b/g, '<span class="kql-keyword">$1</span>')
    .replace(/&quot;[^&]*&quot;/g, s => `<span class="kql-string">${s}</span>`)
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="kql-number">$1</span>');
}

// ── Drag and Drop ──────────────────────────────────────────
function renderDrag(q) {
  document.getElementById('drag-container').hidden = false;

  // Create shuffled token objects with unique ids
  const shuffled = shuffle([...q.answer]);
  bankTokens = shuffled.map((text, i) => ({ id: `tok-${i}`, text }));
  answerTokens = [];

  renderBank();
  renderAnswerArea();
}

function renderBank() {
  const bank = document.getElementById('token-bank');
  bank.innerHTML = '';
  bankTokens.forEach(tok => {
    const chip = makeChip(tok, 'bank-chip', () => moveToAnswer(tok));
    bank.appendChild(chip);
  });
}

function renderAnswerArea() {
  const area = document.getElementById('answer-area');
  const placeholder = document.getElementById('answer-placeholder');
  area.innerHTML = '';

  if (answerTokens.length === 0) {
    area.appendChild(placeholder);
    placeholder.hidden = false;
  } else {
    answerTokens.forEach((tok, idx) => {
      const chip = makeChip(tok, 'answer-chip', () => moveToBank(tok, idx));
      area.appendChild(chip);
    });
  }

  updatePreview();
}

function makeChip(tok, cls, clickFn) {
  const div = document.createElement('div');
  div.className = `token-chip ${cls}`;
  div.textContent = tok.text;
  div.dataset.id = tok.id;
  div.dataset.token = tok.text;
  div.addEventListener('click', clickFn);
  return div;
}

function moveToAnswer(tok) {
  if (answered) return;
  bankTokens = bankTokens.filter(t => t.id !== tok.id);
  answerTokens.push(tok);
  renderBank();
  renderAnswerArea();
}

function moveToBank(tok, idx) {
  if (answered) return;
  answerTokens.splice(idx, 1);
  bankTokens.push(tok);
  renderBank();
  renderAnswerArea();
}

function clearDrag() {
  if (answered) return;
  // Return all answer tokens to bank
  bankTokens = [...bankTokens, ...answerTokens];
  answerTokens = [];
  renderBank();
  renderAnswerArea();
}

function updatePreview() {
  const preview = document.getElementById('answer-preview');
  if (answerTokens.length === 0) {
    preview.textContent = '—';
  } else {
    preview.textContent = answerTokens.map(t => t.text).join(' ');
  }
}

// ─── Answer Checking ──────────────────────────────────────
function submitAnswer() {
  if (answered) return;
  const q = sessionQuestions[currentIdx];

  let isCorrect = false;

  if (q.type === 'fill') {
    isCorrect = checkFill(q);
  } else {
    isCorrect = checkDrag(q);
  }

  answered = true;
  attempted++;
  levelStats[q.difficulty].total++;

  if (isCorrect) {
    correctCount++;
    levelStats[q.difficulty].correct++;
    const pts = hintUsed ? 5 : 10;
    score += pts;
    showFeedback(true, q, pts);
  } else {
    showFeedback(false, q, 0);
  }

  updateScore();
  updateProgress();

  hide('submit-btn');
  hide('skip-btn');
  hide('hint-btn');
  show('next-btn');
}

function checkFill(q) {
  const inputs = document.querySelectorAll('#fill-body .blank-input');
  if (inputs.length === 0) return false;

  let allCorrect = true;
  inputs.forEach((inp, i) => {
    const userVal = inp.value.trim().toLowerCase();
    const expected = q.answers[i];
    let match = false;

    if (Array.isArray(expected)) {
      match = expected.some(e => userVal === e.toLowerCase());
    } else {
      match = userVal === String(expected).toLowerCase();
    }

    inp.classList.remove('correct-input', 'wrong-input');
    inp.classList.add(match ? 'correct-input' : 'wrong-input');
    if (!match) allCorrect = false;
  });

  return allCorrect;
}

function checkDrag(q) {
  const userArr = answerTokens.map(t => t.text);
  const correctArr = q.answer;
  if (userArr.length !== correctArr.length) return false;
  return userArr.every((t, i) => t.toLowerCase() === correctArr[i].toLowerCase());
}

// ─── Feedback ─────────────────────────────────────────────
function showFeedback(correct, q, pts) {
  const box = document.getElementById('feedback-box');
  box.hidden = false;
  box.className = `feedback-box ${correct ? 'correct' : 'wrong'}`;

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

  box.innerHTML = `
    <div class="fb-title">${correct ? '✅ Correct!' + (pts ? ` +${pts} pts` : '') : '❌ Incorrect'}</div>
    ${q.explanation ? `<div style="margin:.35rem 0 .25rem">${escapeHtml(q.explanation)}</div>` : ''}
    <div class="fb-answer">✓ ${escapeHtml(answerStr)}</div>
    ${q.hint ? `<div style="margin-top:.4rem;font-size:.825rem;opacity:.8">💡 ${escapeHtml(q.hint)}</div>` : ''}
  `;
  box.classList.add('fade-in');
  if (!correct) box.classList.add('shake');

  // Highlight drag answer
  if (q.type === 'drag' && !correct) {
    document.querySelectorAll('.answer-chip').forEach(c => {
      c.style.borderColor = 'var(--error)';
      c.style.background = 'rgba(239,68,68,.15)';
    });
  }
}

// ─── Hint ─────────────────────────────────────────────────
function showHint() {
  const q = sessionQuestions[currentIdx];
  if (!q.hint) return;
  hintUsed = true;
  const box = document.getElementById('hint-box');
  document.getElementById('hint-text').textContent = q.hint;
  box.hidden = false;
}

// ─── Navigation ───────────────────────────────────────────
function nextQuestion() {
  currentIdx++;
  renderQuestion();
}

function skipQuestion() {
  attempted++;
  levelStats[sessionQuestions[currentIdx].difficulty].total++;
  currentIdx++;
  renderQuestion();
}

// ─── Progress & Score ─────────────────────────────────────
function updateProgress() {
  const total = sessionQuestions.length;
  const pct = total > 0 ? (currentIdx / total) * 100 : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = `${currentIdx} / ${total}`;
}

function updateScore() {
  document.getElementById('score-val').textContent = score;
}

// ─── End Screen ───────────────────────────────────────────
function showEndScreen() {
  const acc = attempted > 0 ? Math.round((correctCount / attempted) * 100) : 0;
  document.getElementById('end-score').textContent = score;
  document.getElementById('end-correct').textContent = correctCount;
  document.getElementById('end-total').textContent = attempted;
  document.getElementById('end-acc').textContent = acc + '%';

  const breakdown = document.getElementById('level-results');
  breakdown.innerHTML = '';
  [1,2,3,4,5].forEach(lvl => {
    const st = levelStats[lvl];
    if (st.total === 0) return;
    const a = Math.round((st.correct / st.total) * 100);
    const row = document.createElement('div');
    row.className = 'lvl-result-row';
    row.innerHTML = `
      <span class="lvl-name lp-${lvl}">Level ${lvl}</span>
      <span>${st.correct} / ${st.total} correct</span>
      <span class="lvl-acc">${a}%</span>
    `;
    breakdown.appendChild(row);
  });

  showScreen('end-screen');
}

// ─── Utility ──────────────────────────────────────────────
function show(id) { const el = document.getElementById(id); if (el) el.hidden = false; }
function hide(id) { const el = document.getElementById(id); if (el) el.hidden = true; }

// ─── Boot ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
