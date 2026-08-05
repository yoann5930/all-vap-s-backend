/* All Vap's — service worker inventaire v5
 * network-first ; ne cache jamais /admin ni les réponses non-200
 * v5 : évite pages inventaire périmées après redémarrage serveur
 */
const CACHE = "allvaps-inventory-v5";
const SHELL = ["/icon-192.png", "/icon-512.png", "/guides/installer-inventaire.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isApi(pathname) {
  return pathname.startsWith("/api/");
}

function isEmployeeInventairePage(pathname) {
  return pathname === "/inventaire" || pathname.startsWith("/inventaire/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Jamais de cache pour API / auth / admin / login / change password
  if (
    isApi(url.pathname) ||
    url.pathname.startsWith("/admin") ||
    url.pathname === "/login" ||
    url.pathname.startsWith("/login") ||
    url.pathname === "/changer-mot-de-passe" ||
    url.pathname.startsWith("/changer-mot-de-passe")
  ) {
    event.respondWith(fetch(req));
    return;
  }

  // Pages inventaire employé : network-first, cache seulement HTTP 200
  if (isEmployeeInventairePage(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic" && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/inventaire")))
    );
  }
});
