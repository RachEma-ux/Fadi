/**
 * Analyse pure du champ « Mesures » (VCB, *Measurements box*) de la Planche.
 *
 * Références de comportement : `docs/planche/reference/doc-officielle.md` § 6 (grammaire et sémantique des
 * réseaux), `outils-dessin.md` § 15.2, `outils-modification.md` § 0.2 et § 2-4 (relevés en direct).
 * Aucune exception n'est levée : toute saisie invalide donne `{ genre: 'erreur', message }` en français.
 * Toutes les longueurs rendues sont en mètres ; les angles sont rendus en radians ET en degrés.
 *
 * ## Grammaire (EBNF informelle)
 *
 * ```
 * saisie        := longueur | liste | point_absolu | point_relatif | segments | rayon_r | angle | pente
 *                | reseau | facteurs | cible | champ_vision | texte
 * entier        := chiffre+
 * decimal       := chiffre+ [ SEPDEC chiffre* ] | SEPDEC chiffre+
 * fraction      := entier "/" entier                          (dénominateur non nul)
 * mixte         := decimal | fraction | entier espace+ fraction   ("1 1/2")
 * unite         := "mm" | "cm" | "m" | "km" | '"' | "in" | "'" | "ft"   (insensible à la casse)
 * longueur      := [signe] mixte [espace*] [unite]               valeur nue = unité du modèle
 *                | [signe] mixte "'" [espace* | "-"] [mixte] ['"']   pieds-pouces : 5'10 3/4", 5' 6", 5'-6"
 * liste         := [longueur] SEP [longueur] [ SEP [longueur] ]  composante vide = inchangée (null)
 * point_absolu  := "[" longueur SEP longueur SEP longueur "]"    depuis l'origine des axes
 * point_relatif := "<" longueur SEP longueur SEP longueur ">"    depuis le point de départ
 * segments      := entier ("s" | "S")                            « 24s » (bornes 3 à 999 pour une courbe)
 * rayon_r       := longueur ("r" | "R")                          « 24r » (arc 2 points)
 * angle         := [signe] decimal ["°"]                         degrés ; négatif = sens antihoraire
 * pente         := [signe] decimal ":" decimal                   montée:course → atan2(montée, course)
 * reseau        := ("x" | "X" | "*") entier | entier ("x" | "X" | "*")   copies extérieures « x5 », « 5x »
 *                | "/" entier | entier "/"                                divisions intérieures « /5 », « 5/ »
 * facteurs      := [signe] decimal | [facteur] SEP [facteur] [SEP [facteur]]   Échelle : « 1.5 », « -1 », « 2,3 »
 * cible         := longueur AVEC unité (ou liste de telles longueurs)          Échelle : « 3m » = dimension cible
 * champ_vision  := decimal ["deg" | "°"] | decimal "mm"            Zoom : degrés ou focale
 * texte         := tout caractère                                  rendu tel quel (sans les espaces de bord)
 * ```
 *
 * ## Séparateurs (locale)
 * - `separateurDecimal: '.'` (défaut, relevé « Decimal - Meters ») : décimal « . », séparateur de liste « , ».
 * - `separateurDecimal: ','` (locale française) : décimal « , » (et « . » toléré), séparateur de liste « ; »
 *   (forum officiel [F1]). Le « ; » est accepté comme séparateur de liste dans les deux cas.
 *
 * ## Espaces
 * Les espaces de bord et ceux autour des séparateurs et des unités sont ignorés (« 4 m , 3 m » relevé en
 * direct). Un espace interne n'a de sens qu'entre un entier et une fraction (« 1 1/2" ») ou entre pieds et
 * pouces (« 5' 6" »).
 *
 * ## Réseaux (sémantique relevée, outils-modification § 2)
 * - « x3 » / « 3x » / « *3 » / « 3* » : 3 copies au pas de la 1re copie, soit 4 objets.
 * - « /3 » / « 3/ » : 3 intervalles entre l'original et la 1re copie, soit 4 objets (2 copies intermédiaires).
 *
 * Les formes acceptées dépendent de ce que l'outil attend (`AttenduSaisie`, tableau `FORMES_PAR_ATTENDU`).
 */
import { v3, type Vec3 } from "./vecteur.js";

/** Unités de longueur reconnues. `in` = pouce, `ft` = pied. */
export type UniteLongueur = "mm" | "cm" | "m" | "km" | "in" | "ft";

