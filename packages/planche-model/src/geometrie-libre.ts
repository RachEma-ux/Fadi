/**
 * Géométrie libre IMMUABLE de la Planche (comportement type SketchUp, relevé dans
 * docs/planche/reference/ : outils-dessin.md, outils-modification.md, complements-modification.md,
 * doc-officielle.md §7–8).
 *
 * Unités : mètres, repère local de la Planche (x rouge, y vert, z bleu).
 *
 * INVARIANTS (vérifiés par les tests, garantis par toutes les opérations publiques) :
 *  I1. Immuabilité : aucune opération ne modifie le modèle reçu ; elle renvoie un nouveau `Modele` et un
 *      `Rapport` { crees, supprimes, modifies } calculé par différence d'identifiants.
 *  I2. Identifiants globalement uniques dans un modèle (préfixes : s sommet, a arête, f face, c courbe,
 *      d définition, o occurrence), jamais réutilisés (compteur `prochainId`).
 *  I3. Deux sommets d'un même contexte sont toujours distants de plus de TOL ; aucun sommet n'est isolé
 *      (tout sommet appartient à au moins une arête).
 *  I4. Une arête relie deux sommets distincts ; au plus une arête par paire de sommets ; deux arêtes d'un
 *      même contexte ne se croisent jamais en leur intérieur (l'ajout découpe au point d'intersection) et
 *      ne se superposent jamais (les portions colinéaires communes sont fusionnées).
 *  I5. Une face est plane ; sa boucle extérieure tourne dans le sens direct autour de `normale` (unitaire),
 *      ses trous dans le sens indirect ; chaque côté de boucle est une arête existante.
 *  I6. Géométrie collante : dans un contexte, les faces coplanaires sont les régions minimales de
 *      l'arrangement plan de leurs arêtes (une ligne en travers d'une face la coupe en deux, une boucle
 *      intérieure crée un trou et une face intérieure, deux boîtes accolées partagent la face de contact).
 *  I7. Isolation : un groupe ou un composant (définition + occurrences avec matrice 4×4) ne colle jamais à
 *      la géométrie d'un autre contexte. Les occurrences d'un composant partagent sa définition ; éditer un
 *      groupe partagé par plusieurs occurrences le rend d'abord unique (doc-officielle §8).
 *  I8. Une courbe (cercle, polygone, arc) regroupe des arêtes que la gomme efface d'un seul coup.
 *
 * Choix propres à la Planche (écarts assumés, signalés) :
 *  - une face créée automatiquement prend la normale canonique de son plan (+Z d'abord, puis +Y, puis +X) ;
 *    SketchUp oriente les faces posées au sol vers le bas, ce qui n'est pas reproduit ;
 *  - `deplacer` étire la géométrie connectée et plie (autofold) une face devenue non plane sans trou, mais
 *    ne recalcule pas l'intersection avec la géométrie traversée (seuls les sommets confondus fusionnent) ;
 *  - `decaler` ne traite que la boucle extérieure (pas d'élagage des recouvrements, Alt non modélisé).
 */
import {
  type Vec3,
  AXE_X,
  AXE_Z,
  EPS,
  TOL,
  add,
  colineaires,
  cross,
  dist,
  dot,
  egal,
  len,
  lerp,
  normalize,
  scale,
  sub,
  v3,
} from "./vecteur.js";

import { type Annotations, type AnnotationsMutables, type Extrusion, type LienPiece, ANNOTATIONS_VIDES, genreAnnotation } from "./annotations.js";
import {
  type BoutPiece,
  type PlacementPiece,
  type RepereDePiece,
  type SectionProfil,
  type SourceSection,
  matriceRepere,
  normaleOnglet,
  prismePiece,
  repereSegment,
  sectionPosee,
  validerSection,
  versLocal,
} from "./profiles.js";

// ————————————————————————————————————————————————————————————— Types publics

export type Id = string;

export interface Sommet {
  readonly id: Id;
  readonly position: Vec3;
}

export interface Arete {
  readonly id: Id;
  readonly a: Id;
  readonly b: Id;
  readonly adoucie?: boolean;
  readonly masquee?: boolean;
  /** Courbe d'appartenance (cercle, polygone, arc) : la gomme efface la courbe entière. */
  readonly courbe?: Id;
}

export interface Face {
  readonly id: Id;
  readonly exterieur: readonly Id[];
  readonly trous: readonly (readonly Id[])[];
  readonly normale: Vec3;
  readonly materiauRecto?: string;
  readonly materiauVerso?: string;
  /** Masquée (menu contextuel « Masquer », lot 5) : ni affichée, ni accrochée, ni sélectionnable. */
  readonly masquee?: boolean;
}

export type GenreCourbe = "cercle" | "polygone" | "arc";

export interface Courbe {
  readonly id: Id;
  readonly genre: GenreCourbe;
  readonly aretes: readonly Id[];
  readonly centre: Vec3;
  readonly rayon: number;
  readonly normale: Vec3;
}

/** Matrice 4×4 en lignes (m[4*ligne + colonne]), transformation affine. */
export type Matrice4 = readonly number[];

export interface Occurrence {
  readonly id: Id;
  readonly definition: Id;
  readonly transformation: Matrice4;
  /** Matière posée sur l'objet (Peinture de l'extérieur) : affichée sur ses faces sans matière. */
  readonly materiau?: string;
  /** Balise (calque de l'Atelier, P-9). */
  readonly balise?: string;
  /** Nom de l'occurrence (Info entité, lot 5). */
  readonly nom?: string;
  /** Masquée (lot 5) : ni affichée, ni accrochée, ni sélectionnable, jusqu'à « Réafficher ». */
  readonly masquee?: boolean;
  /** Verrouillée (lot 5) : aucune transformation, aucun effacement, aucune édition tant que le verrou tient. */
  readonly verrouille?: boolean;
  /** (Lot L14) Repère de pièce (liste de débit) : posé par la renumérotation, gardé par une copie. */
  readonly repere?: string;
}

export interface Contexte {
  readonly sommets: Readonly<Record<Id, Sommet>>;
  readonly aretes: Readonly<Record<Id, Arete>>;
  readonly faces: Readonly<Record<Id, Face>>;
  readonly courbes: Readonly<Record<Id, Courbe>>;
  readonly occurrences: Readonly<Record<Id, Occurrence>>;
}

export type GenreDefinition = "groupe" | "composant";

/** Options de la boîte « Créer un composant » (§5.6) ; `collerA` et les interrupteurs sont conservés tels quels (effets nv, déclarés). */
export interface MetadonneesDefinition {
  readonly description?: string;
  readonly collerA?: "aucun" | "tout" | "horizontal" | "vertical" | "incline";
  readonly decouperOuverture?: boolean;
  readonly faceCamera?: boolean;
  /** (Lot L11) Pièce de profilé : de quoi régénérer la géométrie sur commande ; jamais une seconde géométrie. */
  readonly piece?: MetadonneesPiece;
}

/** (Lot L11) Métadonnées d'une pièce de profilé, portées par sa définition (composant). */
export interface MetadonneesPiece {
  readonly designation: string;
  /** Section telle que saisie ou lue au catalogue (avant rotation et placement). */
  readonly section: SectionProfil;
  readonly source: SourceSection;
  readonly placement: PlacementPiece;
  /** Longueur de l'axe (arête source), sans les décalages. */
  readonly longueur: number;
  /** Côté de la boucle (posée sur une boucle plane) : +1 côté +y, −1 côté −y, 0 centrée ; absent = point de placement. */
  readonly cote?: -1 | 0 | 1;
  /** (Lots L11–L13) Coupe d'une extrémité (onglet) : normale du plan en local et angle de coupe dérivé (°), jamais saisi. */
  readonly coupeDebut?: CoupePiece;
  readonly coupeFin?: CoupePiece;
  /** (Lot L13) Nombre de coupes par profil subies : la géométrie n'est plus régénérable depuis les seules métadonnées. */
  readonly coupesProfil?: number;
}

/** (Lot L13) Coupe d'une extrémité de pièce : plan passant par l'extrémité de l'axe. */
export interface CoupePiece {
  readonly normale: Vec3;
  /** Angle entre le plan de coupe et la section droite (°) : 0 pour une coupe droite, 45 pour un onglet d'équerre. */
  readonly angle: number;
}
export interface Definition extends MetadonneesDefinition {
  readonly id: Id;
  readonly nom: string;
  readonly genre: GenreDefinition;
  readonly contenu: Contexte;
}

export interface Modele {
  readonly racine: Contexte;
  readonly definitions: Readonly<Record<Id, Definition>>;
  readonly prochainId: number;
  /** Annotations et attributs (lots 4 à 6) ; absent = aucune. */
  readonly annotations?: Annotations;
}

export interface Rapport {
  readonly crees: readonly Id[];
  readonly supprimes: readonly Id[];
  readonly modifies: readonly Id[];
}

export interface Resultat {
  readonly modele: Modele;
  readonly rapport: Rapport;
}

export interface OptionsContexte {
  /** Occurrence (groupe/composant) dans laquelle on édite ; absent = racine du modèle. */
  readonly dans?: Id;
}

export interface Plan {
  /** Normale unitaire canonique. */
  readonly n: Vec3;
  /** Distance signée : dot(n, p) = d pour tout p du plan. */
  readonly d: number;
}

// ————————————————————————————————————————————————————————————— Matrices

export const IDENTITE: Matrice4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function appliquer(m: Matrice4, p: Vec3): Vec3 {
  const g = (i: number): number => m[i] ?? 0;
  return v3(
    g(0) * p.x + g(1) * p.y + g(2) * p.z + g(3),
    g(4) * p.x + g(5) * p.y + g(6) * p.z + g(7),
    g(8) * p.x + g(9) * p.y + g(10) * p.z + g(11),
  );
}

/** Produit a·b (b appliquée d'abord). */
export function composer(a: Matrice4, b: Matrice4): Matrice4 {
  const r: number[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += (a[4 * i + k] ?? 0) * (b[4 * k + j] ?? 0);
      r.push(s);
    }
  }
  return r;
}

export const translation = (v: Vec3): Matrice4 => [1, 0, 0, v.x, 0, 1, 0, v.y, 0, 0, 1, v.z, 0, 0, 0, 1];

export function rotation(centre: Vec3, axe: Vec3, angle: number): Matrice4 {
  const k = normalize(axe);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const r: Matrice4 = [
    t * k.x * k.x + c, t * k.x * k.y - s * k.z, t * k.x * k.z + s * k.y, 0,
    t * k.x * k.y + s * k.z, t * k.y * k.y + c, t * k.y * k.z - s * k.x, 0,
    t * k.x * k.z - s * k.y, t * k.y * k.z + s * k.x, t * k.z * k.z + c, 0,
    0, 0, 0, 1,
  ];
  return composer(translation(centre), composer(r, translation(scale(centre, -1))));
}

export function echelle(origine: Vec3, f: Vec3): Matrice4 {
  const e: Matrice4 = [f.x, 0, 0, 0, 0, f.y, 0, 0, 0, 0, f.z, 0, 0, 0, 0, 1];
  return composer(translation(origine), composer(e, translation(scale(origine, -1))));
}

export function miroir(origine: Vec3, normale: Vec3): Matrice4 {
  const n = normalize(normale);
  const h: Matrice4 = [
    1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
    -2 * n.x * n.y, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
    -2 * n.x * n.z, -2 * n.y * n.z, 1 - 2 * n.z * n.z, 0,
    0, 0, 0, 1,
  ];
  return composer(translation(origine), composer(h, translation(scale(origine, -1))));
}

export function determinant3(m: Matrice4): number {
  const g = (i: number): number => m[i] ?? 0;
  return (
    g(0) * (g(5) * g(10) - g(6) * g(9)) - g(1) * (g(4) * g(10) - g(6) * g(8)) + g(2) * (g(4) * g(9) - g(5) * g(8))
  );
}

/** Normale transformée (inverse transposée de la partie linéaire), unitaire. */
export function transformerNormale(m: Matrice4, n: Vec3): Vec3 {
  const g = (i: number): number => m[i] ?? 0;
  // Cofacteurs = det · (M⁻¹)ᵀ
  const c00 = g(5) * g(10) - g(6) * g(9);
  const c01 = -(g(4) * g(10) - g(6) * g(8));
  const c02 = g(4) * g(9) - g(5) * g(8);
  const c10 = -(g(1) * g(10) - g(2) * g(9));
  const c11 = g(0) * g(10) - g(2) * g(8);
  const c12 = -(g(0) * g(9) - g(1) * g(8));
  const c20 = g(1) * g(6) - g(2) * g(5);
  const c21 = -(g(0) * g(6) - g(2) * g(4));
  const c22 = g(0) * g(5) - g(1) * g(4);
  const r = v3(c00 * n.x + c01 * n.y + c02 * n.z, c10 * n.x + c11 * n.y + c12 * n.z, c20 * n.x + c21 * n.y + c22 * n.z);
  const det = determinant3(m);
  return normalize(det < 0 ? scale(r, -1) : r);
}

// ————————————————————————————————————————————————————————————— Outils géométriques exportés

/** Normale de Newell (norme = 2 × aire, sens direct autour de la normale). */
export function newell(pts: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Vec3;
    const b = pts[(i + 1) % pts.length] as Vec3;
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return v3(x, y, z);
}

export function planCanonique(n: Vec3, p: Vec3): Plan {
  let u = normalize(n);
  const s = 1e-9;
  if (u.z < -s || (Math.abs(u.z) <= s && (u.y < -s || (Math.abs(u.y) <= s && u.x < 0)))) u = scale(u, -1);
  return { n: u, d: dot(u, p) };
}

export const surPlan = (pl: Plan, p: Vec3, tol = TOL): boolean => Math.abs(dot(pl.n, p) - pl.d) <= tol;

export function memePlan(a: Plan, b: Plan): boolean {
  const c = dot(a.n, b.n);
  if (Math.abs(c) < 1 - 1e-9) return false;
  return Math.abs(a.d - Math.sign(c) * b.d) <= TOL;
}

/** Base orthonormée (u, w) du plan de normale n, telle que (u, w, n) soit directe. */
export function baseDuPlan(n: Vec3): { u: Vec3; w: Vec3 } {
  const ref = Math.abs(n.z) < 0.9 ? AXE_Z : AXE_X;
  const u = normalize(cross(ref, n));
  return { u, w: cross(n, u) };
}

interface P2 {
  readonly x: number;
  readonly y: number;
}

function aireSignee2(p: readonly P2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as P2;
    const b = p[(i + 1) % p.length] as P2;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function dansPolygone2(pt: P2, poly: readonly P2[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as P2;
    const b = poly[j] as P2;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

function dansRegion2(pt: P2, ext: readonly P2[], trous: readonly (readonly P2[])[]): boolean {
  return dansPolygone2(pt, ext) && !trous.some((t) => dansPolygone2(pt, t));
}

/** Point strictement intérieur d'une région (polygone à trous), par balayage horizontal. */
function echantillon2(ext: readonly P2[], trous: readonly (readonly P2[])[]): P2 {
  const tous = [ext, ...trous];
  // Ordonnées distinctes à 1e-9 près : deux sommets « à la même hauteur » au bruit flottant près (géométrie tournée,
  // lot 10d) placeraient sinon l'échantillon sur le bord, hors de la région.
  const ys: number[] = [];
  for (const v of tous.flat().map((p) => p.y).sort((a, b) => a - b)) if (ys.length === 0 || v - (ys[ys.length - 1] as number) > 1e-9) ys.push(v);
  const y = ys.length > 1 ? ((ys[0] as number) + (ys[1] as number)) / 2 : (ys[0] ?? 0);
  const xs: number[] = [];
  for (const b of tous) {
    for (let i = 0; i < b.length; i++) {
      const p = b[i] as P2;
      const q = b[(i + 1) % b.length] as P2;
      if (p.y > y !== q.y > y) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
  }
  xs.sort((a, b) => a - b);
  let meilleur = { x: ext[0]?.x ?? 0, y };
  let largeur = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const l = (xs[i + 1] as number) - (xs[i] as number);
    if (l > largeur) {
      largeur = l;
      meilleur = { x: ((xs[i] as number) + (xs[i + 1] as number)) / 2, y };
    }
  }
  return meilleur;
}

/** Points les plus proches de deux segments ; null s'ils sont parallèles. */
export function plusProchesSegments(
  p1: Vec3,
  q1: Vec3,
  p2: Vec3,
  q2: Vec3,
): { s: number; t: number; d: number } | null {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const c = dot(d1, r);
  const b = dot(d1, d2);
  const den = a * e - b * b;
  if (a < EPS || e < EPS || den <= 1e-12 * a * e) return null;
  const borne = (x: number): number => Math.min(1, Math.max(0, x));
  let s = borne((b * f - c * e) / den);
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = borne(-c / a);
  } else if (t > 1) {
    t = 1;
    s = borne((b - c) / a);
  }
  return { s, t, d: dist(lerp(p1, q1, s), lerp(p2, q2, t)) };
}

/** Projection d'un point sur un segment : paramètre borné et point. */
export function projeterSurSegment(p: Vec3, a: Vec3, b: Vec3): { t: number; point: Vec3 } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2));
  return { t, point: lerp(a, b, t) };
}

// ————————————————————————————————————————————————————————————— Lecture

export function modeleVide(): Modele {
  return { racine: contexteVide(), definitions: {}, prochainId: 1 };
}

function contexteVide(): Contexte {
  return { sommets: {}, aretes: {}, faces: {}, courbes: {}, occurrences: {} };
}

/** Contexte d'édition : racine ou définition de l'occurrence `dans`. */
export function contexte(m: Modele, dans?: Id): Contexte {
  if (dans === undefined) return m.racine;
  const occ = trouverOccurrence(m, dans);
  const def = occ ? m.definitions[occ.definition] : undefined;
  if (!def) throw new Error(`Occurrence inconnue : ${dans}`);
  return def.contenu;
}

function trouverOccurrence(m: Modele, id: Id): Occurrence | undefined {
  const r = m.racine.occurrences[id];
  if (r) return r;
  for (const d of Object.values(m.definitions)) {
    const o = d.contenu.occurrences[id];
    if (o) return o;
  }
  return undefined;
}

export function nombreOccurrences(m: Modele, definition: Id): number {
  const compte = (c: Contexte): number => Object.values(c.occurrences).filter((o) => o.definition === definition).length;
  return compte(m.racine) + Object.values(m.definitions).reduce((s, d) => s + compte(d.contenu), 0);
}

export function compter(c: Contexte): { sommets: number; aretes: number; faces: number; occurrences: number } {
  return {
    sommets: Object.keys(c.sommets).length,
    aretes: Object.keys(c.aretes).length,
    faces: Object.keys(c.faces).length,
    occurrences: Object.keys(c.occurrences).length,
  };
}

export function positionsFace(c: Contexte, f: Face): { exterieur: Vec3[]; trous: Vec3[][] } {
  const pos = (s: Id): Vec3 => {
    const x = c.sommets[s];
    if (!x) throw new Error(`Sommet inconnu : ${s}`);
    return x.position;
  };
  return { exterieur: f.exterieur.map(pos), trous: f.trous.map((t) => t.map(pos)) };
}

function aireBoucles(ext: readonly Vec3[], trous: readonly (readonly Vec3[])[]): number {
  return len(newell(ext)) / 2 - trous.reduce((s, t) => s + len(newell(t)) / 2, 0);
}

/** Aire nette d'une face (m²), trous déduits. */
export function aire(m: Modele, face: Id, o: OptionsContexte = {}): number {
  const c = contexte(m, o.dans);
  const f = c.faces[face];
  if (!f) throw new Error(`Face inconnue : ${face}`);
  const p = positionsFace(c, f);
  return aireBoucles(p.exterieur, p.trous);
}

/** Variété fermée : au moins une face, chaque arête bordée par exactement deux faces, aucune occurrence imbriquée. */
export function estSolide(m: Modele, occurrence: Id): boolean {
  const c = contexte(m, occurrence);
  if (Object.keys(c.faces).length === 0 || Object.keys(c.occurrences).length > 0) return false;
  const usages = new Map<string, number>();
  for (const f of Object.values(c.faces)) {
    for (const b of [f.exterieur, ...f.trous]) {
      for (let i = 0; i < b.length; i++) {
        const k = cle(b[i] as Id, b[(i + 1) % b.length] as Id);
        usages.set(k, (usages.get(k) ?? 0) + 1);
      }
    }
  }
  for (const a of Object.values(c.aretes)) if (usages.get(cle(a.a, a.b)) !== 2) return false;
  return true;
}

/** Volume (m³) d'un groupe/composant solide, transformation de l'occurrence comprise ; null s'il n'est pas solide. */
export function volume(m: Modele, occurrence: Id): number | null {
  if (!estSolide(m, occurrence)) return null;
  const occ = trouverOccurrence(m, occurrence) as Occurrence;
  const c = contexte(m, occurrence);
  let v = 0;
  for (const f of Object.values(c.faces)) {
    const p = positionsFace(c, f);
    const p0 = p.exterieur[0] as Vec3;
    v += (dot(f.normale, p0) * aireBoucles(p.exterieur, p.trous)) / 3;
  }
  return Math.abs(v) * Math.abs(determinant3(occ.transformation));
}

// ————————————————————————————————————————————————————————————— Chantier mutable interne

interface Ctx {
  sommets: Map<Id, Sommet>;
  aretes: Map<Id, Arete>;
  faces: Map<Id, Face>;
  courbes: Map<Id, Courbe>;
  occurrences: Map<Id, Occurrence>;
}

interface DefTravail extends MetadonneesDefinition {
  id: Id;
  nom: string;
  genre: GenreDefinition;
  contenu: Ctx;
}

const META_DEF = ["description", "collerA", "decouperOuverture", "faceCamera", "piece"] as const;
function metaDe(d: MetadonneesDefinition): MetadonneesDefinition {
  const r: Record<string, unknown> = {};
  for (const k of META_DEF) if (d[k] !== undefined) r[k] = d[k];
  return r as MetadonneesDefinition;
}
const memeMeta = (a: MetadonneesDefinition, b: MetadonneesDefinition): boolean => META_DEF.every((k) => a[k] === b[k]);

const versCtx = (c: Contexte): Ctx => ({
  sommets: new Map(Object.entries(c.sommets)),
  aretes: new Map(Object.entries(c.aretes)),
  faces: new Map(Object.entries(c.faces)),
  courbes: new Map(Object.entries(c.courbes)),
  occurrences: new Map(Object.entries(c.occurrences)),
});

function versContexte(c: Ctx): Contexte {
  // I3 : aucun sommet isolé.
  const utilises = new Set<Id>();
  for (const a of c.aretes.values()) utilises.add(a.a).add(a.b);
  for (const s of [...c.sommets.keys()]) if (!utilises.has(s)) c.sommets.delete(s);
  return Object.freeze({
    sommets: Object.freeze(Object.fromEntries(c.sommets)),
    aretes: Object.freeze(Object.fromEntries(c.aretes)),
    faces: Object.freeze(Object.fromEntries(c.faces)),
    courbes: Object.freeze(Object.fromEntries(c.courbes)),
    occurrences: Object.freeze(Object.fromEntries(c.occurrences)),
  });
}

class Travail {
  prochain: number;
  racine: Ctx;
  definitions: Map<Id, DefTravail>;
  /** Contextes d'origine, réutilisés tels quels s'ils n'ont pas été ouverts en écriture. */
  private readonly origines = new Map<Ctx, Contexte>();
  private readonly sales = new Set<Ctx>();

  annotations: AnnotationsMutables;
  annotationsSales = false;

  constructor(private readonly modele: Modele) {
    this.prochain = modele.prochainId;
    const a = modele.annotations ?? ANNOTATIONS_VIDES;
    this.annotations = { guides: { ...a.guides }, cotes: { ...a.cotes }, textes: { ...a.textes }, plansDeCoupe: { ...a.plansDeCoupe }, materiaux: { ...a.materiaux }, balises: { ...a.balises }, scenes: { ...(a.scenes ?? {}) }, extrusions: { ...(a.extrusions ?? {}) }, pieces: { ...(a.pieces ?? {}) }, ...(a.repere ? { repere: a.repere } : {}), ...(a.reglages ? { reglages: a.reglages } : {}) };
    this.racine = versCtx(modele.racine);
    this.origines.set(this.racine, modele.racine);
    this.definitions = new Map();
    for (const d of Object.values(modele.definitions)) {
      const contenu = versCtx(d.contenu);
      this.origines.set(contenu, d.contenu);
      this.definitions.set(d.id, { id: d.id, nom: d.nom, genre: d.genre, contenu, ...metaDe(d) });
    }
  }

  salir(c: Ctx): Ctx {
    this.sales.add(c);
    return c;
  }

  id(prefixe: string): Id {
    return `${prefixe}${this.prochain++}`;
  }

  tousContextes(): Ctx[] {
    return [this.racine, ...[...this.definitions.values()].map((d) => d.contenu)];
  }

  occurrence(id: Id): { ctx: Ctx; occ: Occurrence } {
    for (const ctx of this.tousContextes()) {
      const occ = ctx.occurrences.get(id);
      if (occ) return { ctx, occ };
    }
    throw new Error(`Occurrence inconnue : ${id}`);
  }

  nombreOccurrences(def: Id): number {
    let n = 0;
    for (const ctx of this.tousContextes()) for (const o of ctx.occurrences.values()) if (o.definition === def) n++;
    return n;
  }

  /** Ouvre le contexte d'édition ; un groupe partagé est d'abord rendu unique (I7). */
  ouvrir(dans?: Id): Ctx {
    if (dans === undefined) return this.salir(this.racine);
    const { occ } = this.occurrence(dans);
    const def = this.definitions.get(occ.definition);
    if (!def) throw new Error(`Définition inconnue : ${occ.definition}`);
    // Édition d'un groupe partagé : l'occurrence éditée garde les identifiants, les autres reçoivent la copie.
    if (def.genre === "groupe" && this.nombreOccurrences(def.id) > 1) return this.rendreUnique(dans, true);
    return this.salir(def.contenu);
  }

  /** « Nom#k » libre (O-3) : le suffixe « #n » d'un nom déjà rendu unique est remplacé, jamais empilé (« #1#1 »). */
  nomUnique(nom: string): string {
    const base = nom.replace(/#\d+$/, "");
    const pris = new Set([...this.definitions.values()].map((d) => d.nom));
    let k = 1;
    while (pris.has(`${base}#${k}`)) k++;
    return `${base}#${k}`;
  }

  /** Copie privée de la définition pour `occId` ; `garderIds` : l'occurrence garde le contenu d'origine. */
  rendreUnique(occId: Id, garderIds = false): Ctx {
    const { ctx, occ } = this.occurrence(occId);
    const def = this.definitions.get(occ.definition);
    if (!def) throw new Error(`Définition inconnue : ${occ.definition}`);
    this.salir(ctx);
    const copie = cloner(this, def.contenu);
    const id = this.id("d");
    const pourOcc = garderIds ? def.contenu : copie;
    if (garderIds) this.definitions.set(def.id, { ...def, contenu: copie });
    this.definitions.set(id, { id, nom: this.nomUnique(def.nom), genre: def.genre, contenu: pourOcc, ...metaDe(def) });
    ctx.occurrences.set(occId, { ...occ, definition: id });
    return this.salir(pourOcc);
  }

  private figer(c: Ctx): Contexte {
    const o = this.origines.get(c);
    return o && !this.sales.has(c) ? o : versContexte(c);
  }

  fermer(): Modele {
    const definitions: Record<Id, Definition> = {};
    for (const d of this.definitions.values()) {
      if (this.nombreOccurrences(d.id) === 0) continue;
      const ancienne = this.modele.definitions[d.id];
      const contenu = this.figer(d.contenu);
      definitions[d.id] =
        ancienne && ancienne.contenu === contenu && ancienne.nom === d.nom && ancienne.genre === d.genre && memeMeta(ancienne, d)
          ? ancienne
          : Object.freeze({ id: d.id, nom: d.nom, genre: d.genre, contenu, ...metaDe(d) });
    }
    const base = { racine: this.figer(this.racine), definitions: Object.freeze(definitions), prochainId: this.prochain };
    if (!this.annotationsSales) return Object.freeze(this.modele.annotations ? { ...base, annotations: this.modele.annotations } : base);
    const a = this.annotations;
    const annotations: Annotations = Object.freeze({
      guides: Object.freeze({ ...a.guides }),
      cotes: Object.freeze({ ...a.cotes }),
      textes: Object.freeze({ ...a.textes }),
      plansDeCoupe: Object.freeze({ ...a.plansDeCoupe }),
      materiaux: Object.freeze({ ...a.materiaux }),
      balises: Object.freeze({ ...a.balises }),
      ...(a.repere ? { repere: a.repere } : {}),
      ...(Object.keys(a.scenes).length ? { scenes: Object.freeze({ ...a.scenes }) } : {}),
      ...(a.reglages ? { reglages: a.reglages } : {}),
      ...(Object.keys(a.extrusions).length ? { extrusions: Object.freeze({ ...a.extrusions }) } : {}),
      ...(Object.keys(a.pieces).length ? { pieces: Object.freeze({ ...a.pieces }) } : {}),
    });
    return Object.freeze({ ...base, annotations });
  }

  /** Efface les annotations dont l'identifiant est donné (ids géométriques ignorés). */
  effacerAnnotations(ids: readonly Id[]): void {
    for (const id of ids) {
      const g = genreAnnotation(id);
      if (!g) continue;
      const rec = g === "guide" ? this.annotations.guides : g === "cote" ? this.annotations.cotes : g === "texte" ? this.annotations.textes : g === "plan" ? this.annotations.plansDeCoupe : g === "materiau" ? this.annotations.materiaux : g === "scene" ? this.annotations.scenes : this.annotations.balises;
      if (id in rec) {
        delete (rec as Record<Id, unknown>)[id];
        this.annotationsSales = true;
      }
    }
  }
}

/** Copie d'un contexte avec de nouveaux identifiants (I2). */
function cloner(t: Travail, c: Ctx): Ctx {
  const r: Ctx = { sommets: new Map(), aretes: new Map(), faces: new Map(), courbes: new Map(), occurrences: new Map() };
  const map = new Map<Id, Id>();
  const neuf = (ancien: Id): Id => {
    let n = map.get(ancien);
    if (!n) {
      n = t.id(ancien.charAt(0));
      map.set(ancien, n);
    }
    return n;
  };
  for (const s of c.sommets.values()) r.sommets.set(neuf(s.id), { id: neuf(s.id), position: s.position });
  for (const a of c.aretes.values()) {
    const na: Arete = { ...a, id: neuf(a.id), a: neuf(a.a), b: neuf(a.b), ...(a.courbe ? { courbe: neuf(a.courbe) } : {}) };
    r.aretes.set(na.id, na);
  }
  for (const f of c.faces.values()) {
    r.faces.set(neuf(f.id), { ...f, id: neuf(f.id), exterieur: f.exterieur.map(neuf), trous: f.trous.map((b) => b.map(neuf)) });
  }
  for (const k of c.courbes.values()) r.courbes.set(neuf(k.id), { ...k, id: neuf(k.id), aretes: k.aretes.map(neuf) });
  for (const o of c.occurrences.values()) r.occurrences.set(neuf(o.id), { ...o, id: neuf(o.id) });
  return r;
}

function aplatir(m: Modele): Map<Id, string> {
  const r = new Map<Id, string>();
  const ajouter = (c: Contexte): void => {
    for (const rec of [c.sommets, c.aretes, c.faces, c.courbes, c.occurrences]) {
      for (const [id, v] of Object.entries(rec)) r.set(id, JSON.stringify(v));
    }
  };
  ajouter(m.racine);
  for (const d of Object.values(m.definitions)) {
    r.set(d.id, JSON.stringify({ id: d.id, nom: d.nom, genre: d.genre }));
    ajouter(d.contenu);
  }
  const a = m.annotations;
  if (a) {
    for (const rec of [a.guides, a.cotes, a.textes, a.plansDeCoupe, a.materiaux, a.balises, a.scenes ?? {}, a.extrusions ?? {}, a.pieces ?? {}]) {
      for (const [id, v] of Object.entries(rec)) r.set(id, JSON.stringify(v));
    }
    if (a.repere) r.set("repere", JSON.stringify(a.repere));
    if (a.reglages) r.set("reglages", JSON.stringify(a.reglages));
  }
  return r;
}

function differences(avant: Modele, apres: Modele): Rapport {
  const a = aplatir(avant);
  const b = aplatir(apres);
  const crees: Id[] = [];
  const supprimes: Id[] = [];
  const modifies: Id[] = [];
  for (const [id, v] of b) {
    const w = a.get(id);
    if (w === undefined) crees.push(id);
    else if (w !== v) modifies.push(id);
  }
  for (const id of a.keys()) if (!b.has(id)) supprimes.push(id);
  return { crees, supprimes, modifies };
}

function operer<X>(m: Modele, dans: Id | undefined, fn: (t: Travail, c: Ctx) => X): Resultat & { extra: X } {
  const t = new Travail(m);
  const c = t.ouvrir(dans);
  const extra = fn(t, c);
  actualiserExtrusions(t);
  actualiserPieces(t);
  const modele = t.fermer();
  return { modele, rapport: differences(m, modele), extra };
}

// ————————————————————————————————————————————————————————————— Primitives sur le chantier

const cle = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const numId = (id: Id): number => Number.parseInt(id.slice(1), 10);

function pos(c: Ctx, s: Id): Vec3 {
  const x = c.sommets.get(s);
  if (!x) throw new Error(`Sommet inconnu : ${s}`);
  return x.position;
}

function areteEntre(c: Ctx, u: Id, w: Id): Arete | undefined {
  for (const a of c.aretes.values()) if ((a.a === u && a.b === w) || (a.a === w && a.b === u)) return a;
  return undefined;
}

const aretesDuSommet = (c: Ctx, s: Id): Arete[] => [...c.aretes.values()].filter((a) => a.a === s || a.b === s);

function boucleContient(b: readonly Id[], u: Id, w: Id): boolean {
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    const y = b[(i + 1) % b.length];
    if ((x === u && y === w) || (x === w && y === u)) return true;
  }
  return false;
}

