import { studioRingSimple, studioSignedArea } from "../courbes.js";
import type { StudioPoint3 } from "../exporteurs/maillage.js";
import type { StudioPoint } from "../noyau/types.js";
import { angle, array, discriminator, fail, finite, identifier, layerRef, record, same } from "../noyau/validation.js";
import { id, layerId, number, positive } from "../registre/schemas-base.js";

/**
 * Solides libres de Studio (A.3-02) : volumes créés directement dans l'espace, sans dessin 2D préalable. Ils sont rangés
 * dans le tableau facultatif `solides` du document (jamais dans `objects`, qu'un lecteur 2D lit seul), dans le repère
 * déclaré `local-3d` (z vers le haut, mètres). Deux types :
 * - `box` : boîte de largeur (x local), profondeur (y local) et hauteur (z) saisies, coin inférieur à l'origine ;
 * - `prism` : prisme droit d'un profil fermé simple (coordonnées locales du plan), posé à la cote de l'origine.
 * Chaque solide porte son placement : origine (x, y, z) et rotation autour de z (radians, sens trigonométrique).
 *
 * Aucune signification BIM n'est acquise par la géométrie (A.3-09) : ni catégorie, ni matériau, ni classe IFC ne sont
 * déduits des dimensions ; un champ inconnu (`category`, `ifcClass`…) est refusé, jamais ignoré. Aucune valeur par
 * défaut n'est inventée : chaque dimension est saisie. Pur : ni React, ni DOM.
 */

export const STUDIO_FRAME_SOLIDES = "local-3d" as const;

/**
 * Bornes techniques (pas des valeurs métier) : dimension et coordonnée de profil de 10⁶ m au plus, origine de 10⁹ m au
 * plus en valeur absolue (les sommets placés restent finis), profil de 1 024 sommets au plus.
 */
export const STUDIO_LIMITES_SOLIDES = Object.freeze({ dimensionMax: 1e6, origineMax: 1e9, profilSommets: 1024 } as const);

export interface StudioPlacement3d {
  /** Origine du solide dans le repère `local-3d`. */
  origin: StudioPoint3;
  /** Rotation autour de +z, en radians dans [0 ; 2π[ (sens trigonométrique). */
  rotation: number;
}

export interface StudioBox {
  id: string;
  type: "box";
  layerId?: string;
  placement: StudioPlacement3d;
  /** Selon x local. */
  width: number;
  /** Selon y local. */
  depth: number;
  /** Selon z. */
  height: number;
}

export interface StudioProfilePrism {
  id: string;
  type: "prism";
  layerId?: string;
  placement: StudioPlacement3d;
  /** Profil fermé simple, coordonnées locales du plan (avant placement). */
  profile: StudioPoint[];
  height: number;
}

export type StudioSolid = StudioBox | StudioProfilePrism;

// ——— Schémas JSON (registre, document) ———

const point3 = { type: "object", additionalProperties: false, required: ["x", "y", "z"], properties: { x: number, y: number, z: number } } as const;
const placementSchema = {
  type: "object", additionalProperties: false, required: ["origin", "rotation"],
  properties: { origin: point3, rotation: { type: "number", minimum: 0, exclusiveMaximum: 2 * Math.PI } },
} as const;
const dimension = { ...positive, maximum: STUDIO_LIMITES_SOLIDES.dimensionMax } as const;
const point2 = { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: number, y: number } } as const;

export const SCHEMA_BOITE = {
  type: "object", additionalProperties: false, required: ["id", "type", "placement", "width", "depth", "height"],
  properties: { id, type: { const: "box" }, layerId, placement: placementSchema, width: dimension, depth: dimension, height: dimension },
} as const;
export const SCHEMA_PRISME = {
  type: "object", additionalProperties: false, required: ["id", "type", "placement", "profile", "height"],
  properties: {
    id, type: { const: "prism" }, layerId, placement: placementSchema,
    profile: { type: "array", minItems: 3, maxItems: STUDIO_LIMITES_SOLIDES.profilSommets, items: point2 }, height: dimension,
  },
} as const;
export const SCHEMA_SOLIDE = { oneOf: [SCHEMA_BOITE, SCHEMA_PRISME] } as const;

// ——— Validation ———

function borne(value: unknown, max: number, path: string): number {
  const v = finite(value, path);
  if (Math.abs(v) > max) fail(path, `valeur absolue de ${max === 1e9 ? "1 000 000 000" : "1 000 000"} m au plus`);
  return Object.is(v, -0) ? 0 : v;
}

function dimensionValue(value: unknown, path: string): number {
  const v = finite(value, path);
  if (v <= 0) fail(path, "dimension strictement positive attendue");
  if (v > STUDIO_LIMITES_SOLIDES.dimensionMax) fail(path, "dimension de 1 000 000 m au plus");
  return v;
}

