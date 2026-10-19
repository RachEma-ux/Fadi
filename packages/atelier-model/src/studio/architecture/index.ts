/**
 * Façade publique des objets architecturaux de Studio (A.4) : murs et ouvertures (types, validation, géométrie dérivée,
 * plan, maillage, métré). Les commandes vivent dans `commandes/architecture.ts`, le registre dans
 * `registre/architecture.ts`.
 */
export {
  STUDIO_OPENING_KINDS, STUDIO_WALL_JUSTIFICATIONS,
  type StudioArchitectureItem, type StudioOpening, type StudioOpeningKind, type StudioWall, type StudioWallJustification,
} from "./types.js";
export { SCHEMA_ARCHITECTURE, SCHEMA_MUR, SCHEMA_OUVERTURE } from "./schemas.js";
export { controlerArchitecture, validerElementArchitectural, validerMur, validerOuverture, type ArchitectureLue } from "./validation.js";
export { geometrieMur, lateraux, placerOuverture, type GeometrieMur, type OuverturePlacee, type SegmentMur } from "./geometrie.js";
export { studioPlanArchitecture, type PlanArchitectural } from "./plan.js";
export { studioMaillageArchitecture, type StudioArchitecture3d } from "./maillage.js";
export { studioQuantitesArchitecture, type QuantiteMur, type QuantiteOuverture } from "./quantites.js";