const facesDeArete = (c: Ctx, a: Arete): Face[] =>
  [...c.faces.values()].filter((f) => [f.exterieur, ...f.trous].some((b) => boucleContient(b, a.a, a.b)));

const planDeFace = (c: Ctx, f: Face): Plan => planCanonique(f.normale, pos(c, f.exterieur[0] as Id));

function facesDuPlan(c: Ctx, pl: Plan): Face[] {
  return [...c.faces.values()].filter((f) => Math.abs(dot(f.normale, pl.n)) > 1 - 1e-9 && surPlan(pl, pos(c, f.exterieur[0] as Id)));
}

function creerSommet(t: Travail, c: Ctx, p: Vec3): Id {
  const id = t.id("s");
  c.sommets.set(id, { id, position: p });
  return id;
}

function insererDansBoucle(b: readonly Id[], u: Id, w: Id, s: Id): readonly Id[] {
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    const y = b[(i + 1) % b.length];
    if ((x === u && y === w) || (x === w && y === u)) return [...b.slice(0, i + 1), s, ...b.slice(i + 1)];
  }
  return b;
}

/** Découpe une arête en p (I4) ; le premier tronçon garde l'identifiant. */
function couperArete(t: Travail, c: Ctx, aid: Id, p: Vec3): Id {
  const ar = c.aretes.get(aid);
  if (!ar) throw new Error(`Arête inconnue : ${aid}`);
  const s = creerSommet(t, c, p);
  const nid = t.id("a");
  c.aretes.set(aid, { ...ar, b: s });
  c.aretes.set(nid, { ...ar, id: nid, a: s });
  if (ar.courbe) {
    const k = c.courbes.get(ar.courbe);
    if (k) {
      const i = k.aretes.indexOf(aid);
      c.courbes.set(k.id, { ...k, aretes: [...k.aretes.slice(0, i + 1), nid, ...k.aretes.slice(i + 1)] });
    }
  }
  for (const f of [...c.faces.values()]) {
    const ext = insererDansBoucle(f.exterieur, ar.a, ar.b, s);
    const trous = f.trous.map((b) => insererDansBoucle(b, ar.a, ar.b, s));
    if (ext !== f.exterieur || trous.some((b, i) => b !== f.trous[i])) c.faces.set(f.id, { ...f, exterieur: ext, trous });
  }
  return s;
}

/** Sommet en p : fusion à TOL, sinon découpe de l'arête qui passe par p, sinon création. */
function sommetEn(t: Travail, c: Ctx, p: Vec3): Id {
  for (const s of c.sommets.values()) if (egal(s.position, p)) return s.id;
  for (const a of [...c.aretes.values()]) {
    const A = pos(c, a.a);
    const B = pos(c, a.b);
    const pr = projeterSurSegment(p, A, B);
    if (dist(pr.point, p) <= TOL && !egal(pr.point, A) && !egal(pr.point, B)) return couperArete(t, c, a.id, pr.point);
  }
  return creerSommet(t, c, p);
}

interface AttributsArete {
  readonly adoucie?: boolean;
  readonly masquee?: boolean;
  readonly courbe?: Id;
}

/** Ajout d'un segment sans détection de face : fusion, découpes, arêtes colinéaires fusionnées. */
function ajouterSegmentBrut(
  t: Travail,
  c: Ctx,
  p: Vec3,
  q: Vec3,
  attrs: AttributsArete,
): { aretes: Id[]; nouvelles: Id[] } {
  if (egal(p, q)) return { aretes: [], nouvelles: [] };
  const su = sommetEn(t, c, p);
  const sv = sommetEn(t, c, q);
  if (su === sv) return { aretes: [], nouvelles: [] };
  const P = pos(c, su);
  const Q = pos(c, sv);
  for (const ar of [...c.aretes.values()]) {
    if (ar.a === su || ar.b === su || ar.a === sv || ar.b === sv) continue;
    const A = pos(c, ar.a);
    const B = pos(c, ar.b);
    const r = plusProchesSegments(P, Q, A, B);
    if (!r || r.d > TOL) continue;
    const X = lerp(A, B, r.t);
    if (egal(X, A) || egal(X, B) || egal(X, P) || egal(X, Q)) continue;
    couperArete(t, c, ar.id, X);
  }
  const PQ = sub(Q, P);
  const L2 = dot(PQ, PQ);
  const sur: { s: Id; t: number }[] = [];
  for (const s of c.sommets.values()) {
    const k = dot(sub(s.position, P), PQ) / L2;
    if (k < -TOL || k > 1 + TOL) continue;
    if (dist(s.position, add(P, scale(PQ, k))) <= TOL) sur.push({ s: s.id, t: k });
  }
  sur.sort((x, y) => x.t - y.t);
  const aretes: Id[] = [];
  const nouvelles: Id[] = [];
  for (let i = 0; i + 1 < sur.length; i++) {
    const u = (sur[i] as { s: Id }).s;
    const w = (sur[i + 1] as { s: Id }).s;
    if (u === w) continue;
    const ex = areteEntre(c, u, w);
    if (ex) {
      aretes.push(ex.id);
      continue;
    }
    const id = t.id("a");
    c.aretes.set(id, { id, a: u, b: w, ...attrs });
    aretes.push(id);
    nouvelles.push(id);
  }
  return { aretes, nouvelles };
}

// ————————————————————————————————————————————————————————————— Arrangement plan et faces automatiques

interface Source {
  readonly exterieur: readonly Vec3[];
  readonly trous: readonly (readonly Vec3[])[];
  readonly normale: Vec3;
  readonly materiauRecto?: string | undefined;
  readonly materiauVerso?: string | undefined;
  /** Face masquée reprise telle quelle (Éclater, O-3). */
  readonly masquee?: boolean | undefined;
  /** 'face' : la région devient une face ; 'trou' : la région reste vide (perçage, mur raccourci). */
  readonly role: "face" | "trou";
  /** Identifiant à reprendre (face déplacée par Pousser/Tirer) s'il est libre. */
  readonly idPrefere?: Id;
}

function egalCyclique(a: readonly Id[], b: readonly Id[]): boolean {
  if (a.length !== b.length) return false;
  const k = b.indexOf(a[0] as Id);
  if (k < 0) return false;
  return a.every((x, i) => b[(k + i) % b.length] === x);
}

const egalBoucle = (a: readonly Id[], b: readonly Id[]): boolean => egalCyclique(a, b) || egalCyclique(a, [...b].reverse());

/**
 * Recalcule les faces d'un plan à partir de l'arrangement de ses arêtes (I6).
 * Une région reçoit une face si : elle est dans un trou source → non ; elle hérite d'une ancienne face
 * (même boucle, ou recouvrement) → oui ; elle est dans une source 'face' → oui ; en mode automatique, elle
 * est bordée par une arête nouvelle → oui.
 */
function reconstruirePlan(
  t: Travail,
  c: Ctx,
  pl: Plan,
  opts: { sources: readonly Source[]; nouvelles: ReadonlySet<Id>; auto: boolean; anciennesExtra?: readonly Face[] },
): void {
  const { u, w } = baseDuPlan(pl.n);
  const p2 = (p: Vec3): P2 => ({ x: dot(p, u), y: dot(p, w) });
  const anciennes = new Map<Id, Face>();
  for (const f of facesDuPlan(c, pl)) anciennes.set(f.id, f);
  for (const f of opts.anciennesExtra ?? []) anciennes.set(f.id, f);
  const posAnc = (s: Id): Vec3 => pos(c, s);
  const anc = [...anciennes.values()].map((f) => {
    const ext = f.exterieur.map((s) => p2(posAnc(s)));
    const trous = f.trous.map((b) => b.map((s) => p2(posAnc(s))));
    return { f, ext, trous, ech: echantillon2(ext, trous) };
  });
  for (const f of facesDuPlan(c, pl)) c.faces.delete(f.id);

  // Graphe plan
  const voisins = new Map<Id, Set<Id>>();
  const areteDe = new Map<string, Id>();
  const lier = (x: Id, y: Id): void => {
    if (!voisins.has(x)) voisins.set(x, new Set());
    (voisins.get(x) as Set<Id>).add(y);
  };
  for (const a of c.aretes.values()) {
    if (!surPlan(pl, pos(c, a.a)) || !surPlan(pl, pos(c, a.b))) continue;
    lier(a.a, a.b);
    lier(a.b, a.a);
    areteDe.set(cle(a.a, a.b), a.id);
  }
  const retirer = (x: Id, y: Id): void => {
    voisins.get(x)?.delete(y);
    voisins.get(y)?.delete(x);
  };
  const elaguer = (): void => {
    let change = true;
    while (change) {
      change = false;
      for (const [s, vs] of voisins) {
        if (vs.size <= 1) {
          for (const v of vs) voisins.get(v)?.delete(s);
          voisins.delete(s);
          change = true;
        }
      }
    }
  };
  const P = new Map<Id, P2>();
  const coord = (s: Id): P2 => {
    let r = P.get(s);
    if (!r) {
      r = p2(pos(c, s));
      P.set(s, r);
    }
    return r;
  };
  let cycles: Id[][] = [];
  for (let garde = 0; garde < 10000; garde++) {
    elaguer();
    const tri = new Map<Id, Id[]>();
    for (const [s, vs] of voisins) {
      const o = coord(s);
      tri.set(
        s,
        [...vs].sort((x, y) => {
          const a = coord(x);
          const b = coord(y);
          return Math.atan2(a.y - o.y, a.x - o.x) - Math.atan2(b.y - o.y, b.x - o.x);
        }),
      );
    }
    const vus = new Set<string>();
    cycles = [];
    for (const [s, ns] of tri) {
      for (const n of ns) {
        if (vus.has(`${s}>${n}`)) continue;
        const cycle: Id[] = [];
        let a = s;
        let b = n;
        for (let g = 0; g < 1_000_000; g++) {
          vus.add(`${a}>${b}`);
          cycle.push(a);
          const l = tri.get(b) as Id[];
          const i = l.indexOf(a);
          const suivant = l[(i - 1 + l.length) % l.length] as Id;
          a = b;
          b = suivant;
          if (a === s && b === n) break;
        }
        cycles.push(cycle);
      }
    }
    const ponts: [Id, Id][] = [];
    for (const cy of cycles) {
      const demi = new Set<string>();
      for (let i = 0; i < cy.length; i++) demi.add(`${cy[i]}>${cy[(i + 1) % cy.length]}`);
      for (let i = 0; i < cy.length; i++) {
        const x = cy[i] as Id;
        const y = cy[(i + 1) % cy.length] as Id;
        if (demi.has(`${y}>${x}`)) ponts.push([x, y]);
      }
    }
    if (ponts.length === 0) break;
    for (const [x, y] of ponts) retirer(x, y);
  }

  // Composantes connexes (pour l'attribution des trous)
  const comp = new Map<Id, number>();
  let nc = 0;
  for (const s of voisins.keys()) {
    if (comp.has(s)) continue;
    const pile = [s];
    comp.set(s, nc);
    while (pile.length) {
      const x = pile.pop() as Id;
      for (const y of voisins.get(x) ?? []) {
        if (!comp.has(y)) {
          comp.set(y, nc);
          pile.push(y);
        }
      }
    }
    nc++;
  }
  const info = cycles.map((cy) => ({ cy, pts: cy.map(coord), aire: aireSignee2(cy.map(coord)) }));
  const positifs = info.filter((x) => x.aire > 1e-12);
  const negatifs = info.filter((x) => x.aire < -1e-12);
  const regions = positifs.map((x) => ({ ext: x.cy, extP: x.pts, aireExt: x.aire, trous: [] as Id[][], trousP: [] as P2[][] }));
  for (const n of negatifs) {
    const pt = n.pts[0] as P2;
    const cn = comp.get(n.cy[0] as Id);
    let meilleure: (typeof regions)[number] | undefined;
    for (const r of regions) {
      if (comp.get(r.ext[0] as Id) === cn) continue;
      if (!dansPolygone2(pt, r.extP)) continue;
      if (!meilleure || r.aireExt < meilleure.aireExt) meilleure = r;
    }
    if (meilleure) {
      meilleure.trous.push(n.cy);
      meilleure.trousP.push(n.pts);
    }
  }

  const sources = opts.sources.map((s) => {
    const ext = s.exterieur.map(p2);
    const trous = s.trous.map((b) => b.map(p2));
    return { s, ext, trous };
  });
  const prises = new Set<Id>();
  const faites = new Set<number>();
  const orienter = (normale: Vec3): Vec3 => (dot(normale, pl.n) >= 0 ? pl.n : scale(pl.n, -1));
  const poser = (
    ri: number,
    id: Id,
    normale: Vec3,
    recto: string | undefined,
    verso: string | undefined,
    masquee?: boolean,
  ): void => {
    const r = regions[ri] as (typeof regions)[number];
    const n = orienter(normale);
    const inv = dot(n, pl.n) < 0;
    const f: Face = {
      id,
      exterieur: inv ? [...r.ext].reverse() : r.ext,
      trous: r.trous.map((b) => (inv ? [...b].reverse() : b)),
      normale: n,
      ...(recto !== undefined ? { materiauRecto: recto } : {}),
      ...(verso !== undefined ? { materiauVerso: verso } : {}),
      ...(masquee ? { masquee: true } : {}),
    };
    c.faces.set(id, f);
    faites.add(ri);
  };
  // 1) boucles identiques à une ancienne face : objet conservé tel quel
  regions.forEach((r, ri) => {
    for (const a of anc) {
      if (prises.has(a.f.id)) continue;
      if (!egalBoucle(r.ext, a.f.exterieur) || r.trous.length !== a.f.trous.length) continue;
      if (!r.trous.every((tr) => a.f.trous.some((ta) => egalBoucle(tr, ta)))) continue;
      const ech = echantillon2(r.extP, r.trousP);
      if (sources.some((s) => s.s.role === "trou" && dansRegion2(ech, s.ext, s.trous))) continue;
      prises.add(a.f.id);
      c.faces.set(a.f.id, a.f);
      faites.add(ri);
      return;
    }
  });
  // 2) autres régions, de la plus grande à la plus petite
  const ordre = regions
    .map((r, ri) => ({ ri, aire: r.aireExt - r.trousP.reduce((s, b) => s + Math.abs(aireSignee2(b)), 0) }))
    .filter((x) => !faites.has(x.ri))
    .sort((a, b) => b.aire - a.aire);
  for (const { ri } of ordre) {
    const r = regions[ri] as (typeof regions)[number];
    const ech = echantillon2(r.extP, r.trousP);
    if (sources.some((s) => s.s.role === "trou" && dansRegion2(ech, s.ext, s.trous))) continue;
    const candidates = anc
      .filter((a) => dansRegion2(ech, a.ext, a.trous) || dansRegion2(a.ech, r.extP, r.trousP))
      .sort((a, b) => numId(a.f.id) - numId(b.f.id));
    const doyenne = candidates[0];
    if (doyenne) {
      const libre = candidates.find((a) => !prises.has(a.f.id));
      const id = libre ? libre.f.id : t.id("f");
      prises.add(id);
      poser(ri, id, doyenne.f.normale, doyenne.f.materiauRecto, doyenne.f.materiauVerso);
      continue;
    }
    const src = sources.find((s) => s.s.role === "face" && dansRegion2(ech, s.ext, s.trous));
    if (src) {
      const pref = src.s.idPrefere;
      const id = pref !== undefined && !c.faces.has(pref) && !prises.has(pref) ? pref : t.id("f");
      prises.add(id);
      poser(ri, id, src.s.normale, src.s.materiauRecto, src.s.materiauVerso, src.s.masquee);
      continue;
    }
    if (opts.auto) {
      const bords = [r.ext, ...r.trous];
      const neuve = bords.some((b) =>
        b.some((x, i) => opts.nouvelles.has(areteDe.get(cle(x, b[(i + 1) % b.length] as Id)) ?? "")),
      );
      if (neuve) poser(ri, t.id("f"), pl.n, undefined, undefined);
    }
  }
}

function ajouterPlan(plans: Plan[], p: Plan): void {
  if (!plans.some((q) => memePlan(p, q))) plans.push(p);
}

interface SegmentSource {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly adoucie?: boolean | undefined;
  readonly masquee?: boolean | undefined;
  readonly courbe?: {
    readonly cle: string;
    readonly genre: GenreCourbe;
    readonly centre: Vec3;
    readonly rayon: number;
    readonly normale: Vec3;
  };
}

/** Insertion collante de segments et de polygones sources dans un contexte. */
function insererGeometrie(
  t: Travail,
  c: Ctx,
  segments: readonly SegmentSource[],
  sources: readonly Source[],
  auto: boolean,
): Set<Id> {
  const nouvelles = new Set<Id>();
  const courbes = new Map<string, Id>();
  for (const sg of segments) {
    let courbe: Id | undefined;
    if (sg.courbe) {
      courbe = courbes.get(sg.courbe.cle);
      if (!courbe) {
        courbe = t.id("c");
        courbes.set(sg.courbe.cle, courbe);
        const k = sg.courbe;
        c.courbes.set(courbe, { id: courbe, genre: k.genre, aretes: [], centre: k.centre, rayon: k.rayon, normale: k.normale });
      }
    }
    const attrs: AttributsArete = {
      ...(sg.adoucie ? { adoucie: true } : {}),
      ...(sg.masquee ? { masquee: true } : {}),
      ...(courbe ? { courbe } : {}),
    };
    const r = ajouterSegmentBrut(t, c, sg.a, sg.b, attrs);
    for (const id of r.nouvelles) nouvelles.add(id);
    if (courbe) {
      const k = c.courbes.get(courbe) as Courbe;
      c.courbes.set(courbe, { ...k, aretes: [...k.aretes, ...r.nouvelles] });
    }
  }
  for (const id of courbes.values()) if ((c.courbes.get(id) as Courbe).aretes.length === 0) c.courbes.delete(id);

  const plans: Plan[] = [];
  for (const s of sources) ajouterPlan(plans, planCanonique(s.normale, s.exterieur[0] as Vec3));
  for (const id of nouvelles) {
    const a = c.aretes.get(id);
    if (!a) continue;
    const A = pos(c, a.a);
    const B = pos(c, a.b);
    for (const f of c.faces.values()) {
      const pf = planDeFace(c, f);
      if (surPlan(pf, A) && surPlan(pf, B)) ajouterPlan(plans, pf);
    }
    if (!auto) continue;
    for (const [s, X] of [
      [a.a, A],
      [a.b, B],
    ] as const) {
      for (const g of aretesDuSommet(c, s)) {
        if (g.id === a.id) continue;
        const Z = pos(c, g.a === s ? g.b : g.a);
        const n = cross(sub(B, A), sub(Z, X));
        if (len(n) < 1e-9 * dist(A, B) * dist(Z, X)) continue;
        ajouterPlan(plans, planCanonique(n, X));
      }
    }
  }
  for (const pl of plans) {
    reconstruirePlan(t, c, pl, {
      sources: sources.filter((s) => memePlan(planCanonique(s.normale, s.exterieur[0] as Vec3), pl)),
      nouvelles,
      auto,
    });
  }
  return nouvelles;
}

/** Fusionne une arête de degré 2 colinéaire (après effacement), si les mêmes faces la bordent. */
function cicatriser(c: Ctx, s: Id): void {
  if (!c.sommets.has(s)) return;
  const ar = aretesDuSommet(c, s);
  if (ar.length !== 2) return;
  const [e1, e2] = ar as [Arete, Arete];
  const o1 = e1.a === s ? e1.b : e1.a;
  const o2 = e2.a === s ? e2.b : e2.a;
  const S = pos(c, s);
  const d1 = sub(pos(c, o1), S);
  const d2 = sub(pos(c, o2), S);
  if (!colineaires(d1, d2, 1e-9) || dot(d1, d2) > 0) return;
  if (e1.courbe !== e2.courbe || areteEntre(c, o1, o2)) return;
  const f1 = facesDeArete(c, e1).map((f) => f.id).sort();
  const f2 = facesDeArete(c, e2).map((f) => f.id).sort();
  if (f1.join() !== f2.join()) return;
  c.aretes.set(e1.id, { ...e1, a: o1, b: o2 });
  c.aretes.delete(e2.id);
  if (e2.courbe) {
    const k = c.courbes.get(e2.courbe);
    if (k) c.courbes.set(k.id, { ...k, aretes: k.aretes.filter((x) => x !== e2.id) });
  }
  for (const f of [...c.faces.values()]) {
    if (!f.exterieur.includes(s) && !f.trous.some((b) => b.includes(s))) continue;
    c.faces.set(f.id, { ...f, exterieur: f.exterieur.filter((x) => x !== s), trous: f.trous.map((b) => b.filter((x) => x !== s)) });
  }
  c.sommets.delete(s);
}

/** Effacement d'arêtes : faces dépendantes supprimées, ou fusion si l'arête sépare deux faces coplanaires. */
function effacerAretesInterne(t: Travail, c: Ctx, ids: readonly Id[]): void {
  const aSupprimer = new Set<Id>();
  const fusions: { plan: Plan; faces: Face[] }[] = [];
  const bouts = new Set<Id>();
  for (const id of ids) {
    const a = c.aretes.get(id);
    if (!a) continue;
    bouts.add(a.a).add(a.b);
    const fs = facesDeArete(c, a);
    const [f1, f2] = fs;
    if (fs.length === 2 && f1 && f2 && memePlan(planDeFace(c, f1), planDeFace(c, f2))) {
      const pl = planDeFace(c, f1);
      const ex = fusions.find((x) => memePlan(x.plan, pl));
      if (ex) ex.faces.push(f1, f2);
      else fusions.push({ plan: pl, faces: [f1, f2] });
    } else for (const f of fs) aSupprimer.add(f.id);
  }
  for (const id of aSupprimer) c.faces.delete(id);
  for (const id of ids) {
    const a = c.aretes.get(id);
    if (!a) continue;
    c.aretes.delete(id);
    if (a.courbe) {
      const k = c.courbes.get(a.courbe);
      if (k) {
        const reste = k.aretes.filter((x) => x !== id);
        if (reste.length) c.courbes.set(k.id, { ...k, aretes: reste });
        else c.courbes.delete(k.id);
      }
    }
  }
  for (const fu of fusions) {
    reconstruirePlan(t, c, fu.plan, {
      sources: [],
      nouvelles: new Set(),
      auto: false,
      anciennesExtra: fu.faces.filter((f) => !aSupprimer.has(f.id)),
    });
  }
  for (const s of bouts) {
    if (aretesDuSommet(c, s).length === 0) c.sommets.delete(s);
    else cicatriser(c, s);
  }
}

// ————————————————————————————————————————————————————————————— Opérations de dessin

/** Segment (outil Ligne) : fusion des sommets à TOL, découpes, détection automatique de face. */
export function ajouterSegment(m: Modele, p: Vec3, q: Vec3, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    insererGeometrie(t, c, [{ a: p, b: q }], [], true);
  });
}

/** Rectangle (outil Rectangle) de coins coin, coin+cote1, coin+cote1+cote2, coin+cote2. */
export function ajouterRectangle(m: Modele, coin: Vec3, cote1: Vec3, cote2: Vec3, o: OptionsContexte = {}): Resultat {
  const p = [coin, add(coin, cote1), add(add(coin, cote1), cote2), add(coin, cote2)];
  return operer(m, o.dans, (t, c) => {
    insererGeometrie(t, c, p.map((a, i) => ({ a, b: p[(i + 1) % 4] as Vec3 })), [], true);
  });
}

export interface OptionsPolygone extends OptionsContexte {
  /** 'cercle' (outil Cercle) ou 'polygone' (outil Polygone) ; dans les deux cas une seule courbe. */
  readonly genre?: "cercle" | "polygone";
  /** Direction du premier sommet (relevé : le 1er sommet est placé vers le curseur). */
  readonly depart?: Vec3;
}

/** Polygone régulier inscrit (cercle = polygone de n segments marqué courbe), face automatique. */
export function ajouterPolygone(
  m: Modele,
  centre: Vec3,
  normale: Vec3,
  rayon: number,
  cotes: number,
  o: OptionsPolygone = {},
): Resultat {
  if (!Number.isInteger(cotes) || cotes < 3 || cotes > 999) {
    throw new RangeError("Curve segments must be in the range from 3 to 999 (segments de courbe : de 3 à 999)");
  }
  const n = normalize(normale);
  let u = o.depart ? normalize(sub(o.depart, scale(n, dot(o.depart, n)))) : baseDuPlan(n).u;
  if (len(u) < 0.5) u = baseDuPlan(n).u;
  const w = cross(n, u);
  const pts: Vec3[] = [];
  for (let i = 0; i < cotes; i++) {
    const a = (2 * Math.PI * i) / cotes;
    pts.push(add(centre, add(scale(u, rayon * Math.cos(a)), scale(w, rayon * Math.sin(a)))));
  }
  const courbe = { cle: "k", genre: o.genre ?? "cercle", centre, rayon, normale: n } as const;
  return operer(m, o.dans, (t, c) => {
    insererGeometrie(t, c, pts.map((a, i) => ({ a, b: pts[(i + 1) % cotes] as Vec3, courbe })), [], true);
  });
}

/** Gomme : efface l'arête (ou toute sa courbe) ; faces dépendantes supprimées ou fusionnées si coplanaires. */
export function effacerArete(m: Modele, arete: Id, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    const a = c.aretes.get(arete);
    if (!a) throw new Error(`Arête inconnue : ${arete}`);
    const k = a.courbe ? c.courbes.get(a.courbe) : undefined;
    effacerAretesInterne(t, c, k ? [...k.aretes] : [arete]);
  });
}

/** Inverse la face : normale opposée, boucles retournées, matériaux recto/verso échangés. */
export function inverserFace(m: Modele, face: Id, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    const f = c.faces.get(face);
    if (!f) throw new Error(`Face inconnue : ${face}`);
    c.faces.set(face, inverser(f));
  });
}

function inverser(f: Face): Face {
  return {
    id: f.id,
    exterieur: [...f.exterieur].reverse(),
    trous: f.trous.map((b) => [...b].reverse()),
    normale: scale(f.normale, -1),
    ...(f.materiauVerso !== undefined ? { materiauRecto: f.materiauVerso } : {}),
    ...(f.materiauRecto !== undefined ? { materiauVerso: f.materiauRecto } : {}),
  };
}

