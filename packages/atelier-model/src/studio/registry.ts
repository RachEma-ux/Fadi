import { STUDIO_CONTRACT, STUDIO_DEFAULT_LAYER_ID, STUDIO_LIMITS, type StudioCommandToolId } from "./document-2d.js";

/** Native registry, single source for the toolbar, shortcuts and the API enum. These tools never expose an agent or MCP entry point. */
const id = { type: "string", minLength: 1, pattern: "^(?![\\s\\S]*\\u0000)[\\s\\S]*\\S[\\s\\S]*$" } as const;
const number = { type: "number" } as const;
const point = { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: number, y: number } } as const;
/** `layerId` absent = calque implicite ; son identifiant réservé ne s'écrit jamais explicitement. */
const layerId = { ...id, not: { const: STUDIO_DEFAULT_LAYER_ID } } as const;
const positive = { type: "number", exclusiveMinimum: 0 } as const;
/** Extrusion déclarée (facultative, mètres) : épaisseur pour les lignes seulement ; aucune valeur par défaut. */
const lineExtrusion = { type: "object", additionalProperties: false, required: ["base", "height"], properties: { base: number, height: positive, thickness: positive } } as const;
const rectangleExtrusion = { type: "object", additionalProperties: false, required: ["base", "height"], properties: { base: number, height: positive } } as const;
const line = { type: "object", additionalProperties: false, required: ["id", "type", "start", "end"], properties: { id, type: { const: "line" }, layerId, start: point, end: point, extrusion: lineExtrusion } } as const;
const rectangle = { type: "object", additionalProperties: false, required: ["id", "type", "origin", "width", "height"], properties: { id, type: { const: "rectangle" }, layerId, origin: point, width: positive, height: positive, extrusion: rectangleExtrusion } } as const;
const shape = { oneOf: [line, rectangle] } as const;
const anchor = { enum: ["start", "end", "corner-origin", "corner-width", "corner-height", "corner-opposite"] } as const;
const link = { oneOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["objectId", "anchor"], properties: { objectId: id, anchor } }] } as const;
const dimension = {
  type: "object", additionalProperties: false,
  required: ["id", "type", "start", "end", "offset", "links", "toResolve"],
  properties: {
    id, type: { const: "dimension" }, layerId, start: point, end: point, offset: number,
    links: { type: "object", additionalProperties: false, required: ["start", "end"], properties: { start: link, end: link } },
    toResolve: { type: "boolean" },
  },
} as const;
/** Une cote saisie (création ou modification) n'est jamais « à résoudre ». */
const enteredDimension = { ...dimension, properties: { ...dimension.properties, toResolve: { const: false } } } as const;
const layer = {
  type: "object", additionalProperties: false, required: ["id", "name", "visible", "locked"],
  properties: { id, name: { type: "string", minLength: 1, maxLength: STUDIO_LIMITS.layerName, pattern: "\\S" }, visible: { type: "boolean" }, locked: { type: "boolean" } },
} as const;
const ids = { type: "array", minItems: 1, maxItems: STUDIO_LIMITS.objects, uniqueItems: true, items: id } as const;
export const STUDIO_DOCUMENT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["id", "schemaVersion", "units", "frame", "objects"],
  properties: {
    id, schemaVersion: { const: "studio-document/1" }, units: { const: "m" }, frame: { const: "local-2d" },
    objects: { type: "array", maxItems: STUDIO_LIMITS.objects, items: shape },
    layers: { type: "array", maxItems: STUDIO_LIMITS.layers, items: layer },
    dimensions: { type: "array", maxItems: STUDIO_LIMITS.objects, items: dimension },
  },
} as const;

export type StudioToolGroup = "dessin" | "modification" | "calques" | "volume";
export interface StudioToolDescriptor {
  readonly toolId: string;
  readonly contractVersion: typeof STUDIO_CONTRACT;
  readonly refusalCodes: readonly ["studio-invalid"];
  readonly libelleFR: string;
  /** Touche au format `KeyboardEvent.key`, modificateurs `Ctrl+` / `Shift+` en tête (Shift = « Maj », Delete = « Suppr »). */
  readonly raccourci: string;
  readonly iconeSymbolique: string;
  /** Barre d'outils où l'outil ou la commande est rangé. */
  readonly groupe: StudioToolGroup;
  /** `lecture` n'est jamais une commande persistée ; `mutation` passe par `applyStudioCommands`. */
  readonly nature: "lecture" | "mutation";
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly agentExposure: "none";
  readonly supportsDryRun: boolean;
}

function freezeTree<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

