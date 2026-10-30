/**
 * Montants des prix immobiliers : lecture des montants écrits à la française et normalisation décimale sûre.
 *
 * Choix de représentation (Plan §4, « decimal-safe ») : un montant lu est converti en **centimes entiers** par
 * manipulation de la chaîne décimale (aucune multiplication flottante). « 3,3M DH » donne exactement 330 000 000
 * centimes, « 954,8K DH » 95 480 000 centimes. La valeur décimale (`valeur`, en unités monétaires) est ensuite
 * `centimes / 100`, exacte pour tout montant inférieur à 2^53 centimes (≈ 90 000 milliards). Une précision plus fine que
 * le centime est arrondie au centime le plus proche, moitié en s'éloignant de zéro, sur la chaîne elle-même.
 *
 * Les montants abrégés (K = millier, M = million) sont marqués `approximatif` : l'éditeur a arrondi l'affichage.
 * Un montant absent (« — », vide, texte sans chiffre) donne `valeur: null`, jamais 0.
 */
import type { Monnaie, PeriodePrix } from "./types.js";

/** Motif pour lequel un texte n'a pas donné de montant. */
export type MotifMontantIllisible = "absent" | "illisible" | "unite-inconnue" | "hors-limites";

export interface MontantLu {
  /** Montant en unités monétaires, ou null. */
  readonly valeur: number | null;
  /** Montant en centimes entiers (représentation exacte), ou null. */
  readonly centimes: number | null;
  /** Vrai si le montant est abrégé (K, M) : arrondi par l'éditeur. */
  readonly approximatif: boolean;
  /**
   * Pas du dernier chiffre écrit, en centimes (« 3,3M » → 100 000 DH = 10 000 000 centimes ; « 18 548 » → 100) : un
   * montant abrégé représente toute valeur à ± pas / 2. Null si aucun montant.
   */
  readonly pasCentimes: number | null;
  /** Monnaie déclarée (ISO 4217, `DH` → `MAD`), ou null si le texte n'en porte pas. */
  readonly monnaie: Monnaie | null;
  /** Montant rapporté au m² (« DH/m² »). */
  readonly parM2: boolean;
  /** Période écrite (« /mois ») ; null si le texte n'en indique pas. */
  readonly periode: PeriodePrix | null;
  /** Unité canonique (`MAD`, `MAD/mois`, `MAD/m2`, `MAD/m2/mois`…) ou null. */
  readonly unite: string | null;
  readonly texteOriginal: string;
  /** Motif d'absence quand `valeur` est null. */
  readonly motif: MotifMontantIllisible | null;
}

const ESPACES = /[\s   ]+/g;

const MONNAIES: Readonly<Record<string, Monnaie>> = {
  dh: "MAD", dhs: "MAD", mad: "MAD", dirham: "MAD", dirhams: "MAD",
  "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR",
  $: "USD", usd: "USD",
};

const PERIODES: Readonly<Record<string, PeriodePrix>> = {
  mois: "mois", month: "mois", mensuel: "mois",
  jour: "jour", day: "jour", j: "jour",
  semaine: "semaine", week: "semaine", sem: "semaine",
  an: "an", annee: "an", year: "an",
};

/**
 * Arrondit une chaîne décimale positive (« 123 », « 123.456 ») à `decimales` chiffres, moitié en s'éloignant de zéro,
 * sans calcul flottant. Renvoie la chaîne entière des unités du dernier rang (ex. « 12346 » pour 123.456 à 2 décimales).
 */
function decimalVersEntier(entier: string, fraction: string, decimales: number): string | null {
  const f = fraction.padEnd(decimales, "0");
  const garde = f.slice(0, decimales);
  const reste = f.slice(decimales);
  let chiffres = (entier.replace(/^0+(?=\d)/, "") || "0") + garde;
  if (reste.length && reste[0]! >= "5") {
    // Incrément décimal sur la chaîne.
    const t = chiffres.split("");
    let i = t.length - 1;
    while (i >= 0) {
      if (t[i] === "9") { t[i] = "0"; i--; }
      else { t[i] = String(Number(t[i]) + 1); break; }
    }
    chiffres = (i < 0 ? "1" : "") + t.join("");
  }
  return chiffres.replace(/^0+(?=\d)/, "");
}

/**
 * Lit la partie numérique d'un montant français : espaces (y compris insécables) comme séparateurs de milliers, virgule
 * décimale ; un point est un séparateur de milliers s'il sépare des groupes de trois chiffres (« 1.500.000 »), sinon un
 * point décimal (« 3.3 »). Renvoie [partie entière, partie décimale] ou null.
 */
function lireNombre(brut: string): [string, string] | null {
  const s = brut.replace(ESPACES, "");
  if (!/^[\d.,]+$/.test(s)) return null;
  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length !== 2 || !parts[1] || !/^\d{1,3}(\.\d{3})*$|^\d+$/.test(parts[0]!)) return null;
    return [parts[0]!.replace(/\./g, ""), parts[1]];
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return [s.replace(/\./g, ""), ""];
  const p = s.split(".");
  if (p.length === 1) return [p[0]!, ""];
  if (p.length === 2 && p[0] && p[1]) return [p[0], p[1]];
  return null;
}

/** Conversion d'une chaîne décimale simple (« 3300000.0 », « 18548 ») en centimes entiers ; null si illisible. */
export function versCentimes(texte: string): number | null {
  const m = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(texte);
  if (!m) return null;
  const e = decimalVersEntier(m[1]!, m[2] ?? "", 2);
  const n = e === null ? NaN : Number(e);
  return Number.isSafeInteger(n) ? n : null;
}

