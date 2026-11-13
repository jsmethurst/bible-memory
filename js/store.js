// Data layer: Supabase client, local cache, and an outbox so practice never waits on the network.
import { SUPABASE_URL, SUPABASE_KEY, EMAIL_DOMAIN } from './config.js';
import { DEFAULTS, loadLocalSettings, saveLocalSettings } from './settings.js';
import { parseReference } from './text.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bm.auth' },
});

export const store = {
  user: null,
  collections: [],
  verses: [],
  attempts: [],
  settings: loadLocalSettings(),
  online: true,
  listeners: new Set(),
};

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16);
  }));

export function onChange(fn) { store.listeners.add(fn); return () => store.listeners.delete(fn); }
function emit() { for (const fn of store.listeners) fn(); }

/* ---------- auth ---------- */

export async function currentUser() {
  const { data } = await sb.auth.getSession();
  store.user = data.session?.user || null;
  return store.user;
}

export async function signIn(username, password) {
  const email = username.includes('@') ? username.trim() : `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  store.user = data.user;
  return data.user;
}

export async function signOut() {
  await sb.auth.signOut();
  try { localStorage.removeItem(cacheKey()); localStorage.removeItem(outboxKey()); } catch {}
  store.user = null;
}

/* ---------- local cache ---------- */

const cacheKey = () => `bm.cache.${store.user?.id}`;
const outboxKey = () => `bm.outbox.${store.user?.id}`;

function packAttempt(a) {
  return [a.verse_id, a.kind, a.words, a.mistakes, a.missed, a.passed ? 1 : 0, a.duration_ms, a.created_at];
}
function unpackAttempt(p) {
  return { verse_id: p[0], kind: p[1], words: p[2], mistakes: p[3], missed: p[4], passed: !!p[5], duration_ms: p[6], created_at: p[7] };
}

function saveCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({
      collections: store.collections, verses: store.verses, attempts: store.attempts.map(packAttempt), at: Date.now(),
    }));
  } catch (e) { console.warn('cache save failed', e); }
}

function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey()));
    if (!c) return false;
    store.collections = c.collections || [];
    store.verses = c.verses || [];
    store.attempts = (c.attempts || []).map(unpackAttempt);
    return true;
  } catch { return false; }
}

/* ---------- outbox ---------- */

let outbox = [];
let flushing = false;

function loadOutbox() { try { outbox = JSON.parse(localStorage.getItem(outboxKey())) || []; } catch { outbox = []; } }
function saveOutbox() { try { localStorage.setItem(outboxKey(), JSON.stringify(outbox)); } catch {} }

function enqueue(op) { outbox.push(op); saveOutbox(); flush(); }

export function pendingCount() { return outbox.length; }

export async function flush() {
  if (flushing || !store.user) return;
  flushing = true;
  try {
    while (outbox.length) {
      const op = outbox[0];
      let res;
      if (op.op === 'upsert') res = await sb.from(op.table).upsert(op.row);
      else if (op.op === 'insert') res = await sb.from(op.table).insert(op.row);
      else if (op.op === 'delete') res = await sb.from(op.table).delete().eq(op.key || 'id', op.id);
      else if (op.op === 'deleteWhere') res = await sb.from(op.table).delete().eq(op.col, op.val);
      if (res.error) {
        // Constraint errors will never succeed; drop them instead of blocking the queue forever.
        if (res.error.code && /^(22|23|42)/.test(res.error.code)) { console.error('dropping op', op, res.error); outbox.shift(); saveOutbox(); continue; }
        throw res.error;
      }
      outbox.shift();
      saveOutbox();
    }
    setOnline(true);
  } catch (e) {
    console.warn('sync paused', e);
    setOnline(false);
  } finally {
    flushing = false;
  }
}

function setOnline(v) { if (store.online !== v) { store.online = v; emit(); } }

window.addEventListener('online', () => flush());
setInterval(() => { if (outbox.length) flush(); }, 30000);

/* ---------- loading ---------- */

async function fetchAll(table, select, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).order(order, { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function loadAll({ onCached } = {}) {
  loadOutbox();
  if (loadCache()) onCached?.();
  await flush();
  if (outbox.length) return; // offline; keep cache
  try {
    const [collections, verses, attempts, settingsRows] = await Promise.all([
      fetchAll('collections', '*', 'position'),
      fetchAll('verses', '*', 'position'),
      fetchAll('attempts', 'verse_id,kind,words,mistakes,missed,passed,duration_ms,created_at', 'created_at'),
      sb.from('settings').select('data').maybeSingle(),
    ]);
    store.collections = collections;
    store.verses = verses;
    store.attempts = attempts;
    if (settingsRows.data?.data) {
      store.settings = { ...DEFAULTS, ...settingsRows.data.data };
      saveLocalSettings(store.settings);
    }
    saveCache();
    setOnline(true);
  } catch (e) {
    console.warn('load failed, using cache', e);
    setOnline(false);
  }
}

/* ---------- mutations ---------- */

let settingsTimer;
export function updateSettings(patch) {
  store.settings = { ...store.settings, ...patch };
  saveLocalSettings(store.settings);
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    // collapse queued settings writes into one
    outbox = outbox.filter((o) => o.table !== 'settings');
    enqueue({ op: 'upsert', table: 'settings', row: { user_id: store.user.id, data: store.settings, updated_at: new Date().toISOString() } });
  }, 600);
  emit();
}

function verseRowForServer(v) {
  const { _local, ...row } = v;
  return row;
}

export function saveVerse(v) {
  const now = new Date().toISOString();
  const parsed = parseReference(v.reference);
  const existing = v.id && store.verses.find((x) => x.id === v.id);
  const row = existing ? { ...existing, ...v } : {
    id: uuid(), user_id: store.user.id, collection_id: null, stage: 0, ease: store.settings.startEase,
    interval_days: 0, due_at: null, reps: 0, lapses: 0, last_reviewed_at: null, mastered_at: null,
    created_at: now, position: nextPosition(v.collection_id), ...v,
  };
  if (parsed) { row.book = parsed.book; row.chapter = parsed.chapter; row.verse = parsed.verse; }
  row.updated_at = now;
  if (existing) Object.assign(existing, row); else store.verses.push(row);
  saveCache();
  enqueue({ op: 'upsert', table: 'verses', row: verseRowForServer(row) });
  emit();
  return row;
}

export function patchVerse(id, patch) {
  const v = store.verses.find((x) => x.id === id);
  if (!v) return;
  Object.assign(v, patch, { updated_at: new Date().toISOString() });
  saveCache();
  enqueue({ op: 'upsert', table: 'verses', row: verseRowForServer(v) });
  emit();
}

export function deleteVerse(id) {
  store.verses = store.verses.filter((v) => v.id !== id);
  store.attempts = store.attempts.filter((a) => a.verse_id !== id);
  saveCache();
  enqueue({ op: 'delete', table: 'verses', id });
  emit();
}

function nextPosition(collectionId) {
  const list = store.verses.filter((v) => (v.collection_id || null) === (collectionId || null));
  return list.length ? Math.max(...list.map((v) => v.position || 0)) + 1 : 0;
}

export function saveCollection(c) {
  const existing = c.id && store.collections.find((x) => x.id === c.id);
  const row = existing ? { ...existing, ...c } : {
    id: uuid(), user_id: store.user.id, color: null, created_at: new Date().toISOString(),
    position: store.collections.length ? Math.max(...store.collections.map((x) => x.position || 0)) + 1 : 0, ...c,
  };
  if (existing) Object.assign(existing, row); else store.collections.push(row);
  saveCache();
  enqueue({ op: 'upsert', table: 'collections', row });
  emit();
  return row;
}

export function deleteCollection(id, { withVerses = false } = {}) {
  store.collections = store.collections.filter((c) => c.id !== id);
  if (withVerses) {
    for (const v of store.verses.filter((v) => v.collection_id === id)) deleteVerse(v.id);
  } else {
    store.verses.forEach((v) => { if (v.collection_id === id) v.collection_id = null; });
  }
  saveCache();
  enqueue({ op: 'delete', table: 'collections', id });
  emit();
}

export function recordAttempt(a) {
  const row = { user_id: store.user.id, created_at: new Date().toISOString(), ...a };
  store.attempts.push(row);
  saveCache();
  enqueue({ op: 'insert', table: 'attempts', row });
  emit();
  return row;
}

export function resetVerseProgress(id) {
  patchVerse(id, {
    stage: 0, ease: store.settings.startEase, interval_days: 0, due_at: null, reps: 0, lapses: 0,
    last_reviewed_at: null, mastered_at: null,
  });
}

/* ---------- import / export ---------- */

export function exportData() {
  return {
    exported_at: new Date().toISOString(),
    collections: store.collections, verses: store.verses, attempts: store.attempts, settings: store.settings,
  };
}

export function importData(data) {
  const idMap = new Map();
  for (const c of data.collections || []) {
    const row = saveCollection({ name: c.name, color: c.color });
    idMap.set(c.id, row.id);
  }
  const vMap = new Map();
  for (const v of data.verses || []) {
    const { id, user_id, collection_id, ...rest } = v;
    const row = saveVerse({ ...rest, collection_id: idMap.get(collection_id) || null });
    vMap.set(id, row.id);
  }
  for (const a of data.attempts || []) {
    const vid = vMap.get(a.verse_id);
    if (!vid) continue;
    const { id, user_id, verse_id, ...rest } = a;
    recordAttempt({ ...rest, verse_id: vid });
  }
}
