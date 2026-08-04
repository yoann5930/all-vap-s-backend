/* All Vap's — service worker inventaire (shell + file réseau d'abord) */
const CACHE = "allvaps-inventory-v2";
const SHELL = [
  "/inventaire",
  "/manifest-inventaire.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  if (url.pathname.startsWith("/api/inventaire") || url.pathname.startsWith("/api/admin/inventory")) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(JSON.stringify({ offline: true }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    return;
  }

  if (
    url.pathname.startsWith("/inventaire") ||
    url.pathname.startsWith("/admin/inventaire") ||
    url.pathname === "/manifest-inventaire.webmanifest" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match("/inventaire"))
        )
    );
  }
});
