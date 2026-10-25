/**
 * Classification d'un indicateur pour une carte thématique (concept § 4.2, INV-06) : seuils visibles et enregistrés avec la
 * carte ; une valeur absente a sa propre entrée de légende (couleur **et** motif hachuré), jamais la classe de zéro.
 */
import type { ValeurIndicateur } from "./valeurs.js";

export type MethodeClassification = "quantiles" | "intervalles-egaux" | "manuel";

/** Palette séquentielle à 5 classes (clair → foncé, lisible en vision des couleurs altérée). */
export const PALETTE_SEQUENTIELLE = ["#f1eef6", "#bdc9e1", "#74a9cf", "#2b8cbe", "#045a8d"] as const;
/** Valeur absente : gris neutre, toujours accompagné du motif hachuré et du libellé « Valeur absente ». */
export const COULEUR_ABSENTE = "#9e9e9e";

const valeursPresentes = (vs: readonly ValeurIndicateur[]) => vs.flatMap((v) => (v.valeur === null ? [] : [v.valeur])).sort((a, b) => a - b);

/** Seuils (bornes intérieures, strictement croissantes) de `classes` classes ; moins de seuils si les valeurs se répètent. */
export function calculerSeuils(vs: readonly ValeurIndicateur[], methode: Exclude<MethodeClassification, "manuel">, classes = 5): number[] {
  const xs = valeursPresentes(vs);
  if (xs.length < 2 || classes < 2) return [];
  const bornes: number[] = [];
  if (methode === "intervalles-egaux") {
    const min = xs[0]!;
    const max = xs[xs.length - 1]!;
    for (let k = 1; k < classes; k++) bornes.push(min + ((max - min) * k) / classes);
  } else {
    for (let k = 1; k < classes; k++) {
      const pos = (xs.length - 1) * (k / classes);
      const bas = Math.floor(pos);
      const haut = Math.ceil(pos);
      bornes.push(xs[bas]! + (xs[haut]! - xs[bas]!) * (pos - bas));
    }
  }
  const arrondi = bornes.map((b) => Number(b.toPrecision(6)));
  return arrondi.filter((b, i) => i === 0 || b > arrondi[i - 1]!).filter((b) => b > xs[0]! && b <= xs[xs.length - 1]!);
}

export const seuilsValides = (seuils: readonly number[]): boolean => seuils.every((s, i) => Number.isFinite(s) && (i === 0 || s > seuils[i - 1]!));

/** Classe d'une valeur : indice 0..seuils.length (une valeur égale à un seuil passe dans la classe supérieure), ou `absente`. */
export function classer(v: ValeurIndicateur, seuils: readonly number[]): number | "absente" {
  if (v.valeur === null) return "absente";
  let k = 0;
  while (k < seuils.length && v.valeur >= seuils[k]!) k++;
  return k;
}

export interface EntreeLegende {
  readonly classe: number | "absente";
  readonly couleur: string;
  readonly libelle: string;
  /** Nombre d'unités de la classe. */
  readonly effectif: number;
}

/** Couleurs d'une classification de `n` classes, prises dans la palette séquentielle. */
export function couleursPour(n: number): string[] {
  if (n <= 1) return [PALETTE_SEQUENTIELLE[2]];
  return Array.from({ length: n }, (_, i) => PALETTE_SEQUENTIELLE[Math.round((i * (PALETTE_SEQUENTIELLE.length - 1)) / (n - 1))]!);
}

export function legende(vs: readonly ValeurIndicateur[], seuils: readonly number[], couleurs: readonly string[], format: (x: number) => string): EntreeLegende[] {
  const effectifs = new Map<number | "absente", number>();
  for (const v of vs) {
    const c = classer(v, seuils);
    effectifs.set(c, (effectifs.get(c) ?? 0) + 1);
  }
  const entrees: EntreeLegende[] = [];
  for (let k = 0; k <= seuils.length; k++) {
    const libelle = seuils.length === 0 ? "Toutes valeurs" : k === 0 ? `< ${format(seuils[0]!)}` : k === seuils.length ? `≥ ${format(seuils[k - 1]!)}` : `${format(seuils[k - 1]!)} – < ${format(seuils[k]!)}`;
    entrees.push({ classe: k, couleur: couleurs[k] ?? COULEUR_ABSENTE, libelle, effectif: effectifs.get(k) ?? 0 });
  }
  entrees.push({ classe: "absente", couleur: COULEUR_ABSENTE, libelle: "Valeur absente", effectif: effectifs.get("absente") ?? 0 });
  return entrees;
}
