/**
 * PDF reçu (cas 4 du catalogue des extensions, lot C4, étape 4 : D10-F14-008, D10-F14-009, D10-S-004). Pur : ni React,
 * ni DOM ; la décompression (FlateDecode) est celle d'`inflate.ts` (écrite pour Fadi, aucune bibliothèque), remplaçable
 * par l'appelant.
 *
 * - Lecture d'un PDF reçu : objets directs et flux d'objets (PDF 1.5), arbre des pages, MediaBox, Rotate, UserUnit,
 *   contenus et formulaires (XObject Form) ; traits peints (S, s, B, b…) en segments, en millimètres papier, origine en
 *   bas à gauche de la page ; aplats (f, F, f*) comptés, jamais repris ; textes relevés pour proposer l'échelle.
 * - Arcs reconstruits : une courbe de Bézier qui suit un cercle à `TOLERANCE_ARC_MM` près devient un vrai arc ; les arcs
 *   consécutifs d'un même cercle sont réunis (un cercle complet en quatre Bézier redevient un cercle). Les autres courbes
 *   sont posées en segments, comptées.
 * - Images (page scannée) : JPEG (DCTDecode) ou pixels 8 bits gris / RVB (FlateDecode), avec leur matrice sur la page.
 * - Échelle : proposée d'après le texte (« 1:100 », « 1/50 ») ou d'après la barre d'échelle pointée ; jamais appliquée
 *   sans confirmation (l'insertion la demande en argument).
 * - Insertion : une page en arêtes du modèle, dans un groupe nommé d'après le fichier et la page, à l'altitude du niveau.
 */
import { ajouterArc, ajouterPolygone, ajouterSegments, grouperVide, type Id, type Modele } from "./geometrie-libre.js";
import type { PoseFond } from "./fonds.js";
import { inflerSync } from "./inflate.js";
import { pointsArc } from "./outils/commun-formes.js";
import { type Vec3, v3 } from "./vecteur.js";

/** Décompression zlib (FlateDecode) fournie par l'appelant ; `null` = flux illisible. */
export type Inflate = (octets: Uint8Array) => Uint8Array | null;

export interface PointPdf {
  readonly x: number;
  readonly y: number;
}
/** Segment en millimètres papier. */
export interface TraitPdf {
  readonly a: PointPdf;
  readonly b: PointPdf;
}
/** Arc en millimètres papier : départ `debut` (radians), balayage `angle` signé (positif = sens trigonométrique). */
export interface ArcPdf {
  readonly centre: PointPdf;
  readonly rayon: number;
  readonly debut: number;
  readonly angle: number;
}
/** Image posée sur la page : matrice [a b c d e f] du carré unité vers la page (mm). */
export interface ImagePdf {
  readonly format: "jpeg" | "pixels";
  readonly octets: Uint8Array;
  readonly largeurPx: number;
  readonly hauteurPx: number;
  /** Composantes par pixel (format « pixels ») : 1 gris, 3 RVB. */
  readonly composantes: 1 | 3;
  readonly matrice: readonly [number, number, number, number, number, number];
}
export interface PagePdf {
  readonly numero: number;
  /** Format de la page affichée (mm, rotation appliquée). */
  readonly largeur: number;
  readonly hauteur: number;
  readonly traits: readonly TraitPdf[];
  readonly arcs: readonly ArcPdf[];
  /** Courbes de Bézier non circulaires posées en segments. */
  readonly courbesEnSegments: number;
  /** Chemins seulement remplis (aplats) : non repris. */
  readonly aplats: number;
  readonly textes: readonly string[];
  readonly images: readonly ImagePdf[];
  /** Images ou contenus non lus (filtre ou codage non pris en charge). */
  readonly nonLus: number;
  /** Plus de `TRAITS_PDF_MAX` traits : la page n'est pas insérable (jamais tronquée sans le dire). */
  readonly tropDeTraits: boolean;
}
export type ErreurLecturePdf = "signature" | "chiffre" | "pages" | "illisible";
export type LecturePdf = { readonly ok: true; readonly pages: readonly PagePdf[] } | { readonly ok: false; readonly erreur: ErreurLecturePdf };

export const MM_PAR_POINT = 25.4 / 72;
/** Écart toléré entre une courbe de Bézier et le cercle qui la remplace (mm papier). */
export const TOLERANCE_ARC_MM = 0.05;
export const TRAITS_PDF_MAX = 200_000;
export const PAGES_PDF_MAX = 500;
export const ECHELLE_PDF_MIN = 1;
export const ECHELLE_PDF_MAX = 100_000;
const IMAGES_PAGE_MAX = 16;
const PROFONDEUR_FORMULAIRES = 8;
/** Écart d'angle (rad) admis pour fermer un cercle : arrondi des coordonnées du fichier. */
const ANGLE_CERCLE = 1e-3;

