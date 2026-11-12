// Makes Opus installable and quick to open. It never caches /api, so your data is always live.
const CACHE = "opus-shell-v1";

self.addEventListener("install", (e) => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Pages: network first, so a new version shows up; fall back to the last one when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => { caches.open(CACHE).then((c) => c.put("/", res.clone())); return res; }).catch(() => caches.match("/")),
    );
    return;
  }
  // Built files have hashed names, so cache-first is safe.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())); return res; })),
  );
});
