/**
 * Triade d'orientation à l'écran (chantier Axes, lot AX-3 ; concept Axes 1.0, § 6.2). Pur : ni React, ni DOM, ni
 * three.js. Donne, pour un repère et une rotation de caméra, les segments 2D de la triade (X, Y, Z), étiquetés par leur
 * lettre — jamais la couleur seule — avec le demi-axe négatif en pointillé, triés du plus loin au plus proche. Le même
 * calcul sert à la surcouche SVG et à l'image exportée (où la triade n'entre que sur option).
 */
import type { Repere, Vec3 } from "@parcours/sandbox-planche-model";

export type CoinTriade = "haut-gauche" | "haut-droite" | "bas-gauche" | "bas-droite";
export const COINS_TRIADE: readonly CoinTriade[] = ["haut-gauche", "haut-droite", "bas-gauche", "bas-droite"];

export interface PreferencesTriade {
  readonly visible: boolean;
  readonly coin: CoinTriade;
  /** La triade représente le repère de travail (défaut) ou celui du modèle. */
  readonly represente: "travail" | "modele";
  /** Incluse dans l'image exportée (PNG) ; exclue par défaut. */
  readonly export: boolean;
}
export const TRIADE_DEFAUT: PreferencesTriade = { visible: true, coin: "haut-droite", represente: "travail", export: false };

export function lireTriade(v: unknown): PreferencesTriade {
  if (!v || typeof v !== "object") return TRIADE_DEFAUT;
  const o = v as Partial<Record<keyof PreferencesTriade, unknown>>;
  return {
    visible: o.visible !== false,
    coin: COINS_TRIADE.includes(o.coin as CoinTriade) ? (o.coin as CoinTriade) : TRIADE_DEFAUT.coin,
    represente: o.represente === "modele" ? "modele" : "travail",
    export: o.export === true,
  };
}

export interface SegmentTriade {
  readonly axe: "x" | "y" | "z";
  /** Extrémité positive (px, relative au centre ; y vers le bas). */
  readonly fin: { readonly x: number; readonly y: number };
  /** Extrémité du demi-axe négatif, plus court (pointillé). */
  readonly negatif: { readonly x: number; readonly y: number };
  /** Position de l'étiquette (lettre de l'axe). */
  readonly etiquette: { readonly x: number; readonly y: number };
  /** Profondeur vers l'observateur (> 0 : l'axe pointe vers l'écran). */
  readonly profondeur: number;
}

/**
 * Segments de la triade. `versVue` exprime une direction du monde dans le repère de la caméra (x à droite, y en haut,
 * z vers l'observateur). `rayon` : longueur à l'écran d'un axe vu de face (px).
 */
export function segmentsTriade(repere: Pick<Repere, "x" | "y" | "z">, versVue: (d: Vec3) => Vec3, rayon = 26): SegmentTriade[] {
  return (["x", "y", "z"] as const)
    .map((axe) => {
      const d = versVue(repere[axe]);
      const fin = { x: d.x * rayon, y: -d.y * rayon };
      return {
        axe,
        fin,
        negatif: { x: -fin.x * 0.45, y: -fin.y * 0.45 },
        etiquette: { x: d.x * (rayon + 9), y: -d.y * (rayon + 9) },
        profondeur: d.z,
      };
    })
    .sort((a, b) => a.profondeur - b.profondeur);
}

/** Taille de la surcouche (px) et marge depuis le coin choisi. */
export const TAILLE_TRIADE = 84;
export const MARGE_TRIADE = 12;

/** Origine (coin haut gauche) de la surcouche dans une zone de largeur × hauteur, selon le coin et des réserves (px). */
export function placerTriade(coin: CoinTriade, largeur: number, hauteur: number, reserves: { haut: number; bas: number; gauche: number; droite: number }): { x: number; y: number } {
  const x = coin.endsWith("gauche") ? reserves.gauche + MARGE_TRIADE : largeur - reserves.droite - MARGE_TRIADE - TAILLE_TRIADE;
  const y = coin.startsWith("haut") ? reserves.haut + MARGE_TRIADE : hauteur - reserves.bas - MARGE_TRIADE - TAILLE_TRIADE;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}