// ——— Valeurs PDF ———
interface Nom {
  readonly nom: string;
}
interface Chaine {
  readonly chaine: string;
}
interface Ref {
  readonly ref: number;
}
interface Dict {
  readonly dict: Record<string, Valeur>;
  /** Données du flux qui suit le dictionnaire (indices dans le texte source). */
  flux?: { readonly debut: number; readonly source: string };
}
type Valeur = number | boolean | null | Nom | Chaine | Ref | Dict | Valeur[];

const estNom = (v: unknown): v is Nom => typeof v === "object" && v !== null && "nom" in v;
const estChaine = (v: unknown): v is Chaine => typeof v === "object" && v !== null && "chaine" in v;
const estRef = (v: unknown): v is Ref => typeof v === "object" && v !== null && "ref" in v;
const estDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && "dict" in v;

const ESPACE = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);
const estEspace = (c: string) => ESPACE.has(c.charCodeAt(0));
const estRegulier = (c: string | undefined) => c !== undefined && !estEspace(c) && !DELIM.has(c);

/** Lecteur de jetons PDF sur un texte latin-1 (un caractère = un octet). */
class Lecteur {
  constructor(
    readonly s: string,
    public i = 0,
    private readonly refs = true,
  ) {}
  blancs(): void {
    const s = this.s;
    while (this.i < s.length) {
      const c = s[this.i]!;
      if (estEspace(c)) this.i++;
      else if (c === "%") {
        while (this.i < s.length && s[this.i] !== "\n" && s[this.i] !== "\r") this.i++;
      } else break;
    }
  }
  mot(): string {
    const d = this.i;
    while (this.i < this.s.length && estRegulier(this.s[this.i])) this.i++;
    return this.s.slice(d, this.i);
  }
  /** Valeur suivante ; `undefined` = fin ou jeton qui n'est pas une valeur (opérateur, laissé en place). */
  valeur(): Valeur | undefined {
    this.blancs();
    const s = this.s;
    const c = s[this.i];
    if (c === undefined) return undefined;
    if (c === "/") {
      this.i++;
      return { nom: this.mot().replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))) };
    }
    if (c === "(") return { chaine: this.litterale() };
    if (c === "<") {
      if (s[this.i + 1] === "<") {
        this.i += 2;
        const dict: Record<string, Valeur> = {};
        for (;;) {
          this.blancs();
          if (this.i >= s.length) break;
          if (s[this.i] === ">" && s[this.i + 1] === ">") {
            this.i += 2;
            break;
          }
          const k = this.valeur();
          if (!estNom(k)) {
            // Jeton inattendu : on l'enjambe pour ne pas boucler.
            if (k === undefined) this.i++;
            continue;
          }
          const v = this.valeur();
          if (v !== undefined) dict[k.nom] = v;
        }
        return { dict };
      }
      this.i++;
      const f = s.indexOf(">", this.i);
      const hex = s.slice(this.i, f < 0 ? s.length : f).replace(/[^0-9a-fA-F]/g, "");
      this.i = f < 0 ? s.length : f + 1;
      let r = "";
      for (let k = 0; k < hex.length; k += 2) r += String.fromCharCode(parseInt((hex[k]! + (hex[k + 1] ?? "0")), 16));
      return { chaine: r };
    }
    if (c === "[") {
      this.i++;
      const t: Valeur[] = [];
      for (;;) {
        this.blancs();
        if (this.i >= s.length) break;
        if (s[this.i] === "]") {
          this.i++;
          break;
        }
        const v = this.valeur();
        if (v === undefined) {
          // Opérateur dans un tableau (contenu malformé) : ignoré.
          if (!this.mot()) this.i++;
          continue;
        }
        t.push(v);
      }
      return t;
    }
    if (c === "+" || c === "-" || c === "." || (c >= "0" && c <= "9")) {
      const d = this.i;
      const m = this.mot();
      const n = Number(m);
      if (!Number.isFinite(n)) {
        this.i = d;
        return undefined;
      }
      if (this.refs && /^\d+$/.test(m)) {
        const avant = this.i;
        this.blancs();
        const g = this.mot();
        if (/^\d+$/.test(g)) {
          this.blancs();
          if (s[this.i] === "R" && !estRegulier(s[this.i + 1])) {
            this.i++;
            return { ref: n };
          }
        }
        this.i = avant;
      }
      return n;
    }
    if (estRegulier(c)) {
      const d = this.i;
      const m = this.mot();
      if (m === "true") return true;
      if (m === "false") return false;
      if (m === "null") return null;
      this.i = d;
      return undefined;
    }
    return undefined;
  }
  litterale(): string {
    const s = this.s;
    this.i++;
    let r = "";
    let prof = 1;
    while (this.i < s.length) {
      const c = s[this.i++]!;
      if (c === "\\") {
        const e = s[this.i++];
        if (e === undefined) break;
        const echap: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
        if (e in echap) r += echap[e];
        else if (e >= "0" && e <= "7") {
          let o = e;
          while (o.length < 3 && s[this.i]! >= "0" && s[this.i]! <= "7") o += s[this.i++];
          r += String.fromCharCode(parseInt(o, 8) & 0xff);
        } else if (e === "\r") {
          if (s[this.i] === "\n") this.i++;
        } else if (e !== "\n") r += e;
      } else if (c === "(") {
        prof++;
        r += c;
      } else if (c === ")") {
        if (--prof === 0) break;
        r += c;
      } else r += c;
    }
    return r;
  }
}

