import { STUDIO_CONTRACT } from "../noyau/limites.js";
import { STUDIO_DOCUMENT_SCHEMA } from "./schemas.js";

/** Contrat d'un descripteur d'outil du registre et champs communs aux familles (`dessin`, `modification`, `calques`, `volume`). */

export type StudioToolGroup = "dessin" | "modification" | "calques" | "volume" | "volume-libre" | "architecture";
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

export function freezeTree<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

export const common = { contractVersion: STUDIO_CONTRACT, refusalCodes: ["studio-invalid"] as const, agentExposure: "none", supportsDryRun: true } as const;
export const mutation = { ...common, nature: "mutation", outputSchema: STUDIO_DOCUMENT_SCHEMA } as const;
