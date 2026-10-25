import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, StudioValidationError } from "../document-2d.js";
import { comparerElementsStudio } from "../comparaison.js";
import { lireIfcStudio } from "../import-ifc/import-ifc.js";
import { comparerModeleExterne, lireModeleExterne, passageModeleExterne, validerMetaModeleExterne, type StudioMetaModeleExterne } from "./modeles-externes.js";

const RECETTE = readFileSync(new URL("../import-ifc/fixtures/recette-ifc2x3.ifc", import.meta.url), "utf8");
const meta = (x: Partial<StudioMetaModeleExterne> = {}): StudioMetaModeleExterne => validerMetaModeleExterne({
  reference: "Architecte — bâtiment A", auteur: "Cabinet partenaire", discipline: "architecture", format: "ifc", version: "B",
  uniteDeclaree: "mm", transformation: null, nomFichier: "recette-ifc2x3.ifc", ...x,
});

describe("Modèle externe — référencement (TR-EX-066)", () => {
  it("métadonnées déclarées : auteur, discipline, format, version, unité, transformation ; champ inconnu refusé", () => {
    expect(meta()).toEqual({ reference: "Architecte — bâtiment A", auteur: "Cabinet partenaire", discipline: "architecture", format: "ifc", version: "B", uniteDeclaree: "mm", transformation: null, nomFichier: "recette-ifc2x3.ifc" });
    expect(meta({ transformation: { dx: 1, dy: 2, dz: 0, rotation: 0 } }).transformation).toEqual({ dx: 1, dy: 2, dz: 0, rotation: 0 });
    expect(() => validerMetaModeleExterne({ ...meta(), statut: "accepte" })).toThrow(/champ inconnu/);
    expect(() => validerMetaModeleExterne({ ...meta(), auteur: " " })).toThrow(StudioValidationError);
    expect(() => validerMetaModeleExterne({ ...meta(), format: "dwg" })).toThrow(/format ifc/);
    expect(() => validerMetaModeleExterne({ ...meta(), uniteDeclaree: "pouce" })).toThrow(/unité/);
  });

  it("lecture dans un document à part : la variante n'est jamais modifiée ; unité déclarée comparée à l'unité lue", () => {
    const l = lireModeleExterne(RECETTE, meta());
    expect(l.document.id).toBe("modele-externe");
    expect(l.document.architecture).toHaveLength(4);
    expect(l.uniteConcorde).toBe(true);
    expect(lireModeleExterne(RECETTE, meta({ uniteDeclaree: "m" })).uniteConcorde).toBe(false);
    const sansUnite = lireModeleExterne(RECETTE.replace("#10=IFCUNITASSIGNMENT((#11,#12));", "#10=IFCUNITASSIGNMENT((#12));"), meta());
    expect(sansUnite.uniteConcorde).toBeNull();
    expect(sansUnite.document.architecture).toBeUndefined();
  });
});

