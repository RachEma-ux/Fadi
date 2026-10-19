import type { StudioPoint3 } from "../exporteurs/maillage.js";
import { STUDIO_DEFAULT_LAYER_ID } from "../noyau/limites.js";
import { array, discriminator, fail, finite, identifier, record } from "../noyau/validation.js";
import { id, number } from "../registre/schemas-base.js";

/**
 * Visualisation de Studio (lot E.5) : scènes enregistrées et apparences d'affichage, rangées dans la liste facultative
 * `scenes` du document (extension additive ; absente ou vide : aucune, forme canonique). Deux types d'éléments :
 * - `scene` : nom, caméra (position, cible, perspective avec champ de vision ou orthographique avec hauteur vue),
 *   calques visibles et mode d'affichage. Repère **déclaré** `local-3d` (z vers le haut, mètres), jamais mélangé au
 *   `local-2d` du dessin : la caméra est convertie explicitement par la vue 3D ;
 * - `appearance` : couleur (et finition) **d'affichage** d'un calque ou d'un objet. Réglage de visualisation seulement :
 *   il ne change ni la géométrie, ni les quantités, ni les données constructives de l'IFC (contrôlé par test) ; ce
 *   n'est pas un matériau constructif.
 * Les identifiants des éléments de visualisation forment leur propre espace (uniques dans la liste). Aucune valeur par
 * défaut n'est inventée : chaque champ est saisi ou relevé de la vue. Pur : ni React, ni DOM.
 */

export const STUDIO_FRAME_SCENES = "local-3d" as const;
export const STUDIO_PROJECTIONS_SCENE = Object.freeze(["perspective", "orthographic"] as const);
export type StudioProjectionScene = (typeof STUDIO_PROJECTIONS_SCENE)[number];
/** Modes d'affichage : surfaces ombrées, surfaces et arêtes, arêtes seules. */
export const STUDIO_MODES_AFFICHAGE = Object.freeze(["shaded", "shaded-edges", "wireframe"] as const);
export type StudioModeAffichage = (typeof STUDIO_MODES_AFFICHAGE)[number];
/** Finitions d'affichage (rendu à l'écran seulement, jamais un matériau constructif). */
export const STUDIO_FINITIONS_AFFICHAGE = Object.freeze(["matte", "satin", "gloss", "glass"] as const);
export type StudioFinitionAffichage = (typeof STUDIO_FINITIONS_AFFICHAGE)[number];

/**
 * Bornes techniques (pas des valeurs métier) : 200 scènes et 2 000 apparences au plus, nom de 80 caractères, coordonnée
 * de caméra de 10⁹ m au plus en valeur absolue, hauteur vue orthographique de 10⁹ m au plus, champ de vision dans
 * ]0 ; 180[ degrés.
 */
export const STUDIO_LIMITES_SCENES = Object.freeze({ scenes: 200, apparences: 2000, nom: 80, coordonneeMax: 1e9 } as const);

export type StudioCameraScene =
  | { projection: "perspective"; position: StudioPoint3; target: StudioPoint3; /** Champ de vision vertical, degrés. */ fov: number }
  | { projection: "orthographic"; position: StudioPoint3; target: StudioPoint3; /** Hauteur vue, mètres. */ height: number };

export interface StudioScene {
  id: string;
  type: "scene";
  frame: typeof STUDIO_FRAME_SCENES;
  name: string;
  camera: StudioCameraScene;
  /** Calques montrés par la scène (`default` : calque implicite), sans répétition ; vide : aucun. */
  visibleLayers: string[];
  displayMode: StudioModeAffichage;
}

export type StudioCibleApparence = { kind: "layer"; id: string } | { kind: "object"; id: string };

export interface StudioApparence {
  id: string;
  type: "appearance";
  target: StudioCibleApparence;
  /** Couleur d'affichage `#rrggbb` (minuscules). */
  color: string;
  finish?: StudioFinitionAffichage;
}

export type StudioElementVisualisation = StudioScene | StudioApparence;

// ——— Schémas JSON (registre, document) ———