const latin1 = (o: Uint8Array): string => {
  let r = "";
  for (let i = 0; i < o.length; i += 0x8000) r += String.fromCharCode(...o.subarray(i, i + 0x8000));
  return r;
};
const octetsDe = (s: string): Uint8Array => {
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xff;
  return o;
};

/** Table des objets d'un PDF : objets directs (le dernier défini l'emporte) puis objets des flux d'objets. */
class Document {
  private readonly positions = new Map<number, number>();
  private readonly enFlux = new Map<number, { readonly source: string; readonly pos: number }>();
  private readonly cache = new Map<number, Valeur>();
  constructor(
    readonly s: string,
    readonly inflate: Inflate,
  ) {
    for (const m of s.matchAll(/(?:^|[\s>\]])(\d+)\s+(\d+)\s+obj\b/g)) this.positions.set(Number(m[1]), m.index! + m[0].length);
    for (const n of [...this.positions.keys()]) {
      const v = this.objet(n);
      if (!estDict(v) || !estNom(v.dict.Type) || v.dict.Type.nom !== "ObjStm") continue;
      const octets = this.flux(v);
      const nb = v.dict.N;
      const premier = v.dict.First;
      if (!octets || typeof nb !== "number" || typeof premier !== "number") continue;
      const src = latin1(octets);
      const l = new Lecteur(src, 0, false);
      for (let k = 0; k < nb; k++) {
        const num = l.valeur();
        const pos = l.valeur();
        if (typeof num !== "number" || typeof pos !== "number") break;
        if (!this.positions.has(num) && !this.enFlux.has(num)) this.enFlux.set(num, { source: src, pos: premier + pos });
      }
    }
  }
  numeros(): number[] {
    return [...new Set([...this.positions.keys(), ...this.enFlux.keys()])].sort((a, b) => a - b);
  }
  objet(n: number): Valeur | undefined {
    if (this.cache.has(n)) return this.cache.get(n);
    let v: Valeur | undefined;
    const p = this.positions.get(n);
    if (p !== undefined) {
      const l = new Lecteur(this.s, p);
      v = l.valeur();
      if (estDict(v)) {
        l.blancs();
        if (this.s.startsWith("stream", l.i)) {
          let d = l.i + 6;
          if (this.s[d] === "\r") d++;
          if (this.s[d] === "\n") d++;
          v.flux = { debut: d, source: this.s };
        }
      }
    } else {
      const e = this.enFlux.get(n);
      if (e) v = new Lecteur(e.source, e.pos).valeur();
    }
    this.cache.set(n, v ?? null);
    return v;
  }
  resoudre(v: Valeur | undefined, prof = 0): Valeur | undefined {
    return estRef(v) && prof < 32 ? this.resoudre(this.objet(v.ref), prof + 1) : v;
  }
  /** Octets bruts du flux (avant filtres). */
  brut(d: Dict): Uint8Array | null {
    if (!d.flux) return null;
    const { debut, source } = d.flux;
    const lg = this.resoudre(d.dict.Length);
    let fin = typeof lg === "number" && lg >= 0 && debut + lg <= source.length && /^\s*endstream/.test(source.slice(debut + lg, debut + lg + 32)) ? debut + lg : -1;
    if (fin < 0) {
      const k = source.indexOf("endstream", debut);
      if (k < 0) return null;
      fin = k;
      while (fin > debut && (source[fin - 1] === "\n" || source[fin - 1] === "\r")) fin--;
    }
    return octetsDe(source.slice(debut, fin));
  }
  filtres(d: Dict): string[] {
    const f = this.resoudre(d.dict.Filter);
    const t = Array.isArray(f) ? f.map((x) => this.resoudre(x)) : f === undefined || f === null ? [] : [f];
    return t.map((x) => (estNom(x) ? x.nom : "?"));
  }
  /** Flux décodé (FlateDecode seulement, sans prédicteur) ; `null` = filtre non pris en charge ou flux illisible. */
  flux(d: Dict): Uint8Array | null {
    let o = this.brut(d);
    if (!o) return null;
    for (const f of this.filtres(d)) {
      if (f !== "FlateDecode" && f !== "Fl") return null;
      o = this.inflate(o);
      if (!o) return null;
    }
    const p = this.resoudre(d.dict.DecodeParms);
    if (estDict(p) && typeof this.resoudre(p.dict.Predictor) === "number" && (this.resoudre(p.dict.Predictor) as number) > 1) return null;
    return o;
  }
}

