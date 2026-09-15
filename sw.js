// 앱 셸만 캐싱한다. 시세는 항상 네트워크에서 새로 받아야 하므로 캐싱하지 않는다.
const CACHE = 'upbit-notifier-v1';
const SHELL = [
  './', './index.html', './app.js', './config.json', './manifest.webmanifest',
  './src/indicators.js', './src/period.js', './src/review-stats.js',
  './web/upbit.js', './web/store.js', './web/format.js',
  './web/current.js', './web/review.js', './web/history-client.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return; // 업비트 API는 그대로 통과

  event.respondWith(
    // 최신 셸을 우선 받되, 오프라인이면 캐시로 폴백한다.
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('./index.html'))),
  );
});
