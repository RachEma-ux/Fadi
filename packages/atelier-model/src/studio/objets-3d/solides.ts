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
 * Chaque solide porte son placement : origine (x, y, z), rotation autour de z (radians, sens trigonométrique) et,
 * facultatif (A.3-03), un basculement autour de ses axes horizontaux : `y` autour de l'axe y du solide (après la
 * rotation autour de z), puis `x` autour de l'axe x du solide ainsi incliné — orientation complète
 * Rz(rotation) · Ry(y) · Rx(x), appliquée au repère local autour de l'origine. Absent : aucun basculement (forme
 * canonique : jamais un basculement nul stocké).
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
  /** Basculement autour des axes horizontaux du solide (A.3-03), radians dans [0 ; 2π[, au moins un non nul. */
  basculement?: { x: number; y: number };
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

/**
 * Relation d'un prisme à la polyligne fermée dont son profil vient (lot F1, TEST-006 / A.4-02 / TR-EX-006), choisie
 * explicitement à la création, jamais déduite :
 * - `reference-liee` : le profil suit la source ; toute modification de la polyligne recalcule le prisme dans le même
 *   lot ; une source supprimée ou devenue invalide (ouverte, croisée) laisse le prisme « à résoudre » ;
 * - `associe` : le lien est gardé et contrôlé, mais rien n'est recalculé seul : une source modifiée, supprimée ou
 *   invalide laisse le prisme « à résoudre » jusqu'à sa mise à jour ou son détachement explicites
 *   (`studio.solide.resoudre`) ;
 * - `copie-independante` : le profil a été copié ; la source n'est qu'une provenance, aucune propagation.
 * Un prisme lié (`reference-liee`, `associe`) a son emprise en plan égale à la source : origine au premier sommet du
 * contour, profil relatif à lui, rotation nulle ; seules sa cote, sa hauteur et sa direction lui sont propres.
 */
export const STUDIO_RELATIONS_SOURCE = Object.freeze(["associe", "reference-liee", "copie-independante"] as const);
export type StudioRelationSource = (typeof STUDIO_RELATIONS_SOURCE)[number];
export interface StudioSourceSolide {
  /** Identifiant de la polyligne fermée source (`objects`). */
  objectId: string;
  relation: StudioRelationSource;
}

/**
 * État dérivé du lien d'un prisme à sa source (jamais stocké : relu du document à chaque lecture) :
 * `a-jour` (emprise égale à la source), `independant` (copie indépendante), `a-resoudre` avec son motif — la géométrie
 * affichée est alors la dernière connue et ses quantités ne sont pas évaluées.
 */
export type StudioMotifLien = "source-absente" | "source-invalide" | "source-modifiee";
export interface StudioLienSolide {
  objectId: string;
  relation: StudioRelationSource;
  etat: "a-jour" | "independant" | "a-resoudre";
  motif?: StudioMotifLien;
}

export interface StudioProfilePrism {
  id: string;
  type: "prism";
  layerId?: string;
  placement: StudioPlacement3d;
  /** Profil fermé simple, coordonnées locales du plan (avant placement). */
  profile: StudioPoint[];
  /** Longueur d'extrusion le long de `direction` (normale du plan : hauteur), strictement positive. */
  height: number;
  /**
   * Direction d'extrusion saisie (lot F1, TEST-005 / A.4-07), dans le repère local du solide (avant la rotation de
   * placement) : vecteur fini, non nul, de composante z non nulle (un vecteur dans le plan du profil donnerait un volume
   * nul). Seule sa direction compte (normalisée au calcul). Absente : +z, sens des documents antérieurs au lot F1.
   */
  direction?: StudioPoint3;
  /** Profil venu d'une polyligne, avec sa relation explicite (absente : profil saisi directement). */
  source?: StudioSourceSolide;
}

export type StudioSolid = StudioBox | StudioProfilePrism;

/** Face d'un solide libre : plan du profil, face d'arrivée, face latérale portée par l'arête i du profil (lot F1). */
export type StudioFaceSolide = "base" | "sommet" | `lateral-${number}`;

// ——— Schémas JSON (registre, document) ———

const point3 = { type: "object", additionalProperties: false, required: ["x", "y", "z"], properties: { x: number, y: number, z: number } } as const;
const angleSchema = { type: "number", minimum: 0, exclusiveMaximum: 2 * Math.PI } as const;
const placementSchema = {
  type: "object", additionalProperties: false, required: ["origin", "rotation"],
  properties: {
    origin: point3, rotation: angleSchema,
    basculement: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: angleSchema, y: angleSchema } },
  },
} as const;
const dimension = { ...positive, maximum: STUDIO_LIMITES_SOLIDES.dimensionMax } as const;
const point2 = { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: number, y: number } } as const;

