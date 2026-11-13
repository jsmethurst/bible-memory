import { store, currentUser, signIn, loadAll, onChange, sb } from './store.js';
import { applyAppearance } from './settings.js';
import { renderHome, renderCollection, renderVerse, renderEdit, renderBulk } from './views.js';
import { renderStats } from './stats.js';
import { renderSettings } from './settingsView.js';
import { renderSession, hasSession, handleChar, handleKey, keytrap, focusKeys } from './practice.js';
import { dueVerses } from './srs.js';
import { initTooltips } from './charts.js';
import { I, toast } from './ui.js';
import { esc } from './text.js';

const app = document.getElementById('app');
const viewEl = document.getElementById('view');
const tabbar = document.getElementById('tabbar');

applyAppearance(store.settings);

/* ---------- login ---------- */

function renderLogin() {
  tabbar.hidden = true;
  viewEl.innerHTML = `
  <main class="login">
    <div class="login-mark">
      <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 12c0-2 1.6-3.5 3.5-3.5H22V40H11.5A3.5 3.5 0 0 1 8 36.5zM40 12c0-2-1.6-3.5-3.5-3.5H26V40h10.5a3.5 3.5 0 0 0 3.5-3.5z"/><path d="M13 16h5M13 21h5M30 16h5M30 21h5" stroke-linecap="round"/></svg>
    </div>
    <h1>Bible Memory</h1>
    <form id="lf" class="form">
      <label class="field"><span>Username</span><input name="u" autocomplete="username" autocapitalize="off" value="jacob" required></label>
      <label class="field"><span>Password</span><input name="p" type="password" autocomplete="current-password" required></label>
      <button class="btn primary wide">Sign in</button>
      <div class="hint center" id="lerr"></div>
    </form>
  </main>`;
  const f = viewEl.querySelector('#lf');
  f.p.focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      await signIn(f.u.value, f.p.value);
      await boot();
    } catch (err) {
      viewEl.querySelector('#lerr').textContent = err.message || 'Could not sign in';
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  };
}

/* ---------- router ---------- */

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
}

let lastRoute = '';
function route() {
  if (!store.user) return renderLogin();
  const { parts, params } = parseHash();
  const [a, b] = parts;
  const routeKey = location.hash;
  const sameRoute = routeKey === lastRoute;
  lastRoute = routeKey;
  const scroll = sameRoute ? window.scrollY : 0;

  app.classList.toggle('in-session', a === 'session');
  tabbar.hidden = a === 'session' || a === 'add' || a === 'edit' || a === 'bulk';

  if (a === 'session') { if (!hasSession()) { location.replace('#/'); return; } renderSession(viewEl); }
  else if (a === 'c') renderCollection(viewEl, b);
  else if (a === 'v') renderVerse(viewEl, b);
  else if (a === 'add') renderEdit(viewEl, null, params);
  else if (a === 'edit') renderEdit(viewEl, b, params);
  else if (a === 'bulk') renderBulk(viewEl, params);
  else if (a === 'stats') renderStats(viewEl);
  else if (a === 'settings') renderSettings(viewEl);
  else if (a === 'review') {
    const due = dueVerses();
    if (due.length) { import('./views.js').then((m) => m.go({ mode: 'review', ids: due.map((v) => v.id) }, '#/session')); return; }
    renderHome(viewEl); toast('Nothing due right now');
  }
  else renderHome(viewEl);

  renderTabs(a || 'home');
  window.scrollTo(0, scroll);
}

function renderTabs(cur) {
  const due = store.user ? dueVerses().length : 0;
  const tab = (key, href, icon, label, badge = '') =>
    `<a href="${href}" class="tab ${cur === key || (key === 'home' && ['home', 'c', 'v'].includes(cur)) ? 'on' : ''}" ${key === 'review' ? 'data-review' : ''}>${icon}<span>${label}</span>${badge}</a>`;
  tabbar.innerHTML = tab('home', '#/', I.home, 'Verses')
    + tab('review', '#/review', I.review, 'Review', due ? `<b class="badge">${due}</b>` : '')
    + tab('stats', '#/stats', I.stats, 'Insights')
    + tab('settings', '#/settings', I.gear, 'Settings');
  // Focus the key trap inside the tap so iOS opens the keyboard.
  tabbar.querySelector('[data-review]').onclick = () => { if (due) focusKeys(); };
}

window.addEventListener('hashchange', route);

// Re-render on data change, but never while typing in a session or a form.
let pending = false;
onChange(() => {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const { parts } = parseHash();
    if (['session', 'add', 'edit', 'bulk', 'settings'].includes(parts[0])) return;
    if (document.querySelector('.sheet-wrap')) return;
    route();
  });
});

/* ---------- keyboard ---------- */

const kt = keytrap();
kt.addEventListener('input', () => {
  const val = kt.value;
  kt.value = '';
  for (const ch of val) handleChar(ch);
});
kt.addEventListener('keydown', (e) => {
  if (handleKey(e)) e.preventDefault();
  else if (e.key === 'Enter') { e.preventDefault(); handleChar('\n'); }
});
// Desktop: typing anywhere goes to the session even if the trap lost focus.
document.addEventListener('keydown', (e) => {
  if (!hasSession() || !location.hash.startsWith('#/session')) return;
  if (document.activeElement === kt) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (handleKey(e)) { e.preventDefault(); return; }
  if (e.key.length === 1) { e.preventDefault(); handleChar(e.key); }
  else if (e.key === 'Enter') { e.preventDefault(); handleChar('\n'); }
});

/* ---------- boot ---------- */

async function boot() {
  const user = await currentUser();
  if (!user) return renderLogin();
  tabbar.hidden = false;
  let rendered = false;
  await loadAll({ onCached: () => { applyAppearance(store.settings); route(); rendered = true; } });
  applyAppearance(store.settings);
  const cur = parseHash().parts[0];
  if (!rendered || !['session', 'add', 'edit', 'bulk'].includes(cur)) route();
}

sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') { store.user = null; route(); }
});

initTooltips(document);
boot().catch((e) => {
  console.error(e);
  viewEl.innerHTML = `<main class="page"><div class="empty"><p>Something went wrong starting up.</p><p class="hint">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Reload</button></div></main>`;
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
