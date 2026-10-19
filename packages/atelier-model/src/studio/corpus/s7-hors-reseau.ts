import type { CorpusStudio } from "./types.js";
import { planDeNiveau } from "./s2-niveau.js";

/**
 * S7 — session hors réseau (X.1-07). REF-02 §18.2 : « session hors réseau puis reconnectée ». Le corpus est l'état de
 * départ (plan de niveau synthétique, graine et préfixe `s7-` propres) ; la session elle-même — couper le réseau,
 * dessiner, recharger, enregistrer hors ligne, se reconnecter — est jouée par la recette
 * `apps/web/e2e/studio-corpus-s7.mjs` (sur le modèle de `studio-hors-ligne.mjs`), avec les attendus de
 * `SESSION_HORS_RESEAU_S7`.
 */

export const DEFINITION_S7 = "Scène S7 : session hors réseau puis reconnectée.";

export const corpusS7 = (taille: number): CorpusStudio => planDeNiveau("S7", DEFINITION_S7, taille);

/**
 * Ce que la session hors réseau ajoute (au clavier et à la souris, hors ligne) : un rectangle de 2 × 1 m, posé loin du
 * plan. Attendu après reconnexion : une seule révision de plus, le corpus de départ intact, le rectangle présent.
 */
export const SESSION_HORS_RESEAU_S7 = Object.freeze({
  rectangle: Object.freeze({ x: -10, y: -10, largeur: 2, hauteur: 1 }),
  revisionsAjoutees: 1,
});