// ——— Matrices (convention PDF : x' = a·x + c·y + e, y' = b·x + d·y + f) ———
type M6 = readonly [number, number, number, number, number, number];
const ID6: M6 = [1, 0, 0, 1, 0, 0];
const mult = (m: M6, n: M6): M6 => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
const app = (m: M6, x: number, y: number): PointPdf => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const lireM6 = (v: Valeur | undefined): M6 | null => (Array.isArray(v) && v.length === 6 && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? (v as unknown as M6) : null);

const dist = (a: PointPdf, b: PointPdf) => Math.hypot(a.x - b.x, a.y - b.y);

/** Cercle passant par trois points ; null si alignés. */
function cercle3(a: PointPdf, b: PointPdf, c: PointPdf): { readonly centre: PointPdf; readonly rayon: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const centre = { x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d, y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d };
  return { centre, rayon: dist(centre, a) };
}

const bezier = (p: readonly PointPdf[], t: number): PointPdf => {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: k[0]! * p[0]!.x + k[1]! * p[1]!.x + k[2]! * p[2]!.x + k[3]! * p[3]!.x, y: k[0]! * p[0]!.y + k[1]! * p[1]!.y + k[2]! * p[2]!.y + k[3]! * p[3]!.y };
};
const normAngle = (a: number) => {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
};

/** Arc de cercle qui suit la courbe de Bézier `p` (mm) à `TOLERANCE_ARC_MM` près ; null sinon. */
export function arcDeBezier(p: readonly PointPdf[]): ArcPdf | null {
  const m = bezier(p, 0.5);
  const c = cercle3(p[0]!, m, p[3]!);
  if (!c || c.rayon > 1e6 || c.rayon < 1e-4) return null;
  for (const t of [0.125, 0.25, 0.375, 0.625, 0.75, 0.875]) if (Math.abs(dist(bezier(p, t), c.centre) - c.rayon) > TOLERANCE_ARC_MM) return null;
  const ang = (q: PointPdf) => Math.atan2(q.y - c.centre.y, q.x - c.centre.x);
  const a0 = ang(p[0]!);
  // Balayage : somme des pas signés le long de la courbe (jamais plus d'un demi-tour par pas).
  let total = 0;
  let prec = a0;
  for (const t of [0.25, 0.5, 0.75, 1]) {
    const a = ang(bezier(p, t));
    total += normAngle(a - prec);
    prec = a;
  }
  if (Math.abs(total) < 1e-6) return null;
  return { centre: c.centre, rayon: c.rayon, debut: a0, angle: total };
}

/** Points d'une courbe de Bézier non circulaire, posée en segments (4 à 32 selon sa longueur). */
function aplatir(p: readonly PointPdf[]): PointPdf[] {
  const l = dist(p[0]!, p[1]!) + dist(p[1]!, p[2]!) + dist(p[2]!, p[3]!);
  const n = Math.max(4, Math.min(32, Math.ceil(l / 2)));
  const r: PointPdf[] = [];
  for (let i = 0; i <= n; i++) r.push(bezier(p, i / n));
  return r;
}

type Element = { readonly k: "l"; readonly a: PointPdf; readonly b: PointPdf } | { readonly k: "c"; readonly p: readonly PointPdf[] };

interface Etat {
  ctm: M6;
}

