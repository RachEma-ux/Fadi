/**
 * Panneaux de la page GeoData (feuille de route équipe A, PR P4 : extraction, aucun changement visible) : transitions
 * pures du panneau Données (onglets), du volet de droite et de la touche Échap. Le téléphone est un paramètre (un seul
 * panneau ouvert à la fois, GEO 12), jamais lu ici.
 */
export type OngletPanneau = "catalogue" | "couches" | "legende";
export type VoletPage = "fiche" | "valeur" | "donnees" | "cartes" | "collection" | "etudes" | "import" | "export" | "terrain" | "emplacements";

export interface EtatPanneaux {
  readonly onglet: OngletPanneau;
  readonly panneauOuvert: boolean;
  readonly volet: VoletPage | null;
}

/** Ouvre le panneau sur un onglet ; au téléphone, le volet se ferme. */
export function ouvrirOnglet(e: EtatPanneaux, o: OngletPanneau, telephone: boolean): EtatPanneaux {
  return { onglet: o, panneauOuvert: true, volet: telephone ? null : e.volet };
}

/** Bouton Données, Couches, Légende : referme le panneau s'il montre déjà cet onglet, sinon l'ouvre dessus. */
export function basculerOnglet(e: EtatPanneaux, o: OngletPanneau, telephone: boolean): EtatPanneaux {
  return e.panneauOuvert && e.onglet === o ? { ...e, panneauOuvert: false } : ouvrirOnglet(e, o, telephone);
}

/** Entrée du menu : ouvre le volet, ou le referme s'il est déjà ouvert ; au téléphone, le panneau se ferme. */
export function basculerVolet(e: EtatPanneaux, v: VoletPage, telephone: boolean): EtatPanneaux {
  return { ...e, volet: e.volet === v ? null : v, panneauOuvert: telephone ? false : e.panneauOuvert };
}

/** Carte seule (Alt+X, barre du bas) : panneau et volet fermés. */
export function carteSeule(e: EtatPanneaux): EtatPanneaux {
  return { ...e, panneauOuvert: false, volet: null };
}

/** Ce que ferme Échap, dans l'ordre (le premier qui s'applique) ; null : rien. */
export type CibleEchap = "trace" | "menu" | "resultats" | "panneau-mini" | "volet";
export function cibleEchap(c: { traceEnCours: boolean; menuOuvert: boolean; resultats: boolean; panneauMini: boolean; volet: boolean; telephone: boolean }): CibleEchap | null {
  if (c.traceEnCours) return "trace";
  if (c.menuOuvert) return "menu";
  if (c.resultats) return "resultats";
  if (c.panneauMini) return "panneau-mini";
  if (c.volet && c.telephone) return "volet";
  return null;
}
