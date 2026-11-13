// Always revalidates with the server (Pages caches for 10 min) so a reload after a deploy gets the new files.
// Network-first app shell cache so the app opens offline. Supabase calls are never cached.
const CACHE = 'bm-shell-v7';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/store.js', 'js/settings.js', 'js/text.js', 'js/srs.js',
  'js/practice.js', 'js/views.js', 'js/stats.js', 'js/settingsView.js', 'js/update.js', 'js/charts.js', 'js/ui.js', 'js/config.js',
  'js/vendor/supabase.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.host.endsWith('fonts.googleapis.com') || url.host.endsWith('fonts.gstatic.com');
  if (!sameOrigin && !fonts) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
