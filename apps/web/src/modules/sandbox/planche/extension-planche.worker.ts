/// <reference lib="webworker" />
/**
 * Web Worker d'une extension de la Planche (protocole 1.0, lot 1) : **un** Worker par extension, qui reste en vie
 * pendant la séance. Il lit le code de l'extension une fois, puis traite les demandes et les événements que la Planche
 * lui adresse (`creerExecutantExtension`, paquet du Sandbox). L'extension ne voit ni la page, ni le compte, ni le
 * dessin enregistré, ni les autres extensions.
 *
 * Sans réseau, par les deux barrières de `isolement-worker.ts` (politique de contenu du fichier, fonctions retirées).
 * Le délai par événement est tenu par l'hôte (`hote-extensions.ts`), qui arrête ce Worker s'il ne répond pas.
 */
import { creerExecutantExtension, type ErreurDemarrageExtension, type ExecutantExtension, type MessageProtocole } from "@parcours/sandbox-planche-model";
import { RETIRES, fermerLecteurs, retirer } from "./isolement-worker";

/** Premier message reçu : l'extension à lancer. */
export interface DemarrageExtension {
  readonly demarrer: { readonly fiche: { readonly id: string; readonly version: string }; readonly code: string };
}
/** Réponse au démarrage : `erreur` nul = l'extension est prête. */
export interface DemarrageRendu {
  readonly demarre: boolean;
  readonly erreur: ErreurDemarrageExtension | null;
}

const porte = self as unknown as { onmessage: ((e: MessageEvent<unknown>) => void) | null; postMessage(m: MessageProtocole | DemarrageRendu): void };
const poster = porte.postMessage.bind(self);
let executant: ExecutantExtension | null = null;

porte.onmessage = (e) => {
  if (executant) {
    executant.recevoir(e.data);
    return;
  }
  const d = (e.data as Partial<DemarrageExtension> | null)?.demarrer;
  if (!d || typeof d.code !== "string" || typeof d.fiche?.id !== "string" || typeof d.fiche.version !== "string") return;
  for (const nom of RETIRES) retirer(nom);
  const x = creerExecutantExtension({ fiche: { id: d.fiche.id, version: d.fiche.version }, code: d.code }, poster, { avantExecution: fermerLecteurs });
  const erreur = x.demarrer();
  if (erreur) {
    // Rien ne tourne après un démarrage manqué : le Worker ne traite plus aucun message.
    porte.onmessage = null;
    poster({ demarre: false, erreur });
    return;
  }
  executant = x;
  poster({ demarre: true, erreur: null });
};
