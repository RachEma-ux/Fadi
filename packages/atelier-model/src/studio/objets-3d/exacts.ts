import type { StudioPoint3 } from "../exporteurs/maillage.js";
import { array, fail, finite, identifier, layerRef, record } from "../noyau/validation.js";
import { cotesSolide, empriseSolide, estBascule, estDroit, validerSolide, type StudioSolid } from "./solides.js";
import { studioMaillageSolide } from "./maillage.js";
import { SCHEMA_SURFACE_SUBDIVISION, studioSubdivisionFermee, validerSurfaceSubdivision, type StudioSurfaceSubdivision } from "./subdivisions.js";
import { SCHEMA_SURFACE_LIBRE, STUDIO_SENS_EPAISSEUR, validerEpaisseur, validerSens, validerSurfaceLibre, type StudioSensEpaisseur, type StudioSurfaceLibre } from "./surfaces-libres.js";

/**
 * Solides exacts de Studio (lot F2, IF-003, R15) : résultat d'une opération booléenne (union, différence, intersection)
 * calculée par le noyau exact (OCCT compilé en WebAssembly, `@parcours/geometry-exact`), jamais par ce modèle. Ils sont
 * rangés dans le tableau facultatif `exacts` du document (jamais dans `solides` ni `objects`), repère `local-3d`
 * (z vers le haut, mètres). Chaque solide exact porte :
 *
 * - son **opération** et ses **deux opérandes conservés** tels qu'ils étaient (boîte, prisme ou solide exact) : un objet
 *   paramétrique n'est jamais converti en silence (R15) — il est retiré de `solides` par la commande explicite
 *   `studio.solide.booleen` et rangé ici, intact, avec ses paramètres ;
 * - le **résultat du noyau** : représentation canonique brep (binaire OCCT, base64), maillage dérivé (positions et
 *   indices, pour l'affichage sans recharger le noyau), volume, aire, nombres de faces et de solides, moteur, version et
 *   empreinte du brep. Le serveur recalcule l'opération avec le même noyau et fait autorité (R9).
 *
 * Ce module ne calcule aucune géométrie exacte : il valide, convertit le maillage reçu pour la vue 3D et décrit les
 * opérandes pour le noyau. Pur : ni React, ni DOM, ni WebAssembly.
 */

export const STUDIO_OPERATIONS_BOOLEENNES = Object.freeze(["union", "difference", "intersection"] as const);
export type StudioOperationBooleenne = (typeof STUDIO_OPERATIONS_BOOLEENNES)[number];

/** Moteur attendu d'un résultat exact (contrat `solide-exact/1` de `@parcours/geometry-exact`). */
export const STUDIO_MOTEUR_EXACT = "occt-wasm" as const;

/**
 * Bornes techniques d'un résultat exact (pas des valeurs métier) : brep de 1 000 000 caractères base64 au plus, maillage
 * de 100 000 sommets et 200 000 triangles au plus, opérandes imbriqués sur 8 niveaux au plus. Elles gardent un lot de
 * commandes sous la limite de taille d'une requête Studio.
 */
export const STUDIO_LIMITES_EXACTS = Object.freeze({ brep: 1_000_000, sommets: 100_000, triangles: 200_000, profondeur: 8 } as const);

export interface StudioMaillageExact {
  /** x, y, z à la suite (m, repère `local-3d`). */
  positions: number[];
  /** Triplets d'indices dans les sommets. */
  indices: number[];
}

export interface StudioResultatExact {
  brep: string;
  maillage: StudioMaillageExact;
  /** m³, calculé par le noyau. */
  volume: number;
  /** m², calculée par le noyau. */
  aire: number;
  faces: number;
  solides: number;
  moteur: typeof STUDIO_MOTEUR_EXACT;
  versionMoteur: string;
  /** Empreinte FNV-1a 64 bits des octets du brep (16 caractères hexadécimaux), recalculée par le serveur. */
  empreinte: string;
}

export type StudioOperandeExact = StudioSolid | StudioSolideExact;

export interface StudioSolideExactBooleen {
  id: string;
  type: "exact";
  layerId?: string;
  operation: StudioOperationBooleenne;
  /** Opérandes conservés (A puis B : la différence retire B de A). */
  operandes: [StudioOperandeExact, StudioOperandeExact];
  resultat: StudioResultatExact;
}

/**
 * Solide exact obtenu par **épaississement** d'une surface libre (X.1-05) : la surface NURBS est conservée intacte
 * (R15 : la commande `studio.surface.epaissir` est l'acte explicite de conversion), avec l'épaisseur et son côté ; le
 * résultat est celui du noyau exact (opération `nurbs`), recalculé par le serveur.
 */
