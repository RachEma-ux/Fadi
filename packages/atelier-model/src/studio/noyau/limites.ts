/** Constantes du document 2D natif de Studio (`studio-document/1`) : calque implicite, limites, contrat de commandes. */

/** Calque implicite des objets sans `layerId` ; il peut être matérialisé dans `layers` pour être réglé. */
export const STUDIO_DEFAULT_LAYER_ID = "default" as const;
/** Limites reprises de la Planche 2D de la pile (calques, objets) ; un document au-delà est refusé, jamais tronqué. */
export const STUDIO_LIMITS = Object.freeze({ layers: 200, objects: 20_000, layerName: 80, polylinePoints: 5000, extrudedRing: 1024, extrudedRingsTotal: 200_000 } as const);
/**
 * Bornes techniques des courbes (pas des valeurs métier) : `polylinePoints` sommets par polyligne ; `extrudedRing` sommets
 * du contour discrétisé d'une polyligne fermée extrudée (contrôle de simplicité et triangulation bornés) ;
 * `extrudedRingsTotal` sommets discrétisés pour toutes les polylignes fermées extrudées d'un document (budget des
 * écritures ; une révision enregistrée reste lisible) ; renflement
 * (`bulge`) de valeur absolue 10⁶ au plus.
 */
export const STUDIO_BULGE_MAX = 1e6;

export const STUDIO_CONTRACT = "studio-commands/1" as const;

/**
 * Tolérances contractuelles des gestes (contrat `studio-commands/1`, TR-IF-002, ADR-STUDIO-PILOTE-01 P-12), en mètres,
 * dans le repère `local-2d` : écart maximal entre la valeur engagée par la commande et la valeur visée.
 *  - `saisie` : valeur saisie au clavier (champs numériques) — engagée **exactement** (écart nul) ;
 *  - `pointe` : valeur pointée — après accrochage, engagée à 1e-9 m près (points d'accrochage nettoyés du bruit
 *    flottant au nanomètre). Un point pointé sans accrochage n'a pas de valeur visée : il est engagé tel que posé
 *    (grille ou centimètre).
 * Précision du modèle existant ; aucune valeur réglementaire en jeu.
 */
export const STUDIO_TOLERANCES_GESTES = Object.freeze({
  "studio.dessin.ligne": Object.freeze({ saisie: 0, pointe: 1e-9 } as const),
} as const);
export type StudioGesteTolere = keyof typeof STUDIO_TOLERANCES_GESTES;
export type StudioOrigineValeur = "saisie" | "pointe";

/** La valeur engagée respecte-t-elle la tolérance contractuelle du geste ? (distance euclidienne, mètres) */
export function studioDansToleranceGeste(geste: StudioGesteTolere, origine: StudioOrigineValeur, engagee: { x: number; y: number }, visee: { x: number; y: number }): boolean {
  const ecart = Math.hypot(engagee.x - visee.x, engagee.y - visee.y);
  return Number.isFinite(ecart) && ecart <= STUDIO_TOLERANCES_GESTES[geste][origine];
}