/** Interprète une page : traits, arcs, aplats, textes et images. */
function lirePage(doc: Document, page: Dict, numero: number): PagePdf | null {
  const herite = (cle: string): Valeur | undefined => {
    let d: Dict | undefined = page;
    for (let k = 0; d && k < 64; k++) {
      const v = doc.resoudre(d.dict[cle]);
      if (v !== undefined) return v;
      const p = doc.resoudre(d.dict.Parent);
      d = estDict(p) ? p : undefined;
    }
    return undefined;
  };
  const boite = herite("MediaBox");
  if (!Array.isArray(boite) || boite.length !== 4) return null;
  const [x0, y0, x1, y1] = boite.map((v) => doc.resoudre(v)) as number[];
  if (![x0, y0, x1, y1].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const uu = doc.resoudre(page.dict.UserUnit);
  const k = MM_PAR_POINT * (typeof uu === "number" && uu > 0 ? uu : 1);
  const L = Math.abs(x1! - x0!);
  const H = Math.abs(y1! - y0!);
  const rot = (((Number(herite("Rotate")) || 0) % 360) + 360) % 360;
  const bx = Math.min(x0!, x1!);
  const by = Math.min(y0!, y1!);
  // Page affichée : rotation horaire de /Rotate, puis points → mm.
  const t: M6 = [1, 0, 0, 1, -bx, -by];
  const r: M6 = rot === 90 ? [0, -1, 1, 0, 0, L] : rot === 180 ? [-1, 0, 0, -1, L, H] : rot === 270 ? [0, 1, -1, 0, H, 0] : ID6;
  const base = mult(mult(t, r), [k, 0, 0, k, 0, 0]);
  const [largeur, hauteur] = rot === 90 || rot === 270 ? [H * k, L * k] : [L * k, H * k];

  const traits: TraitPdf[] = [];
  const arcs: ArcPdf[] = [];
  const textes: string[] = [];
  const images: ImagePdf[] = [];
  let courbesEnSegments = 0;
  let aplats = 0;
  let nonLus = 0;
  let trop = false;
  const pousser = (a: PointPdf, b: PointPdf) => {
    if (dist(a, b) < 1e-6) return;
    if (traits.length >= TRAITS_PDF_MAX) {
      trop = true;
      return;
    }
    traits.push({ a, b });
  };

  const peindre = (chemins: Element[][]) => {
    for (const sp of chemins) {
      let courant: ArcPdf | null = null;
      const fermerArc = () => {
        if (courant) arcs.push(courant);
        courant = null;
      };
      for (const e of sp) {
        if (e.k === "l") {
          fermerArc();
          pousser(e.a, e.b);
          continue;
        }
        const a = arcDeBezier(e.p);
        if (a) {
          const c = courant as ArcPdf | null;
          // Suite du même cercle, même sens : réunie (un cercle en quatre Bézier redevient un cercle).
          if (c && dist(c.centre, a.centre) < TOLERANCE_ARC_MM && Math.abs(c.rayon - a.rayon) < TOLERANCE_ARC_MM && Math.sign(c.angle) === Math.sign(a.angle) && Math.abs(c.angle + a.angle) <= 2 * Math.PI + ANGLE_CERCLE) {
            const somme = c.angle + a.angle;
            // Un tour à l'arrondi près des coordonnées du fichier est un cercle complet.
            courant = { ...c, angle: Math.abs(somme) > 2 * Math.PI - ANGLE_CERCLE ? Math.sign(somme) * 2 * Math.PI : somme };
          } else {
            fermerArc();
            courant = a;
          }
          continue;
        }
        fermerArc();
        const ligne = aplatir(e.p);
        // Courbe dégénérée en droite (points de contrôle alignés) : un seul trait, pas une courbe en segments.
        const droite = cercle3(e.p[0]!, e.p[1]!, e.p[3]!) === null && cercle3(e.p[0]!, e.p[2]!, e.p[3]!) === null;
        if (droite) pousser(e.p[0]!, e.p[3]!);
        else {
          courbesEnSegments++;
          for (let i = 1; i < ligne.length; i++) pousser(ligne[i - 1]!, ligne[i]!);
        }
      }
      fermerArc();
    }
  };

  const executer = (contenu: string, ressources: Valeur | undefined, ctm0: M6, prof: number) => {
    const res = doc.resoudre(ressources);
    const l = new Lecteur(contenu, 0, false);
    const pile: Etat[] = [];
    let etat: Etat = { ctm: ctm0 };
    let ops: Valeur[] = [];
    let chemins: Element[][] = [];
    let sp: Element[] = [];
    let debut: PointPdf | null = null;
    let cour: PointPdf | null = null;
    let enTexte = false;
    const P = (x: unknown, y: unknown): PointPdf => app(etat.ctm, Number(x), Number(y));
    const finSp = () => {
      if (sp.length) chemins.push(sp);
      sp = [];
    };
    const fermer = () => {
      if (cour && debut && dist(cour, debut) > 1e-9) sp.push({ k: "l", a: cour, b: debut });
      cour = debut;
      finSp();
    };
    const vider = () => {
      finSp();
      chemins = [];
      debut = cour = null;
    };
    const texte = (v: Valeur | undefined) => {
      if (estChaine(v)) textes.push(v.chaine);
      else if (Array.isArray(v)) textes.push(v.map((x) => (estChaine(x) ? x.chaine : typeof x === "number" && x < -200 ? " " : "")).join(""));
    };
    for (;;) {
      const v = l.valeur();
      if (v !== undefined) {
        ops.push(v);
        continue;
      }
      l.blancs();
      if (l.i >= contenu.length) break;
      const op = l.mot();
      if (!op) {
        l.i++;
        ops = [];
        continue;
      }
      const n = ops.map((x) => (typeof x === "number" ? x : NaN));
      switch (op) {
        case "q":
          pile.push({ ...etat });
          break;
        case "Q":
          etat = pile.pop() ?? etat;
          break;
        case "cm": {
          const m = lireM6(ops.slice(-6));
          if (m) etat = { ...etat, ctm: mult(m, etat.ctm) };
          break;
        }
        case "m":
          finSp();
          debut = cour = P(n[0], n[1]);
          break;
        case "l": {
          const b = P(n[0], n[1]);
          if (cour) sp.push({ k: "l", a: cour, b });
          else debut = b;
          cour = b;
          break;
        }
        case "c":
        case "v":
        case "y": {
          if (!cour) break;
          const q: PointPdf[] = op === "c" ? [P(n[0], n[1]), P(n[2], n[3]), P(n[4], n[5])] : op === "v" ? [cour, P(n[0], n[1]), P(n[2], n[3])] : [P(n[0], n[1]), P(n[2], n[3]), P(n[2], n[3])];
          sp.push({ k: "c", p: [cour, ...q] });
          cour = q[2]!;
          break;
        }
        case "h":
          fermer();
          break;
        case "re": {
          finSp();
          const [x, y, w, h] = n as [number, number, number, number];
          const c4 = [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)];
          chemins.push(c4.map((a, i) => ({ k: "l" as const, a, b: c4[(i + 1) % 4]! })));
          debut = cour = c4[0]!;
          break;
        }
        case "S":
          finSp();
          peindre(chemins);
          vider();
          break;
        case "s":
        case "b":
        case "b*":
          fermer();
          peindre(chemins);
          vider();
          break;
        case "B":
        case "B*":
          finSp();
          peindre(chemins);
          vider();
          break;
        case "f":
        case "F":
        case "f*":
          finSp();
          if (chemins.length) aplats++;
          vider();
          break;
        case "n":
          vider();
          break;
        case "BT":
          enTexte = true;
          break;
        case "ET":
          enTexte = false;
          break;
        case "Tj":
        case "'":
        case '"':
        case "TJ":
          if (enTexte) texte(ops[ops.length - 1]);
          break;
        case "BI": {
          // Image en ligne : enjambée (comptée non lue).
          const id = contenu.indexOf("ID", l.i);
          const ei = id < 0 ? -1 : contenu.slice(id + 3).search(/\sEI(\s|$)/);
          l.i = ei < 0 ? contenu.length : id + 3 + ei + 3;
          nonLus++;
          break;
        }
        case "Do": {
          const nm = ops[ops.length - 1];
          const xo = estDict(res) ? doc.resoudre(res.dict.XObject) : undefined;
          const x = estNom(nm) && estDict(xo) ? doc.resoudre(xo.dict[nm.nom]) : undefined;
          if (!estDict(x)) break;
          const st = doc.resoudre(x.dict.Subtype);
          if (estNom(st) && st.nom === "Form") {
            if (prof >= PROFONDEUR_FORMULAIRES) {
              nonLus++;
              break;
            }
            const o = doc.flux(x);
            if (!o) {
              nonLus++;
              break;
            }
            const mf = lireM6(doc.resoudre(x.dict.Matrix) as Valeur) ?? ID6;
            const avant = etat;
            executer(latin1(o), x.dict.Resources ?? ressources, mult(mf, etat.ctm), prof + 1);
            etat = avant;
          } else if (estNom(st) && st.nom === "Image") {
            const img = lireImage(doc, x, etat.ctm);
            if (img && images.length < IMAGES_PAGE_MAX) images.push(img);
            else nonLus++;
          }
          break;
        }
        default:
          break;
      }
      ops = [];
    }
  };

  const c = doc.resoudre(page.dict.Contents);
  const flux = (Array.isArray(c) ? c.map((x) => doc.resoudre(x)) : [c]).filter(estDict);
  let contenu = "";
  for (const f of flux) {
    const o = doc.flux(f);
    if (!o) nonLus++;
    else contenu += latin1(o) + "\n";
  }
  executer(contenu, herite("Resources"), base, 0);
  return { numero, largeur, hauteur, traits, arcs, courbesEnSegments, aplats, textes: textes.map((s) => s.replace(/[\0-\x1f]/g, " ").trim()).filter(Boolean), images, nonLus, tropDeTraits: trop };
}

