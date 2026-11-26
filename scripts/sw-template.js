const scope = self.registration.scope;
const prefix = 'mft-shell:' + scope + ':';
const shell = prefix + '__VERSION__';
const demos = 'mft-demos:' + scope;
const files = /* SHELL_FILES */ [];
const absolute = (path) => new URL(path, scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(shell)
      .then((cache) => cache.addAll(files.map((path) => new Request(absolute(path), { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(prefix) && name !== shell) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(scope)) return;
  const relative = new URL(req.url).pathname.slice(new URL(scope).pathname.length);
  // Committed weekly templates are available offline on days with no cached dated workout.
  if (relative.startsWith('data/') && !relative.startsWith('data/weekly/')) return;
  const appPage =
    req.mode === 'navigate' && (relative.endsWith('.html') || !relative.split('/').at(-1).includes('.'));
  if (appPage || files.includes(relative)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(shell);
        return (
          (await cache.match(appPage ? absolute('index.html') : req, { ignoreSearch: true })) || fetch(req)
        );
      })(),
    );
  } else if (/^demos\/.*\.(gif|webp|png|jpe?g|avif)$/i.test(relative)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(demos);
        const hit = await cache.match(req);
        if (hit) return hit;
        const response = await fetch(req);
        if (response.ok && response.headers.get('Content-Type')?.startsWith('image/'))
          await cache.put(req, response.clone());
        return response;
      })(),
    );
  }
});
