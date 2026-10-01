/**
 * Modèle de projet commun — voir docs/architecture.md, « Domain model ».
 *
 * Chaque interface ci-dessous porte le « principe de gestion » donné par la
 * spécification du 2026-10-01 : un `Objet architectural` est identifié et relié,
 * une `Donnée source` est datée et vérifiée, une `Exigence` a une origine
 * explicite, une `Hypothèse` est justifiée, un `Résultat calculé` porte sa
 * méthode et la révision du modèle qui l'a produit, une `Décision` a un auteur
 * et une date, un `Document produit` porte la révision utilisée et son état
 * d'actualisation.
 *
 * Ce fichier couvre essentiellement des TYPES — aucune persistance, aucune
 * règle de validation métier, aucun calcul. Les commandes réversibles qui
 * modifient ces objets vivent dans `command-history.ts` (mécanisme
 * générique) ; leur câblage métier réel (déplacer un escalier, par ex.) est
 * un travail de module (Atelier), pas de ce paquet.
 *
 * Seule exception : les trois gardes de type sur `Coordinate` ci-dessous.
 * Elles existent pour que « ne jamais mélanger les repères » (cadastral /
 * géographique / local) soit vérifiable à l'exécution, pas seulement à la
 * compilation — un objet qui traverse une frontière JSON (API, stockage)
 * perd son type statique mais garde son champ `frame`.
 */

export type Id = string;
export type Iso8601Date = string;

/** Un enregistrement cohérent avec une révision donnée du modèle de projet. */
export interface Revisioned {
  /** Révision du modèle de projet avec laquelle cet enregistrement est cohérent. */
  modelRevision: number;
}

// ---------------------------------------------------------------------------
// Repères de coordonnées — explicitement distingués, jamais mélangés
// ---------------------------------------------------------------------------

export interface CadastralCoordinate {
  readonly frame: "cadastral";
  x: number;
  y: number;
}

export interface GeographicCoordinate {
  readonly frame: "geographic";
  /** Latitude WGS84, degrés décimaux. */
  lat: number;
  /** Longitude WGS84, degrés décimaux. */
  lon: number;
}

export interface LocalCoordinate {
  readonly frame: "local";
  x: number;
  y: number;
}

export type Coordinate = CadastralCoordinate | GeographicCoordinate | LocalCoordinate;

export function isCadastralCoordinate(c: Coordinate): c is CadastralCoordinate {
  return c.frame === "cadastral";
}

export function isGeographicCoordinate(c: Coordinate): c is GeographicCoordinate {
  return c.frame === "geographic";
}

export function isLocalCoordinate(c: Coordinate): c is LocalCoordinate {
  return c.frame === "local";
}

// ---------------------------------------------------------------------------
// Objet architectural
// ---------------------------------------------------------------------------

export interface ObjectRelation {
  /** Nature de la relation : ex. 'hosted-by', 'connects', 'belongs-to'. */
  kind: string;
  targetId: Id;
}

/**
 * Identifiant stable, propriétés, géométrie et relations avec les autres objets.
 * La géométrie elle-même (polygones, prismes) vit dans `@parcours/core-geometry` ;
 * ce type la référence sans en imposer la forme exacte, pour ne pas coupler le
 * modèle de domaine à un moteur de rendu particulier.
 */
export interface ArchitecturalObject extends Revisioned {
  id: Id;
  /** ex. 'wall', 'door', 'window', 'column', 'stair', 'level', 'room'. */
  kind: string;
  properties: Record<string, unknown>;
  relations: ObjectRelation[];
}

// ---------------------------------------------------------------------------
// Donnée source
// ---------------------------------------------------------------------------

export type VerificationStatus = "non-verifiee" | "verifiee" | "rejetee";

/** Document d'origine, date, unité et statut de vérification. */
export interface SourceDatum {
  id: Id;
  originDocument: string;
  date: Iso8601Date;
  unit: string;
  verificationStatus: VerificationStatus;
}

// ---------------------------------------------------------------------------
// Exigence / Hypothèse / Recommandation — trois statuts distincts, jamais fondus
// ---------------------------------------------------------------------------

export type RequirementOrigin = "reglementaire" | "contractuelle" | "programmatique";

/** Origine réglementaire, contractuelle ou programmatique explicitée. */
export interface Requirement {
  id: Id;
  origin: RequirementOrigin;
  description: string;
  /** Donnée source dont cette exigence découle, le cas échéant. */
  sourceId?: Id;
}

/** Valeur retenue, justification et validation attendue. */
export interface Hypothesis {
  id: Id;
  value: unknown;
  justification: string;
  expectedValidation: string;
}

/** Une recommandation reste distincte d'une exigence (non obligatoire) et d'une hypothèse (pas une donnée retenue pour calculer). */
export interface Recommendation {
  id: Id;
  description: string;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Résultat calculé
// ---------------------------------------------------------------------------

/** Méthode, données utilisées et révision du modèle. */
export interface CalculatedResult extends Revisioned {
  id: Id;
  method: string;
  /** Identifiants des objets/données utilisés pour produire ce résultat. */
  inputIds: Id[];
  value: unknown;
}

// ---------------------------------------------------------------------------
// Décision
// ---------------------------------------------------------------------------

/** Choix retenu, justification, auteur et date. */
export interface Decision {
  id: Id;
  choice: string;
  justification: string;
  author: string;
  date: Iso8601Date;
}

// ---------------------------------------------------------------------------
// Document produit
// ---------------------------------------------------------------------------

export type DocumentFreshness = "a-jour" | "perime";

/** Révision du projet utilisée et état d'actualisation. */
export interface ProducedDocument extends Revisioned {
  id: Id;
  kind: string;
  freshness: DocumentFreshness;
}

// ---------------------------------------------------------------------------
// Contrôles métier traçables (Analyses métier)
// ---------------------------------------------------------------------------

/** Absence de données → 'non-evalue', jamais une estimation silencieuse. */
export type CheckStatus = "non-evalue" | "conforme" | "non-conforme" | "a-verifier";

/** Chaque contrôle précise son domaine d'application, sa source, sa version et son résultat. */
export interface BusinessCheck {
  id: Id;
  /** Domaine d'application, ex. 'accessibilite', 'incendie', 'structure'. */
  domain: string;
  source: string;
  version: string;
  status: CheckStatus;
  result?: unknown;
}
