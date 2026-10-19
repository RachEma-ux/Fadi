/**
 * Accrochage et saisie de précision de la planche 2D (Studio) : moteur pur (`moteur.ts`, `entites.ts`,
 * `intersections.ts`), saisie directe (`mesures.ts`) et bascules de l'éditeur (`bascules.ts`).
 */
import type { PointPose } from "../Dessin2D";
import type { Repere } from "./moteur";

export * from "./bascules";
export * from "./entites";
export * from "./intersections";
export * from "./mesures";
export * from "./moteur";

/** Point posé ou survolé, avec le repère d'accrochage qui l'a donné (affiché par l'aperçu, jamais une donnée). */
export interface PointRepere extends PointPose {
  repere?: Repere | null;
}
