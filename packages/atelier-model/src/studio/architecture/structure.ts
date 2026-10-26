import { studioRingSimple, studioSignedArea } from "../courbes.js";
import { prism, type Geometrie3d } from "../exporteurs/maillage.js";
import type { StudioPoint } from "../noyau/types.js";
import { array, fail, finite, identifier, layerRef, point, record, same } from "../noyau/validation.js";
import type { StudioTransformation } from "../transformations.js";
import type { StudioBeam, StudioColumn, StudioSlab, StudioStructuralElement } from "./types.js";

/**
 * Éléments structurels typés (lot W3-B, X.1-04 ; REF-02 §18.2 S4 « structure ») : **poteau**, **poutre** et **dalle**.
 * Ils sont créés comme tels par l'utilisateur (`studio.structure.element`) et rangés dans `StudioDocument.architecture`
 * (extension additive) ; aucune signification n'est jamais acquise par une boîte ou un prisme libre (A.3-09).
 *
 * **Géométrie seulement** : ni vérification structurelle, ni matériau, ni masse, ni constante normative (aucune section,
 * hauteur, portée ou épaisseur par défaut, aucun catalogue de profils) ; toutes les dimensions sont **saisies**.
 * Géométrie dérivée, jamais stockée : emprise en plan (`local-2d`), prisme droit en volume (`local-3d`, z = cote), métré
 * des seules valeurs saisies. Pur : ni React, ni DOM.
 */

/** Borne technique (pas une valeur métier) : dimensions finies, loin de tout débordement flottant. */
const BORNE = 1e6;
/** Contour de dalle : borne technique de contrôle (simplicité du contour). */
export const STUDIO_LIMITES_STRUCTURE = Object.freeze({ contourSommets: 1024 } as const);

const net = (v: number) => (Object.is(v, -0) ? 0 : Math.abs(v) < 1e-15 ? 0 : v);
const pt = (x: number, y: number): StudioPoint => ({ x: net(x), y: net(y) });

function positif(value: unknown, path: string, nom: string): number {
  const v = finite(value, path);
  if (v <= 0) fail(path, `${nom} strictement positive attendue`);
  if (v > BORNE) fail(path, `${nom} de 1 000 000 m au plus`);
  return v;
}
function cote(value: unknown, path: string): number {
  const v = finite(value, path);
  if (Math.abs(v) > BORNE) fail(path, "cote de 1 000 000 m au plus en valeur absolue");
  return Object.is(v, -0) ? 0 : v;
}
/** Rattachement facultatif à un niveau : identifiant seulement (l'existence du niveau est contrôlée sur le document). */
export function niveauRef(o: Record<string, unknown>, path: string): { niveauId?: string } {
  return Object.hasOwn(o, "niveauId") ? { niveauId: identifier(o.niveauId, `${path}.niveauId`) } : {};
}

export function validerPoteau(value: unknown, path: string): StudioColumn {
  const o = record(value, ["id", "type", "position", "rotation", "width", "depth", "height", "base"], path, ["layerId", "niveauId"]);
  if (o.type !== "column") fail(`${path}.type`, "poteau attendu");
  const rotation = finite(o.rotation, `${path}.rotation`);
  if (rotation < 0 || rotation >= 2 * Math.PI) fail(`${path}.rotation`, "orientation dans [0 ; 2π[ attendue (radians)");
  const height = positif(o.height, `${path}.height`, "hauteur");
  const base = cote(o.base, `${path}.base`);
  return {
    id: identifier(o.id, `${path}.id`), type: "column", ...layerRef(o, path), ...niveauRef(o, path), position: point(o.position, `${path}.position`),
    rotation: Object.is(rotation, -0) ? 0 : rotation, width: positif(o.width, `${path}.width`, "largeur de section"), depth: positif(o.depth, `${path}.depth`, "profondeur de section"),
    height, base,
  };
}

