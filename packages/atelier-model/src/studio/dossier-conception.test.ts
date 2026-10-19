import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bilanQuantitesStudio } from "./bilan-quantites.js";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import {
  assemblerDossierConception, composerFeuilleComposee, pdfDossierConception, produireVueDocumentaire, STUDIO_NON_EVALUE, studioDonneesVue,
  studioFeuilleComposeeSvg, validerFeuilleComposee, type StudioFeuilleComposeeDefinition, type StudioSourceDocumentaire,
} from "./dossier-conception.js";
import { studioSha256, studioUtf8 } from "./empreinte-sha256.js";
import { composerFeuilleStudio, exportStudioSheetSvg, studioSheetPdf, studioSheetSvg } from "./feuille.js";
import { studioJsonStable } from "./projections.js";

/**
 * Production documentaire (lot E.3) : vues identifiées et empreintes (E.3-01), feuilles distinctes de la planche
 * (E.3-02), dossier de conception (E.3-03), bilan brut / déductions / net (E.3-04). Données synthétiques de recette :
 * mur 6 × 3 × 0,2 m et ouverture 1 × 2,1 m (REC-A-03), aucune valeur de projet.
 */

const cmd = (c: unknown) => c as StudioCommand;
const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map(cmd));
const pilote = (): StudioDocument => avec(newStudioDocument("pilote"),
  { toolId: "studio.calque.creer", params: { id: "cotes", name: "Cotes", visible: true, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "brouillon", name: "Brouillon", visible: false, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 0, y: 1 }, width: 2, height: 1, layerId: "brouillon" } },
  { toolId: "studio.dessin.cote", params: { id: "c1", type: "dimension", layerId: "cotes", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: 0.5, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false } },
  { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 3 }, { x: 6, y: 3 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
  { toolId: "studio.architecture.ouverture", params: { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 } },
);
const H = (doc: StudioDocument) => createHash("sha256").update(studioJsonStable(doc)).digest("hex");
const source = (doc: StudioDocument, over: Partial<StudioSourceDocumentaire> = {}): StudioSourceDocumentaire => ({
  studyId: "etude-1", studyName: "Pilote", variantId: "var-1", variantName: "Base", revisionId: "rev-00000001", revisionDate: "2026-10-19T08:00:00.000Z", documentHash: H(doc), ...over,
});
const def = (over: Partial<StudioFeuilleComposeeDefinition> = {}): StudioFeuilleComposeeDefinition => ({ numero: "A-101", titre: "Plan du rez-de-chaussée", format: "A3", orientation: "paysage", echelle: "ajuster", vueSource: { type: "planche-2d" }, ...over });

describe("empreinte SHA-256 pure", () => {
  it("égale node:crypto sur l'ASCII, l'UTF-8 multi-octets, les paires de substitution et les blocs limites", () => {
    for (const t of ["", "abc", "é — non évalué ✓", "𝔉adi", "a".repeat(55), "b".repeat(56), "c".repeat(64), "d".repeat(1000)]) {
      expect(studioSha256(t), t.slice(0, 10)).toBe(createHash("sha256").update(t, "utf8").digest("hex"));
    }
    expect([...studioUtf8("\ud800")]).toEqual([0xef, 0xbf, 0xbd]);
  });
});