function pointDansFace(c: Ctx, f: Face, p: Vec3): boolean {
  const { u, w } = baseDuPlan(f.normale);
  const p2 = (x: Vec3): P2 => ({ x: dot(x, u), y: dot(x, w) });
  return dansRegion2(
    p2(p),
    f.exterieur.map((s) => p2(pos(c, s))),
    f.trous.map((b) => b.map((s) => p2(pos(c, s)))),
  );
}

function echantillonFace(c: Ctx, f: Face): Vec3 {
  const { u, w } = baseDuPlan(f.normale);
  const p2 = (x: Vec3): P2 => ({ x: dot(x, u), y: dot(x, w) });
  const e = echantillon2(
    f.exterieur.map((s) => p2(pos(c, s))),
    f.trous.map((b) => b.map((s) => p2(pos(c, s)))),
  );
  const o = scale(f.normale, dot(f.normale, pos(c, f.exterieur[0] as Id)));
  return add(o, add(scale(u, e.x), scale(w, e.y)));
}

/**
 * Garde numérique des opérations d'extrusion (lot 10a, EX-NUM-04) : une distance non finie (NaN, ±∞) est refusée au lieu
 * d'entrer dans la géométrie ; une distance non nulle sous la tolérance de modélisation est refusée avec ce motif.
 */
export const ERREUR_DISTANCE_NON_FINIE = "Distance non finie : saisissez un nombre.";
export const ERREUR_SOUS_TOLERANCE = `Distance sous la tolérance de modélisation (${TOL} m) : rien n'a été modifié.`;
function exigerDistance(d: number): void {
  if (!Number.isFinite(d)) throw new RangeError(ERREUR_DISTANCE_NON_FINIE);
  if (Math.abs(d) >= EPS && Math.abs(d) < TOL) throw new RangeError(ERREUR_SOUS_TOLERANCE);
}

/**
 * « Jusqu'à une face » (lot 10a, EX-PT-02) : distance signée, le long de la normale de `face`, qui amène son plan sur
 * celui de `cible`. Refus nommés : face ou cible inconnue dans le contexte, cible = source, plans non parallèles.
 */
export const ERREUR_CIBLE_NON_PARALLELE = "Jusqu'à une face : la face cible doit être parallèle à la face poussée.";
export const ERREUR_CIBLE_SOURCE = "Jusqu'à une face : choisissez une autre face que celle qui est poussée.";
export const ERREUR_CIBLE_HORS_CONTEXTE = "Jusqu'à une face : la face cible doit être dans le même groupe ou composant que la face poussée.";
export function distanceJusquAFace(m: Modele, face: Id, cible: Id, o: OptionsContexte = {}): number {
  const c = contexte(m, o.dans);
  const F = c.faces[face];
  const G = c.faces[cible];
  if (!F) throw new Error(`Face inconnue : ${face}`);
  if (!G) throw new RangeError(ERREUR_CIBLE_HORS_CONTEXTE);
  if (face === cible) throw new RangeError(ERREUR_CIBLE_SOURCE);
  if (len(cross(F.normale, G.normale)) > 1e-9) throw new RangeError(ERREUR_CIBLE_NON_PARALLELE);
  const p = (c.sommets[F.exterieur[0] as Id] as Sommet).position;
  const q = (c.sommets[G.exterieur[0] as Id] as Sommet).position;
  return dot(F.normale, sub(q, p));
}

export interface OptionsPousserTirer extends OptionsContexte {
  /** Ctrl : conserve la face de départ (nouvelle face de départ, arête à l'ancien niveau). */
  readonly nouvelleFace?: boolean;
}

/**
 * Pousser/Tirer : distance > 0 dans le sens de la normale, < 0 pour creuser. Faces latérales créées ;
 * sans Ctrl, une face reliée à d'autres est déplacée et les faces voisines coplanaires sont prolongées
 * (sans arête intermédiaire) ; une face isolée reste comme base. Le creusement qui atteint une face opposée
 * parallèle la perce (trou traversant).
 */
export function pousserTirer(m: Modele, face: Id, distance: number, o: OptionsPousserTirer = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    const F = c.faces.get(face);
    if (!F) throw new Error(`Face inconnue : ${face}`);
    exigerDistance(distance);
    if (Math.abs(distance) < EPS) return;
    const n = F.normale;
    const dep = scale(n, distance);
    const boucles = [F.exterieur, ...F.trous].map((b) => b.map((s) => pos(c, s)));
    const bords = [F.exterieur, ...F.trous].flatMap((b) => b.map((s, i) => [s, b[(i + 1) % b.length] as Id] as const));
    const voisins = new Set<Id>();
    for (const [x, y] of bords) {
      const a = areteEntre(c, x, y);
      if (a) for (const g of facesDeArete(c, a)) if (g.id !== F.id) voisins.add(g.id);
    }
    const isolee = voisins.size === 0;
    const matiere = isolee || distance > 0;
    // Perçage : une face parallèle opposée contient la face translatée.
    const ech = add(echantillonFace(c, F), dep);
    const plFin = planCanonique(n, add(boucles[0]?.[0] as Vec3, dep));
    const percee =
      !matiere &&
      [...c.faces.values()].some((g) => g.id !== F.id && memePlan(planDeFace(c, g), plFin) && pointDansFace(c, g, ech));
    if (isolee) {
      if (distance > 0) c.faces.set(F.id, inverser(F));
    } else if (!o.nouvelleFace) c.faces.delete(F.id);

    const segments: SegmentSource[] = [];
    const sources: Source[] = [];
    const facesAvant = [...c.faces.values()];
    boucles.forEach((b, ib) => {
      const ids = (ib === 0 ? F.exterieur : F.trous[ib - 1]) as readonly Id[];
      for (let i = 0; i < b.length; i++) {
        const A = b[i] as Vec3;
        const B = b[(i + 1) % b.length] as Vec3;
        segments.push({ a: A, b: add(A, dep) }, { a: add(A, dep), b: add(B, dep) });
        const ns = scale(normalize(cross(sub(B, A), n)), matiere ? 1 : -1);
        const quad = [A, B, add(B, dep), add(A, dep)];
        const plQuad = planCanonique(ns, A);
        // Mur voisin dans le plan de la face latérale : prolongé (tirer) ou raccourci (pousser).
        const ar = areteEntre(c, ids[i] as Id, ids[(i + 1) % ids.length] as Id);
        const mur =
          ar !== undefined &&
          facesAvant.some((g) => g.id !== F.id && memePlan(planDeFace(c, g), plQuad) && facesDeArete(c, ar).some((h) => h.id === g.id));
        sources.push({ exterieur: quad, trous: [], normale: ns, role: mur && distance < 0 ? "trou" : "face" });
      }
    });
    const fin = {
      exterieur: (boucles[0] as Vec3[]).map((p) => add(p, dep)),
      trous: boucles.slice(1).map((b) => b.map((p) => add(p, dep))),
    };
    if (percee) sources.push({ ...fin, normale: n, role: "trou" });
    else {
      sources.push({
        ...fin,
        normale: isolee && distance < 0 ? scale(n, -1) : n,
        materiauRecto: F.materiauRecto,
        materiauVerso: F.materiauVerso,
        role: "face",
        ...(isolee || o.nouvelleFace ? {} : { idPrefere: F.id }),
      });
    }
    insererGeometrie(t, c, segments, sources, false);
    if (!isolee && !o.nouvelleFace) {
      // Arêtes devenues sans face entre l'ancienne et la nouvelle position (mur raccourci) : supprimées.
      const orphelines: Id[] = [];
      for (const a of c.aretes.values()) {
        const A = pos(c, a.a);
        const B = pos(c, a.b);
        const entre = boucles.some((b) =>
          b.some((X, i) => {
            const Y = b[(i + 1) % b.length] as Vec3;
            const surSeg = (p: Vec3, u: Vec3, w: Vec3): boolean => dist(projeterSurSegment(p, u, w).point, p) <= TOL;
            return (
              (surSeg(A, X, add(X, dep)) && surSeg(B, X, add(X, dep))) || (surSeg(A, X, Y) && surSeg(B, X, Y))
            );
          }),
        );
        if (entre && facesDeArete(c, a).length === 0) orphelines.push(a.id);
      }
      if (orphelines.length) effacerAretesInterne(t, c, orphelines);
      for (const [x, y] of bords) {
        const a = areteEntre(c, x, y);
        if (!a) continue;
        const fs = facesDeArete(c, a);
        const [f1, f2] = fs;
        if (fs.length === 2 && f1 && f2 && memePlan(planDeFace(c, f1), planDeFace(c, f2))) effacerAretesInterne(t, c, [a.id]);
      }
    }
  });
}

export interface OptionsEtirerAretes extends OptionsContexte {
  /** Des deux côtés : la surface s'étend de −vecteur à +vecteur autour des arêtes d'origine. */
  readonly symetrique?: boolean;
  /**
   * (Lot 10b, EX-LINK-02) Lier la surface à ses arêtes sources (racine seulement). Absent = `true`, le comportement
   * historique ; `false` = surface indépendante dès sa création.
   */
  readonly lier?: boolean;
}

/**
 * Pousser/Tirer d'arêtes (écart propre à Fadi, D-196 ; SketchUp ne tire que des faces) : chaque arête balaie le
 * parallélogramme qu'elle décrit le long de `vecteur` et devient une surface. Une arête d'une courbe (cercle, polygone,
 * arc) entraîne toute sa courbe ; les arêtes balayées depuis un cercle ou un arc sont adoucies (surface lisse) et la
 * courbe translatée reste une courbe. Les arêtes d'origine sont conservées (bord de la surface, ou ligne médiane en
 * mode symétrique). Refus : déplacement parallèle à toutes les arêtes (rien à balayer) ; courbe fermée tirée dans son
 * propre plan (la surface se recouvrirait — le Décalage fait la couronne).
 */
export function etirerAretes(m: Modele, aretes: readonly Id[], vecteur: Vec3, o: OptionsEtirerAretes = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    exigerDistance(len(vecteur));
    if (len(vecteur) < EPS) throw new RangeError("Distance nulle : aucune surface à balayer.");
    const ids = aretesEtendues(c, aretes);
    const ferme = contourPlanFerme(c, ids);
    if (ferme && Math.abs(dot(ferme.normale, vecteur)) < 1e-9 * len(vecteur)) {
      // Courbe fermée tirée dans son propre plan : couronne vers l'extérieur.
      lier(t, c, o.dans, { genre: "couronne", sources: [...ids], distance: len(vecteur), symetrique: !!o.symetrique }, () =>
        couronneInterne(t, c, ids, len(vecteur), !!o.symetrique),
      o.lier !== false);
      return;
    }
    lier(t, c, o.dans, { genre: "balayage", sources: [...ids], vecteur, symetrique: !!o.symetrique }, () => balayerInterne(t, c, ids, vecteur, !!o.symetrique), o.lier !== false);
  });
}

/**
 * Couronne (écart Fadi, D-196) : un contour plan FERMÉ (cercle, polygone, ou chaîne d'arêtes) est décalé de `distance`
 * dans son plan (> 0 vers l'extérieur, < 0 vers l'intérieur ; angles en onglet) et la bande entre les deux contours
 * devient une surface trouée. `symetrique` : bande de −distance à +distance, le contour d'origine en ligne médiane.
 * Un cercle ou un polygone décalé reste une courbe. Refus : contour ouvert ou gauche, décalage intérieur qui retourne
 * la forme.
 */
export function couronne(m: Modele, aretes: readonly Id[], distance: number, o: OptionsEtirerAretes = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    exigerDistance(distance);
    if (Math.abs(distance) < EPS) throw new RangeError("Distance nulle : aucune surface à balayer.");
    const ids = aretesEtendues(c, aretes);
    lier(t, c, o.dans, { genre: "couronne", sources: [...ids], distance, symetrique: !!o.symetrique }, () => couronneInterne(t, c, ids, distance, !!o.symetrique), o.lier !== false);
  });
}

/**
 * Allonger (ou raccourcir) une arête droite dans son propre sens (écart Fadi, D-196) : l'extrémité `extremite` avance de
 * `longueur` (< 0 : recule). Extrémité libre d'une arête sans face : l'arête est redessinée ; sinon un segment
 * colinéaire est ajouté (raccourcir une arête reliée est refusé : Gomme ou Déplacer).
 */
export function allongerArete(m: Modele, arete: Id, extremite: Id, longueur: number, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    const a = c.aretes.get(arete);
    if (!a) throw new Error(`Arête inconnue : ${arete}`);
    if (a.courbe) throw new RangeError("Une arête de courbe ne s'allonge pas : tirez-la pour l'étendre en surface.");
    if (extremite !== a.a && extremite !== a.b) throw new RangeError("L'extrémité ne fait pas partie de l'arête.");
    exigerDistance(longueur);
    if (Math.abs(longueur) < EPS) throw new RangeError("Distance nulle : rien n'a été allongé.");
    const autre = extremite === a.a ? a.b : a.a;
    const E = pos(c, extremite);
    const F = pos(c, autre);
    const L = dist(E, F);
    const nouveau = add(E, scale(normalize(sub(E, F)), longueur));
    const libre = aretesDuSommet(c, extremite).length === 1 && facesDeArete(c, a).length === 0;
    if (libre) {
      if (longueur <= -L + EPS) throw new RangeError("Le raccourcissement dépasse la longueur de l'arête.");
      effacerAretesInterne(t, c, [arete]);
      insererGeometrie(t, c, [{ a: F, b: nouveau }], [], true);
      return;
    }
    if (longueur < 0) throw new RangeError("Raccourcir une arête reliée à d'autres : utilisez la Gomme ou Déplacer.");
    insererGeometrie(t, c, [{ a: E, b: nouveau }], [], true);
  });
}

/**
 * Tube sans fond (écart Fadi, D-199) : la face disparaît et ses contours (extérieur et trous) sont balayés de
 * `distance` selon sa normale (< 0 : sens inverse). Avec un cercle, on obtient un tube ouvert aux deux bouts ; la surface
 * reste liée à ses arêtes sources comme un Pousser/Tirer d'arêtes.
 */
export function tuberFace(m: Modele, face: Id, distance: number, o: OptionsContexte & { readonly lier?: boolean } = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    const F = c.faces.get(face);
    if (!F) throw new Error(`Face inconnue : ${face}`);
    exigerDistance(distance);
    if (Math.abs(distance) < EPS) throw new RangeError("Distance nulle : aucune surface à balayer.");
    const ids = new Set<Id>();
    for (const b of [F.exterieur, ...F.trous]) {
      for (let i = 0; i < b.length; i++) {
        const a = areteEntre(c, b[i] as Id, b[(i + 1) % b.length] as Id);
        if (a) ids.add(a.id);
      }
    }
    c.faces.delete(face);
    const vecteur = scale(normalize(F.normale), distance);
    lier(t, c, o.dans, { genre: "balayage", sources: [...ids], vecteur, symetrique: false }, () => balayerInterne(t, c, ids, vecteur, false), o.lier !== false);
  });
}

/** Motif du refus de l'Étirement d'une face sans voisine (suite du lot 8, EX-PT-03). */
export const ERREUR_ETIRER_ISOLEE = "Étirement : aucune face voisine dans ce contexte — utilisez Déplacer pour déplacer une face seule.";

/** Vrai si la face partage au moins un sommet avec une autre face du contexte (`dans`) : seule condition pour l'étirer. */
export function faceAVoisines(m: Modele, face: Id, dans?: Id): boolean {
  const c = contexte(m, dans);
  const F = c.faces[face];
  if (!F) return false;
  const siens = new Set<Id>([...F.exterieur, ...F.trous.flat()]);
  return Object.values(c.faces).some((g) => g.id !== face && [g.exterieur, ...g.trous].some((b) => b.some((s) => siens.has(s))));
}

/**
 * Étirement (Pousser/Tirer, mode Étirement — relevé « Alt = Mode étirement », effet réalisé au lot Planche 8, D-201) :
 * les sommets de la face avancent de `distance` selon sa normale et les faces voisines les suivent — elles sont étirées
 * au lieu de recevoir de nouvelles faces latérales. Une voisine qui deviendrait non plane, une face qui se retournerait
 * ou s'annulerait : refus nommé, modèle inchangé (aucun pli ajouté, aucune correction). Les courbes dont tous les sommets
 * suivent sont translatées.
 */
export function etirerFace(m: Modele, face: Id, distance: number, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    const F = c.faces.get(face);
    if (!F) throw new Error(`Face inconnue : ${face}`);
    if (Math.abs(distance) < EPS) throw new RangeError("Distance nulle : rien n'a été étiré.");
    const dep = scale(normalize(F.normale), distance);
    const bouges = new Set<Id>([...F.exterieur, ...F.trous.flat()]);
    const nouvelle = (s: Id): Vec3 => (bouges.has(s) ? add(pos(c, s), dep) : pos(c, s));
    const voisines = [...c.faces.values()].filter((g) => g.id !== F.id && [g.exterieur, ...g.trous].some((b) => b.some((s) => bouges.has(s))));
    // Suite du lot 8 (EX-PT-03) : sans voisine dans le contexte courant, étirer reviendrait à déplacer la face.
    if (voisines.length === 0) throw new RangeError(ERREUR_ETIRER_ISOLEE);
    const normales = new Map<Id, Vec3>();
    for (const g of voisines) {
      const ext = g.exterieur.map(nouvelle);
      const nw = newell(ext);
      if (len(nw) < EPS) throw new RangeError("L'étirement annulerait une face voisine : rien n'est modifié.");
      const n = normalize(nw);
      if (dot(n, g.normale) <= 0) throw new RangeError("L'étirement retournerait une face voisine : rien n'est modifié.");
      const pl = planCanonique(n, ext[0] as Vec3);
      for (const b of [g.exterieur, ...g.trous]) {
        if (b.some((s) => !surPlan(pl, nouvelle(s)))) throw new RangeError("L'étirement rendrait une face voisine non plane : rien n'est modifié.");
      }
      normales.set(g.id, n);
    }
    for (const s of bouges) c.sommets.set(s, { id: s, position: nouvelle(s) });
    for (const [id, n] of normales) {
      const g = c.faces.get(id) as Face;
      c.faces.set(id, { ...g, normale: n });
    }
    for (const k of [...c.courbes.values()]) {
      const tous = k.aretes.every((aid) => {
        const a = c.aretes.get(aid);
        return a !== undefined && bouges.has(a.a) && bouges.has(a.b);
      });
      if (tous) c.courbes.set(k.id, { ...k, centre: add(k.centre, dep) });
    }
  });
}

/** Arêtes données, complétées par toute la courbe de chacune. */
function aretesEtendues(c: Ctx, aretes: readonly Id[]): Set<Id> {
  const ids = new Set<Id>();
  for (const id of aretes) {
    const a = c.aretes.get(id);
    if (!a) throw new Error(`Arête inconnue : ${id}`);
    const k = a.courbe ? c.courbes.get(a.courbe) : undefined;
    for (const x of k ? k.aretes : [id]) ids.add(x);
  }
  return ids;
}

/** Contour plan fermé formé par les arêtes (ordre des sommets, normale dans le sens trigonométrique), sinon null. */
function contourPlanFerme(c: Ctx, ids: ReadonlySet<Id>): { sommets: readonly Id[]; normale: Vec3 } | null {
  let ch: Chaine;
  try {
    ch = chaineOrdonnee(c, [...ids]);
  } catch {
    return null;
  }
  if (!ch.ferme || ch.sommets.length < 3) return null;
  const pts = ch.sommets.map((s) => pos(c, s));
  const nw = newell(pts);
  if (len(nw) < EPS) return null;
  const n = normalize(nw);
  const pl = planCanonique(n, pts[0] as Vec3);
  if (!pts.every((p) => surPlan(pl, p))) return null;
  return { sommets: ch.sommets, normale: n };
}

/** Exécute `calcul` (qui insère la surface) et enregistre le lien si l'on est à la racine et qu'aucune géométrie étrangère n'a été coupée. */
function lier(t: Travail, c: Ctx, dans: Id | undefined, lien: Omit<Extrusion, "id" | "sommetsSources" | "sommetsCrees" | "faces">, calcul: () => void, actif = true): void {
  const avant = new Set(c.sommets.keys());
  calcul();
  if (dans !== undefined || !actif) return;
  const sources: Record<Id, Vec3> = {};
  for (const id of lien.sources) {
    const a = c.aretes.get(id);
    if (!a) return; // une source a été découpée : pas de lien
    sources[a.a] = pos(c, a.a);
    sources[a.b] = pos(c, a.b);
  }
  const crees: Record<Id, Vec3> = {};
  for (const s of c.sommets.keys()) if (!avant.has(s)) crees[s] = pos(c, s);
  if (etrangere(c, new Set([...Object.keys(sources), ...Object.keys(crees)]), Object.keys(crees))) return;
  const id = t.id("x");
  t.annotations.extrusions[id] = { ...lien, id, sommetsSources: sources, sommetsCrees: crees, faces: facesTouchant(c, new Set(Object.keys(crees))) };
  t.annotationsSales = true;
}

/**
 * Liens d'extrusion (D-196) dont la surface créée touche l'une des faces données (racine seulement) : statut « Liée aux
 * arêtes sources » de la sélection (Objets O-2, EX-UI-06).
 */
export function liensDesFaces(m: Modele, faces: readonly Id[]): Id[] {
  const liens = m.annotations?.extrusions ?? {};
  const c = m.racine;
  const ids: Id[] = [];
  for (const L of Object.values(liens)) {
    const crees = new Set(Object.keys(L.sommetsCrees ?? {}));
    if (faces.some((f) => {
      const F = c.faces[f];
      return !!F && [F.exterieur, ...F.trous].some((b) => b.some((s) => crees.has(s)));
    })) ids.push(L.id);
  }
  return ids;
}

/** Détacher le lien (EX-UI-06, EX-LINK-03) : la relation disparaît, la géométrie reste telle quelle ; un pas d'annulation. */
export function detacherLiens(m: Modele, liens: readonly Id[]): Resultat {
  return operer(m, undefined, (t) => {
    for (const id of liens) {
      if (!t.annotations.extrusions[id]) throw new RangeError(`Lien inconnu : ${id}`);
      delete t.annotations.extrusions[id];
    }
    t.annotationsSales = true;
  });
}

/** Nombre de faces qui touchent l'un des sommets donnés. */
function facesTouchant(c: Ctx, sommets: ReadonlySet<Id>): number {
  let n = 0;
  for (const f of c.faces.values()) if ([f.exterieur, ...f.trous].some((b) => b.some((s) => sommets.has(s)))) n++;
  return n;
}

/** Une arête relie un sommet créé à un sommet hors du lien (géométrie étrangère rattachée à la surface). */
function etrangere(c: Ctx, lien: ReadonlySet<Id>, crees: readonly Id[]): boolean {
  const set = new Set(crees);
  for (const a of c.aretes.values()) {
    if (set.has(a.a) && !lien.has(a.b)) return true;
    if (set.has(a.b) && !lien.has(a.a)) return true;
  }
  return false;
}

