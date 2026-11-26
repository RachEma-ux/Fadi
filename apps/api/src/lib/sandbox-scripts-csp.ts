/**
 * Extension « Scripts » du Sandbox (25 novembre 2026) : politique de contenu du Web Worker qui exécute les scripts
 * personnels. Le navigateur applique à un Worker la politique reçue **avec son fichier** : celle-ci lui interdit toute
 * connexion (fetch, XMLHttpRequest, WebSocket, EventSource : `connect-src 'none'`) et tout code d'une autre origine
 * (`script-src 'self'`), en laissant le moteur lire le texte du script (`'unsafe-eval'`, sans quoi rien ne s'exécute).
 * Un script collé ne peut donc ni appeler l'API avec la session du compte, ni envoyer le dessin ailleurs. Pur.
 */
export const CSP_WORKER_SCRIPTS = "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'none'";

/**
 * Fichiers construits des Workers qui exécutent du code écrit hors de Fadi (noms donnés par Vite) : celui des scripts
 * personnels (`scripts-planche.worker.ts`) et celui des extensions (`extension-planche.worker.ts`, protocole 1.0).
 */
const WORKER_SCRIPTS = /[\\/]assets[\\/](?:scripts|extension)-planche\.worker-[^\\/]+\.js$/;

/** Politique de contenu à joindre à un fichier statique, ou `null` (tous les autres fichiers : inchangés). */
export function politiqueContenuStatique(chemin: string): string | null {
  return WORKER_SCRIPTS.test(chemin) ? CSP_WORKER_SCRIPTS : null;
}
