/**
 * TR-EX-014 — provenance et unités : une source importée (DXF) porte auteur ou fournisseur s'il est connu, format et
 * version lue, horodatage, unités (lue et retenue), repère source, transformation, restrictions d'utilisation et
 * empreinte SHA-256 ; un modèle externe reçu (IFC) porte la même provenance ; les métadonnées s'exportent ; une unité ou
 * un repère inconnus sont dits « non évalués » ou « non déclarés », jamais supposés en mètres.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, StudioValidationError } from "../document-2d.js";
import { lireDxfStudio } from "../import-dxf.js";
import { dxf, ligne } from "../import-dxf.fixtures.js";
import { studioSha256 } from "../empreinte-sha256.js";
import { STUDIO_PROVENANCE_SCHEMA, studioExportProvenance, studioSourceDxf, studioVersionDxf, validerSource } from "./sources.js";
import { lireModeleExterne, studioProvenanceModeleExterne, validerMetaModeleExterne } from "../echanges/modeles-externes.js";

const refus = (f: () => unknown): string => { try { f(); } catch (e) { if (e instanceof StudioValidationError) return e.message; throw e; } return ""; };

describe("TR-EX-014 — provenance d'une source DXF importée", () => {
  it("cas positif : import DXF en mm, repère et restrictions déclarés → source portée par le document, exportée avec toutes ses métadonnées", () => {
    const texte = dxf({ insunits: 4, entites: [ligne(0, 0, 1000, 0), ligne(0, 0, 0, 2000)] });
    const r = lireDxfStudio(texte, { document: newStudioDocument("d") });
    expect(r.statut).toBe("pret");
    const source = studioSourceDxf(texte, {
      id: "src-1", nomFichier: "relevé.dxf", recuLe: "2026-10-25T08:30:00.000Z", objets: r.rapport.entites.total,
      unite: { valeur: r.rapport.unite.valeur, origine: r.rapport.unite.origine }, facteur: r.rapport.facteur,
      auteur: "Bureau de géomètre (fixture)", repereSource: "repère du fichier, origine du relevé", restrictions: "usage interne au projet",
    });
    const d = applyStudioCommands(newStudioDocument("d"), [...r.commandes, { toolId: "studio.source.declarer", params: source }]);
    expect(d.sources).toEqual([source]);
    expect(source).toMatchObject({
      format: "dxf", nomFichier: "relevé.dxf", empreinteSha256: studioSha256(texte), recuLe: "2026-10-25T08:30:00.000Z", auteur: "Bureau de géomètre (fixture)",
      uniteLue: "mm", uniteRetenue: "mm", facteur: 0.001, repereSource: "repère du fichier, origine du relevé", transformation: "identite", restrictions: "usage interne au projet", objets: 2,
    });
    const p = studioExportProvenance(d);
    expect(p).toEqual({ schema: STUDIO_PROVENANCE_SCHEMA, documentId: "d", repereDocument: "local-2d", uniteDocument: "m", sources: [source] });
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d))).sources).toEqual([source]);
    // Version du format lue dans l'en-tête quand le fichier la déclare.
    expect(studioVersionDxf("0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n0\nENDSEC\n")).toBe("AC1015");
  });

  it("champs inconnus : auteur, repère source, restrictions et version absents → null (non déclarés), jamais inventés", () => {
    const texte = dxf({ insunits: 6, entites: [ligne(0, 0, 1, 0)] });
    const r = lireDxfStudio(texte, {});
    const s = studioSourceDxf(texte, { id: "s", nomFichier: "a.dxf", recuLe: "2026-10-25T00:00:00Z", objets: 1, unite: { valeur: r.rapport.unite.valeur, origine: r.rapport.unite.origine }, facteur: r.rapport.facteur, auteur: "  ", repereSource: "", restrictions: null });
    expect([s.auteur, s.repereSource, s.restrictions]).toEqual([null, null, null]);
    expect(s.versionFormat).toBe(studioVersionDxf(texte));
  });

  it("cas négatif : unité inconnue → aucune commande et aucune source (jamais des mètres supposés) ; unité choisie → lue null, retenue déclarée", () => {
    const texte = dxf({ entites: [ligne(0, 0, 5, 0)] });
    const r = lireDxfStudio(texte, {});
    expect(r.statut).toBe("unite-inconnue");
    expect(r.commandes).toEqual([]);
    expect(refus(() => studioSourceDxf(texte, { id: "s", nomFichier: "a.dxf", recuLe: "2026-10-25T00:00:00Z", objets: 0, unite: { valeur: r.rapport.unite.valeur, origine: r.rapport.unite.origine }, facteur: r.rapport.facteur }))).toContain("unité retenue attendue");
    const choisie = lireDxfStudio(texte, { unite: "cm" });
    const s = studioSourceDxf(texte, { id: "s", nomFichier: "a.dxf", recuLe: "2026-10-25T00:00:00Z", objets: 1, unite: { valeur: choisie.rapport.unite.valeur, origine: choisie.rapport.unite.origine }, facteur: choisie.rapport.facteur });
    expect([s.uniteLue, s.uniteRetenue, s.facteur]).toEqual([null, "cm", 0.01]);
    expect(refus(() => validerSource({ ...s, empreinteSha256: "abc" }, "s"))).toContain("SHA-256");
    expect(refus(() => validerSource({ ...s, transformation: { dx: 1 } }, "s"))).toContain("identite");
    expect(refus(() => applyStudioCommands(newStudioDocument("d"), [{ toolId: "studio.source.declarer", params: s }, { toolId: "studio.source.declarer", params: s }]))).toContain("déjà utilisé");
  });
});

describe("TR-EX-014 — provenance d'un modèle externe reçu (IFC)", () => {
  it("restrictions d'utilisation et repère source déclarés, unités déclarée et lue, transformation, empreinte et horodatage exportés", () => {
    const ifc = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('a.ifc','2026-10-25T00:00:00',(''),(''),'','','');", "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
      "#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);", "#2=IFCUNITASSIGNMENT((#1));", "#3=IFCPROJECT('0aaaaaaaaaaaaaaaaaaaaa',$,'P',$,$,$,$,$,#2);", "ENDSEC;", "END-ISO-10303-21;"].join("\n");
    const meta = validerMetaModeleExterne({ reference: "Structure A", auteur: "Ingénieur (fixture)", discipline: "Structure", format: "ifc", version: "V3", uniteDeclaree: "mm", transformation: { dx: 10, dy: 0, dz: 0, rotation: 0 }, nomFichier: "a.ifc", repereSource: "repère du modèle structure", restrictions: "pour coordination seulement" });
    const lecture = lireModeleExterne(ifc, meta);
    const p = studioProvenanceModeleExterne({ id: "m1", meta, contentSha256: studioSha256(ifc), recuLe: "2026-10-25T09:00:00.000Z", statut: "compare", rapport: lecture.rapport });
    expect(p).toMatchObject({
      schema: "studio-provenance-modele/1", modeleId: "m1", auteur: "Ingénieur (fixture)", format: "ifc", version: "V3", schemaFichier: "IFC4", nomFichier: "a.ifc", empreinteSha256: studioSha256(ifc),
      recuLe: "2026-10-25T09:00:00.000Z", repereSource: "repère du modèle structure", transformation: { dx: 10, dy: 0, dz: 0, rotation: 0 }, repereCible: "local-2d", restrictions: "pour coordination seulement",
    });
    expect(p.unite).toEqual({ declaree: "mm", lue: lecture.rapport.unite.nom, facteurLu: 0.001, concorde: true });
    // Non déclarés : null, jamais remplis.
    const sans = validerMetaModeleExterne({ ...meta, repereSource: undefined, restrictions: "  " });
    expect([sans.repereSource, sans.restrictions]).toEqual([null, null]);
  });
});