const common = { contractVersion: STUDIO_CONTRACT, refusalCodes: ["studio-invalid"] as const, agentExposure: "none", supportsDryRun: true } as const;
const mutation = { ...common, nature: "mutation", outputSchema: STUDIO_DOCUMENT_SCHEMA } as const;

export const STUDIO_TOOLS = freezeTree([
  { ...common, toolId: "studio.dessin.selection", libelleFR: "Sélection", raccourci: "Space", iconeSymbolique: "studio-pointer", groupe: "dessin", nature: "lecture", inputSchema: { type: "object", additionalProperties: false, required: ["id"], properties: { id } }, outputSchema: { anyOf: [shape, { type: "null" }] } },
  { ...mutation, toolId: "studio.dessin.ligne", libelleFR: "Ligne", raccourci: "L", iconeSymbolique: "studio-line", groupe: "dessin", inputSchema: line },
  { ...mutation, toolId: "studio.dessin.rectangle", libelleFR: "Rectangle", raccourci: "R", iconeSymbolique: "studio-rectangle", groupe: "dessin", inputSchema: rectangle },
  { ...mutation, toolId: "studio.dessin.cote", libelleFR: "Cote", raccourci: "Shift+C", iconeSymbolique: "studio-dimension", groupe: "dessin", inputSchema: enteredDimension },
  { ...mutation, toolId: "studio.dessin.deplacer", libelleFR: "Déplacer", raccourci: "M", iconeSymbolique: "studio-move", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["id", "dx", "dy"], properties: { id, dx: number, dy: number } } },
  { ...mutation, toolId: "studio.dessin.modifier", libelleFR: "Modifier", raccourci: "E", iconeSymbolique: "studio-edit", groupe: "modification", inputSchema: { oneOf: [line, rectangle, enteredDimension] } },
  { ...mutation, toolId: "studio.dessin.supprimer", libelleFR: "Supprimer", raccourci: "Delete", iconeSymbolique: "studio-delete", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
  { ...mutation, toolId: "studio.calque.creer", libelleFR: "Nouveau calque", raccourci: "Shift+N", iconeSymbolique: "studio-layer-add", groupe: "calques", inputSchema: layer },
  { ...mutation, toolId: "studio.calque.modifier", libelleFR: "Régler le calque", raccourci: "Shift+L", iconeSymbolique: "studio-layer-edit", groupe: "calques", inputSchema: layer },
  { ...mutation, toolId: "studio.objet.calque", libelleFR: "Placer sur un calque", raccourci: "Shift+M", iconeSymbolique: "studio-layer-assign", groupe: "calques", inputSchema: { type: "object", additionalProperties: false, required: ["ids", "layerId"], properties: { ids, layerId: id } } },
  { ...mutation, toolId: "studio.objet.extruder", libelleFR: "Extruder", raccourci: "Shift+E", iconeSymbolique: "studio-extrude", groupe: "volume", inputSchema: { type: "object", additionalProperties: false, required: ["ids", "base", "height"], properties: { ids, base: number, height: positive, thickness: positive } } },
  { ...mutation, toolId: "studio.objet.aplatir", libelleFR: "Aplatir", raccourci: "Shift+F", iconeSymbolique: "studio-flatten", groupe: "volume", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
] as const) satisfies readonly StudioToolDescriptor[];

type ToolIdsOf<T extends readonly { readonly toolId: string }[]> = { readonly [K in keyof T]: T[K] extends { readonly toolId: infer I } ? I : never };
/** Every registry identifier, in registry order (read tools included). */
export const STUDIO_TOOL_IDS = Object.freeze(STUDIO_TOOLS.map((tool) => tool.toolId)) as unknown as ToolIdsOf<typeof STUDIO_TOOLS>;
export type StudioToolId = (typeof STUDIO_TOOL_IDS)[number];

/** Mutation identifiers only — the set an API command enum must accept (`z.enum(STUDIO_COMMAND_TOOL_IDS)`). */
export type StudioRegistryMutationToolId = Extract<(typeof STUDIO_TOOLS)[number], { readonly nature: "mutation" }>["toolId"];
export const STUDIO_COMMAND_TOOL_IDS = Object.freeze(
  STUDIO_TOOLS.filter((tool) => tool.nature === "mutation").map((tool) => tool.toolId),
) as unknown as readonly [StudioRegistryMutationToolId, ...StudioRegistryMutationToolId[]];

/** Compile-time half of the golden rule: registry mutations and model commands are the same set. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const STUDIO_REGISTRY_MATCHES_COMMANDS: Same<StudioRegistryMutationToolId, StudioCommandToolId> = true;

freezeTree(STUDIO_DOCUMENT_SCHEMA);
