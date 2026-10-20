import { describe, expect, it } from "vitest";
import { outilParId } from "../catalogue-outils.js";
import { machineParId } from "./index.js";
import { MACHINES_FORMES } from "./registre-formes.js";

const IDS = ["rectangle", "rectangle-pivote", "cercle", "polygone", "arc", "arc-2-points", "arc-3-points", "secteur"];

describe("Registre des machines de formes", () => {
  it("couvre les 8 outils de formes du lot 2 (Texte 3D exclu, P-7), ids du catalogue", () => {
    expect(MACHINES_FORMES.map((m) => m.id)).toEqual(IDS);
    for (const id of IDS) {
      expect(outilParId(id)).not.toBeNull();
      expect(machineParId(id)?.id).toBe(id);
    }
    expect(MACHINES_FORMES.some((m) => m.id === "texte-3d")).toBe(false);
  });

  it("chaque machine a une vue initiale avec la consigne de l'étape 1 du catalogue", () => {
    for (const m of MACHINES_FORMES) {
      const v = m.vue(m.initial(), { modele: { racine: { sommets: {}, aretes: {}, faces: {}, courbes: {}, occurrences: {} }, definitions: {}, prochainId: 1 }, selection: [], separateurDecimal: "," });
      expect(v.consigne).toBe(outilParId(m.id)?.etapes[0]?.consigne);
      expect(v.erreur).toBeNull();
    }
  });
});
