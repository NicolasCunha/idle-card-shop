// Service worker: lets the game install as an app and run offline.
// Game files: network first (updates show up on the next load), cache as
// fallback. Card images: cache first, kept across versions.
const VERSION = 'v13';
const SHELL = `shell-${VERSION}`;
const IMAGES = 'images-v1';
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/audio.js', 'js/cards.js', 'js/data.js', 'js/format.js', 'js/game.js', 'js/main.js',
  'js/achievements.js', 'js/clock.js', 'js/debug.js', 'js/market.js', 'js/opening.js', 'js/save.js', 'js/scene.js', 'js/strings.js', 'js/supply.js', 'js/tutorial.js', 'js/ui.js',
  'data/tutorial.json', 'data/news.json', 'data/accessories.json', 'collections.json', 'icons/icon-192.png', 'icons/icon-512.png',
  'images/sprites/customer-1.png', 'images/sprites/customer-2.png', 'images/sprites/customer-3.png',
  'images/sprites/customer-4.png', 'images/sprites/customer-5.png', 'images/sprites/customer-6.png',
  'images/sprites/customer-7.png', 'images/sprites/customer-8.png', 'images/sprites/customer-9.png',
  'images/sprites/customer-10.png', 'images/sprites/customer-11.png', 'images/sprites/customer-12.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(CORE);
    // Collection files are listed in collections.json.
    try {
      const list = await (await fetch('collections.json', { cache: 'no-cache' })).json();
      await cache.addAll(list.collections || []);
    } catch { /* cached on first use instead */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('shell-') && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/tests/')) return;
  // Card images never change; sprites may be replaced, so they go network first.
  if (url.pathname.includes('/images/') && !url.pathname.includes('/images/sprites/')) event.respondWith(cacheFirst(req));
  else event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
