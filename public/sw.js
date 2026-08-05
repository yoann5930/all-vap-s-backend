/* All Vap's — service worker inventaire (network-first, jamais de pages auth cassées) */
const CACHE = "allvaps-inventory-v3";
const SHELL = [
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

function isInventoryApi(pathname) {
  return (
    pathname.startsWith("/api/inventaire") ||
    pathname.startsWith("/api/admin/inventory") ||
    pathname.startsWith("/api/admin/inventaires") ||
    pathname.startsWith("/api/auth/")
  );
}

/** Pages HTML inventaire employé uniquement — jamais /admin (redirect login en cache). */
function isEmployeeInventairePage(pathname) {
  return pathname === "/inventaire" || pathname.startsWith("/inventaire/");
}

function canCacheResponse(res) {
  return res && res.ok && res.type === "basic" && res.status === 200;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Auth + APIs : réseau uniquement (pas de cache de 401/403/login JSON)
  if (isInventoryApi(url.pathname)) {
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

  // Ne jamais intercepter /admin* (sinon 307→/login mis en cache casse l’accès après login)
  if (url.pathname.startsWith("/admin")) {
    return;
  }

  if (
    isEmployeeInventairePage(url.pathname) ||
    url.pathname === "/manifest-inventaire.webmanifest" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (canCacheResponse(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match("/inventaire"))
        )
    );
  }
});
