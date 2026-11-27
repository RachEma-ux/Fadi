/**
 * Références verrouillées (cas 4 du catalogue des extensions, lot C4, étape 3 : D10-F14-024, D10-F23a-011).
 *
 * Une référence est une maquette reçue (OBJ, STL, IFC triangulé) affichée dans la Planche sans être fusionnée au dessin :
 * le modèle ne garde que sa fiche (nom, format, fichier archivé en base avec son empreinte, unité, placement, version) ;
 * les triangles sont relus du fichier archivé à l'ouverture et dessinés d'un bloc, sans plafond de triangles du dessin.
 * Recharger une référence remplace son fichier (nouvelle version) en gardant son placement. Verrouillée, elle refuse
 * tout déplacement. Le contrôle de récolement mesure, pour chaque sommet du dessin, la distance à la référence (relevé
 * de récolement) et signale ceux qui dépassent la tolérance déclarée ; sans tolérance déclarée, rien n'est jugé.
 * Préfixe d'identifiant « u ».
 */
import type { Id, Modele } from "./geometrie-libre.js";
import { modifierAnnotations } from "./geometrie-libre.js";
import { maillagesPlanche } from "./representation.js";

export type FormatReference = "obj" | "stl" | "ifc";

/** Fichier archivé tel quel en base. */
export interface FichierReference {
  /** `sbxref_<uuid>`. */
  readonly id: string;
  /** SHA-256 hexadécimal. */
  readonly empreinte: string;
  /** Octets. */
  readonly taille: number;
}

export interface PlacementReference {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Radians, autour de la verticale, sens trigonométrique vu de dessus. */
  readonly rotation: number;
}

export interface Reference {
  readonly id: Id;
  readonly nom: string;
  readonly format: FormatReference;
  readonly fichier: FichierReference;
  /** Facteur de l'unité du fichier vers le mètre (lu dans l'IFC, choisi pour OBJ et STL). */
  readonly echelle: number;
  readonly placement: PlacementReference;
  readonly verrouille: boolean;
  readonly visible: boolean;
  readonly opacite: number;
  /** 1 à l'import, +1 à chaque rechargement. */
  readonly version: number;
  /** AAAA-MM-JJ du dernier chargement. */
  readonly chargeLe: string;
  /** Nombre de triangles lus au dernier chargement (information). */
  readonly triangles: number;
  /** Tolérance du récolement (m) ; null = non déclarée, rien n'est jugé. */
  readonly tolerance: number | null;
}

export const NOM_REFERENCE_MAX = 200;
export const REFERENCES_MAX = 32;
/** Tolérance déclarée : de 0,1 mm à 10 m. */
export const TOLERANCE_MIN = 0.0001;
export const TOLERANCE_MAX = 10;

export type ErreurReference = "absent" | "verrouille" | "fichier" | "echelle" | "position" | "opacite" | "tolerance" | "limite" | "date";
export type ResultatReference = { readonly ok: true; readonly modele: Modele; readonly id: Id } | { readonly ok: false; readonly erreur: ErreurReference };

const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const estDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const estFichierReference = (v: unknown): v is FichierReference =>
  estObjet(v) &&
  typeof v["id"] === "string" && /^sbxref_[0-9a-f-]{36}$/.test(v["id"]) &&
  typeof v["empreinte"] === "string" && /^[0-9a-f]{64}$/.test(v["empreinte"]) &&
  Number.isInteger(v["taille"]) && (v["taille"] as number) > 0;

export const estPlacementReference = (v: unknown): v is PlacementReference => estObjet(v) && fini(v["x"]) && fini(v["y"]) && fini(v["z"]) && fini(v["rotation"]);

const estTolerance = (v: unknown): v is number | null => v === null || (fini(v) && v >= TOLERANCE_MIN && v <= TOLERANCE_MAX);
const estEchelle = (v: unknown): v is number => fini(v) && v > 0 && v <= 1000;

/** Référence reçue (document, delta) : jamais crue sur parole. */
export function estReference(id: Id, v: unknown): v is Reference {
  if (!estObjet(v)) return false;
  return (
    v["id"] === id &&
    /^u[0-9a-z]+$/.test(id) &&
    typeof v["nom"] === "string" && (v["nom"] as string).length <= NOM_REFERENCE_MAX &&
    (v["format"] === "obj" || v["format"] === "stl" || v["format"] === "ifc") &&
    estFichierReference(v["fichier"]) &&
    estEchelle(v["echelle"]) &&
    estPlacementReference(v["placement"]) &&
    typeof v["verrouille"] === "boolean" &&
    typeof v["visible"] === "boolean" &&
    fini(v["opacite"]) && (v["opacite"] as number) >= 0.1 && (v["opacite"] as number) <= 1 &&
    Number.isInteger(v["version"]) && (v["version"] as number) >= 1 &&
    estDate(v["chargeLe"]) &&
    Number.isInteger(v["triangles"]) && (v["triangles"] as number) >= 0 &&
    estTolerance(v["tolerance"])
  );
}

