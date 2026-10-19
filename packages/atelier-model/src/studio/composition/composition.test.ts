import { describe, expect, it } from "vitest";
import { STUDIO_TYPES_OBJETS } from "../objets/index.js";
import type { StudioOutilCreationForme } from "../objets/type.js";
import { STUDIO_APPLIED_TOOL_IDS } from "./commandes.js";
import type { StudioCommandToolId } from "./types.js";

/**
 * Couche de composition : les outils de création que déclarent les objets (`StudioOutilCreationForme`, nommés dans
 * `objets/` pour ne pas dépendre du contrat composé) sont des commandes du contrat et sont acceptés par l'aiguillage.
 */
const outilsDuContrat: [StudioOutilCreationForme] extends [StudioCommandToolId] ? true : false = true;

describe("composition : outils de création des objets = commandes du contrat", () => {
  it("chaque outil de création est accepté par applyStudioCommands", () => {
    expect(outilsDuContrat).toBe(true);
    for (const t of Object.values(STUDIO_TYPES_OBJETS)) expect(STUDIO_APPLIED_TOOL_IDS).toContain(t.outilCreation);
  });
});
