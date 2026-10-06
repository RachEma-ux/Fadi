/**
 * Dessin vectoriel neutre des documents dérivés (cahier §5.9) : une vue générée est une liste de primitives dans
 * son propre repère plan (mètres ; plan : repère local du projet ; coupe / façade : abscisse le long du plan de
 * vue, ordonnée = altitude). Les rendus SVG, DXF et PDF lisent ces primitives ; rien ne dépend du DOM.
 */
import type { Vec } from "../geometrie.js";

/** Nature du trait : elle décide de l'épaisseur et du motif dans chaque rendu (jamais la couleur seule). */
export type Trait =
  /** Matière coupée (murs, poteaux, dalles traversés par le plan de coupe). */
  | "coupe"
  /** Arête vue au-delà du plan de coupe. */
  | "vue"
  /** Trait fin : mobilier, contours de pièces, marches. */
  | "fin"
  /** Arête cachée (option « lignes cachées » d'une vue). */
  | "cache"
  /** Cotations, textes, étiquettes, flèche du nord. */
  | "annotation"
  /** Parcelle, emprise, reculs (plan de masse). */
  | "site"
  /** Élément à démolir (phase), dessiné en tirets. */
  | "demoli"
  /** Référence à réparer : dessinée et signalée, jamais masquée. */
  | "a-reparer";

/** Remplissage d'un polygone ; « degrade » : bande d'un dégradé de hachure (D-120), gris porté par la primitive. */
export type Remplissage = "poche" | "vitrage" | "piece" | "blanc" | "degrade" | null;

export interface PrimitiveLigne {
  type: "ligne";
  a: Vec;
  b: Vec;
  trait: Trait;
  objetId: string | null;
}

export interface PrimitivePoly {
  type: "poly";
  points: Vec[];
  ferme: boolean;
  trait: Trait | null;
  remplissage: Remplissage;
  objetId: string | null;
  /** Gris propre (0 = noir, 1 = blanc) d'une bande de dégradé (D-120) ; absent : gris du remplissage. */
  gris?: number;
}

export interface PrimitiveTexte {
  type: "texte";
  position: Vec;
  texte: string;
  /** Hauteur des caractères en millimètres sur la feuille (indépendante de l'échelle). */
  hauteurMm: number;
  ancre: "debut" | "milieu" | "fin";
  /** Angle en degrés, sens trigonométrique. */
  angle: number;
  trait: Trait;
  objetId: string | null;
}

export interface PrimitiveCercle {
  type: "cercle";
  centre: Vec;
  rayon: number;
  trait: Trait;
  remplissage: Remplissage;
  objetId: string | null;
}

export type Primitive = PrimitiveLigne | PrimitivePoly | PrimitiveTexte | PrimitiveCercle;

export interface Bornes {
  min: Vec;
  max: Vec;
}

/** Épaisseur imprimée de chaque trait, en millimètres. */
export const EPAISSEUR_MM: Record<Trait, number> = { coupe: 0.5, vue: 0.25, fin: 0.13, cache: 0.18, annotation: 0.18, site: 0.35, demoli: 0.25, "a-reparer": 0.35 };
/** Motif de tirets (mm), vide = continu. */
export const TIRETS_MM: Record<Trait, number[]> = { coupe: [], vue: [], fin: [], cache: [1.5, 1], annotation: [], site: [4, 1, 1, 1], demoli: [2, 1.2], "a-reparer": [] };
/** Gris d'impression (0 = noir, 1 = blanc) ; la nature reste portée par l'épaisseur et le motif. */
export const GRIS_TRAIT: Record<Trait, number> = { coupe: 0, vue: 0.1, fin: 0.35, cache: 0.45, annotation: 0.1, site: 0.2, demoli: 0.3, "a-reparer": 0 };
/** Couleur d'écran / SVG du trait « à réparer » (doublée d'un libellé, jamais seule). */
export const ROUGE_A_REPARER = "#b42318";
export const GRIS_REMPLISSAGE: Record<Exclude<Remplissage, null>, number> = { poche: 0.25, vitrage: 0.88, piece: 0.96, blanc: 1, degrade: 0.5 };

/** Gris d'un polygone rempli : le sien (bande de dégradé) ou celui de son remplissage. */
export const grisRemplissage = (p: { remplissage: Remplissage; gris?: number }): number => p.gris ?? (p.remplissage ? GRIS_REMPLISSAGE[p.remplissage] : 1);

/**
 * Boîte englobante du dessin. Avec l'échelle (1:N), l'encombrement approché des textes est compté (largeur moyenne
 * d'un caractère : 0,55 × sa hauteur sur la feuille), pour que les libellés ne sortent pas du cadre.
 */
export function bornesPrimitives(primitives: readonly Primitive[], echelle?: number): Bornes | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const v = (p: Vec) => {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  };
  for (const p of primitives) {
    if (p.type === "ligne") {
      v(p.a);
      v(p.b);
    } else if (p.type === "poly") p.points.forEach(v);
    else if (p.type === "cercle") {
      v({ x: p.centre.x - p.rayon, y: p.centre.y - p.rayon });
      v({ x: p.centre.x + p.rayon, y: p.centre.y + p.rayon });
    } else {
      v(p.position);
      if (echelle) {
        const h = (p.hauteurMm * echelle) / 1000;
        const w = p.texte.length * 0.55 * h;
        const x0t = p.ancre === "debut" ? p.position.x : p.ancre === "fin" ? p.position.x - w : p.position.x - w / 2;
        v({ x: x0t, y: p.position.y - h * 0.3 });
        v({ x: x0t + w, y: p.position.y + h });
      }
    }
  }
  return Number.isFinite(x0) ? { min: { x: x0, y: y0 }, max: { x: x1, y: y1 } } : null;
}

