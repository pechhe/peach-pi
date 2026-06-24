// Minimal service worker: an app-shell cache so "Add to Home Screen" launches
// offline-tolerantly. We deliberately do NOT cache API/tap responses — those
// are live, token-gated, and must always hit the master over the tailnet.
const SHELL = "remote-shell-v1";
const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never intercept cross-origin (the master relay) or live endpoints.
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sessions" || url.pathname === "/tap" || url.pathname === "/health") return;
  // App shell: network-first, fall back to cache when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r ?? caches.match("/index.html"))),
  );
});
