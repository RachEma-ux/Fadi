/**
 * Pièces de profilé (lot L11, programme D-202) — géométrie pure, sans modèle ni interface.
 *
 * Une **section** est un contour 2D (extérieur + trous) dans le repère local de la pièce : `y` = largeur, `z` = hauteur,
 * en mètres. Ce module ne connaît **aucune forme ni aucune dimension** de profilé : elles viennent de l'utilisateur ou
 * d'un catalogue sourcé (R3, D-180) ; un test de texte le vérifie.
 *
 * Repère d'une pièce : `x` le long de l'axe (de l'extrémité A vers B), `y` la largeur, `z` la hauteur. Le **placement**
 * dit quel point de la boîte de la section se pose sur l'axe (centre ou un des quatre coins), si la section est tournée
 * de 90° autour de l'axe, et de combien chaque extrémité est allongée (décalage signé). Sur une boucle d'arêtes, la
 * position centre / extérieur / intérieur règle le côté de la boucle où la section se place.
 */
import { type Vec3, add, cross, dot, len, normalize, scale, sub, v3 } from "./vecteur.js";

export interface PointSection {
  readonly y: number;
  readonly z: number;
}

export interface SectionProfil {
  readonly exterieur: readonly PointSection[];
  readonly trous: readonly (readonly PointSection[])[];
}

/** Provenance de la section : saisie par l'utilisateur, ou ligne d'un catalogue sourcé (D-180). */
export type SourceSection =
  | { readonly genre: "saisie" }
  | { readonly genre: "catalogue"; readonly source: string; readonly edition: string; readonly page?: string; readonly ligne?: string };

export type PointPlacement = "centre" | "haut-gauche" | "haut-droite" | "bas-droite" | "bas-gauche";
export type PositionBoucle = "centre" | "exterieur" | "interieur";

export interface PlacementPiece {
  readonly point: PointPlacement;
  /** Section tournée de 90° autour de l'axe (largeur et hauteur échangées). */
  readonly rotation90: boolean;
  /** Allongement signé de chaque extrémité (m) ; ignoré à une extrémité coupée en onglet. */
  readonly decalageDebut: number;
  readonly decalageFin: number;
  /** Sur une boucle d'arêtes : côté de la boucle (défaut « centre ») ; remplace la composante horizontale de `point`. */
  readonly position?: PositionBoucle;
}

export const PLACEMENT_DEFAUT: PlacementPiece = Object.freeze({ point: "centre", rotation90: false, decalageDebut: 0, decalageFin: 0 });

export const ERREUR_SECTION = "Section de profilé invalide : un contour fermé d'au moins trois points, d'aire non nulle.";
export const ERREUR_SEGMENT_NUL = "Arête de longueur nulle : aucune pièce ne peut y être posée.";
export const ERREUR_LONGUEUR = "Les décalages rendent la pièce de longueur nulle ou négative.";

const aire2 = (b: readonly PointSection[]): number => {
  let a = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i] as PointSection;
    const q = b[(i + 1) % b.length] as PointSection;
    a += p.y * q.z - q.y * p.z;
  }
  return a / 2;
};

/** Contrôle d'une section : chaque boucle fermée, finie, d'aire non nulle ; lance une erreur de domaine. */
export function validerSection(s: SectionProfil): void {
  for (const b of [s.exterieur, ...s.trous]) {
    if (!Array.isArray(b) || b.length < 3 || !b.every((p) => Number.isFinite(p.y) && Number.isFinite(p.z))) throw new RangeError(ERREUR_SECTION);
    if (Math.abs(aire2(b)) < 1e-12) throw new RangeError(ERREUR_SECTION);
  }
}

/** Aire nette de la section (contour moins trous), en m². */
export function aireSection(s: SectionProfil): number {
  return Math.abs(aire2(s.exterieur)) - s.trous.reduce((t, b) => t + Math.abs(aire2(b)), 0);
}

