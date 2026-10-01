/**
 * Le Parcours — flux unique en 21 étapes numérotées 01 à 21, de la parcelle
 * existante jusqu'à la décision puis l'engagement du projet (voir
 * AGENTS.md : « Preserve the authoritative Parcours workflow »).
 *
 * Ces types décrivent la FORME des étapes et de leur contenu. Les données
 * elles-mêmes (titres, phases, propositions Harmonie, exemples importables)
 * sont une extraction traçable du prototype fourni par l'utilisateur,
 * conservée telle quelle dans `apps/api/src/data` — ce fichier ne les
 * invente pas, il les type. Voir « Treat the supplied geometry package as a
 * traceable extraction, not proof of correctness » : la même prudence
 * s'applique à ce contenu métier.
 */

/** Une proposition Harmonie pour une étape : jamais présentée comme acquise, toujours avec son compromis et sa validation attendue. */
export interface HarmonieOption {
  title: string;
  proposal: string;
  benefit: string;
  tradeoff: string;
  validation: string;
}

/** Définition générique d'une étape du Parcours — indépendante de tout projet. */
export interface ParcoursStepDefinition {
  number: number;
  title: string;
  phase: string;
  key: string | null;
  scope: string | null;
  goal: string | null;
  inputs: string | null;
  deliverable: string | null;
  method: string | null;
  topic: string | null;
  harmonieOptions: HarmonieOption[];
}

export type ParcoursStepStatus = "a-faire" | "en-cours" | "termine";

/**
 * Donnée vs hypothèse, jamais fondues (AGENTS.md). Un résultat d'étape
 * distingue explicitement ce qui vient d'un calcul/fichier source de ce qui
 * est une hypothèse retenue pour l'exemple ; `raw` couvre les étapes dont le
 * texte source ne sépare pas les deux.
 */
export interface ParcoursStepResult {
  donnee: string | null;
  hypothese: string | null;
  raw: string | null;
}

/** Contenu réel d'une étape pour UN projet donné — vide par défaut, rempli par import d'exemple ou par l'utilisateur. */
export interface ParcoursStepContent {
  status: ParcoursStepStatus;
  choice: string | null;
  headline: string | null;
  decision: string | null;
  why: string | null;
  alternatives: string | null;
  owner: string | null;
  proof: string | null;
  result: ParcoursStepResult | null;
  sourceStatus: string | null;
}

export const EMPTY_PARCOURS_STEP_CONTENT: ParcoursStepContent = {
  status: "a-faire",
  choice: null,
  headline: null,
  decision: null,
  why: null,
  alternatives: null,
  owner: null,
  proof: null,
  result: null,
  sourceStatus: null,
};
