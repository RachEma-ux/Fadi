/**
 * Façade publique de la visualisation de Studio (lot E.5, API inchangée) : scènes et apparences (`scenes/`), lectures du
 * document entier — rappel, apparence résolue, maillage d'une scène — rangées dans la couche de composition
 * (`composition/affichage-scenes.ts`), et provenance d'un rendu du modèle.
 */
export * from "./scenes/index.js";
export { studioApparenceResolue, studioApparences, studioDocumentToutVisible, studioFiltrerMaillageScene, studioMeshScene, studioRappelerScene, studioScenes, type StudioApparenceResolue } from "./composition/affichage-scenes.js";
