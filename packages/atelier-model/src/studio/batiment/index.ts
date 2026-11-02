/**
 * Façade publique du bâtiment (lot W3-B, X.1-04) : niveaux comme objets, composants 3D (définition partagée et
 * occurrences) ; la vue par niveau est à la racine (`../vue-niveau.ts`, lecture du document entier). Les éléments structurels typés (poteau, poutre, dalle) sont des objets architecturaux
 * (`architecture/structure.ts`). Commandes : `commandes/batiment.ts` ; registre : `registre/batiment.ts`.
 */
export { SCHEMA_NIVEAU, STUDIO_LIMITES_NIVEAUX, studioNiveauxParCote, validerNiveau, type StudioNiveau } from "./niveaux.js";
export {
  SCHEMA_COMPOSANT, SCHEMA_OCCURRENCE, STUDIO_LIMITES_COMPOSANTS, studioCommandesRendreUnique, studioInstancesComposants, studioMaillageComposant,
  studioMaillageOccurrence, studioPointOccurrence, studioVolumeComposant, validerComposant, validerOccurrence,
  type StudioComposant, type StudioInstancesComposant, type StudioMaillageComposant, type StudioOccurrence, type StudioOccurrence3d, type StudioPlacementOccurrence,
} from "./composants.js";
