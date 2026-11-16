// Service worker do painel: só arquivos estáticos e a página offline. Páginas com dados nunca vão para o cache.
const V = 'trackify-1';
const ASSETS = ['/offline.html', '/favicon.svg', '/icons/apple-touch-icon.png', '/icons/maskable.svg', '/fonts/figtree.woff2', '/fonts/bricolage-grotesque.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (r.mode === 'navigate') return e.respondWith(fetch(r).catch(() => caches.match('/offline.html')));
  if (/^\/(fonts|icons)\/|^\/favicon\.svg$/.test(u.pathname)) e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); } return res; })));
});
