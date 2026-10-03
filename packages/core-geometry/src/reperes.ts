/**
 * Repères tagués au niveau du type (R5, relecture L1.5).
 *
 * `core-geometry` calcule sur des tuples `Point2` (mètres, repère plan). Il ne peut pas importer `Coordinate` de
 * `@parcours/domain-model` (qui dépend de lui) : il porte donc une **marque de repère facultative**, purement
 * statique, sur le tuple. Règles :
 * - un `Point2` non marqué reste accepté partout (rétrocompatibilité des appelants) ;
 * - un point marqué `local` n'est pas assignable à un point marqué `cadastral`, et inversement : le compilateur
 *   refuse le mélange dès qu'un appelant marque ses données ;
 * - le repère `geographic` (degrés) n'a pas de marque ici : aucune fonction de ce paquet ne calcule en degrés
 *   (aires, décalages et coupes y seraient faux). Les conversions restent explicites, hors de ce paquet.
 *
 * La marque n'existe pas à l'exécution : `enRepere` ne copie rien, il contrôle seulement que les coordonnées sont
 * finies.
 */
import type { Point2 } from "./geometry.js";

declare const marqueRepere: unique symbol;

/** Repères plans métriques traités par ce paquet (sous-ensemble de `Coordinate["frame"]` de domain-model). */
export type RepereGeometrie = "local" | "cadastral";

/** Point 2D dont le repère est marqué statiquement. */
export type Point2En<R extends RepereGeometrie> = Point2 & { readonly [marqueRepere]?: R };
/** Point du repère local du projet (mètres, origine du projet). */
export type Point2Local = Point2En<"local">;
/** Point d'un repère cadastral (mètres, CRS projeté déclaré par la source). */
export type Point2Cadastral = Point2En<"cadastral">;

/** Erreur levée par `enRepere` sur une coordonnée non finie. */
export class ErreurPointGeometrie extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurPointGeometrie";
  }
}

/**
 * Marque une liste de points comme appartenant au repère `repere` (aucune conversion, aucune copie).
 * Lève `ErreurPointGeometrie` si une coordonnée n'est pas un nombre fini.
 */
export function enRepere<R extends RepereGeometrie>(repere: R, points: readonly Point2[]): readonly Point2En<R>[] {
  points.forEach((p, i) => {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      throw new ErreurPointGeometrie(`point ${i} du repère ${repere} non fini : (${String(p[0])}, ${String(p[1])})`);
    }
  });
  return points as readonly Point2En<R>[];
}
