// Minimal service worker — exists so Chrome's PWA installability check
// passes. Network-first for everything (we don't pre-cache assets here
// because Vite's hashed filenames would invalidate any cache list on
// every deploy). Bump CACHE_VERSION to force clients to drop the old
// runtime cache after a deploy.
const CACHE_VERSION = 'workspace-v1';

self.addEventListener('install', (event) => {
  // Activate as soon as installed — no waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Skip Supabase + cross-origin (CDNs etc.) — only cache same-origin
  // GETs. The portal hub itself is tiny enough that network-first is OK.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Stash a copy in cache for offline fallback (best-effort)
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
  );
});
