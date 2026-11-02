import { describe, expect, it } from "vitest";
import {
  CAPACITES_PORTEE, CAPACITE_DU_BESOIN, capaciteDansPortee, capacitesDePortee, cibleDocument, couvre, familleDocument,
  problemeIdentifiantPortee, type AttributionPortee,
} from "./portees.js";

const a = (role: AttributionPortee["role"], scopeType: AttributionPortee["scopeType"], scopeId: string | null): AttributionPortee => ({ role, scopeType, scopeId });

describe("portées étroites — capacités ajoutées dans le périmètre", () => {
  it("Concepteur à l'étude X : modifie X, pas Y ; aucune autre capacité", () => {
    const at = [a("concepteur", "etude", "X")];
    expect(capaciteDansPortee(at, "modifier", { studyId: "X", variantIds: ["V1"] })).toEqual(at[0]);
    expect(capaciteDansPortee(at, "modifier", { studyId: "Y", variantIds: ["V9"] })).toBeNull();
    expect(capaciteDansPortee(at, "approuver", { studyId: "X" })).toBeNull();
    expect(capaciteDansPortee(at, "telecharger", { studyId: "X" })).toBeNull();
  });

  it("Concepteur à la variante V : seulement un contenu qui ne porte que sur V", () => {
    const at = [a("concepteur", "variante", "V")];
    expect(capaciteDansPortee(at, "modifier", { studyId: "X", variantIds: ["V"] })).not.toBeNull();
    expect(capaciteDansPortee(at, "modifier", { studyId: "X", variantIds: ["V", "W"] })).toBeNull();
    expect(capaciteDansPortee(at, "modifier", { studyId: "X" })).toBeNull();
    expect(capaciteDansPortee(at, "modifier", { studyId: "X", variantIds: [] })).toBeNull();
  });

  it("Relecteur : constater dans la variante ou la révision désignée", () => {
    expect(capaciteDansPortee([a("relecteur", "variante", "V")], "constater", { studyId: "X", variantIds: ["V"], revisionId: "R1" })).not.toBeNull();
    expect(capaciteDansPortee([a("relecteur", "variante", "V")], "constater", { studyId: "X", variantIds: ["W"] })).toBeNull();
    expect(capaciteDansPortee([a("relecteur", "revision", "R1")], "constater", { variantIds: ["V"], revisionId: "R1" })).not.toBeNull();
    expect(capaciteDansPortee([a("relecteur", "revision", "R1")], "constater", { variantIds: ["V"], revisionId: "R2" })).toBeNull();
    expect(capaciteDansPortee([a("relecteur", "variante", "V")], "modifier", { variantIds: ["V"] })).toBeNull();
  });

  it("Approbateur / Diffuseur : publications du périmètre seulement ; une publication coordonnée échappe aux portées variante et révision", () => {
    const pub = { studyId: "X", variantIds: ["V"], revisionId: "R3" };
    const coordonnee = { studyId: "X", variantIds: ["V", "W"], revisionId: "R3" };
    for (const [role, cap] of [["approbateur", "approuver"], ["diffuseur", "diffuser"]] as const) {
      expect(capaciteDansPortee([a(role, "etude", "X")], cap, coordonnee)).not.toBeNull();
      expect(capaciteDansPortee([a(role, "etude", "Y")], cap, pub)).toBeNull();
      expect(capaciteDansPortee([a(role, "variante", "V")], cap, pub)).not.toBeNull();
      expect(capaciteDansPortee([a(role, "variante", "V")], cap, coordonnee)).toBeNull();
      expect(capaciteDansPortee([a(role, "revision", "R3")], cap, pub)).not.toBeNull();
      expect(capaciteDansPortee([a(role, "revision", "R4")], cap, pub)).toBeNull();
      expect(capaciteDansPortee([a(role, "revision", "R3")], cap, coordonnee)).toBeNull();
    }
    expect(capaciteDansPortee([a("approbateur", "etude", "X")], "diffuser", pub)).toBeNull();
    expect(capaciteDansPortee([a("diffuseur", "etude", "X")], "approuver", pub)).toBeNull();
  });

  it("Portée documents : la famille ou le document désigné, pas les autres", () => {
    const surfaces = cibleDocument("tableau-surfaces")!;
    const dessin = cibleDocument("dessin:abc")!;
    expect(capaciteDansPortee([a("lecteur", "documents", "tableaux")], "telecharger", surfaces)).not.toBeNull();
    expect(capaciteDansPortee([a("lecteur", "documents", "tableau-surfaces")], "telecharger", surfaces)).not.toBeNull();
    expect(capaciteDansPortee([a("lecteur", "documents", "tableau-surfaces")], "telecharger", cibleDocument("programme-csv")!)).toBeNull();
    expect(capaciteDansPortee([a("lecteur", "documents", "dessin:abc")], "telecharger", dessin)).not.toBeNull();
    expect(capaciteDansPortee([a("lecteur", "documents", "dessin:abc")], "telecharger", cibleDocument("dessin:def")!)).toBeNull();
    expect(capaciteDansPortee([a("lecteur", "documents", "tableaux")], "modifier", surfaces)).toBeNull();
    // Un document ne vaut jamais une étude : la portée documents ne couvre aucune cible Studio.
    expect(capaciteDansPortee([a("concepteur", "documents", "studio")], "modifier", { studyId: "X", variantIds: ["V"] })).toBeNull();
  });

  it("la portée projet et une cible vide ne donnent rien ici (relèvent de deriveAccess)", () => {
    expect(capaciteDansPortee([a("concepteur", "projet", null)], "modifier", { studyId: "X", variantIds: ["V"] })).toBeNull();
    expect(capaciteDansPortee([a("concepteur", "etude", "X")], "modifier", {})).toBeNull();
    expect(couvre(a("concepteur", "etude", null), { studyId: "X" })).toBe(false);
    expect(capacitesDePortee("concepteur", "projet")).toEqual([]);
  });

  it("matrice : révisions immuables (Concepteur rien) ; Coordinateur et Lecteur rien hors documents ; tout rôle télécharge ses documents", () => {
    expect(CAPACITES_PORTEE.concepteur.revision).toEqual([]);
    for (const t of ["etude", "variante", "revision"] as const) {
      expect(CAPACITES_PORTEE.coordinateur[t]).toEqual([]);
      expect(CAPACITES_PORTEE.lecteur[t]).toEqual([]);
    }
    for (const role of Object.keys(CAPACITES_PORTEE) as (keyof typeof CAPACITES_PORTEE)[]) expect(CAPACITES_PORTEE[role].documents).toEqual(["telecharger"]);
    expect(CAPACITE_DU_BESOIN).toEqual({ write: "modifier", modify: "modifier", approve: "approuver", publish: "diffuser", export: "telecharger" });
    // Lire, commenter et posséder ne sont jamais ouverts par une portée étroite.
    for (const need of ["read", "comment", "owner"]) expect(CAPACITE_DU_BESOIN[need]).toBeUndefined();
  });

  it("familles et identifiants : l'archive du projet entier n'est pas désignable", () => {
    expect(familleDocument("plan-lecture-n1")).toBe("bilan");
    expect(familleDocument("atelier-ifc")).toBe("atelier");
    expect(familleDocument("studio:pub1")).toBe("studio");
    expect(familleDocument("studio-dossier:d1")).toBe("studio-dossier");
    expect(familleDocument("harmonie-etape-03")).toBe("harmonie");
    expect(familleDocument("archive-projet")).toBeNull();
    expect(cibleDocument("archive-projet")).toBeNull();
    expect(problemeIdentifiantPortee("documents", "archive-projet")).not.toBeNull();
    expect(problemeIdentifiantPortee("documents", "tableaux")).toBeNull();
    expect(problemeIdentifiantPortee("documents", "dessin:0f0e")).toBeNull();
    expect(problemeIdentifiantPortee("etude", "")).not.toBeNull();
    expect(problemeIdentifiantPortee("etude", "studio_study_1")).toBeNull();
    expect(problemeIdentifiantPortee("etude", "a b")).not.toBeNull();
    expect(problemeIdentifiantPortee("projet", null)).toBeNull();
    expect(problemeIdentifiantPortee("projet", "x")).not.toBeNull();
  });
});
