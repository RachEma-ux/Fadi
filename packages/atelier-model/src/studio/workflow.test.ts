import { describe, expect, it } from "vitest";
import { estPhaseWorkflowStudio, STUDIO_PHASES_WORKFLOW } from "./workflow.js";

describe("workflow de conception déclaré (REF-01 §06)", () => {
  it("sept phases, dans l'ordre et sous le nom de la référence", () => {
    expect(STUDIO_PHASES_WORKFLOW.map((p) => p.libelleFR).join(" → ")).toBe("Cadrer → Explorer → Concevoir → Contrôler → Coordonner et corriger → Approuver → Publier");
    expect(STUDIO_PHASES_WORKFLOW.map((p) => p.rang)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(STUDIO_PHASES_WORKFLOW.map((p) => p.id)).size).toBe(7);
    expect(Object.isFrozen(STUDIO_PHASES_WORKFLOW) && STUDIO_PHASES_WORKFLOW.every((p) => Object.isFrozen(p))).toBe(true);
  });

  it("seules les phases déclarées sont reconnues (aucune valeur devinée)", () => {
    for (const p of STUDIO_PHASES_WORKFLOW) expect(estPhaseWorkflowStudio(p.id)).toBe(true);
    for (const v of ["", "Cadrer", "controle", null, undefined, 3, "non-declaree"]) expect(estPhaseWorkflowStudio(v)).toBe(false);
  });
});
