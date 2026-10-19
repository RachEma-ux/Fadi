/**
 * Façade publique des solides libres de Studio (`objets-3d/`) : types, validation, géométrie placée, maillage dérivé,
 * coupe plane dérivée et quantités. Les commandes vivent dans `commandes/volume-libre.ts`, le registre dans
 * `registre/volume-libre.ts`.
 */
export {
  aireProfil, cotesSolide, empriseSolide, profilLocal, SCHEMA_BOITE, SCHEMA_PRISME, SCHEMA_SOLIDE, STUDIO_FRAME_SOLIDES, STUDIO_LIMITES_SOLIDES,
  studioSolideVers3d, validerSolide,
  type StudioBox, type StudioPlacement3d, type StudioProfilePrism, type StudioSolid,
} from "./solides.js";
export { studioMaillageSolide, type StudioFreeSolid3d } from "./maillage.js";
export { couperStudio, type StudioCoupe, type StudioPlanCoupe, type StudioSegmentCoupe } from "./coupe.js";
export { studioQuantitesSolides, studioVolumeSolide, type StudioQuantiteSolide } from "./quantites.js";
