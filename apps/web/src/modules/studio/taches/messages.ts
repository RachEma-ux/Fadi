/**
 * Messages d'interface (français source, traduits par `en.json`) de l'issue d'une tâche. `null` : rien à annoncer
 * (résultat rendu, ou tâche annulée / remplacée dont le résultat est simplement écarté). Pur : ni React, ni DOM.
 */
import type { IssueTache } from "./ordonnanceur";

export const MESSAGES_TACHE = Object.freeze({
  delai: "Le calcul n’a pas répondu à temps : réessayez ; il sera relancé.",
  plantage: "Le calcul s’est interrompu deux fois : il a été abandonné. Réessayez ; il sera relancé.",
  indisponible: "Calcul indisponible : trois échecs consécutifs. Rechargez la page pour réessayer.",
  calcul: "Le calcul a échoué : réessayez.",
  enCours: "Calcul en cours…",
});

export function messageTache(i: IssueTache<unknown>): string | null {
  if (i.etat === "done" || i.etat === "cancelled" || i.etat === "superseded") return null;
  if (i.etat === "timed-out") return MESSAGES_TACHE.delai;
  return MESSAGES_TACHE[i.code];
}