/** Image d'une page : JPEG tel quel, ou pixels 8 bits gris / RVB décompressés ; null = non prise en charge. */
function lireImage(doc: Document, x: Dict, ctm: M6): ImagePdf | null {
  const w = doc.resoudre(x.dict.Width);
  const h = doc.resoudre(x.dict.Height);
  if (typeof w !== "number" || typeof h !== "number" || w < 1 || h < 1) return null;
  const filtres = doc.filtres(x);
  if (filtres.length === 1 && (filtres[0] === "DCTDecode" || filtres[0] === "DCT")) {
    const o = doc.brut(x);
    return o ? { format: "jpeg", octets: o, largeurPx: w, hauteurPx: h, composantes: 3, matrice: ctm } : null;
  }
  const bpc = doc.resoudre(x.dict.BitsPerComponent);
  const cs = doc.resoudre(x.dict.ColorSpace);
  let comp: 1 | 3 | 0 = 0;
  if (Array.isArray(cs) && estNom(cs[0]) && cs[0].nom === "ICCBased") {
    const icc = doc.resoudre(cs[1]);
    const nn = estDict(icc) ? doc.resoudre(icc.dict.N) : undefined;
    comp = nn === 1 ? 1 : nn === 3 ? 3 : 0;
  } else if (estNom(cs)) comp = cs.nom === "DeviceGray" || cs.nom === "G" ? 1 : cs.nom === "DeviceRGB" || cs.nom === "RGB" ? 3 : 0;
  if (bpc !== 8 || comp === 0) return null;
  const o = doc.flux(x);
  if (!o || o.length < w * h * comp) return null;
  return { format: "pixels", octets: o, largeurPx: w, hauteurPx: h, composantes: comp, matrice: ctm };
}

