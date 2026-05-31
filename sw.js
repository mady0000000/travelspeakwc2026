const CACHE = 'travelspeakv1';
const AUDIO_CACHE = 'travelspeakv1-audio';

const STATIC = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== AUDIO_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Audio files: cache-first with long TTL
  if (url.includes('storage.googleapis.com')) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then(cache =>
        cache.match(e.request).then(hit => {
          if (hit) return hit;
          return fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => new Response('', {status: 503}));
        })
      )
    );
    return;
  }

  // Static files: cache-first
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).then(res => {
        if (res.ok) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
    )
  );
});

// Pre-cache audio on demand (called from main app)
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CACHE_AUDIO') {
    const urls = e.data.urls;
    caches.open(AUDIO_CACHE).then(cache => {
      let i = 0;
      function next() {
        if (i >= urls.length) {
          e.source.postMessage({type: 'AUDIO_CACHED', total: urls.length});
          return;
        }
        const url = urls[i++];
        cache.match(url).then(hit => {
          if (!hit) {
            fetch(url).then(res => { if (res.ok) cache.put(url, res.clone()); }).catch(() => {});
          }
          if (i % 50 === 0) {
            e.source.postMessage({type: 'CACHE_PROGRESS', done: i, total: urls.length});
          }
          setTimeout(next, 10);
        });
      }
      next();
    });
  }
});
