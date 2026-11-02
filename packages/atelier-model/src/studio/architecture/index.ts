/**
 * Façade publique des objets architecturaux de Studio (A.4) : murs et ouvertures (types, validation, géométrie dérivée,
 * plan, maillage, métré) ; échelles d'accès (EX-027, lot G2). Les commandes vivent dans `commandes/architecture.ts`, le
 * registre dans `registre/architecture.ts`.
 */
export {
  STUDIO_OPENING_KINDS, STUDIO_TYPES_STRUCTURELS, STUDIO_WALL_JUSTIFICATIONS, estStructurel,
  type StudioArchitectureItem, type StudioArchitectureRattachable, type StudioBeam, type StudioColumn, type StudioSlab, type StudioStructuralElement, type StudioLadder, type StudioOpening, type StudioOpeningKind, type StudioWall, type StudioWallJustification,
} from "./types.js";
export { SCHEMA_ARCHITECTURE, SCHEMA_DALLE, SCHEMA_ECHELLE, SCHEMA_ELEMENT_STRUCTUREL, SCHEMA_MUR, SCHEMA_OUVERTURE, SCHEMA_POTEAU, SCHEMA_POUTRE } from "./schemas.js";
// Lot W3-B : éléments structurels typés (poteau, poutre, dalle), géométrie seulement.
export {
  axePoutre, cotesStructurelles, empriseStructurelle, metreStructurel, STUDIO_LIMITES_STRUCTURE, transformerStructurel, validerDalle, validerPoteau, validerPoutre, volumeStructurel,
  type MetreStructurel,
} from "./structure.js";
export { controlerArchitecture, STUDIO_ECHELONS_MAX, validerEchelle, validerElementArchitectural, validerMur, validerOuverture, type ArchitectureLue } from "./validation.js";
export { geometrieMur, lateraux, placerOuverture, type GeometrieMur, type OuverturePlacee, type SegmentMur } from "./geometrie.js";
export { geometrieEchelle, metreEchelle, volumesEchelle, type GeometrieEchelle, type MetreEchelle } from "./echelle.js";
export { studioPlanArchitecture, type PlanArchitectural } from "./plan.js";
export { studioMaillageArchitecture, type StudioArchitecture3d } from "./maillage.js";
export { studioQuantitesArchitecture, type QuantiteEchelle, type QuantiteMur, type QuantiteOuverture, type QuantiteStructurelle } from "./quantites.js";
