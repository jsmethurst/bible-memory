// Detects a new deployment by watching the app's own files, and offers a reload.
import { pendingCount } from './store.js';
import { hasSession } from './practice.js';

const FILES = ['index.html', 'css/app.css', 'sw.js', 'js/app.js', 'js/store.js', 'js/settings.js', 'js/text.js', 'js/srs.js',
  'js/practice.js', 'js/views.js', 'js/stats.js', 'js/settingsView.js', 'js/charts.js', 'js/ui.js', 'js/config.js', 'js/update.js'];
const EVERY_MS = 30000;

let baseline = null;
let ready = false;

async function snapshot() {
  const out = {};
  await Promise.all(FILES.map(async (f) => {
    try {
      const r = await fetch(`${f}?_=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
      if (!r.ok) return;
      out[f] = r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length');
    } catch {}
  }));
  return out;
}

function changed(a, b) {
  return Object.keys(a).some((k) => k in b && a[k] && b[k] && a[k] !== b[k]);
}

function banner() {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.innerHTML = '<span>A new version is available</span><button>Reload</button>';
  bar.querySelector('button').onclick = reload;
  document.getElementById('app').appendChild(bar);
}

function reload() {
  navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {}).finally(() => location.reload());
}

// Safe moments to reload without interrupting typing or losing unsent edits.
function safeNow() {
  const route = location.hash.replace(/^#\/?/, '').split('/')[0];
  return !hasSession() && !['add', 'edit', 'bulk', 'session'].includes(route) && pendingCount() === 0;
}

let stale = false;
async function check() {
  if (!ready || document.hidden) return;
  const now = await snapshot();
  if (!Object.keys(now).length) return;
  if (changed(baseline, now)) { stale = true; banner(); }
}

export async function startUpdateWatch() {
  baseline = await snapshot();
  ready = Object.keys(baseline).length > 0;
  setInterval(check, EVERY_MS);
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    await check();
    // Coming back to the app after a deploy: refresh straight away if nothing is in progress.
    if (stale && safeNow()) reload();
  });
  window.addEventListener('focus', check);
}
