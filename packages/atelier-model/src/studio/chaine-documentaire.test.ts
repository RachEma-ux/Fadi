/**
 * EX-074 — chaîne documentaire vue → feuille → dossier → publication ; une planche n'est jamais une feuille publiée.
 * EX-076 — un détail 2D autonome publié avec une coupe de maquette sans être présenté comme extrait synchronisé.
 * Lot PUB ; données synthétiques de recette.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chaineDocumentaire, controlerPiecesLivrables, piecesDuDossier, type StudioPieceProposee } from "./chaine-documentaire.js";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { assemblerDossierConception, composerFeuilleComposee, type StudioSourceDocumentaire } from "./dossier-conception.js";
import { studioJsonStable } from "./projections.js";
import { creerVueCoupe } from "./vues-coupe.js";

const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map((c) => c as StudioCommand));
const detail = (): StudioDocument => avec(newStudioDocument("detail"),
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 0.4, y: 0 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 0, y: 0 }, width: 0.4, height: 0.2 } },
);
const maquette = (): StudioDocument => avec(newStudioDocument("maquette"),
  { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 4, depth: 3, height: 3 } },
);
const H = (d: StudioDocument) => createHash("sha256").update(studioJsonStable(d)).digest("hex");
const source = (d: StudioDocument, variantId: string, revisionId: string): StudioSourceDocumentaire => ({ studyId: "e1", variantId, revisionId, documentHash: H(d) });
const feuilleDetail = () => {
  const d = detail();
  return composerFeuilleComposee("f-detail", { numero: "D-01", titre: "Détail d'appui", format: "A4", orientation: "portrait", echelle: 20, vueSource: { type: "planche-2d" } }, d, source(d, "v-detail", "rd1")).feuille;
};
const coupe = () => {
  const m = maquette();
  return creerVueCoupe("c-aa", { nom: "Coupe AA", niveau: { repere: "local-3d", z: 1 }, cadrage: { xMin: -1, yMin: -1, xMax: 5, yMax: 4 }, echelle: 50, styles: { trait: "fort", hachure: "diagonale" }, annotations: [] }, m, { studyId: "e1", variantId: "v-maq", revisionId: "rm1", documentHash: H(m) });
};

describe("EX-074 — chaîne documentaire vue → feuille → dossier → publication", () => {
  it("EX-074 [+] un dossier assemblé de feuilles se publie : rôles distincts (vue, feuille à format et échelle déclarés, dossier), empreintes propres", () => {
    const d = detail();
    const { dossier } = assemblerDossierConception({
      titre: "Dossier de conception", etude: { id: "e1", nom: "Pilote" },
      feuilles: [{ id: "f-detail", definition: { numero: "D-01", titre: "Détail", format: "A4", orientation: "portrait", echelle: 20, vueSource: { type: "planche-2d" } }, document: d, source: source(d, "v-detail", "rd1") }],
    });
    const r = controlerPiecesLivrables(piecesDuDossier(dossier, []));
    if (!("pieces" in r)) throw new Error(JSON.stringify(r));
    expect(r.pieces).toEqual([expect.objectContaining({ ordre: 1, documentId: "f-detail", nature: "feuille", origine: "dessin-2d", format: "A4", echelle: "1:20", presentation: "document-independant" })]);
    const chaine = chaineDocumentaire("dos-1", dossier, r.pieces);
    expect(chaine.dossier).toEqual({ id: "dos-1", titre: "Dossier de conception", empreinte: dossier.empreinte });
    expect(chaine.vues).toEqual([{ feuilleId: "f-detail", vueId: "f-detail:vue", empreinteDonnees: dossier.feuilles[0]!.vue.empreinteDonnees }]);
    expect(chaine.empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  it("EX-074 [−] une planche d'édition présentée comme feuille publiée est refusée ; une feuille sans échelle aussi", () => {
    const planche: StudioPieceProposee = { documentId: "planche", presenteeComme: "feuille", objet: detail(), presentation: "document-independant" };
    expect(controlerPiecesLivrables([planche])).toEqual({ refus: [{ code: "planche_non_feuille", documentId: "planche" }] });
    const f = feuilleDetail();
    const sansEchelle: StudioPieceProposee = { documentId: "f", presenteeComme: "feuille", objet: { ...f, echelle: "" }, presentation: "document-independant" };
    expect(controlerPiecesLivrables([sansEchelle])).toEqual({ refus: [{ code: "feuille_incomplete", documentId: "f", manque: ["echelle"] }] });
    expect(controlerPiecesLivrables([{ documentId: "x", presenteeComme: "vue-coupe", objet: detail(), presentation: "document-independant" }])).toEqual({ refus: [{ code: "vue_coupe_invalide", documentId: "x" }] });
  });
});

describe("EX-076 — documents indépendants publiés ensemble", () => {
  it("EX-076 [+] détail 2D autonome et coupe de maquette publiés ensemble, chacun avec sa source distincte", () => {
    const r = controlerPiecesLivrables([
      { documentId: "f-detail", presenteeComme: "feuille", objet: feuilleDetail(), presentation: "document-independant" },
      { documentId: "c-aa", presenteeComme: "vue-coupe", objet: coupe(), presentation: "extrait-synchronise" },
    ]);
    if (!("pieces" in r)) throw new Error(JSON.stringify(r));
    expect(r.pieces.map((p) => [p.documentId, p.origine, p.presentation, p.sources.map((s) => `${s.variantId}@${s.revisionId}`)])).toEqual([
      ["f-detail", "dessin-2d", "document-independant", ["v-detail@rd1"]],
      ["c-aa", "derive-maquette", "extrait-synchronise", ["v-maq@rm1"]],
    ]);
  });

  it("EX-076 [−] le détail indépendant annoncé « synchronisé » avec la maquette sans association : présentation refusée", () => {
    const r = controlerPiecesLivrables([
      { documentId: "f-detail", presenteeComme: "feuille", objet: feuilleDetail(), presentation: "extrait-synchronise" },
      { documentId: "c-aa", presenteeComme: "vue-coupe", objet: coupe(), presentation: "extrait-synchronise" },
    ]);
    expect(r).toEqual({ refus: [{ code: "synchronisation_non_fondee", documentId: "f-detail" }] });
    // Association fondée : la feuille lit la même révision que la coupe de maquette.
    const m = maquette();
    const f = composerFeuilleComposee("f-plan", { numero: "A-01", titre: "Plan", format: "A3", orientation: "paysage", echelle: 50, vueSource: { type: "planche-2d" } }, m, { studyId: "e1", variantId: "v-maq", revisionId: "rm1", documentHash: H(m) }).feuille;
    expect("pieces" in controlerPiecesLivrables([
      { documentId: "f-plan", presenteeComme: "feuille", objet: f, presentation: "extrait-synchronise" },
      { documentId: "c-aa", presenteeComme: "vue-coupe", objet: coupe(), presentation: "document-independant" },
    ])).toBe(true);
  });
});
