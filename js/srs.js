// Spaced repetition and day helpers.
import { store, orderedCollections } from './store.js';
import { wordCount, bookIndex } from './text.js';

export const DAY = 86400000;

// The app's day always follows Istanbul time (UTC+3, no daylight saving), whatever the device clock says.
const IST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });
export function dayKey(d) { return IST.format(new Date(d)); }
export function startOfDay(d = new Date()) { return new Date(`${dayKey(d)}T00:00:00+03:00`); }
export function endOfToday() { const x = startOfDay(); return new Date(x.getTime() + DAY - 1); }
export function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }

export function allowedMistakes(words, s = store.settings) {
  return words >= s.longVerseWords ? s.mistakesLong : s.mistakesShort;
}

export function stageLabel(v) {
  if (v.stage >= 3) return 'Mastered';
  if (v.stage === 2) return 'Step 3';
  if (v.stage === 1) return 'Step 2';
  return 'New';
}

// Due is decided by calendar day, not time of day: everything scheduled for today (or earlier,
// if overdue) is due from the moment the day starts until it is reviewed.
export function isDue(v, now = new Date()) {
  return v.stage >= 3 && !!v.due_at && dayKey(v.due_at) <= dayKey(now);
}

export function dueVerses() {
  const s = store.settings;
  let list = store.verses.filter((v) => isDue(v));
  if (s.reviewOrder === 'random') list = shuffle(list);
  else if (s.reviewOrder === 'canonical') list.sort(canonicalCmp);
  else if (s.reviewOrder === 'collection') list.sort(collectionCmp);
  else list.sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  return list.slice(0, s.reviewLimit);
}

export function canonicalCmp(a, b) {
  const ba = bookIndex(a.book), bb = bookIndex(b.book);
  return (ba < 0 ? 999 : ba) - (bb < 0 ? 999 : bb) || (a.chapter || 0) - (b.chapter || 0) || (a.verse || 0) - (b.verse || 0)
    || a.reference.localeCompare(b.reference);
}
function collectionCmp(a, b) {
  const order = orderedCollections().map((c) => c.id);
  const pos = (id) => { const i = order.indexOf(id); return i < 0 ? 1e9 : i; };
  return pos(a.collection_id) - pos(b.collection_id) || (a.position || 0) - (b.position || 0);
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 12:01 a.m. Istanbul time on the day that is `days` days from `from`.
function dueMorning(from, days) {
  return new Date(startOfDay(new Date(from.getTime() + Math.round(days) * DAY)).getTime() + 60000);
}

// Called when a mastered verse is reviewed. Returns the patch to apply.
export function scheduleReview(v, mistakes, passed) {
  const s = store.settings;
  const now = new Date();
  let { ease, interval_days: interval, reps, lapses } = v;
  ease = ease || s.startEase;
  if (!passed) {
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    if (s.failAction === 'relearn') {
      return { stage: 2, ease, interval_days: 0, reps: 0, lapses, due_at: null, last_reviewed_at: now.toISOString() };
    }
    interval = s.firstInterval;
    reps = 0;
  } else {
    if (reps === 0) interval = s.firstInterval;
    else if (reps === 1) interval = s.secondInterval;
    else interval = interval * ease * s.intervalModifier;
    if (mistakes === 0) ease = Math.min(3.2, ease + 0.1);
    else ease = Math.max(1.3, ease - 0.05 * mistakes);
    if (s.fuzz && interval > 3) interval *= 0.95 + Math.random() * 0.1;
    interval = Math.min(s.maxInterval, Math.max(1, interval));
    reps += 1;
  }
  const due = dueMorning(now, interval);
  return { ease, interval_days: interval, reps, lapses, due_at: due.toISOString(), last_reviewed_at: now.toISOString() };
}

// Called when step 3 of learning is passed.
export function masterPatch() {
  const s = store.settings;
  const due = dueMorning(new Date(), s.firstInterval);
  return {
    stage: 3, reps: 0, interval_days: s.firstInterval, ease: store.settings.startEase,
    due_at: due.toISOString(), mastered_at: new Date().toISOString(), last_reviewed_at: new Date().toISOString(),
  };
}

/* ---------- stats helpers ---------- */

export function activityByDay() {
  const m = new Map();
  for (const a of store.attempts) {
    const k = dayKey(a.created_at);
    const e = m.get(k) || { count: 0, passed: 0, learn: 0, review: 0, words: 0, mistakes: 0, ms: 0, verses: new Set() };
    e.count++;
    if (a.passed) e.passed++;
    if (a.kind === 'review') e.review++; else e.learn++;
    e.words += a.words; e.mistakes += a.mistakes; e.ms += Math.min(a.duration_ms || 0, 10 * 60000);
    e.verses.add(a.verse_id);
    m.set(k, e);
  }
  return m;
}

export function streaks(byDay = activityByDay()) {
  let current = 0, longest = 0, run = 0;
  const keys = [...byDay.keys()].filter((k) => byDay.get(k).passed > 0).sort();
  let prev = null;
  for (const k of keys) {
    const d = new Date(k + 'T12:00:00+03:00');
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  if (prev) {
    const gap = daysBetween(prev, new Date());
    current = gap <= 1 ? run : 0;
  }
  return { current, longest, practicedToday: byDay.get(dayKey(new Date()))?.passed > 0 };
}

// Verses successfully reviewed today (does not count learning steps).
export function reviewedToday() {
  const k = dayKey(new Date());
  return new Set(store.attempts.filter((a) => a.kind === 'review' && a.passed && dayKey(a.created_at) === k).map((a) => a.verse_id)).size;
}

// Miss rate per word index for a verse, using attempts that match the current word count.
export function wordHeat(v) {
  const n = wordCount(v.text);
  const counts = new Array(n).fill(0);
  let total = 0;
  for (const a of store.attempts) {
    if (a.verse_id !== v.id || a.words !== n) continue;
    total++;
    for (const i of a.missed || []) if (i < n) counts[i]++;
  }
  return { rates: counts.map((c) => (total ? c / total : 0)), counts, total };
}
