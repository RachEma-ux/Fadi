/// <reference lib="webworker" />
/**
 * Isolement d'un Web Worker qui exécute du code écrit hors de Fadi : un script personnel (`scripts-planche.worker.ts`)
 * ou une extension (`extension-planche.worker.ts`). Deux barrières indépendantes :
 *  1. la politique de contenu servie avec le fichier du Worker (`connect-src 'none'`, `apps/api/src/lib/sandbox-scripts-csp.ts`) ;
 *  2. ci-dessous, les fonctions de réseau, de stockage et de chargement de code sont retirées avant de lancer le code
 *     (seul moyen en développement, où le fichier est servi sans cette politique).
 * Ce fichier nomme ces fonctions pour les **retirer** : il n'en appelle aucune.
 */
/** Fonctions retirées au script : réseau, stockage, autres Workers, chargement de code, exécution différée. */
export const RETIRES = [
  "fetch", "XMLHttpRequest", "WebSocket", "WebSocketStream", "WebTransport", "EventSource", "RTCPeerConnection", "RTCDataChannel",
  "importScripts", "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel", "indexedDB", "caches", "cookieStore",
  "Request", "Response", "setTimeout", "setInterval", "queueMicrotask", "requestAnimationFrame", "navigator",
] as const;

export function retirer(nom: string): void {
  for (let o: object | null = self; o && o !== Object.prototype; o = Object.getPrototypeOf(o) as object | null) {
    if (!Object.prototype.hasOwnProperty.call(o, nom)) continue;
    try {
      Object.defineProperty(o, nom, { value: undefined, writable: false, configurable: false });
    } catch {
      // Propriété non reconfigurable sur ce navigateur : la politique de contenu du fichier reste la barrière.
    }
  }
}

/** Après la lecture du script : plus aucun moyen de lire d'autre code (`Function`, `eval`, fonctions asynchrones ou génératrices). */
export function fermerLecteurs(): void {
  const constructeurs = [function () {}, async function () {}, function* () {}, async function* () {}].map((f) => Object.getPrototypeOf(f) as object);
  for (const p of constructeurs) {
    try {
      Object.defineProperty(p, "constructor", { value: undefined, writable: false, configurable: false });
    } catch {
      // Voir `retirer`.
    }
  }
  retirer("Function");
  retirer("eval");
}