/** Après chaque opération : recalcule les surfaces dont les arêtes sources ont bougé ; rompt les liens devenus invalides. */
function actualiserExtrusions(t: Travail): void {
  const liens = t.annotations.extrusions;
  if (Object.keys(liens).length === 0) return;
  const c = t.racine;
  const rompre = (id: Id): void => {
    delete liens[id];
    t.annotationsSales = true;
  };
  // Lot 10b (EX-LINK-04) : ordre stable — ordre de création (un lien qui dépend d'un autre est toujours créé après lui).
  for (const L of Object.values(liens).sort((a, b) => numId(a.id) - numId(b.id))) {
    if (!liens[L.id]) continue;
    if (!Array.isArray(L.sources) || !L.sommetsSources || !L.sommetsCrees) {
      rompre(L.id); // lien mal formé (jamais produit par le noyau ; la lecture du modèle le refuse aussi)
      continue;
    }
    const sommetsSources = new Set<Id>();
    let ok = true;
    for (const id of L.sources) {
      const a = c.aretes.get(id);
      if (!a) {
        ok = false;
        break;
      }
      sommetsSources.add(a.a).add(a.b);
    }
    const anciens = Object.keys(L.sommetsSources);
    if (!ok || sommetsSources.size !== anciens.length || anciens.some((s) => !sommetsSources.has(s))) {
      rompre(L.id);
      continue;
    }
    const crees = Object.entries(L.sommetsCrees);
    if (crees.some(([s, p]) => !c.sommets.has(s) || !egal(pos(c, s), p))) {
      rompre(L.id); // la surface elle-même a été modifiée
      continue;
    }
    // Topologie revérifiée à chaque opération, même sources immobiles : face effacée ou découpée, géométrie étrangère.
    const idsCrees = crees.map(([s]) => s);
    if (facesTouchant(c, new Set(idsCrees)) !== L.faces || etrangere(c, new Set([...sommetsSources, ...idsCrees]), idsCrees)) {
      rompre(L.id);
      continue;
    }
    if (anciens.every((s) => egal(pos(c, s), L.sommetsSources[s] as Vec3))) continue;
    // Recalcul : la surface et ses arêtes (tout ce qui touche un sommet créé) sont retirées, puis balayées à nouveau.
    const set = new Set(idsCrees);
    for (const f of [...c.faces.values()]) if ([f.exterieur, ...f.trous].some((b) => b.some((s) => set.has(s)))) c.faces.delete(f.id);
    const bords = [...c.aretes.values()].filter((a) => set.has(a.a) || set.has(a.b)).map((a) => a.id);
    // Les faces bordées seulement par les sources (ligne médiane d'une surface symétrique) tombent aussi.
    for (const f of [...c.faces.values()]) {
      if (f.exterieur.every((s) => sommetsSources.has(s)) && L.sources.some((id) => facesDeArete(c, c.aretes.get(id) as Arete).some((g) => g.id === f.id)) && L.symetrique) c.faces.delete(f.id);
    }
    effacerAretesInterne(t, c, bords);
    delete liens[L.id];
    t.annotationsSales = true;
    const ids = new Set(L.sources);
    try {
      lier(t, c, undefined, { genre: L.genre, sources: L.sources, ...(L.vecteur ? { vecteur: L.vecteur } : {}), ...(L.distance !== undefined ? { distance: L.distance } : {}), symetrique: L.symetrique }, () =>
        L.genre === "couronne" ? couronneInterne(t, c, ids, L.distance as number, L.symetrique) : balayerInterne(t, c, ids, L.vecteur as Vec3, L.symetrique),
      );
    } catch (err) {
      // Lot 10b (EX-LINK-03, L-04) : un recalcul qui produirait une géométrie invalide refuse la modification de la source
      // tout entière — le modèle précédent est conservé (l'opération lève, `operer` n'écrit rien).
      throw new RangeError(`${ERREUR_RECALCUL_LIEN} ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export const ERREUR_RECALCUL_LIEN = "Modification refusée : la surface liée à ces arêtes ne pourrait pas être recalculée (détachez le lien pour modifier la source librement).";

/** Balayage d'arêtes le long d'un vecteur (cœur de `etirerAretes`). */
function balayerInterne(t: Travail, c: Ctx, ids: ReadonlySet<Id>, vecteur: Vec3, symetrique: boolean): void {
  for (const kid of new Set([...ids].map((id) => c.aretes.get(id)?.courbe).filter((k): k is Id => k !== undefined))) {
    const k = c.courbes.get(kid) as Courbe;
    if (k.genre !== "arc" && Math.abs(dot(normalize(k.normale), vecteur)) < 1e-9 * len(vecteur)) {
      throw new RangeError("Une courbe fermée tirée dans son propre plan se recouvrirait : utilisez le Décalage pour une couronne.");
    }
  }
  const depart = symetrique ? scale(vecteur, -1) : v3(0, 0, 0);
  const course = symetrique ? scale(vecteur, 2) : vecteur;
  // Sommets intérieurs d'un cercle ou d'un arc : les arêtes balayées depuis eux sont adoucies.
  const usages = new Map<Id, number>();
  for (const id of ids) {
    const a = c.aretes.get(id) as Arete;
    const k = a.courbe ? c.courbes.get(a.courbe) : undefined;
    if (!k || k.genre === "polygone") continue;
    for (const s of [a.a, a.b]) usages.set(s, (usages.get(s) ?? 0) + 1);
  }
  const lisse = (s: Id): boolean => (usages.get(s) ?? 0) >= 2;
  const segments: SegmentSource[] = [];
  const sources: Source[] = [];
  const rails = new Set<Id>();
  for (const id of ids) {
    const a = c.aretes.get(id) as Arete;
    const A = pos(c, a.a);
    const B = pos(c, a.b);
    const n = cross(sub(B, A), course);
    if (len(n) < EPS * Math.max(1, len(sub(B, A)) * len(course))) continue; // parallèle : rien à balayer
    const A0 = add(A, depart);
    const B0 = add(B, depart);
    const A1 = add(A0, course);
    const B1 = add(B0, course);
    const k = a.courbe ? c.courbes.get(a.courbe) : undefined;
    const translatee = (cle: string, d: Vec3): SegmentSource["courbe"] =>
      k ? { cle: `${k.id}${cle}`, genre: k.genre, centre: add(k.centre, d), rayon: k.rayon, normale: k.normale } : undefined;
    const fin = translatee("+", add(depart, course));
    segments.push({ a: A1, b: B1, ...(fin ? { courbe: fin } : {}) });
    if (symetrique) {
      const debut = translatee("-", depart);
      segments.push({ a: A0, b: B0, ...(debut ? { courbe: debut } : {}) });
    }
    for (const [s, P0] of [[a.a, A0], [a.b, B0]] as const) {
      if (rails.has(s)) continue;
      rails.add(s);
      segments.push({ a: P0, b: add(P0, course), ...(lisse(s) ? { adoucie: true } : {}) });
    }
    // Surface orientée vers l'extérieur d'une courbe (centre), sinon selon le sens de l'arête.
    let nn = normalize(n);
    if (k) {
      const milieu = scale(add(A, B), 0.5);
      const radial = sub(milieu, k.centre);
      const r = sub(radial, scale(normalize(course), dot(radial, normalize(course))));
      if (len(r) > EPS && dot(nn, r) < 0) nn = scale(nn, -1);
    }
    const quad = dot(cross(sub(B0, A0), course), nn) > 0 ? [A0, B0, B1, A1] : [A0, A1, B1, B0];
    sources.push({ exterieur: quad, trous: [], normale: nn, role: "face" });
  }
  if (sources.length === 0) throw new RangeError("Le déplacement est parallèle aux arêtes : aucune surface à balayer.");
  insererGeometrie(t, c, segments, sources, false);
}

/** Décalage en onglet d'un contour plan fermé orienté (sens trigonométrique autour de n) ; null si la forme se retourne. */
function contourDecale(pts: readonly Vec3[], n: Vec3, d: number): Vec3[] | null {
  const N = pts.length;
  const dirs = pts.map((p, i) => normalize(sub(pts[(i + 1) % N] as Vec3, p)));
  const ext = dirs.map((u) => normalize(cross(u, n)));
  const r: Vec3[] = [];
  for (let i = 0; i < N; i++) {
    const j = (i - 1 + N) % N;
    const P = pts[i] as Vec3;
    const p1 = add(P, scale(ext[j] as Vec3, d));
    const p2 = add(P, scale(ext[i] as Vec3, d));
    r.push(intersectionDroites(p1, dirs[j] as Vec3, p2, dirs[i] as Vec3) ?? p2);
  }
  for (let i = 0; i < N; i++) {
    const v = sub(r[(i + 1) % N] as Vec3, r[i] as Vec3);
    if (dot(v, dirs[i] as Vec3) <= EPS) return null;
  }
  if (dot(newell(r), n) <= 0) return null;
  // Lot 10a (EX-PT-06, P-13) : sur une boucle concave, deux segments non voisins du contour décalé peuvent se croiser
  // sans qu'aucun ne s'inverse ; le décalage est alors refusé en nommant les segments.
  const croises = recoupementContour(r, n);
  if (croises) throw new RangeError(`Le décalage se recoupe (segments ${croises[0] + 1} et ${croises[1] + 1} du contour) : réduisez la distance.`);
  return r;
}

/** Premier couple de segments non voisins d'une boucle plane qui se coupent (indices), ou `null`. */
export function recoupementContour(pts: readonly Vec3[], n: Vec3): [number, number] | null {
  const u = normalize(Math.abs(n.x) < 0.9 ? cross(n, v3(1, 0, 0)) : cross(n, v3(0, 1, 0)));
  const w = cross(n, u);
  const q = pts.map((p) => ({ x: dot(p, u), y: dot(p, w) }));
  const N = q.length;
  const orient = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < N; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % N]!;
    for (let j = i + 2; j < N; j++) {
      if (i === 0 && j === N - 1) continue;
      const c = q[j]!;
      const d = q[(j + 1) % N]!;
      // Revue #121 : chaque orientation est rapportée aux longueurs des deux segments (sinus de l'angle), si bien que le
      // test vaut à toutes les échelles (un nœud papillon d'un millimètre est vu comme un de dix mètres).
      const lab = Math.hypot(b.x - a.x, b.y - a.y);
      const lcd = Math.hypot(d.x - c.x, d.y - c.y);
      if (lab < 1e-15 || lcd < 1e-15) continue;
      const o1 = orient(a, b, c) / (lab * lcd);
      const o2 = orient(a, b, d) / (lab * lcd);
      const o3 = orient(c, d, a) / (lab * lcd);
      const o4 = orient(c, d, b) / (lab * lcd);
      const SIN = 1e-9;
      if (((o1 < -SIN && o2 > SIN) || (o1 > SIN && o2 < -SIN)) && ((o3 < -SIN && o4 > SIN) || (o3 > SIN && o4 < -SIN))) return [i, j];
    }
  }
  return null;
}

/** Couronne (cœur de `couronne`). */
function couronneInterne(t: Travail, c: Ctx, ids: ReadonlySet<Id>, distance: number, symetrique: boolean): void {
  const contour = contourPlanFerme(c, ids);
  if (!contour) throw new RangeError("La couronne demande un contour plan fermé (cercle, polygone ou arêtes formant une boucle).");
  const n = contour.normale;
  const pts = contour.sommets.map((s) => pos(c, s));
  const decale = (d: number): Vec3[] => {
    if (Math.abs(d) < EPS) return pts;
    const r = contourDecale(pts, n, d);
    if (!r) throw new RangeError("Le décalage vers l'intérieur dépasse la forme : réduisez la distance.");
    return r;
  };
  const a = decale(symetrique ? -Math.abs(distance) : 0);
  const b = decale(symetrique ? Math.abs(distance) : distance);
  const [interieur, exterieur] = Math.abs(dot(newell(a), n)) < Math.abs(dot(newell(b), n)) ? [a, b] : [b, a];
  // Un cercle ou un polygone entier décalé reste une courbe (rayon à l'apothème décalé).
  const kids = new Set([...ids].map((id) => c.aretes.get(id)?.courbe));
  const k = kids.size === 1 ? c.courbes.get([...kids][0] as Id) : undefined;
  const courbeDe = (boucle: Vec3[], cle: string): SegmentSource["courbe"] => {
    if (!k || k.genre === "arc" || k.aretes.length !== ids.size) return undefined;
    const apotheme = k.rayon * Math.cos(Math.PI / k.aretes.length);
    const decalage = dot(sub(boucle[0] as Vec3, pts[0] as Vec3), normalize(sub(pts[0] as Vec3, k.centre)));
    const rayon = (k.rayon * (apotheme + decalage * Math.cos(Math.PI / k.aretes.length))) / apotheme;
    return { cle: `${k.id}${cle}`, genre: k.genre, centre: k.centre, rayon, normale: k.normale };
  };
  const segments: SegmentSource[] = [];
  for (const [boucle, cle] of [[a, "-"], [b, "+"]] as const) {
    if (boucle === pts) continue;
    const kc = courbeDe(boucle, cle);
    boucle.forEach((p, i) => segments.push({ a: p, b: boucle[(i + 1) % boucle.length] as Vec3, ...(kc ? { courbe: kc } : {}) }));
  }
  insererGeometrie(t, c, segments, [{ exterieur, trous: [[...interieur].reverse()], normale: n, role: "face" }], false);
}

export interface ResultatFace extends Resultat {
  /** Face créée par l'opération (face intérieure pour un décalage vers l'intérieur). */
  readonly face: Id | undefined;
}

/** Décalage (Offset) du contour extérieur : distance > 0 vers l'intérieur, < 0 vers l'extérieur. */
export function decaler(m: Modele, face: Id, distance: number, o: OptionsContexte = {}): ResultatFace {
  const r = operer(m, o.dans, (t, c) => {
    const F = c.faces.get(face);
    if (!F) throw new Error(`Face inconnue : ${face}`);
    const n = F.normale;
    const pts = F.exterieur.map((s) => pos(c, s));
    const k = pts.length;
    const decale: Vec3[] = [];
    for (let i = 0; i < k; i++) {
      const prec = pts[(i - 1 + k) % k] as Vec3;
      const ici = pts[i] as Vec3;
      const suiv = pts[(i + 1) % k] as Vec3;
      const d0 = normalize(sub(ici, prec));
      const d1 = normalize(sub(suiv, ici));
      const n0 = cross(n, d0);
      const n1 = cross(n, d1);
      const a0 = add(prec, scale(n0, distance));
      const a1 = add(ici, scale(n1, distance));
      const den = dot(cross(d0, d1), n);
      if (Math.abs(den) < 1e-12) {
        decale.push(add(ici, scale(n1, distance)));
        continue;
      }
      const s = dot(cross(sub(a1, a0), d1), n) / den;
      decale.push(add(a0, scale(d0, s)));
    }
    const segments = decale.map((a, i) => ({ a, b: decale[(i + 1) % k] as Vec3 }));
    const sources: Source[] =
      distance < 0
        ? [{ exterieur: decale, trous: [], normale: n, materiauRecto: F.materiauRecto, materiauVerso: F.materiauVerso, role: "face" }]
        : [];
    insererGeometrie(t, c, segments, sources, false);
    // Face dont le contour extérieur est le contour décalé.
    return [...c.faces.values()].find(
      (f) => f.exterieur.length === k && f.exterieur.every((s) => decale.some((p) => egal(p, pos(c, s)))),
    )?.id;
  });
  return { modele: r.modele, rapport: r.rapport, face: r.extra };
}

// ————————————————————————————————————————————————————————————— Transformations

function sommetsDe(c: Ctx, entites: readonly Id[]): Set<Id> {
  const s = new Set<Id>();
  for (const id of entites) {
    const f = c.faces.get(id);
    if (f) for (const b of [f.exterieur, ...f.trous]) for (const x of b) s.add(x);
    const a = c.aretes.get(id);
    if (a) s.add(a.a).add(a.b);
    if (c.sommets.has(id)) s.add(id);
    const k = c.courbes.get(id);
    if (k) for (const e of k.aretes) {
      const ar = c.aretes.get(e);
      if (ar) s.add(ar.a).add(ar.b);
    }
  }
  return s;
}

function fusionnerBoucles(A: readonly Id[], B: readonly Id[], x: Id, y: Id): Id[] {
  // A contient x→y, B contient y→x
  const iy = A.indexOf(y);
  const rotA = [...A.slice(iy), ...A.slice(0, iy)]; // y … x
  const ix = B.indexOf(x);
  const rotB = [...B.slice(ix), ...B.slice(0, ix)]; // x … y
  return [...rotA, ...rotB.slice(1, -1)];
}

/** Rend une face plane après déformation : normale recalculée, ou pliage (autofold) si elle ne l'est plus. */
function replanifier(t: Travail, c: Ctx, f: Face): void {
  const ext = f.exterieur.map((s) => pos(c, s));
  const nw = newell(ext);
  if (len(nw) < EPS) {
    c.faces.delete(f.id);
    return;
  }
  const n = normalize(nw);
  const d = dot(n, ext[0] as Vec3);
  const tous = [f.exterieur, ...f.trous].flat().map((s) => pos(c, s));
  if (tous.every((p) => Math.abs(dot(n, p) - d) <= TOL) || f.trous.length > 0) {
    c.faces.set(f.id, { ...f, normale: n });
    return;
  }
  // Pliage en éventail puis regroupement des triangles coplanaires adjacents.
  let polys: Id[][] = [];
  const v0 = f.exterieur[0] as Id;
  for (let i = 1; i + 1 < f.exterieur.length; i++) polys.push([v0, f.exterieur[i] as Id, f.exterieur[i + 1] as Id]);
  const planP = (p: readonly Id[]): Plan => {
    const q = p.map((s) => pos(c, s));
    return planCanonique(newell(q), q[0] as Vec3);
  };
  let change = true;
  while (change) {
    change = false;
    boucle: for (let i = 0; i < polys.length; i++) {
      for (let j = i + 1; j < polys.length; j++) {
        const A = polys[i] as Id[];
        const B = polys[j] as Id[];
        for (let k = 0; k < A.length; k++) {
          const x = A[k] as Id;
          const y = A[(k + 1) % A.length] as Id;
          const iy = B.indexOf(y);
          if (iy < 0 || B[(iy + 1) % B.length] !== x) continue;
          if (!memePlan(planP(A), planP(B))) continue;
          polys[i] = fusionnerBoucles(A, B, x, y);
          polys = polys.filter((_, q) => q !== j);
          change = true;
          break boucle;
        }
      }
    }
  }
  c.faces.delete(f.id);
  polys.forEach((p, i) => {
    for (let k = 0; k < p.length; k++) {
      const x = p[k] as Id;
      const y = p[(k + 1) % p.length] as Id;
      if (!areteEntre(c, x, y)) {
        const id = t.id("a");
        c.aretes.set(id, { id, a: x, b: y });
      }
    }
    const id = i === 0 ? f.id : t.id("f");
    c.faces.set(id, { ...f, id, exterieur: p, trous: [], normale: normalize(newell(p.map((s) => pos(c, s)))) });
  });
}

/** Fusionne les sommets déplacés confondus avec d'autres sommets (géométrie collante minimale). */
function fusionnerSommets(c: Ctx, deplaces: ReadonlySet<Id>): void {
  for (const s of deplaces) {
    const S = c.sommets.get(s);
    if (!S) continue;
    const autre = [...c.sommets.values()].find((x) => x.id !== s && !deplaces.has(x.id) && egal(x.position, S.position));
    if (!autre) continue;
    const r = (x: Id): Id => (x === s ? autre.id : x);
    for (const a of [...c.aretes.values()]) if (a.a === s || a.b === s) c.aretes.set(a.id, { ...a, a: r(a.a), b: r(a.b) });
    for (const f of [...c.faces.values()]) {
      c.faces.set(f.id, { ...f, exterieur: f.exterieur.map(r), trous: f.trous.map((b) => b.map(r)) });
    }
    c.sommets.delete(s);
  }
  const vues = new Map<string, Id>();
  for (const a of [...c.aretes.values()].sort((x, y) => numId(x.id) - numId(y.id))) {
    if (a.a === a.b) {
      c.aretes.delete(a.id);
      continue;
    }
    const k = cle(a.a, a.b);
    if (vues.has(k)) c.aretes.delete(a.id);
    else vues.set(k, a.id);
  }
  const nettoyer = (b: readonly Id[]): Id[] => b.filter((x, i) => x !== b[(i + 1) % b.length]);
  const signatures = new Set<string>();
  for (const f of [...c.faces.values()].sort((x, y) => numId(x.id) - numId(y.id))) {
    const ext = nettoyer(f.exterieur);
    if (ext.length < 3) {
      c.faces.delete(f.id);
      continue;
    }
    const sig = [...ext].sort().join();
    if (signatures.has(sig)) {
      c.faces.delete(f.id);
      continue;
    }
    signatures.add(sig);
    if (ext.length !== f.exterieur.length) c.faces.set(f.id, { ...f, exterieur: ext, trous: f.trous.map(nettoyer) });
  }
  for (const k of [...c.courbes.values()]) {
    const reste = k.aretes.filter((x) => c.aretes.has(x));
    if (reste.length === 0) c.courbes.delete(k.id);
    else if (reste.length !== k.aretes.length) c.courbes.set(k.id, { ...k, aretes: reste });
  }
}

/** Un objet verrouillé (§5.6, lot 5) ne se transforme pas, ne se copie pas et ne s'efface pas. */
function refuserVerrouilles(c: Ctx, entites: readonly Id[]): void {
  for (const id of entites) {
    const occ = c.occurrences.get(id);
    if (occ?.verrouille) throw new Error(`L'objet ${occ.nom ? `« ${occ.nom} » ` : ""}est verrouillé : déverrouillez-le (Info entité ou menu contextuel) pour le modifier.`);
  }
}

function transformerSurPlace(t: Travail, c: Ctx, entites: readonly Id[], M: Matrice4): void {
  refuserVerrouilles(c, entites);
  const S = sommetsDe(c, entites);
  for (const s of S) c.sommets.set(s, { id: s, position: appliquer(M, pos(c, s)) });
  const det = determinant3(M);
  for (const f of [...c.faces.values()]) {
    const vs = [f.exterieur, ...f.trous].flat();
    const touches = vs.filter((s) => S.has(s)).length;
    if (touches === 0) continue;
    if (touches === vs.length) {
      const n = transformerNormale(M, f.normale);
      c.faces.set(
        f.id,
        det < 0
          ? { ...f, exterieur: [...f.exterieur].reverse(), trous: f.trous.map((b) => [...b].reverse()), normale: n }
          : { ...f, normale: n },
      );
    } else replanifier(t, c, f);
  }
  for (const id of entites) {
    const occ = c.occurrences.get(id);
    if (occ) c.occurrences.set(id, { ...occ, transformation: composer(M, occ.transformation) });
  }
  for (const k of [...c.courbes.values()]) {
    if (!k.aretes.every((e) => {
      const a = c.aretes.get(e);
      return a !== undefined && S.has(a.a) && S.has(a.b);
    })) continue;
    c.courbes.set(k.id, { ...k, centre: appliquer(M, k.centre), normale: transformerNormale(M, k.normale) });
  }
  fusionnerSommets(c, S);
}

function copierTransforme(t: Travail, c: Ctx, entites: readonly Id[], matrices: readonly Matrice4[]): void {
  refuserVerrouilles(c, entites);
  const faces = entites.map((id) => c.faces.get(id)).filter((f): f is Face => f !== undefined);
  const aretes = new Map<Id, Arete>();
  for (const id of entites) {
    const a = c.aretes.get(id);
    if (a) aretes.set(a.id, a);
    const k = c.courbes.get(id);
    if (k) for (const e of k.aretes) {
      const ar = c.aretes.get(e);
      if (ar) aretes.set(ar.id, ar);
    }
  }
  for (const f of faces) {
    for (const b of [f.exterieur, ...f.trous]) {
      for (let i = 0; i < b.length; i++) {
        const a = areteEntre(c, b[i] as Id, b[(i + 1) % b.length] as Id);
        if (a) aretes.set(a.id, a);
      }
    }
  }
  const occs = entites.map((id) => c.occurrences.get(id)).filter((x): x is Occurrence => x !== undefined);
  const lesAretes = [...aretes.values()];
  const lesFaces = faces.map((f) => ({ f, ...positionsFaceCtx(c, f) }));
  matrices.forEach((M, k) => {
    const echelleL = Math.cbrt(Math.abs(determinant3(M)));
    const segments: SegmentSource[] = lesAretes.map((a) => {
      const kc = a.courbe ? c.courbes.get(a.courbe) : undefined;
      return {
        a: appliquer(M, pos(c, a.a)),
        b: appliquer(M, pos(c, a.b)),
        adoucie: a.adoucie,
        masquee: a.masquee,
        ...(kc
          ? {
              courbe: {
                cle: `${kc.id}#${k}`,
                genre: kc.genre,
                centre: appliquer(M, kc.centre),
                rayon: kc.rayon * echelleL,
                normale: transformerNormale(M, kc.normale),
              },
            }
          : {}),
      };
    });
    const sources: Source[] = lesFaces.map(({ f, exterieur, trous }) => ({
      exterieur: exterieur.map((p) => appliquer(M, p)),
      trous: trous.map((b) => b.map((p) => appliquer(M, p))),
      normale: transformerNormale(M, f.normale),
      materiauRecto: f.materiauRecto,
      materiauVerso: f.materiauVerso,
      role: "face",
    }));
    insererGeometrie(t, c, segments, sources, false);
    for (const occ of occs) {
      const id = t.id("o");
      // Objets O-3 : la copie garde nom, matière et balise de l'objet copié (le verrou et le masquage restent à l'original).
      const { verrouille: _v, masquee: _m, ...attributs } = occ;
      c.occurrences.set(id, { ...attributs, id, transformation: composer(M, occ.transformation) });
    }
  });
}

function positionsFaceCtx(c: Ctx, f: Face): { exterieur: Vec3[]; trous: Vec3[][] } {
  return { exterieur: f.exterieur.map((s) => pos(c, s)), trous: f.trous.map((b) => b.map((s) => pos(c, s))) };
}

/** Déplacer : la géométrie connectée non sélectionnée est étirée (faces replanifiées ou pliées). */
export function deplacer(m: Modele, entites: readonly Id[], vecteur: Vec3, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (t, c) => transformerSurPlace(t, c, entites, translation(vecteur)));
}

/** Réseau : `copies` n = n copies au pas du vecteur (« x3 ») ; `divisions` n = n intervalles (« /3 »). */
export type Reseau = { readonly copies: number } | { readonly divisions: number };

/** Copier (Move + Ctrl) : copies collantes, réseau linéaire éventuel. */
export function copier(
  m: Modele,
  entites: readonly Id[],
  vecteur: Vec3,
  reseau: Reseau = { copies: 1 },
  o: OptionsContexte = {},
): Resultat {
  const ms: Matrice4[] = [];
  if ("copies" in reseau) for (let k = 1; k <= reseau.copies; k++) ms.push(translation(scale(vecteur, k)));
  else for (let k = 1; k <= reseau.divisions; k++) ms.push(translation(scale(vecteur, k / reseau.divisions)));
  return operer(m, o.dans, (t, c) => copierTransforme(t, c, entites, ms));
}

export interface OptionsRotation extends OptionsContexte {
  readonly copie?: boolean;
  /** Réseau polaire : nombre de copies supplémentaires (« x5 »), implique `copie`. */
  readonly copies?: number;
}

/** Faire pivoter (angle en radians, autour de l'axe passant par `centre`). */
export function tourner(
  m: Modele,
  entites: readonly Id[],
  centre: Vec3,
  axe: Vec3,
  angle: number,
  o: OptionsRotation = {},
): Resultat {
  return operer(m, o.dans, (t, c) => {
    if (o.copie || o.copies) {
      const n = o.copies ?? 1;
      const ms: Matrice4[] = [];
      for (let k = 1; k <= n; k++) ms.push(rotation(centre, axe, angle * k));
      copierTransforme(t, c, entites, ms);
    } else transformerSurPlace(t, c, entites, rotation(centre, axe, angle));
  });
}

/** Échelle autour d'une origine ; facteur négatif = miroir. */
export function mettreAEchelle(
  m: Modele,
  entites: readonly Id[],
  origine: Vec3,
  facteurs: Vec3 | number,
  o: OptionsContexte = {},
): Resultat {
  const f = typeof facteurs === "number" ? v3(facteurs, facteurs, facteurs) : facteurs;
  if (Math.abs(f.x * f.y * f.z) < EPS) throw new RangeError("Facteur d'échelle nul");
  return operer(m, o.dans, (t, c) => {
    // Lot L17 : une pièce de profilé ne se met à l'échelle que le long de son axe — sa section est une donnée sourcée.
    const pieces = entites.filter((id) => {
      const occ = c.occurrences.get(id);
      return !!occ && !!t.definitions.get(occ.definition)?.piece;
    });
    const autres = entites.filter((id) => !pieces.includes(id));
    if (autres.length) transformerSurPlace(t, c, autres, echelle(origine, f));
    for (const id of pieces) echellePieceAxe(t, c, id, origine, f);
  });
}

/** Retourner (Flip) par rapport au plan (origine, normale) ; `copie` = Ctrl. */
export function retourner(
  m: Modele,
  entites: readonly Id[],
  plan: { readonly origine: Vec3; readonly normale: Vec3 },
  o: OptionsContexte & { readonly copie?: boolean } = {},
): Resultat {
  const M = miroir(plan.origine, plan.normale);
  return operer(m, o.dans, (t, c) => {
    if (o.copie) copierTransforme(t, c, entites, [M]);
    else transformerSurPlace(t, c, entites, M);
  });
}

// ————————————————————————————————————————————————————————————— Groupes et composants

export interface ResultatGroupe extends Resultat {
  readonly occurrence: Id;
  readonly definition: Id;
}

/**
 * Origine locale d'un nouvel objet (Objets O-6, D-208) : `"contexte"` = origine du contexte où il est créé (transformation
 * identité, comportement historique) ; `"coin"` = coin minimal de sa boîte englobante (x, y, z les plus petits, axes
 * parallèles à ceux du contexte), comme les axes par défaut d'un composant SketchUp. La position à l'écran ne change pas.
 */
export type OrigineObjet = "contexte" | "coin";

/** Coin minimal de la boîte englobante d'un contenu de chantier (objets imbriqués compris) ; null s'il est vide. */
function coinMinimal(t: Travail, c: Ctx, M: Matrice4 = IDENTITE, profondeur = 0): Vec3 | null {
  if (profondeur > 32) return null;
  let r: Vec3 | null = null;
  const garder = (q: Vec3) => {
    r = r ? v3(Math.min(r.x, q.x), Math.min(r.y, q.y), Math.min(r.z, q.z)) : q;
  };
  for (const s of c.sommets.values()) garder(appliquer(M, s.position));
  for (const o of c.occurrences.values()) {
    const d = t.definitions.get(o.definition);
    const q = d ? coinMinimal(t, d.contenu, composer(M, o.transformation), profondeur + 1) : null;
    if (q) garder(q);
  }
  return r;
}

/**
 * Grouper (Make Group / Make Component) : faces (avec leurs arêtes), arêtes, courbes et occurrences
 * passent dans une nouvelle définition. Une arête ou un sommet encore utilisé dehors est dupliqué.
 * `origine` (O-6) : origine locale de l'objet créé, `"contexte"` par défaut.
 */
export function grouper(
  m: Modele,
  entites: readonly Id[],
  o: OptionsContexte & MetadonneesDefinition & { readonly genre?: GenreDefinition; readonly nom?: string; readonly origine?: OrigineObjet } = {},
): ResultatGroupe {
  const r = operer(m, o.dans, (t, c) => {
    const faces = new Set(entites.filter((id) => c.faces.has(id)));
    const aretes = new Set<Id>();
    for (const id of entites) {
      if (c.aretes.has(id)) aretes.add(id);
      const k = c.courbes.get(id);
      if (k) for (const e of k.aretes) aretes.add(e);
    }
    for (const id of faces) {
      const f = c.faces.get(id) as Face;
      for (const b of [f.exterieur, ...f.trous]) {
        for (let i = 0; i < b.length; i++) {
          const a = areteEntre(c, b[i] as Id, b[(i + 1) % b.length] as Id);
          if (a) aretes.add(a.id);
        }
      }
    }
    const occs = entites.filter((id) => c.occurrences.has(id));
    const g: Ctx = { sommets: new Map(), aretes: new Map(), faces: new Map(), courbes: new Map(), occurrences: new Map() };
    // Arêtes encore utilisées par une face restée dehors → dupliquées.
    const resteUtilisee = (a: Arete): boolean => facesDeArete(c, a).some((f) => !faces.has(f.id));
    const sommetsG = new Map<Id, Id>();
    const aretesRestantes = [...c.aretes.values()].filter((a) => !aretes.has(a.id) || resteUtilisee(a));
    const sommetsDehors = new Set(aretesRestantes.flatMap((a) => [a.a, a.b]));
    const sg = (s: Id): Id => {
      let n = sommetsG.get(s);
      if (!n) {
        n = sommetsDehors.has(s) ? t.id("s") : s;
        sommetsG.set(s, n);
        g.sommets.set(n, { id: n, position: pos(c, s) });
      }
      return n;
    };
    const areteG = new Map<Id, Id>();
    for (const id of aretes) {
      const a = c.aretes.get(id) as Arete;
      const garde = resteUtilisee(a);
      const nid = garde ? t.id("a") : id;
      areteG.set(id, nid);
      const { courbe: _courbe, ...reste } = a;
      g.aretes.set(nid, { ...reste, id: nid, a: sg(a.a), b: sg(a.b) });
      if (!garde) c.aretes.delete(id);
    }
    for (const k of [...c.courbes.values()]) {
      const dedans = k.aretes.filter((e) => areteG.has(e));
      if (dedans.length === 0) continue;
      const tout = dedans.length === k.aretes.length && dedans.every((e) => areteG.get(e) === e);
      const nid = tout ? k.id : t.id("c");
      g.courbes.set(nid, { ...k, id: nid, aretes: dedans.map((e) => areteG.get(e) as Id) });
      for (const e of dedans) {
        const ga = g.aretes.get(areteG.get(e) as Id) as Arete;
        g.aretes.set(ga.id, { ...ga, courbe: nid });
      }
      if (tout) c.courbes.delete(k.id);
    }
    for (const id of faces) {
      const f = c.faces.get(id) as Face;
      g.faces.set(id, { ...f, exterieur: f.exterieur.map(sg), trous: f.trous.map((b) => b.map(sg)) });
      c.faces.delete(id);
    }
    for (const id of occs) {
      g.occurrences.set(id, c.occurrences.get(id) as Occurrence);
      c.occurrences.delete(id);
    }
    for (const s of [...c.sommets.keys()]) if (!sommetsDehors.has(s)) c.sommets.delete(s);
    const genre = o.genre ?? "groupe";
    const def = t.id("d");
    t.definitions.set(def, { id: def, nom: o.nom ?? (genre === "groupe" ? "Groupe" : "Composant"), genre, contenu: g, ...metaDe(o) });
    const occ = t.id("o");
    // Objets O-6 : origine au coin minimal de la boîte englobante — contenu ramené à l'origine, occurrence translatée d'autant.
    const coin = o.origine === "coin" ? coinMinimal(t, g) : null;
    if (coin && (Math.abs(coin.x) > EPS || Math.abs(coin.y) > EPS || Math.abs(coin.z) > EPS)) {
      const retour = translation(scale(coin, -1));
      for (const [id, sm] of g.sommets) g.sommets.set(id, { ...sm, position: sub(sm.position, coin) });
      for (const [id, k] of g.courbes) g.courbes.set(id, { ...k, centre: sub(k.centre, coin) });
      for (const [id, io] of g.occurrences) g.occurrences.set(id, { ...io, transformation: composer(retour, io.transformation) });
      c.occurrences.set(occ, { id: occ, definition: def, transformation: translation(coin) });
    } else c.occurrences.set(occ, { id: occ, definition: def, transformation: IDENTITE });
    return { occ, def };
  });
  return { modele: r.modele, rapport: r.rapport, occurrence: r.extra.occ, definition: r.extra.def };
}

/**
 * Ce qu'Éclater a transmis (Objets O-3, D-205) : la matière de l'objet est posée sur les faces sans matière propre (recto,
 * le côté qui l'affichait), la matière et la balise de l'objet sur les objets enfants qui n'en ont pas ; la géométrie nue
 * de la Planche ne porte pas de balise, la balise de l'objet est alors perdue pour elle et l'interface le dit.
 */
export interface TransfertsEclater {
  readonly materiauFaces: number;
  readonly materiauObjets: number;
  readonly baliseObjets: number;
  /** L'objet avait une balise et de la géométrie nue qui ne peut pas la porter. */
  readonly baliseNonPortee: boolean;
}

/**
 * Éclater d'un niveau (O-3) : l'occurrence `occurrence` du contexte `o.dans` (absent : contexte qui la contient, retrouvé)
 * est remplacée par son contenu, transformé ; les objets enfants gardent nom, matière, balise, masquage et verrou, les faces
 * et arêtes leur matière et leur masquage. Refus : objet verrouillé.
 */
export function eclater(m: Modele, occurrence: Id, o: OptionsContexte = {}): Resultat & { extra: TransfertsEclater } {
  let dans = o.dans;
  if (dans === undefined) {
    const t0 = new Travail(m);
    const { ctx } = t0.occurrence(occurrence);
    dans = ctx === t0.racine ? undefined : trouverOccurrenceDeDefinition(m, ctx, t0);
  }
  return operer(m, dans, (t, c) => {
    const occ = c.occurrences.get(occurrence);
    if (!occ) throw new Error(`Occurrence inconnue : ${occurrence}`);
    refuserVerrouilles(c, [occurrence]);
    const def = t.definitions.get(occ.definition);
    if (!def) throw new Error(`Définition inconnue : ${occ.definition}`);
    c.occurrences.delete(occurrence);
    const g = def.contenu;
    const M = occ.transformation;
    const segments: SegmentSource[] = [...g.aretes.values()].map((a) => {
      const k = a.courbe ? g.courbes.get(a.courbe) : undefined;
      return {
        a: appliquer(M, pos(g, a.a)),
        b: appliquer(M, pos(g, a.b)),
        adoucie: a.adoucie,
        masquee: a.masquee,
        ...(k
          ? {
              courbe: {
                cle: k.id,
                genre: k.genre,
                centre: appliquer(M, k.centre),
                rayon: k.rayon * Math.cbrt(Math.abs(determinant3(M))),
                normale: transformerNormale(M, k.normale),
              },
            }
          : {}),
      };
    });
    let materiauFaces = 0;
    const sources: Source[] = [...g.faces.values()].map((f) => {
      const p = positionsFaceCtx(g, f);
      const recto = f.materiauRecto ?? occ.materiau;
      if (f.materiauRecto === undefined && occ.materiau !== undefined) materiauFaces++;
      return {
        exterieur: p.exterieur.map((x) => appliquer(M, x)),
        trous: p.trous.map((b) => b.map((x) => appliquer(M, x))),
        normale: transformerNormale(M, f.normale),
        materiauRecto: recto,
        materiauVerso: f.materiauVerso,
        masquee: f.masquee,
        role: "face",
      };
    });
    insererGeometrie(t, c, segments, sources, false);
    let materiauObjets = 0;
    let baliseObjets = 0;
    for (const io of g.occurrences.values()) {
      const id = t.id("o");
      const materiau = io.materiau ?? occ.materiau;
      const balise = io.balise ?? occ.balise;
      if (io.materiau === undefined && materiau !== undefined) materiauObjets++;
      if (io.balise === undefined && balise !== undefined) baliseObjets++;
      c.occurrences.set(id, {
        ...io,
        id,
        transformation: composer(M, io.transformation),
        ...(materiau !== undefined ? { materiau } : {}),
        ...(balise !== undefined ? { balise } : {}),
      });
    }
    const baliseNonPortee = occ.balise !== undefined && (g.faces.size > 0 || g.aretes.size > 0);
    return { materiauFaces, materiauObjets, baliseObjets, baliseNonPortee };
  });
}

function trouverOccurrenceDeDefinition(m: Modele, ctx: Ctx, t: Travail): Id | undefined {
  for (const d of t.definitions.values()) {
    if (d.contenu !== ctx) continue;
    for (const c of [m.racine, ...Object.values(m.definitions).map((x) => x.contenu)]) {
      for (const o of Object.values(c.occurrences)) if (o.definition === d.id) return o.id;
    }
  }
  return undefined;
}

/** Rendre unique (Make Unique) : l'occurrence reçoit une copie privée de sa définition. */
export function rendreUnique(m: Modele, occurrence: Id): Resultat {
  const t = new Travail(m);
  t.rendreUnique(occurrence);
  const modele = t.fermer();
  return { modele, rapport: differences(m, modele) };
}

// --- Lot 2 : formes ---

/** Données portées par une courbe d'arc (centre, rayon, normale du plan de l'arc). */
export interface InfosArc {
  readonly centre: Vec3;
  readonly rayon: number;
  readonly normale: Vec3;
}

/**
 * Arc ouvert (outils Arc, Arc 2 points, Arc 3 points) : polyligne `points[0] → … → points[n]` enregistrée
 * comme UNE courbe de genre « arc » (la gomme l'efface d'un coup). L'arc ne crée pas de face par lui-même ;
 * s'il ferme une boucle coplanaire avec la géométrie existante, la face automatique est créée (§5.4).
 */
export function ajouterArc(m: Modele, points: readonly Vec3[], infos: InfosArc, o: OptionsContexte = {}): Resultat {
  if (points.length < 2) throw new RangeError("Un arc demande au moins deux points.");
  if (points.length - 1 > 999) {
    throw new RangeError("Curve segments must be in the range from 3 to 999 (segments de courbe : de 3 à 999)");
  }
  const courbe = { cle: "k", genre: "arc", centre: infos.centre, rayon: infos.rayon, normale: normalize(infos.normale) } as const;
  return operer(m, o.dans, (t, c) => {
    const segs: SegmentSource[] = [];
    for (let i = 0; i + 1 < points.length; i++) segs.push({ a: points[i] as Vec3, b: points[i + 1] as Vec3, courbe });
    insererGeometrie(t, c, segs, [], true);
  });
}

/**
 * Secteur (outil Secteur / Pie) : arc `points` (une courbe « arc ») fermé par deux rayons (arêtes simples)
 * vers `centre` ; la boucle est coplanaire, la face est créée automatiquement.
 */
export function ajouterSecteur(
  m: Modele,
  centre: Vec3,
  points: readonly Vec3[],
  infos: InfosArc,
  o: OptionsContexte = {},
): Resultat {
  if (points.length < 2) throw new RangeError("Un secteur demande au moins deux points d'arc.");
  if (points.length - 1 > 999) {
    throw new RangeError("Curve segments must be in the range from 3 to 999 (segments de courbe : de 3 à 999)");
  }
  const courbe = { cle: "k", genre: "arc", centre: infos.centre, rayon: infos.rayon, normale: normalize(infos.normale) } as const;
  return operer(m, o.dans, (t, c) => {
    const segs: SegmentSource[] = [{ a: centre, b: points[0] as Vec3 }];
    for (let i = 0; i + 1 < points.length; i++) segs.push({ a: points[i] as Vec3, b: points[i + 1] as Vec3, courbe });
    segs.push({ a: points[points.length - 1] as Vec3, b: centre });
    insererGeometrie(t, c, segs, [], true);
  });
}

// --- Lot 2 : trace ---
// Primitives ajoutées pour les outils Sélection, Lasso, Gomme, Ligne et Main levée (src/outils/).

/** Arêtes d'une courbe entière si l'arête en fait partie, sinon l'arête seule (I8). */
function etendreAuxCourbes(c: Ctx, ids: readonly Id[]): Id[] {
  const r = new Set<Id>();
  for (const id of ids) {
    const a = c.aretes.get(id);
    if (!a) continue;
    const k = a.courbe ? c.courbes.get(a.courbe) : undefined;
    for (const x of k ? k.aretes : [id]) r.add(x);
  }
  return [...r];
}

/** Arêtes de la courbe de l'arête (courbe entière), ou l'arête seule ; lecture seule. */
export function aretesDeLaCourbe(m: Modele, arete: Id, o: OptionsContexte = {}): Id[] {
  const c = contexte(m, o.dans);
  const a = c.aretes[arete];
  if (!a) return [];
  const k = a.courbe ? c.courbes[a.courbe] : undefined;
  return k ? [...k.aretes] : [arete];
}

/** Gomme glissée : efface plusieurs arêtes (et leurs courbes entières) en UNE opération. */
export function effacerAretes(m: Modele, aretes: readonly Id[], o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    effacerAretesInterne(t, c, etendreAuxCourbes(c, aretes));
  });
}

