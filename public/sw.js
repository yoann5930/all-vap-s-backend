/* All Vap's — service worker inventaire v8
 * network-first ; ne touche JAMAIS auth / login / API / admin
 * v8 : ne pas intercepter /api/* (pas de respondWith) — cookies + Bearer intacts
 */
const CACHE = "allvaps-inventory-v8";
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

function isAuthPage(pathname) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login") ||
    pathname === "/connexion" ||
    pathname.startsWith("/connexion") ||
    pathname === "/inventaire/connexion" ||
    pathname.startsWith("/inventaire/connexion") ||
    pathname === "/changer-mot-de-passe" ||
    pathname.startsWith("/changer-mot-de-passe") ||
    pathname === "/mot-de-passe-oublie" ||
    pathname.startsWith("/mot-de-passe-oublie") ||
    pathname === "/register" ||
    pathname.startsWith("/register")
  );
}

function isEmployeeInventairePage(pathname) {
  return pathname === "/inventaire" || pathname.startsWith("/inventaire/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Critique : ne PAS intercepter API / auth / admin.
  // Un respondWith(fetch(req)) peut fragiliser cookies / Authorization sur Android PWA.
  if (
    isApi(url.pathname) ||
    isAuthPage(url.pathname) ||
    url.pathname.startsWith("/admin")
  ) {
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
