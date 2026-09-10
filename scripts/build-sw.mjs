import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const files=['index.html','manifest.json'];
for(const directory of ['assets','icons'])for(const file of await readdir(`build/${directory}`)) {
  if(!file.endsWith('.map'))files.push(`${directory}/${file}`);
}
files.sort();
const hash=createHash('sha256');
for(const file of files){hash.update(file);hash.update(await readFile(`build/${file}`));}
const version=hash.digest('hex').slice(0,16);
await writeFile('build/sw.js', `
const CACHE = 'graviwar-${version}';
const FILES = ${JSON.stringify(files)};
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
`);
console.log(`Offline app cached: ${files.length} files (${version})`);
