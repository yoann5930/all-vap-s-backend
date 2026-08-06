/* All Vap's — service worker inventaire v6
 * network-first ; ne cache jamais auth / login / API / admin
 * v6 : exclut /connexion + invalide caches v5
 */
const CACHE = "allvaps-inventory-v6";
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

  // Jamais de cache pour API / auth / admin / login / change password
  if (
    isApi(url.pathname) ||
    isAuthPage(url.pathname) ||
    url.pathname.startsWith("/admin")
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
