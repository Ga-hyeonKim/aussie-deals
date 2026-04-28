const CACHE = "aussiedeals-v2";

// No pre-caching of pages — all pages have dynamic content (products, session)
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // API, Next.js internals, external CDN images → always network, no caching
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    url.hostname !== self.location.hostname
  ) {
    return;
  }

  // Page navigations → network-first: always try fresh from server,
  // fall back to cache only if offline (in-store with bad signal)
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
