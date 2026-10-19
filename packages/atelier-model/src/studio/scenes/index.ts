/**
 * Façade publique de la visualisation de Studio (lot E.5, `scenes/`) : scènes enregistrées et apparences d'affichage
 * (liste facultative `scenes` du document, repère `local-3d`), lectures (rappel, apparence résolue, maillage d'une
 * scène) et provenance d'un rendu du modèle. Les commandes vivent dans `commandes.ts`, le registre dans `registre.ts`.
 */
export {
  SCHEMA_APPARENCE, SCHEMA_ELEMENT_VISUALISATION, SCHEMA_SCENE, STUDIO_FINITIONS_AFFICHAGE, STUDIO_FRAME_SCENES, STUDIO_LIMITES_SCENES,
  STUDIO_MODES_AFFICHAGE, STUDIO_PROJECTIONS_SCENE, validerElementVisualisation,
  type StudioApparence, type StudioCameraScene, type StudioCibleApparence, type StudioElementVisualisation, type StudioFinitionAffichage,
  type StudioModeAffichage, type StudioProjectionScene, type StudioScene,
} from "./scenes.js";
export { studioApparenceResolue, studioApparences, studioMeshScene, studioRappelerScene, studioScenes, type StudioApparenceResolue } from "./affichage.js";
export {
  STUDIO_NATURE_RENDU, STUDIO_RENDU_SCHEMA, studioNomFichierRendu, studioProvenanceRendu, type EntreeProvenanceRendu, type StudioProvenanceRendu,
} from "./provenance.js";
