/**
 * Pousser / tirer interactif de la Planche 3D (geste à la SketchUp) : on survole une face, elle s'allume ; on la saisit
 * (glisser, ou clic puis clic) et elle suit le pointeur le long de sa normale, avec un aperçu du volume ajouté ou
 * retiré ; l'inférence accroche la face au plan d'une autre face parallèle (« sur la face … ») ou au sol, sinon la
 * distance avance au centimètre ; une distance tapée au clavier (« 1,20 », « 120 cm », « -0,5 ») est exacte ; un
 * double-clic répète la dernière distance. Le geste ne fait que produire **les commandes existantes** du modèle :
 *
 * - face d'un solide libre (boîte, prisme) → `studio.solide.face-decaler` (distance positive vers l'extérieur) ;
 * - face haute ou basse d'un objet 2D extrudé → `studio.objet.extruder` (base et hauteur recalculées, direction gardée) ;
 * - contour fermé à plat (rectangle, cercle, polyligne fermée) → `studio.objet.extruder` : tiré vers le haut, extrudé
 *   vers +Z ; poussé vers le bas, vers −Z — la direction est celle du geste, jamais une valeur par défaut.
 *
 * Le modèle reste seul juge (calque verrouillé, face qui franchirait la face opposée, prisme lié) ; les faces qu'il
 * refuserait d'avance (face latérale d'un prisme oblique ou lié) portent leur motif, affiché au survol. Repère `local-3d`
 * (z vers le haut, mètres). Pur : ni React, ni DOM, ni three.
 */
import {
  directionUnitaire, estDroit, estSolideLie, profilLocal, studioCotesExtrusion, studioSignedArea, studioVecteurSolide,
  type StudioCommand, type StudioDocument, type StudioFaceSolide, type StudioMesh3d, type StudioSolid,
} from "@parcours/atelier-model";
import { estSelectionnable } from "../planche2d/calques";
import { facesDe, type ResultatVolume } from "./volume-libre";

export interface P3 { x: number; y: number; z: number }

/** Ce que le geste modifie : une face de solide libre, la face haute ou basse d'un objet extrudé, un contour à plat. */
export type CiblePousser =
  | { genre: "solide"; id: string; face: StudioFaceSolide }
  | { genre: "objet"; id: string; face: "haut" | "bas" }
  | { genre: "contour"; id: string };

export interface FacePoussable {
  cible: CiblePousser;
  /** Contour de la face dans `local-3d`. */
  polygone: P3[];
  /** Normale unitaire sortante (sens d'une distance positive). */
  normale: P3;
  libelle: string;
  /** La face ne se pousse pas : pourquoi (affiché au survol, aucun geste envoyé). */
  refus?: string;
}

const plus = (a: P3, b: P3): P3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const moins = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const fois = (a: P3, k: number): P3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const scal = (a: P3, b: P3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const unitaire = (a: P3): P3 => { const l = Math.hypot(a.x, a.y, a.z); return l > 0 ? fois(a, 1 / l) : a; };
const HAUT: P3 = { x: 0, y: 0, z: 1 };
const BAS: P3 = { x: 0, y: 0, z: -1 };

/** Faces d'un solide libre, dans le repère du modèle (mêmes sommets que `studioPlanFace`). */
function facesSolide(s: StudioSolid): FacePoussable[] {
  const o = s.placement.origin, profil = profilLocal(s), u = directionUnitaire(s);
  const bas = profil.map((p) => plus(o, studioVecteurSolide(s.placement, { x: p.x, y: p.y, z: 0 })));
  const t = studioVecteurSolide(s.placement, fois(u, s.height));
  const haut = bas.map((p) => plus(p, t));
  const nz = studioVecteurSolide(s.placement, HAUT);
  const signe = u.z > 0 ? 1 : -1;
  const libelles = new Map(facesDe(s).map((f) => [f.valeur, f.libelle]));
  const lie = estSolideLie(s);
  const oblique = !estDroit(s);
  const out: FacePoussable[] = [
    { cible: { genre: "solide", id: s.id, face: "base" }, polygone: bas, normale: fois(nz, -signe), libelle: libelles.get("base")!,
      ...(lie && oblique ? { refus: "Base d’un prisme lié oblique : elle suit la polyligne source en plan (détachez-le d’abord)." } : {}) },
    { cible: { genre: "solide", id: s.id, face: "sommet" }, polygone: haut, normale: fois(nz, signe), libelle: libelles.get("sommet")! },
  ];
  // Normale extérieure d'une arête du profil (même règle que le modèle : à droite pour un profil trigonométrique).
  const sens = studioSignedArea(profil) > 0 ? 1 : -1;
  const n = profil.length;
  for (let i = 0; i < n; i++) {
    const a = profil[i]!, b = profil[(i + 1) % n]!, l = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(l > 0)) continue;
    const normale = unitaire(studioVecteurSolide(s.placement, { x: (sens * (b.y - a.y)) / l, y: (-sens * (b.x - a.x)) / l, z: 0 }));
    const face = `lateral-${i}` as StudioFaceSolide;
    const refus = s.type === "prism" && lie ? "Face latérale d’un prisme lié : modifiez la polyligne source, ou détachez le solide."
      : oblique ? "Face latérale d’un prisme oblique : elle n’est pas perpendiculaire au profil." : undefined;
    out.push({ cible: { genre: "solide", id: s.id, face }, polygone: [bas[i]!, bas[(i + 1) % n]!, haut[(i + 1) % n]!, haut[i]!], normale, libelle: libelles.get(face)!, ...(refus ? { refus } : {}) });
  }
  return out;
}

