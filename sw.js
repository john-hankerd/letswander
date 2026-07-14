const CACHE_NAME = "letswander-shell-v2";
const SHELL_PATHS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
].map((p) => new URL(p, self.location.href).pathname);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_PATHS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept dynamic API calls (pins, suggestions, admin) — those
  // must always go straight to the network, never served from a shell cache.
  if (url.pathname.includes("/.netlify/functions/")) return;

  const isShellRequest = SHELL_PATHS.includes(url.pathname);
  if (!isShellRequest) return;

  // Network-first with a cache fallback, so an already-installed PWA picks
  // up new deploys instead of being stuck on whatever was cached at install.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
