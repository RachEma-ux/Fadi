/**
 * Solides libres de Studio (`objets-3d/`) : types, validation, géométrie placée et maillage dérivé. La façade publique
 * (`../solides-libres.ts`) y ajoute la coupe plane dérivée et les quantités, lectures du document entier (couche
 * `composition/`). Les commandes vivent dans `commandes/volume-libre.ts`, le registre dans `registre/volume-libre.ts`.
 */
export {
  aireProfil, cotesSolide, empriseSolide, profilLocal, SCHEMA_BOITE, SCHEMA_PRISME, SCHEMA_SOLIDE, STUDIO_FRAME_SOLIDES, STUDIO_LIMITES_SOLIDES,
  studioSolideVers3d, validerSolide,
  type StudioBox, type StudioPlacement3d, type StudioProfilePrism, type StudioSolid,
} from "./solides.js";
export { studioMaillageSolide, type StudioFreeSolid3d } from "./maillage.js";
