/*
 * Enveloppe hors-ligne de Fadi (service worker) : sert l'application
 * (document, scripts et styles du build), le moteur de l'Atelier natif et
 * l'outil Parcelle depuis le cache du navigateur quand le réseau manque.
 * Les appels à l'API (/projects, /auth, /examples, /library, /notifications, /preferences, /health) ne sont jamais
 * mis en cache ici, ni interceptés (même ouverts en navigation : téléchargement d'une archive, d'un fichier de
 * paquet) : les données viennent du serveur, ou du cache persistant de l'application (IndexedDB) quand il est
 * hors-ligne.
 *
 * Un cache par build (`fadi-shell-<build>`, identifiant = commit + empreinte du contenu, injecté par vite.config.ts),
 * rempli dès l'installation en contournant le cache HTTP (morceaux de l'application, moteurs, Parcelle) ; les caches
 * des builds précédents sont supprimés à l'activation. Navigation : réseau d'abord ; la page reçue ne devient la
 * coquille hors ligne que si elle est celle de CE build (balise `<meta name="fadi-build">` de même identifiant) —
 * jamais la page d'un déploiement plus récent servie à un ancien service worker, dont les morceaux ne seraient pas
 * dans ce cache. Hors ligne, seule la coquille du même build est servie.
 *
 * Studio (A.5-09, B.3-09, B.3-10) : la coquille et l'éditeur de Studio (routes
 * /studio/…, morceaux chargés paresseusement, Worker de calcul) font partie de
 * la liste anticipée ; une variante déjà lue s'ouvre donc sans réseau. Les
 * brouillons et enveloppes non confirmées de Studio vivent dans IndexedDB
 * (`studioBrouillons`) : ce service worker n'y touche jamais, une mise à jour
 * ne peut donc pas les perdre. Pendant une mise à jour, le cache du build
 * précédent est gardé tant qu'une page est ouverte (elle peut encore demander
 * un morceau empreint de son propre build, hors ligne) ; il disparaît à
 * l'activation suivante. Seuls les fichiers empreints (/assets/…, nom = contenu)
 * y sont lus : un fichier non empreint d'un autre build n'est jamais servi.
 *
 * Classes du précache (B.3-07, EX-042 ; `chargement/carte-morceaux.ts`) : (a) coquille minimale (document, bundle
 * initial), (b) ressources du profil Studio (coquille Studio, catalogue, planche 2D, carte des morceaux
 * `/chargement.json`), (c) modules facultatifs (vue 3D, Workers, Atelier, autres écrans) ; (d) les données métier et
 * la file des commandes restent dans IndexedDB, jamais ici. L'installation met en cache (a) et (b) d'abord, puis (c).
 * Politique retenue (option conservatrice) : les modules facultatifs restent précachés comme avant (aucune capacité
 * hors ligne déjà livrée n'est retirée), mais « précaché » n'est jamais « chargé » : un module n'est exécuté qu'à son
 * premier usage, et sa disponibilité hors connexion est lue dans ce cache par l'interface (Tool Manager), fichier
 * par fichier, jamais supposée.
 */
// Les marqueurs ci-dessous sont remplacés au build (vite.config.ts) : l'identifiant du build (un cache par build) et la
// liste des fichiers à mettre en cache dès l'installation (application, morceaux chargés paresseusement, moteurs).
const BUILD = "__FADI_BUILD__";
const PRECACHE = "__FADI_ASSETS__";
const PREFIX = "fadi-shell-";
const CACHE = `${PREFIX}${BUILD}`;
const SHELL = "/index.html";
const CARTE = "/chargement.json";
const STATIC = /^\/(assets|parcelle)\//;
const HASHED = /^\/assets\//;
const API = /^\/(auth|projects|examples|library|notifications|preferences|health|version)(\/|$)/;
const MARQUE = `<meta name="fadi-build" content="${BUILD}">`;
/** Classes du précache dans l'ordre d'installation (coquille et profil, puis facultatif) ; une liste simple reste acceptée. */
const CLASSES = Array.isArray(PRECACHE)
  ? [PRECACHE]
  : PRECACHE && typeof PRECACHE === "object"
    ? [[...(PRECACHE.coquille ?? []), ...(PRECACHE.profil ?? [])], PRECACHE.facultatif ?? []]
    : [];
const LISTE = CLASSES.flat();
/** Fichiers non empreints de la liste anticipée de CE build (Parcelle) : seuls admis dans le cache après l'installation. */
const NON_EMPREINTS = new Set(LISTE.filter((path) => path !== SHELL && !HASHED.test(path)));
/** Fichier admis dans le cache de ce build après l'installation : empreint, ou non empreint de la liste anticipée. */
const admis = (url) => HASHED.test(url.pathname) || (NON_EMPREINTS.has(url.pathname) && url.search === "");

/** La réponse est-elle la page de l'application de CE build ? (HTML, réussie, balise du même identifiant) */
async function coquilleDeCeBuild(response) {
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) return false;
  try {
    return (await response.clone().text()).includes(MARQUE);
  } catch {
    return false;
  }
}

