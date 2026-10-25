// Kadar offline cache. Bump VERSION when any app file changes.
const VERSION = 'kadar-v10';
const MODELS = 'kadar-models'; // MediaPipe model files, kept across versions
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon-180.png',
  'icon-512.png',
  'js/app.js',
  'js/recent.js',
  'js/engine.js',
  'js/rank.js',
  'js/metrics.js',
  'js/editor.js',
  'js/focus.js',
  'js/exif.js',
  'libs/mediapipe/vision_bundle.mjs',
  'fonts/barlow-semi-condensed-latin-400-normal.woff2',
  'fonts/barlow-semi-condensed-latin-600-normal.woff2',
  'fonts/barlow-semi-condensed-latin-700-normal.woff2',
  'fonts/barlow-semi-condensed-latin-ext-400-normal.woff2',
  'fonts/barlow-semi-condensed-latin-ext-600-normal.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== MODELS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'storage.googleapis.com' && url.pathname.startsWith('/mediapipe-models/')) {
    e.respondWith(caches.open(MODELS).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin || url.protocol === 'blob:') return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