export interface StudioSolideExactEpaissi {
  id: string;
  type: "exact";
  layerId?: string;
  operation: "epaississement";
  surface: StudioSurfaceLibre;
  /** m, > 0. */
  epaisseur: number;
  sens: StudioSensEpaisseur;
  resultat: StudioResultatExact;
}

/**
 * Solide exact obtenu par **solidification** d'une surface de subdivision fermée (X.1-05) : le maillage subdivisé au
 * niveau de la surface, cousu en solide polyédrique par le noyau (opération `polyedre`) ; la surface de subdivision est
 * conservée intacte (R15). Ni lissé ni présenté comme la surface limite.
 */
export interface StudioSolideExactSolidifie {
  id: string;
  type: "exact";
  layerId?: string;
  operation: "solidification";
  subdivision: StudioSurfaceSubdivision;
  resultat: StudioResultatExact;
}

export type StudioSolideExact = StudioSolideExactBooleen | StudioSolideExactEpaissi | StudioSolideExactSolidifie;

/** Le solide exact est-il un booléen (deux opérandes conservés) ? */
export const estBooleenExact = (s: StudioSolideExact): s is StudioSolideExactBooleen => s.operation !== "epaississement" && s.operation !== "solidification";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const entier = (v: unknown, path: string, min: number): number => {
  const n = finite(v, path);
  if (!Number.isInteger(n) || n < min) fail(path, `entier ≥ ${min} attendu`);
  return n;
};

function validerMaillage(value: unknown, path: string): StudioMaillageExact {
  const m = record(value, ["positions", "indices"], path);
  const positions = array(m.positions, `${path}.positions`);
  const indices = array(m.indices, `${path}.indices`);
  if (positions.length % 3 !== 0 || positions.length === 0) fail(`${path}.positions`, "triplets x, y, z attendus");
  if (positions.length / 3 > STUDIO_LIMITES_EXACTS.sommets) fail(`${path}.positions`, `${STUDIO_LIMITES_EXACTS.sommets} sommets au plus`);
  if (indices.length % 3 !== 0 || indices.length === 0) fail(`${path}.indices`, "triplets d'indices attendus");
  if (indices.length / 3 > STUDIO_LIMITES_EXACTS.triangles) fail(`${path}.indices`, `${STUDIO_LIMITES_EXACTS.triangles} triangles au plus`);
  const n = positions.length / 3;
  const p = positions.map((v, i) => { if (typeof v !== "number" || !Number.isFinite(v)) fail(`${path}.positions[${i}]`, "nombre fini attendu"); return v; });
  const t = indices.map((v, i) => { if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= n) fail(`${path}.indices[${i}]`, "indice de sommet attendu"); return v; });
  return { positions: p, indices: t };
}

export function validerResultatExact(value: unknown, path: string): StudioResultatExact {
  const r = record(value, ["brep", "maillage", "volume", "aire", "faces", "solides", "moteur", "versionMoteur", "empreinte"], path);
  if (typeof r.brep !== "string" || !r.brep.length || !BASE64.test(r.brep)) fail(`${path}.brep`, "brep base64 attendu");
  if (r.brep.length > STUDIO_LIMITES_EXACTS.brep) fail(`${path}.brep`, `${STUDIO_LIMITES_EXACTS.brep} caractères au plus`);
  const volume = finite(r.volume, `${path}.volume`), aire = finite(r.aire, `${path}.aire`);
  if (volume <= 0) fail(`${path}.volume`, "volume strictement positif attendu (un résultat vide est refusé par le noyau)");
  if (aire <= 0) fail(`${path}.aire`, "aire strictement positive attendue");
  if (r.moteur !== STUDIO_MOTEUR_EXACT) fail(`${path}.moteur`, `moteur « ${STUDIO_MOTEUR_EXACT} » attendu`);
  if (typeof r.versionMoteur !== "string" || !/^\d+\.\d+\.\d+$/.test(r.versionMoteur)) fail(`${path}.versionMoteur`, "version x.y.z attendue");
  if (typeof r.empreinte !== "string" || !/^[0-9a-f]{16}$/.test(r.empreinte)) fail(`${path}.empreinte`, "empreinte de 16 caractères hexadécimaux attendue");
  return {
    brep: r.brep, maillage: validerMaillage(r.maillage, `${path}.maillage`), volume, aire,
    faces: entier(r.faces, `${path}.faces`, 1), solides: entier(r.solides, `${path}.solides`, 1),
    moteur: STUDIO_MOTEUR_EXACT, versionMoteur: r.versionMoteur, empreinte: r.empreinte,
  };
}

