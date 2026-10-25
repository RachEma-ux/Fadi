/**
 * A.3-08 — inventaire de couverture des types 3D : aucun type annoncé disponible sans test associé existant ; les types
 * avancés du référentiel restent dans l'inventaire, « non disponibles », sans outil ni test.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STUDIO_TOOLS } from "./registry.js";
import { STUDIO_COUVERTURE_3D, studioControlerCouverture3d, studioTypes3dNonDisponibles, type StudioTestType3d, type StudioTypeCouverture3d } from "./couverture-3d.js";

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
/** Le test cité existe : son fichier contient un `it(...)` de ce libellé exact. */
function testExiste(t: StudioTestType3d): boolean {
  let source: string;
  try { source = readFileSync(RACINE + t.fichier, "utf8"); } catch { return false; }
  return [`it("${t.libelle}"`, `it('${t.libelle}'`, `it(\`${t.libelle}\``].some((d) => source.includes(d));
}

describe("A.3-08 — inventaire de couverture des types 3D", () => {
  it("cohérent : chaque type disponible cite au moins un test existant (fichier et libellé exact), chaque type avancé est non disponible sans outil ni test", () => {
    expect(studioControlerCouverture3d(STUDIO_COUVERTURE_3D, testExiste)).toEqual([]);
  });

  it("échoue si un type est annoncé disponible sans test associé, ou avec un test introuvable", () => {
    const annonce: StudioTypeCouverture3d = { ...STUDIO_COUVERTURE_3D.find((t) => t.id === "surface-complexe")!, etat: "disponible" };
    expect(studioControlerCouverture3d([annonce], testExiste)).toEqual(["surface-complexe : annoncé disponible sans test associé"]);
    const faux: StudioTypeCouverture3d = { ...annonce, tests: [{ fichier: "packages/atelier-model/src/studio/objets-3d/objets-3d.test.ts", libelle: "surface NURBS de deux boîtes" }] };
    expect(studioControlerCouverture3d([faux], testExiste)[0]).toMatch(/test introuvable « surface NURBS de deux boîtes »/);
    // Lot F2 : le booléen est disponible parce qu'il cite des tests existants ; sans eux il serait refusé.
    const booleen = STUDIO_COUVERTURE_3D.find((t) => t.id === "booleen")!;
    expect(booleen).toMatchObject({ etat: "disponible", outils: ["studio.solide.booleen"] });
    expect(studioControlerCouverture3d([{ ...booleen, tests: [] }], testExiste)).toEqual(["booleen : annoncé disponible sans test associé"]);
    const offert: StudioTypeCouverture3d = { ...STUDIO_COUVERTURE_3D.find((t) => t.id === "groupe-3d")!, outils: ["studio.solide.boite"] };
    expect(studioControlerCouverture3d([offert], testExiste)).toEqual(["groupe-3d : non disponible mais offert par un outil du registre"]);
  });

  it("types avancés du référentiel (§ 4.1, S5, PERF-07) : sommets et arêtes, groupe, composant, courbe exacte 3D, surface complexe, BRep fournisseur — tous non disponibles (le booléen est disponible depuis le lot F2)", () => {
    expect(studioTypes3dNonDisponibles().map((t) => t.id)).toEqual(["sommets-aretes", "groupe-3d", "composant-3d", "courbe-exacte-3d", "surface-complexe", "brep-fournisseur"]);
    for (const t of STUDIO_COUVERTURE_3D) expect(t.source.document).toBe("STUDIO-RT-001 V1.0");
    expect(Object.isFrozen(STUDIO_COUVERTURE_3D)).toBe(true);
    expect(Object.isFrozen(STUDIO_COUVERTURE_3D[0]!.tests)).toBe(true);
  });

  it("aucun outil du registre ne porte un type non disponible ; les outils des types disponibles existent dans la barre 3D", () => {
    const outils3d = new Set<string>(STUDIO_TOOLS.filter((t) => t.groupe === "volume-libre").map((t) => t.toolId));
    for (const t of STUDIO_COUVERTURE_3D.filter((x) => x.etat === "disponible")) for (const o of t.outils) expect(outils3d.has(o), o).toBe(true);
    const libelles = STUDIO_TOOLS.map((t) => t.libelleFR.toLowerCase());
    for (const t of studioTypes3dNonDisponibles()) {
      for (const mot of t.libelle.toLowerCase().split(/[ ():,]+/).filter((m) => m.length > 6)) expect(libelles.some((l) => l.includes(mot)), `${t.id} : « ${mot} » proposé par un outil`).toBe(false);
    }
  });
});
