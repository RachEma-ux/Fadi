/**
 * Export PNG de la vue de plan (DA-14-01-b) : rastérisation du SVG exporté (même contenu), **proportions
 * conservées** (le prototype étirait en 2000 × 1360). Partie pure : dimensions en pixels. Facteur 2 par défaut
 * (2 px par unité SVG, soit 200 px/m) ; côté le plus long plafonné à 4 096 px (mémoire des téléphones), réduction
 * signalée, jamais un fichier tronqué. Le rendu canvas est dans `navigateur.ts`.
 */
import { cadreSvg } from "./svg";
import type { VueExport } from "./vue";

export const FACTEUR_PNG = 2;
export const COTE_MAX_PNG = 4096;

export interface DimensionsPng {
  readonly largeur: number;
  readonly hauteur: number;
  /** Pixels par mètre effectivement retenus. */
  readonly pixelsParMetre: number;
  /** Le plafond a-t-il réduit la résolution demandée ? */
  readonly reduit: boolean;
}

/** Dimensions du PNG d'une vue (`largeurSvg` × `hauteurSvg` en unités SVG, 100 par mètre). */
export function dimensionsPng(largeurSvg: number, hauteurSvg: number, facteur = FACTEUR_PNG, coteMax = COTE_MAX_PNG): DimensionsPng {
  const plus = Math.max(largeurSvg, hauteurSvg) * facteur;
  const k = plus > coteMax ? (facteur * coteMax) / plus : facteur;
  return { largeur: Math.max(1, Math.round(largeurSvg * k)), hauteur: Math.max(1, Math.round(hauteurSvg * k)), pixelsParMetre: k * 100, reduit: k < facteur };
}

export const dimensionsPngVue = (v: Pick<VueExport, "emprise">, facteur = FACTEUR_PNG): DimensionsPng => {
  const c = cadreSvg(v);
  return dimensionsPng(c.largeur, c.hauteur, facteur);
};