export const SCHEMA_BOITE = {
  type: "object", additionalProperties: false, required: ["id", "type", "placement", "width", "depth", "height"],
  properties: { id, type: { const: "box" }, layerId, placement: placementSchema, width: dimension, depth: dimension, height: dimension },
} as const;
const sourceSchema = {
  type: "object", additionalProperties: false, required: ["objectId", "relation"],
  properties: { objectId: id, relation: { enum: [...STUDIO_RELATIONS_SOURCE] } },
} as const;
export const SCHEMA_PRISME = {
  type: "object", additionalProperties: false, required: ["id", "type", "placement", "profile", "height"],
  properties: {
    id, type: { const: "prism" }, layerId, placement: placementSchema,
    profile: { type: "array", minItems: 3, maxItems: STUDIO_LIMITES_SOLIDES.profilSommets, items: point2 }, height: dimension,
    direction: point3, source: sourceSchema,
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
  const p = record(value, ["origin", "rotation"], path, ["basculement"]);
  const o = record(p.origin, ["x", "y", "z"], `${path}.origin`);
  const max = STUDIO_LIMITES_SOLIDES.origineMax;
  let basculement: { x: number; y: number } | undefined;
  if (Object.hasOwn(p, "basculement")) {
    const b = record(p.basculement, ["x", "y"], `${path}.basculement`);
    basculement = { x: angle(b.x, `${path}.basculement.x`), y: angle(b.y, `${path}.basculement.y`) };
    if (basculement.x === 0 && basculement.y === 0) fail(`${path}.basculement`, "basculement nul : à omettre (forme canonique)");
  }
  return {
    origin: { x: borne(o.x, max, `${path}.origin.x`), y: borne(o.y, max, `${path}.origin.y`), z: borne(o.z, max, `${path}.origin.z`) },
    rotation: angle(p.rotation, `${path}.rotation`),
    ...(basculement ? { basculement } : {}),
  };
}

function validerBoite(value: unknown, path: string): StudioBox {
  const o = record(value, ["id", "type", "placement", "width", "depth", "height"], path, ["layerId"]);
  return {
    id: identifier(o.id, `${path}.id`), type: "box", ...layerRef(o, path), placement: validerPlacement(o.placement, `${path}.placement`),
    width: dimensionValue(o.width, `${path}.width`), depth: dimensionValue(o.depth, `${path}.depth`), height: dimensionValue(o.height, `${path}.height`),
  };
}

/** Direction saisie : vecteur fini, non nul, hors du plan du profil (z ≠ 0) ; bornée comme une dimension. */
export function validerDirection(value: unknown, path: string): StudioPoint3 {
  const d = record(value, ["x", "y", "z"], path);
  const max = STUDIO_LIMITES_SOLIDES.dimensionMax;
  const v = { x: borne(d.x, max, `${path}.x`), y: borne(d.y, max, `${path}.y`), z: borne(d.z, max, `${path}.z`) };
  if (v.x === 0 && v.y === 0 && v.z === 0) fail(path, "direction nulle : vecteur non nul attendu");
  if (v.z === 0) fail(`${path}.z`, "direction dans le plan du profil : le volume serait nul (composante z non nulle attendue)");
  return v;
}

function validerSource(value: unknown, path: string): StudioSourceSolide {
  const s = record(value, ["objectId", "relation"], path);
  if (typeof s.relation !== "string" || !(STUDIO_RELATIONS_SOURCE as readonly string[]).includes(s.relation)) fail(`${path}.relation`, "relation « associe », « reference-liee » ou « copie-independante » attendue");
  return { objectId: identifier(s.objectId, `${path}.objectId`), relation: s.relation as StudioRelationSource };
}

/** Le prisme suit-il sa source (relation `reference-liee` ou `associe`) ? */
export const estSolideLie = (s: StudioSolid): s is StudioProfilePrism & { source: StudioSourceSolide } =>
  s.type === "prism" && !!s.source && s.source.relation !== "copie-independante";

function validerPrisme(value: unknown, path: string): StudioProfilePrism {
  const o = record(value, ["id", "type", "placement", "profile", "height"], path, ["layerId", "direction", "source"]);
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
  const direction = Object.hasOwn(o, "direction") ? { direction: validerDirection(o.direction, `${path}.direction`) } : {};
  const source = Object.hasOwn(o, "source") ? { source: validerSource(o.source, `${path}.source`) } : {};
  const placement = validerPlacement(o.placement, `${path}.placement`);
  if (source.source && source.source.relation !== "copie-independante" && placement.rotation !== 0) fail(`${path}.placement.rotation`, "un prisme lié suit sa source en plan : rotation nulle attendue");
  if (source.source && source.source.relation !== "copie-independante" && placement.basculement) fail(`${path}.placement.basculement`, "un prisme lié suit sa source en plan : aucun basculement");
  return {
    id: identifier(o.id, `${path}.id`), type: "prism", ...layerRef(o, path), placement,
    profile, height: dimensionValue(o.height, `${path}.height`), ...direction, ...source,
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

/** Le solide est-il basculé autour d'un axe horizontal (A.3-03) ? */
export const estBascule = (s: { placement: StudioPlacement3d }): boolean => s.placement.basculement !== undefined;

/**
 * Vecteur du repère local du solide exprimé dans `local-3d` : Rz(rotation) · Ry(basculement.y) · Rx(basculement.x)
 * (sans basculement : la seule rotation autour de z, exacte pour une rotation nulle).
 */
export function studioVecteurSolide(placement: StudioPlacement3d, v: StudioPoint3): StudioPoint3 {
  let { x, y, z } = v;
  const b = placement.basculement;
  if (b) {
    if (b.x !== 0) { const c = Math.cos(b.x), s = Math.sin(b.x); [y, z] = [c * y - s * z, s * y + c * z]; }
    if (b.y !== 0) { const c = Math.cos(b.y), s = Math.sin(b.y); [x, z] = [c * x + s * z, -s * x + c * z]; }
  }
  if (placement.rotation === 0) return { x, y, z };
  const c = Math.cos(placement.rotation), s = Math.sin(placement.rotation);
  return { x: c * x - s * y, y: s * x + c * y, z };
}

/**
 * Basculement d'un point de `local-3d` calculé sans basculement (rotation autour de z seule) : il est ramené au repère
 * local (rotation inverse), basculé, puis replacé — rotation autour de l'origine du solide. Identité sans basculement.
 */
export function studioBasculerPoint(placement: StudioPlacement3d, p: StudioPoint3): StudioPoint3 {
  if (!placement.basculement) return p;
  const o = placement.origin, c = Math.cos(placement.rotation), s = Math.sin(placement.rotation);
  const d = { x: p.x - o.x, y: p.y - o.y, z: p.z - o.z };
  const local = { x: c * d.x + s * d.y, y: -s * d.x + c * d.y, z: d.z };
  const w = studioVecteurSolide(placement, local);
  return { x: o.x + w.x, y: o.y + w.y, z: o.z + w.z };
}

/** Emprise du solide dans le plan (x, y) du repère `local-3d`, profil placé. */
export function empriseSolide(s: StudioSolid): StudioPoint[] {
  return profilLocal(s).map((p) => {
    const q = studioSolideVers3d(s.placement, p);
    return { x: q.x, y: q.y };
  });
}

/** Direction unitaire d'extrusion dans le repère local du solide (+z pour une boîte ou sans direction saisie). */
export function directionUnitaire(s: StudioSolid): StudioPoint3 {
  if (s.type === "box" || !s.direction) return { x: 0, y: 0, z: 1 };
  const d = s.direction, n = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / n, y: d.y / n, z: d.z / n };
}

/** Le solide est-il un prisme droit (direction ±z) ? */
export const estDroit = (s: StudioSolid): boolean => { const u = directionUnitaire(s); return u.x === 0 && u.y === 0; };

/**
 * Translation de la face d'arrivée (sommet) par rapport au profil, dans `local-3d` : hauteur × direction unitaire, la
 * composante plane tournée de la rotation de placement. Nulle en plan pour un prisme droit.
 */
export function translationSommet(s: StudioSolid): StudioPoint3 {
  const u = directionUnitaire(s), h = s.height, c = Math.cos(s.placement.rotation), si = Math.sin(s.placement.rotation);
  const x = h * u.x, y = h * u.y;
  return { x: c * x - si * y, y: si * x + c * y, z: h * u.z };
}

/** Cotes inférieure et supérieure du solide dans `local-3d` (la direction peut descendre sous le profil). */
export const cotesSolide = (s: StudioSolid): { zMin: number; zMax: number } => {
  const z0 = s.placement.origin.z, z1 = z0 + translationSommet(s).z;
  return { zMin: Math.min(z0, z1), zMax: Math.max(z0, z1) };
};

/** Aire du profil (m², valeur absolue). */
export const aireProfil = (s: StudioSolid): number => (s.type === "box" ? s.width * s.depth : Math.abs(studioSignedArea(s.profile)));

/** Hauteur perpendiculaire au profil (m) : longueur × |composante z de la direction unitaire| (la longueur pour un prisme droit). */
export const hauteurPerpendiculaire = (s: StudioSolid): number => (estDroit(s) ? s.height : s.height * Math.abs(directionUnitaire(s).z));