export const referencesDe = (m: Modele): Reference[] => Object.values(m.annotations?.references ?? {}).sort((a, b) => a.id.localeCompare(b.id, "fr", { numeric: true }));

const modifierReference = (m: Modele, id: Id, fn: (r: Reference) => Reference | ErreurReference, verrouExige: boolean): ResultatReference => {
  const r = m.annotations?.references?.[id];
  if (!r) return { ok: false, erreur: "absent" };
  if (verrouExige && r.verrouille) return { ok: false, erreur: "verrouille" };
  const n = fn(r);
  if (typeof n === "string") return { ok: false, erreur: n };
  return { ok: true, modele: modifierAnnotations(m, (a) => void (a.references[id] = n)).modele, id };
};

/** Ajoute une référence (un pas) : verrouillée, visible, à l'origine du projet sauf placement donné. */
export function ajouterReference(m: Modele, v: { readonly nom: string; readonly format: FormatReference; readonly fichier: FichierReference; readonly echelle: number; readonly triangles: number; readonly date: string; readonly placement?: PlacementReference }): ResultatReference {
  if (!estFichierReference(v.fichier) || !Number.isInteger(v.triangles) || v.triangles < 0) return { ok: false, erreur: "fichier" };
  if (!estEchelle(v.echelle)) return { ok: false, erreur: "echelle" };
  if (v.placement !== undefined && !estPlacementReference(v.placement)) return { ok: false, erreur: "position" };
  if (!estDate(v.date)) return { ok: false, erreur: "date" };
  if (referencesDe(m).length >= REFERENCES_MAX) return { ok: false, erreur: "limite" };
  let id = "" as Id;
  const modele = modifierAnnotations(m, (a, nouvel) => {
    id = nouvel("u");
    a.references[id] = { id, nom: v.nom.trim().slice(0, NOM_REFERENCE_MAX), format: v.format, fichier: v.fichier, echelle: v.echelle, placement: v.placement ?? { x: 0, y: 0, z: 0, rotation: 0 }, verrouille: true, visible: true, opacite: 0.6, version: 1, chargeLe: v.date, triangles: v.triangles, tolerance: null };
  }).modele;
  return { ok: true, modele, id };
}

/**
 * Recharge une référence avec une nouvelle version de son fichier : placement, verrou, affichage et tolérance gardés.
 * Le même fichier (même empreinte) n'est pas une nouvelle version : refusé (« fichier »).
 */
export const rechargerReference = (m: Modele, id: Id, v: { readonly nom: string; readonly fichier: FichierReference; readonly echelle: number; readonly triangles: number; readonly date: string }): ResultatReference =>
  modifierReference(m, id, (r) => {
    if (!estFichierReference(v.fichier) || v.fichier.empreinte === r.fichier.empreinte || !Number.isInteger(v.triangles) || v.triangles < 0) return "fichier";
    if (!estEchelle(v.echelle)) return "echelle";
    if (!estDate(v.date)) return "date";
    return { ...r, nom: v.nom.trim().slice(0, NOM_REFERENCE_MAX) || r.nom, fichier: v.fichier, echelle: v.echelle, triangles: v.triangles, chargeLe: v.date, version: r.version + 1 };
  }, false);

export const deplacerReference = (m: Modele, id: Id, placement: PlacementReference): ResultatReference => modifierReference(m, id, (r) => (estPlacementReference(placement) ? { ...r, placement } : "position"), true);
export const verrouillerReference = (m: Modele, id: Id, verrouille: boolean): ResultatReference => modifierReference(m, id, (r) => ({ ...r, verrouille }), false);
export const afficherReference = (m: Modele, id: Id, visible: boolean): ResultatReference => modifierReference(m, id, (r) => ({ ...r, visible }), false);
export const reglerOpaciteReference = (m: Modele, id: Id, opacite: number): ResultatReference => modifierReference(m, id, (r) => (fini(opacite) && opacite >= 0.1 && opacite <= 1 ? { ...r, opacite } : "opacite"), false);
export const reglerTolerance = (m: Modele, id: Id, tolerance: number | null): ResultatReference => modifierReference(m, id, (r) => (estTolerance(tolerance) ? { ...r, tolerance } : "tolerance"), false);

