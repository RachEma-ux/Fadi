/**
 * Le Parcours — flux unique en 21 étapes numérotées 01 à 21, de la parcelle
 * existante jusqu'à la décision puis l'engagement du projet (voir
 * AGENTS.md : « Preserve the authoritative Parcours workflow »).
 *
 * Ces types décrivent la FORME des étapes et de leur contenu. Les données
 * elles-mêmes (titres, phases, propositions Harmonie, formulaires, exemples
 * importables) sont une extraction traçable du prototype fourni par
 * l'utilisateur, conservée telle quelle dans `apps/api/src/data` (voir
 * `apps/api/scripts/extract-prototype-data.mjs`) — ce fichier ne les
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

/** Type d'un champ du formulaire métier d'une étape (BIZ_SCHEMAS du prototype). */
export type ParcoursFieldType = "text" | "textarea" | "number" | "date";

export interface ParcoursFormField {
  key: string;
  label: string;
  type: ParcoursFieldType;
}

/** Le formulaire métier d'une étape : intitulés, types et phrase d'introduction, tels que le prototype les affiche. */
export interface ParcoursStepForm {
  intro: string | null;
  fields: ParcoursFormField[];
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
  /** Étapes qui reçoivent les intentions retenues ici (« next » dans h7-stage-data). */
  transmitsTo: number[];
  /** Formulaire métier de l'étape ; `null` pour les étapes outillées autrement (01 parcelle, 10 et 11 atelier). */
  form: ParcoursStepForm | null;
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

/**
 * Valeur d'un champ du formulaire métier. `null` = non renseigné — jamais 0 :
 * « une valeur inconnue n'est pas zéro » (règle du prototype pour le KPI
 * finance, flow-v62).
 */
export type ParcoursFieldValue = string | number | null;

/** États d'une proposition Harmonie (STATES du prototype, h7-app). */
export type HarmonieProposalStatus =
  | "proposed"
  | "retained"
  | "adapted"
  | "translated"
  | "drawn"
  | "verified"
  | "dismissed";

export interface HarmonieHistoryEntry {
  at: string;
  status: HarmonieProposalStatus;
  text: string | null;
  proof: string | null;
  owner: string | null;
  reason: string | null;
}

/**
 * L'arbitrage porté par le projet sur UNE proposition Harmonie d'une étape.
 * La proposition elle-même (titre, texte, intérêt, compromis, conditions)
 * vient de la définition de l'étape et du profil du projet — elle n'est pas
 * copiée ici, sauf son texte adapté.
 */
export interface HarmonieProposalDecision {
  status: HarmonieProposalStatus;
  /** « Adaptation proposée ou motif ». */
  notes: string;
  /** « Responsable ». */
  owner: string;
  /** « Preuve / référence de revue ». */
  proof: string;
  /** « Référence d'objet / fiche ». */
  link: string;
  /** Texte de la proposition après « Adapter / motiver » (remplace le texte d'origine à l'affichage). */
  adaptedText: string | null;
  decisionVersion: number;
  updatedAt: string | null;
  history: HarmonieHistoryEntry[];
}

/** État Harmonie d'une étape pour un projet : révision des propositions et arbitrages par identifiant de proposition (ex. « H01-A »). */
export interface HarmonieStepState {
  revision: number;
  generatedAt: string | null;
  proposals: Record<string, HarmonieProposalDecision>;
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
  /** Réponses du formulaire métier (clés `f1`…, `summary`, `decision` pour l'étape 19). */
  fields: Record<string, ParcoursFieldValue>;
  harmonie: HarmonieStepState;
}

export const EMPTY_HARMONIE_STEP_STATE: HarmonieStepState = {
  revision: 0,
  generatedAt: null,
  proposals: {},
};

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
  fields: {},
  harmonie: EMPTY_HARMONIE_STEP_STATE,
};

/** Une étape telle que l'API la sert : sa définition et son contenu pour le projet. */
export interface ParcoursStep extends ParcoursStepDefinition {
  status: ParcoursStepStatus;
  content: ParcoursStepContent;
}