const point3 = { type: "object", additionalProperties: false, required: ["x", "y", "z"], properties: { x: number, y: number, z: number } } as const;
const nom = { type: "string", minLength: 1, maxLength: STUDIO_LIMITES_SCENES.nom, pattern: "\\S" } as const;
const camera = {
  oneOf: [
    { type: "object", additionalProperties: false, required: ["projection", "position", "target", "fov"], properties: { projection: { const: "perspective" }, position: point3, target: point3, fov: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 180 } } },
    { type: "object", additionalProperties: false, required: ["projection", "position", "target", "height"], properties: { projection: { const: "orthographic" }, position: point3, target: point3, height: { type: "number", exclusiveMinimum: 0, maximum: STUDIO_LIMITES_SCENES.coordonneeMax } } },
  ],
} as const;

export const SCHEMA_SCENE = {
  type: "object", additionalProperties: false, required: ["id", "type", "frame", "name", "camera", "visibleLayers", "displayMode"],
  properties: {
    id, type: { const: "scene" }, frame: { const: STUDIO_FRAME_SCENES }, name: nom, camera,
    visibleLayers: { type: "array", uniqueItems: true, items: id }, displayMode: { enum: [...STUDIO_MODES_AFFICHAGE] },
  },
} as const;
export const SCHEMA_APPARENCE = {
  type: "object", additionalProperties: false, required: ["id", "type", "target", "color"],
  properties: {
    id, type: { const: "appearance" },
    target: { type: "object", additionalProperties: false, required: ["kind", "id"], properties: { kind: { enum: ["layer", "object"] }, id } },
    color: { type: "string", pattern: "^#[0-9a-f]{6}$" }, finish: { enum: [...STUDIO_FINITIONS_AFFICHAGE] },
  },
} as const;
export const SCHEMA_ELEMENT_VISUALISATION = { oneOf: [SCHEMA_SCENE, SCHEMA_APPARENCE] } as const;

// ——— Validation ———

function coordonnee(value: unknown, path: string): number {
  const v = finite(value, path);
  if (Math.abs(v) > STUDIO_LIMITES_SCENES.coordonneeMax) fail(path, "valeur absolue de 1 000 000 000 m au plus");
  return Object.is(v, -0) ? 0 : v;
}
function point3Valide(value: unknown, path: string): StudioPoint3 {
  const p = record(value, ["x", "y", "z"], path);
  return { x: coordonnee(p.x, `${path}.x`), y: coordonnee(p.y, `${path}.y`), z: coordonnee(p.z, `${path}.z`) };
}
function nomValide(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.length > STUDIO_LIMITES_SCENES.nom) fail(path, `nom non vide de ${STUDIO_LIMITES_SCENES.nom} caractères au plus attendu`);
  return value;
}
function parmi<T extends string>(value: unknown, valeurs: readonly T[], path: string, quoi: string): T {
  if (typeof value !== "string" || !(valeurs as readonly string[]).includes(value)) fail(path, `${quoi} : ${valeurs.join(", ")} attendu`);
  return value as T;
}

export function validerCameraScene(value: unknown, path: string): StudioCameraScene {
  const projection = Object.getOwnPropertyDescriptor(value ?? {}, "projection")?.value;
  if (projection === "perspective") {
    const c = record(value, ["projection", "position", "target", "fov"], path);
    const position = point3Valide(c.position, `${path}.position`), target = point3Valide(c.target, `${path}.target`);
    const fov = finite(c.fov, `${path}.fov`);
    if (!(fov > 0 && fov < 180)) fail(`${path}.fov`, "champ de vision en degrés dans ]0 ; 180[ attendu");
    if (position.x === target.x && position.y === target.y && position.z === target.z) fail(`${path}.target`, "cible distincte de la position attendue");
    return { projection, position, target, fov };
  }
  if (projection === "orthographic") {
    const c = record(value, ["projection", "position", "target", "height"], path);
    const position = point3Valide(c.position, `${path}.position`), target = point3Valide(c.target, `${path}.target`);
    const height = finite(c.height, `${path}.height`);
    if (!(height > 0 && height <= STUDIO_LIMITES_SCENES.coordonneeMax)) fail(`${path}.height`, "hauteur vue strictement positive, de 1 000 000 000 m au plus, attendue");
    if (position.x === target.x && position.y === target.y && position.z === target.z) fail(`${path}.target`, "cible distincte de la position attendue");
    return { projection, position, target, height };
  }
  return fail(`${path}.projection`, "projection perspective ou orthographic attendue");
}