export function validerPoutre(value: unknown, path: string): StudioBeam {
  const o = record(value, ["id", "type", "start", "end", "width", "height", "base"], path, ["layerId", "niveauId"]);
  if (o.type !== "beam") fail(`${path}.type`, "poutre attendue");
  const start = point(o.start, `${path}.start`), end = point(o.end, `${path}.end`);
  if (same(start, end)) fail(`${path}.end`, "axe de poutre de longueur nulle (deux points distincts attendus)");
  return {
    id: identifier(o.id, `${path}.id`), type: "beam", ...layerRef(o, path), ...niveauRef(o, path), start, end,
    width: positif(o.width, `${path}.width`, "largeur de section"), height: positif(o.height, `${path}.height`, "hauteur de section"), base: cote(o.base, `${path}.base`),
  };
}

export function validerDalle(value: unknown, path: string): StudioSlab {
  const o = record(value, ["id", "type", "contour", "thickness", "base"], path, ["layerId", "niveauId"]);
  if (o.type !== "slab") fail(`${path}.type`, "dalle attendue");
  const raw = array(o.contour, `${path}.contour`);
  if (raw.length < 3) fail(`${path}.contour`, "trois sommets au moins attendus");
  if (raw.length > STUDIO_LIMITES_STRUCTURE.contourSommets) fail(`${path}.contour`, `${STUDIO_LIMITES_STRUCTURE.contourSommets} sommets au plus (borne technique de contrôle)`);
  const contour = raw.map((p, i) => point(p, `${path}.contour[${i}]`));
  for (const [i, p] of contour.entries()) if (Math.abs(p.x) > BORNE || Math.abs(p.y) > BORNE) fail(`${path}.contour[${i}]`, "coordonnée de 1 000 000 m au plus en valeur absolue");
  for (let i = 0; i < contour.length; i++) if (same(contour[i]!, contour[(i + 1) % contour.length]!)) fail(`${path}.contour[${(i + 1) % contour.length}]`, "sommets consécutifs confondus");
  if (!studioRingSimple(contour)) fail(`${path}.contour`, "contour fermé simple attendu (sans croisement, aire non nulle)");
  return {
    id: identifier(o.id, `${path}.id`), type: "slab", ...layerRef(o, path), ...niveauRef(o, path), contour,
    thickness: positif(o.thickness, `${path}.thickness`, "épaisseur"), base: cote(o.base, `${path}.base`),
  };
}

// ——— Géométrie dérivée ———

/** Rectangle centré en `c`, demi-côtés `a` selon `u` et `b` selon la normale à gauche de `u`, sens trigonométrique. */
function rectangle(c: StudioPoint, u: StudioPoint, a: number, b: number): StudioPoint[] {
  const n = { x: -u.y, y: u.x };
  return [
    pt(c.x - a * u.x - b * n.x, c.y - a * u.y - b * n.y), pt(c.x + a * u.x - b * n.x, c.y + a * u.y - b * n.y),
    pt(c.x + a * u.x + b * n.x, c.y + a * u.y + b * n.y), pt(c.x - a * u.x + b * n.x, c.y - a * u.y + b * n.y),
  ];
}

/** Direction unitaire et longueur de l'axe d'une poutre. */
export function axePoutre(b: StudioBeam): { u: StudioPoint; longueur: number } {
  const dx = b.end.x - b.start.x, dy = b.end.y - b.start.y, longueur = Math.hypot(dx, dy);
  return { u: { x: dx / longueur, y: dy / longueur }, longueur };
}

/** Emprise en plan (contour fermé, sens trigonométrique pour un poteau et une poutre). */
export function empriseStructurelle(e: StudioStructuralElement): StudioPoint[] {
  if (e.type === "column") return rectangle(e.position, { x: Math.cos(e.rotation), y: Math.sin(e.rotation) }, e.width / 2, e.depth / 2);
  if (e.type === "beam") {
    const { u, longueur } = axePoutre(e);
    return rectangle({ x: (e.start.x + e.end.x) / 2, y: (e.start.y + e.end.y) / 2 }, u, longueur / 2, e.width / 2);
  }
  return e.contour.map((p) => ({ ...p }));
}