/** Écriture décimale exacte d'un nombre de centimes (« 3300000.00 »), pour un stockage `numeric` sans perte. */
export function centimesEnTexte(centimes: number): string {
  if (!Number.isSafeInteger(centimes)) throw new RangeError("centimes hors des entiers sûrs");
  const signe = centimes < 0 ? "-" : "";
  const a = String(Math.abs(centimes)).padStart(3, "0");
  return `${signe}${a.slice(0, -2)}.${a.slice(-2)}`;
}

/**
 * Arrondit un nombre calculé (prix unitaire, quantile) à `decimales` chiffres, moitié en s'éloignant de zéro. Le
 * nombre est d'abord ramené à 15 chiffres significatifs (élimine le bruit binaire, ex. 1.005 → « 1.005 » et non
 * 1.00499…), puis arrondi sur sa chaîne décimale. Déterministe sur toute plateforme JavaScript.
 */
export function arrondirDecimal(x: number, decimales = 2): number {
  if (!Number.isFinite(x)) return x;
  const n = Number(x.toPrecision(15));
  const s = String(Math.abs(n));
  if (/e/i.test(s)) return Math.sign(n) * Math.round(Math.abs(n) * 10 ** decimales) / 10 ** decimales;
  const [ent, frac = ""] = s.split(".");
  const e = decimalVersEntier(ent!, frac, decimales)!;
  const r = Number(e) / 10 ** decimales;
  return n < 0 && r !== 0 ? -r : r;
}

/** Unité canonique à partir de ses éléments : `MAD`, `MAD/m2`, `MAD/mois`, `MAD/m2/mois`. */
export function composerUnite(monnaie: Monnaie, parM2: boolean, periode: PeriodePrix | null): string {
  return `${monnaie}${parM2 ? "/m2" : ""}${periode && periode !== "total" ? `/${periode}` : ""}`;
}

/** Analyse un texte d'unité (« DH/m²/mois », « MAD/month », « €/m2 ») ; null si une partie est inconnue. */
function analyserUnite(texte: string): { monnaie: Monnaie | null; parM2: boolean; periode: PeriodePrix | null } | null {
  const t = texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(ESPACES, "")
    .replace(/m²/g, "m2").replace(/^par/, "/").replace(/par(?=m2|mois|jour|semaine|an)/g, "/");
  if (!t) return { monnaie: null, parM2: false, periode: null };
  const morceaux = t.split("/").filter(Boolean);
  let monnaie: Monnaie | null = null, parM2 = false, periode: PeriodePrix | null = null;
  for (const [i, m] of morceaux.entries()) {
    if (i === 0 && Object.hasOwn(MONNAIES, m)) monnaie = MONNAIES[m]!;
    else if (m === "m2" && !parM2 && !periode) parM2 = true;
    else if (Object.hasOwn(PERIODES, m) && !periode) periode = PERIODES[m]!;
    else return null;
  }
  return { monnaie, parM2, periode };
}

/**
 * Unité canonique d'un texte d'unité déclaré par une source (`MAD/month` → `MAD/mois`, `DH/m²` → `MAD/m2`) ; null
 * si l'unité est inconnue ou sans monnaie.
 */
export function uniteCanonique(texte: string): string | null {
  const u = analyserUnite(texte);
  return u && u.monnaie ? composerUnite(u.monnaie, u.parM2, u.periode) : null;
}

/**
 * Lit un montant écrit à la française : « 18 548 DH », « 3,3M DH », « 769K DH », « 954,8K DH », « 13 000 DH/mois »,
 * « 12 500 DH/m² », « — ». Les abréviations K (×1 000) et M (×1 000 000) marquent le montant comme approximatif.
 * Un montant négatif, une unité inconnue ou une écriture ambiguë donnent `valeur: null` avec un motif.
 */
export function parserMontant(texte: string | null | undefined): MontantLu {
  const texteOriginal = texte ?? "";
  const vide = (motif: MotifMontantIllisible): MontantLu =>
    ({ valeur: null, centimes: null, approximatif: false, pasCentimes: null, monnaie: null, parM2: false, periode: null, unite: null, texteOriginal, motif });
  const t = texteOriginal.replace(ESPACES, " ").trim();
  if (!/\d/.test(t)) return vide("absent");
  const m = /^(-)?\s*(\d[\d .,]*\d|\d)\s*(?:([KkM])(?![a-zA-Z]))?\s*(\D.*)?$/.exec(t);
  if (!m) return vide("illisible");
  if (m[1]) return vide("hors-limites");
  const nombre = lireNombre(m[2]!);
  if (!nombre) return vide("illisible");
  const abrev = m[3];
  const exposant = abrev ? (abrev.toUpperCase() === "K" ? 3 : 6) : 0;
  const unite = analyserUnite(m[4] ?? "");
  if (!unite) return vide("unite-inconnue");
  // Décalage décimal exact : valeur × 10^exposant × 100 (centimes).
  const [ent, frac] = nombre;
  const decale = frac.length > exposant ? [ent + frac.slice(0, exposant), frac.slice(exposant)] as const
    : [ent + frac.padEnd(exposant, "0"), ""] as const;
  const chaine = decimalVersEntier(decale[0], decale[1], 2);
  const centimes = chaine === null ? NaN : Number(chaine);
  if (!Number.isSafeInteger(centimes)) return vide("hors-limites");
  return {
    valeur: centimes / 100,
    centimes,
    approximatif: exposant > 0,
    pasCentimes: 10 ** Math.max(0, exposant - frac.length + 2),
    monnaie: unite.monnaie,
    parM2: unite.parM2,
    periode: unite.periode,
    unite: unite.monnaie ? composerUnite(unite.monnaie, unite.parM2, unite.periode) : null,
    texteOriginal,
    motif: null,
  };
}