function validerScene(value: unknown, path: string): StudioScene {
  const o = record(value, ["id", "type", "frame", "name", "camera", "visibleLayers", "displayMode"], path);
  if (o.frame !== STUDIO_FRAME_SCENES) fail(`${path}.frame`, "repère local-3d attendu");
  const calques = array(o.visibleLayers, `${path}.visibleLayers`).map((l, i) => identifier(l, `${path}.visibleLayers[${i}]`));
  if (new Set(calques).size !== calques.length) fail(`${path}.visibleLayers`, "calque répété");
  return {
    id: identifier(o.id, `${path}.id`), type: "scene", frame: STUDIO_FRAME_SCENES, name: nomValide(o.name, `${path}.name`),
    camera: validerCameraScene(o.camera, `${path}.camera`), visibleLayers: calques,
    displayMode: parmi(o.displayMode, STUDIO_MODES_AFFICHAGE, `${path}.displayMode`, "mode d’affichage"),
  };
}

function validerApparence(value: unknown, path: string): StudioApparence {
  const o = record(value, ["id", "type", "target", "color"], path, ["finish"]);
  const t = record(o.target, ["kind", "id"], `${path}.target`);
  const kind = parmi(t.kind, ["layer", "object"] as const, `${path}.target.kind`, "type de cible");
  const color = o.color;
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/.test(color)) fail(`${path}.color`, "couleur #rrggbb (minuscules) attendue");
  return {
    id: identifier(o.id, `${path}.id`), type: "appearance", target: { kind, id: identifier(t.id, `${path}.target.id`) }, color,
    ...(Object.hasOwn(o, "finish") ? { finish: parmi(o.finish, STUDIO_FINITIONS_AFFICHAGE, `${path}.finish`, "finition") } : {}),
  };
}

/** Élément de visualisation validé (copie canonique privée) ; un type inconnu est refusé, jamais ignoré. */
export function validerElementVisualisation(value: unknown, path: string): StudioElementVisualisation {
  const type = discriminator(value, path);
  if (type === "scene") return validerScene(value, path);
  if (type === "appearance") return validerApparence(value, path);
  return fail(`${path}.type`, "type d’élément de visualisation non pris en charge");
}

/** Références du document que la liste `scenes` peut nommer. */
export interface ReferencesVisualisation {
  /** Calques matérialisés du document. */
  calques: ReadonlySet<string>;
  /** Objets rendus en 3D : formes, solides libres, murs et ouvertures. */
  objets: ReadonlySet<string>;
}

const calqueConnu = (refs: ReferencesVisualisation, id: string) => id === STUDIO_DEFAULT_LAYER_ID || refs.calques.has(id);

/**
 * Contrôles de la liste entière : bornes, identifiants uniques, calques et objets connus, une apparence au plus par
 * cible. Le calque implicite se nomme `default` ici (liste de calques, pas un `layerId`).
 */
export function controlerVisualisation(items: readonly StudioElementVisualisation[], refs: ReferencesVisualisation, path: string): void {
  const ids = new Set<string>(), cibles = new Set<string>();
  let scenes = 0, apparences = 0;
  items.forEach((it, i) => {
    if (ids.has(it.id)) fail(path, "identifiant dupliqué");
    ids.add(it.id);
    if (it.type === "scene") {
      scenes++;
      for (const l of it.visibleLayers) if (!calqueConnu(refs, l)) fail(`${path}[${i}].visibleLayers`, `calque inconnu : ${l}`);
    } else {
      apparences++;
      const { kind, id } = it.target;
      if (kind === "layer" ? !calqueConnu(refs, id) : !refs.objets.has(id)) fail(`${path}[${i}].target`, kind === "layer" ? `calque inconnu : ${id}` : `objet introuvable : ${id}`);
      const cle = `${kind}:${id}`;
      if (cibles.has(cle)) fail(`${path}[${i}].target`, "cette cible a déjà une apparence");
      cibles.add(cle);
    }
  });
  if (scenes > STUDIO_LIMITES_SCENES.scenes) fail(path, `${STUDIO_LIMITES_SCENES.scenes} scènes au plus`);
  if (apparences > STUDIO_LIMITES_SCENES.apparences) fail(path, `${STUDIO_LIMITES_SCENES.apparences} apparences au plus`);
}