/**
 * La réponse est-elle la carte des morceaux de CE build ? (JSON lisible, champ `build` identique) : la carte d'un
 * déploiement plus récent (ou plus ancien) n'entre jamais dans ce cache, elle décrirait d'autres fichiers.
 */
async function carteDeCeBuild(response) {
  if (!response.ok) return false;
  try {
    const carte = await response.clone().json();
    return !!carte && typeof carte === "object" && carte.build === BUILD;
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      // Mise en cache anticipée, fichier par fichier (un fichier manquant n'empêche pas l'installation ; un fichier non
      // empreint manqué est réparé à sa première lecture réussie, voir `admis`). La coquille et les fichiers non
      // empreints contournent le cache HTTP du navigateur (`reload`) : rien d'un build antérieur ne s'y glisse. Les
      // morceaux empreints sont immuables (nom = contenu) : le cache HTTP peut les fournir sans nouveau téléchargement.
      const cache = await caches.open(CACHE);
      // Coquille et profil d'abord, puis les modules facultatifs.
      for (const classe of CLASSES) await Promise.all(
        classe.map(async (path) => {
          try {
            const response = await fetch(HASHED.test(path) ? path : new Request(path, { cache: "reload" }));
            if (!response.ok) return;
            // Le serveur sert déjà un autre build : sa page n'est pas la coquille de celui-ci.
            if (path === SHELL && !(await coquilleDeCeBuild(response))) return;
            if (path === CARTE && !(await carteDeCeBuild(response))) return;
            await cache.put(path, response);
          } catch {
            /* fichier manquant ou réseau coupé : ignoré */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // Purge des caches des builds précédents : rien de périmé ne survit à une mise à jour. Si une page est ouverte,
      // le dernier cache précédent (les clés suivent l'ordre de création) reste le temps de cette page : ses morceaux
      // empreints (Studio compris) restent servis hors ligne, ses commandes non synchronisées restent utilisables.
      const anciens = (await caches.keys()).filter((name) => name.startsWith(PREFIX) && name !== CACHE);
      const ouvertes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const garde = ouvertes.length ? anciens[anciens.length - 1] : undefined;
      for (const name of anciens) if (name !== garde) await caches.delete(name);
      await self.clients.claim();
      // B.3-10 : chaque page ouverte apprend la mise à jour (ancien cache gardé ou non) ; elle ne se recharge pas
      // d'elle-même, ses commandes non synchronisées restent dans IndexedDB, que ce service worker ne touche jamais.
      for (const client of ouvertes) client.postMessage({ type: "fadi-sw-active", build: BUILD, ancienGarde: garde ?? null, precedents: anciens.length });
    })(),
  ),
);

async function cacheFirst(request, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  // Morceau empreint d'un build précédent encore ouvert (mise à jour en cours) : son nom fixe son contenu, il ne peut
  // pas être périmé. Un fichier non empreint (Parcelle) n'est jamais lu dans un autre cache.
  if (HASHED.test(url.pathname)) {
    const ancien = await caches.match(request);
    if (ancien) return ancien;
  }
  const response = await fetch(request);
  // Après l'installation, n'entrent dans le cache de ce build qu'un fichier empreint ou un fichier non empreint de sa
  // liste anticipée (réparation d'une mise en cache manquée à l'installation, ex. Parcelle) ; aucun autre fichier.
  if (response.ok && admis(url)) await cache.put(url.search ? request : url.pathname, response.clone());
  return response;
}

async function shell(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    // Seule la page de l'application de CE build devient la coquille hors ligne (jamais un export SVG / DXF ouvert
    // en navigation, ni la page d'un déploiement plus récent).
    if (await coquilleDeCeBuild(response)) await cache.put(SHELL, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(SHELL);
    if (cached) return cached;
    throw err;
  }
}

/** Page statique ouverte en navigation (Parcelle dans son cadre) : réseau d'abord, sinon sa copie de ce build. */
async function staticPage(request, url) {
  try {
    const response = await fetch(request);
    // Page de la liste anticipée reçue du réseau : elle répare une mise en cache manquée à l'installation.
    if (response.ok && admis(url)) await (await caches.open(CACHE)).put(url.pathname, response.clone());
    return response;
  } catch (err) {
    const cached = await (await caches.open(CACHE)).match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

/** Carte des morceaux : réseau d'abord ; seule la carte de CE build est enregistrée ; hors ligne, sa copie de ce build. */
async function carte(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (await carteDeCeBuild(response)) await cache.put(CARTE, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(CARTE);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API : jamais interceptée, jamais mise en cache.
  if (API.test(url.pathname)) return;
  if (request.mode === "navigate") {
    event.respondWith(STATIC.test(url.pathname) ? staticPage(request, url) : shell(request));
    return;
  }
  // Carte des morceaux de ce build (non empreinte) : réseau d'abord, sinon la copie de ce build (hors ligne) ; une carte
  // d'un autre build reçue du réseau est rendue à la page mais jamais enregistrée.
  if (url.pathname === CARTE) { event.respondWith(carte(request)); return; }
  if (STATIC.test(url.pathname) || url.pathname === "/favicon.svg") event.respondWith(cacheFirst(request, url));
});