/**
 * Effacer (touche Suppr de la Sélection) : faces seules supprimées (leurs arêtes restent), arêtes effacées avec
 * leurs courbes et leurs faces dépendantes, occurrences retirées. Ids inconnus ignorés.
 */
export function effacerEntites(m: Modele, ids: readonly Id[], o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    refuserVerrouilles(c, ids);
    for (const id of ids) {
      c.faces.delete(id);
      c.occurrences.delete(id);
    }
    effacerAretesInterne(t, c, etendreAuxCourbes(c, ids.filter((id) => c.aretes.has(id))));
    t.effacerAnnotations(ids);
  });
}

// ————————————————————————————————————————————————————————————— Annotations et attributs (lots 4 à 6)

/** Modifie les annotations en un pas : `fn` reçoit la copie mutable et un générateur d'identifiants préfixés. */
export function modifierAnnotations<X>(m: Modele, fn: (a: AnnotationsMutables, id: (prefixe: string) => Id) => X): Resultat & { extra: X } {
  return operer(m, undefined, (t) => {
    t.annotationsSales = true;
    return fn(t.annotations, (p) => t.id(p));
  });
}

/** Peinture : pose (ou retire, `null`) la matière recto des faces données du contexte. */
export function peindreFaces(m: Modele, faces: readonly Id[], materiau: Id | null, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    for (const id of faces) {
      const f = c.faces.get(id);
      if (!f) continue;
      const { materiauRecto: _ancien, ...reste } = f;
      c.faces.set(id, materiau ? { ...reste, materiauRecto: materiau } : reste);
    }
  });
}

/** Info entité (lot 5) : matière d'un côté donné (recto ou verso) des faces ; `null` rend le côté à la matière par défaut. */
export function peindreFacesCote(m: Modele, faces: readonly Id[], cote: "recto" | "verso", materiau: Id | null, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    for (const id of faces) {
      const f = c.faces.get(id);
      if (!f) continue;
      const { materiauRecto, materiauVerso, ...reste } = f;
      const recto = cote === "recto" ? materiau : materiauRecto ?? null;
      const verso = cote === "verso" ? materiau : materiauVerso ?? null;
      c.faces.set(id, { ...reste, ...(recto ? { materiauRecto: recto } : {}), ...(verso ? { materiauVerso: verso } : {}) });
    }
  });
}

/** Peinture d'un objet de l'extérieur : la matière est posée sur l'occurrence (ses faces sans matière la montrent). */
export function peindreOccurrences(m: Modele, occurrences: readonly Id[], materiau: Id | null, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    for (const id of occurrences) {
      const occ = c.occurrences.get(id);
      if (!occ) continue;
      const { materiau: _ancien, ...reste } = occ;
      c.occurrences.set(id, materiau ? { ...reste, materiau } : reste);
    }
  });
}

/** Peinture Maj : remplace, dans TOUS les contextes, la matière des faces qui portent `cible` (undefined = défaut). */
export function peindreFacesPartout(m: Modele, cible: Id | undefined, materiau: Id | null): Resultat {
  return operer(m, undefined, (t) => {
    for (const c of t.tousContextes()) {
      let touche = false;
      for (const f of c.faces.values()) {
        if (f.materiauRecto !== cible) continue;
        const { materiauRecto: _ancien, ...reste } = f;
        c.faces.set(f.id, materiau ? { ...reste, materiauRecto: materiau } : reste);
        touche = true;
      }
      if (touche) t.salir(c);
    }
  });
}

/** Balise Ctrl : toutes les occurrences d'une définition (composant), dans tous les contextes. */
export function baliserDefinition(m: Modele, definition: Id, balise: Id | null): Resultat {
  return operer(m, undefined, (t) => {
    for (const c of t.tousContextes()) {
      let touche = false;
      for (const o of c.occurrences.values()) {
        if (o.definition !== definition) continue;
        const { balise: _ancienne, ...reste } = o;
        c.occurrences.set(o.id, balise ? { ...reste, balise } : reste);
        touche = true;
      }
      if (touche) t.salir(c);
    }
  });
}

/** Balise : pose (ou retire, `null`) la balise des occurrences données du contexte. */
export function baliserOccurrences(m: Modele, occurrences: readonly Id[], balise: Id | null, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    for (const id of occurrences) {
      const occ = c.occurrences.get(id);
      if (!occ) continue;
      const { balise: _ancienne, ...reste } = occ;
      c.occurrences.set(id, balise ? { ...reste, balise } : reste);
    }
  });
}

/**
 * Redimensionner la Planche (Mètre, distance saisie après une mesure point à point) : toute la géométrie, les
 * occurrences et les annotations sont mises à l'échelle `facteur` autour de l'origine du repère stocké. Jamais le
 * modèle du bâtiment ni la parcelle : la Planche seulement (cahier §4.27).
 */
export function redimensionner(m: Modele, facteur: number): Resultat {
  if (!(facteur > EPS) || !Number.isFinite(facteur)) throw new RangeError("Le facteur de redimensionnement doit être strictement positif.");
  const k = facteur;
  const e = (p: Vec3): Vec3 => scale(p, k);
  return operer(m, undefined, (t) => {
    for (const c of t.tousContextes()) {
      t.salir(c);
      for (const s of c.sommets.values()) c.sommets.set(s.id, { ...s, position: e(s.position) });
      for (const kc of c.courbes.values()) c.courbes.set(kc.id, { ...kc, centre: e(kc.centre), rayon: kc.rayon * k });
      for (const o of c.occurrences.values()) {
        const M = [...o.transformation];
        M[3] = (M[3] as number) * k;
        M[7] = (M[7] as number) * k;
        M[11] = (M[11] as number) * k;
        c.occurrences.set(o.id, { ...o, transformation: M });
      }
    }
    const a = t.annotations;
    t.annotationsSales = true;
    for (const g of Object.values(a.guides)) {
      a.guides[g.id] = g.genre === "ligne" ? { ...g, origine: e(g.origine) } : g.genre === "segment" ? { ...g, origine: e(g.origine), fin: e(g.fin) } : { ...g, origine: e(g.origine) };
    }
    for (const ct of Object.values(a.cotes)) {
      a.cotes[ct.id] = ct.genre === "lineaire" ? { ...ct, a: e(ct.a), b: e(ct.b), position: e(ct.position) } : { ...ct, centre: e(ct.centre), rayon: ct.rayon * k, position: e(ct.position) };
    }
    for (const tx of Object.values(a.textes)) if (tx.genre === "repere") a.textes[tx.id] = { ...tx, ancre: e(tx.ancre), position: e(tx.position) };
    for (const pc of Object.values(a.plansDeCoupe)) a.plansDeCoupe[pc.id] = { ...pc, origine: e(pc.origine) };
    if (a.repere) a.repere = { ...a.repere, origine: e(a.repere.origine) };
  });
}

/** Faces d'un maillage reconverti (lot 6) : chaque face = [contour extérieur, ...trous], points monde. */
export type FacesPolygonales = readonly (readonly (readonly Vec3[])[])[];

/**
 * Crée un groupe (ou composant) à la racine à partir de faces planes polygonales déjà cohérentes (arêtes partagées
 * par deux faces, aucun croisement) : construction directe, sans la logique de collage. Les sommets à moins de
 * `tolerance` sont confondus.
 */
export function creerGroupeDepuisFaces(
  m: Modele,
  faces: FacesPolygonales,
  o: { readonly nom?: string; readonly genre?: GenreDefinition; readonly tolerance?: number; readonly materiau?: string; readonly materiauxFaces?: readonly (string | undefined)[] } = {},
): ResultatGroupe {
  const tol = o.tolerance ?? 1e-7;
  const r = operer(m, undefined, (t, c) => {
    const contenu: Ctx = { sommets: new Map(), aretes: new Map(), faces: new Map(), courbes: new Map(), occurrences: new Map() };
    const cellule = (p: Vec3): string => `${Math.round(p.x / tol)}|${Math.round(p.y / tol)}|${Math.round(p.z / tol)}`;
    const index = new Map<string, Id>();
    const sommet = (p: Vec3): Id => {
      const k = cellule(p);
      let id = index.get(k);
      if (!id) {
        id = t.id("s");
        contenu.sommets.set(id, { id, position: p });
        index.set(k, id);
      }
      return id;
    };
    const aretes = new Map<string, Id>();
    const arete = (u: Id, w: Id): void => {
      const k = cle(u, w);
      if (aretes.has(k)) return;
      const id = t.id("a");
      aretes.set(k, id);
      contenu.aretes.set(id, { id, a: u, b: w });
    };
    faces.forEach((boucles, i) => {
      const ids = boucles.map((b) => {
        const s: Id[] = [];
        for (const p of b) {
          const id = sommet(p);
          if (s[s.length - 1] !== id) s.push(id);
        }
        while (s.length > 1 && s[0] === s[s.length - 1]) s.pop();
        return s;
      }).filter((b) => b.length >= 3);
      const ext = ids[0];
      if (!ext) return;
      for (const b of ids) for (let j = 0; j < b.length; j++) arete(b[j] as Id, b[(j + 1) % b.length] as Id);
      const id = t.id("f");
      const n = newell(ext.map((s) => (contenu.sommets.get(s) as Sommet).position));
      const mat = o.materiauxFaces?.[i];
      contenu.faces.set(id, { id, exterieur: ext, trous: ids.slice(1), normale: normalize(n), ...(mat ? { materiauRecto: mat } : {}) });
    });
    const def = t.id("d");
    const occ = t.id("o");
    t.definitions.set(def, { id: def, nom: o.nom ?? "Groupe", genre: o.genre ?? "groupe", contenu: t.salir(contenu) });
    c.occurrences.set(occ, { id: occ, definition: def, transformation: IDENTITE, ...(o.materiau ? { materiau: o.materiau } : {}) });
    return { occurrence: occ, definition: def };
  });
  return { modele: r.modele, rapport: r.rapport, occurrence: r.extra.occurrence, definition: r.extra.definition };
}

export interface AttributsVisibilite {
  readonly masquee?: boolean;
  readonly adoucie?: boolean;
}

/** Gomme Maj / Ctrl / Alt : masque, adoucit ou rétablit des arêtes (attribut absent = inchangé). */
export function modifierAretes(m: Modele, aretes: readonly Id[], attributs: AttributsVisibilite, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    for (const id of aretes) {
      const a = c.aretes.get(id);
      if (!a) continue;
      const { masquee, adoucie, ...reste } = a;
      const mq = attributs.masquee ?? masquee ?? false;
      const ad = attributs.adoucie ?? adoucie ?? false;
      c.aretes.set(id, { ...reste, ...(mq ? { masquee: true } : {}), ...(ad ? { adoucie: true } : {}) });
    }
  });
}

/**
 * Main levée : polyligne ouverte enregistrée comme UNE courbe (genre « arc » faute de genre dédié ; centre = premier
 * point, rayon 0). Pas de face automatique, sauf si `fermee` (boucle plane, doc [S12]).
 */
export function ajouterCourbeLibre(m: Modele, points: readonly Vec3[], o: OptionsContexte & { readonly fermee?: boolean } = {}): Resultat {
  const p0 = points[0];
  if (!p0 || points.length < 2) throw new RangeError("Courbe à main levée : au moins deux points.");
  const n = len(newell(points)) > EPS ? normalize(newell(points)) : AXE_Z;
  const courbe = { cle: "k", genre: "arc" as const, centre: p0, rayon: 0, normale: n };
  const segs: SegmentSource[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Vec3;
    const b = points[i + 1] as Vec3;
    if (dist(a, b) > TOL) segs.push({ a, b, courbe });
  }
  return operer(m, o.dans, (t, c) => {
    insererGeometrie(t, c, segs, [], o.fermee === true);
  });
}

/** Arêtes bordant une face (boucle extérieure et trous). */
export function aretesDeFace(m: Modele, face: Id, o: OptionsContexte = {}): Id[] {
  const c = versCtx(contexte(m, o.dans));
  const f = c.faces.get(face);
  if (!f) return [];
  const r: Id[] = [];
  for (const b of [f.exterieur, ...f.trous]) {
    for (let i = 0; i < b.length; i++) {
      const a = areteEntre(c, b[i] as Id, b[(i + 1) % b.length] as Id);
      if (a && !r.includes(a.id)) r.push(a.id);
    }
  }
  return r;
}

/** Faces qui partagent une arête. */
export function facesDeLArete(m: Modele, arete: Id, o: OptionsContexte = {}): Id[] {
  const c = versCtx(contexte(m, o.dans));
  const a = c.aretes.get(arete);
  return a ? facesDeArete(c, a).map((f) => f.id) : [];
}

/** Tout le connecté (triple-clic) : arêtes et faces reliées par des sommets à l'arête ou à la face donnée. */
export function entitesConnectees(m: Modele, id: Id, o: OptionsContexte = {}): Id[] {
  const c = versCtx(contexte(m, o.dans));
  const depart: Id[] = [];
  const f0 = c.faces.get(id);
  const a0 = c.aretes.get(id);
  if (f0) depart.push(...f0.exterieur, ...f0.trous.flat());
  else if (a0) depart.push(a0.a, a0.b);
  else return [];
  const vus = new Set<Id>(depart);
  const pile = [...depart];
  const aretes = new Set<Id>();
  while (pile.length) {
    const s = pile.pop() as Id;
    for (const a of aretesDuSommet(c, s)) {
      aretes.add(a.id);
      for (const x of [a.a, a.b]) if (!vus.has(x)) (vus.add(x), pile.push(x));
    }
  }
  const faces = [...c.faces.values()].filter((f) => [f.exterieur, ...f.trous].some((b) => b.some((s) => vus.has(s)))).map((f) => f.id);
  return [...faces, ...aretes];
}

/**
 * Groupe vide (Objets O-4, écart Fadi déclaré : SketchUp n'en crée pas) : une définition sans contenu et son occurrence à
 * l'origine du contexte `o.dans`. Elle n'est jamais purgée tant qu'elle a une occurrence (seules les définitions sans
 * occurrence le sont, `Travail.fermer`).
 */
export function grouperVide(m: Modele, o: OptionsContexte & { readonly genre?: GenreDefinition; readonly nom?: string } = {}): ResultatGroupe {
  const r = operer(m, o.dans, (t, c) => {
    const genre = o.genre ?? "groupe";
    const def = t.id("d");
    const contenu: Ctx = { sommets: new Map(), aretes: new Map(), faces: new Map(), courbes: new Map(), occurrences: new Map() };
    t.definitions.set(def, { id: def, nom: o.nom ?? (genre === "groupe" ? "Groupe" : "Composant"), genre, contenu });
    const occ = t.id("o");
    c.occurrences.set(occ, { id: occ, definition: def, transformation: IDENTITE });
    return { occ, def };
  });
  return { modele: r.modele, rapport: r.rapport, occurrence: r.extra.occ, definition: r.extra.def };
}

/** Ce que Déplacer vers un groupe doit annoncer (O-4). */
export interface DeplacementContexte {
  /** La cible est un composant à plusieurs occurrences : les objets déplacés apparaissent dans chacune. */
  readonly composantPartage: number;
}

/**
 * Déplacer vers un groupe (Objets O-4) : les objets `ids` du contexte `o.dans` passent dans le contexte de l'occurrence
 * `cible` (absente : la racine) **sans bouger à l'écran** — nouvelle transformation = inverse(monde de la cible) × monde
 * du contexte source × transformation propre. Un groupe cible partagé est d'abord rendu unique (I7) ; un composant cible
 * partagé est édité en commun et le résultat le compte (`composantPartage`, à annoncer). Les identifiants sont gardés.
 * Refus : objet verrouillé, objet inconnu du contexte, cible égale au contexte source, cible dans un objet déplacé
 * (cycle), cible non inversible.
 */
export function deplacerVersContexte(m: Modele, ids: readonly Id[], cible: Id | undefined, o: OptionsContexte = {}): Resultat & { extra: DeplacementContexte } {
  if (ids.length === 0) throw new RangeError("Déplacer vers un groupe demande au moins un objet.");
  if (cible === o.dans) throw new RangeError("Les objets sont déjà dans ce contexte.");
  const chemin = cible === undefined ? [] : cheminVers(m, cible);
  if (cible !== undefined && chemin.length === 0) throw new Error(`Occurrence inconnue : ${cible}`);
  if (ids.some((id) => chemin.includes(id))) throw new RangeError("Un objet ne peut pas être déplacé dans lui-même ni dans un de ses objets.");
  if (cible !== undefined && cheminVers(m, cible).length && new Travail(m).occurrence(cible).occ.verrouille) throw new RangeError("Le groupe d'arrivée est verrouillé : déverrouillez-le pour y ranger des objets.");
  // Revue O-4 : un composant partagé peut contenir la définition d'arrivée sans que l'occurrence cible soit sous l'objet
  // (une autre occurrence de B, hors de A) ; ranger A dedans rendrait la définition récursive. On suit les définitions.
  if (cible !== undefined) {
    const defCible = new Travail(m).occurrence(cible).occ.definition;
    const ici = contexte(m, o.dans).occurrences;
    if (ids.some((id) => ici[id] !== undefined && definitionsAtteintes(m, (ici[id] as Occurrence).definition).has(defCible))) throw new RangeError(ERREUR_DEPLACER_CYCLE);
  }
  const source = o.dans === undefined ? IDENTITE : matriceMonde(m, o.dans);
  const arrivee = cible === undefined ? IDENTITE : matriceMonde(m, cible);
  const inverse = arrivee ? inverserMatrice(arrivee) : null;
  if (!source || !inverse) throw new RangeError("Le repère de la cible n'est pas inversible : déplacement refusé.");
  const t = new Travail(m);
  // Les groupes partagés sur les deux chemins sont rendus uniques de haut en bas (I7) : sinon un groupe parent copié
  // recevrait ou perdrait l'objet avec celui qu'on édite.
  for (const id of [...(o.dans === undefined ? [] : cheminVers(m, o.dans)), ...chemin]) t.ouvrir(id);
  const src = t.ouvrir(o.dans);
  // Revue O-4 : deux occurrences d'un même composant ouvrent le même contenu — « déplacer » de l'une à l'autre n'est pas
  // un rangement (l'objet bougerait dans toutes) : refus.
  if (t.ouvrir(cible) === src) throw new RangeError(ERREUR_DEPLACER_MEME_CONTENU);
  for (const id of ids) if (!src.occurrences.has(id)) throw new RangeError(`L'objet ${id} n'est pas dans le contexte ouvert : seuls les groupes et composants se déplacent vers un groupe.`);
  refuserVerrouilles(src, ids);
  const occs = ids.map((id) => src.occurrences.get(id) as Occurrence);
  let composantPartage = 0;
  if (cible !== undefined) {
    const def = m.definitions[t.occurrence(cible).occ.definition];
    if (def?.genre === "composant" && nombreOccurrences(m, def.id) > 1) composantPartage = nombreOccurrences(m, def.id);
  }
  for (const id of ids) src.occurrences.delete(id);
  const dst = t.ouvrir(cible);
  const passage = composer(inverse, source);
  for (const occ of occs) dst.occurrences.set(occ.id, { ...occ, transformation: composer(passage, occ.transformation) });
  actualiserExtrusions(t);
  actualiserPieces(t);
  const modele = t.fermer();
  return { modele, rapport: differences(m, modele), extra: { composantPartage } };
}

export const ERREUR_DEPLACER_CYCLE = "Un objet ne peut pas être rangé dans un objet qu'il contient (directement ou par un composant partagé).";
export const ERREUR_DEPLACER_MEME_CONTENU = "Les objets sont déjà dans ce contenu : la cible est une autre occurrence du même composant.";

/** Définitions atteintes depuis `def` (elle comprise), en descendant dans les occurrences de leur contenu. */
export function definitionsAtteintes(m: Modele, def: Id): Set<Id> {
  const vues = new Set<Id>();
  const pile = [def];
  while (pile.length) {
    const d = pile.pop() as Id;
    if (vues.has(d)) continue;
    vues.add(d);
    const contenu = m.definitions[d]?.contenu;
    if (contenu) for (const oc of Object.values(contenu.occurrences)) pile.push(oc.definition);
  }
  return vues;
}

/** Chemin d'occurrences de la racine jusqu'à `occ` comprise ; vide si introuvable. */
function cheminVers(m: Modele, occ: Id): Id[] {
  const chercher = (c: Contexte, ch: Id[]): Id[] | null => {
    if (ch.length > 32) return null;
    for (const o of Object.values(c.occurrences)) {
      if (o.id === occ) return [...ch, o.id];
      const d = m.definitions[o.definition];
      const r = d ? chercher(d.contenu, [...ch, o.id]) : null;
      if (r) return r;
    }
    return null;
  };
  return chercher(m.racine, []) ?? [];
}

/** Matrice monde d'une occurrence (transformations composées depuis la racine) ; null si introuvable. */
export function matriceMonde(m: Modele, occurrence: Id): Matrice4 | null {
  const chercher = (c: Contexte, M: Matrice4, prof: number): Matrice4 | null => {
    if (prof > 32) return null;
    for (const occ of Object.values(c.occurrences)) {
      const M2 = composer(M, occ.transformation);
      if (occ.id === occurrence) return M2;
      const d = m.definitions[occ.definition];
      const r = d ? chercher(d.contenu, M2, prof + 1) : null;
      if (r) return r;
    }
    return null;
  };
  return chercher(m.racine, IDENTITE, 0);
}

/**
 * Matrice monde le long d'un chemin d'occurrences (racine → occurrence) ; null si une étape n'est pas dans le contexte
 * de la précédente. Contrairement à `matriceMonde`, elle distingue les occurrences d'un composant qui partagent un
 * objet imbriqué de même identifiant (Objets O-2).
 */
export function matriceChemin(m: Modele, chemin: readonly Id[]): Matrice4 | null {
  let c: Contexte = m.racine;
  let M: Matrice4 = IDENTITE;
  for (const id of chemin) {
    const occ = c.occurrences[id];
    const d = occ ? m.definitions[occ.definition] : undefined;
    if (!occ || !d) return null;
    M = composer(M, occ.transformation);
    c = d.contenu;
  }
  return M;
}