/**
 * Section posée : tournée de 90° si demandé, puis translatée pour que le point de placement soit sur l'axe (origine du
 * plan y z). `cote` (boucle) : +1 = section entièrement du côté +y, −1 = côté −y, 0 = centrée en largeur.
 */
export function sectionPosee(s: SectionProfil, p: PlacementPiece, cote?: -1 | 0 | 1): SectionProfil {
  const tourner = (q: PointSection): PointSection => (p.rotation90 ? { y: -q.z, z: q.y } : q);
  const ext = s.exterieur.map(tourner);
  const trous = s.trous.map((b) => b.map(tourner));
  const ys = ext.map((q) => q.y);
  const zs = ext.map((q) => q.z);
  const [y0, y1, z0, z1] = [Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)];
  const haut = p.point === "haut-gauche" || p.point === "haut-droite";
  const bas = p.point === "bas-gauche" || p.point === "bas-droite";
  const gauche = p.point === "haut-gauche" || p.point === "bas-gauche";
  const droite = p.point === "haut-droite" || p.point === "bas-droite";
  // Gauche / droite regardés depuis A vers B, la hauteur vers +z : la gauche est du côté +y.
  let ay = gauche ? y1 : droite ? y0 : (y0 + y1) / 2;
  if (cote === 1) ay = y0;
  if (cote === -1) ay = y1;
  if (cote === 0) ay = (y0 + y1) / 2;
  const az = haut ? z1 : bas ? z0 : (z0 + z1) / 2;
  const deplacer = (q: PointSection): PointSection => ({ y: q.y - ay, z: q.z - az });
  return { exterieur: ext.map(deplacer), trous: trous.map((b) => b.map(deplacer)) };
}

/** Repère d'une pièce (monde) : `x` de A vers B, `z` vers le haut (ou la normale de la boucle), `y = z × x`. */
export interface RepereDePiece {
  readonly origine: Vec3;
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
  readonly longueur: number;
}

export function repereSegment(A: Vec3, B: Vec3, haut: Vec3 = v3(0, 0, 1)): RepereDePiece {
  const d = sub(B, A);
  const L = len(d);
  if (L < 1e-9) throw new RangeError(ERREUR_SEGMENT_NUL);
  const x = scale(d, 1 / L);
  let h = normalize(haut);
  // Axe parallèle à la direction « haut » : la hauteur de la section suit alors l'axe Y du modèle.
  if (len(cross(h, x)) < 1e-6) h = Math.abs(x.y) <= Math.abs(x.x) ? v3(0, 1, 0) : v3(1, 0, 0);
  const y = normalize(cross(h, x));
  const z = cross(x, y);
  return { origine: A, x, y, z, longueur: L };
}

/** Matrice (lignes, 4 × 4) du repère local de la pièce vers le contexte. */
export function matriceRepere(r: RepereDePiece): number[] {
  return [r.x.x, r.y.x, r.z.x, r.origine.x, r.x.y, r.y.y, r.z.y, r.origine.y, r.x.z, r.y.z, r.z.z, r.origine.z, 0, 0, 0, 1];
}

/** Bout d'une pièce : allongement simple, ou coupe par un plan passant par l'extrémité (onglet), normale en local. */
export type BoutPiece = { readonly genre: "droit"; readonly decalage: number } | { readonly genre: "onglet"; readonly normale: Vec3 };

/**
 * Prisme d'une pièce en repère local : la section posée balayée de `x = début` à `x = longueur + fin`. Un bout en onglet
 * coupe chaque sommet de la section sur son plan (passant par l'extrémité de l'axe). Rend les parois (quadrilatères plans)
 * et les deux bouts (avec les trous), orientés vers l'extérieur de la matière.
 */
