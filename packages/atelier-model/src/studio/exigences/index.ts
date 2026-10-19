/**
 * Façade publique du lot E.1 de Studio : propriétés BIM déclarées (`proprietes.ts`, commandes `studio.propriete.*`),
 * exigences versionnées par étude (`exigences.ts`) et écarts calculés (`ecarts.ts`). Aucune exigence ni valeur n'est
 * fournie par Fadi.
 */
export { STUDIO_LIMITES_EXIGENCES, STUDIO_LIMITES_PROPRIETES } from "./limites.js";
export { ciblePropriete, proprietesDe, validerPropriete, valeurPropriete, type CiblePropriete, type StudioPropriete } from "./proprietes.js";
export { SCHEMA_PROPRIETE, SCHEMA_RETRAIT_PROPRIETE } from "./schemas.js";
export {
  accepterExigence, COMPARAISONS_EXIGENCE, exigenceUtilisable, preparerVersion, UNITE_NOMBRE, uniteMetrique, validerExigence, validerExigences, validerMetrique,
  type AcceptationExigence, type ComparaisonExigence, type ExigenceStudio, type JeuExigences, type MetriqueExigence, type RefusVersion,
} from "./exigences.js";
export {
  comparer, controlerExigences, mesurerMetrique,
  type ConclusionControle, type EcartExigence, type EtatExecution, type MesureExigence, type MotifNonEvaluee, type ResultatControle, type StatutExigence,
} from "./ecarts.js";
