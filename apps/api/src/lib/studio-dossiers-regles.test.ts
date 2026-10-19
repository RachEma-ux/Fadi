import { describe, expect, it } from "vitest";
import {
  borneAjustements, codeErreurDossier, controleFeuillesDossier, definitionDeSaisie, empreinteSaisie, journalBorne, STUDIO_DOSSIER_ERREURS, saisieDeDefinition, saisieModifiee, studioDossierCreateSchema, studioSheetCreateSchema,
  studioSheetUpdateSchema,
} from "./studio-dossiers-regles.js";
import { construireManifeste, contenuDe, empreinteManifeste, formatsDuContenu } from "./studio-publication-statuts.js";

/** Règles pures des feuilles composées, des dossiers (E.3-01 à E.3-03) et du dessin 2D indépendant (E.3-07). */
const saisie = { number: "A-101", title: "Plan", format: "A3" as const, orientation: "paysage" as const, scale: "ajuster" as const };
const H = (c: string) => c.repeat(64);

describe("feuilles composées : saisie, définition, rejeu", () => {
  it("schémas stricts : échelle normalisée, champ inconnu refusé, modification non vide", () => {
    expect(studioSheetCreateSchema.safeParse(saisie).success).toBe(true);
    expect(studioSheetCreateSchema.safeParse({ ...saisie, scale: 75 }).success).toBe(false);
    expect(studioSheetCreateSchema.safeParse({ ...saisie, document: {} }).success).toBe(false);
    expect(studioSheetUpdateSchema.safeParse({}).success).toBe(false);
    expect(studioSheetUpdateSchema.safeParse({ revisionId: "rev_1" }).success).toBe(true);
  });

  it("définition contrôlée par le modèle : calques choisis, auteur vide retiré ; refus en 400", () => {
    const r = definitionDeSaisie({ ...saisie, layers: ["cotes", "cotes"], author: "  " });
    expect(r).toEqual({ definition: { numero: "A-101", titre: "Plan", format: "A3", orientation: "paysage", echelle: "ajuster", vueSource: { type: "planche-2d", calques: ["cotes"] } } });
    expect(definitionDeSaisie({ ...saisie, number: " " })).toMatchObject({ refus: { status: 400, body: { code: "sheet_definition_invalid" } } });
  });

  it("modification partielle : seuls les champs fournis changent ; aller-retour de la définition", () => {
    const d = (definitionDeSaisie({ ...saisie, author: "Équipe A" }) as { definition: Parameters<typeof saisieDeDefinition>[0] }).definition;
    expect(definitionDeSaisie(saisieDeDefinition(d))).toEqual({ definition: d });
    expect(saisieModifiee(d, { title: "Plan RDC", layers: undefined })).toMatchObject({ title: "Plan RDC", number: "A-101", author: "Équipe A", layers: null });
  });

  it("empreinte de rejeu : indépendante de requestId et de l'ordre des clés", () => {
    expect(empreinteSaisie({ ...saisie, requestId: "a" })).toBe(empreinteSaisie({ scale: "ajuster", title: "Plan", number: "A-101", orientation: "paysage", format: "A3", requestId: "b" }));
    expect(empreinteSaisie({ ...saisie, title: "Autre" })).not.toBe(empreinteSaisie(saisie));
  });
});

describe("dossiers : feuilles ordonnées, distinctes et connues", () => {
  it("schéma : au moins une feuille ; métré facultatif", () => {
    expect(studioDossierCreateSchema.safeParse({ title: "D", sheetIds: [] }).success).toBe(false);
    expect(studioDossierCreateSchema.safeParse({ title: "D", sheetIds: ["s1"], quantities: { variantId: "v1" } }).success).toBe(true);
    expect(studioDossierCreateSchema.safeParse({ title: "D", sheetIds: ["s1"], quantities: null }).success).toBe(true);
  });
  it("doublon et feuille inconnue refusés en 400", () => {
    expect(controleFeuillesDossier(["s1", "s2"], new Set(["s1", "s2"]))).toBeNull();
    expect(controleFeuillesDossier(["s1", "s1"], new Set(["s1"]))?.body).toMatchObject({ code: "dossier_sheet_duplicate" });
    expect(controleFeuillesDossier(["s1", "s9"], new Set(["s1"]))?.body).toMatchObject({ code: "dossier_sheet_unknown", sheetIds: ["s9"] });
  });
});