function validerOperation(v: unknown, path: string): StudioOperationBooleenne {
  if (typeof v !== "string" || !(STUDIO_OPERATIONS_BOOLEENNES as readonly string[]).includes(v)) fail(path, "opération « union », « difference » ou « intersection » attendue");
  return v as StudioOperationBooleenne;
}

function validerOperande(value: unknown, path: string, profondeur: number): StudioOperandeExact {
  const type = value && typeof value === "object" ? (value as { type?: unknown }).type : undefined;
  return type === "exact" ? validerExact(value, path, profondeur + 1) : validerSolide(value, path);
}

function validerExact(value: unknown, path: string, profondeur: number): StudioSolideExact {
  if (profondeur > STUDIO_LIMITES_EXACTS.profondeur) fail(path, `opérandes imbriqués sur ${STUDIO_LIMITES_EXACTS.profondeur} niveaux au plus`);
  if (value && typeof value === "object" && (value as { operation?: unknown }).operation === "epaississement") {
    const e = record(value, ["id", "type", "operation", "surface", "epaisseur", "sens", "resultat"], path, ["layerId"]);
    if (e.type !== "exact") fail(`${path}.type`, "type « exact » attendu");
    const surface = validerSurfaceLibre(e.surface, `${path}.surface`);
    const id = identifier(e.id, `${path}.id`);
    if (surface.id === id) fail(`${path}.surface`, "la surface conservée a son propre identifiant");
    return {
      id, type: "exact", ...layerRef(e, path), operation: "epaississement", surface,
      epaisseur: validerEpaisseur(e.epaisseur, `${path}.epaisseur`), sens: validerSens(e.sens, `${path}.sens`), resultat: validerResultatExact(e.resultat, `${path}.resultat`),
    };
  }
  if (value && typeof value === "object" && (value as { operation?: unknown }).operation === "solidification") {
    const e = record(value, ["id", "type", "operation", "subdivision", "resultat"], path, ["layerId"]);
    if (e.type !== "exact") fail(`${path}.type`, "type « exact » attendu");
    const subdivision = validerSurfaceSubdivision(e.subdivision, `${path}.subdivision`);
    if (!studioSubdivisionFermee(subdivision)) fail(`${path}.subdivision`, "surface de subdivision ouverte : jamais solidifiée");
    const id = identifier(e.id, `${path}.id`);
    if (subdivision.id === id) fail(`${path}.subdivision`, "la surface conservée a son propre identifiant");
    return { id, type: "exact", ...layerRef(e, path), operation: "solidification", subdivision, resultat: validerResultatExact(e.resultat, `${path}.resultat`) };
  }
  const o = record(value, ["id", "type", "operation", "operandes", "resultat"], path, ["layerId"]);
  if (o.type !== "exact") fail(`${path}.type`, "type « exact » attendu");
  const ops = array(o.operandes, `${path}.operandes`);
  if (ops.length !== 2) fail(`${path}.operandes`, "deux opérandes attendus");
  const operandes: [StudioOperandeExact, StudioOperandeExact] = [validerOperande(ops[0], `${path}.operandes[0]`, profondeur), validerOperande(ops[1], `${path}.operandes[1]`, profondeur)];
  if (operandes[0].id === operandes[1].id) fail(`${path}.operandes`, "deux opérandes distincts attendus");
  return {
    id: identifier(o.id, `${path}.id`), type: "exact", ...layerRef(o, path), operation: validerOperation(o.operation, `${path}.operation`),
    operandes, resultat: validerResultatExact(o.resultat, `${path}.resultat`),
  };
}

/** Solide exact validé (copie canonique privée) ; un champ inconnu est refusé, jamais ignoré. */
export const validerSolideExact = (value: unknown, path: string): StudioSolideExact => validerExact(value, path, 1);

/**
 * Identifiants des opérandes conservés d'un solide exact, à toute profondeur (ils restent uniques dans le document) ;
 * pour un solide épaissi, celui de sa surface conservée.
 */
export function studioIdsOperandes(s: StudioSolideExact): string[] {
  if (s.operation === "epaississement") return [s.surface.id];
  if (s.operation === "solidification") return [s.subdivision.id];
  const out: string[] = [];
  for (const o of s.operandes) { out.push(o.id); if (o.type === "exact") out.push(...studioIdsOperandes(o)); }
  return out;
}

// ——— Opérandes pour le noyau exact (contrat `booleen` de `@parcours/geometry-exact`, décrit structurellement) ———