export function prismePiece(s: SectionProfil, longueur: number, debut: BoutPiece, fin: BoutPiece): { parois: Vec3[][]; bouts: { ext: Vec3[]; trous: Vec3[][] }[] } {
  const xBout = (b: BoutPiece, x0: number, q: PointSection, signe: -1 | 1): number => {
    if (b.genre === "droit") return x0 + signe * b.decalage;
    const n = b.normale;
    if (Math.abs(n.x) < 1e-9) throw new RangeError("Onglet impossible : le plan de coupe contient l'axe de la pièce.");
    return x0 - (q.y * n.y + q.z * n.z) / n.x;
  };
  const anneau = (b: readonly PointSection[], bout: BoutPiece, x0: number, signe: -1 | 1): Vec3[] => b.map((q) => v3(xBout(bout, x0, q, signe), q.y, q.z));
  // Trous d'enroulement opposé au contour (la section ne l'impose pas) : sinon leurs parois regarderaient la matière.
  const aire = (b: readonly PointSection[]): number => b.reduce((acc, q, i) => acc + q.y * (b[(i + 1) % b.length] as PointSection).z - (b[(i + 1) % b.length] as PointSection).y * q.z, 0);
  const sensExt = Math.sign(aire(s.exterieur));
  const boucles = [s.exterieur, ...s.trous.map((t) => (Math.sign(aire(t)) === sensExt ? [...t].reverse() : t))];
  const debuts = boucles.map((b) => anneau(b, debut, 0, -1));
  const fins = boucles.map((b) => anneau(b, fin, longueur, 1));
  for (let k = 0; k < boucles.length; k++) {
    for (let i = 0; i < (debuts[k] as Vec3[]).length; i++) {
      if ((fins[k] as Vec3[])[i]!.x - (debuts[k] as Vec3[])[i]!.x <= 1e-9) throw new RangeError(ERREUR_LONGUEUR);
    }
  }
  // Parois [Dᵢ, Dⱼ, Fⱼ, Fᵢ] et bouts (début retourné) ; l'orientation est décidée ensuite sur la coque extérieure (comme
  // Suivez-moi) : les trous, d'enroulement opposé, ont alors leurs parois tournées vers le vide.
  const paroisDe = (k: number): Vec3[][] => {
    const D = debuts[k] as Vec3[];
    const F = fins[k] as Vec3[];
    const n = D.length;
    return D.map((_, i) => [D[i] as Vec3, D[(i + 1) % n] as Vec3, F[(i + 1) % n] as Vec3, F[i] as Vec3]);
  };
  const ext = paroisDe(0);
  const bouts = [
    { ext: [...(debuts[0] as Vec3[])].reverse(), trous: debuts.slice(1).map((d) => [...d].reverse()) },
    { ext: [...(fins[0] as Vec3[])], trous: fins.slice(1).map((d) => [...d]) },
  ];
  let volume = 0;
  for (const p of [...ext, ...bouts.map((b) => b.ext)]) for (let i = 1; i + 1 < p.length; i++) volume += dot(p[0] as Vec3, cross(p[i] as Vec3, p[i + 1] as Vec3));
  const orienter = (p: Vec3[]): Vec3[] => (volume < 0 ? [...p].reverse() : p);
  const parois = [...ext, ...boucles.slice(1).flatMap((_, k) => paroisDe(k + 1))].map(orienter);
  return { parois, bouts: bouts.map((b) => ({ ext: orienter(b.ext), trous: b.trous.map(orienter) })) };
}

/** Normale (monde) du plan bissecteur entre deux directions consécutives d'une chaîne (onglet). */
export function normaleOnglet(dAvant: Vec3, dApres: Vec3): Vec3 {
  const b = add(normalize(dAvant), normalize(dApres));
  if (len(b) < 1e-9) throw new RangeError("La chaîne revient sur elle-même : onglet impossible.");
  return normalize(b);
}

/** Passage d'un vecteur monde au repère local de la pièce. */
export function versLocal(r: RepereDePiece, v: Vec3): Vec3 {
  return v3(dot(v, r.x), dot(v, r.y), dot(v, r.z));
}
