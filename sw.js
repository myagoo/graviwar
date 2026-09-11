
const CACHE = 'graviwar-22fdba160a3dfb9d';
const FILES = ["assets/home-logo-VmCoTE0b.png","assets/index-DI1fbUxw.js","assets/index-GeeqySl1.css","icons/apple-touch-icon-black.png","icons/favicon-32-black.png","icons/icon-192-black.png","icons/icon-512-black.png","icons/maskable-512-black.png","index.html","manifest.json"];
const urls = FILES.map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('graviwar-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url), scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(new URL('index.html', scope).href)));
  } else if (urls.includes(url.origin + url.pathname)) {
    event.respondWith(caches.match(url.origin + url.pathname).then(cached => cached || fetch(request)));
  }
});
