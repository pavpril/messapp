// Service worker: приложение работает офлайн.
// При изменении файлов интерфейса увеличьте VERSION, чтобы обновить кэш у пользователей.
const VERSION = 'v1';
const CACHE = 'msgapp-' + VERSION;
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/i18n.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'data/index.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Данные (сообщения): сначала сеть, чтобы обновления сразу появлялись; без сети — из кэша.
  if (new URL(req.url).pathname.includes('/data/')) {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // Интерфейс: сначала кэш, в фоне обновляем.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
