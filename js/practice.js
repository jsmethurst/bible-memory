// The core typing engine: first-letter typing over three steps, plus review.
import { store, patchVerse, recordAttempt } from './store.js';
import { tokenize, esc } from './text.js';
import { allowedMistakes, scheduleReview, masterPatch, isDue, wordHeat, shuffle } from './srs.js';

let session = null;
let view = null;
let timer = null;

export const keytrap = () => document.getElementById('keytrap');
export function focusKeys() { const k = keytrap(); if (k) { k.value = ''; k.focus({ preventScroll: true }); } }

// mode: learn | review | practice
export function startSession({ mode, ids, step = null, title = '' }) {
  if (!ids.length) return false;
  session = { mode, queue: ids.slice(), i: 0, fixedStep: step, title, results: [], requeued: new Set(), started: Date.now() };
  return true;
}
export function hasSession() { return !!session; }
export function endSession() { session = null; clearTimeout(timer); }

function verseById(id) { return store.verses.find((v) => v.id === id); }

function stepFor(v) {
  if (session.fixedStep) return session.fixedStep;
  if (session.mode === 'learn') return Math.min(3, (v.stage || 0) + 1);
  return 3;
}

function hiddenSet(n, step) {
  const s = store.settings;
  const hide = new Set();
  if (step === 3 || step === 'review') { for (let i = 0; i < n; i++) hide.add(i); }
  else if (step === 2) {
    if (s.step2Pattern === 'random') {
      const idx = shuffle([...Array(n).keys()]);
      idx.slice(0, Math.round((n * s.step2Percent) / 100)).forEach((i) => hide.add(i));
    } else {
      for (let i = 1; i < n; i += 2) hide.add(i);
    }
  }
  return hide;
}

/* ---------- rendering ---------- */

export function renderSession(el) {
  view = el;
  if (!session) { location.hash = '#/'; return; }
  if (session.i >= session.queue.length) return renderSummary();
  const v = verseById(session.queue[session.i]);
  if (!v) { session.i++; return renderSession(el); }
  beginAttempt(v, stepFor(v));
}

function beginAttempt(v, step) {
  const s = store.settings;
  const words = tokenize(v.text);
  const attempt = session.cur = {
    v, step, words, hidden: hiddenSet(words.length, step), pos: 0,
    state: new Array(words.length).fill(0), // 0 todo, 1 ok, 2 miss
    missed: new Set(), startedAt: null, done: false, heat: false,
  };
  const total = session.queue.length;
  const showSteps = session.mode === 'learn' || session.fixedStep;
  const modeLabel = session.mode === 'review' ? 'Review' : session.mode === 'practice' ? `Practice · Step ${step}` : `Step ${step} of 3`;
  view.innerHTML = `
  <div class="practice" data-step="${step}">
    <header class="pbar">
      <button class="icon-btn" data-act="close" aria-label="Close">${ICON.x}</button>
      <div class="ptitle">
        <div class="pmode">${esc(modeLabel)}</div>
        ${showSteps ? `<div class="pdots">${[1, 2, 3].map((n) => `<i class="${n < step ? 'done' : n === step ? 'cur' : ''}"></i>`).join('')}</div>`
          : `<div class="pcount">${session.i + 1} / ${total}</div>`}
      </div>
      <button class="icon-btn" data-act="hint" aria-label="Reveal word">${ICON.hint}</button>
    </header>
    ${s.showProgressBar ? `<div class="pprog"><i style="width:${(session.i / total) * 100}%"></i></div>` : '<div class="pprog off"></div>'}
    <div class="parea">
      <div class="pref ${s.showReference ? '' : 'invisible'}">${esc(v.reference)}</div>
      <div class="verse hs-${s.hiddenStyle}" id="verse">${words.map((w, i) =>
        `<span class="w${attempt.hidden.has(i) ? ' hid' : ''}" data-i="${i}">${esc(w.text)}</span>${w.sep ? ' ' : ''}`).join('')}</div>
      <div class="result" id="result"></div>
    </div>
    <div class="ptap" data-act="focus"><span>Tap here if the keyboard is hidden</span></div>
  </div>`;
  view.querySelector('.practice').addEventListener('click', onClick);
  paint();
  focusKeys();
}