/** Inverse d'une transformation affine (null si singulière). */
export function inverserMatrice(M: Matrice4): Matrice4 | null {
  const g = (i: number): number => M[i] ?? 0;
  const [a, b, c, d, e, f, h, i, j] = [g(0), g(1), g(2), g(4), g(5), g(6), g(8), g(9), g(10)];
  const det = a * (e * j - f * i) - b * (d * j - f * h) + c * (d * i - e * h);
  if (Math.abs(det) < EPS) return null;
  const r = [
    (e * j - f * i) / det, (c * i - b * j) / det, (b * f - c * e) / det,
    (f * h - d * j) / det, (a * j - c * h) / det, (c * d - a * f) / det,
    (d * i - e * h) / det, (b * h - a * i) / det, (a * e - b * d) / det,
  ] as const;
  const t = v3(g(3), g(7), g(11));
  const tx = -(r[0] * t.x + r[1] * t.y + r[2] * t.z);
  const ty = -(r[3] * t.x + r[4] * t.y + r[5] * t.z);
  const tz = -(r[6] * t.x + r[7] * t.y + r[8] * t.z);
  return [r[0], r[1], r[2], tx, r[3], r[4], r[5], ty, r[6], r[7], r[8], tz, 0, 0, 0, 1];
}

// --- Lot 3 : outils de modification ---
// Primitives ajoutées pour Diviser, Décalage d'arêtes et Suivez-moi (src/outils/diviser.ts, decalage.ts, suivez-moi.ts).

/** Diviser : l'arête (ou un tronçon de courbe) est découpée en `segments` arêtes égales ; les faces bordantes gagnent les sommets. */
export function diviser(m: Modele, arete: Id, segments: number, o: OptionsContexte = {}): Resultat {
  if (!Number.isInteger(segments) || segments < 1 || segments > 9999) {
    throw new RangeError("Le nombre de segments doit être un entier entre 1 et 9999.");
  }
  return operer(m, o.dans, (t, c) => {
    const a = c.aretes.get(arete);
    if (!a) throw new Error(`Arête inconnue : ${arete}`);
    const A = pos(c, a.a);
    const B = pos(c, a.b);
    // De la fin vers le début : `couperArete` garde l'identifiant sur le premier tronçon.
    for (let k = segments - 1; k >= 1; k--) couperArete(t, c, arete, lerp(A, B, k / segments));
  });
}

interface Chaine {
  readonly sommets: readonly Id[];
  readonly ferme: boolean;
}

/** Chaîne ordonnée de sommets formée par des arêtes continues (ouverte ou fermée) ; `RangeError` sinon. */
function chaineOrdonnee(c: Ctx, ids: readonly Id[]): Chaine {
  const aretes = [...new Set(ids)].map((id) => c.aretes.get(id)).filter((a): a is Arete => a !== undefined);
  if (aretes.length === 0) throw new RangeError("Aucune arête à suivre.");
  const incident = new Map<Id, Arete[]>();
  for (const a of aretes) for (const s of [a.a, a.b]) incident.set(s, [...(incident.get(s) ?? []), a]);
  for (const l of incident.values()) if (l.length > 2) throw new RangeError("Les arêtes se ramifient : une chaîne continue est nécessaire.");
  const bouts = [...incident.entries()].filter(([, l]) => l.length === 1).map(([s]) => s);
  if (bouts.length !== 0 && bouts.length !== 2) throw new RangeError("Les arêtes ne forment pas une chaîne continue.");
  const depart = bouts[0] ?? (aretes[0] as Arete).a;
  const sommets: Id[] = [depart];
  const vues = new Set<Id>();
  let courant = depart;
  for (;;) {
    const suivante = (incident.get(courant) ?? []).find((a) => !vues.has(a.id));
    if (!suivante) break;
    vues.add(suivante.id);
    courant = suivante.a === courant ? suivante.b : suivante.a;
    if (courant === depart) break;
    sommets.push(courant);
  }
  if (vues.size !== aretes.length) throw new RangeError("Les arêtes ne forment pas une chaîne continue.");
  return { sommets, ferme: bouts.length === 0 };
}

/** Intersection de deux droites coplanaires (p + t·d, q + u·e) ; null si parallèles. */
function intersectionDroites(p: Vec3, d: Vec3, q: Vec3, e: Vec3): Vec3 | null {
  const w = cross(d, e);
  const w2 = dot(w, w);
  if (w2 < 1e-18) return null;
  const t = dot(cross(sub(q, p), e), w) / w2;
  return add(p, scale(d, t));
}

/**
 * Décalage d'arêtes continues (Offset sur des arêtes présélectionnées) : polyligne parallèle à `|distance|`, du côté de
 * `cote`, prolongée jusqu'aux intersections ; AUCUNE face créée. Le plan est celui de la chaîne (arêtes non
 * colinéaires), sinon celui de la face bordante, sinon celui qui contient l'arête et le point `cote`.
 */
export function decalerAretes(m: Modele, aretes: readonly Id[], distance: number, cote: Vec3, o: OptionsContexte = {}): Resultat {
  if (!(Math.abs(distance) > EPS)) throw new RangeError("La distance de décalage doit être non nulle.");
  return operer(m, o.dans, (t, c) => {
    const ch = chaineOrdonnee(c, aretes);
    const P = ch.sommets.map((s) => pos(c, s));
    const n0 = ch.ferme ? P.length : P.length - 1;
    const dirs: Vec3[] = [];
    for (let i = 0; i < n0; i++) dirs.push(normalize(sub(P[(i + 1) % P.length] as Vec3, P[i] as Vec3)));
    let n: Vec3 | null = null;
    for (let i = 0; i + 1 < dirs.length && !n; i++) {
      const w = cross(dirs[i] as Vec3, dirs[i + 1] as Vec3);
      if (len(w) > 1e-6) n = normalize(w);
    }
    if (!n) {
      const premiere = [...c.aretes.values()].find((a) => aretes.includes(a.id));
      const f = premiere ? facesDeArete(c, premiere)[0] : undefined;
      if (f) n = f.normale;
    }
    if (!n) {
      const w = cross(dirs[0] as Vec3, sub(cote, P[0] as Vec3));
      n = len(w) > 1e-9 ? normalize(w) : AXE_Z;
    }
    const lateral = (d: Vec3): Vec3 => normalize(cross(n as Vec3, d));
    // Côté du curseur : sens de la perpendiculaire de la première arête qui rapproche de `cote`.
    const signe = dot(lateral(dirs[0] as Vec3), sub(cote, P[0] as Vec3)) >= 0 ? 1 : -1;
    const decal = (i: number): Vec3 => scale(lateral(dirs[i] as Vec3), signe * Math.abs(distance));
    const Q: Vec3[] = [];
    for (let i = 0; i < P.length; i++) {
      const prec = ch.ferme ? (i - 1 + n0) % n0 : i - 1;
      const suiv = i < n0 ? i : -1;
      if (prec < 0) Q.push(add(P[i] as Vec3, decal(suiv)));
      else if (suiv < 0) Q.push(add(P[i] as Vec3, decal(prec)));
      else {
        const X = intersectionDroites(
          add(P[i] as Vec3, decal(prec)),
          dirs[prec] as Vec3,
          add(P[i] as Vec3, decal(suiv)),
          dirs[suiv] as Vec3,
        );
        Q.push(X ?? add(P[i] as Vec3, decal(suiv)));
      }
    }
    const segments: SegmentSource[] = [];
    for (let i = 0; i < n0; i++) segments.push({ a: Q[i] as Vec3, b: Q[(i + 1) % Q.length] as Vec3 });
    insererGeometrie(t, c, segments, [], false);
  });
}

/** Chemin d'un Suivez-moi : le contour extérieur d'une face, ou des arêtes continues. */
export type CheminSuivi = { readonly face: Id } | { readonly aretes: readonly Id[] };

/** Glisse `pts` le long de `dir` jusqu'au plan (normale `nrm`, passant par `o`). */
function glisserSurPlan(pts: readonly Vec3[], dir: Vec3, nrm: Vec3, o: Vec3): Vec3[] {
  const den = dot(nrm, dir);
  if (Math.abs(den) < 1e-9) throw new RangeError("Le profil est parallèle au chemin : il ne peut pas être extrudé.");
  return pts.map((p) => add(p, scale(dir, dot(nrm, sub(o, p)) / den)));
}

function volumeSigne(polys: readonly (readonly Vec3[])[]): number {
  let v = 0;
  for (const p of polys) for (let i = 1; i + 1 < p.length; i++) v += dot(p[0] as Vec3, cross(p[i] as Vec3, p[i + 1] as Vec3)) / 6;
  return v;
}

/** Options de Suivez-moi (lot 10c). */
export interface OptionsSuivezMoi extends OptionsContexte {
  /** (EX-FM-06) Chemin ouvert : capuchons aux deux bouts (défaut) ; `false` = surface ouverte, sans capuchon. */
  readonly bouchons?: boolean;
}

export const ERREUR_TROUS_JOINTIFS = "Le profil a des trous qui se touchent (ou touchent son contour) : balayage refusé.";
export const ERREUR_CHEMIN_RECOUPE = "Le chemin repasse trop près de lui-même pour ce profil : le balayage se traverserait.";
export const ERREUR_ONGLET_SINGULIER = "Coin trop aigu : l'onglet partirait à l'infini (angle de moins de 12°).";

/**
 * Suivez-moi (Follow Me) : le profil (une face, avec ses trous — lot 10c, EX-FM-04) est extrudé sur tout le chemin ;
 * coins à onglet (plans bissecteurs), faces latérales planes ; chaque boucle du profil (contour et trous) est balayée
 * par la même transformation de section (EX-FM-05). Chemin fermé : surface fermée sans capuchon, couture soudée ;
 * chemin ouvert : capuchons aux deux bouts, trous compris, sauf `bouchons: false` (surface ouverte, EX-FM-06). La face
 * du profil est consommée (retirée, ses arêtes orphelines aussi). Refus atomiques : trous jointifs, demi-tour exact,
 * coin trop aigu, chemin qui se recoupe (EX-FM-07). Si le chemin est une face dont la surface est recouverte par le
 * balayage, elle se découpe comme toute géométrie collante.
 */
/**
 * Le balayage se recouperait-il ? Deux segments non voisins du chemin plus proches que la largeur du profil
 * (`rayon` : distance maximale du centre du profil à ses sommets) : leurs sections se chevaucheraient.
 */
function cheminSeRecoupe(V: readonly Vec3[], ferme: boolean, rayon: number): boolean {
  const N = V.length;
  const nSeg = ferme ? N : N - 1;
  const distSegments = (p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number => {
    // Distance minimale exacte entre deux segments (points les plus proches, paramètres bornés à [0, 1]).
    const d1 = sub(q1, p1);
    const d2 = sub(q2, p2);
    const r = sub(p1, p2);
    const a = dot(d1, d1);
    const e = dot(d2, d2);
    const f = dot(d2, r);
    const borne = (x: number) => Math.max(0, Math.min(1, x));
    let s = 0;
    let u = 0;
    if (a < EPS && e < EPS) return dist(p1, p2);
    if (a < EPS) u = borne(f / e);
    else {
      const cc = dot(d1, r);
      if (e < EPS) s = borne(-cc / a);
      else {
        const b = dot(d1, d2);
        const den = a * e - b * b;
        s = den > EPS * a * e ? borne((b * f - cc * e) / den) : 0;
        u = (b * s + f) / e;
        if (u < 0) {
          u = 0;
          s = borne(-cc / a);
        } else if (u > 1) {
          u = 1;
          s = borne((b - cc) / a);
        }
      }
    }
    return dist(add(p1, scale(d1, s)), add(p2, scale(d2, u)));
  };
  for (let i = 0; i < nSeg; i++) {
    for (let j = i + 2; j < nSeg; j++) {
      if (ferme && i === 0 && j === nSeg - 1) continue;
      if (distSegments(V[i] as Vec3, V[(i + 1) % N] as Vec3, V[j] as Vec3, V[(j + 1) % N] as Vec3) < 2 * rayon - 1e-9) return true;
    }
  }
  return false;
}

export function suivezMoi(m: Modele, profil: Id, chemin: CheminSuivi, o: OptionsSuivezMoi = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    const F = c.faces.get(profil);
    if (!F) throw new Error(`Face de profil inconnue : ${profil}`);
    // Lot 10c (EX-FM-04) : trous acceptés s'ils ne touchent ni le contour ni les autres trous.
    exigerTrousDisjoints(F);
    let ch: Chaine;
    if ("face" in chemin) {
      if (chemin.face === profil) throw new RangeError("Le chemin et le profil doivent être distincts.");
      const G = c.faces.get(chemin.face);
      if (!G) throw new Error(`Face du chemin inconnue : ${chemin.face}`);
      ch = { sommets: G.exterieur, ferme: true };
    } else ch = chaineOrdonnee(c, chemin.aretes);
    const profilPts = F.exterieur.map((s) => pos(c, s));
    const trousPts = F.trous.map((b) => b.map((s) => pos(c, s)));
    const nP = normalize(F.normale);
    const centre = scale(profilPts.reduce((a, p) => add(a, p), v3(0, 0, 0)), 1 / profilPts.length);
    // Sommets de passage colinéaires (arête coupée par un autre dessin) : ignorés, sinon ils découpent les faces.
    const brut = ch.sommets.map((s) => pos(c, s));
    const base = brut.filter((p, i) => {
      const interieur = ch.ferme || (i > 0 && i < brut.length - 1);
      if (!interieur) return true;
      const avant = sub(p, brut[(i - 1 + brut.length) % brut.length] as Vec3);
      const apres = sub(brut[(i + 1) % brut.length] as Vec3, p);
      return !(colineaires(avant, apres, 1e-9) && dot(avant, apres) > 0);
    });
    const N = base.length;
    if (N < 2) throw new RangeError("Le chemin est trop court.");

    // Départ et sens : le sommet du chemin le plus proche du profil, avec une première direction non parallèle au profil.
    let meilleur: { pts: Vec3[]; ecart: number; angle: number } | null = null;
    const candidats: { pts: Vec3[] }[] = [];
    if (ch.ferme) {
      for (let s = 0; s < N; s++) {
        candidats.push({ pts: Array.from({ length: N }, (_, k) => base[(s + k) % N] as Vec3) });
        candidats.push({ pts: Array.from({ length: N }, (_, k) => base[(((s - k) % N) + N) % N] as Vec3) });
      }
    } else {
      candidats.push({ pts: base }, { pts: [...base].reverse() });
    }
    for (const cand of candidats) {
      const d0 = normalize(sub(cand.pts[1] as Vec3, cand.pts[0] as Vec3));
      const angle = Math.abs(dot(d0, nP));
      if (angle < 0.2) continue;
      const ecart = Math.min(...profilPts.map((p) => dist(p, cand.pts[0] as Vec3)), dist(centre, cand.pts[0] as Vec3));
      if (!meilleur || ecart < meilleur.ecart - 1e-9 || (Math.abs(ecart - meilleur.ecart) <= 1e-9 && angle > meilleur.angle + 1e-9)) {
        meilleur = { pts: cand.pts, ecart, angle };
      }
    }
    if (!meilleur) throw new RangeError("Le profil est parallèle au chemin : il ne peut pas être extrudé.");
    const V = meilleur.pts;
    const nSeg = ch.ferme ? N : N - 1;
    const d: Vec3[] = [];
    for (let i = 0; i < nSeg; i++) d.push(normalize(sub(V[(i + 1) % N] as Vec3, V[i] as Vec3)));
    // Lot 10c (EX-FM-05, 07) : un coin trop aigu donnerait un onglet sans borne ; un chemin qui se recoupe, un balayage
    // qui se traverse. Refus avant toute écriture.
    for (let i = 1; i < (ch.ferme ? nSeg + 1 : nSeg); i++) {
      const a = d[(i - 1) % nSeg] as Vec3;
      const b = d[i % nSeg] as Vec3;
      const c2 = dot(a, b);
      if (c2 < -1 + 1e-12) continue; // demi-tour exact : refusé plus bas par le plan bissecteur (message dédié)
      if (c2 < Math.cos(Math.PI - (12 * Math.PI) / 180)) throw new RangeError(ERREUR_ONGLET_SINGULIER);
    }
    const rayon = Math.max(...profilPts.map((p) => dist(p, centre)));
    if (cheminSeRecoupe(V, ch.ferme, rayon)) throw new RangeError(ERREUR_CHEMIN_RECOUPE);
    const plan = (i: number): { n: Vec3; o: Vec3 } => {
      const k = i % N;
      if (!ch.ferme && (i === 0 || i === N - 1)) return { n: d[i === 0 ? 0 : nSeg - 1] as Vec3, o: V[k] as Vec3 };
      const a = d[(i - 1 + nSeg) % nSeg] as Vec3;
      const b = d[i % nSeg] as Vec3;
      const bis = add(a, b);
      if (len(bis) < 1e-9) throw new RangeError("Le chemin revient sur lui-même : onglet impossible.");
      return { n: normalize(bis), o: V[k] as Vec3 };
    };
    // Chaque boucle (contour puis trous) glisse de plan en plan : même transformation de section pour toutes.
    const balayer = (boucle: readonly Vec3[]): Vec3[][] => {
      const sections: Vec3[][] = [];
      const p0 = plan(0);
      sections.push(glisserSurPlan(boucle, d[0] as Vec3, p0.n, p0.o));
      for (let i = 1; i <= nSeg; i++) {
        if (ch.ferme && i === nSeg) {
          sections.push(sections[0] as Vec3[]);
          break;
        }
        const pi = plan(i);
        sections.push(glisserSurPlan(sections[i - 1] as Vec3[], d[i - 1] as Vec3, pi.n, pi.o));
      }
      return sections;
    };
    const parois = (sections: Vec3[][]): Vec3[][] => {
      const k = (sections[0] as Vec3[]).length;
      const r: Vec3[][] = [];
      for (let i = 0; i < nSeg; i++) {
        const S = sections[i] as Vec3[];
        const E = sections[i + 1] as Vec3[];
        for (let j = 0; j < k; j++) r.push([S[j] as Vec3, S[(j + 1) % k] as Vec3, E[(j + 1) % k] as Vec3, E[j] as Vec3]);
      }
      return r;
    };
    const sectionsExt = balayer(profilPts);
    const sectionsTrous = trousPts.map(balayer);
    let polys: Vec3[][] = parois(sectionsExt);
    // Capuchons (chemin ouvert, sauf « sans capuchon ») : contour extérieur, trous compris.
    const capuchons = !ch.ferme && o.bouchons !== false;
    const capDebut = { ext: [...(sectionsExt[0] as Vec3[])].reverse(), trous: sectionsTrous.map((st) => [...(st[0] as Vec3[])].reverse()) };
    const capFin = { ext: [...(sectionsExt[nSeg] as Vec3[])], trous: sectionsTrous.map((st) => [...(st[nSeg] as Vec3[])]) };
    // Orientation : décidée sur la coque extérieure (parois + capuchons pleins) — les trous ont l'enroulement opposé et
    // leurs parois regardent donc le vide (EX-FM-06 : normales du vide vers l'intérieur).
    const coque = capuchons ? [...polys, capDebut.ext, capFin.ext] : polys;
    let inverser = volumeSigne(coque) < 0;
    if (!capuchons && ch.ferme === false) inverser = false; // surface ouverte : orientation du profil conservée
    const orienter = (p: Vec3[]) => (inverser ? [...p].reverse() : p);
    polys = polys.map(orienter);
    const paroisTrous = sectionsTrous.flatMap((st) => parois(st)).map(orienter);
    polys = [...polys, ...paroisTrous].filter((p) => len(newell(p)) > 1e-12);
    const caps: { ext: Vec3[]; trous: Vec3[][] }[] = capuchons
      ? [capDebut, capFin].map((cap) => ({ ext: orienter(cap.ext), trous: cap.trous.map(orienter) }))
      : [];

    consommerProfil(t, c, F, profil);
    insererBalayage(t, c, polys, caps);
  });
}

/**
 * Le profil d'un balayage (Suivez-moi, Révolution) est consommé : sa face et celles de ses arêtes qu'aucune autre face ne
 * borde disparaissent AVANT l'insertion, sinon elles découperaient les faces coplanaires du résultat.
 */
function consommerProfil(t: Travail, c: Ctx, F: Face, profil: Id): void {
  const aretesProfil: Id[] = [];
  for (const b of [F.exterieur, ...F.trous]) {
    for (let i = 0; i < b.length; i++) {
      const a = areteEntre(c, b[i] as Id, b[(i + 1) % b.length] as Id);
      if (a && facesDeArete(c, a).every((g) => g.id === profil)) aretesProfil.push(a.id);
    }
  }
  c.faces.delete(profil);
  if (aretesProfil.length) effacerAretesInterne(t, c, aretesProfil);
  // Sommets du profil laissés sur une arête voisine (profil dessiné sur un bord) : recollés si colinéaires.
  for (const s of [...F.exterieur, ...F.trous.flat()]) cicatriser(c, s);
}

/** Insère les parois (polygones plans) et les capuchons (avec trous) d'un balayage, comme géométrie collante. */
function insererBalayage(t: Travail, c: Ctx, polys: readonly Vec3[][], caps: readonly { ext: Vec3[]; trous: Vec3[][] }[]): void {
  const segments: SegmentSource[] = [];
  const sources: Source[] = [];
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) segments.push({ a: p[i] as Vec3, b: p[(i + 1) % p.length] as Vec3 });
    sources.push({ exterieur: p, trous: [], normale: normalize(newell(p)), role: "face" });
  }
  for (const cap of caps) {
    for (const b of [cap.ext, ...cap.trous]) for (let i = 0; i < b.length; i++) segments.push({ a: b[i] as Vec3, b: b[(i + 1) % b.length] as Vec3 });
    sources.push({ exterieur: cap.ext, trous: cap.trous, normale: normalize(newell(cap.ext)), role: "face" });
  }
  insererGeometrie(t, c, segments, sources, false);
}

/** Refus commun des balayages : trous qui se touchent ou touchent le contour (EX-FM-04). */
function exigerTrousDisjoints(F: Face): void {
  const vus = new Set<Id>();
  for (const b of [F.exterieur, ...F.trous]) {
    for (const sId of b) {
      if (vus.has(sId)) throw new RangeError(ERREUR_TROUS_JOINTIFS);
      vus.add(sId);
    }
  }
}

// ————————————————————————————————————————————————————————————— Révolution (lot 10d, EX-RV)

/** Axe de révolution : un point et une direction (non nulle). */
export interface AxeRevolution {
  readonly origine: Vec3;
  readonly direction: Vec3;
}

/** Options de la Révolution (lot 10d, EX-RV-02, 03). */
export interface OptionsRevolution extends OptionsContexte {
  /** Angle en degrés, de −360 à +360, zéro exclu ; défaut +360 (tour complet). */
  readonly angle?: number;
  /** Segments par tour complet : entier de 12 à 512 ; défaut 48. */
  readonly segments?: number;
  /** Tour partiel : coiffes de début et de fin (défaut), trous compris ; `false` = surface ouverte. */
  readonly bouchons?: boolean;
}

export const ANGLE_REVOLUTION_DEFAUT = 360;
export const SEGMENTS_PAR_TOUR_DEFAUT = 48;
export const SEGMENTS_PAR_TOUR_MIN = 12;
export const SEGMENTS_PAR_TOUR_MAX = 512;
export const ERREUR_REVOLUTION_ANGLE = "Angle de révolution : entre −360° et +360°, zéro exclu.";
export const ERREUR_REVOLUTION_SEGMENTS = "Segments par tour : un nombre entier de 12 à 512.";
export const ERREUR_REVOLUTION_AXE_NUL = "Axe de révolution nul : donnez deux points distincts ou une arête.";
export const ERREUR_REVOLUTION_AXE_PLAN = "L'axe de révolution doit être dans le plan du profil.";
export const ERREUR_REVOLUTION_AXE_TRAVERSE = "Le profil traverse l'axe : la matière tournée se recouperait.";

/** Nombre de segments d'un tour partiel (EX-RV-03) : max(1, ⌈N × |angle| / 360°⌉) ; un tour complet en a N. */
export function segmentsRevolution(angle: number, parTour: number): number {
  return Math.max(1, Math.ceil((parTour * Math.abs(angle)) / 360 - 1e-9));
}

/** Écart de facettage estimé (flèche de la corde) au rayon `rayon`, pour `parTour` segments par tour complet. */
export function ecartFacettage(rayon: number, parTour: number): number {
  return rayon * (1 - Math.cos(Math.PI / parTour));
}

/** Contrôle des paramètres de la Révolution (EX-RV-02, 03) ; lance une erreur de domaine. */
export function validerParametresRevolution(angle: number, parTour: number): void {
  if (!Number.isFinite(angle) || angle === 0 || Math.abs(angle) > 360 + 1e-9) throw new RangeError(ERREUR_REVOLUTION_ANGLE);
  if (!Number.isInteger(parTour) || parTour < SEGMENTS_PAR_TOUR_MIN || parTour > SEGMENTS_PAR_TOUR_MAX) throw new RangeError(ERREUR_REVOLUTION_SEGMENTS);
}

/** Rotation de `p` d'angle `theta` (radians) autour de l'axe (origine `o`, direction unitaire `u`) — Rodrigues. */
function tournerAutour(p: Vec3, o: Vec3, u: Vec3, theta: number): Vec3 {
  const v = sub(p, o);
  const cs = Math.cos(theta);
  const sn = Math.sin(theta);
  return add(o, add(add(scale(v, cs), scale(cross(u, v), sn)), scale(u, dot(u, v) * (1 - cs))));
}

/**
 * Révolution (lot 10d, EX-RV-01 à 04) : méthode de Suivez-moi qui tourne le profil (une face, trous compris) autour d'un
 * axe situé dans son plan, d'un angle de −360° à +360° (zéro exclu), en `segments` par tour complet. Elle partage les
 * contrats du balayage (refus des trous jointifs, consommation du profil, insertion collante, orientation décidée sur la
 * coque extérieure) mais ne passe pas par un chemin polygonal générique : chaque anneau est la rotation exacte du
 * profil, le dernier tombe exactement sur l'angle demandé.
 * - Tour complet : couture soudée (le dernier anneau est le premier), ni coiffe ni sommet en double.
 * - Tour partiel : coiffes de début et de fin, trous compris, sauf `bouchons: false` (surface ouverte).
 * - Profil qui touche l'axe : les sommets sur l'axe sont des pôles partagés ; aucune face d'aire nulle.
 * - Refus : axe nul, axe hors du plan du profil, profil qui traverse l'axe, angle ou segments hors domaine.
 */
export function revolution(m: Modele, profil: Id, axe: AxeRevolution, o: OptionsRevolution = {}): Resultat {
  const angle = o.angle ?? ANGLE_REVOLUTION_DEFAUT;
  const parTour = o.segments ?? SEGMENTS_PAR_TOUR_DEFAUT;
  validerParametresRevolution(angle, parTour);
  if (len(axe.direction) < EPS) throw new RangeError(ERREUR_REVOLUTION_AXE_NUL);
  const u = normalize(axe.direction);
  const O = axe.origine;
  return operer(m, o.dans, (t, c) => {
    const F = c.faces.get(profil);
    if (!F) throw new Error(`Face de profil inconnue : ${profil}`);
    exigerTrousDisjoints(F);
    const nP = normalize(F.normale);
    const ext = F.exterieur.map((s) => pos(c, s));
    const trous = F.trous.map((b) => b.map((s) => pos(c, s)));
    if (Math.abs(dot(nP, u)) > 1e-6 || Math.abs(dot(nP, sub(O, ext[0] as Vec3))) > TOL) throw new RangeError(ERREUR_REVOLUTION_AXE_PLAN);
    // Côté de l'axe dans le plan du profil : toute la matière d'un seul côté (les sommets sur l'axe sont permis).
    const w = normalize(cross(nP, u));
    const cote = (p: Vec3) => dot(sub(p, O), w);
    const cotes = ext.map(cote);
    if (Math.min(...cotes) < -TOL && Math.max(...cotes) > TOL) throw new RangeError(ERREUR_REVOLUTION_AXE_TRAVERSE);
    const surAxe = (p: Vec3) => Math.abs(cote(p)) <= TOL;
    const complet = Math.abs(Math.abs(angle) - 360) <= 1e-9;
    const k = complet ? parTour : segmentsRevolution(angle, parTour);
    const theta = (angle * Math.PI) / 180;
    const anneaux = (boucle: readonly Vec3[]): Vec3[][] => {
      const r: Vec3[][] = [];
      for (let i = 0; i <= k; i++) {
        if (complet && i === k) {
          r.push(r[0] as Vec3[]);
          break;
        }
        // Le dernier anneau d'un tour partiel tombe exactement sur l'angle demandé ; un sommet sur l'axe ne bouge pas.
        const a = i === k ? theta : (theta * i) / k;
        r.push(boucle.map((p) => (surAxe(p) ? p : tournerAutour(p, O, u, a))));
      }
      return r;
    };
    const parois = (A: Vec3[][]): Vec3[][] => {
      const n = (A[0] as Vec3[]).length;
      const r: Vec3[][] = [];
      for (let i = 0; i < k; i++) {
        const S = A[i] as Vec3[];
        const E = A[i + 1] as Vec3[];
        for (let j = 0; j < n; j++) {
          const quad = [S[j] as Vec3, S[(j + 1) % n] as Vec3, E[(j + 1) % n] as Vec3, E[j] as Vec3];
          // Pôles partagés : un sommet sur l'axe ne s'écarte pas — le quadrilatère devient un triangle, ou disparaît.
          const poly = quad.filter((q, x) => dist(q, quad[(x + 1) % 4] as Vec3) > TOL);
          if (poly.length >= 3 && len(newell(poly)) > 1e-12) r.push(poly);
        }
      }
      return r;
    };
    const anneauxExt = anneaux(ext);
    const anneauxTrous = trous.map(anneaux);
    const coiffes = !complet && o.bouchons !== false;
    const debut = { ext: [...(anneauxExt[0] as Vec3[])].reverse(), trous: anneauxTrous.map((a) => [...(a[0] as Vec3[])].reverse()) };
    const fin = { ext: [...(anneauxExt[k] as Vec3[])], trous: anneauxTrous.map((a) => [...(a[k] as Vec3[])]) };
    let polys = parois(anneauxExt);
    const coque = coiffes ? [...polys, debut.ext, fin.ext] : polys;
    const inverser = complet || coiffes ? volumeSigne(coque) < 0 : false;
    const orienter = (p: Vec3[]) => (inverser ? [...p].reverse() : p);
    polys = [...polys.map(orienter), ...anneauxTrous.flatMap(parois).map(orienter)];
    const caps = coiffes ? [debut, fin].map((cap) => ({ ext: orienter(cap.ext), trous: cap.trous.map(orienter) })) : [];
    consommerProfil(t, c, F, profil);
    insererBalayage(t, c, polys, caps);
  });
}


