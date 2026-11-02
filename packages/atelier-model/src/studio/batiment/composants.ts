import type { StudioPoint3 } from "../exporteurs/maillage.js";
import { array, fail, identifier, layerRef, record } from "../noyau/validation.js";
import { id, layerId } from "../registre/schemas-base.js";
import { studioMaillageSolide } from "../objets-3d/maillage.js";
import { aireProfil, hauteurPerpendiculaire, SCHEMA_BOITE, SCHEMA_PRISME, validerPlacement, validerSolide, type StudioPlacement3d, type StudioSolid } from "../objets-3d/solides.js";
import { niveauRef } from "../architecture/structure.js";
import { nomSaisi } from "./niveaux.js";

/**
 * Composants 3D (lot W3-B, X.1-04 ; REF-02 § 4.1 « groupes, composants », § 18.2 S4 « composants répétitifs ») :
 * - une **définition** partagée (`StudioDocument.composants`) : un nom saisi et des solides libres (boîtes, prismes) dans
 *   le repère **local** du composant ; leurs identifiants sont propres à la définition ;
 * - des **occurrences** (`StudioDocument.occurrences`) : chacune désigne sa définition (`composantId`) et porte son
 *   placement (origine `local-3d`, rotation autour de z), son calque et son niveau facultatifs.
 * La géométrie d'une occurrence est **dérivée** de sa définition à chaque lecture (jamais copiée) : modifier la définition
 * (`studio.composant.definir`) change toutes ses occurrences dans la même révision. « Rendre unique » une occurrence
 * crée une définition copiée et la fait désigner par l'occurrence seule (`studioCommandesRendreUnique`), en un lot.
 *
 * Ce modèle de composants 3D est distinct des blocs 2D du dessin : aucun nom de type, de champ ni d'outil n'est partagé.
 * Un composant n'acquiert aucune signification BIM (A.3-09) : ni catégorie, ni matériau ; à l'IFC il reste un
 * `IfcBuildingElementProxyType` et ses occurrences des `IfcBuildingElementProxy` (représentation partagée). Pur.
 */

export interface StudioComposant {
  id: string;
  /** Nom saisi (non vide, 80 caractères au plus). */
  nom: string;
  /** Solides de la définition, repère local du composant : ni calque, ni source, ni basculement. */
  solides: StudioSolid[];
}

/** Placement d'une occurrence : origine (`local-3d`) et rotation autour de +z (radians dans [0 ; 2π[) ; aucun basculement. */
export type StudioPlacementOccurrence = Pick<StudioPlacement3d, "origin" | "rotation">;

export interface StudioOccurrence {
  id: string;
  type: "occurrence";
  /** Définition désignée. */
  composantId: string;
  layerId?: string;
  niveauId?: string;
  placement: StudioPlacementOccurrence;
}

/** Bornes techniques (pas des valeurs métier). */
export const STUDIO_LIMITES_COMPOSANTS = Object.freeze({ composants: 1000, solidesParComposant: 256, nom: 80 } as const);

const point3 = { type: "object", additionalProperties: false, required: ["x", "y", "z"], properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } } } as const;
const SANS_CALQUE = (s: typeof SCHEMA_BOITE | typeof SCHEMA_PRISME) => {
  const { layerId: _l, ...properties } = s.properties as Record<string, unknown>;
  return { ...s, properties };
};
export const SCHEMA_COMPOSANT = {
  type: "object", additionalProperties: false, required: ["id", "nom", "solides"],
  properties: {
    id, nom: { type: "string", minLength: 1, maxLength: STUDIO_LIMITES_COMPOSANTS.nom },
    solides: { type: "array", minItems: 1, maxItems: STUDIO_LIMITES_COMPOSANTS.solidesParComposant, items: { oneOf: [SANS_CALQUE(SCHEMA_BOITE), SANS_CALQUE(SCHEMA_PRISME)] } },
  },
} as const;
export const SCHEMA_OCCURRENCE = {
  type: "object", additionalProperties: false, required: ["id", "type", "composantId", "placement"],
  properties: {
    id, type: { const: "occurrence" }, composantId: id, layerId, niveauId: id,
    placement: { type: "object", additionalProperties: false, required: ["origin", "rotation"], properties: { origin: point3, rotation: { type: "number", minimum: 0, exclusiveMaximum: 2 * Math.PI } } },
  },
} as const;

