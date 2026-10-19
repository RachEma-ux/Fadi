/**
 * Façade publique du lot E.1 de Studio (API inchangée) : propriétés BIM déclarées, exigences versionnées par étude
 * (`exigences/`) et écarts calculés, lecture du document entier rangée dans la couche de composition
 * (`composition/ecarts.ts`). Aucune exigence ni valeur n'est fournie par Fadi.
 */
export * from "./exigences/index.js";
export {
  comparer, controlerExigences, mesurerMetrique,
  type ConclusionControle, type EcartExigence, type EtatExecution, type MesureExigence, type MotifNonEvaluee, type ResultatControle, type StatutExigence,
} from "./composition/ecarts.js";
