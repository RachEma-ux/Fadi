/** Outils d'annotation de la planche (Cote angulaire, Texte) : clics, saisie numérique, rendu, raccourcis. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import type { PointPose } from "../Dessin2D";
import { Dessin2D, type Dessin2DProps } from "../Dessin2D";
import { CADRE_INITIAL } from "../geometrie-2d";
import { cibleRaccourci, OUTILS_MODES, OUTILS_TRACE, outilsDeBarre } from "../raccourcis";
import { commandesDeplacement, selectionParRectangle } from "../selection";
import { segmentVise } from "./annotations";
import { champsFormulaire, CONTENU_INITIAL, soumettre, VALEURS_INITIALES, valeursObjet } from "./formulaire";
import { aidePlanche, outilPlanche } from "./index";
import type { ContexteClic } from "./type";

const pp = (x: number, y: number): PointPose => ({ point: { x, y }, accroche: null });
const doc = (): StudioDocument => applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
  { toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 3 } } },
  { toolId: "studio.dessin.ligne", params: { id: "l3", type: "line", start: { x: 0, y: 1 }, end: { x: 4, y: 1 } } },
]);
const ctx = (over: Partial<ContexteClic> = {}): ContexteClic => {
  let n = 0;
  return { nouvelId: () => `id-${++n}`, layerId: undefined, decalageCote: 0.5, tolerance: 0.1, rayonAngulaire: 1, document: doc(), texte: { contenu: "Séjour", hauteur: 0.3, rotation: 90, justification: "center" }, ...over };
};
const etat = (outil: "studio.dessin.cote-angulaire" | "studio.dessin.texte", trace: PointPose, suite: { x: number; y: number }[] = []) => ({ outil, trace, suite, modeArc: "trois-points" as const });

describe("Annotations : barre, raccourcis, aide", () => {
  it("Maj+A et Maj+T choisissent les outils, rangés dans la barre Dessin, outils « mode » qui posent des points", () => {
    expect(cibleRaccourci("Shift+A")).toEqual({ type: "outil", toolId: "studio.dessin.cote-angulaire" });
    expect(cibleRaccourci("Shift+T")).toEqual({ type: "outil", toolId: "studio.dessin.texte" });
    expect(outilsDeBarre("dessin").map((t) => t.toolId).slice(-2)).toEqual(["studio.dessin.cote-angulaire", "studio.dessin.texte"]);
    for (const t of ["studio.dessin.cote-angulaire", "studio.dessin.texte"] as const) expect(OUTILS_MODES.has(t) && OUTILS_TRACE.has(t), t).toBe(true);
  });
  it("aide au repos et pendant le tracé", () => {
    const base = { suite: [], modeArc: "trois-points" as const, moveWithPointer: false, lectureSeule: false };
    expect(aidePlanche({ ...base, outil: "studio.dessin.texte", trace: null })).toBe("Texte : saisissez le texte dans le panneau, puis cliquez son point d’insertion.");
    expect(aidePlanche({ ...base, outil: "studio.dessin.cote-angulaire", trace: pp(0, 0) })).toBe("Cliquez le second segment (cote liée), ou un point du premier rayon (cote libre). Échap pour annuler.");
  });
});

describe("Cote angulaire au pointeur", () => {
  const outil = outilPlanche("studio.dessin.cote-angulaire")!;
  it("deux clics sur deux segments : cote liée, sommet à l'intersection", () => {
    expect(segmentVise(doc(), { x: 2, y: 0.05 }, 0.1)).toMatchObject({ objectId: "l1", segment: 0 });
    expect(outil.clic(etat("studio.dessin.cote-angulaire", pp(2, 0.05)), pp(0.02, 2), ctx())).toEqual({ type: "commandes", apres: "annuler-trace", commandes: [{ toolId: "studio.dessin.cote-angulaire", params: {
      id: "id-1", type: "angular-dimension", vertex: { x: 0, y: 0 }, first: { x: 4, y: 0 }, second: { x: 0, y: 3 }, radius: 1,
      links: { first: { objectId: "l1", segment: 0 }, second: { objectId: "l2", segment: 0 } }, toResolve: false,
    } }] });
    expect(outil.clic(etat("studio.dessin.cote-angulaire", pp(2, 0.05)), pp(2, 1), ctx())).toEqual({ type: "erreur", message: "Segments parallèles : angle indéterminé." });
  });
  it("sinon : sommet, point du premier rayon, point du second (cote libre) ; refus", () => {
    expect(outil.clic(etat("studio.dessin.cote-angulaire", pp(10, 10)), pp(12, 10), ctx())).toEqual({ type: "sommet", suite: [{ x: 12, y: 10 }] });
    const r = outil.clic(etat("studio.dessin.cote-angulaire", pp(10, 10), [{ x: 12, y: 10 }]), pp(10, 12), ctx());
    expect(r).toEqual({ type: "commandes", apres: "annuler-trace", commandes: [{ toolId: "studio.dessin.cote-angulaire", params: {
      id: "id-1", type: "angular-dimension", vertex: { x: 10, y: 10 }, first: { x: 12, y: 10 }, second: { x: 10, y: 12 }, radius: 1, links: { first: null, second: null }, toResolve: false,
    } }] });
    expect(outil.clic(etat("studio.dessin.cote-angulaire", pp(10, 10), [{ x: 12, y: 10 }]), pp(14, 10), ctx())).toEqual({ type: "erreur", message: "Les deux rayons sont confondus : angle nul." });
    expect(outil.clic(etat("studio.dessin.cote-angulaire", pp(10, 10), [{ x: 12, y: 10 }]), pp(10, 12), ctx({ rayonAngulaire: 0 }))).toEqual({ type: "erreur", message: "Le rayon de l’arc doit être strictement positif." });
  });
});

describe("Texte au pointeur et à la saisie", () => {
  const outil = outilPlanche("studio.dessin.texte")!;
  it("un clic pose le texte saisi (rotation en degrés → radians), contenu tel quel", () => {
    expect(outil.premierClic!(pp(1, 2), ctx())).toEqual({ type: "commandes", commandes: [{ toolId: "studio.dessin.texte", params: {
      id: "id-1", type: "text", position: { x: 1, y: 2 }, height: 0.3, rotation: Math.PI / 2, content: "Séjour", justification: "center",
    } }] });
    expect(outil.premierClic!(pp(1, 2), ctx({ texte: { contenu: " ", hauteur: 0.3, rotation: 0, justification: "left" } }))).toEqual({ type: "erreur", message: "Saisissez le texte à poser." });
    expect(outil.premierClic!(pp(1, 2), ctx({ texte: { contenu: "x".repeat(501), hauteur: 0.3, rotation: 0, justification: "left" } }))).toEqual({ type: "erreur", message: "Le texte compte 500 caractères au plus." });
  });
  it("formulaire : champs, création, modification d'un texte (identité et calque gardés)", () => {
    expect(champsFormulaire("studio.dessin.texte", null)).toMatchObject({ fields: ["x", "y", "h", "rot"], saisieTexte: true });
    expect(champsFormulaire("studio.dessin.cote-angulaire", null).fields).toEqual(["x", "y", "a", "b", "c", "d", "ra"]);
    const creation = ctx();
    const a = soumettre({ tool: "studio.dessin.texte", values: { ...VALEURS_INITIALES, x: 3, y: 4 }, sommetsTexte: "", fermee: false, selected: null, selectionIds: [], drawing: doc(), creation, texte: { contenu: "Chambre", justification: "right" } });
    expect(a).toEqual({ type: "commandes", commandes: [{ toolId: "studio.dessin.texte", params: { id: "id-1", type: "text", position: { x: 3, y: 4 }, height: 0.25, rotation: 0, content: "Chambre", justification: "right" } }] });
    const t = { id: "t", type: "text" as const, layerId: "notes", position: { x: 0, y: 0 }, height: 1, rotation: 0, content: "A", justification: "left" as const };
    const r = valeursObjet(t);
    expect(r.texte).toEqual({ contenu: "A", justification: "left" });
    const m = soumettre({ tool: "studio.dessin.modifier", values: { ...r.maj!(VALEURS_INITIALES), rot: 180 }, sommetsTexte: "", fermee: false, selected: t, selectionIds: ["t"], drawing: doc(), creation, texte: { ...CONTENU_INITIAL, contenu: "B" } });
    expect(m).toEqual({ type: "commandes", commandes: [{ toolId: "studio.dessin.modifier", params: { ...t, rotation: Math.PI, content: "B" } }] });
  });
});

describe("Annotations sur la planche", () => {
  const avec = (): StudioDocument => applyStudioCommands(doc(), [
    { toolId: "studio.dessin.cote-angulaire", params: { id: "ang", type: "angular-dimension", vertex: { x: 0, y: 0 }, first: { x: 4, y: 0 }, second: { x: 0, y: 3 }, radius: 1, links: { first: { objectId: "l1", segment: 0 }, second: { objectId: "l2", segment: 0 } }, toResolve: false } },
    { toolId: "studio.dessin.texte", params: { id: "t", type: "text", position: { x: 1, y: 2 }, height: 0.5, rotation: 0, content: "Séjour", justification: "left" } },
  ] as StudioCommand[]);
  const props = (d: StudioDocument): Dessin2DProps => ({
    svgRef: null, doc: d, cadre: CADRE_INITIAL, pas: 1, outil: "studio.dessin.selection", selection: new Set(["t"]), trace: null, survol: null, rectangle: null, glissement: false,
    clicsVersPlanche: () => false, surPlanche: () => {}, surSurvol: () => {}, surPointeurBas: () => {}, surPointeurHaut: () => {}, surClicCapture: () => {}, surSelection: () => {},
  });
  it("cote angulaire (valeur, état) et texte (contenu non traduit) rendus et sélectionnables", () => {
    const html = renderToStaticMarkup(createElement(Dessin2D, props(avec())));
    expect(html).toContain('data-studio-cote-angulaire="ang" data-studio-cote-etat="resolue" data-studio-angle="90.000"');
    expect(html).toMatch(/<text[^>]*translate="no" data-studio-texte-contenu="true">Séjour<\/text>/);
    expect(html).toContain('aria-pressed="true" data-studio-objet="t"');
    const supprime = renderToStaticMarkup(createElement(Dessin2D, props(applyStudioCommands(avec(), [{ toolId: "studio.dessin.supprimer", params: { ids: ["l2"] } }]))));
    expect(supprime).toContain('data-studio-cote-etat="a-resoudre"');
    expect(supprime).toContain(">à résoudre</text>");
  });
  it("sélection par rectangle et déplacement : une cote angulaire liée suit ses segments", () => {
    expect(selectionParRectangle(avec(), { x: -1, y: -1 }, { x: 6, y: 6 })).toEqual(["l1", "l2", "l3", "ang", "t"]);
    expect(commandesDeplacement(avec(), ["ang", "t"], 1, 0)).toEqual({ commandes: [{ toolId: "studio.dessin.deplacer", params: { id: "t", dx: 1, dy: 0 } }], cotesLiees: ["ang"] });
  });
});
