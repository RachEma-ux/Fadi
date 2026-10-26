/**
 * Classification d'un indicateur pour une carte thématique (concept § 4.2, INV-06) : seuils visibles et enregistrés avec la
 * carte ; une valeur absente a sa propre entrée de légende (couleur **et** motif hachuré), jamais la classe de zéro.
 */
import type { ValeurIndicateur } from "./valeurs.js";

/** Méthodes de classification ; « seuils-naturels » = ruptures naturelles de Jenks (Fisher, optimale). */
export type MethodeClassification = "quantiles" | "intervalles-egaux" | "seuils-naturels" | "manuel";
export const METHODES_CLASSIFICATION: readonly MethodeClassification[] = ["quantiles", "intervalles-egaux", "seuils-naturels", "manuel"];
/** Nombre de classes admis : 2 à 10 (au plus 9 seuils, contrôle de la composition). */
export const CLASSES_MIN = 2;
export const CLASSES_MAX = 10;

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
  if (methode === "seuils-naturels") {
    bornes.push(...rupturesNaturelles(xs, classes));
  } else if (methode === "intervalles-egaux") {
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
  // Les ruptures de Jenks sont des valeurs observées (début exact d'une classe) : jamais arrondies, sinon une borne peut
  // sortir de l'étendue ou faire passer une observation dans la classe voisine. Les autres méthodes sont arrondies.
  const arrondi = methode === "seuils-naturels" ? bornes : bornes.map((b) => Number(b.toPrecision(6)));
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

/**
 * Palettes prédéfinies (lot D, D-GD-25) : la palette historique de GeoData (« bleu-violet », défaut) et des palettes
 * ColorBrewer de Cynthia Brewer (colorbrewer2.org, licence Apache 2.0), séquentielles (une grandeur qui croît) ou
 * divergentes (écart de part et d'autre d'une valeur centrale). Chaque palette donne ses couleurs de la plus claire (ou
 * de l'extrémité basse) à la plus foncée ; une classification de n classes en prend n réparties sur toute la palette.
 */
export const PALETTES_CLASSES = {
  "bleu-violet": { libelle: "Bleu-violet (défaut)", nature: "sequentielle", couleurs: PALETTE_SEQUENTIELLE },
  bleus: { libelle: "Bleus", nature: "sequentielle", couleurs: ["#f7fbff", "#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#08519c", "#08306b"] },
  verts: { libelle: "Verts", nature: "sequentielle", couleurs: ["#f7fcf5", "#e5f5e0", "#c7e9c0", "#a1d99b", "#74c476", "#41ab5d", "#238b45", "#006d2c", "#00441b"] },
  oranges: { libelle: "Oranges", nature: "sequentielle", couleurs: ["#fff5eb", "#fee6ce", "#fdd0a2", "#fdae6b", "#fd8d3c", "#f16913", "#d94801", "#a63603", "#7f2704"] },
  rouges: { libelle: "Rouges", nature: "sequentielle", couleurs: ["#fff5f0", "#fee0d2", "#fcbba1", "#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#a50f15", "#67000d"] },
  violets: { libelle: "Violets", nature: "sequentielle", couleurs: ["#fcfbfd", "#efedf5", "#dadaeb", "#bcbddc", "#9e9ac8", "#807dba", "#6a51a3", "#54278f", "#3f007d"] },
  "jaune-rouge": { libelle: "Jaune → rouge", nature: "sequentielle", couleurs: ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026", "#800026"] },
  "rouge-bleu": { libelle: "Rouge ↔ bleu (divergente)", nature: "divergente", couleurs: ["#b2182b", "#d6604d", "#f4a582", "#fddbc7", "#f7f7f7", "#d1e5f0", "#92c5de", "#4393c3", "#2166ac"] },
  "brun-vert": { libelle: "Brun ↔ vert (divergente)", nature: "divergente", couleurs: ["#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5", "#c7eae5", "#80cdc1", "#35978f", "#01665e"] },
} as const satisfies Record<string, { libelle: string; nature: "sequentielle" | "divergente"; couleurs: readonly string[] }>;
export type IdPalette = keyof typeof PALETTES_CLASSES;
export const PALETTE_PAR_DEFAUT: IdPalette = "bleu-violet";
export const estPalette = (x: unknown): x is IdPalette => typeof x === "string" && Object.hasOwn(PALETTES_CLASSES, x);

/** n couleurs d'une palette, réparties de l'extrémité basse à l'extrémité haute ; inversée sur demande. */
export function couleursPalette(id: IdPalette, n: number, inverser = false): string[] {
  const p: readonly string[] = PALETTES_CLASSES[id].couleurs;
  const xs = n <= 1 ? [p[Math.floor(p.length / 2)]!] : Array.from({ length: n }, (_, i) => p[Math.round((i * (p.length - 1)) / (n - 1))]!);
  return inverser ? xs.reverse() : xs;
}

/** Couleurs d'une classification de `n` classes, prises dans la palette par défaut. */
export function couleursPour(n: number): string[] {
  return couleursPalette(PALETTE_PAR_DEFAUT, n);
}

/**
 * Ruptures naturelles de Jenks (algorithme exact de Fisher, programmation dynamique) : les classes minimisent la somme
 * des écarts quadratiques à leur moyenne. Renvoie les bornes intérieures (début de chaque classe à partir de la 2ᵉ).
 * Au-delà de `maxValeurs` valeurs, un échantillon régulier des valeurs triées est classé (même ordre, extrêmes gardés).
 */
export function rupturesNaturelles(triees: readonly number[], classes: number, maxValeurs = 2000): number[] {
  let xs = triees;
  if (xs.length > maxValeurs) {
    const pas = (xs.length - 1) / (maxValeurs - 1);
    xs = Array.from({ length: maxValeurs }, (_, i) => triees[Math.round(i * pas)]!);
  }
  const n = xs.length;
  const k = Math.min(classes, n);
  if (k < 2) return [];
  // bas[i][j] : début (1-indexé) de la dernière classe pour les i premières valeurs en j classes ; v[i][j] : variance totale.
  const bas = Array.from({ length: n + 1 }, () => new Int32Array(k + 1));
  const v = Array.from({ length: n + 1 }, () => new Float64Array(k + 1).fill(Infinity));
  for (let j = 1; j <= k; j++) { bas[1]![j] = 1; v[1]![j] = 0; }
  for (let i = 2; i <= n; i++) {
    let s1 = 0, s2 = 0;
    for (let m = 1; m <= i; m++) {
      const debut = i - m + 1;
      const x = xs[debut - 1]!;
      s1 += x; s2 += x * x;
      const variance = s2 - (s1 * s1) / m;
      if (debut > 1) for (let j = 2; j <= k; j++) {
        const total = variance + v[debut - 1]![j - 1]!;
        if (total <= v[i]![j]!) { bas[i]![j] = debut; v[i]![j] = total; }
      }
    }
    bas[i]![1] = 1;
    v[i]![1] = s2 - (s1 * s1) / i;
  }
  const bornes: number[] = [];
  let fin = n;
  for (let j = k; j >= 2; j--) {
    const debut = bas[fin]![j]!;
    bornes.unshift(xs[debut - 1]!);
    fin = debut - 1;
  }
  return bornes;
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