export function supprimerReference(m: Modele, id: Id): ResultatReference {
  if (!m.annotations?.references?.[id]) return { ok: false, erreur: "absent" };
  return { ok: true, modele: modifierAnnotations(m, (a) => void delete a.references[id]).modele, id };
}

/** Point du fichier (unité du fichier) → point du projet (m) : échelle, rotation autour de la verticale, translation. */
export function versProjet(r: Pick<Reference, "echelle" | "placement">, x: number, y: number, z: number): [number, number, number] {
  const c = Math.cos(r.placement.rotation);
  const s = Math.sin(r.placement.rotation);
  const X = x * r.echelle;
  const Y = y * r.echelle;
  return [r.placement.x + c * X - s * Y, r.placement.y + s * X + c * Y, r.placement.z + z * r.echelle];
}

// --- Contrôle de récolement --------------------------------------------------------------------------------------------

/** Sommets du dessin à contrôler (monde, m) : sommets de la géométrie libre et des objets visibles, sans doublon (0,1 mm). */
export function sommetsDuDessin(m: Modele): [number, number, number][] {
  const vus = new Set<string>();
  const sortie: [number, number, number][] = [];
  const ajouter = (x: number, y: number, z: number): void => {
    const k = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    if (vus.has(k)) return;
    vus.add(k);
    sortie.push([x, y, z]);
  };
  for (const s of Object.values(m.racine.sommets)) ajouter(s.position.x, s.position.y, s.position.z);
  for (const mm of maillagesPlanche(m)) for (let i = 0; i + 2 < mm.positions.length; i += 3) ajouter(mm.positions[i]!, mm.positions[i + 1]!, mm.positions[i + 2]!);
  return sortie;
}

/** Triangles de la référence en coordonnées du projet (9 nombres par triangle), d'après ceux du fichier. */
export function trianglesAuProjet(r: Pick<Reference, "echelle" | "placement">, positions: ArrayLike<number>): Float64Array {
  const sortie = new Float64Array(positions.length - (positions.length % 3));
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const [x, y, z] = versProjet(r, positions[i]!, positions[i + 1]!, positions[i + 2]!);
    sortie[i] = x;
    sortie[i + 1] = y;
    sortie[i + 2] = z;
  }
  return sortie;
}

type V = readonly [number, number, number];

/** Distance d'un point à un triangle (Ericson, « Real-Time Collision Detection », 5.1.5). */
export function distancePointTriangle(p: V, a: V, b: V, c: V): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u: readonly number[], v: readonly number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
  const d = (q: readonly number[]) => Math.hypot(p[0] - q[0]!, p[1] - q[1]!, p[2] - q[2]!);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return d(a);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return d(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d1 / (d1 - d3);
    return d([a[0] + t * ab[0]!, a[1] + t * ab[1]!, a[2] + t * ab[2]!]);
  }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return d(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d2 / (d2 - d6);
    return d([a[0] + t * ac[0]!, a[1] + t * ac[1]!, a[2] + t * ac[2]!]);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const t = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return d([b[0] + t * (c[0] - b[0]), b[1] + t * (c[1] - b[1]), b[2] + t * (c[2] - b[2])]);
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den;
  const w = vc * den;
  return d([a[0] + ab[0]! * v + ac[0]! * w, a[1] + ab[1]! * v + ac[1]! * w, a[2] + ab[2]! * v + ac[2]! * w]);
}

export interface EcartRecolement {
  /** Indice du point contrôlé. */
  readonly point: number;
  /** Distance à la référence (m). */
  readonly ecart: number;
}

export interface ResultatRecolement {
  readonly points: number;
  /** Plus grand et moyen des écarts (m) ; null sans point ou sans triangle. */
  readonly max: number | null;
  readonly moyen: number | null;
  /** Points au-delà de la tolérance, du plus grand écart au plus petit ; null = tolérance non déclarée (rien n'est jugé). */
  readonly horsTolerance: readonly EcartRecolement[] | null;
}

/**
 * Écart de chaque point à la référence (triangles en coordonnées du projet, 9 nombres par triangle). Grille régulière :
 * chaque triangle est rangé dans les cellules de sa boîte, et la recherche s'élargit par anneaux jusqu'à ce que l'anneau
 * suivant ne puisse plus contenir de triangle plus proche (distance exacte, pas d'approximation).
 */