/** Ce que l'étape courante d'un outil attend dans le champ Mesures. */
export type AttenduSaisie =
  /** Longueur seule (Push/Pull, Offset, Tape Measure, corde ou flèche d'arc…). */
  | "longueur"
  /** Longueur ou point absolu/relatif (Line). */
  | "longueur-ou-point"
  /** Distance, point absolu/relatif ou réseau linéaire (Move). */
  | "distance-reseau"
  /** Deux composantes « l,w » (Rectangle). */
  | "dimensions2"
  /** Jusqu'à trois composantes « x,y,z ». */
  | "dimensions3"
  /** « longueur,angle » ou « largeur,angle » (Rotated Rectangle). */
  | "longueur-angle"
  /** Rayon de cercle/polygone, ou nombre de segments « Ns » (Circle, Polygon après le 1er clic). */
  | "rayon"
  /** Longueur, rayon « Nr » ou segments « Ns » (2 Point Arc, Arc, 3 Point Arc : étapes de longueur). */
  | "arc"
  /** Nombre de côtés/segments, nu ou « Ns », bornes 3 à 999 (« Sides » avant le 1er clic). */
  | "cotes"
  /** Nombre entier de segments (Divide). */
  | "segments"
  /** Angle en degrés ou pente (Protractor). */
  | "angle"
  /** Angle ou segments « Ns » (Arc, 3 Point Arc, Pie : étape d'angle). */
  | "angle-arc"
  /** Angle, pente ou réseau polaire (Rotate). */
  | "angle-reseau"
  /** Facteur(s) d'échelle ou dimension cible avec unité (Scale). */
  | "echelle"
  /** Champ de vision en degrés ou focale en mm (Zoom). */
  | "champ-vision"
  /** Texte libre. */
  | "texte"
  /** L'outil n'utilise pas le champ (libellé « Measurements » vide). */
  | "aucune";

/** Contexte d'analyse. Les champs absents prennent les valeurs du gabarit relevé « Decimal - Meters ». */
export interface ContexteSaisie {
  readonly attendu: AttenduSaisie;
  /** Unité d'une valeur nue (Model Info > Units). Défaut : `m`. */
  readonly uniteModele?: UniteLongueur;
  /** Séparateur décimal de la locale. Défaut : `.` (le séparateur de liste est alors « , »). */
  readonly separateurDecimal?: "." | ",";
  /** Polygone (attendu `rayon`) : mode de rayon et nombre de côtés, pour calculer le rayon au sommet. */
  readonly polygone?: { readonly mode: "inscrit" | "circonscrit"; readonly cotes: number };
  /**
   * Repère de saisie (outil Axes, R5) : un point absolu `[x;y;z]` est lu depuis son origine le long de ses axes, un
   * point relatif `<dx;dy;dz>` le long de ses axes ; les coordonnées retournées sont dans le repère stocké.
   */
  readonly repere?: { readonly origine: Vec3; readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 };
}

export interface Angle {
  readonly radians: number;
  readonly degres: number;
}

export type ResultatSaisie =
  | { readonly genre: "longueur"; readonly valeur: number }
  | { readonly genre: "point"; readonly reference: "absolue" | "relative"; readonly point: Vec3 }
  | { readonly genre: "dimensions"; readonly valeurs: readonly (number | null)[] }
  | { readonly genre: "longueur-angle"; readonly longueur: number | null; readonly angle: Angle | null }
  | {
      readonly genre: "rayon";
      readonly valeur: number;
      /** Mode du polygone (null pour un cercle ou un arc « Nr »). */
      readonly mode: "inscrit" | "circonscrit" | null;
      /** Distance centre → sommet (null si le nombre de côtés n'est pas connu). */
      readonly rayonSommet: number | null;
    }
  | { readonly genre: "segments"; readonly nombre: number }
  | ({ readonly genre: "angle"; readonly source: "degres" | "pente" } & Angle)
  | {
      readonly genre: "reseau";
      /** `copies` : N copies au pas de la 1re copie ; `divisions` : N intervalles entre original et 1re copie. */
      readonly mode: "copies" | "divisions";
      readonly nombre: number;
      /** Nombre total d'objets, original compris (N + 1 dans les deux modes, relevé en direct). */
      readonly objets: number;
      /** Pas entre deux objets, en fraction du vecteur de la 1re copie (1 ou 1/N). */
      readonly fractionPas: number;
    }
  | { readonly genre: "echelle"; readonly facteurs: readonly (number | null)[] }
  | { readonly genre: "echelle-cible"; readonly longueurs: readonly (number | null)[] }
  | { readonly genre: "champ-vision"; readonly degres: number }
  | { readonly genre: "focale"; readonly millimetres: number }
  | { readonly genre: "texte"; readonly texte: string }
  | { readonly genre: "erreur"; readonly message: string };

