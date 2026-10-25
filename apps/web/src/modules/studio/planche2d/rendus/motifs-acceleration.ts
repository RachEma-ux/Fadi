/** Libellés des motifs de refus de la règle des accélérations (F.1-01), partagés par la planche et la vue 3D. Pur. */
import type { StudioVerdictAcceleration } from "@parcours/atelier-model";

export const MOTIFS_REFUS_ACCELERATION: Readonly<Record<StudioVerdictAcceleration["refus"][number]["motif"], string>> = Object.freeze({
  "acceleration-inconnue": "accélération inconnue",
  "rapport-absent": "aucun rapport de comparaison",
  "rapport-invalide": "rapport illisible",
  "rapport-d-une-autre-acceleration": "rapport d’une autre accélération",
  "chemins-differents": "chemins comparés différents",
  "mesure-absente": "mesure absente",
  "gain-non-prouve": "gain non prouvé",
  "critere-absent": "critère d’équivalence absent",
  "critere-non-evalue": "critère d’équivalence non évalué",
  "hors-tolerance": "écart hors tolérance",
  "tolerance-trop-large": "tolérance plus large que déclarée",
  "appareil-reel-requis": "mesure sur appareil réel requise",
});

/** Motifs distincts d'un verdict, joints pour l'affichage. */
export const motifsVerdict = (v: StudioVerdictAcceleration): string => [...new Set(v.refus.map((r) => MOTIFS_REFUS_ACCELERATION[r.motif]))].join(" ; ");
