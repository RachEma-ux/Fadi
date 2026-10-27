/**
 * Indicateur actif (D-GD-31, étape 1) : un indicateur choisi dans la rubrique « Indicateurs » du catalogue s'applique à
 * **toutes** les couches chargées qui le portent. D'une couche à l'autre (régions, provinces, communes…), le même
 * indicateur a un identifiant différent : il est reconnu par sa **clé** (thème, famille, modalité, milieu, sexe), jamais
 * par son identifiant. Un seul indicateur actif à la fois. Logique pure.
 */
import type { IndicateurDimensionne, Milieu, Sexe } from "./dimensions.js";

/** Clé d'un indicateur, commune aux couches qui le portent. Un indicateur sans famille est sa propre famille (son titre). */
export interface CleIndicateur {
  readonly theme: string | null;
  readonly famille: string;
  readonly modalite: string | null;
  readonly milieu: Milieu;
  readonly sexe: Sexe;
}

export const cleIndicateur = (i: IndicateurDimensionne): CleIndicateur => ({
  theme: i.theme ?? null, famille: i.famille ?? i.titre, modalite: i.modalite ?? null, milieu: i.milieu ?? "ensemble", sexe: i.sexe ?? "ensemble",
});

export const memeCle = (a: CleIndicateur, b: CleIndicateur): boolean =>
  a.theme === b.theme && a.famille === b.famille && a.modalite === b.modalite && a.milieu === b.milieu && a.sexe === b.sexe;

/** L'indicateur d'une couche qui porte cette clé ; null si la couche ne le porte pas (elle garde alors sa coloration). */
export function indicateurPourCle<T extends IndicateurDimensionne>(liste: readonly T[], cle: CleIndicateur): T | null {
  return liste.find((i) => memeCle(cleIndicateur(i), cle)) ?? null;
}

/** Réunion des indicateurs de plusieurs couches, une entrée par clé (la première rencontrée représente la clé). */
export function unionIndicateurs<T extends IndicateurDimensionne>(couches: readonly { readonly indicateurs: readonly T[] }[]): T[] {
  const vus: CleIndicateur[] = [];
  const union: T[] = [];
  for (const c of couches) for (const i of c.indicateurs) {
    const k = cleIndicateur(i);
    if (vus.some((v) => memeCle(v, k))) continue;
    vus.push(k);
    union.push(i);
  }
  return union;
}