export type Erreur = Extract<ResultatSaisie, { genre: "erreur" }>;

/** Mètres par unité. */
export const METRES_PAR_UNITE: Readonly<Record<UniteLongueur, number>> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
};

/** Bornes du nombre de segments d'une courbe (alerte relevée « Curve segments must be in the range from 3 to 999 »). */
export const SEGMENTS_MIN = 3;
export const SEGMENTS_MAX = 999;

type Forme =
  | "longueur"
  | "point"
  | "liste2"
  | "liste3"
  | "longueur-angle"
  | "rayon"
  | "rayon-r"
  | "segments"
  | "entier-cotes"
  | "entier"
  | "angle"
  | "reseau"
  | "echelle"
  | "champ-vision"
  | "texte";

/** Formes acceptées pour chaque attente, dans l'ordre d'essai. */
export const FORMES_PAR_ATTENDU: Readonly<Record<AttenduSaisie, readonly Forme[]>> = {
  longueur: ["longueur"],
  "longueur-ou-point": ["point", "longueur"],
  "distance-reseau": ["point", "reseau", "longueur"],
  dimensions2: ["liste2"],
  dimensions3: ["liste3"],
  "longueur-angle": ["longueur-angle"],
  rayon: ["segments", "rayon"],
  arc: ["segments", "rayon-r", "longueur"],
  cotes: ["segments", "entier-cotes"],
  segments: ["entier"],
  angle: ["angle"],
  "angle-arc": ["segments", "angle"],
  "angle-reseau": ["reseau", "angle"],
  echelle: ["echelle"],
  "champ-vision": ["champ-vision"],
  texte: ["texte"],
  aucune: [],
};

const erreur = (message: string): Erreur => ({ genre: "erreur", message });
const estErreur = (x: unknown): x is Erreur =>
  typeof x === "object" && x !== null && (x as { genre?: unknown }).genre === "erreur";

export const angleDepuisDegres = (degres: number): Angle => ({ degres, radians: (degres * Math.PI) / 180 });
export const angleDepuisRadians = (radians: number): Angle => ({ radians, degres: (radians * 180) / Math.PI });

interface Locale {
  readonly dec: "." | ",";
  readonly uniteModele: UniteLongueur;
}

/** Découpe une liste selon la locale ; `;` toujours accepté, `,` seulement si le décimal est « . ». */
function decouperListe(texte: string, loc: Locale): string[] {
  const motif = loc.dec === "," ? /;/ : /[;,]/;
  return texte.split(motif).map((s) => s.trim());
}

/** Normalise le séparateur décimal en « . » (seulement en locale à virgule). */
function normaliserDecimal(s: string, loc: Locale): string {
  return loc.dec === "," ? s.replace(/,/g, ".") : s;
}

const RE_DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Lit un nombre mixte positif : décimal, fraction « a/b » ou « e a/b ». */
function lireMixte(s: string): number | Erreur | null {
  const t = s.trim();
  if (t === "") return null;
  if (RE_DECIMAL.test(t)) return Number(t);
  const frac = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(t);
  if (frac) {
    const den = Number(frac[3]);
    if (den === 0) return erreur("Fraction invalide : dénominateur nul.");
    return Number(frac[1] ?? "0") + Number(frac[2]) / den;
  }
  return null;
}

function uniteDepuisSuffixe(u: string): UniteLongueur | null {
  switch (u.toLowerCase()) {
    case "mm":
      return "mm";
    case "cm":
      return "cm";
    case "m":
      return "m";
    case "km":
      return "km";
    case '"':
    case "in":
      return "in";
    case "'":
    case "ft":
      return "ft";
    default:
      return null;
  }
}

interface LongueurLue {
  readonly metres: number;
  readonly avecUnite: boolean;
}