/** Lit un PDF reçu : pages dans l'ordre de l'arbre des pages (ou des objets, à défaut). */
export function lirePdfRecu(octets: Uint8Array, inflate: Inflate = inflerSync): LecturePdf {
  const s = latin1(octets);
  if (!s.slice(0, 1024).includes("%PDF-")) return { ok: false, erreur: "signature" };
  if (/\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(s)) return { ok: false, erreur: "chiffre" };
  let doc: Document;
  try {
    doc = new Document(s, inflate);
  } catch {
    return { ok: false, erreur: "illisible" };
  }
  const estType = (v: Valeur | undefined, t: string): v is Dict => estDict(v) && estNom(v.dict.Type) && v.dict.Type.nom === t;
  // Arbre des pages depuis le catalogue ; à défaut, les objets /Type /Page dans l'ordre des numéros.
  const pages: Dict[] = [];
  const vus = new Set<Valeur>();
  const parcourir = (v: Valeur | undefined, prof: number) => {
    const d = doc.resoudre(v);
    if (!estDict(d) || vus.has(d) || prof > 64 || pages.length >= PAGES_PDF_MAX) return;
    vus.add(d);
    if (estType(d, "Page")) pages.push(d);
    else {
      const kids = doc.resoudre((d as Dict).dict.Kids);
      if (Array.isArray(kids)) for (const k of kids) parcourir(k, prof + 1);
    }
  };
  const nums = doc.numeros();
  const catalogue = nums.map((n) => doc.objet(n)).filter((v) => estType(v, "Catalog")).pop() as Dict | undefined;
  if (catalogue) parcourir(catalogue.dict.Pages, 0);
  if (pages.length === 0) for (const n of nums) {
    const v = doc.objet(n);
    if (estType(v, "Page") && pages.length < PAGES_PDF_MAX) pages.push(v);
  }
  if (pages.length === 0) return { ok: false, erreur: "pages" };
  const lues: PagePdf[] = [];
  for (let i = 0; i < pages.length; i++) {
    let p: PagePdf | null = null;
    try {
      p = lirePage(doc, pages[i]!, i + 1);
    } catch {
      p = null;
    }
    if (p) lues.push(p);
  }
  return lues.length ? { ok: true, pages: lues } : { ok: false, erreur: "illisible" };
}

