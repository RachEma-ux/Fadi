/**
 * Références topologiques (L1.3) : résolveur conforme à `ResoudreReference`, géométrie des caractéristiques
 * nommées, recalcul des cotations rattachées, références à réparer (R12).
 */
export { resoudreReference, resoudreReferenceDans, contexteDesPorteurs, geometrieResolue, NOMBRE_MAX_PROPOSITIONS, LIBELLE_DETACHER } from "./resoudre.js";
export { geometrieCaracteristique, caracteristiquesDe, classesPortant, decalagesFaces, projeterSurSegment, ecart, type VueObjets, type GeometrieOuMotif } from "./geometrie.js";
export { resoudreCotation, etatDeResolution, recalculerCotation, recalculerCotationsRattachees, problemesReferences, type ResolutionCotation, type RecalculCotation } from "./cotations.js";