function paint() {
  const a = session.cur;
  const spans = view.querySelectorAll('#verse .w');
  const heat = a.heat ? wordHeat(a.v).rates : null;
  spans.forEach((sp, i) => {
    sp.classList.toggle('ok', a.state[i] === 1);
    sp.classList.toggle('miss', a.state[i] === 2);
    sp.classList.toggle('cur', !a.done && i === a.pos && store.settings.showCursor);
    if (heat) {
      sp.classList.add('heated');
      sp.style.setProperty('--heat', heat[i].toFixed(3));
    } else { sp.classList.remove('heated'); sp.style.removeProperty('--heat'); }
  });
}

/* ---------- input ---------- */

export function handleChar(ch) {
  if (!session?.cur) return;
  const a = session.cur;
  if (a.done) {
    if (ch === '\n' || ch === ' ') continueAfter();
    return;
  }
  const c = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!/^[a-z0-9]$/.test(c)) return;
  if (!a.startedAt) a.startedAt = Date.now();
  const w = a.words[a.pos];
  if (c === w.key) {
    if (a.state[a.pos] !== 2) a.state[a.pos] = 1;
    advance();
  } else {
    miss();
    if (store.settings.wrongLetter === 'reveal') advance();
    else { a.state[a.pos] = 2; paint(); shake(a.pos); }
  }
}

export function handleKey(e) {
  if (!session?.cur) return false;
  if (e.key === 'Escape') { close(); return true; }
  if (e.key === 'Enter' && session.cur.done) { continueAfter(); return true; }
  return false;
}

function miss() {
  const a = session.cur;
  a.missed.add(a.pos);
  a.state[a.pos] = 2;
  feedback();
}

function advance() {
  const a = session.cur;
  a.pos++;
  if (a.pos >= a.words.length) finish();
  paint();
}

function hint() {
  const a = session.cur;
  if (!a || a.done) return;
  if (!a.startedAt) a.startedAt = Date.now();
  miss();
  advance();
}

function shake(i) {
  const sp = view.querySelector(`#verse .w[data-i="${i}"]`);
  sp?.classList.remove('shake'); void sp?.offsetWidth; sp?.classList.add('shake');
}

let audioCtx;
function feedback() {
  const s = store.settings;
  if (s.vibrate && navigator.vibrate) navigator.vibrate(25);
  if (s.sound) {
    try {
      audioCtx = audioCtx || new AudioContext();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 180; o.type = 'triangle';
      g.gain.setValueAtTime(0.08, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
      o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.16);
    } catch {}
  }
}

/* ---------- finishing ---------- */

