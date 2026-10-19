import type { StudioCommandToolId } from "./document-2d.js";
import { OUTILS_ARCHITECTURE } from "./registre/architecture.js";
import { OUTILS_CALQUES } from "./registre/calques.js";
import { freezeTree, type StudioToolDescriptor } from "./registre/communs.js";
import { OUTILS_DESSIN } from "./registre/dessin.js";
import { OUTILS_MODIFICATION } from "./registre/modification.js";
import { OUTILS_PROPRIETES } from "./registre/proprietes.js";
import { STUDIO_DOCUMENT_SCHEMA } from "./registre/schemas.js";
import { OUTILS_VOLUME } from "./registre/volume.js";
import { OUTILS_VOLUME_LIBRE } from "./registre/volume-libre.js";
import { OUTILS_SCENES } from "./scenes/registre.js";

/**
 * Native registry, single source for the toolbar, shortcuts and the API enum. These tools never expose an agent or MCP entry point.
 * Composé des familles (`registre/dessin.ts`, `modification.ts`, `calques.ts`, `volume.ts`), dans cet ordre ; les schémas
 * des objets sont déclarés par leur module (`objets/`).
 */
export { STUDIO_DOCUMENT_SCHEMA } from "./registre/schemas.js";
export type { StudioToolDescriptor, StudioToolGroup } from "./registre/communs.js";

export const STUDIO_TOOLS = freezeTree([
  ...OUTILS_DESSIN,
  ...OUTILS_MODIFICATION,
  ...OUTILS_CALQUES,
  ...OUTILS_VOLUME,
  ...OUTILS_VOLUME_LIBRE,
  ...OUTILS_ARCHITECTURE,
  ...OUTILS_PROPRIETES,
  ...OUTILS_SCENES,
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
