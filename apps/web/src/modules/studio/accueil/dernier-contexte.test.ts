import { describe, expect, it } from "vitest";
import { ajouterContexte, lireContextes, RECENTS_MAX, retirerContexte, type ContexteStudio } from "./dernier-contexte";

const c = (v: string, extra: Partial<ContexteStudio> = {}): ContexteStudio => ({ projectId: "p1", studyId: "s1", variantId: v, domaine: null, planche: null, quand: 1, ...extra });

describe("dernier contexte personnel de Studio (suggestion)", () => {
  it("relit une liste stockée et écarte ce qui est mal formé, sans rien corriger", () => {
    expect(lireContextes(null)).toEqual([]);
    expect(lireContextes("{pas du json")).toEqual([]);
    expect(lireContextes(JSON.stringify({ projectId: "p" }))).toEqual([]);
    const lu = lireContextes(JSON.stringify([
      { projectId: "p1", studyId: "s1", variantId: "v1", domaine: "bim", planche: "double", noms: { etude: "Étude", autre: "x" }, quand: 5 },
      { projectId: "p1", studyId: "../s", variantId: "v2" },
      { projectId: "p1", studyId: "s1", variantId: "v3", domaine: "inconnu", planche: "4d" },
    ]));
    expect(lu).toEqual([
      { projectId: "p1", studyId: "s1", variantId: "v1", domaine: "bim", planche: "double", noms: { etude: "Étude" }, quand: 5 },
      { projectId: "p1", studyId: "s1", variantId: "v3", domaine: null, planche: null, quand: 0 },
    ]);
  });

  it("la dernière ouverte passe en tête, une variante n'y figure qu'une fois, la liste est bornée", () => {
    let l: ContexteStudio[] = [];
    for (let i = 0; i < RECENTS_MAX + 3; i += 1) l = ajouterContexte(l, c(`v${i}`));
    expect(l).toHaveLength(RECENTS_MAX);
    expect(l[0]!.variantId).toBe(`v${RECENTS_MAX + 2}`);
    l = ajouterContexte(l, c("v5", { domaine: "documentation", noms: { variante: "B" } }));
    expect(l.map((x) => x.variantId).filter((v) => v === "v5")).toHaveLength(1);
    expect(l[0]).toMatchObject({ variantId: "v5", domaine: "documentation", noms: { variante: "B" } });
    expect(retirerContexte(l, c("v5")).some((x) => x.variantId === "v5")).toBe(false);
  });
});
