/**
 * Aides communes aux machines des outils de MODIFICATION (lot 3) : Pousser/Tirer, Déplacer, Rotation, Échelle,
 * Décalage, Suivez-moi, Retourner, Diviser. Aucune logique d'outil ici : visée d'un élément, conversion vers le
 * contexte d'édition, boîte englobante, formatage, verrous par flèches.
 */
import { type Contexte, type Id, type Modele, contexte } from "../geometrie-libre.js";
import { type Inference, type Verrou, geometrieVisible } from "../inference.js";
import { type ContexteSaisie } from "../saisie-vcb.js";
import { type Vec3, add, egal, sub, v3 } from "../vecteur.js";
import { APERCU_VIDE, type Apercu, etape } from "./commun-formes.js";
import type { ContexteOutil, Rayon, Touche, VueOutil } from "./machine.js";
import { type Cible, type ElementScene, cibleDans, scene, versContexteEdition, viser } from "./selection.js";

// ————————————————————————————————————————————————————————————— Catalogue

export const consigneDe = (id: string, i: number): string => etape(id, i).consigne ?? "";
export const libelleMesuresDe = (id: string, i: number): string => etape(id, i).libelleMesures ?? "Mesures";

// ————————————————————————————————————————————————————————————— Visée d'un élément

interface Viser {
  readonly rayon: Rayon;
  readonly tolerance: number;
}

/** Élément visé et ce qu'il représente dans le contexte d'édition (arête, face ou occurrence entière). */
export function viseeElement(ctx: ContexteOutil, ev: Viser): { el: ElementScene | null; cible: Cible | null } {
  const el = viser(ctx.modele, ev.rayon, ev.tolerance);
  return { el, cible: el ? cibleDans(el, ctx.dans) : null };
}

/** Ids de la sélection qui existent dans le contexte d'édition (la sélection de l'interface peut être périmée). */
export function selectionValide(ctx: ContexteOutil): Id[] {
  const c = contexte(ctx.modele, ctx.dans);
  return ctx.selection.filter((id) => c.aretes[id] || c.faces[id] || c.occurrences[id] || c.sommets[id] || c.courbes[id]);
}

/** Conversion monde → contexte d'édition : point, et vecteur appliqué en `origine`. */
export function enLocal(ctx: ContexteOutil): { point: (p: Vec3) => Vec3; vecteur: (origine: Vec3, v: Vec3) => Vec3 } {
  const L = versContexteEdition(ctx);
  return { point: L, vecteur: (o, v) => sub(L(add(o, v)), L(o)) };
}

/** Sommet du contexte d'édition situé en `p` (monde), s'il existe. */
export function sommetEn(ctx: ContexteOutil, p: Vec3): Id | undefined {
  const L = versContexteEdition(ctx);
  const q = L(p);
  return Object.values(contexte(ctx.modele, ctx.dans).sommets).find((s) => egal(s.position, q))?.id;
}

/** Ids créés par une opération que la sélection de l'interface sait surligner (arêtes, faces, occurrences). */
export const idsSelectionnables = (crees: readonly Id[]): Id[] => crees.filter((id) => /^[afo]/.test(id));

// ————————————————————————————————————————————————————————————— Boîte englobante

export interface Boite {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly centre: Vec3;
}

/** Points monde (extrémités d'arêtes, sommets de faces) des entités ou des occurrences sélectionnées. */
export function pointsDe(m: Modele, ids: readonly Id[]): Vec3[] {
  const set = new Set(ids);
  const r: Vec3[] = [];
  for (const el of scene(m)) {
    if (!set.has(el.id) && !el.chemin.some((x) => set.has(x))) continue;
    if (el.genre === "arete") r.push(el.a, el.b);
    else r.push(...el.exterieur);
  }
  return r;
}

export function boiteDe(points: readonly Vec3[]): Boite | null {
  if (points.length === 0) return null;
  let min = points[0] as Vec3;
  let max = points[0] as Vec3;
  for (const p of points) {
    min = v3(Math.min(min.x, p.x), Math.min(min.y, p.y), Math.min(min.z, p.z));
    max = v3(Math.max(max.x, p.x), Math.max(max.y, p.y), Math.max(max.z, p.z));
  }
  return { min, max, centre: v3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2) };
}

/** Les 12 arêtes de la boîte (polylignes de 2 points). */
export function filaireBoite(b: Boite): Vec3[][] {
  const c = (i: number, j: number, k: number): Vec3 => v3(i ? b.max.x : b.min.x, j ? b.max.y : b.min.y, k ? b.max.z : b.min.z);
  const r: Vec3[][] = [];
  for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) r.push([c(0, j, k), c(1, j, k)]);
  for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) r.push([c(i, 0, k), c(i, 1, k)]);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) r.push([c(i, j, 0), c(i, j, 1)]);
  return r;
}

// ————————————————————————————————————————————————————————————— Verrous par flèches

export const axeDeToucheFleche = (t: Touche): "x" | "y" | "z" | null =>
  t === "FlecheDroite" ? "x" : t === "FlecheGauche" ? "y" : t === "FlecheHaut" ? "z" : null;

export const VECTEUR_AXE: Readonly<Record<"x" | "y" | "z", Vec3>> = { x: v3(1, 0, 0), y: v3(0, 1, 0), z: v3(0, 0, 1) };

export interface VerrouFleche {
  readonly touche: Touche;
  readonly verrou: Verrou;
}

/** Dernière arête survolée (référence de ↓) tirée d'une inférence. */
export function reference(
  ancienne: { readonly a: Vec3; readonly b: Vec3 } | null,
  i: Inference,
  ctx: ContexteOutil,
): { readonly a: Vec3; readonly b: Vec3 } | null {
  if (i.entite === undefined || !["extremite", "milieu", "sur-arete"].includes(i.type)) return ancienne;
  const a = geometrieVisible(ctx.modele).aretes.find((x) => x.id === i.entite);
  return a ? { a: a.a, b: a.b } : ancienne;
}

// ————————————————————————————————————————————————————————————— Vue

export interface ArgsVue {
  readonly consigne: string;
  readonly mesures: VueOutil["mesures"];
  readonly inference?: Inference | null;
  readonly apercu?: Apercu;
  readonly ctx: ContexteOutil;
  readonly survol?: readonly string[];
  readonly selection?: readonly string[];
  readonly erreur?: string | null;
}

export function vueModif(a: ArgsVue): VueOutil {
  return {
    consigne: a.consigne,
    mesures: a.mesures,
    inference: a.inference ?? null,
    apercu: a.apercu ?? APERCU_VIDE,
    selection: a.selection ?? a.ctx.selection,
    survol: a.survol ?? [],
    erreur: a.erreur ?? null,
  };
}

export const saisieDe = (attendu: ContexteSaisie["attendu"], ctx: ContexteOutil): ContexteSaisie => ({ attendu, separateurDecimal: ctx.separateurDecimal, ...(ctx.repere ? { repere: ctx.repere } : {}) });

/** Contour d'un polygone (fermé) et segments reliant deux contours : aperçu d'une extrusion. */
export function apercuPrisme(contour: readonly Vec3[], dep: Vec3): Apercu {
  const haut = contour.map((p) => add(p, dep));
  const lignes: Vec3[][] = [[...haut, haut[0] as Vec3]];
  for (let i = 0; i < contour.length; i++) lignes.push([contour[i] as Vec3, haut[i] as Vec3]);
  return { lignes, faces: [haut] };
}

export type { Contexte };