/** Définition validée : nom saisi, au moins un solide, identifiants de solides uniques dans la définition. */
export function validerComposant(value: unknown, path: string): StudioComposant {
  const o = record(value, ["id", "nom", "solides"], path);
  const raw = array(o.solides, `${path}.solides`);
  if (!raw.length) fail(`${path}.solides`, "un solide au moins attendu");
  if (raw.length > STUDIO_LIMITES_COMPOSANTS.solidesParComposant) fail(`${path}.solides`, `${STUDIO_LIMITES_COMPOSANTS.solidesParComposant} solides au plus par composant`);
  const ids = new Set<string>();
  const solides = raw.map((r, i) => {
    const p = `${path}.solides[${i}]`;
    const s = validerSolide(r, p);
    if (s.layerId !== undefined) fail(`${p}.layerId`, "un solide de définition n’a pas de calque (l’occurrence porte le sien)");
    if (s.placement.basculement) fail(`${p}.placement.basculement`, "aucun basculement dans une définition de composant");
    if (s.type === "prism" && s.source) fail(`${p}.source`, "un solide de définition n’a pas de polyligne source");
    if (ids.has(s.id)) fail(p, `identifiant de solide dupliqué dans la définition : ${s.id}`);
    ids.add(s.id);
    return s;
  });
  return { id: identifier(o.id, `${path}.id`), nom: nomSaisi(o.nom, `${path}.nom`, STUDIO_LIMITES_COMPOSANTS.nom), solides };
}

export function validerOccurrence(value: unknown, path: string): StudioOccurrence {
  const o = record(value, ["id", "type", "composantId", "placement"], path, ["layerId", "niveauId"]);
  if (o.type !== "occurrence") fail(`${path}.type`, "occurrence de composant attendue");
  const p = validerPlacement(o.placement, `${path}.placement`);
  if (p.basculement) fail(`${path}.placement.basculement`, "une occurrence tourne autour de z seulement (aucun basculement)");
  return {
    id: identifier(o.id, `${path}.id`), type: "occurrence", composantId: identifier(o.composantId, `${path}.composantId`),
    ...layerRef(o, path), ...niveauRef(o, path), placement: { origin: p.origin, rotation: p.rotation },
  };
}

export function validerComposants(raw: readonly unknown[], path: string): StudioComposant[] {
  if (raw.length > STUDIO_LIMITES_COMPOSANTS.composants) fail(path, `${STUDIO_LIMITES_COMPOSANTS.composants} composants au plus`);
  return raw.map((c, i) => validerComposant(c, `${path}[${i}]`));
}

// ——— Géométrie dérivée ———

/** Point du repère local du composant → `local-3d` par le placement de l'occurrence (rotation autour de z, puis translation). */
export function studioPointOccurrence(placement: StudioPlacementOccurrence, p: StudioPoint3): StudioPoint3 {
  const c = Math.cos(placement.rotation), s = Math.sin(placement.rotation), o = placement.origin;
  const net = (v: number) => (Object.is(v, -0) ? 0 : v);
  return placement.rotation === 0 ? { x: net(o.x + p.x), y: net(o.y + p.y), z: net(o.z + p.z) } : { x: net(o.x + c * p.x - s * p.y), y: net(o.y + s * p.x + c * p.y), z: net(o.z + p.z) };
}