/** Cotes inférieure et supérieure (m, `local-3d`). */
export function cotesStructurelles(e: StudioStructuralElement): { zMin: number; zMax: number } {
  const h = e.type === "slab" ? e.thickness : e.height;
  return { zMin: e.base, zMax: e.base + h };
}

/** Volume dérivé : prisme droit sur l'emprise, repère `local-3d`. */
export function volumeStructurel(e: StudioStructuralElement): Geometrie3d {
  const { zMin, zMax } = cotesStructurelles(e);
  return prism(empriseStructurelle(e), zMin, zMax, e.type !== "slab");
}

/** Métré d'un élément structurel, des seules valeurs saisies, sans arrondi (aucune masse, aucun matériau). */
export interface MetreStructurel {
  /** Poteau : hauteur ; poutre : hauteur de section ; dalle : épaisseur (m). */
  hauteur: number;
  /** Poutre : longueur de l'axe (m) ; absente sinon. */
  longueur?: number;
  /** Dalle : aire du contour (m²) et périmètre (m). */
  surface?: number;
  perimetre?: number;
  /** Section (m²) d'un poteau ou d'une poutre. */
  section?: number;
  volume: number;
}

export function metreStructurel(e: StudioStructuralElement): MetreStructurel {
  if (e.type === "column") { const section = e.width * e.depth; return { hauteur: e.height, section, volume: section * e.height }; }
  if (e.type === "beam") { const { longueur } = axePoutre(e), section = e.width * e.height; return { hauteur: e.height, longueur, section, volume: section * longueur }; }
  const surface = Math.abs(studioSignedArea(e.contour));
  let perimetre = 0;
  for (let i = 0; i < e.contour.length; i++) { const a = e.contour[i]!, b = e.contour[(i + 1) % e.contour.length]!; perimetre += Math.hypot(b.x - a.x, b.y - a.y); }
  return { hauteur: e.thickness, surface, perimetre, volume: surface * e.thickness };
}

// ——— Transformations (Copier, Rotation, Symétrie, Échelle) ———

const pur = (v: number) => (Object.is(v, -0) ? 0 : v);
function angleNormalise(a: number): number {
  const deuxPi = 2 * Math.PI;
  let r = a % deuxPi;
  if (r < 0) r += deuxPi;
  if (r >= deuxPi || Math.abs(r) < 1e-15) r = 0;
  return pur(r);
}

/**
 * Image d'un élément structurel par une similitude : les points suivent la transformation ; les longueurs en plan
 * (section d'un poteau, largeur d'une poutre) sont multipliées par le facteur ; les grandeurs verticales (hauteur, base,
 * épaisseur) ne changent qu'avec l'échelle « volumes aussi », comme une extrusion. Une symétrie renverse l'ordre du
 * contour d'une dalle (orientation gardée). Non revalidé ici.
 */
export function transformerStructurel<T extends StudioStructuralElement>(e: T, t: StudioTransformation, id: string = e.id): T {
  const k = t.volumes ? t.facteur : 1;
  if (e.type === "column") return { ...e, id, position: t.point(e.position), rotation: angleNormalise(t.angle(e.rotation)), width: e.width * t.facteur, depth: e.depth * t.facteur, height: e.height * k, base: pur(e.base * k) } as T;
  if (e.type === "beam") return { ...e, id, start: t.point(e.start), end: t.point(e.end), width: e.width * t.facteur, height: e.height * k, base: pur(e.base * k) } as T;
  const contour = e.contour.map(t.point);
  return { ...e, id, contour: t.miroir ? contour.reverse() : contour, thickness: e.thickness * k, base: pur(e.base * k) } as T;
}
