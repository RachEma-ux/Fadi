/** Constantes du document 2D natif de Studio (`studio-document/1`) : calque implicite, limites, contrat de commandes. */

/** Calque implicite des objets sans `layerId` ; il peut être matérialisé dans `layers` pour être réglé. */
export const STUDIO_DEFAULT_LAYER_ID = "default" as const;
/** Limites reprises de la Planche 2D de la pile (calques, objets) ; un document au-delà est refusé, jamais tronqué. */
export const STUDIO_LIMITS = Object.freeze({ layers: 200, objects: 20_000, layerName: 80, polylinePoints: 5000, extrudedRing: 1024 } as const);
/**
 * Bornes techniques des courbes (pas des valeurs métier) : `polylinePoints` sommets par polyligne ; `extrudedRing` sommets
 * du contour discrétisé d'une polyligne fermée extrudée (contrôle de simplicité et triangulation bornés) ; renflement
 * (`bulge`) de valeur absolue 10⁶ au plus.
 */
export const STUDIO_BULGE_MAX = 1e6;

export const STUDIO_CONTRACT = "studio-commands/1" as const;
