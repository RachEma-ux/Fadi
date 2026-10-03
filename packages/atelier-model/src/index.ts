/**
 * @parcours/atelier-model — modèle typé de l'Atelier (cahier des charges §5.1–5.3, lot 1).
 *
 * - `ontologie/` : classes, paramètres canoniques et unités, repères tagués, provenance et statut,
 *   relations, caractéristiques nommées, classes IFC, définitions de types et catalogue versionné, validation ;
 * - `contrats/` : interfaces figées de la phase 2 (enveloppe `atelier-commands/1`, commandes, réducteurs,
 *   effets, problèmes, références, quantités `quantites/1`, importeur P.118, état du modèle, tolérances).
 *
 * Paquet pur : ni React, ni DOM, ni API Node (R6) ; dépendances : `@parcours/domain-model`,
 * `@parcours/core-geometry` seulement (§5.1).
 */
export * from "./ontologie/index.js";
export * from "./contrats/index.js";