function finish() {
  const a = session.cur;
  const s = store.settings;
  a.done = true;
  const n = a.words.length;
  const mistakes = a.missed.size;
  const allowed = allowedMistakes(n);
  const passed = (a.step === 1 && !s.step1Strict) ? true : mistakes <= allowed;
  const duration = a.startedAt ? Date.now() - a.startedAt : 0;
  const kind = session.mode === 'review' || (session.mode === 'practice' && a.step === 3 && isDue(a.v)) ? 'review'
    : `learn${a.step}`;
  recordAttempt({ verse_id: a.v.id, kind, words: n, mistakes, missed: [...a.missed].sort((x, y) => x - y), passed, duration_ms: duration });

  // progress changes
  const v = a.v;
  let note = '';
  if (session.mode === 'learn' && passed && !session.fixedStep) {
    if (a.step < 3) patchVerse(v.id, { stage: Math.max(v.stage, a.step) });
    else if (v.stage < 3) { patchVerse(v.id, masterPatch()); note = 'Mastered. First review tomorrow.'; }
  } else if (kind === 'review' && !session.requeued.has(v.id) && v.stage >= 3) {
    const patch = scheduleReview(v, mistakes, passed);
    patchVerse(v.id, patch);
    if (patch.stage === 2) note = 'Moved back to step 3 to relearn.';
    else if (patch.due_at) note = `Next review in ${Math.round(patch.interval_days)} day${Math.round(patch.interval_days) === 1 ? '' : 's'}.`;
    if (!passed && s.requeueFailed && patch.stage !== 2) { session.requeued.add(v.id); session.queue.push(v.id); }
  }
  a.passed = passed;
  session.results.push({ id: v.id, step: a.step, mistakes, words: n, passed, duration });

  const acc = Math.round(((n - mistakes) / n) * 100);
  const head = passed ? (mistakes === 0 ? 'Perfect' : 'Passed') : 'Try again';
  const sub = `${acc}% accuracy · ${fmtDur(duration)}`;
  const nextLabel = !passed && session.mode === 'learn' ? 'Retry' : nextIsSameVerse() ? `Step ${a.step + 1}` : isLast() ? 'Finish' : 'Next';
  const res = view.querySelector('#result');
  res.innerHTML = `
    <div class="res ${passed ? 'pass' : 'fail'}">
      <div class="res-head">${esc(head)}</div>
      <div class="res-sub">${esc(sub)}${note ? `<br>${esc(note)}` : ''}</div>
      <div class="res-actions">
        ${passed || session.mode !== 'learn' ? `<button class="btn ghost" data-act="retry">Retry</button>` : ''}
        ${wordHeat(v).total > 1 ? `<button class="btn ghost" data-act="heat">Heatmap</button>` : ''}
        <button class="btn primary" data-act="next">${esc(nextLabel)}</button>
      </div>
    </div>`;
  if (passed && s.autoAdvance && session.mode === 'learn' && nextIsSameVerse()) {
    res.querySelector('.res').classList.add('auto');
    res.querySelector('.res').style.setProperty('--dur', s.autoAdvanceDelay + 'ms');
    timer = setTimeout(continueAfter, s.autoAdvanceDelay);
  }
  if (s.showHeatmapAfter && !passed && wordHeat(v).total > 2) { a.heat = true; }
}

function nextIsSameVerse() {
  const a = session.cur;
  return session.mode === 'learn' && !session.fixedStep && a.passed && a.step < 3;
}
function isLast() { return session.i >= session.queue.length - 1; }

function continueAfter() {
  clearTimeout(timer);
  const a = session.cur;
  if (!a?.done) return;
  if (session.mode === 'learn' && !a.passed) return beginAttempt(verseById(a.v.id), a.step);
  if (nextIsSameVerse()) return beginAttempt(verseById(a.v.id), a.step + 1);
  session.i++;
  renderSession(view);
}

function onClick(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'close') return close();
  if (act === 'hint') { hint(); focusKeys(); return; }
  if (act === 'next') { continueAfter(); focusKeys(); return; }
  if (act === 'retry') { clearTimeout(timer); beginAttempt(verseById(session.cur.v.id), session.cur.step); return; }
  if (act === 'heat') { session.cur.heat = !session.cur.heat; paint(); return; }
  focusKeys();
}

function close() {
  endSession();
  keytrap()?.blur();
  history.length > 1 ? history.back() : (location.hash = '#/');
}

function renderSummary() {
  const r = session.results;
  const words = r.reduce((s, x) => s + x.words, 0), miss = r.reduce((s, x) => s + x.mistakes, 0);
  const verses = new Set(r.map((x) => x.id)).size;
  const passed = r.filter((x) => x.passed).length;
  const ms = Date.now() - session.started;
  keytrap()?.blur();
  view.innerHTML = `
  <div class="practice summary">
    <header class="pbar"><span></span><div class="ptitle"><div class="pmode">Session complete</div></div><span></span></header>
    <div class="parea">
      <div class="sum-big">${verses}</div>
      <div class="sum-cap">verse${verses === 1 ? '' : 's'} ${session.mode === 'review' ? 'reviewed' : 'practiced'}</div>
      <div class="tiles three">
        <div class="tile"><b>${words ? Math.round(((words - miss) / words) * 100) : 100}%</b><span>accuracy</span></div>
        <div class="tile"><b>${passed}/${r.length}</b><span>passed</span></div>
        <div class="tile"><b>${fmtDur(ms)}</b><span>time</span></div>
      </div>
      <button class="btn primary wide" data-act="done">Done</button>
    </div>
  </div>`;
  view.querySelector('[data-act="done"]').onclick = () => { endSession(); location.hash = '#/'; };
  session.cur = null;
}

export function fmtDur(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const ICON = {
  x: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  hint: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/></svg>',
};