/** Opérande du noyau : un brep (repère `local-3d`, sans pose) ou l'extrusion verticale d'un contour placé. */
export type StudioOperandeNoyau = { brep: string } | { extrusion: { profil: { x: number; y: number }[]; z0: number; hauteur: number } };
export interface StudioOperationNoyau { type: "booleen"; op: "union" | "soustraction" | "intersection"; a: StudioOperandeNoyau; b: StudioOperandeNoyau }

export const OP_NOYAU: Readonly<Record<StudioOperationBooleenne, StudioOperationNoyau["op"]>> = Object.freeze({ union: "union", difference: "soustraction", intersection: "intersection" });

/**
 * Opérande du noyau pour un solide : un solide exact donne son brep ; une boîte ou un prisme droit donnent l'extrusion
 * de leur emprise placée (conversion explicite repère du solide → `local-3d`) entre leurs cotes — le solide paramétrique
 * reste canonique, son extrusion n'est qu'une entrée du calcul (R15). Un prisme oblique (direction saisie hors de z) n'a
 * pas d'extrusion verticale : il est refusé (message), jamais approché.
 */
export function studioOperandeNoyau(s: StudioOperandeExact): StudioOperandeNoyau | string {
  if (s.type === "exact") return { brep: s.resultat.brep };
  if (!estDroit(s)) return "prisme oblique : le booléen exact de Studio n’accepte que des solides droits (direction +Z ou −Z)";
  if (estBascule(s)) return "solide basculé : le booléen exact de Studio n’accepte que des solides à profil horizontal (aucun basculement)";
  const { zMin, zMax } = cotesSolide(s);
  return { extrusion: { profil: empriseSolide(s).map((p) => ({ x: p.x, y: p.y })), z0: zMin, hauteur: zMax - zMin } };
}

// ——— Emprise englobante et maillage d'affichage (dérivés, jamais stockés) ———

export interface StudioBoiteEnglobante { min: StudioPoint3; max: StudioPoint3 }

/** Boîte englobante alignée sur les axes du repère `local-3d`. */
export function studioBoiteEnglobante(s: StudioOperandeExact): StudioBoiteEnglobante {
  if (s.type === "exact") {
    const p = s.resultat.maillage.positions;
    const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let i = 0; i < p.length; i += 3) {
      min.x = Math.min(min.x, p[i]!); min.y = Math.min(min.y, p[i + 1]!); min.z = Math.min(min.z, p[i + 2]!);
      max.x = Math.max(max.x, p[i]!); max.y = Math.max(max.y, p[i + 1]!); max.z = Math.max(max.z, p[i + 2]!);
    }
    return { min, max };
  }
  if (estBascule(s)) {
    // Solide basculé (A.3-03) : boîte englobante de son maillage.
    const v = studioMaillageSolide(s).vertices;
    return {
      min: { x: Math.min(...v.map((p) => p.x)), y: Math.min(...v.map((p) => p.y)), z: Math.min(...v.map((p) => p.z)) },
      max: { x: Math.max(...v.map((p) => p.x)), y: Math.max(...v.map((p) => p.y)), z: Math.max(...v.map((p) => p.z)) },
    };
  }
  const e = empriseSolide(s);
  const { zMin, zMax } = cotesSolide(s);
  return {
    min: { x: Math.min(...e.map((p) => p.x)), y: Math.min(...e.map((p) => p.y)), z: zMin },
    max: { x: Math.max(...e.map((p) => p.x)), y: Math.max(...e.map((p) => p.y)), z: zMax },
  };
}

/** Maillage d'un solide exact pour la vue 3D : sommets, triangles du noyau et arêtes vives (angle dièdre > 20°). */
export interface StudioExact3d {
  id: string;
  type: "exact";
  layerId?: string;
  kind: "exact";
  vertices: StudioPoint3[];
  triangles: [number, number, number][];
  edges: [number, number][];
}

/** Seuil d'angle dièdre des arêtes dessinées (affichage seulement, choisi par Fadi). */
const COS_ARETE = Math.cos((20 * Math.PI) / 180);

