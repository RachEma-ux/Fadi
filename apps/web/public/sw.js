/*
 * Enveloppe hors-ligne de Fadi (service worker) : sert l'application
 * (document, scripts et styles du build), le moteur de l'Atelier natif et
 * l'outil Parcelle depuis le cache du navigateur quand le réseau manque.
 * Les appels à l'API (/projects, /auth, /examples, /library, /notifications) ne sont jamais
 * mis en cache ici : les données viennent du serveur, ou du cache persistant
 * de l'application (IndexedDB) quand il est hors-ligne. Le cache porte
 * l'identifiant du build, est rempli dès l'installation (morceaux de
 * l'application, moteurs) et les caches des builds précédents sont
 * supprimés à l'activation.
 */
// Les marqueurs ci-dessous sont remplacés au build (vite.config.ts) : l'identifiant du commit (un cache par build) et la
// liste des fichiers à mettre en cache dès l'installation (application, morceaux chargés paresseusement, moteurs).
const BUILD = "__FADI_BUILD__";
const PRECACHE = "__FADI_ASSETS__";
const CACHE = `fadi-shell-${BUILD}`;
const STATIC = /^\/(assets|atelier-native|parcelle)\//;

self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      // Mise en cache anticipée, fichier par fichier (un fichier manquant n'empêche pas l'installation).
      const cache = await caches.open(CACHE);
      const list = Array.isArray(PRECACHE) ? PRECACHE : [];
      await Promise.all(list.map((path) => cache.add(path).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // Purge des caches des builds précédents : rien de périmé ne survit à une mise à jour.
      for (const name of await caches.keys()) if (name.startsWith("fadi-shell-") && name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function shell(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put("/index.html", response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match("/index.html");
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(shell(request));
    return;
  }
  if (STATIC.test(url.pathname) || url.pathname === "/favicon.svg") event.respondWith(cacheFirst(request));
});