export function validerPlacement(value: unknown, path: string): StudioPlacement3d {
  const p = record(value, ["origin", "rotation"], path);
  const o = record(p.origin, ["x", "y", "z"], `${path}.origin`);
  const max = STUDIO_LIMITES_SOLIDES.origineMax;
  return {
    origin: { x: borne(o.x, max, `${path}.origin.x`), y: borne(o.y, max, `${path}.origin.y`), z: borne(o.z, max, `${path}.origin.z`) },
    rotation: angle(p.rotation, `${path}.rotation`),
  };
}

function validerBoite(value: unknown, path: string): StudioBox {
  const o = record(value, ["id", "type", "placement", "width", "depth", "height"], path, ["layerId"]);
  return {
    id: identifier(o.id, `${path}.id`), type: "box", ...layerRef(o, path), placement: validerPlacement(o.placement, `${path}.placement`),
    width: dimensionValue(o.width, `${path}.width`), depth: dimensionValue(o.depth, `${path}.depth`), height: dimensionValue(o.height, `${path}.height`),
  };
}

function validerPrisme(value: unknown, path: string): StudioProfilePrism {
  const o = record(value, ["id", "type", "placement", "profile", "height"], path, ["layerId"]);
  const raw = array(o.profile, `${path}.profile`);
  if (raw.length < 3) fail(`${path}.profile`, "trois sommets au moins attendus");
  if (raw.length > STUDIO_LIMITES_SOLIDES.profilSommets) fail(`${path}.profile`, `${STUDIO_LIMITES_SOLIDES.profilSommets} sommets au plus`);
  const max = STUDIO_LIMITES_SOLIDES.dimensionMax;
  const profile = raw.map((p, i) => {
    const q = record(p, ["x", "y"], `${path}.profile[${i}]`);
    return { x: borne(q.x, max, `${path}.profile[${i}].x`), y: borne(q.y, max, `${path}.profile[${i}].y`) };
  });
  for (let i = 0; i < profile.length; i++) if (same(profile[i]!, profile[(i + 1) % profile.length]!)) fail(`${path}.profile[${(i + 1) % profile.length}]`, "sommets consécutifs confondus");
  if (!studioRingSimple(profile)) fail(`${path}.profile`, "profil fermé simple attendu (sans croisement, aire non nulle)");
  return {
    id: identifier(o.id, `${path}.id`), type: "prism", ...layerRef(o, path), placement: validerPlacement(o.placement, `${path}.placement`),
    profile, height: dimensionValue(o.height, `${path}.height`),
  };
}

const VALIDEURS: ReadonlyMap<unknown, (value: unknown, path: string) => StudioSolid> = new Map<unknown, (value: unknown, path: string) => StudioSolid>([
  ["box", validerBoite],
  ["prism", validerPrisme],
]);

/** Solide validé (copie canonique privée) ; un type inconnu est refusé, jamais ignoré. */
export function validerSolide(value: unknown, path: string): StudioSolid {
  const v = VALIDEURS.get(discriminator(value, path));
  if (!v) return fail(`${path}.type`, "type de solide non pris en charge");
  return v(value, path);
}

// ——— Géométrie (repère local du solide → local-3d, conversion explicite) ———

/** Profil local du solide (avant placement) : rectangle largeur × profondeur d'une boîte, profil d'un prisme. */
export function profilLocal(s: StudioSolid): StudioPoint[] {
  if (s.type === "box") return [{ x: 0, y: 0 }, { x: s.width, y: 0 }, { x: s.width, y: s.depth }, { x: 0, y: s.depth }];
  return s.profile.map((p) => ({ ...p }));
}

/**
 * Conversion explicite du repère local d'un solide vers `local-3d` : rotation autour de z puis translation par
 * l'origine. Les rotations nulles restent exactes (cos 0 = 1, sin 0 = 0).
 */
export function studioSolideVers3d(placement: StudioPlacement3d, p: StudioPoint, z = 0): StudioPoint3 {
  const c = Math.cos(placement.rotation), s = Math.sin(placement.rotation);
  return { x: placement.origin.x + c * p.x - s * p.y, y: placement.origin.y + s * p.x + c * p.y, z: placement.origin.z + z };
}

/** Emprise du solide dans le plan (x, y) du repère `local-3d`, profil placé. */
export function empriseSolide(s: StudioSolid): StudioPoint[] {
  return profilLocal(s).map((p) => {
    const q = studioSolideVers3d(s.placement, p);
    return { x: q.x, y: q.y };
  });
}

/** Cotes inférieure et supérieure du solide dans `local-3d`. */
export const cotesSolide = (s: StudioSolid): { zMin: number; zMax: number } => ({ zMin: s.placement.origin.z, zMax: s.placement.origin.z + s.height });

/** Aire du profil (m², valeur absolue). */
export const aireProfil = (s: StudioSolid): number => (s.type === "box" ? s.width * s.depth : Math.abs(studioSignedArea(s.profile)));
