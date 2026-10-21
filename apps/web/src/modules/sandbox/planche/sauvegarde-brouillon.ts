/** Écritures locales ordonnées : seul le dernier état demandé peut être annoncé enregistré. */
import type { Modele } from "@parcours/sandbox-planche-model";
import { enregistrerBrouillon } from "./brouillon";

export type EtatSauvegarde = "chargement" | "attente" | "enregistrement" | "enregistre" | "erreur";

export function creerSauvegardeBrouillon(
  annoncer: (etat: EtatSauvegarde) => void,
  ecrire: (modele: Modele) => Promise<void> = enregistrerBrouillon,
) {
  let version = 0;
  let file = Promise.resolve();
  return {
    modifier() { annoncer("attente"); return ++version; },
    sauver(modele: Modele, ticket: number) {
      file = file.then(async () => {
        if (ticket !== version) return;
        annoncer("enregistrement");
        try {
          await ecrire(modele);
          if (ticket === version) annoncer("enregistre");
        } catch {
          if (ticket === version) annoncer("erreur");
        }
      });
      return file;
    },
    invalider() { version++; },
  };
}