/** Arrondi stable (1/10 de mm à l'échelle 1:1) : mêmes entrées, mêmes octets. */
export const arrondi = (v: number, pas = 1e-4): number => {
  const r = Math.round(v / pas) * pas;
  return Math.abs(r) < pas / 2 ? 0 : Number(r.toFixed(6));
};

// --- Découpe par un rectangle (vues de détail) ------------------------------------------------------------------

const DEDANS = 0;
const GAUCHE = 1;
const DROITE = 2;
const BAS = 4;
const HAUT = 8;

function code(p: Vec, r: Bornes): number {
  let c = DEDANS;
  if (p.x < r.min.x) c |= GAUCHE;
  else if (p.x > r.max.x) c |= DROITE;
  if (p.y < r.min.y) c |= BAS;
  else if (p.y > r.max.y) c |= HAUT;
  return c;
}

/** Cohen–Sutherland : segment découpé par le rectangle, ou null s'il est dehors. */
export function couperSegment(a: Vec, b: Vec, r: Bornes): [Vec, Vec] | null {
  let p = { ...a };
  let q = { ...b };
  let cp = code(p, r);
  let cq = code(q, r);
  for (let k = 0; k < 20; k++) {
    if (!(cp | cq)) return [p, q];
    if (cp & cq) return null;
    const c = cp || cq;
    let x = 0;
    let y = 0;
    if (c & HAUT) {
      x = p.x + ((q.x - p.x) * (r.max.y - p.y)) / (q.y - p.y);
      y = r.max.y;
    } else if (c & BAS) {
      x = p.x + ((q.x - p.x) * (r.min.y - p.y)) / (q.y - p.y);
      y = r.min.y;
    } else if (c & DROITE) {
      y = p.y + ((q.y - p.y) * (r.max.x - p.x)) / (q.x - p.x);
      x = r.max.x;
    } else {
      y = p.y + ((q.y - p.y) * (r.min.x - p.x)) / (q.x - p.x);
      x = r.min.x;
    }
    if (c === cp) {
      p = { x, y };
      cp = code(p, r);
    } else {
      q = { x, y };
      cq = code(q, r);
    }
  }
  return null;
}

/** Sutherland–Hodgman : polygone fermé découpé par le rectangle. */
export function couperPolygone(points: readonly Vec[], r: Bornes): Vec[] {
  type Bord = { dedans: (p: Vec) => boolean; inter: (a: Vec, b: Vec) => Vec };
  const lerpX = (a: Vec, b: Vec, x: number): Vec => ({ x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) });
  const lerpY = (a: Vec, b: Vec, y: number): Vec => ({ x: a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y), y });
  const bords: Bord[] = [
    { dedans: (p) => p.x >= r.min.x, inter: (a, b) => lerpX(a, b, r.min.x) },
    { dedans: (p) => p.x <= r.max.x, inter: (a, b) => lerpX(a, b, r.max.x) },
    { dedans: (p) => p.y >= r.min.y, inter: (a, b) => lerpY(a, b, r.min.y) },
    { dedans: (p) => p.y <= r.max.y, inter: (a, b) => lerpY(a, b, r.max.y) },
  ];
  let sortie: Vec[] = [...points];
  for (const bord of bords) {
    const entree = sortie;
    sortie = [];
    for (let k = 0; k < entree.length; k++) {
      const cur = entree[k]!;
      const prec = entree[(k + entree.length - 1) % entree.length]!;
      if (bord.dedans(cur)) {
        if (!bord.dedans(prec)) sortie.push(bord.inter(prec, cur));
        sortie.push(cur);
      } else if (bord.dedans(prec)) sortie.push(bord.inter(prec, cur));
    }
    if (!sortie.length) break;
  }
  return sortie;
}

/** Primitives découpées par un rectangle (cadre d'une vue de détail). */
export function decouper(primitives: readonly Primitive[], r: Bornes): Primitive[] {
  const out: Primitive[] = [];
  const dedans = (p: Vec) => p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y;
  for (const p of primitives) {
    if (p.type === "ligne") {
      const s = couperSegment(p.a, p.b, r);
      if (s) out.push({ ...p, a: s[0], b: s[1] });
    } else if (p.type === "poly") {
      if (p.ferme && p.remplissage) {
        const c = couperPolygone(p.points, r);
        if (c.length >= 3) out.push({ ...p, points: c });
      } else {
        const n = p.ferme ? p.points.length : p.points.length - 1;
        for (let k = 0; k < n; k++) {
          const s = couperSegment(p.points[k]!, p.points[(k + 1) % p.points.length]!, r);
          if (s && p.trait) out.push({ type: "ligne", a: s[0], b: s[1], trait: p.trait, objetId: p.objetId });
        }
      }
    } else if (p.type === "texte") {
      if (dedans(p.position)) out.push(p);
    } else if (dedans(p.centre)) out.push(p);
  }
  return out;
}