describe("E.3-01 — vue documentaire d'une source identifiée", () => {
  it("porte révision, variante, vue source et empreinte de ses données ; calques visibles par défaut", () => {
    const doc = pilote();
    const { vue, document } = produireVueDocumentaire(doc, source(doc), { type: "planche-2d" }, "v1");
    expect(vue.source).toMatchObject({ variantId: "var-1", revisionId: "rev-00000001", documentHash: H(doc) });
    expect(vue.vueSource).toEqual({ type: "planche-2d", selection: "calques-visibles", calques: ["default", "cotes"] });
    expect(vue.empreinteDonnees).toMatch(/^[0-9a-f]{64}$/);
    expect(document.objects.map((o) => o.id)).toEqual(["l1"]);
    expect(vue.elements).toEqual({ objets: 1, cotes: 1, annotations: 0, architecture: 2 });
    expect(vue.exclus.horsCalques).toBe(1);
  });

  it("même donnée, même empreinte ; une donnée changée ou une autre vue source la change ; la source du doc n'en est pas modifiée", () => {
    const doc = pilote();
    const avant = JSON.stringify(doc);
    const a = produireVueDocumentaire(doc, source(doc), { type: "planche-2d" }, "v1").vue;
    const b = produireVueDocumentaire(structuredClone(doc), source(doc, { revisionId: "rev-2" }), { type: "planche-2d" }, "v2").vue;
    expect(b.empreinteDonnees).toBe(a.empreinteDonnees);
    const deplace = avec(doc, { toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 1, dy: 0 } });
    expect(produireVueDocumentaire(deplace, source(deplace), { type: "planche-2d" }, "v3").vue.empreinteDonnees).not.toBe(a.empreinteDonnees);
    expect(produireVueDocumentaire(doc, source(doc), { type: "planche-2d", calques: ["default"] }, "v4").vue.empreinteDonnees).not.toBe(a.empreinteDonnees);
    // Un objet d'un calque non retenu ne change pas l'empreinte de la vue.
    const brouillon = avec(doc, { toolId: "studio.dessin.deplacer", params: { id: "r1", dx: 1, dy: 0 } });
    expect(produireVueDocumentaire(brouillon, source(brouillon), { type: "planche-2d" }, "v5").vue.empreinteDonnees).toBe(a.empreinteDonnees);
    expect(JSON.stringify(doc)).toBe(avant);
  });

  it("calques choisis : un calque masqué peut être retenu ; un calque inconnu ou une source sans empreinte est refusé", () => {
    const doc = pilote();
    const { vue, document } = produireVueDocumentaire(doc, source(doc), { type: "planche-2d", calques: ["brouillon"] }, "v1");
    expect(vue.vueSource).toEqual({ type: "planche-2d", selection: "calques-choisis", calques: ["brouillon"] });
    expect(document.objects.map((o) => o.id)).toEqual(["r1"]);
    expect(document.layers).toEqual([{ id: "brouillon", name: "Brouillon", visible: true, locked: false }]);
    expect(() => studioDonneesVue(doc, { type: "planche-2d", calques: ["inconnu"] })).toThrow(/calque inconnu/);
    expect(() => produireVueDocumentaire(doc, source(doc, { documentHash: "abc" }), { type: "planche-2d" }, "v")).toThrow(/SHA-256/);
  });

  it("une cote liée à un objet écarté garde sa géométrie, son lien est détaché", () => {
    const doc = pilote();
    const { document } = studioDonneesVue(doc, { type: "planche-2d", calques: ["cotes"] });
    expect(document.objects).toEqual([]);
    expect(document.dimensions?.[0]).toMatchObject({ id: "c1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, links: { start: null, end: null } });
  });
});

describe("E.3-02 — feuille composée distincte de la planche", () => {
  it("cartouche : valeurs réelles ou « non évalué », jamais devinées ; provenance imprimée ; la planche est intacte", () => {
    const doc = pilote();
    const avant = JSON.stringify(doc);
    const { variantName: _sansNom, ...sansVariante } = source(doc);
    void _sansNom;
    const { feuille, rendu } = composerFeuilleComposee("f1", def(), doc, sansVariante, { projectName: "Projet synthétique" });
    expect(feuille.schema).toBe("studio-feuille-composee/1");
    expect(feuille.cartouche).toEqual({
      projectCode: STUDIO_NON_EVALUE, projectName: "Projet synthétique", study: "Pilote", variant: STUDIO_NON_EVALUE,
      title: "A-101 — Plan du rez-de-chaussée", revisionId: "rev-00000001", revisionDate: "2026-10-19", author: STUDIO_NON_EVALUE,
    });
    const svg = studioFeuilleComposeeSvg(feuille, rendu);
    expect(svg).toContain('data-sheet-part="provenance"');
    expect(svg).toContain(`empreinte des données ${feuille.vue.empreinteDonnees.slice(0, 16)}`);
    expect(svg).toContain(`data-empreinte-donnees="${feuille.vue.empreinteDonnees}"`);
    expect(svg).toContain('data-revision="rev-00000001"');
    expect(svg).toContain(`data-document-hash="${H(doc)}"`);
    // Murs et ouvertures tracés en plan sur la feuille composée.
    expect(svg).toContain('data-id="m1"');
    expect(svg).toContain('data-id="o1"');
    expect(JSON.stringify(doc)).toBe(avant);
  });

  it("définition contrôlée : numéro et titre requis, échelle normalisée, champs vides retirés", () => {
    expect(() => validerFeuilleComposee(def({ numero: " " }))).toThrow();
    expect(() => validerFeuilleComposee(def({ echelle: 75 as never }))).toThrow(/échelle/);
    expect(validerFeuilleComposee(def({ titre: "  Plan   RDC ", cartouche: { auteur: "  " } }))).toEqual({ ...def(), titre: "Plan RDC" });
  });

  it("feuille de présentation historique inchangée sans les nouvelles options (octets identiques)", () => {
    const doc = pilote();
    const o = { format: "A3" as const, orientation: "paysage" as const, scale: "ajuster" as const };
    const a = composerFeuilleStudio(doc, o);
    expect(a.provenance).toBeUndefined();
    expect(studioSheetSvg(a)).toBe(exportStudioSheetSvg(doc, o));
    expect(studioSheetSvg(a)).not.toContain('data-id="m1"');
    expect(Buffer.from(studioSheetPdf(a)).equals(Buffer.from(studioSheetPdf(composerFeuilleStudio(doc, o))))).toBe(true);
  });
});

describe("E.3-04 — bilan brut / déductions / net calculés séparément", () => {
  it("mur REC-A-03 : 3,600 brut, déduction de l'ouverture o1 0,420, net 3,180 ; objets hors architecture « non évalués »", () => {
    const doc = avec(pilote(), { toolId: "studio.objet.extruder", params: { ids: ["r1"], base: 0, height: 2 } });
    const b = bilanQuantitesStudio(doc);
    const m = b.lignes.find((l) => l.objetId === "m1")!;
    expect(m.brut).toBeCloseTo(3.6, 12);
    expect(m.deductions).toEqual([{ sourceId: "o1", sourceType: "opening", valeur: expect.closeTo(0.42, 12) }]);
    expect(m.deduit).toBeCloseTo(0.42, 12);
    expect(m.net).toBeCloseTo(3.18, 12);
    const r = b.lignes.find((l) => l.objetId === "r1")!;
    expect(r).toMatchObject({ brut: 4, deduit: null, motifDeduit: "deductions-non-declarees", net: null, motifNet: "deductions-non-declarees" });
    const l = b.lignes.find((x) => x.objetId === "l1")!;
    expect(l).toMatchObject({ brut: null, motifBrut: "non-extrude" });
    expect(b.totaux.brut).toEqual({ valeur: expect.closeTo(7.6, 12), evalues: 2, nonEvalues: 1 });
    expect(b.totaux.deduit).toEqual({ valeur: expect.closeTo(0.42, 12), evalues: 1, nonEvalues: 2 });
    expect(b.totaux.net).toEqual({ valeur: expect.closeTo(3.18, 12), evalues: 1, nonEvalues: 2 });
    expect(b.controle).toMatchObject({ coherent: true, lignesControlees: 1 });
    expect(b.deductionsDeclarees).toBe(1);
  });
});

describe("E.3-03 — dossier de conception", () => {
  it("feuilles ordonnées, métré, fidélité, sources distinctes et empreinte ; PDF de plusieurs pages, déterministe", () => {
    const doc = pilote();
    const s = source(doc);
    const entree = {
      titre: "Dossier de conception — pilote", projet: { projectCode: "P-01" }, etude: { id: "etude-1", nom: "Pilote" },
      feuilles: [
        { id: "f2", definition: def({ numero: "A-102", titre: "Cotes", vueSource: { type: "planche-2d" as const, calques: ["cotes"] } }), document: doc, source: s },
        { id: "f1", definition: def(), document: doc, source: s },
      ],
      metre: { document: doc, source: s }, fidelite: true,
    };
    const { dossier, rendus } = assemblerDossierConception(entree);
    expect(dossier.feuilles.map((f) => [f.ordre, f.id])).toEqual([[1, "f2"], [2, "f1"]]);
    expect(dossier.projet).toEqual({ code: "P-01", nom: STUDIO_NON_EVALUE });
    expect(dossier.sources).toHaveLength(1);
    expect(dossier.metre?.ajustements).toBe(STUDIO_NON_EVALUE);
    expect(dossier.metre?.bilan.lignes.find((l) => l.objetId === "m1")?.net).toBeCloseTo(3.18, 12);
    expect(dossier.fidelite?.map((f) => f.numero)).toEqual(["A-102", "A-101"]);
    expect(dossier.empreinte).toMatch(/^[0-9a-f]{64}$/);
    const pdf = pdfDossierConception(dossier, rendus);
    const t = Buffer.from(pdf).toString("latin1");
    expect(t.startsWith("%PDF-1.4")).toBe(true);
    expect(t).toMatch(/\/Count 5 /);
    expect(Buffer.from(pdfDossierConception(assemblerDossierConception(structuredClone(entree)).dossier, rendus)).equals(Buffer.from(pdf))).toBe(true);
    // Ordre changé, empreinte changée.
    expect(assemblerDossierConception({ ...entree, feuilles: [...entree.feuilles].reverse() }).dossier.empreinte).not.toBe(dossier.empreinte);
  });

  it("refuse un dossier sans feuille ou avec une feuille en double ; métré non joint dit « non joint »", () => {
    const doc = pilote();
    const f = { id: "f1", definition: def(), document: doc, source: source(doc) };
    expect(() => assemblerDossierConception({ titre: "D", etude: { id: "e" }, feuilles: [] })).toThrow(/au moins une feuille/);
    expect(() => assemblerDossierConception({ titre: "D", etude: { id: "e" }, feuilles: [f, f] })).toThrow(/double/);
    const { dossier, rendus } = assemblerDossierConception({ titre: "D", etude: { id: "e" }, feuilles: [f] });
    expect(dossier.metre).toBeNull();
    expect(dossier.etude.nom).toBe(STUDIO_NON_EVALUE);
    expect(Buffer.from(pdfDossierConception(dossier, rendus)).toString("latin1")).toContain("non joint");
  });
});