/** Échelles écrites dans les textes de la page (« 1:100 », « 1/50 », « 1 : 1 000 »), la plus fréquente en premier. */
export function echellesDuTexte(textes: readonly string[]): { readonly echelle: number; readonly texte: string }[] {
  const compte = new Map<number, { texte: string; n: number }>();
  for (const t of textes) {
    for (const m of t.matchAll(/(?<![\d.,])1\s*[:/]\s*(\d{1,3}(?:[  '’]\d{3})+|\d{1,6})(?![\d.,]?\d)/g)) {
      const n = Number(m[1]!.replace(/[  '’]/g, ""));
      if (!Number.isInteger(n) || n < 2 || n > ECHELLE_PDF_MAX) continue;
      const e = compte.get(n) ?? { texte: t.trim().slice(0, 60), n: 0 };
      e.n++;
      compte.set(n, e);
    }
  }
  return [...compte.entries()].sort((a, b) => b[1].n - a[1].n || a[0] - b[0]).map(([echelle, e]) => ({ echelle, texte: e.texte }));
}

/** Échelle d'après la barre d'échelle pointée : longueur papier (mm) et longueur réelle déclarée (m). */
export function echelleDeLaBarre(papierMm: number, reelleM: number): number | null {
  if (!(papierMm > 1e-6) || !(reelleM > 0) || !Number.isFinite(reelleM)) return null;
  const n = (reelleM * 1000) / papierMm;
  return n >= ECHELLE_PDF_MIN && n <= ECHELLE_PDF_MAX ? n : null;
}

export const estEchellePdf = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= ECHELLE_PDF_MIN && n <= ECHELLE_PDF_MAX;

/** Longueur réelle (m) de deux points papier (mm) à l'échelle 1:`echelle`. */
export const mesurePdf = (a: PointPdf, b: PointPdf, echelle: number): number => (dist(a, b) * echelle) / 1000;

/** Extrémité de trait ou d'arc (ou centre de cercle) la plus proche de `p` à `tol` mm près ; sinon `p`. */
export function accrocherPdf(page: PagePdf, p: PointPdf, tol: number): { readonly point: PointPdf; readonly accroche: boolean } {
  let best: PointPdf | null = null;
  let d = tol;
  const essai = (q: PointPdf) => {
    const e = dist(p, q);
    if (e <= d) {
      d = e;
      best = q;
    }
  };
  for (const t of page.traits) {
    essai(t.a);
    essai(t.b);
  }
  for (const a of page.arcs) {
    essai({ x: a.centre.x + a.rayon * Math.cos(a.debut), y: a.centre.y + a.rayon * Math.sin(a.debut) });
    essai({ x: a.centre.x + a.rayon * Math.cos(a.debut + a.angle), y: a.centre.y + a.rayon * Math.sin(a.debut + a.angle) });
    essai(a.centre);
  }
  return best ? { point: best, accroche: true } : { point: p, accroche: false };
}

export const estCercleComplet = (a: ArcPdf): boolean => Math.abs(Math.abs(a.angle) - 2 * Math.PI) < 1e-9;

export type ErreurInsertionPdf = "echelle" | "vide" | "limite" | "position";
export type ResultatInsertionPdf =
  | { readonly ok: true; readonly modele: Modele; readonly occurrence: Id; readonly traits: number; readonly arcs: number }
  | { readonly ok: false; readonly erreur: ErreurInsertionPdf };

/**
 * Insère une page en arêtes du modèle, à l'échelle 1:`echelle` confirmée : un point papier (mm) devient
 * `origine + mm × echelle / 1000` (m) à l'altitude `altitude`. Un groupe par page, nommé `nom`, décrit par `description`
 * (fichier, page, échelle, empreinte de l'original archivé).
 */
export function insererPagePdf(
  m: Modele,
  page: PagePdf,
  o: { readonly echelle: number; readonly x: number; readonly y: number; readonly altitude: number; readonly nom: string; readonly description: string },
): ResultatInsertionPdf {
  if (!estEchellePdf(o.echelle)) return { ok: false, erreur: "echelle" };
  if (![o.x, o.y, o.altitude].every(Number.isFinite)) return { ok: false, erreur: "position" };
  if (page.tropDeTraits) return { ok: false, erreur: "limite" };
  if (page.traits.length === 0 && page.arcs.length === 0) return { ok: false, erreur: "vide" };
  const k = o.echelle / 1000;
  const V = (p: PointPdf): Vec3 => v3(o.x + p.x * k, o.y + p.y * k, o.altitude);
  const g = grouperVide(m, { nom: o.nom, description: o.description });
  let modele = g.modele;
  const dans = g.occurrence;
  if (page.traits.length) modele = ajouterSegments(modele, page.traits.map((t) => [V(t.a), V(t.b)] as const), { dans }).modele;
  const haut = v3(0, 0, 1);
  for (const a of page.arcs) {
    const centre = V(a.centre);
    const rayon = a.rayon * k;
    if (rayon < 1e-6) continue;
    if (estCercleComplet(a)) {
      modele = ajouterPolygone(modele, centre, haut, rayon, 24, { dans, genre: "cercle", depart: V({ x: a.centre.x + a.rayon * Math.cos(a.debut), y: a.centre.y + a.rayon * Math.sin(a.debut) }) }).modele;
      continue;
    }
    const n = a.angle >= 0 ? haut : v3(0, 0, -1);
    const depart = v3(Math.cos(a.debut), Math.sin(a.debut), 0);
    const cotes = Math.max(3, Math.min(999, Math.ceil((Math.abs(a.angle) / (2 * Math.PI)) * 24)));
    const pts = pointsArc({ centre, normale: n, rayon, depart, angle: Math.abs(a.angle) }, cotes);
    modele = ajouterArc(modele, pts, { centre, rayon, normale: n }, { dans }).modele;
  }
  return { ok: true, modele, occurrence: dans, traits: page.traits.length, arcs: page.arcs.length };
}

/**
 * Pose d'un fond (étape 1) pour l'image d'une page scannée, à l'échelle 1:`echelle` et à l'origine (x, y) : pixels
 * carrés, sans miroir, sinon refusée (« cisaillement »).
 */
export function poseImagePdf(img: ImagePdf, echelle: number, x: number, y: number): { readonly pose: PoseFond } | { readonly erreur: "echelle" | "cisaillement" } {
  if (!estEchellePdf(echelle)) return { erreur: "echelle" };
  const [a, b, c, d, e, f] = img.matrice;
  const k = echelle / 1000;
  // Pas d'un pixel en u (vers la droite) et en v (vers le bas), en mètres.
  const u = { x: (a / img.largeurPx) * k, y: (b / img.largeurPx) * k };
  const v = { x: (-c / img.hauteurPx) * k, y: (-d / img.hauteurPx) * k };
  const lu = Math.hypot(u.x, u.y);
  const lv = Math.hypot(v.x, v.y);
  if (lu < 1e-12 || Math.abs(lu - lv) > lu * 0.01) return { erreur: "cisaillement" };
  const rotation = Math.atan2(u.y, u.x);
  // versPlan : v = (sin, −cos) × échelle ; un autre sens est un miroir.
  const attendu = { x: Math.sin(rotation) * lu, y: -Math.cos(rotation) * lu };
  if (Math.hypot(attendu.x - v.x, attendu.y - v.y) > lu * 0.01) return { erreur: "cisaillement" };
  // Coin haut gauche de l'image : (0 ; 1) du carré unité.
  return { pose: { echelle: lu, rotation, x: x + (c + e) * k, y: y + (d + f) * k } };
}
