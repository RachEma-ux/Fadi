/// <reference lib="webworker" />
/**
 * Web Worker de l'extension « Scripts » (25 novembre 2026) : exécute **un** script personnel sur la copie du modèle
 * reçue, répond, et s'arrête (le client le termine ; un Worker neuf par exécution, donc rien ne survit d'un script au
 * suivant). Le script ne voit ni la page, ni le compte, ni le dessin enregistré.
 *
 * Sans réseau, par deux moyens indépendants :
 *  1. la politique de contenu servie avec ce fichier (`connect-src 'none'`, `script-src 'self' 'unsafe-eval'`,
 *     `apps/api/src/lib/sandbox-scripts-csp.ts`) : le navigateur refuse toute connexion et tout code d'ailleurs ;
 *  2. ci-dessous, les fonctions de réseau, de stockage et de chargement de code sont retirées avant de lancer le script
 *     (seul moyen en développement, où le fichier est servi sans cette politique).
 */
import { executerScript, type Modele, type ResultatScript } from "@parcours/sandbox-planche-model";

export interface DemandeScript {
  readonly code: string;
  readonly modele: Modele;
  readonly selection: readonly string[];
  readonly dans?: string;
}
/** Réponse : le modèle n'est renvoyé que s'il a changé. */
export type ReponseScript = Omit<ResultatScript, "modele"> & { readonly modele: Modele | null };

/** Fonctions retirées au script : réseau, stockage, autres Workers, chargement de code, exécution différée. */
const RETIRES = [
  "fetch", "XMLHttpRequest", "WebSocket", "WebSocketStream", "WebTransport", "EventSource", "RTCPeerConnection", "RTCDataChannel",
  "importScripts", "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel", "indexedDB", "caches", "cookieStore",
  "Request", "Response", "setTimeout", "setInterval", "queueMicrotask", "requestAnimationFrame", "navigator",
] as const;

function retirer(nom: string): void {
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
function fermerLecteurs(): void {
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

const porte = self as unknown as { onmessage: ((e: MessageEvent<DemandeScript>) => void) | null; postMessage(m: ReponseScript): void };
const repondre = porte.postMessage.bind(self);

porte.onmessage = (e) => {
  porte.onmessage = null;
  const { code, modele, selection, dans } = e.data;
  for (const nom of RETIRES) retirer(nom);
  const r = executerScript(code, modele, { selection, ...(dans !== undefined ? { dans } : {}), avantExecution: fermerLecteurs });
  repondre({ journal: r.journal, crees: r.crees, erreur: r.erreur, modele: r.modele === modele ? null : r.modele });
};
