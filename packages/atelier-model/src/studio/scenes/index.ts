/**
 * Façade publique de la visualisation de Studio (lot E.5, `scenes/`) : scènes enregistrées et apparences d'affichage
 * (liste facultative `scenes` du document, repère `local-3d`) et provenance d'un rendu du modèle. Les lectures du
 * document entier (rappel, apparence résolue, maillage d'une scène) vivent dans `composition/affichage-scenes.ts`, que la
 * façade publique (`../facade-scenes.ts`) ajoute ; les commandes dans `commandes/scenes.ts`, le registre dans
 * `registre/scenes.ts`.
 */
export {
  SCHEMA_APPARENCE, SCHEMA_ELEMENT_VISUALISATION, SCHEMA_SCENE, STUDIO_FINITIONS_AFFICHAGE, STUDIO_FRAME_SCENES, STUDIO_LIMITES_SCENES,
  STUDIO_MODES_AFFICHAGE, STUDIO_PROJECTIONS_SCENE, validerElementVisualisation,
  type StudioApparence, type StudioCameraScene, type StudioCibleApparence, type StudioElementVisualisation, type StudioFinitionAffichage,
  type StudioModeAffichage, type StudioProjectionScene, type StudioScene,
} from "./scenes.js";
export {
  STUDIO_NATURE_RENDU, STUDIO_RENDU_SCHEMA, studioNomFichierRendu, studioProvenanceRendu, type EntreeProvenanceRendu, type StudioProvenanceRendu,
} from "./provenance.js";