/** Lit une longueur (mètres). Renvoie null si la chaîne n'a pas la forme d'une longueur. */
function lireLongueur(brut: string, loc: Locale): LongueurLue | Erreur | null {
  const s = normaliserDecimal(brut.trim(), loc);
  if (s === "") return null;
  const signe = /^([+-])\s*(.*)$/.exec(s);
  const negatif = signe?.[1] === "-";
  const corps = signe ? (signe[2] ?? "") : s;
  const k = negatif ? -1 : 1;

  // Pieds-pouces : 5'10 3/4", 5' 6", 5'-6", 5'.
  const pp = /^([\d.\s/]+?)\s*'\s*-?\s*([\d.\s/]*?)\s*("?)$/.exec(corps);
  if (pp && corps.includes("'")) {
    const pieds = lireMixte(pp[1] ?? "");
    if (estErreur(pieds)) return pieds;
    if (pieds === null) return null;
    const pouces = lireMixte(pp[2] ?? "");
    if (estErreur(pouces)) return pouces;
    if (pouces === null && (pp[2] ?? "").trim() !== "") return null;
    if (pouces === null && pp[3] === '"') return null;
    const m = pieds * METRES_PAR_UNITE.ft + (pouces ?? 0) * METRES_PAR_UNITE.in;
    return { metres: k * m, avecUnite: true };
  }

  const gen = /^([\d.\s/]+?)\s*(mm|cm|km|m|in|ft|"|')?$/i.exec(corps);
  if (!gen) return null;
  const n = lireMixte(gen[1] ?? "");
  if (estErreur(n)) return n;
  if (n === null) return null;
  const unite = gen[2] ? uniteDepuisSuffixe(gen[2]) : null;
  const facteur = METRES_PAR_UNITE[unite ?? loc.uniteModele];
  return { metres: k * n * facteur, avecUnite: unite !== null };
}

/** Lit un nombre réel signé (facteur, angle) ; null si ce n'en est pas un. */
function lireReel(brut: string, loc: Locale): number | null {
  const s = normaliserDecimal(brut.trim(), loc).replace(/^([+-])\s+/, "$1");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  return Number(s);
}

const MSG_LONGUEUR = (t: string): string => `« ${t} » n'est pas une longueur valide.`;

function formeLongueur(t: string, loc: Locale): ResultatSaisie | null {
  const l = lireLongueur(t, loc);
  if (l === null) return null;
  if (estErreur(l)) return l;
  return { genre: "longueur", valeur: l.metres };
}

function formePoint(t: string, loc: Locale): ResultatSaisie | null {
  const m = /^([[<])(.*)([\]>])$/s.exec(t);
  if (!m) return null;
  const ouvrant = m[1];
  const fermant = m[3];
  if ((ouvrant === "[" && fermant !== "]") || (ouvrant === "<" && fermant !== ">")) {
    return erreur("Crochets mal appariés : utilisez [x, y, z] (absolu) ou <x, y, z> (relatif).");
  }
  const parts = decouperListe(m[2] ?? "", loc);
  if (parts.length !== 3) {
    return erreur(`Un point demande exactement 3 coordonnées (x, y, z) ; ${parts.length} reçue(s).`);
  }
  const vals: number[] = [];
  for (const p of parts) {
    if (p === "") return erreur("Coordonnée vide : les 3 coordonnées du point sont obligatoires.");
    const l = lireLongueur(p, loc);
    if (l === null) return erreur(MSG_LONGUEUR(p));
    if (estErreur(l)) return l;
    vals.push(l.metres);
  }
  const [x, y, z] = vals as [number, number, number];
  return { genre: "point", reference: ouvrant === "[" ? "absolue" : "relative", point: v3(x, y, z) };
}

function lireListeLongueurs(t: string, loc: Locale, max: number): (number | null)[] | Erreur {
  const parts = decouperListe(t, loc);
  if (parts.length > max) {
    return erreur(`Trop de valeurs : ${max} au plus, ${parts.length} reçues.`);
  }
  if (parts.every((p) => p === "")) return erreur("Aucune valeur saisie.");
  const out: (number | null)[] = [];
  for (const p of parts) {
    if (p === "") {
      out.push(null);
      continue;
    }
    const l = lireLongueur(p, loc);
    if (l === null) return erreur(MSG_LONGUEUR(p));
    if (estErreur(l)) return l;
    out.push(l.metres);
  }
  while (out.length < max) out.push(null);
  return out;
}

function formeListe(t: string, loc: Locale, max: number): ResultatSaisie {
  if (loc.dec === "," && !t.includes(";")) {
    // Sans « ; », la virgule est décimale : une seule composante.
    const l = lireLongueur(t, loc);
    if (l === null) {
      return erreur(`${MSG_LONGUEUR(t)} En locale à virgule décimale, séparez les valeurs par « ; ».`);
    }
    if (estErreur(l)) return l;
    const valeurs: (number | null)[] = [l.metres];
    while (valeurs.length < max) valeurs.push(null);
    return { genre: "dimensions", valeurs };
  }
  const r = lireListeLongueurs(t, loc, max);
  return estErreur(r) ? r : { genre: "dimensions", valeurs: r };
}

function lireAngle(t: string, loc: Locale): (Angle & { source: "degres" | "pente" }) | Erreur | null {
  const s = t.trim();
  if (s.includes(":")) {
    const [a, b, ...reste] = s.split(":");
    if (reste.length > 0) return erreur("Pente invalide : une seule « : » attendue (montée:course).");
    const montee = lireReel(a ?? "", loc);
    const course = lireReel(b ?? "", loc);
    if (montee === null || course === null) return erreur(`Pente invalide « ${s} » : attendu montée:course, ex. 1:2.`);
    if (montee === 0 && course === 0) return erreur("Pente invalide : montée et course nulles.");
    return { ...angleDepuisRadians(Math.atan2(montee, course)), source: "pente" };
  }
  const deg = lireReel(s.replace(/\s*°$/, ""), loc);
  if (deg === null) return null;
  return { ...angleDepuisDegres(deg), source: "degres" };
}

function formeAngle(t: string, loc: Locale): ResultatSaisie | null {
  const a = lireAngle(t, loc);
  if (a === null) return null;
  if (estErreur(a)) return a;
  return { genre: "angle", source: a.source, radians: a.radians, degres: a.degres };
}

function formeLongueurAngle(t: string, loc: Locale): ResultatSaisie {
  const parts = loc.dec === "," && !t.includes(";") ? [t.trim()] : decouperListe(t, loc);
  if (parts.length > 2) return erreur(`Trop de valeurs : 2 au plus (longueur, angle), ${parts.length} reçues.`);
  const [pl = "", pa = ""] = parts;
  if (pl === "" && pa === "") return erreur("Aucune valeur saisie.");
  let longueur: number | null = null;
  let angle: Angle | null = null;
  if (pl !== "") {
    const l = lireLongueur(pl, loc);
    if (l === null) return erreur(MSG_LONGUEUR(pl));
    if (estErreur(l)) return l;
    longueur = l.metres;
  }
  if (pa !== "") {
    const a = lireAngle(pa, loc);
    if (a === null) return erreur(`« ${pa} » n'est pas un angle valide.`);
    if (estErreur(a)) return a;
    angle = { radians: a.radians, degres: a.degres };
  }
  return { genre: "longueur-angle", longueur, angle };
}

function formeSegments(t: string): ResultatSaisie | null {
  const m = /^(\d+)\s*s$/i.exec(t);
  if (!m) return null;
  return bornerSegments(Number(m[1]));
}

function bornerSegments(n: number): ResultatSaisie {
  if (n < SEGMENTS_MIN || n > SEGMENTS_MAX) {
    return erreur(`Le nombre de segments d'une courbe doit être compris entre ${SEGMENTS_MIN} et ${SEGMENTS_MAX}.`);
  }
  return { genre: "segments", nombre: n };
}

function formeEntierCotes(t: string): ResultatSaisie | null {
  if (!/^\d+$/.test(t)) return null;
  return bornerSegments(Number(t));
}

function formeEntier(t: string): ResultatSaisie | null {
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (n < 1) return erreur("Le nombre de segments doit être un entier supérieur ou égal à 1.");
  return { genre: "segments", nombre: n };
}

function formeRayon(t: string, loc: Locale, ctx: ContexteSaisie): ResultatSaisie | null {
  const l = lireLongueur(t, loc);
  if (l === null) return null;
  if (estErreur(l)) return l;
  if (l.metres <= 0) return erreur("Le rayon doit être strictement positif.");
  const poly = ctx.polygone;
  if (!poly) return { genre: "rayon", valeur: l.metres, mode: null, rayonSommet: l.metres };
  const n = poly.cotes;
  const nValide = Number.isInteger(n) && n >= SEGMENTS_MIN && n <= SEGMENTS_MAX;
  const rayonSommet = poly.mode === "inscrit" ? l.metres : nValide ? l.metres / Math.cos(Math.PI / n) : null;
  return { genre: "rayon", valeur: l.metres, mode: poly.mode, rayonSommet };
}

function formeRayonR(t: string, loc: Locale): ResultatSaisie | null {
  const m = /^(.*\S)\s*r$/i.exec(t);
  if (!m) return null;
  const l = lireLongueur(m[1] ?? "", loc);
  if (l === null) return null;
  if (estErreur(l)) return l;
  if (l.metres <= 0) return erreur("Le rayon doit être strictement positif.");
  return { genre: "rayon", valeur: l.metres, mode: null, rayonSommet: l.metres };
}

function formeReseau(t: string): ResultatSaisie | null {
  const copie = /^[x*]\s*(\d+)$/i.exec(t) ?? /^(\d+)\s*[x*]$/i.exec(t);
  const div = /^\/\s*(\d+)$/.exec(t) ?? /^(\d+)\s*\/$/.exec(t);
  const m = copie ?? div;
  if (!m) {
    if (/^[x*/]\s*[-.\d]|[-.\d]\s*[x*/]$/i.test(t) && !/\d\/\d/.test(t)) {
      return erreur(`Réseau invalide « ${t} » : le nombre doit être un entier positif (ex. x5, 5x, /5, 5/).`);
    }
    return null;
  }
  const n = Number(m[1]);
  if (n < 1) return erreur("Le nombre d'un réseau doit être au moins 1.");
  const mode = copie ? "copies" : "divisions";
  return { genre: "reseau", mode, nombre: n, objets: n + 1, fractionPas: mode === "copies" ? 1 : 1 / n };
}

function formeEchelle(t: string, loc: Locale): ResultatSaisie {
  const parts = loc.dec === "," && !t.includes(";") ? [t.trim()] : decouperListe(t, loc);
  if (parts.length > 3) return erreur(`Trop de valeurs : 3 facteurs au plus, ${parts.length} reçus.`);
  if (parts.every((p) => p === "")) return erreur("Aucune valeur saisie.");
  const facteurs: (number | null)[] = [];
  const cibles: (number | null)[] = [];
  let nbFacteurs = 0;
  let nbCibles = 0;
  for (const p of parts) {
    if (p === "") {
      facteurs.push(null);
      cibles.push(null);
      continue;
    }
    const f = lireReel(p, loc);
    if (f !== null) {
      if (f === 0) return erreur("Un facteur d'échelle ne peut pas être nul.");
      facteurs.push(f);
      cibles.push(null);
      nbFacteurs++;
      continue;
    }
    const l = lireLongueur(p, loc);
    if (estErreur(l)) return l;
    if (l === null || !l.avecUnite) return erreur(`« ${p} » n'est ni un facteur d'échelle ni une longueur avec unité.`);
    if (l.metres === 0) return erreur("Une dimension cible ne peut pas être nulle.");
    cibles.push(l.metres);
    facteurs.push(null);
    nbCibles++;
  }
  if (nbFacteurs > 0 && nbCibles > 0) {
    return erreur("Ne mélangez pas facteurs et longueurs : tapez soit des facteurs (2;3), soit des dimensions (3m).");
  }
  return nbCibles > 0 ? { genre: "echelle-cible", longueurs: cibles } : { genre: "echelle", facteurs };
}

function formeChampVision(t: string, loc: Locale): ResultatSaisie | null {
  const mm = /^(.*?)\s*mm$/i.exec(t);
  if (mm) {
    const v = lireReel(mm[1] ?? "", loc);
    if (v === null) return null;
    if (v <= 0) return erreur("La focale doit être strictement positive.");
    return { genre: "focale", millimetres: v };
  }
  const deg = /^(.*?)\s*(?:deg\.?|°)?$/i.exec(t);
  const v = lireReel(deg?.[1] ?? "", loc);
  if (v === null) return null;
  if (v <= 0 || v >= 180) return erreur("Le champ de vision doit être compris strictement entre 0 et 180 degrés.");
  return { genre: "champ-vision", degres: v };
}

const MSG_FORME: Readonly<Record<AttenduSaisie, string>> = {
  longueur: "une longueur (ex. 3m, 2.7, 5'6\")",
  "longueur-ou-point": "une longueur ou un point [x, y, z] / <x, y, z>",
  "distance-reseau": "une distance, un point [x, y, z] / <x, y, z> ou un réseau (x5, 5x, /5, 5/)",
  dimensions2: "deux dimensions (ex. 4m,3m)",
  dimensions3: "jusqu'à trois dimensions (ex. 1,2,3)",
  "longueur-angle": "une longueur et un angle (ex. 2m,90)",
  rayon: "un rayon (ex. 1m) ou un nombre de segments (ex. 24s)",
  arc: "une longueur, un rayon (ex. 24r) ou un nombre de segments (ex. 12s)",
  cotes: "un nombre de côtés entre 3 et 999 (ex. 6 ou 6s)",
  segments: "un nombre entier de segments (ex. 5)",
  angle: "un angle en degrés (ex. 45) ou une pente (ex. 1:2)",
  "angle-arc": "un angle en degrés (ex. 90) ou un nombre de segments (ex. 12s)",
  "angle-reseau": "un angle (ex. 30), une pente (ex. 1:2) ou un réseau (x5, /5)",
  echelle: "un facteur (ex. 1.5), plusieurs facteurs (ex. 2,3) ou une dimension (ex. 3m)",
  "champ-vision": "un champ de vision en degrés (ex. 35) ou une focale (ex. 50mm)",
  texte: "un texte",
  aucune: "rien",
};

function essayer(forme: Forme, t: string, loc: Locale, ctx: ContexteSaisie): ResultatSaisie | null {
  switch (forme) {
    case "longueur":
      return formeLongueur(t, loc);
    case "point":
      return formePoint(t, loc);
    case "liste2":
      return formeListe(t, loc, 2);
    case "liste3":
      return formeListe(t, loc, 3);
    case "longueur-angle":
      return formeLongueurAngle(t, loc);
    case "rayon":
      return formeRayon(t, loc, ctx);
    case "rayon-r":
      return formeRayonR(t, loc);
    case "segments":
      return formeSegments(t);
    case "entier-cotes":
      return formeEntierCotes(t);
    case "entier":
      return formeEntier(t);
    case "angle":
      return formeAngle(t, loc);
    case "reseau":
      return formeReseau(t);
    case "echelle":
      return formeEchelle(t, loc);
    case "champ-vision":
      return formeChampVision(t, loc);
    case "texte":
      return { genre: "texte", texte: t };
  }
}

/**
 * Analyse une saisie du champ Mesures selon ce que l'outil attend.
 * Ne lève jamais d'exception : toute anomalie donne `{ genre: 'erreur', message }`.
 */
/** Point saisi converti du repère de saisie vers le repère stocké. */
function dansLeRepere(r: Extract<ResultatSaisie, { genre: "point" }>, rep: NonNullable<ContexteSaisie["repere"]>): ResultatSaisie {
  const { x, y, z } = r.point;
  const v = v3(x * rep.x.x + y * rep.y.x + z * rep.z.x, x * rep.x.y + y * rep.y.y + z * rep.z.y, x * rep.x.z + y * rep.y.z + z * rep.z.z);
  return { ...r, point: r.reference === "absolue" ? v3(v.x + rep.origine.x, v.y + rep.origine.y, v.z + rep.origine.z) : v };
}

export function analyserSaisie(texte: string, contexte: ContexteSaisie): ResultatSaisie {
  try {
    const loc: Locale = { dec: contexte.separateurDecimal ?? ".", uniteModele: contexte.uniteModele ?? "m" };
    const t = texte.trim();
    if (contexte.attendu === "aucune") return erreur("Cet outil n'attend aucune saisie dans le champ Mesures.");
    if (contexte.attendu === "texte") return { genre: "texte", texte: t };
    if (t === "") return erreur("Saisie vide.");
    for (const forme of FORMES_PAR_ATTENDU[contexte.attendu]) {
      const r = essayer(forme, t, loc, contexte);
      if (r !== null) return r.genre === "point" && contexte.repere ? dansLeRepere(r, contexte.repere) : r;
    }
    return erreur(`Saisie « ${t} » non reconnue : attendu ${MSG_FORME[contexte.attendu]}.`);
  } catch {
    return erreur("Saisie non reconnue.");
  }
}
