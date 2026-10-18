import { STUDIO_CONTRACT } from "./document-2d.js";

/** Minimal native registry. These tools never expose an agent or MCP entry point. */
const id = { type: "string", minLength: 1, pattern: "^(?![\\s\\S]*\\u0000)[\\s\\S]*\\S[\\s\\S]*$" } as const;
const number = { type: "number" } as const;
const point = { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: number, y: number } } as const;
const line = { type: "object", additionalProperties: false, required: ["id", "type", "start", "end"], properties: { id, type: { const: "line" }, start: point, end: point } } as const;
const rectangle = { type: "object", additionalProperties: false, required: ["id", "type", "origin", "width", "height"], properties: { id, type: { const: "rectangle" }, origin: point, width: { type: "number", exclusiveMinimum: 0 }, height: { type: "number", exclusiveMinimum: 0 } } } as const;
const shape = { oneOf: [line, rectangle] } as const;
export const STUDIO_DOCUMENT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["id", "schemaVersion", "units", "frame", "objects"],
  properties: { id, schemaVersion: { const: "studio-document/1" }, units: { const: "m" }, frame: { const: "local-2d" }, objects: { type: "array", items: shape } },
} as const;

export interface StudioToolDescriptor {
  readonly toolId: string;
  readonly contractVersion: typeof STUDIO_CONTRACT;
  readonly refusalCodes: readonly ["studio-invalid"];
  readonly libelleFR: string;
  readonly raccourci: string;
  readonly iconeSymbolique: string;
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

const common = { contractVersion: STUDIO_CONTRACT, refusalCodes: ["studio-invalid"] as const };

export const STUDIO_TOOLS = freezeTree([
  { ...common, toolId: "studio.dessin.selection", libelleFR: "Sélection", raccourci: "Space", iconeSymbolique: "studio-pointer", inputSchema: { type: "object", additionalProperties: false, required: ["id"], properties: { id } }, outputSchema: { anyOf: [shape, { type: "null" }] }, agentExposure: "none", supportsDryRun: true },
  { ...common, toolId: "studio.dessin.ligne", libelleFR: "Ligne", raccourci: "L", iconeSymbolique: "studio-line", inputSchema: line, outputSchema: STUDIO_DOCUMENT_SCHEMA, agentExposure: "none", supportsDryRun: true },
  { ...common, toolId: "studio.dessin.rectangle", libelleFR: "Rectangle", raccourci: "R", iconeSymbolique: "studio-rectangle", inputSchema: rectangle, outputSchema: STUDIO_DOCUMENT_SCHEMA, agentExposure: "none", supportsDryRun: true },
  { ...common, toolId: "studio.dessin.deplacer", libelleFR: "Déplacer", raccourci: "M", iconeSymbolique: "studio-move", inputSchema: { type: "object", additionalProperties: false, required: ["id", "dx", "dy"], properties: { id, dx: number, dy: number } }, outputSchema: STUDIO_DOCUMENT_SCHEMA, agentExposure: "none", supportsDryRun: true },
  { ...common, toolId: "studio.dessin.modifier", libelleFR: "Modifier", raccourci: "E", iconeSymbolique: "studio-edit", inputSchema: shape, outputSchema: STUDIO_DOCUMENT_SCHEMA, agentExposure: "none", supportsDryRun: true },
] as const) satisfies readonly StudioToolDescriptor[];

freezeTree(STUDIO_DOCUMENT_SCHEMA);
