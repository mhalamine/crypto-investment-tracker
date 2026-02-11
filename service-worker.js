const ASSET_VERSION = "2026-02-11-2";
const CACHE_NAME = `cit-static-${ASSET_VERSION}`;
const RUNTIME_CACHE = `cit-runtime-${ASSET_VERSION}`;
const withVersion = (path) => `${path}?v=${ASSET_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  withVersion("./styles.css"),
  withVersion("./app.js"),
  withVersion("./manifest.json"),
  withVersion("./icons/icon-192.png"),
  withVersion("./icons/icon-512.png"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => ![CACHE_NAME, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function staleWhileRevalidate(request) {
  return caches.open(RUNTIME_CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    }),
  );
}

function networkFirst(request) {
  return caches.open(RUNTIME_CACHE).then((cache) =>
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => cache.match(request)),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request).then((response) => response || caches.match("./index.html")));
    return;
  }

  if (isSameOrigin(request)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || networkFirst(request)),
    );
    return;
  }

  const url = new URL(request.url);
  if (
    url.origin.includes("cdn.jsdelivr.net") ||
    url.origin.includes("fonts.googleapis.com") ||
    url.origin.includes("fonts.gstatic.com")
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