// ————————————————————————————————————————————————————————————— Objets : visibilité, verrou, adoucissement, orientation (lot 5)

const sansFaux = <T extends object>(o: T, cle: keyof T, v: boolean): T => {
  const r = { ...o } as Record<string, unknown>;
  if (v) r[cle as string] = true;
  else delete r[cle as string];
  return r as T;
};

/** Masquer (`masquee = true`) ou réafficher des faces, arêtes (et leurs courbes) et objets du contexte. */
export function masquerEntites(m: Modele, ids: readonly Id[], o: OptionsContexte = {}, masquee = true): Resultat {
  return operer(m, o.dans, (_t, c) => {
    for (const id of new Set([...ids, ...etendreAuxCourbes(c, ids.filter((x) => c.aretes.has(x) || c.courbes.has(x)))])) {
      const f = c.faces.get(id);
      if (f) c.faces.set(id, sansFaux(f, "masquee", masquee));
      const a = c.aretes.get(id);
      if (a) c.aretes.set(id, sansFaux(a, "masquee", masquee));
      const occ = c.occurrences.get(id);
      if (occ) c.occurrences.set(id, sansFaux(occ, "masquee", masquee));
    }
  });
}

export const afficherEntites = (m: Modele, ids: readonly Id[], o: OptionsContexte = {}): Resultat => masquerEntites(m, ids, o, false);

/** Réafficher tout (panneau Affichage) : toutes les faces, arêtes et objets masqués de tous les contextes. */
export function afficherTout(m: Modele): Resultat {
  const t = new Travail(m);
  for (const c of t.tousContextes()) {
    const ids = [...[...c.faces.values()].filter((f) => f.masquee), ...[...c.aretes.values()].filter((a) => a.masquee), ...[...c.occurrences.values()].filter((o) => o.masquee)].map((e) => e.id);
    if (ids.length === 0) continue;
    t.salir(c);
    for (const id of ids) {
      const f = c.faces.get(id);
      if (f) c.faces.set(id, sansFaux(f, "masquee", false));
      const a = c.aretes.get(id);
      if (a) c.aretes.set(id, sansFaux(a, "masquee", false));
      const occ = c.occurrences.get(id);
      if (occ) c.occurrences.set(id, sansFaux(occ, "masquee", false));
    }
  }
  const modele = t.fermer();
  return { modele, rapport: differences(m, modele) };
}

/** Verrouiller / déverrouiller des objets (groupes, composants). */
export function verrouillerOccurrences(m: Modele, ids: readonly Id[], verrou: boolean, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    for (const id of ids) {
      const occ = c.occurrences.get(id);
      if (occ) c.occurrences.set(id, sansFaux(occ, "verrouille", verrou));
    }
  });
}

/** Nom d'une occurrence (Info entité). */
export function renommerOccurrence(m: Modele, id: Id, nom: string, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    const occ = c.occurrences.get(id);
    if (!occ) throw new Error(`Occurrence inconnue : ${id}`);
    const n = nom.trim();
    const { nom: _ancien, ...reste } = occ;
    c.occurrences.set(id, n ? { ...reste, nom: n } : reste);
  });
}

/** Nom, description et options d'une définition (boîte « Modifier les détails du composant », Info entité). */
export function modifierDefinition(m: Modele, definition: Id, meta: MetadonneesDefinition & { readonly nom?: string }): Resultat {
  const t = new Travail(m);
  const d = t.definitions.get(definition);
  if (!d) throw new Error(`Définition inconnue : ${definition}`);
  const nom = meta.nom?.trim();
  t.definitions.set(definition, { ...d, ...metaDe({ ...metaDe(d), ...meta }), ...(nom ? { nom } : {}) });
  // `fermer` ne relit les métadonnées que si la définition change : forcer la comparaison.
  const modele = t.fermer();
  return { modele, rapport: differences(m, modele) };
}

/** Adoucir (ou durcir) des arêtes : la vue ne trace pas une arête adoucie entre deux faces. */
export function adoucirAretes(m: Modele, ids: readonly Id[], adoucie: boolean, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    for (const id of aretesDeSelection(c, ids)) {
      const a = c.aretes.get(id);
      if (a) c.aretes.set(id, sansFaux(a, "adoucie", adoucie));
    }
  });
}

/**
 * Diviser en segments (Explode Curve, Objets O-3) : chaque courbe touchée par la sélection (arête d'une courbe, ou la
 * courbe) cesse d'en être une ; ses arêtes restent en place, chacune sélectionnable seule, et la gomme n'efface plus la
 * courbe entière. Géométrie inchangée. Refus : aucune courbe dans la sélection. Renvoie le nombre de courbes divisées.
 */
export function diviserCourbes(m: Modele, ids: readonly Id[], o: OptionsContexte = {}): Resultat & { extra: number } {
  return operer(m, o.dans, (_t, c) => {
    const courbes = new Set<Id>();
    for (const id of ids) {
      if (c.courbes.has(id)) courbes.add(id);
      const k = c.aretes.get(id)?.courbe;
      if (k) courbes.add(k);
    }
    if (courbes.size === 0) throw new RangeError("Diviser en segments demande une courbe (cercle, polygone ou arc).");
    for (const k of courbes) {
      const courbe = c.courbes.get(k) as Courbe;
      for (const a of courbe.aretes) {
        const ar = c.aretes.get(a);
        if (!ar) continue;
        const { courbe: _k, ...reste } = ar;
        c.aretes.set(a, reste);
      }
      c.courbes.delete(k);
    }
    return courbes.size;
  });
}

/** Arêtes désignées par une sélection : arêtes, arêtes des faces et des courbes. */
function aretesDeSelection(c: Ctx, ids: readonly Id[]): Id[] {
  const r = new Set<Id>();
  for (const id of ids) {
    if (c.aretes.has(id)) r.add(id);
    const f = c.faces.get(id);
    if (f) for (const a of c.aretes.values()) if ([f.exterieur, ...f.trous].some((b) => boucleContient(b, a.a, a.b))) r.add(a.id);
    const k = c.courbes.get(id);
    if (k) for (const a of k.aretes) r.add(a);
  }
  return [...r];
}

const cleSommets = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Adoucir / lisser (panneau §6.10) : parmi les arêtes de la sélection bordées par exactement deux faces, celles dont l'angle
 * dièdre est au plus `angleDeg` (et, si `coplanaires`, celles entre faces coplanaires) sont adoucies ; les autres durcies.
 * Renvoie le nombre d'arêtes adoucies.
 */
export function adoucirLisser(m: Modele, ids: readonly Id[], angleDeg: number, coplanaires: boolean, o: OptionsContexte = {}): Resultat & { extra: number } {
  return operer(m, o.dans, (_t, c) => {
    let n = 0;
    for (const id of aretesDeSelection(c, ids)) {
      const a = c.aretes.get(id);
      if (!a) continue;
      const fs = facesDeArete(c, a);
      if (fs.length !== 2) continue;
      const cosinus = Math.max(-1, Math.min(1, dot(fs[0]!.normale, fs[1]!.normale)));
      const angle = (Math.acos(cosinus) * 180) / Math.PI;
      const douce = angle <= angleDeg + 1e-9 && (angle > 1e-6 || coplanaires);
      c.aretes.set(id, sansFaux(a, "adoucie", douce));
      if (douce) n++;
    }
    return n;
  });
}

/** Inverser plusieurs faces (menu contextuel). */
export function inverserFaces(m: Modele, faces: readonly Id[], o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    for (const id of faces) {
      const f = c.faces.get(id);
      if (f) c.faces.set(id, inverser(f));
    }
  });
}

/**
 * Orienter les faces (menu contextuel) : les faces connectées à la face de référence prennent une orientation cohérente
 * avec elle (une arête partagée est parcourue dans les deux sens par deux faces bien orientées). Renvoie le nombre de
 * faces retournées.
 */
export function orienterFaces(m: Modele, face: Id, o: OptionsContexte = {}): Resultat & { extra: number } {
  return operer(m, o.dans, (_t, c) => {
    const ref = c.faces.get(face);
    if (!ref) throw new Error(`Face inconnue : ${face}`);
    const sens = (f: Face): Map<string, 1 | -1> => {
      const r = new Map<string, 1 | -1>();
      for (const b of [f.exterieur, ...f.trous]) for (let i = 0; i < b.length; i++) {
        const x = b[i] as Id, y = b[(i + 1) % b.length] as Id;
        r.set(cleSommets(x, y), x < y ? 1 : -1);
      }
      return r;
    };
    const vus = new Set<Id>([face]);
    const file: Id[] = [face];
    let n = 0;
    while (file.length) {
      const f = c.faces.get(file.shift() as Id)!;
      const sf = sens(f);
      for (const [cle, dir] of sf) {
        for (const g of c.faces.values()) {
          if (vus.has(g.id)) continue;
          const sg = sens(g);
          const d2 = sg.get(cle);
          if (d2 === undefined) continue;
          vus.add(g.id);
          if (d2 === dir) {
            c.faces.set(g.id, inverser(g));
            n++;
          }
          file.push(g.id);
        }
      }
    }
    return n;
  });
}

// ————————————————————————————————————————————————————————————— Intersection des faces avec le modèle (lot 5)

interface FaceMonde {
  readonly exterieur: readonly Vec3[];
  readonly trous: readonly (readonly Vec3[])[];
  readonly normale: Vec3;
}

function facesMondeDe(m: Modele, c: Contexte, M: Matrice4, profondeur: number, sortie: FaceMonde[]): void {
  if (profondeur > 32) return;
  const p = (s: Id): Vec3 => appliquer(M, (c.sommets[s] as Sommet).position);
  for (const f of Object.values(c.faces)) if (!f.masquee) sortie.push({ exterieur: f.exterieur.map(p), trous: f.trous.map((b) => b.map(p)), normale: normalize(transformerNormale(M, f.normale)) });
  for (const o of Object.values(c.occurrences)) {
    const d = m.definitions[o.definition];
    if (d && !o.masquee) facesMondeDe(m, d.contenu, composer(M, o.transformation), profondeur + 1, sortie);
  }
}

function dedansPolygone2(q: { x: number; y: number }, poly: readonly { x: number; y: number }[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/** Portions de la droite p + t·d intérieures à la face (polygone troué), en paramètres t croissants. */
function intervallesDansFace(p: Vec3, d: Vec3, f: FaceMonde): [number, number][] {
  const { u, w } = baseDuPlan(f.normale);
  const o = f.exterieur[0] as Vec3;
  const en2 = (q: Vec3): { x: number; y: number } => ({ x: dot(sub(q, o), u), y: dot(sub(q, o), w) });
  const P = en2(p);
  const D = { x: dot(d, u), y: dot(d, w) };
  if (Math.hypot(D.x, D.y) < 1e-12) return [];
  const boucles = [f.exterieur, ...f.trous].map((b) => b.map(en2));
  const ts: number[] = [];
  for (const b of boucles) {
    for (let i = 0; i < b.length; i++) {
      const a = b[i]!, c = b[(i + 1) % b.length]!;
      const e = { x: c.x - a.x, y: c.y - a.y };
      const den = D.x * e.y - D.y * e.x;
      if (Math.abs(den) < 1e-12) continue;
      const s = ((a.x - P.x) * e.y - (a.y - P.y) * e.x) / den;
      const r = ((a.x - P.x) * D.y - (a.y - P.y) * D.x) / den;
      if (r >= -1e-9 && r <= 1 + 1e-9) ts.push(s);
    }
  }
  ts.sort((x, y) => x - y);
  const r: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i]!, t1 = ts[i + 1]!;
    if (t1 - t0 < 1e-9) continue;
    const milieu = { x: P.x + D.x * ((t0 + t1) / 2), y: P.y + D.y * ((t0 + t1) / 2) };
    const dedans = dedansPolygone2(milieu, boucles[0]!) && !boucles.slice(1).some((h) => dedansPolygone2(milieu, h));
    if (dedans) r.push([t0, t1]);
  }
  return r;
}

/** Segments d'intersection de deux faces planes non coplanaires (coordonnées monde). */
function intersectionFaces(f: FaceMonde, g: FaceMonde): { a: Vec3; b: Vec3 }[] {
  const n1 = f.normale, n2 = g.normale;
  const d = cross(n1, n2);
  if (len(d) < 1e-9) return [];
  const dir = normalize(d);
  const d1 = dot(n1, f.exterieur[0] as Vec3), d2 = dot(n2, g.exterieur[0] as Vec3);
  const c = dot(n1, n2);
  const k = 1 - c * c;
  const p0 = add(scale(n1, (d1 - d2 * c) / k), scale(n2, (d2 - d1 * c) / k));
  const A = intervallesDansFace(p0, dir, f);
  const B = intervallesDansFace(p0, dir, g);
  const r: { a: Vec3; b: Vec3 }[] = [];
  for (const [a0, a1] of A) for (const [b0, b1] of B) {
    const t0 = Math.max(a0, b0), t1 = Math.min(a1, b1);
    if (t1 - t0 > TOL) r.push({ a: add(p0, scale(dir, t0)), b: add(p0, scale(dir, t1)) });
  }
  return r;
}

/**
 * Intersection des faces > Avec le modèle (§5.6) : les faces de l'objet (occurrence du contexte, avec ses sous-objets)
 * qui pénètrent la géométrie libre du contexte y ajoutent des arêtes le long de la pénétration (les faces traversées
 * sont découpées) ; l'objet lui-même n'est pas modifié. Sans objet (géométrie libre sélectionnée), les faces libres
 * sélectionnées sont intersectées avec les objets du contexte. Renvoie le nombre de segments ajoutés.
 */
export function intersecterAvecModele(m: Modele, ids: readonly Id[], o: OptionsContexte = {}): Resultat & { extra: number } {
  const c0 = contexte(m, o.dans);
  const objets = ids.filter((id) => c0.occurrences[id]);
  const facesLibres = ids.filter((id) => c0.faces[id]);
  const sources: FaceMonde[] = [];
  const cibles: FaceMonde[] = [];
  const faceMonde = (f: Face): FaceMonde => ({ exterieur: f.exterieur.map((s) => (c0.sommets[s] as Sommet).position), trous: f.trous.map((b) => b.map((s) => (c0.sommets[s] as Sommet).position)), normale: normalize(f.normale) });
  if (objets.length) {
    for (const id of objets) {
      const occ = c0.occurrences[id] as Occurrence;
      const d = m.definitions[occ.definition];
      if (d) facesMondeDe(m, d.contenu, occ.transformation, 1, sources);
    }
    for (const f of Object.values(c0.faces)) if (!f.masquee) cibles.push(faceMonde(f));
  } else {
    for (const id of facesLibres) sources.push(faceMonde(c0.faces[id] as Face));
    for (const occ of Object.values(c0.occurrences)) {
      const d = m.definitions[occ.definition];
      if (d && !occ.masquee) facesMondeDe(m, d.contenu, occ.transformation, 1, cibles);
    }
    // Sans objet en face, les faces libres sélectionnées se coupent entre elles.
    if (cibles.length === 0) for (const f of Object.values(c0.faces)) if (!f.masquee && !facesLibres.includes(f.id)) cibles.push(faceMonde(f));
  }
  const segments: { a: Vec3; b: Vec3 }[] = [];
  for (const s0 of sources) for (const c of cibles) segments.push(...intersectionFaces(s0, c));
  if (segments.length === 0) return { ...operer(m, o.dans, () => 0) };
  // Les segments sont posés dans le contexte d'édition (géométrie libre) : les faces traversées sont découpées.
  return operer(m, o.dans, (t, c) => {
    insererGeometrie(t, c, segments, [], true);
    return segments.length;
  });
}

/** Boîte englobante (monde) d'une occurrence, avec ses sous-objets ; null si elle est vide ou inconnue. */
export function boiteOccurrence(m: Modele, occurrence: Id, chemin?: readonly Id[]): { min: Vec3; max: Vec3 } | null {
  let trouvee: { M: Matrice4; occ: Occurrence } | null = null;
  // Objets O-2 : avec le chemin complet, l'occurrence voulue d'un composant partagé (et non la première trouvée).
  if (chemin && chemin.length > 0 && chemin[chemin.length - 1] === occurrence) {
    let c: Contexte = m.racine;
    let M: Matrice4 = IDENTITE;
    for (const id of chemin) {
      const o = c.occurrences[id];
      if (!o) break;
      M = composer(M, o.transformation);
      if (id === occurrence) trouvee = { M, occ: o };
      const d = m.definitions[o.definition];
      if (!d) break;
      c = d.contenu;
    }
  }
  const chercher = (c: Contexte, M: Matrice4, profondeur: number): void => {
    if (trouvee || profondeur > 32) return;
    for (const o of Object.values(c.occurrences)) {
      if (o.id === occurrence) {
        trouvee = { M: composer(M, o.transformation), occ: o };
        return;
      }
      const d = m.definitions[o.definition];
      if (d) chercher(d.contenu, composer(M, o.transformation), profondeur + 1);
    }
  };
  if (!trouvee) chercher(m.racine, IDENTITE, 0);
  if (!trouvee) return null;
  const t = trouvee as { M: Matrice4; occ: Occurrence };
  const d = m.definitions[t.occ.definition];
  if (!d) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const visiter = (c: Contexte, M: Matrice4, profondeur: number): void => {
    if (profondeur > 32) return;
    for (const s of Object.values(c.sommets)) {
      const q = appliquer(M, s.position);
      min.x = Math.min(min.x, q.x); min.y = Math.min(min.y, q.y); min.z = Math.min(min.z, q.z);
      max.x = Math.max(max.x, q.x); max.y = Math.max(max.y, q.y); max.z = Math.max(max.z, q.z);
    }
    for (const o of Object.values(c.occurrences)) {
      const dd = m.definitions[o.definition];
      if (dd) visiter(dd.contenu, composer(M, o.transformation), profondeur + 1);
    }
  };
  visiter(d.contenu, t.M, 0);
  return Number.isFinite(min.x) ? { min, max } : null;
}

/** Arêtes (monde) de la géométrie masquée : faces, arêtes et objets masqués, pour l'option « voir la géométrie masquée ». */
export function aretesMasquees(m: Modele, quoi: { readonly objets?: boolean; readonly geometrie?: boolean } = { objets: true, geometrie: true }): { a: Vec3; b: Vec3 }[] {
  const r: { a: Vec3; b: Vec3 }[] = [];
  const objets = quoi.objets !== false;
  const geometrie = quoi.geometrie !== false;
  const parcourir = (c: Contexte, M: Matrice4, toutMasque: boolean, profondeur: number): void => {
    if (profondeur > 32) return;
    const p = (s: Id): Vec3 => appliquer(M, (c.sommets[s] as Sommet).position);
    // Dans un objet masqué, toutes ses arêtes relèvent des « objets masqués » ; ailleurs, arêtes et faces masquées
    // une à une relèvent de la « géométrie masquée » (panneau Affichage, deux cases indépendantes).
    for (const a of Object.values(c.aretes)) if ((toutMasque && objets) || (!toutMasque && a.masquee && geometrie)) r.push({ a: p(a.a), b: p(a.b) });
    for (const f of Object.values(c.faces)) {
      if (toutMasque || !f.masquee || !geometrie) continue;
      for (const b of [f.exterieur, ...f.trous]) for (let i = 0; i < b.length; i++) r.push({ a: p(b[i] as Id), b: p(b[(i + 1) % b.length] as Id) });
    }
    for (const o of Object.values(c.occurrences)) {
      const d = m.definitions[o.definition];
      if (d) parcourir(d.contenu, composer(M, o.transformation), toutMasque || o.masquee === true, profondeur + 1);
    }
  };
  parcourir(m.racine, IDENTITE, false, 0);
  return r;
}

// ————————————————————————————————————————————————————————————— Pièces de profilé (lot L11)

/** Options de pose d'une pièce de profilé (lot L11). */
export interface OptionsPiece extends OptionsContexte {
  /** Désignation libre (« Montant », ligne de catalogue…) : nom du composant. */
  readonly designation: string;
  /** Provenance de la section : saisie, ou ligne d'un catalogue sourcé. */
  readonly source: SourceSection;
  /** Lien à l'arête source (défaut : oui) — à la racine de la Planche seulement, comme les liens d'extrusion. */
  readonly lier?: boolean;
}

/** Options de pose sur une chaîne d'arêtes : onglets aux sommets partagés (défaut : oui). */
export interface OptionsPiecesSurAretes extends OptionsPiece {
  readonly onglets?: boolean;
  /** (Lot L12) Arêtes colinéaires consécutives fusionnées en une seule pièce (non liée : elle couvre plusieurs arêtes). */
  readonly fusionner?: boolean;
}

/** Axe d'une pièce : une arête du contexte (liable) ou deux points. */
export type SegmentPiece = { readonly arete: Id } | { readonly a: Vec3; readonly b: Vec3 };

export interface ResultatPieces extends Resultat {
  readonly occurrences: readonly Id[];
}

export const ERREUR_PIECE_DESIGNATION = "Une pièce de profilé demande une désignation.";
export const ERREUR_PIECE_SOURCE = "Source de section invalide : « saisie », ou ligne de catalogue avec sa source et son édition.";
export const ERREUR_BOUCLE_NON_PLANE = "La boucle d'arêtes n'est pas plane : la position extérieur / intérieur n'a pas de sens.";
export const ERREUR_RECALCUL_PIECE = "La pièce ne peut plus être recalculée sur son arête (longueur nulle ou onglet impossible) : modification refusée.";

function validerPiece(section: SectionProfil, o: OptionsPiece): void {
  validerSection(section);
  if (typeof o.designation !== "string" || o.designation.trim() === "") throw new RangeError(ERREUR_PIECE_DESIGNATION);
  const s = o.source;
  if (!s || (s.genre !== "saisie" && !(s.genre === "catalogue" && typeof s.source === "string" && s.source.trim() !== "" && typeof s.edition === "string" && s.edition.trim() !== ""))) {
    throw new RangeError(ERREUR_PIECE_SOURCE);
  }
}

/** Empreinte (FNV-1a, deux moitiés) du contenu d'une pièce : toute édition de sa géométrie la change. */
function empreinteCtx(c: Ctx): string {
  // Tout ce qu'une édition peut changer : sommets, faces (boucles ordonnées — le sens compte —, normale, attributs) et
  // arêtes (extrémités, attributs). Une édition qui garde positions et nombres (retourner une face, adoucir ou masquer
  // une arête, changer une matière) change donc aussi l'empreinte, et rompt le lien.
  const P = (id: Id): string => {
    const q = c.sommets.get(id)?.position;
    return q ? `${q.x},${q.y},${q.z}` : "?";
  };
  const faces = [...c.faces.values()]
    .map((f) => `${[f.exterieur, ...f.trous].map((b) => b.map(P).join(">")).join("/")}^${f.normale.x},${f.normale.y},${f.normale.z}^${f.materiauRecto ?? ""}^${f.materiauVerso ?? ""}^${f.masquee ? 1 : 0}`)
    .sort();
  const aretes = [...c.aretes.values()].map((e) => `${[P(e.a), P(e.b)].sort().join("~")}^${e.adoucie ? 1 : 0}${e.masquee ? 1 : 0}`).sort();
  const texte = `${c.faces.size}|${c.aretes.size}|${[...c.sommets.values()].map((s) => `${s.position.x},${s.position.y},${s.position.z}`).sort().join(";")}|${faces.join(";")}|${aretes.join(";")}`;
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < texte.length; i++) {
    const k = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ k, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((k * 31 + (h1 & 0xff)) & 0xffff), 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

const memeMatrice = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x, i) => Math.abs(x - (b[i] as number)) <= 1e-12);

/** Géométrie d'une pièce en repère local, insérée dans un contenu neuf. */
function contenuPiece(t: Travail, meta: MetadonneesPiece, r: RepereDePiece, debut: BoutPiece, fin: BoutPiece): Ctx {
  const { parois, bouts } = prismePiece(sectionPosee(meta.section, meta.placement, meta.cote), r.longueur, debut, fin);
  const contenu: Ctx = { sommets: new Map(), aretes: new Map(), faces: new Map(), courbes: new Map(), occurrences: new Map() };
  insererBalayage(t, contenu, parois, bouts);
  return contenu;
}

/** Bout d'une pièce sur une chaîne : onglet (plan bissecteur, en local) ou allongement. */
function boutPiece(r: RepereDePiece, onglet: { avant: Vec3; apres: Vec3 } | null, decalage: number): BoutPiece {
  if (!onglet) return { genre: "droit", decalage };
  if (dot(normalize(onglet.avant), normalize(onglet.apres)) < Math.cos(Math.PI - (12 * Math.PI) / 180)) throw new RangeError(ERREUR_ONGLET_SINGULIER);
  return { genre: "onglet", normale: versLocal(r, normaleOnglet(onglet.avant, onglet.apres)) };
}

/** Coupe dérivée d'un bout en onglet : normale locale et angle avec la section droite. */
function coupeDe(b: BoutPiece): CoupePiece | undefined {
  if (b.genre !== "onglet") return undefined;
  const n = normalize(b.normale);
  return { normale: n, angle: (Math.acos(Math.min(1, Math.abs(n.x))) * 180) / Math.PI };
}
function coupesDe(debut: BoutPiece, fin: BoutPiece): { coupeDebut?: CoupePiece; coupeFin?: CoupePiece } {
  const cd = coupeDe(debut);
  const cf = coupeDe(fin);
  return { ...(cd ? { coupeDebut: cd } : {}), ...(cf ? { coupeFin: cf } : {}) };
}
/** Bouts d'une pièce relus de ses métadonnées : la coupe enregistrée, sinon l'allongement du placement. */
function boutsDeMeta(meta: MetadonneesPiece): { debut: BoutPiece; fin: BoutPiece } {
  return {
    debut: meta.coupeDebut ? { genre: "onglet", normale: meta.coupeDebut.normale } : { genre: "droit", decalage: meta.placement.decalageDebut },
    fin: meta.coupeFin ? { genre: "onglet", normale: meta.coupeFin.normale } : { genre: "droit", decalage: meta.placement.decalageFin },
  };
}

/** Pose une pièce : définition (composant) portant ses métadonnées, occurrence au repère de l'axe. */
function poserPieceInterne(t: Travail, c: Ctx, A: Vec3, B: Vec3, meta: Omit<MetadonneesPiece, "longueur">, ongletDebut: { avant: Vec3; apres: Vec3 } | null, ongletFin: { avant: Vec3; apres: Vec3 } | null, haut?: Vec3): { occ: Id; def: Id } {
  const r = repereSegment(A, B, haut);
  const debut = boutPiece(r, ongletDebut, meta.placement.decalageDebut);
  const fin = boutPiece(r, ongletFin, meta.placement.decalageFin);
  const complete: MetadonneesPiece = { ...meta, longueur: r.longueur, ...coupesDe(debut, fin) };
  const contenu = contenuPiece(t, complete, r, debut, fin);
  const def = t.id("d");
  t.definitions.set(def, { id: def, nom: meta.designation, genre: "composant", contenu, piece: complete });
  const occ = t.id("o");
  c.occurrences.set(occ, { id: occ, definition: def, transformation: matriceRepere(r) });
  return { occ, def };
}

function lierPiece(t: Travail, c: Ctx, occ: Id, arete: Id, a: Id, b: Id, ongletDebut?: { arete: Id; sommet: Id }, ongletFin?: { arete: Id; sommet: Id }, haut?: Vec3): void {
  const o = c.occurrences.get(occ) as Occurrence;
  const d = t.definitions.get(o.definition) as DefTravail;
  t.annotations.pieces[occ] = {
    id: occ,
    arete,
    a,
    b,
    posA: pos(c, a),
    posB: pos(c, b),
    ...(ongletDebut ? { ongletDebut: { ...ongletDebut, pos: pos(c, ongletDebut.sommet) } } : {}),
    ...(ongletFin ? { ongletFin: { ...ongletFin, pos: pos(c, ongletFin.sommet) } } : {}),
    definition: o.definition,
    transformation: o.transformation,
    empreinte: empreinteCtx(d.contenu),
    ...(haut ? { haut } : {}),
  };
  t.annotationsSales = true;
}

/**
 * Pièce de profilé (lot L11) : la section (contour 2D, trous compris) est balayée le long de l'axe — une arête ou deux
 * points — selon le placement (point de la section sur l'axe, rotation de 90°, décalages signés des extrémités). La
 * pièce est un composant dont la définition porte ses métadonnées (désignation, section, source, placement, longueur).
 * Posée sur une arête à la racine, elle lui est liée : elle suit l'arête tant qu'elle n'est pas modifiée elle-même.
 */
export function poserPiece(m: Modele, segment: SegmentPiece, section: SectionProfil, placement: PlacementPiece, o: OptionsPiece): ResultatGroupe {
  validerPiece(section, o);
  const r = operer(m, o.dans, (t, c) => {
    const meta = { designation: o.designation.trim(), section, source: o.source, placement };
    if (!("arete" in segment)) return poserPieceInterne(t, c, segment.a, segment.b, meta, null, null);
    const a = c.aretes.get(segment.arete);
    if (!a) throw new RangeError(`Arête inconnue : ${segment.arete}`);
    const res = poserPieceInterne(t, c, pos(c, a.a), pos(c, a.b), meta, null, null);
    if (o.lier !== false && o.dans === undefined) lierPiece(t, c, res.occ, a.id, a.a, a.b);
    return res;
  });
  return { modele: r.modele, rapport: r.rapport, occurrence: r.extra.occ, definition: r.extra.def };
}

/**
 * Pièces sur une chaîne d'arêtes continues (lot L11) : une pièce par arête, onglets aux sommets partagés (option, plans
 * bissecteurs comme Suivez-moi). Sur une boucle plane, la position centre / extérieur / intérieur place la section du
 * côté demandé (la hauteur suit alors la normale de la boucle, tournée vers +Z) ; une boucle non plane refuse extérieur
 * et intérieur.
 */