/** Maillage local d'une définition (réunion des maillages de ses solides, repère local du composant). */
export interface StudioMaillageComposant {
  composantId: string;
  vertices: StudioPoint3[];
  triangles: [number, number, number][];
  edges: [number, number][];
}
export function studioMaillageComposant(c: StudioComposant): StudioMaillageComposant {
  const out: StudioMaillageComposant = { composantId: c.id, vertices: [], triangles: [], edges: [] };
  for (const s of c.solides) {
    const g = studioMaillageSolide(s);
    const k = out.vertices.length;
    out.vertices.push(...g.vertices);
    out.triangles.push(...g.triangles.map(([a, b, d]) => [a + k, b + k, d + k] as [number, number, number]));
    out.edges.push(...g.edges.map(([a, b]) => [a + k, b + k] as [number, number]));
  }
  return out;
}

/** Occurrence placée (vue 3D) : maillage de sa définition transformé, même identifiant que l'occurrence. */
export interface StudioOccurrence3d {
  id: string;
  type: "occurrence";
  composantId: string;
  layerId?: string;
  niveauId?: string;
  vertices: StudioPoint3[];
  triangles: [number, number, number][];
  edges: [number, number][];
}
export function studioMaillageOccurrence(o: StudioOccurrence, definition: StudioMaillageComposant): StudioOccurrence3d {
  return {
    id: o.id, type: "occurrence", composantId: o.composantId, ...(o.layerId !== undefined ? { layerId: o.layerId } : {}), ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}),
    vertices: definition.vertices.map((v) => studioPointOccurrence(o.placement, v)), triangles: definition.triangles.map((t) => [...t] as [number, number, number]), edges: definition.edges.map((e) => [...e] as [number, number]),
  };
}

/**
 * Table d'instanciation (C.2-02, EX-056 « géométries identiques répétées, transformations par instance et traçabilité
 * des occurrences ») : une géométrie locale par définition employée, et la liste ordonnée de ses occurrences avec leur
 * placement ; l'indice d'instance `i` désigne `occurrences[i]` (table de désignation conservée après instanciation).
 */
export interface StudioInstancesComposant {
  definition: StudioMaillageComposant;
  occurrences: { id: string; layerId?: string; niveauId?: string; placement: StudioPlacementOccurrence }[];
}
export function studioInstancesComposants(composants: readonly StudioComposant[], occurrences: readonly StudioOccurrence[]): StudioInstancesComposant[] {
  const parDefinition = new Map<string, StudioInstancesComposant>();
  const defs = new Map(composants.map((c) => [c.id, c]));
  for (const o of occurrences) {
    const c = defs.get(o.composantId);
    if (!c) continue;
    let e = parDefinition.get(c.id);
    if (!e) parDefinition.set(c.id, e = { definition: studioMaillageComposant(c), occurrences: [] });
    e.occurrences.push({ id: o.id, ...(o.layerId !== undefined ? { layerId: o.layerId } : {}), ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}), placement: o.placement });
  }
  return [...parDefinition.values()];
}

/** Volume géométrique d'une définition (m³) : somme des volumes de ses solides (mesure, pas un métré d'ouvrage). */
export const studioVolumeComposant = (c: StudioComposant): number => c.solides.reduce((t, s) => t + aireProfil(s) * hauteurPerpendiculaire(s), 0);

/**
 * Commandes de « Rendre unique » (lot W3-B) : une définition copiée (`nouvelId`, nom saisi, mêmes solides) puis
 * l'occurrence replacée sur elle, même placement — à envoyer dans un seul lot (tout ou rien). Les autres occurrences
 * gardent la définition d'origine.
 */
export function studioCommandesRendreUnique(composants: readonly StudioComposant[], occurrence: StudioOccurrence, nouvelId: string, nom: string): [
  { toolId: "studio.composant.definir"; params: StudioComposant },
  { toolId: "studio.composant.placer"; params: StudioOccurrence },
] {
  const c = composants.find((x) => x.id === occurrence.composantId);
  if (!c) fail("rendreUnique.composantId", `définition introuvable : ${occurrence.composantId}`);
  return [
    { toolId: "studio.composant.definir", params: { id: nouvelId, nom, solides: structuredClone(c.solides) } },
    { toolId: "studio.composant.placer", params: { ...structuredClone(occurrence), composantId: nouvelId } },
  ];
}