export function studioMaillageExact(s: StudioSolideExact): StudioExact3d {
  const p = s.resultat.maillage.positions, ind = s.resultat.maillage.indices;
  const vertices: StudioPoint3[] = [];
  for (let i = 0; i < p.length; i += 3) vertices.push({ x: p[i]!, y: p[i + 1]!, z: p[i + 2]! });
  const triangles: [number, number, number][] = [];
  for (let i = 0; i < ind.length; i += 3) triangles.push([ind[i]!, ind[i + 1]!, ind[i + 2]!]);
  // Le noyau duplique les sommets par face : les arêtes se reconnaissent par leurs positions, pas par leurs indices.
  const cle = (i: number) => { const v = vertices[i]!; return `${v.x},${v.y},${v.z}`; };
  const normale = ([a, b, c]: [number, number, number]) => {
    const A = vertices[a]!, B = vertices[b]!, C = vertices[c]!;
    const u = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z }, v = { x: C.x - A.x, y: C.y - A.y, z: C.z - A.z };
    const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
    const l = Math.hypot(n.x, n.y, n.z) || 1;
    return { x: n.x / l, y: n.y / l, z: n.z / l };
  };
  const vues = new Map<string, { a: number; b: number; normales: StudioPoint3[] }>();
  for (const t of triangles) {
    const n = normale(t);
    for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]] as const) {
      const [ka, kb] = [cle(a), cle(b)];
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = vues.get(k);
      if (e) e.normales.push(n); else vues.set(k, { a, b, normales: [n] });
    }
  }
  const edges: [number, number][] = [];
  for (const e of vues.values()) {
    const [n1, n2] = e.normales;
    if (!n2 || e.normales.length > 2 || n1!.x * n2.x + n1!.y * n2.y + n1!.z * n2.z < COS_ARETE) edges.push([e.a, e.b]);
  }
  return { id: s.id, type: "exact", ...(s.layerId !== undefined ? { layerId: s.layerId } : {}), kind: "exact", vertices, triangles, edges };
}

// ——— Schémas JSON (registre, document) ———

const nombreFini = { type: "number" } as const;
export const SCHEMA_RESULTAT_EXACT: Readonly<Record<string, unknown>> = {
  type: "object", additionalProperties: false, required: ["brep", "maillage", "volume", "aire", "faces", "solides", "moteur", "versionMoteur", "empreinte"],
  properties: {
    brep: { type: "string", minLength: 1, maxLength: STUDIO_LIMITES_EXACTS.brep, pattern: "^[A-Za-z0-9+/]+={0,2}$" },
    maillage: {
      type: "object", additionalProperties: false, required: ["positions", "indices"],
      properties: {
        positions: { type: "array", minItems: 3, maxItems: 3 * STUDIO_LIMITES_EXACTS.sommets, items: nombreFini },
        indices: { type: "array", minItems: 3, maxItems: 3 * STUDIO_LIMITES_EXACTS.triangles, items: { type: "integer", minimum: 0 } },
      },
    },
    volume: { type: "number", exclusiveMinimum: 0 }, aire: { type: "number", exclusiveMinimum: 0 },
    faces: { type: "integer", minimum: 1 }, solides: { type: "integer", minimum: 1 },
    moteur: { const: STUDIO_MOTEUR_EXACT }, versionMoteur: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    empreinte: { type: "string", pattern: "^[0-9a-f]{16}$" },
  },
} as const;
/**
 * Solide exact du document : booléen (opérandes conservés, solide libre ou solide exact décrits par leurs propres
 * schémas) ou épaississement d'une surface libre (surface conservée, X.1-05).
 */
export const SCHEMA_SOLIDE_EXACT: Readonly<Record<string, unknown>> = {
  oneOf: [
    {
      type: "object", additionalProperties: false, required: ["id", "type", "operation", "operandes", "resultat"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 128 }, type: { const: "exact" }, layerId: { type: "string", minLength: 1, maxLength: 128 },
        operation: { enum: [...STUDIO_OPERATIONS_BOOLEENNES] },
        operandes: { type: "array", minItems: 2, maxItems: 2, items: { type: "object", description: "solide libre (boîte, prisme) ou solide exact, conservé tel quel" } },
        resultat: SCHEMA_RESULTAT_EXACT,
      },
    },
    {
      type: "object", additionalProperties: false, required: ["id", "type", "operation", "surface", "epaisseur", "sens", "resultat"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 128 }, type: { const: "exact" }, layerId: { type: "string", minLength: 1, maxLength: 128 },
        operation: { const: "epaississement" }, surface: SCHEMA_SURFACE_LIBRE,
        epaisseur: { type: "number", minimum: 1e-6, maximum: 1e6 }, sens: { enum: [...STUDIO_SENS_EPAISSEUR] }, resultat: SCHEMA_RESULTAT_EXACT,
      },
    },
    {
      type: "object", additionalProperties: false, required: ["id", "type", "operation", "subdivision", "resultat"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 128 }, type: { const: "exact" }, layerId: { type: "string", minLength: 1, maxLength: 128 },
        operation: { const: "solidification" }, subdivision: SCHEMA_SURFACE_SUBDIVISION, resultat: SCHEMA_RESULTAT_EXACT,
      },
    },
  ],
} as const;