export function controlerRecolement(points: readonly V[], triangles: ArrayLike<number>, tolerance: number | null): ResultatRecolement {
  const nt = Math.floor(triangles.length / 9);
  if (points.length === 0 || nt === 0) return { points: points.length, max: null, moyen: null, horsTolerance: tolerance === null ? null : [] };
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nt * 9; i++) {
    const k = i % 3;
    const v = triangles[i]!;
    if (v < min[k]!) min[k] = v;
    if (v > max[k]!) max[k] = v;
  }
  const etendue = Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!, 1e-9);
  const n = Math.max(1, Math.min(64, Math.round(Math.cbrt(nt))));
  const cote = etendue / n;
  const cellule = (v: number, k: number) => Math.max(0, Math.min(n - 1, Math.floor((v - min[k]!) / cote)));
  const grille = new Map<number, number[]>();
  const cle = (i: number, j: number, k: number) => (i * n + j) * n + k;
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    const lo = [0, 1, 2].map((k) => cellule(Math.min(triangles[o + k]!, triangles[o + 3 + k]!, triangles[o + 6 + k]!), k));
    const hi = [0, 1, 2].map((k) => cellule(Math.max(triangles[o + k]!, triangles[o + 3 + k]!, triangles[o + 6 + k]!), k));
    for (let i = lo[0]!; i <= hi[0]!; i++) for (let j = lo[1]!; j <= hi[1]!; j++) for (let k = lo[2]!; k <= hi[2]!; k++) {
      const c = cle(i, j, k);
      const l = grille.get(c);
      if (l) l.push(t);
      else grille.set(c, [t]);
    }
  }
  const tri = (t: number): [V, V, V] => {
    const o = t * 9;
    return [[triangles[o]!, triangles[o + 1]!, triangles[o + 2]!], [triangles[o + 3]!, triangles[o + 4]!, triangles[o + 5]!], [triangles[o + 6]!, triangles[o + 7]!, triangles[o + 8]!]];
  };
  const ecarts: number[] = [];
  for (const p of points) {
    const c = [0, 1, 2].map((k) => Math.floor((p[k]! - min[k]!) / cote));
    // Point hors de la grille : les anneaux plus petits que `debut` n'ont aucune cellule.
    const debut = Math.max(0, ...c.map((x) => Math.max(-x, x - (n - 1))));
    let meilleur = Infinity;
    const vus = new Set<number>();
    for (let r = debut; r <= debut + n; r++) {
      // Tout triangle d'un anneau r est à au moins (r − 1)·cote du point.
      if (meilleur < Infinity && (r - 1) * cote > meilleur) break;
      const bornes = [0, 1, 2].map((q) => [Math.max(0, c[q]! - r), Math.min(n - 1, c[q]! + r)] as const);
      for (let i = bornes[0]![0]; i <= bornes[0]![1]; i++) for (let j = bornes[1]![0]; j <= bornes[1]![1]; j++) for (let k = bornes[2]![0]; k <= bornes[2]![1]; k++) {
        if (Math.max(Math.abs(i - c[0]!), Math.abs(j - c[1]!), Math.abs(k - c[2]!)) !== r) continue;
        for (const t of grille.get(cle(i, j, k)) ?? []) {
          if (vus.has(t)) continue;
          vus.add(t);
          const [a, b, cc] = tri(t);
          const d = distancePointTriangle(p, a, b, cc);
          if (d < meilleur) meilleur = d;
        }
      }
    }
    ecarts.push(meilleur);
  }
  const somme = ecarts.reduce((s, x) => s + x, 0);
  return {
    points: points.length,
    max: Math.max(...ecarts),
    moyen: somme / ecarts.length,
    horsTolerance: tolerance === null ? null : ecarts.map((ecart, point) => ({ point, ecart })).filter((x) => x.ecart > tolerance).sort((a, b) => b.ecart - a.ecart),
  };
}

/**
 * Triangles d'une maquette lue (unité du fichier), 9 nombres par triangle, triangles d'indice invalide ignorés. Rien
 * n'est fusionné : c'est la géométrie que la vue dessine d'un bloc.
 */
export function positionsReference(maillages: readonly { readonly positions: readonly number[]; readonly triangles: readonly number[] }[]): { readonly positions: Float32Array; readonly triangles: number } {
  let n = 0;
  for (const m of maillages) n += Math.floor(m.triangles.length / 3);
  const sortie = new Float32Array(n * 9);
  let k = 0;
  for (const m of maillages) {
    const s = m.positions.length / 3;
    for (let t = 0; t + 2 < m.triangles.length; t += 3) {
      const idx = [m.triangles[t]!, m.triangles[t + 1]!, m.triangles[t + 2]!];
      if (idx.some((i) => !Number.isInteger(i) || i < 0 || i >= s)) continue;
      for (const i of idx) {
        sortie[k++] = m.positions[i * 3]!;
        sortie[k++] = m.positions[i * 3 + 1]!;
        sortie[k++] = m.positions[i * 3 + 2]!;
      }
    }
  }
  return { positions: k === sortie.length ? sortie : sortie.slice(0, k), triangles: k / 9 };
}
