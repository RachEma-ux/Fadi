/**
 * Façade publique des solides libres de Studio (API inchangée) : types, validation, géométrie placée et maillage dérivé
 * (`objets-3d/`), coupe plane dérivée et quantités, lectures du document entier rangées dans la couche de composition
 * (`composition/coupe.ts`, `composition/quantites-solides.ts`). Les commandes vivent dans `commandes/volume-libre.ts`,
 * le registre dans `registre/volume-libre.ts`.
 */
export * from "./objets-3d/index.js";
export { couperStudio, type StudioCoupe, type StudioPlanCoupe, type StudioSegmentCoupe } from "./composition/coupe.js";
export { studioQuantitesSolides, studioVolumeSolide, type StudioQuantiteSolide } from "./composition/quantites-solides.js";
export { studioEmpriseConforme, studioLienSolide, studioLiensSolides, studioProfilDepuisPolyligne, type StudioProfilDerive } from "./commandes/liens-solides.js";