describe("E.3-07 : dessin 2D indépendant", () => {
  const principale = { role: "principale" as const, variantId: "v_a", revisionId: "r_a1", documentHash: H("a") };
  const meta = { projectCode: "P", projectName: "Projet", studyName: "Étude", variantName: "A", revisionCreatedAt: "2026-10-19T08:00:00.000Z" };
  const doc = (format: string) => ({ format, fileName: `x.${format}`, mime: "m", size: 1, sha256: H(format === "pdf" ? "1" : format === "svg" ? "2" : "3") });
  it("formats : SVG, DXF et feuille PDF, sans IFC ; complet inchangé", () => {
    expect(formatsDuContenu("dessin-2d")).toEqual(["svg", "dxf", "pdf"]);
    expect(formatsDuContenu("complet")).toEqual(["svg", "dxf", "ifc", "pdf"]);
  });
  it("manifeste : `contenu` porté par le dessin 2D seul ; empreinte historique d'un dossier complet inchangée", () => {
    const docs = ["svg", "dxf", "pdf"].map(doc);
    const complet = construireManifeste([principale], meta, docs);
    expect("contenu" in complet).toBe(false);
    expect(construireManifeste([principale], meta, docs, "complet")).toEqual(complet);
    const dessin = construireManifeste([principale], meta, docs, "dessin-2d");
    expect(dessin.contenu).toBe("dessin-2d");
    expect(contenuDe(dessin)).toBe("dessin-2d");
    expect(contenuDe(complet)).toBe("complet");
    expect(empreinteManifeste(dessin)).not.toBe(empreinteManifeste(complet));
  });
  it("refuse une variante coordonnée ou un IFC dans un dessin 2D", () => {
    const coord = { role: "coordonnee" as const, variantId: "v_b", revisionId: "r_b1", documentHash: H("b") };
    expect(() => construireManifeste([principale, coord], meta, [doc("svg")], "dessin-2d")).toThrow("studio_manifest_drawing_coordinated");
    expect(() => construireManifeste([principale], meta, [doc("ifc")], "dessin-2d")).toThrow("studio_manifest_drawing_ifc");
  });
});

describe("dossiers : borne du journal des ajustements du métré (I-2) et codes d'erreur du catalogue (M-4, M-7)", () => {
  const journal = [{ seq: 1, id: "a1" }, { seq: 2, id: "a2" }, { seq: 3, id: "a3" }];
  it("épinglage : séquence max courante ; même métré : borne conservée ; métré retiré : null", () => {
    const ancien = { variantId: "v1", revisionId: "r1", seq: 2 };
    expect(borneAjustements(null, { variantId: "v1", revisionId: "r1" }, 2)).toBe(2);
    expect(borneAjustements(null, { variantId: "v1", revisionId: "r1" }, null)).toBeNull();
    // Un ajustement ajouté après l'épinglage (séquence max 3) n'entre pas tant que le métré n'est pas réépinglé.
    expect(borneAjustements(ancien, { variantId: "v1", revisionId: "r1" }, 3)).toBe(2);
    expect(borneAjustements(ancien, { variantId: "v1", revisionId: "r2" }, 3)).toBe(3);
    expect(borneAjustements(ancien, { variantId: "v2", revisionId: "r1" }, null)).toBeNull();
    expect(borneAjustements(ancien, { variantId: null, revisionId: null }, 3)).toBeNull();
    expect(borneAjustements({ variantId: null, revisionId: null, seq: null }, { variantId: "v1", revisionId: "r1" }, 3)).toBe(3);
  });
  it("journal lu : séquences ≤ borne seulement ; borne nulle : aucun ajustement pris en compte", () => {
    expect(journalBorne(journal, 2).map((l) => l.id)).toEqual(["a1", "a2"]);
    expect(journalBorne(journal, 3)).toHaveLength(3);
    expect(journalBorne(journal, null)).toEqual([]);
  });
  it("toute exception d'assemblage devient un code connu, jamais un texte du serveur", () => {
    expect(codeErreurDossier({ status: 409, body: { error: "dossier_sheet_missing", message: "Une feuille…" } })).toBe("dossier_sheet_missing");
    expect(codeErreurDossier({ status: 409, body: { error: "dossier_invalid" } })).toBe("dossier_invalid");
    expect(codeErreurDossier({ status: 404, body: { error: "not_found" } })).toBe("not_found");
    expect(codeErreurDossier(new Error("boom"))).toBe("dossier_unavailable");
    expect(codeErreurDossier({ body: { error: "autre_chose" } })).toBe("dossier_unavailable");
    expect(codeErreurDossier(null)).toBe("dossier_unavailable");
    expect(STUDIO_DOSSIER_ERREURS).toContain("dossier_unavailable");
  });
});
