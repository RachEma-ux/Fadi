import type { CorpusStudio, CouvertureCorpus } from "./types.js";
import { planDeNiveau } from "./s2-niveau.js";

/**
 * S7 — session hors réseau (X.1-07). REF-02 §18.2 : « session hors réseau puis reconnectée ». Le corpus est l'état de
 * départ (plan de niveau synthétique, graine et préfixe `s7-` propres) ; la session elle-même — couper le réseau,
 * dessiner, recharger, enregistrer hors ligne, se reconnecter — est jouée par la recette
 * `apps/web/e2e/studio-corpus-s7.mjs` (sur le modèle de `studio-hors-ligne.mjs`), avec les attendus de
 * `SESSION_HORS_RESEAU_S7`.
 */

export const DEFINITION_S7 = "Scène S7 : session hors réseau puis reconnectée.";

/** Couverture propre à la session hors réseau (le plan de niveau n'en est que l'état de départ). */
export const COUVERTURE_S7: CouvertureCorpus = Object.freeze({
  representes: [
    "état de départ de la session hors réseau : plan de niveau synthétique (murs, ouvertures, axes, cotes liées, textes)",
    "session hors réseau puis reconnectée, jouée par la recette studio-corpus-s7.mjs : dessin au clavier, rechargement depuis l'appareil, enregistrement hors ligne, reconnexion",
    "après reconnexion : une seule révision ajoutée, corpus de départ intact à l'octet, ajout hors ligne présent",
    "écriture concurrente pendant une seconde coupure : un autre appareil ajoute une ligne, la reconnexion signale le conflit sans écraser sa révision, le report garde les deux ajouts",
  ],
  absents: [
    { element: "session dans le document", raison: "studio-document/1 ne porte ni session ni état de connexion : la session est jouée par la recette e2e, le corpus n'en est que l'état de départ" },
  ],
}) as CouvertureCorpus;

export const corpusS7 = (taille: number): CorpusStudio => planDeNiveau("S7", DEFINITION_S7, taille, COUVERTURE_S7);

/**
 * Ce que la session hors réseau ajoute (au clavier et à la souris, hors ligne) : un rectangle de 2 × 1 m, posé loin du
 * plan. Attendu après reconnexion : une seule révision de plus, le corpus de départ intact, le rectangle présent.
 */
export const SESSION_HORS_RESEAU_S7 = Object.freeze({
  rectangle: Object.freeze({ x: -10, y: -10, largeur: 2, hauteur: 1 }),
  revisionsAjoutees: 1,
  /**
   * Seconde coupure avec écriture concurrente : hors ligne, l'appareil dessine un second rectangle ; pendant ce temps un
   * autre appareil (même compte, en ligne) ajoute une ligne. À la reconnexion : conflit, la révision de l'autre appareil
   * n'est pas écrasée ; le report applique le rectangle sur la nouvelle tête. Attendu : deux révisions de plus (l'autre
   * appareil, puis le report), les deux ajouts présents.
   */
  concurrente: Object.freeze({
    rectangle: Object.freeze({ x: -10, y: -13, largeur: 1, hauteur: 1 }),
    ligne: Object.freeze({ id: "s7-autre-appareil-ligne", start: Object.freeze({ x: -10, y: -15 }), end: Object.freeze({ x: -6, y: -15 }) }),
    revisionsAjoutees: 2,
  }),
});
