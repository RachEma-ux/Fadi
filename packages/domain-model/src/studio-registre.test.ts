import { describe, expect, it } from "vitest";
import * as r from "./studio-registre.js";
import { SCHEMA_DOCUMENT2D } from "./studio-document2d.js";

const outils = r.REGISTRE_OUTILS_STUDIO;
const CHAMPS = ["agentExposure", "contractVersion", "domaine", "id", "inputSchema", "libelle", "outputSchemaRef", "raccourci", "supportsDryRun"];

describe("registre des outils de Studio", () => {
  it("identifiants studio.<domaine>.<outil>, uniques ; raccourcis uniques", () => {
    expect(outils.map((o) => o.id)).toEqual(["studio.dessin.selection", "studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cote", "studio.dessin.deplacer"]);
    for (const o of outils) {
      expect(o.id, o.id).toMatch(/^studio\.[a-z]+\.[a-z-]+$/);
      expect(r.MOTIF_ID_OUTIL.test(o.id)).toBe(true);
      expect(o.id.split(".")[1]).toBe(o.domaine);
    }
    expect(new Set(outils.map((o) => o.id)).size).toBe(outils.length);
    expect(new Set(outils.map((o) => o.raccourci)).size).toBe(outils.length);
    expect(outils.find((o) => o.id === "studio.dessin.rectangle")?.raccourci).toBe("R");
    expect(outils.find((o) => o.id === "studio.dessin.deplacer")?.raccourci).toBe("M");
  });

  it("contrat déclaré : version, schéma d'entrée, référence de sortie, essai à blanc ; aucune exposition aux agents", () => {
    for (const o of outils) {
      expect(o.contractVersion).toBe(r.VERSION_CONTRAT_OUTILS);
      expect(o.outputSchemaRef).toBe(SCHEMA_DOCUMENT2D);
      expect(o.agentExposure).toBe("none");
      expect(typeof o.supportsDryRun).toBe("boolean");
      expect(o.supportsDryRun).toBe(true);
      expect(o.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(o.libelle.trim().length).toBeGreaterThan(0);
      // Le schéma d'entrée est une donnée pure (sérialisable sans perte).
      expect(JSON.parse(JSON.stringify(o.inputSchema))).toEqual(o.inputSchema);
    }
  });

  it("le catalogue n'accorde aucun droit : aucun champ hors contrat (droits, rôles, permissions)", () => {
    for (const o of outils) expect(Object.keys(o).sort()).toEqual(CHAMPS);
  });

  it("catalogue figé, jusque dans les schémas", () => {
    expect(Object.isFrozen(outils)).toBe(true);
    for (const o of outils) {
      expect(Object.isFrozen(o)).toBe(true);
      expect(Object.isFrozen(o.inputSchema)).toBe(true);
    }
    expect(() => (outils as r.OutilStudio[]).push(outils[0]!)).toThrow();
    expect(() => {
      (outils[0] as { agentExposure: string }).agentExposure = "mcp";
    }).toThrow();
    expect(r.outilStudio("studio.dessin.ligne")?.libelle).toBe("Ligne");
    expect(r.outilStudio("studio.dessin.inconnu")).toBeNull();
  });
});