const FERMES = new Set(["rectangle", "circle", "polyline"]);

/**
 * Faces que le geste peut saisir dans le maillage affiché : faces des solides libres, faces haute et basse des objets
 * extrudés fermés, contours fermés à plat ; seulement sur un calque affiché et déverrouillé (comme la désignation).
 */
export function facesPoussables(doc: StudioDocument, mesh: StudioMesh3d): FacePoussable[] {
  const out: FacePoussable[] = [];
  const affiches = new Set((mesh.freeSolids ?? []).map((s) => s.id));
  for (const s of doc.solides ?? []) if (affiches.has(s.id) && estSelectionnable(doc, s.layerId)) out.push(...facesSolide(s));
  const objets = new Map(doc.objects.map((o) => [o.id, o]));
  for (const m of mesh.solids) {
    const o = objets.get(m.id);
    if (!o?.extrusion || m.kind !== "prism" || !estSelectionnable(doc, o.layerId)) continue;
    const n = m.vertices.length / 2;
    out.push({ cible: { genre: "objet", id: o.id, face: "haut" }, polygone: m.vertices.slice(n), normale: HAUT, libelle: "Face haute de l’objet extrudé" });
    out.push({ cible: { genre: "objet", id: o.id, face: "bas" }, polygone: m.vertices.slice(0, n), normale: BAS, libelle: "Face basse de l’objet extrudé" });
  }
  for (const c of mesh.outlines) {
    const o = objets.get(c.id);
    if (!o || !c.closed || !FERMES.has(o.type) || !estSelectionnable(doc, o.layerId) || c.points.length < 3) continue;
    out.push({ cible: { genre: "contour", id: o.id }, polygone: c.points, normale: HAUT, libelle: "Contour à plat, à extruder" });
  }
  return out;
}

export interface Rayon { origine: P3; direction: P3 }

/** Le point (dans le plan du polygone) est-il dans le polygone ? Projection sur le plan des deux plus grands axes. */
function dansPolygone(p: P3, poly: readonly P3[], n: P3): boolean {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  const [i, j] = az >= ax && az >= ay ? ["x", "y"] as const : ay >= ax ? ["x", "z"] as const : ["y", "z"] as const;
  let dedans = false;
  for (let k = 0, l = poly.length - 1; k < poly.length; l = k++) {
    const a = poly[k]!, b = poly[l]!;
    if ((a[j] > p[j]) !== (b[j] > p[j]) && p[i] < ((b[i] - a[i]) * (p[j] - a[j])) / (b[j] - a[j]) + a[i]) dedans = !dedans;
  }
  return dedans;
}

/** Face touchée la plus proche le long du rayon (distance `t` ≥ 0) ; null si aucune. */
export function toucherFace(faces: readonly FacePoussable[], r: Rayon): { face: FacePoussable; t: number; point: P3 } | null {
  let meilleur: { face: FacePoussable; t: number; point: P3 } | null = null;
  for (const f of faces) {
    const den = scal(f.normale, r.direction);
    if (Math.abs(den) < 1e-12) continue;
    const t = scal(f.normale, moins(f.polygone[0]!, r.origine)) / den;
    if (!(t >= 0) || (meilleur && t >= meilleur.t)) continue;
    const point = plus(r.origine, fois(r.direction, t));
    if (dansPolygone(point, f.polygone, f.normale)) meilleur = { face: f, t, point };
  }
  return meilleur;
}

/**
 * Position, le long de la droite (point + s · normale), la plus proche du rayon du pointeur ; null si le rayon est
 * presque parallèle à la normale (on regarde la face de face : seule la saisie au clavier vaut).
 */
export function positionSurNormale(r: Rayon, point: P3, normale: P3): number | null {
  const b = scal(normale, r.direction), c = scal(r.direction, r.direction);
  const w = moins(point, r.origine), d = scal(normale, w), e = scal(r.direction, w);
  const den = c - b * b; // |n| = 1
  if (den < 1e-6 * c) return null;
  return (b * e - c * d) / den;
}

export interface Inference { distance: number; reference: string | null }

/** Pas d'avance sans inférence (mètres) : le centimètre, comme le clic sur la grille de la vue 3D. */
export const PAS_POUSSER = 0.01;