export function poserPiecesSurAretes(m: Modele, aretes: readonly Id[], section: SectionProfil, placement: PlacementPiece, o: OptionsPiecesSurAretes): ResultatPieces {
  validerPiece(section, o);
  const r = operer(m, o.dans, (t, c) => {
    const ch = chaineOrdonnee(c, aretes);
    const V = ch.sommets;
    const N = V.length;
    const nSeg = ch.ferme ? N : N - 1;
    const P = V.map((s) => pos(c, s));
    const ids = Array.from({ length: nSeg }, (_, i) => (areteEntre(c, V[i] as Id, V[(i + 1) % N] as Id) as Arete).id);
    let haut: Vec3 | undefined;
    let cote: -1 | 0 | 1 | undefined;
    const position = placement.position ?? "centre";
    if (ch.ferme) {
      const n = newell(P);
      if (len(n) > EPS) {
        const nn = normalize(n);
        const plane = P.every((p) => Math.abs(dot(nn, sub(p, P[0] as Vec3))) <= TOL);
        if (!plane && position !== "centre") throw new RangeError(ERREUR_BOUCLE_NON_PLANE);
        if (plane) {
          haut = nn.z < -1e-9 ? scale(nn, -1) : nn;
          // Boucle dans le sens direct autour de `haut` : l'intérieur est du côté +y de chaque pièce (y = haut × x).
          const direct = dot(haut, nn) > 0;
          cote = position === "centre" ? 0 : (position === "interieur") === direct ? 1 : -1;
        }
      }
    }
    const meta = { designation: o.designation.trim(), section, source: o.source, placement, ...(cote !== undefined ? { cote } : {}) };
    const onglets = o.onglets !== false;
    // Tronçons : une arête chacun, ou (fusion, lot L12) les arêtes colinéaires consécutives réunies — de V[debut] à V[fin].
    const dir = (i: number): Vec3 => sub(P[(i + 1) % N] as Vec3, P[i] as Vec3);
    const troncons: { debut: number; fin: number; aretes: number[] }[] = [];
    for (let i = 0; i < nSeg; i++) {
      const dernier = troncons[troncons.length - 1];
      if (o.fusionner && dernier && colineaires(dir(dernier.debut), dir(i), 1e-9) && dot(dir(dernier.debut), dir(i)) > 0) {
        dernier.fin = (i + 1) % N;
        dernier.aretes.push(i);
      } else troncons.push({ debut: i, fin: (i + 1) % N, aretes: [i] });
    }
    if (o.fusionner && ch.ferme && troncons.length > 1) {
      const premier = troncons[0] as (typeof troncons)[number];
      const dernier = troncons[troncons.length - 1] as (typeof troncons)[number];
      if (colineaires(dir(dernier.debut), dir(premier.debut), 1e-9) && dot(dir(dernier.debut), dir(premier.debut)) > 0) {
        troncons[0] = { debut: dernier.debut, fin: premier.fin, aretes: [...dernier.aretes, ...premier.aretes] };
        troncons.pop();
      }
    }
    const nT = troncons.length;
    const dT = (k: number): Vec3 => {
      const t0 = troncons[((k % nT) + nT) % nT] as (typeof troncons)[number];
      return sub(P[t0.fin] as Vec3, P[t0.debut] as Vec3);
    };
    const occs: Id[] = [];
    for (let k = 0; k < nT; k++) {
      const tr = troncons[k] as (typeof troncons)[number];
      const ferme = ch.ferme && nT > 1;
      const avecDebut = onglets && (ferme || k > 0);
      const avecFin = onglets && (ferme || k < nT - 1);
      const res = poserPieceInterne(t, c, P[tr.debut] as Vec3, P[tr.fin] as Vec3, meta, avecDebut ? { avant: dT(k - 1), apres: dT(k) } : null, avecFin ? { avant: dT(k), apres: dT(k + 1) } : null, haut);
      occs.push(res.occ);
      // Lien : seulement pour une pièce qui couvre une seule arête (ses voisines d'onglet sont les arêtes adjacentes).
      if (o.lier !== false && o.dans === undefined && tr.aretes.length === 1) {
        const i = tr.debut;
        const iPrec = (i - 1 + nSeg) % nSeg;
        const iSuiv = (i + 1) % nSeg;
        lierPiece(
          t,
          c,
          res.occ,
          ids[i] as Id,
          V[i] as Id,
          V[(i + 1) % N] as Id,
          avecDebut ? { arete: ids[iPrec] as Id, sommet: V[iPrec] as Id } : undefined,
          avecFin ? { arete: ids[iSuiv] as Id, sommet: V[(iSuiv + 1) % N] as Id } : undefined,
          haut,
        );
      }
    }
    return occs;
  });
  return { modele: r.modele, rapport: r.rapport, occurrences: r.extra };
}

/**
 * Pièces liées (lot L11) : après chaque opération, une pièce dont l'arête (ou une voisine d'onglet) a bougé est
 * recalculée — repère, longueur, onglets — depuis ses métadonnées ; une pièce modifiée elle-même (déplacée, éditée,
 * effacée), une arête disparue ou redécoupée rompent le lien. Si la forme change et que la définition est partagée,
 * l'occurrence liée est d'abord rendue unique : une copie qui n'est pas issue de cette arête ne change jamais.
 */
function actualiserPieces(t: Travail): void {
  const liens = t.annotations.pieces;
  if (Object.keys(liens).length === 0) return;
  const c = t.racine;
  const rompre = (id: Id): void => {
    delete liens[id];
    t.annotationsSales = true;
  };
  for (const L of Object.values(liens).sort((x, y) => numId(x.id) - numId(y.id))) {
    const occ = c.occurrences.get(L.id);
    const arete = c.aretes.get(L.arete);
    const def = occ ? t.definitions.get(occ.definition) : undefined;
    if (!occ || !arete || !def?.piece || occ.definition !== L.definition || !memeMatrice(occ.transformation, L.transformation) || empreinteCtx(def.contenu) !== L.empreinte) {
      rompre(L.id);
      continue;
    }
    if (!((arete.a === L.a && arete.b === L.b) || (arete.a === L.b && arete.b === L.a))) {
      rompre(L.id);
      continue;
    }
    const voisin = (v: LienPiece["ongletDebut"], bout: Id): Vec3 | null | undefined => {
      if (!v) return null;
      const e = c.aretes.get(v.arete);
      if (!e || !((e.a === v.sommet && e.b === bout) || (e.b === v.sommet && e.a === bout))) return undefined;
      return pos(c, v.sommet);
    };
    const QA = voisin(L.ongletDebut, L.a);
    const QB = voisin(L.ongletFin, L.b);
    if (QA === undefined || QB === undefined) {
      rompre(L.id);
      continue;
    }
    const A = pos(c, L.a);
    const B = pos(c, L.b);
    const immobile = egal(A, L.posA) && egal(B, L.posB) && (QA === null || egal(QA, (L.ongletDebut as { pos: Vec3 }).pos)) && (QB === null || egal(QB, (L.ongletFin as { pos: Vec3 }).pos));
    if (immobile) continue;
    const meta = def.piece;
    // Pièce de boucle : la normale de la boucle est recalculée depuis la chaîne source (voisines d'onglet), du même côté
    // que l'ancienne — une boucle restée plane mais basculée garde ses sections dans son plan et ses onglets jointifs.
    const haut = ((): Vec3 | undefined => {
      if (!L.haut) return undefined;
      const n0 = L.haut;
      let somme = v3(0, 0, 0);
      for (const n of [QA ? cross(sub(A, QA), sub(B, A)) : null, QB ? cross(sub(B, A), sub(QB, B)) : null]) {
        if (!n || len(n) < 1e-12) continue;
        const u = normalize(n);
        somme = add(somme, dot(u, n0) < 0 ? scale(u, -1) : u);
      }
      return len(somme) < 1e-9 ? n0 : normalize(somme);
    })();
    const calcul = (a: Vec3, b: Vec3, qa: Vec3 | null, qb: Vec3 | null, h: Vec3 | undefined = haut) => {
      const r = repereSegment(a, b, h);
      return {
        r,
        debut: boutPiece(r, qa ? { avant: sub(a, qa), apres: sub(b, a) } : null, meta.placement.decalageDebut),
        fin: boutPiece(r, qb ? { avant: sub(b, a), apres: sub(qb, b) } : null, meta.placement.decalageFin),
      };
    };
    let neuf: ReturnType<typeof calcul>;
    try {
      neuf = calcul(A, B, QA, QB);
    } catch {
      throw new RangeError(ERREUR_RECALCUL_PIECE);
    }
    const ancien = calcul(L.posA, L.posB, L.ongletDebut?.pos ?? null, L.ongletFin?.pos ?? null, L.haut);
    const memeBout = (x: BoutPiece, y: BoutPiece) => (x.genre === "droit" && y.genre === "droit") || (x.genre === "onglet" && y.genre === "onglet" && egal(x.normale, y.normale));
    const memeForme = Math.abs(neuf.r.longueur - meta.longueur) <= 1e-12 && memeBout(neuf.debut, ancien.debut) && memeBout(neuf.fin, ancien.fin);
    t.salir(c);
    let defId = occ.definition;
    if (!memeForme) {
      if (t.nombreOccurrences(defId) > 1) {
        t.rendreUnique(L.id);
        defId = (c.occurrences.get(L.id) as Occurrence).definition;
      }
      let contenu: Ctx;
      try {
        contenu = contenuPiece(t, meta, neuf.r, neuf.debut, neuf.fin);
      } catch {
        throw new RangeError(ERREUR_RECALCUL_PIECE);
      }
      const d = t.definitions.get(defId) as DefTravail;
      const { coupeDebut: _cd, coupeFin: _cf, ...sansCoupes } = meta;
      void _cd;
      void _cf;
      t.definitions.set(defId, { ...d, contenu, piece: { ...sansCoupes, longueur: neuf.r.longueur, ...coupesDe(neuf.debut, neuf.fin) } });
    }
    const transformation = matriceRepere(neuf.r);
    c.occurrences.set(L.id, { ...(c.occurrences.get(L.id) as Occurrence), transformation });
    liens[L.id] = {
      ...L,
      definition: defId,
      transformation,
      empreinte: empreinteCtx((t.definitions.get(defId) as DefTravail).contenu),
      ...(haut ? { haut } : {}),
      posA: A,
      posB: B,
      ...(L.ongletDebut && QA ? { ongletDebut: { ...L.ongletDebut, pos: QA } } : {}),
      ...(L.ongletFin && QB ? { ongletFin: { ...L.ongletFin, pos: QB } } : {}),
    };
    t.annotationsSales = true;
  }
}

/** Pièces liées du modèle (lot L11) : identifiant d'occurrence → arête source. */
export function piecesLiees(m: Modele): Readonly<Record<Id, LienPiece>> {
  return m.annotations?.pieces ?? {};
}

// ————————————————————————————————————————————————————————————— Assemblages de pièces (lot L13)

export const ERREUR_PAS_UNE_PIECE = "Choisissez une pièce de profilé (posée par Profilé ou Profilés depuis arêtes).";
export const ERREUR_ONGLET_MEME_PIECE = "Choisissez deux pièces différentes.";
export const ERREUR_ONGLET_PARALLELE = "Les deux pièces sont parallèles : elles ne se rejoignent pas, aucun onglet possible.";
export const ERREUR_ONGLET_GAUCHE = "Les axes des deux pièces ne se coupent pas (axes gauches) : onglet refusé.";
export const ERREUR_BOUT_ONGLET = "Extrémité coupée en onglet : l'allonger déplacerait la coupe — refaites l'onglet après.";
export const ERREUR_PIECE_RECOUPEE = "Pièce recoupée par un profil : sa géométrie ne se régénère plus depuis ses métadonnées.";

/** Axe d'une pièce dans son contexte : extrémités (x = 0 et x = longueur), direction, hauteur de son repère. */
function axePiece(occ: Occurrence, meta: MetadonneesPiece): { debut: Vec3; fin: Vec3; x: Vec3; haut: Vec3 } {
  const T = occ.transformation;
  const g = (i: number) => T[i] ?? 0;
  const O = v3(g(3), g(7), g(11));
  const x = normalize(v3(g(0), g(4), g(8)));
  return { debut: O, fin: add(O, scale(x, meta.longueur)), x, haut: normalize(v3(g(2), g(6), g(10))) };
}

/** Pièce du contexte : occurrence et définition portant des métadonnées de pièce, sinon erreur nommée. */
function pieceDe(t: Travail, c: Ctx, id: Id): { occ: Occurrence; def: DefTravail; meta: MetadonneesPiece } {
  const occ = c.occurrences.get(id);
  const def = occ ? t.definitions.get(occ.definition) : undefined;
  if (!occ || !def?.piece) throw new RangeError(ERREUR_PAS_UNE_PIECE);
  return { occ, def, meta: def.piece };
}

/**
 * Régénère une pièce de son contexte : nouveau contenu (rendue unique d'abord si sa définition est partagée), nouvelles
 * métadonnées, nouveau repère. Le lien à l'arête source est retiré (`garderLien` : instantané mis à jour).
 */
function regenererPiece(t: Travail, c: Ctx, id: Id, meta: MetadonneesPiece, r: RepereDePiece, debut: BoutPiece, fin: BoutPiece, garderLien = false): void {
  if (t.nombreOccurrences((c.occurrences.get(id) as Occurrence).definition) > 1) t.rendreUnique(id);
  const occ = c.occurrences.get(id) as Occurrence;
  const contenu = contenuPiece(t, meta, r, debut, fin);
  const { coupeDebut: _cd, coupeFin: _cf, ...base } = meta;
  void _cd;
  void _cf;
  const d = t.definitions.get(occ.definition) as DefTravail;
  t.definitions.set(occ.definition, { ...d, contenu, piece: { ...base, longueur: r.longueur, ...coupesDe(debut, fin) } });
  const transformation = matriceRepere(r);
  t.salir(c).occurrences.set(id, { ...occ, transformation });
  const lien = t.annotations.pieces[id];
  if (lien) {
    if (garderLien && t.racine === c) t.annotations.pieces[id] = { ...lien, definition: occ.definition, transformation, empreinte: empreinteCtx(contenu) };
    else delete t.annotations.pieces[id];
    t.annotationsSales = true;
  }
}

/**
 * Onglet (lot L13) : deux pièces dont les axes se coupent sont recoupées chacune par le plan bissecteur de leurs axes,
 * leurs extrémités voisines ramenées au point de rencontre. L'angle de coupe de chaque extrémité est enregistré en
 * métadonnée (dérivé). Axes parallèles ou gauches : refus nommé. Les liens aux arêtes sources sont retirés (la pièce
 * est modifiée elle-même).
 */
export function ongletPieces(m: Modele, a: Id, b: Id, o: OptionsContexte = {}): Resultat {
  if (a === b) throw new RangeError(ERREUR_ONGLET_MEME_PIECE);
  return operer(m, o.dans, (t, c) => {
    const A = pieceDe(t, c, a);
    const B = pieceDe(t, c, b);
    const xa = axePiece(A.occ, A.meta);
    const xb = axePiece(B.occ, B.meta);
    const n = cross(xa.x, xb.x);
    if (len(n) < 1e-9) throw new RangeError(ERREUR_ONGLET_PARALLELE);
    if (Math.abs(dot(normalize(n), sub(xb.debut, xa.debut))) > 1e-6) throw new RangeError(ERREUR_ONGLET_GAUCHE);
    // Point de rencontre des deux droites (coplanaires, non parallèles).
    const w = sub(xb.debut, xa.debut);
    const ta = dot(cross(w, xb.x), n) / dot(n, n);
    const P = add(xa.debut, scale(xa.x, ta));
    const proche = (ax: typeof xa) => (dist(P, ax.debut) <= dist(P, ax.fin) ? "debut" : "fin");
    const ba = proche(xa);
    const bb = proche(xb);
    const loinA = ba === "debut" ? xa.fin : xa.debut;
    const loinB = bb === "debut" ? xb.fin : xb.debut;
    const versP = sub(P, loinA);
    const depuisP = sub(loinB, P);
    const plan = boutPiece(repereSegment(loinA, P), { avant: versP, apres: depuisP }, 0); // contrôle de l'onglet singulier
    void plan;
    const nb = normaleOnglet(versP, depuisP);
    for (const [id, X, ax, bout] of [
      [a, A, xa, ba],
      [b, B, xb, bb],
    ] as const) {
      const debutPt = bout === "debut" ? P : ax.debut;
      const finPt = bout === "fin" ? P : ax.fin;
      const r = repereSegment(debutPt, finPt, ax.haut);
      const anciens = boutsDeMeta(X.meta);
      const coupe: BoutPiece = { genre: "onglet", normale: versLocal(r, nb) };
      regenererPiece(t, c, id, X.meta, r, bout === "debut" ? coupe : anciens.debut, bout === "fin" ? coupe : anciens.fin);
    }
  });
}

/**
 * Allonger / raccourcir une pièce (lot L13) : l'extrémité `bout` s'allonge de `valeur` (m, négatif = raccourcir) le long
 * de l'axe. Une extrémité coupée en onglet ou une pièce recoupée par un profil refusent ; le lien à l'arête source est
 * gardé (le décalage fait partie des métadonnées que la régénération relit).
 */
export function allongerPiece(m: Modele, piece: Id, bout: "debut" | "fin", valeur: number, o: OptionsContexte = {}): Resultat {
  if (!Number.isFinite(valeur) || Math.abs(valeur) < 1e-12) throw new RangeError("Allongement nul : rien à faire.");
  return operer(m, o.dans, (t, c) => {
    const X = pieceDe(t, c, piece);
    if (X.meta.coupesProfil) throw new RangeError(ERREUR_PIECE_RECOUPEE);
    if ((bout === "debut" ? X.meta.coupeDebut : X.meta.coupeFin) !== undefined) throw new RangeError(ERREUR_BOUT_ONGLET);
    const placement = bout === "debut" ? { ...X.meta.placement, decalageDebut: X.meta.placement.decalageDebut + valeur } : { ...X.meta.placement, decalageFin: X.meta.placement.decalageFin + valeur };
    const meta = { ...X.meta, placement };
    const ax = axePiece(X.occ, X.meta);
    const r = repereSegment(ax.debut, ax.fin, ax.haut);
    const bouts = boutsDeMeta(meta);
    regenererPiece(t, c, piece, meta, r, bouts.debut, bouts.fin, true);
  });
}

/** Demi-largeur et demi-hauteur de la section posée d'une pièce (rotation comprise), en m. */
export function demiSectionPiece(m: Modele, piece: Id, o: OptionsContexte = {}): { largeur: number; hauteur: number } {
  const c = contexte(m, o.dans);
  const occ = c.occurrences[piece];
  const meta = occ ? m.definitions[occ.definition]?.piece : undefined;
  if (!meta) throw new RangeError(ERREUR_PAS_UNE_PIECE);
  const s = sectionPosee(meta.section, meta.placement, meta.cote);
  const ys = s.exterieur.map((q) => q.y);
  const zs = s.exterieur.map((q) => q.z);
  return { largeur: (Math.max(...ys) - Math.min(...ys)) / 2, hauteur: (Math.max(...zs) - Math.min(...zs)) / 2 };
}

/**
 * Remplace le contenu d'une pièce par des faces polygonales (repère local) — coupe par profil (lot L13). La définition
 * est rendue unique si elle est partagée ; ses métadonnées sont gardées, `coupesProfil` incrémenté ; le lien à l'arête
 * source est retiré.
 */
export function remplacerContenuPiece(m: Modele, piece: Id, faces: FacesPolygonales, o: OptionsContexte & { readonly tolerance?: number } = {}): Resultat {
  const tol = o.tolerance ?? 1e-7;
  return operer(m, o.dans, (t, c) => {
    pieceDe(t, c, piece);
    if (t.nombreOccurrences((c.occurrences.get(piece) as Occurrence).definition) > 1) t.rendreUnique(piece);
    const occ = c.occurrences.get(piece) as Occurrence;
    const d = t.definitions.get(occ.definition) as DefTravail;
    const contenu: Ctx = { sommets: new Map(), aretes: new Map(), faces: new Map(), courbes: new Map(), occurrences: new Map() };
    const index = new Map<string, Id>();
    const sommet = (p: Vec3): Id => {
      const k = `${Math.round(p.x / tol)}|${Math.round(p.y / tol)}|${Math.round(p.z / tol)}`;
      let id = index.get(k);
      if (!id) {
        id = t.id("s");
        contenu.sommets.set(id, { id, position: p });
        index.set(k, id);
      }
      return id;
    };
    const aretes = new Set<string>();
    for (const boucles of faces) {
      const ids = boucles
        .map((b) => {
          const r: Id[] = [];
          for (const p of b) {
            const id = sommet(p);
            if (r[r.length - 1] !== id) r.push(id);
          }
          while (r.length > 1 && r[0] === r[r.length - 1]) r.pop();
          return r;
        })
        .filter((b) => b.length >= 3);
      const ext = ids[0];
      if (!ext) continue;
      for (const b of ids) {
        for (let j = 0; j < b.length; j++) {
          const u = b[j] as Id;
          const w = b[(j + 1) % b.length] as Id;
          const k = cle(u, w);
          if (aretes.has(k)) continue;
          aretes.add(k);
          const id = t.id("a");
          contenu.aretes.set(id, { id, a: u, b: w });
        }
      }
      const id = t.id("f");
      contenu.faces.set(id, { id, exterieur: ext, trous: ids.slice(1), normale: normalize(newell(ext.map((s) => (contenu.sommets.get(s) as Sommet).position))) });
    }
    const meta = d.piece as MetadonneesPiece;
    t.definitions.set(occ.definition, { ...d, contenu: t.salir(contenu), piece: { ...meta, coupesProfil: (meta.coupesProfil ?? 0) + 1 } });
    if (t.annotations.pieces[piece]) {
      delete t.annotations.pieces[piece];
      t.annotationsSales = true;
    }
  });
}

// ————————————————————————————————————————————————————————————— Repères et étiquettes des pièces (lot L14)

/**
 * Renumérotation des pièces (lot L14) : chaque occurrence reçoit son repère (un pas d'annulation). L'occurrence est
 * cherchée dans tous les contextes ; une occurrence d'un composant partagé porte le repère dans toutes ses copies.
 */
export function numeroterPieces(m: Modele, affectations: readonly { readonly occurrence: Id; readonly repere: string }[]): Resultat {
  return operer(m, undefined, (t) => {
    for (const { occurrence, repere } of affectations) {
      const { ctx, occ } = t.occurrence(occurrence);
      t.salir(ctx).occurrences.set(occurrence, { ...occ, repere });
    }
  });
}

/** Étiquettes de pièces (lot L14) : un texte à repère par pièce, au milieu de son axe, portant son repère. */
export function poserEtiquettesPieces(m: Modele, etiquettes: readonly { readonly occurrence: Id; readonly position: Vec3; readonly texte: string }[]): Resultat & { extra: Id[] } {
  return modifierAnnotations(m, (a, id) =>
    etiquettes.map((e) => {
      const t = id("t");
      a.textes[t] = { id: t, genre: "repere", ancre: e.position, entite: e.occurrence, position: add(e.position, v3(0, 0, 0.3)), texte: e.texte, etiquettePiece: true };
      return t;
    }),
  );
}

/** Efface ensemble toutes les étiquettes de pièces (lot L14) ; les autres textes restent. */
export function effacerEtiquettesPieces(m: Modele): Resultat {
  return modifierAnnotations(m, (a) => {
    for (const [id, tx] of Object.entries(a.textes)) if (tx.genre === "repere" && tx.etiquettePiece) delete a.textes[id];
  });
}

// ————————————————————————————————————————————————————————————— Édition des pièces (lot L17)

export const ERREUR_ECHELLE_PIECE = "Échelle d'une pièce de profilé : seulement le long de son axe (sa section vient d'une source, elle ne se déforme pas).";
export const ERREUR_ECHELLE_PIECE_COUPEE = "Pièce coupée en onglet ou par un profil : l'échelle changerait ses coupes — refaites-les après.";
export const ERREUR_ALIGNER_PARALLELE = "Faces non parallèles : l'alignement de face ne fait que translater la pièce le long de la normale de la face cible.";
export const ERREUR_PIECE_SECTION_RECOUPEE = "Pièce recoupée par un profil : sa section ne peut pas être changée (la coupe ne se rejoue pas).";

/** Échelle axiale d'une pièce : facteur le long de l'axe seulement ; extrémités et décalages mis à l'échelle. */
function echellePieceAxe(t: Travail, c: Ctx, id: Id, origine: Vec3, f: Vec3): void {
  const X = pieceDe(t, c, id);
  const ax = axePiece(X.occ, X.meta);
  const comp = [f.x, f.y, f.z];
  const axe = [ax.x.x, ax.x.y, ax.x.z];
  let facteur: number | null = null;
  for (let k = 0; k < 3; k++) {
    if (Math.abs((comp[k] as number) - 1) < 1e-12) continue;
    if (Math.abs(Math.abs(axe[k] as number) - 1) > 1e-9 || facteur !== null) throw new RangeError(ERREUR_ECHELLE_PIECE);
    facteur = comp[k] as number;
  }
  if (facteur === null) return;
  if (facteur <= 0) throw new RangeError(ERREUR_ECHELLE_PIECE);
  if (X.meta.coupeDebut || X.meta.coupeFin || X.meta.coupesProfil) throw new RangeError(ERREUR_ECHELLE_PIECE_COUPEE);
  const S = echelle(origine, f);
  const r = repereSegment(appliquer(S, ax.debut), appliquer(S, ax.fin), ax.haut);
  const placement = { ...X.meta.placement, decalageDebut: X.meta.placement.decalageDebut * facteur, decalageFin: X.meta.placement.decalageFin * facteur };
  const meta = { ...X.meta, placement };
  const b = boutsDeMeta(meta);
  regenererPiece(t, c, id, meta, r, b.debut, b.fin);
}

/**
 * Changer la section d'une pièce (lot L17) : la géométrie est régénérée depuis les métadonnées — même axe, même
 * longueur, mêmes coupes d'onglet (rejouées) ; la nouvelle source est enregistrée. Une pièce recoupée par un profil
 * refuse (la coupe ne se rejoue pas). Le lien à l'arête source est gardé. Un pas.
 */
export function changerSectionPiece(m: Modele, piece: Id, section: SectionProfil, source: SourceSection, designation: string, o: OptionsContexte = {}): Resultat {
  validerPiece(section, { designation, source });
  return operer(m, o.dans, (t, c) => {
    const X = pieceDe(t, c, piece);
    if (X.meta.coupesProfil) throw new RangeError(ERREUR_PIECE_SECTION_RECOUPEE);
    const meta: MetadonneesPiece = { ...X.meta, section, source, designation: designation.trim() };
    const ax = axePiece(X.occ, X.meta);
    const b = boutsDeMeta(meta);
    regenererPiece(t, c, piece, meta, repereSegment(ax.debut, ax.fin, ax.haut), b.debut, b.fin, true);
    const occ = c.occurrences.get(piece) as Occurrence;
    const d = t.definitions.get(occ.definition) as DefTravail;
    t.definitions.set(occ.definition, { ...d, nom: designation.trim() });
  });
}

/** Rotation axiale d'une pièce (lot L17) : la section tourne de `angle` (°) autour de l'axe ; lien gardé ; un pas. */
export function tournerPieceAxe(m: Modele, piece: Id, angle: number, o: OptionsContexte = {}): Resultat {
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-12) throw new RangeError("Angle de rotation nul : rien à faire.");
  return operer(m, o.dans, (t, c) => {
    const X = pieceDe(t, c, piece);
    if (X.meta.coupesProfil) throw new RangeError(ERREUR_PIECE_SECTION_RECOUPEE);
    const r0 = ((X.meta.placement.rotationAxe ?? 0) + angle) % 360;
    const meta: MetadonneesPiece = { ...X.meta, placement: { ...X.meta.placement, rotationAxe: Math.abs(r0) < 1e-12 ? 0 : r0 } };
    const ax = axePiece(X.occ, X.meta);
    const b = boutsDeMeta(meta);
    regenererPiece(t, c, piece, meta, repereSegment(ax.debut, ax.fin, ax.haut), b.debut, b.fin, true);
  });
}

/**
 * Aligner une face de pièce sur une face cible (lot L17) : la pièce est translatée le long de la normale de la face
 * cible jusqu'à ce que sa face soit coplanaire (faces parallèles, sens quelconque) ; sinon refus nommé. Les deux
 * faces sont données en coordonnées du contexte (point et normale). La pièce, déplacée, quitte son lien. Un pas.
 */
export function alignerFacePiece(m: Modele, piece: Id, facePiece: { readonly point: Vec3; readonly normale: Vec3 }, cible: { readonly point: Vec3; readonly normale: Vec3 }, o: OptionsContexte = {}): Resultat {
  const n = normalize(cible.normale);
  if (Math.abs(Math.abs(dot(normalize(facePiece.normale), n)) - 1) > 1e-9) throw new RangeError(ERREUR_ALIGNER_PARALLELE);
  const d = dot(sub(cible.point, facePiece.point), n);
  return operer(m, o.dans, (t, c) => {
    pieceDe(t, c, piece);
    if (Math.abs(d) < 1e-12) return;
    transformerSurPlace(t, c, [piece], translation(scale(n, d)));
  });
}

/** Axes des pièces du contexte (lot L17) : segments pour l'inférence « axe de pièce » (extrémités, milieu, sur l'axe). */
export function axesDesPieces(m: Modele, o: OptionsContexte = {}): { occurrence: Id; a: Vec3; b: Vec3 }[] {
  const c = contexte(m, o.dans);
  const r: { occurrence: Id; a: Vec3; b: Vec3 }[] = [];
  for (const occ of Object.values(c.occurrences)) {
    const meta = m.definitions[occ.definition]?.piece;
    if (!meta) continue;
    const ax = axePiece(occ, meta);
    r.push({ occurrence: occ.id, a: ax.debut, b: ax.fin });
  }
  return r;
}
