// Offline support. App files: served from cache, refreshed in the background.
// Trip data: network first so updates arrive, cache when offline.
// Photos: cached once, kept forever.

const CACHE = 'sri-lanka-v2';
const PHOTOS = 'sri-lanka-photos';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'crypto.js',
  'places.js',
  'notes.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'data/trip.enc.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== PHOTOS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function fresh(req) {
  const res = await fetch(req, { cache: 'no-cache' });
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.endsWith('/data/trip.enc.json')) {
    e.respondWith(fresh(e.request).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }

  // Encrypted photos never change (their name is a content hash): cache forever.
  if (url.pathname.includes('/data/img/')) {
    e.respondWith(caches.open(PHOTOS).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  const key = e.request.mode === 'navigate' ? new Request('./') : e.request;
  e.respondWith(
    caches.match(key, { ignoreSearch: true }).then((hit) => {
      const update = fresh(key).catch(() => hit);
      if (hit) { e.waitUntil(update); return hit; }
      return update;
    }),
  );
});