describe("Modèle externe — comparaison avec la révision courante (comparaison.ts réemployé)", () => {
  const lecture = lireModeleExterne(RECETTE, meta());

  it("variante vide : tout le modèle reçu est « ajouté » ; écarts : transformation non déclarée, éléments non natifs", () => {
    const c = comparerModeleExterne(newStudioDocument("v"), "rev-1", lecture, meta());
    expect(c.revisionId).toBe("rev-1");
    expect(c.resume.architecture).toEqual({ ajoute: 4, supprime: 0, modifie: 0, identique: 0, deplace: 0 });
    expect(c.resume.solides.ajoute).toBe(1);
    expect(c.resume.nonNatifs.ajoute).toBe(3);
    expect(c.resume.calques.ajoute).toBe(2);
    expect(c.identiques).toBe(false);
    expect(c.ecarts).toEqual(["transformation-non-declaree", "elements-non-natifs"]);
    expect(c.differencesTotal).toBe(8);
  });

  it("variante qui contient déjà ce modèle (même GlobalId) : identique ; une nouvelle version déplacée : murs « modifiés »", () => {
    const courant = applyStudioCommands(newStudioDocument("modele-externe"), lireIfcStudio(RECETTE).commandes);
    const meme = comparerModeleExterne(courant, "rev-2", lecture, meta({ transformation: { dx: 0, dy: 0, dz: 0, rotation: 0 } }));
    expect(meme.identiques).toBe(true);
    expect(meme.ecarts).toEqual(["elements-non-natifs"]);
    const decale = lireModeleExterne(RECETTE, meta({ transformation: { dx: 1, dy: 0, dz: 0, rotation: 0 } }));
    const c = comparerModeleExterne(courant, "rev-2", decale, meta({ transformation: { dx: 1, dy: 0, dz: 0, rotation: 0 } }));
    expect(c.resume.architecture).toEqual({ ajoute: 0, supprime: 0, modifie: 2, identique: 2, deplace: 0 });
    expect(c.differences.filter((d) => d.famille === "architecture").map((d) => [d.type, d.etat, d.proprietes])).toEqual([["wall", "modifie", ["geometrie"]], ["wall", "modifie", ["geometrie"]]]);
  });

  it("comparerElementsStudio : géométrie, calque et attributs distingués ; type changé = supprimé puis ajouté", () => {
    const a = applyStudioCommands(newStudioDocument("a"), [
      { toolId: "studio.architecture.mur", params: { id: "m", type: "wall", axis: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
      { toolId: "studio.architecture.ouverture", params: { id: "o", type: "opening", hostId: "m", position: 1, width: 1, height: 2, sill: 0 } },
    ]);
    const b = applyStudioCommands(a, [{ toolId: "studio.architecture.modifier", params: { id: "o", type: "opening", hostId: "m", position: 1, width: 1, height: 2, sill: 0, kind: "porte" } }]);
    expect(comparerElementsStudio(a, b).elements.find((x) => x.id === "o")).toEqual({ id: "o", famille: "architecture", etat: "modifie", type: "opening", proprietes: ["attributs"] });
    expect(comparerElementsStudio(a, a).identiques).toBe(true);
  });
});

describe("Modèle externe — acceptation ou refus explicites", () => {
  const ouvert = { statut: "compare" as const, revisionComparee: "rev-2", uniteLue: true };
  it("accepter : rôle habilité, comparaison faite avec la révision courante, unité lue", () => {
    expect(passageModeleExterne(ouvert, "accepter", { habilite: true, revisionCourante: "rev-2" })).toEqual({ statut: "accepte" });
    expect(passageModeleExterne(ouvert, "accepter", { habilite: false, revisionCourante: "rev-2" })).toEqual({ refus: "role-insuffisant" });
    expect(passageModeleExterne(ouvert, "accepter", { habilite: true, revisionCourante: "rev-3" })).toEqual({ refus: "comparaison-perimee" });
    expect(passageModeleExterne({ ...ouvert, uniteLue: false }, "accepter", { habilite: true, revisionCourante: "rev-2" })).toEqual({ refus: "unite-non-evaluee" });
  });
  it("refuser : rôle habilité et motif obligatoire ; une décision est définitive ; comparer de nouveau reste possible avant", () => {
    expect(passageModeleExterne(ouvert, "refuser", { habilite: true, revisionCourante: "x", motif: "Repère faux" })).toEqual({ statut: "refuse" });
    expect(passageModeleExterne(ouvert, "refuser", { habilite: true, revisionCourante: "x", motif: "  " })).toEqual({ refus: "motif-obligatoire" });
    expect(passageModeleExterne(ouvert, "comparer", { habilite: false, revisionCourante: "rev-9" })).toEqual({ statut: "compare" });
    for (const statut of ["accepte", "refuse"] as const) for (const action of ["comparer", "accepter", "refuser"] as const) {
      expect(passageModeleExterne({ ...ouvert, statut }, action, { habilite: true, revisionCourante: "rev-2", motif: "m" })).toEqual({ refus: "deja-decide" });
    }
  });
});
