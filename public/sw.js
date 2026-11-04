const CACHE_VERSION = "v2";
const SHELL_CACHE = `mk-adisyon-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `mk-adisyon-static-${CACHE_VERSION}`;
const OWN_CACHE_PREFIX = "mk-adisyon-";
const OFFLINE_URL = "/offline.html";
const APP_SHELL = [
  OFFLINE_URL,
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/icons/app-icon-maskable-192.png",
  "/icons/app-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(OWN_CACHE_PREFIX) &&
                key !== SHELL_CACHE &&
                key !== STATIC_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Navigations always use the network. Authenticated pages and RSC/API data
  // are never persisted; only the static, self-contained offline document is.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const fallback = await caches.match(OFFLINE_URL);
        return fallback || Response.error();
      }),
    );
    return;
  }

  // Next.js build assets are content-hashed and therefore safe for cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      }),
    );
    return;
  }

  // Public PWA artwork is refreshed in the background and versioned again by
  // the next service worker activation. No other same-origin data is cached.
  if (url.pathname.startsWith("/icons/") && request.destination === "image") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fresh = fetch(request).then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        });
        return cached || fresh;
      }),
    );
  }
});
