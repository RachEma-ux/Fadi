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
import { RETIRES, fermerLecteurs, retirer } from "./isolement-worker";

export interface DemandeScript {
  readonly code: string;
  readonly modele: Modele;
  readonly selection: readonly string[];
  readonly dans?: string;
}
/** Réponse : le modèle n'est renvoyé que s'il a changé. */
export type ReponseScript = Omit<ResultatScript, "modele"> & { readonly modele: Modele | null };

const porte = self as unknown as { onmessage: ((e: MessageEvent<DemandeScript>) => void) | null; postMessage(m: ReponseScript): void };
const repondre = porte.postMessage.bind(self);

porte.onmessage = (e) => {
  porte.onmessage = null;
  const { code, modele, selection, dans } = e.data;
  for (const nom of RETIRES) retirer(nom);
  const r = executerScript(code, modele, { selection, ...(dans !== undefined ? { dans } : {}), avantExecution: fermerLecteurs });
  repondre({ journal: r.journal, crees: r.crees, erreur: r.erreur, modele: r.modele === modele ? null : r.modele });
};
