// Detects a new deployment by fingerprinting the app's own files, and offers a reload.
import { pendingCount } from './store.js';
import { hasSession } from './practice.js';

const FILES = ['index.html', 'css/app.css', 'sw.js', 'js/app.js', 'js/store.js', 'js/settings.js', 'js/text.js', 'js/srs.js',
  'js/practice.js', 'js/views.js', 'js/stats.js', 'js/settingsView.js', 'js/charts.js', 'js/ui.js', 'js/config.js', 'js/update.js'];
const EVERY_MS = 30000;
const GUARD_KEY = 'bm.autoReloadAt';

let baseline = null;
let stale = false;

function hash(str) { // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

// Fingerprint of the file contents, so CDN header differences can't cause false alarms.
// Returns null if any file couldn't be read (offline, mid-deploy), which is treated as "no answer".
async function fingerprint() {
  try {
    const parts = await Promise.all(FILES.map(async (f) => {
      const r = await fetch(f, { cache: 'no-cache' });
      if (!r.ok) throw new Error(f);
      return hash(await r.text());
    }));
    return hash(parts.join('|'));
  } catch { return null; }
}

function banner() {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.innerHTML = '<span>A new version is available</span><button>Reload</button>';
  bar.querySelector('button').onclick = () => reload(false);
  document.getElementById('app').appendChild(bar);
}

function reload(auto) {
  try { if (auto) sessionStorage.setItem(GUARD_KEY, String(Date.now())); } catch {}
  location.reload();
}

// Reloading automatically is only OK when nothing is in progress, and never twice in a row.
function safeNow() {
  const route = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (hasSession() || ['add', 'edit', 'bulk', 'session'].includes(route) || pendingCount() > 0) return false;
  try { if (Date.now() - Number(sessionStorage.getItem(GUARD_KEY) || 0) < 5 * 60000) return false; } catch {}
  return true;
}

async function check() {
  if (baseline == null || document.hidden) return;
  const now = await fingerprint();
  if (now && now !== baseline) { stale = true; banner(); }
}

export async function startUpdateWatch() {
  baseline = await fingerprint();
  setInterval(check, EVERY_MS);
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    await check();
    if (stale && safeNow()) reload(true);
  });
  window.addEventListener('focus', check);
}
