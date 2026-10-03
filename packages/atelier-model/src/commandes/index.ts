/**
 * Commandes et réducteurs du contrat `atelier-commands/1` (L1.2) : réducteurs purs, inverses exacts, effets,
 * application atomique d'un lot, empreinte `atelier-empreinte/1`, historique local (`CommandHistory`).
 */
export { REDUCTEURS, appliquerCommande, appliquerLot, enveloppeInverse, etatVide } from "./moteur.js";
export { calculerEmpreinte, empreinteValeur, jsonCanonique, contenuCanonique, condensat, ErreurEmpreinte } from "./empreinte.js";
export { HistoriqueAtelier, ErreurHistorique } from "./historique.js";
export { detecterPieces, type PieceProposee } from "./detection.js";
export { commandeCreationDe } from "./inverses.js";
export { CLASSES_TRANSFORMABLES } from "./transformations.js";
export { restaurationDe, sansRestauration, relationsDerivees, motif, erreurCommande, type Motif, type CommandeRestauratrice } from "./transaction.js";
