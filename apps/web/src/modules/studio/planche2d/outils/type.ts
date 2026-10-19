/**
 * Interface d'un outil de la planche 2D (Studio) : ce que produit un clic sur la planche (commandes, sommet suivant,
 * refus), l'aperçu du tracé en cours et l'aide affichée. Un outil est pur : il ne lit que l'état du tracé et le contexte
 * de création, ne touche ni au brouillon ni au DOM ; l'espace de travail applique l'action rendue. Le premier clic pose
 * toujours le point de départ (`trace`) ; `clic` reçoit le second et les suivants.
 */
import type { StudioCommand, StudioPoint, StudioShape } from "@parcours/atelier-model";
import type { PointPose } from "../Dessin2D";
import type { StudioToolId } from "../raccourcis";

/** Mode de construction de l'arc : trois points (début, passage, fin) ou centre, début et fin (sens trigonométrique). */
export type ModeArc = "trois-points" | "centre";

/** État du tracé en cours, en lecture seule. */
export interface EtatTrace {
  outil: StudioToolId;
  /** Premier point posé (tracé ou point de base du déplacement). */
  trace: PointPose | null;
  /** Points posés après le premier : passage ou début d'un arc, sommets suivants d'une polyligne. */
  suite: readonly StudioPoint[];
  modeArc: ModeArc;
}

/** Contexte de création d'un objet : identifiant neuf, calque actif, décalage saisi pour une cote. */
export interface ContexteCreation {
  nouvelId: () => string;
  /** Calque actif ; `undefined` = calque implicite (jamais nommé). */
  layerId: string | undefined;
  /** Décalage de cote saisi (mètres). */
  decalageCote: number;
}

/**
 * Effet d'un clic (ou d'une saisie numérique) : lot de commandes à appliquer en un pas (`apres` : la suite du tracé quand
 * le lot est accepté), refus affiché, sommet ajouté au tracé, polyligne terminée, déplacement de la sélection.
 */
export type ActionOutil =
  | { type: "commandes"; commandes: StudioCommand[]; apres?: "fin-trace" | "annuler-trace" }
  | { type: "erreur"; message: string }
  | { type: "sommet"; suite: StudioPoint[] }
  | { type: "terminer-polyligne"; fermee: boolean }
  | { type: "deplacer"; dx: number; dy: number };

/** Contexte d'un clic : tolérance d'accrochage (mètres), pour fermer une polyligne sur son premier sommet. */
export interface ContexteClic extends ContexteCreation {
  tolerance: number;
  /** Transformations (Copier, Rotation, Symétrie, Échelle) : sélection courante et options saisies. */
  selection?: readonly string[];
  options?: OptionsTransformation;
}

/** Options saisies des transformations : nombre de copies, source conservée (Symétrie), extrusions aussi (Échelle). */
export interface OptionsTransformation {
  copies: number;
  garder: boolean;
  volumes: boolean;
}

export interface OutilPlanche {
  readonly ids: readonly StudioToolId[];
  /** Le point accroché exclut la sélection une fois le premier point posé (déplacement). */
  readonly horsSelection?: boolean;
  /** Second clic et suivants (`e.trace` est posé). */
  clic(e: EtatTrace & { trace: PointPose }, p: PointPose, c: ContexteClic): ActionOutil;
  /** Aperçu d'une courbe en cours de tracé, jamais une donnée du document. */
  apercu?(e: EtatTrace & { trace: PointPose }, fin: StudioPoint): StudioShape | null;
  /** Aperçu d'une transformation : commandes que le clic en `fin` produirait, appliquées à une copie du brouillon. */
  apercuCommandes?(e: EtatTrace & { trace: PointPose }, fin: StudioPoint, c: ContexteClic): StudioCommand[] | null;
  /** Aide pendant le tracé ; « Premier point placé… » par défaut. */
  aideTrace?(e: EtatTrace & { trace: PointPose }): string;
  /** Aide avant le premier point ; l'aide générale par défaut. */
  aideRepos?(e: EtatAide): string;
}

/** État lu par l'aide : le tracé, et si le déplacement au pointeur est possible (sélection non vide). */
export interface EtatAide extends EtatTrace {
  moveWithPointer: boolean;
}
export const AIDE_DEFAUT = "Deux clics pour dessiner, ou utilisez les valeurs numériques.";

/** Écart arrondi au micromètre : le pointeur et les sommets ne produisent pas de bruit flottant dans les commandes. */
export const ecart = (a: number, b: number) => Math.round((b - a) * 1e6) / 1e6;
/** Arrondi au micromètre (rayons, coordonnées issues d'une construction) : pas de bruit flottant dans les commandes. */
export const micro = (v: number) => Math.round(v * 1e6) / 1e6;
/** Calque de l'objet créé : `layerId` omis pour le calque implicite. */
export const calqueDe = (c: ContexteCreation): { layerId?: string } => (c.layerId ? { layerId: c.layerId } : {});
export const memePoint = (a: StudioPoint, b: StudioPoint) => a.x === b.x && a.y === b.y;
export const ERREUR_POINTS_CONFONDUS = "Les deux points doivent être distincts.";
