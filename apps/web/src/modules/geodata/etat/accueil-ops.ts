/**
 * Carte d'arrivée (feuille de route équipe A, PR P1 ; brief E-01, Q1, Q9) : règles pures, sans React ni DOM.
 *
 * La condition dépend de l'ÉTAT de la page, jamais du chemin de démarrage (adresse de vue, dernière carte, rien) : un
 * rechargement, une dernière carte disparue (404) ou un thème activé d'office donnent toujours la même réponse.
 * Le contour vient du découpage territorial lu en base (D-GD-28, D-GD-29) : aucun pays ni niveau écrit dans le code.
 */

/** Niveau du découpage servi par l'API (`GET /territoires/:pays/decoupage`). */
export interface NiveauDecoupage { readonly code: string; readonly rang: number; readonly pluriel: string; readonly coucheId: string | null }

export interface EtatPageAccueil {
  /** L'onglet « Cartes » de GeoData est affiché (pas Chiffres clés, Population…). */
  readonly ongletCartes: boolean;
  /** Une carte enregistrée est ouverte. */
  readonly carteOuverte: boolean;
  /** Couches visibles de la composition affichée : celles que le moteur dessine. */
  readonly couchesVisibles: number;
}

/**
 * Carte vide : aucune carte enregistrée ouverte et aucune couche visible. Le contour d'accueil n'est dessiné que dans
 * cet état ; il disparaît dès qu'une couche est affichée (il ne recouvre jamais une donnée).
 */
export function carteVide(e: EtatPageAccueil): boolean {
  return e.ongletCartes && !e.carteOuverte && e.couchesVisibles === 0;
}

/**
 * Consigne d'arrivée : carte vide, moteur disponible (sans WebGL, « touchez la carte » serait faux : le message de la
 * page en tient lieu) et consigne pas encore écartée dans la session (première fiche, premier outil, première
 * recherche, ou fermeture).
 */
export function consigneVisible(e: EtatPageAccueil & { readonly webgl: boolean; readonly ecartee: boolean }): boolean {
  return carteVide(e) && e.webgl && !e.ecartee;
}

/**
 * Niveau dont le contour sert de carte d'arrivée : le plus global (rang le plus petit) qui a une couche publiée. Le bord
 * extérieur de ses unités trace le pays (Q1 : contour du pays et de ses régions). null : rien à dessiner (découpage
 * absent, aucune version publiée) ; la consigne reste affichée, sans contour.
 */
export function niveauAccueil(niveaux: readonly NiveauDecoupage[] | null | undefined): (NiveauDecoupage & { readonly coucheId: string }) | null {
  let retenu: (NiveauDecoupage & { readonly coucheId: string }) | null = null;
  for (const n of niveaux ?? []) {
    if (!n.coucheId) continue;
    if (!retenu || n.rang < retenu.rang) retenu = { ...n, coucheId: n.coucheId };
  }
  return retenu;
}
