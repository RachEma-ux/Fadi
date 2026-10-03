/**
 * Tolérances numériques de `core-geometry` (relecture L1.5).
 *
 * Ce paquet ne dépend d'aucun autre (manifeste : `allowedDependencies: []`) : il ne lit donc pas les tolérances
 * communes D-012 de `@parcours/atelier-model` (`TOLERANCES`). Il les **reçoit en paramètre** : les champs de
 * `TolerancesGeometrie` portent les mêmes noms et les mêmes unités que D-012, si bien que l'objet `TOLERANCES`
 * d'`atelier-model` se passe tel quel (typage structurel), sans recopier ses valeurs ici.
 *
 * Sans tolérance fournie, chaque fonction garde le seuil **historique** du prototype, à l'identique
 * (`TOLERANCES_HISTORIQUES`) : aucun comportement existant ne change. Ce sont des tolérances numériques d'outil,
 * jamais des valeurs réglementaires ni constructives.
 */

/** Sous-ensemble de D-012 utile à la géométrie. Tous les champs sont facultatifs ; un champ absent = seuil historique. */
export interface TolerancesGeometrie {
  /** Deux abscisses / points confondus (m). */
  readonly tolCoincidence?: number;
  /** Longueur minimale d'un segment (m) ; en dessous, le segment est dégénéré. */
  readonly longueurMin?: number;
  /** Parallélisme, colinéarité (rad) ; le test devient normalisé (|sin θ| < tolAngle). */
  readonly tolAngle?: number;
  /** Aire minimale d'un polygone (m²). */
  readonly aireMin?: number;
}

/**
 * Seuils du prototype, conservés à l'identique quand aucune tolérance n'est fournie. Chaque entrée nomme son site
 * d'usage ; aucune n'est une valeur D-012 (la coïncidence avec `aireMin` de `inwardOffset` est fortuite).
 */
export const TOLERANCES_HISTORIQUES = Object.freeze({
  /** `polygonIntervalsAtAxis` : largeur minimale d'un intervalle (m) ; `buildModelGeometry` : fusion d'abscisses (m). */
  intervalleMin: 1e-8,
  /** `buildModelGeometry` : longueur minimale d'un mur (m). */
  longueurMurMin: 1e-7,
  /** `buildModelGeometry` (escaliers), `inwardOffset`, `siteZoning` : longueur nulle seulement. */
  longueurNulle: 0,
  /** `isConvexPolygon` : produit vectoriel (m²) en dessous duquel un sommet est jugé aligné. */
  produitVectorielConvexite: 1e-8,
  /** `intersectLines` : déterminant (m²) en dessous duquel deux droites sont jugées parallèles. */
  determinantParallele: 1e-9,
  /** `inwardOffset` : aire minimale du résultat (m²). */
  aireDecalageMin: 1e-6,
  /** `clipHalfPlane` : marge (m) du test de côté. */
  coteDemiPlan: 1e-9,
  /** `clipHalfPlane` : aire minimale d'un morceau découpé (m²). */
  aireDecoupeMin: 1e-8,
  /** `triangulate` : produit vectoriel (m²) des tests d'oreille ; non paramétrable (voir RELECTURE.md). */
  produitVectorielTriangulation: 1e-9,
});

/** Erreur levée quand une tolérance fournie n'est pas un nombre fini positif ou nul. */
export class ErreurTolerance extends RangeError {
  constructor(cle: keyof TolerancesGeometrie, valeur: unknown) {
    super(`tolérance « ${cle} » invalide : ${String(valeur)} (nombre fini ≥ 0 attendu)`);
    this.name = "ErreurTolerance";
  }
}

/** Valeur de la tolérance `cle` si elle est fournie, sinon `historique`. Lève `ErreurTolerance` si elle est mal formée. */
export function resoudreTolerance(
  tol: TolerancesGeometrie | undefined,
  cle: keyof TolerancesGeometrie,
  historique: number,
): number {
  const v = tol?.[cle];
  if (v === undefined) return historique;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new ErreurTolerance(cle, v);
  return v;
}

/**
 * Test « presque nul » d'un produit vectoriel `cross = |u|·|v|·sin θ` (m²).
 * Avec `tolAngle` fourni : test normalisé |sin θ| < tolAngle (indépendant de l'échelle) ; sinon seuil absolu historique.
 */
export function produitVectorielNegligeable(
  cross: number,
  normeU: number,
  normeV: number,
  tol: TolerancesGeometrie | undefined,
  historique: number,
): boolean {
  if (tol?.tolAngle === undefined) return Math.abs(cross) < historique;
  const tolAngle = resoudreTolerance(tol, "tolAngle", 0);
  return Math.abs(cross) < tolAngle * normeU * normeV;
}