/**
 * Inférence : la face déplacée de `d` s'accroche au plan d'une autre face parallèle (même sens ou sens opposé) ou au
 * sol (z = 0, face horizontale), si l'écart reste sous `tolerance` (mètres, dérivée de l'écran par la vue) ; sinon la
 * distance est arrondie au pas. Le plan de départ de la face n'accroche pas (distance nulle).
 */
export function inferer(face: FacePoussable, d: number, faces: readonly FacePoussable[], tolerance: number): Inference {
  const p = face.polygone[0]!, n = face.normale;
  let meilleur: Inference | null = null, ecart = tolerance;
  const essayer = (k: number, reference: string) => {
    if (Math.abs(k) < 1e-9) return;
    const e = Math.abs(k - d);
    if (e <= ecart) { ecart = e; meilleur = { distance: arrondi(k), reference }; }
  };
  for (const f of faces) {
    if (f === face || Math.abs(Math.abs(scal(f.normale, n)) - 1) > 1e-6) continue;
    essayer(scal(moins(f.polygone[0]!, p), n), `Sur le plan : ${f.libelle}`);
  }
  if (Math.abs(Math.abs(n.z) - 1) < 1e-6) essayer((0 - p.z) * n.z, "Sur le sol (z = 0)");
  return meilleur ?? { distance: arrondi(Math.round(d / PAS_POUSSER) * PAS_POUSSER), reference: null };
}
const arrondi = (v: number): number => { const r = Math.round(v * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };

/** Aperçu du geste : la face de départ et la face d'arrivée (même ordre de sommets). */
export function apercuPousser(face: FacePoussable, d: number): { depart: P3[]; arrivee: P3[] } {
  return { depart: face.polygone, arrivee: face.polygone.map((p) => plus(p, fois(face.normale, d))) };
}

/**
 * Distance tapée au clavier pendant le geste : nombre décimal (virgule ou point), signe facultatif, unité facultative
 * (m, cm, mm ; mètres par défaut, l'unité du document). Null si la saisie n'est pas une distance.
 */
export function lireDistanceSaisie(texte: string): number | null {
  const m = /^\s*([+-]?)\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*(mm|cm|m)?\s*$/i.exec(texte);
  if (!m) return null;
  const v = Number(m[2]!.replace(",", ".")) * ({ mm: 0.001, cm: 0.01, m: 1 }[(m[3] ?? "m").toLowerCase() as "m"] ?? 1);
  if (!Number.isFinite(v)) return null;
  return arrondi(m[1] === "-" ? -v : v);
}

/** Commandes du geste (commandes existantes du modèle), ou le refus à afficher. */
export function commandePousserTirer(doc: StudioDocument, face: FacePoussable, d: number): ResultatVolume {
  if (face.refus) return { erreur: face.refus };
  if (!Number.isFinite(d) || d === 0) return { erreur: "Déplacez la face, ou tapez une distance non nulle (positive : vers l’extérieur)." };
  const c = face.cible;
  if (c.genre === "solide") return { commandes: [{ toolId: "studio.solide.face-decaler", params: { id: c.id, face: c.face, distance: d } }] };
  const o = doc.objects.find((x) => x.id === c.id);
  if (!o) return { erreur: "Cet objet n’existe plus dans le document." };
  if (c.genre === "contour") {
    const commande: StudioCommand = { toolId: "studio.objet.extruder", params: { ids: [o.id], base: 0, height: Math.abs(d), direction: d > 0 ? "+z" : "-z" } };
    return { commandes: [commande] };
  }
  if (!o.extrusion) return { erreur: "Cet objet n’est plus extrudé." };
  const { zMin, zMax } = studioCotesExtrusion(o.extrusion);
  const bas = c.face === "bas" ? zMin - d : zMin, haut = c.face === "haut" ? zMax + d : zMax;
  if (!(haut - bas > 0)) return { erreur: "La face franchirait la face opposée : distance trop grande vers l’intérieur." };
  const direction = o.extrusion.direction ?? "+z";
  const thickness = "thickness" in o.extrusion && o.extrusion.thickness !== undefined ? { thickness: o.extrusion.thickness } : {};
  return { commandes: [{ toolId: "studio.objet.extruder", params: { ids: [o.id], base: arrondi(direction === "-z" ? haut : bas), height: arrondi(haut - bas), ...thickness, direction } }] };
}

/** Identifiant stable d'une face (survol, recette). */
export const cleFace = (c: CiblePousser): string => (c.genre === "contour" ? `contour:${c.id}` : `${c.genre}:${c.id}:${c.face}`);

/** Centre de la face (moyenne des sommets), pour les recettes qui projettent un geste à l'écran. */
export const centreFace = (f: FacePoussable): P3 => fois(f.polygone.reduce((s, p) => plus(s, p), { x: 0, y: 0, z: 0 }), 1 / f.polygone.length);
