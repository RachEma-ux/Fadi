/**
 * Problème (panneau « Problèmes », rapports d'import et d'échange, effets des commandes).
 * Un problème signale, il ne corrige rien : rien n'est supprimé ni rattaché en silence (R7, R12).
 */
import type { IdObjet } from "../ontologie/classes.js";
import type { PropositionReparation } from "./references.js";

export const CODES_PROBLEME = [
  // Import et données source
  "hote-introuvable",
  "role-inconnu",
  "calque-non-declare",
  "calque-divergent",
  "piece-sans-trace",
  "trace-piece-sans-code",
  "piece-libelle-divergent",
  "aire-ecart",
  "aire-declaree-anterieure",
  "niveaux-relies-absents",
  "valeur-non-evaluee",
  "valeur-a-verifier",
  "donnee-hors-modele",
  // Validation
  "classe-inconnue",
  "unite-invalide",
  "repere-melange",
  "parametre-invalide",
  "precondition",
  "calque-verrouille",
  "hors-emprise",
  "conflit-revision",
  // Références et dérivés
  "reference-a-reparer",
  "document-perime",
] as const;
export type CodeProbleme = (typeof CODES_PROBLEME)[number];

export type GraviteProbleme = "erreur" | "avertissement" | "information";

export interface Probleme {
  readonly code: CodeProbleme;
  readonly gravite: GraviteProbleme;
  /** Message en français, nominatif (identifiants cités). */
  readonly message: string;
  readonly objetIds: readonly IdObjet[];
  /** Chemin dans la commande ou dans la source (ex. `commands[0].params.epaisseur`, `floorDesign.levels.rdc.doors[3]`). */
  readonly chemin?: string;
  readonly niveauId?: IdObjet;
  /** Pour `reference-a-reparer` : propositions, jamais appliquées d'office. */
  readonly propositions?: readonly PropositionReparation[];
}
