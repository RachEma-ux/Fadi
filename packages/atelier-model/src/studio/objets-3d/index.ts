/**
 * Solides libres de Studio (`objets-3d/`) : types, validation, géométrie placée et maillage dérivé. La façade publique
 * (`../solides-libres.ts`) y ajoute la coupe plane dérivée et les quantités, lectures du document entier (couche
 * `composition/`). Les commandes vivent dans `commandes/volume-libre.ts`, le registre dans `registre/volume-libre.ts`.
 */
export {
  aireProfil, cotesSolide, empriseSolide, profilLocal, SCHEMA_BOITE, SCHEMA_PRISME, SCHEMA_SOLIDE, STUDIO_FRAME_SOLIDES, STUDIO_LIMITES_SOLIDES,
  studioSolideVers3d, validerSolide,
  type StudioBox, type StudioPlacement3d, type StudioProfilePrism, type StudioSolid,
  // Lot F1 : direction d'extrusion, relation au profil source, faces.
  directionUnitaire, estDroit, estSolideLie, hauteurPerpendiculaire, STUDIO_RELATIONS_SOURCE, translationSommet, validerDirection,
  type StudioFaceSolide, type StudioLienSolide, type StudioMotifLien, type StudioRelationSource, type StudioSourceSolide,
} from "./solides.js";
export { studioMaillageSolide, type StudioFreeSolid3d } from "./maillage.js";
// Lot F2 : solides exacts (résultats du noyau exact, opérandes conservés).
export {
  OP_NOYAU, SCHEMA_RESULTAT_EXACT, SCHEMA_SOLIDE_EXACT, STUDIO_LIMITES_EXACTS, STUDIO_MOTEUR_EXACT, STUDIO_OPERATIONS_BOOLEENNES,
  studioBoiteEnglobante, studioIdsOperandes, studioMaillageExact, studioOperandeNoyau, validerResultatExact, validerSolideExact,
  type StudioBoiteEnglobante, type StudioExact3d, type StudioMaillageExact, type StudioOperandeExact, type StudioOperandeNoyau, type StudioOperationBooleenne,
  type StudioOperationNoyau, type StudioResultatExact, type StudioSolideExact,
} from "./exacts.js";
