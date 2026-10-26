/**
 * EX-075 — vues de coupe enregistrées (lot PUB) : révisions sources, niveau / repère, cadrage, échelle, visibilité,
 * styles et annotations propres ; une vue dérivée du 3D devient périmée après modification du modèle ; ses
 * annotations ne deviennent jamais des paramètres de l'objet source. Données synthétiques (boîtes de recette).
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, StudioValidationError, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { actualiteVueCoupe, annoterVueCoupe, creerVueCoupe, rebaserVueCoupe, validerVueCoupe, type StudioVueCoupeDefinition } from "./vues-coupe.js";

const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map((c) => c as StudioCommand));
const R12 = (): StudioDocument => avec(newStudioDocument("coupe"),
  { toolId: "studio.calque.creer", params: { id: "struct", name: "Structure", visible: true, locked: false } },
  { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 1, y: 1, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 3 } },
  { toolId: "studio.solide.boite", params: { id: "b2", type: "box", layerId: "struct", placement: { origin: { x: 10, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 3 } },
);
const src = (revisionId = "R12") => ({ studyId: "e1", variantId: "v1", revisionId, documentHash: "c".repeat(64) });
const def = (over: Partial<StudioVueCoupeDefinition> = {}): StudioVueCoupeDefinition => ({
  nom: "Coupe AA", niveau: { repere: "local-3d", z: 1.5 }, cadrage: { xMin: 0, yMin: 0, xMax: 5, yMax: 5 }, echelle: 50,
  styles: { trait: "fort", hachure: "diagonale" }, annotations: [{ id: "a1", type: "texte", position: { x: 2, y: 2.5 }, texte: "Local technique" }], ...over,
});

describe("EX-075 — vue de coupe enregistrée", () => {
  it("EX-075 [+] conserve révision source, niveau et repère, cadrage, échelle, visibilité, styles et annotations propres", () => {
    const doc = R12();
    const vue = creerVueCoupe("vc1", def(), doc, src());
    expect(vue.sources).toEqual([src()]);
    expect(vue.definition).toMatchObject({ niveau: { repere: "local-3d", z: 1.5 }, cadrage: { xMin: 0, yMin: 0, xMax: 5, yMax: 5 }, echelle: 50, styles: { trait: "fort", hachure: "diagonale" } });
    expect(vue.definition.annotations).toEqual([{ id: "a1", type: "texte", position: { x: 2, y: 2.5 }, texte: "Local technique" }]);
    expect(vue.repere).toEqual({ source: "local-3d", vue: "local-2d", conversion: "(x, y, z) → (x, y)" });
    // Cadrage : b2 (x = 10) est hors fenêtre ; b1 est coupé à z = 1,5.
    expect(vue.coupe.sources.map((s) => s.id)).toEqual(["b1"]);
    expect(vue.horsCadrage).toBe(4);
    expect(vue.coupe.derived).toBe(true);
    // Visibilité : seul le calque « struct » retenu, fenêtre élargie.
    const struct = creerVueCoupe("vc2", def({ cadrage: { xMin: 0, yMin: 0, xMax: 20, yMax: 5 }, visibilite: { calques: ["struct"] } }), doc, src());
    expect(struct.coupe.sources.map((s) => s.id)).toEqual(["b2"]);
    // Découpe au cadrage : un segment traversant la fenêtre est raccourci, jamais étendu.
    const etroite = creerVueCoupe("vc3", def({ cadrage: { xMin: 0, yMin: 0, xMax: 2, yMax: 5 } }), doc, src());
    for (const s of etroite.coupe.segments) for (const p of [s.start, s.end]) expect(p.x).toBeLessThanOrEqual(2 + 1e-12);
  });

  it("EX-075 [+] R12 → R13 : la vue dérivée devient périmée ; rebasée, elle garde cadrage, styles et annotations", () => {
    const doc = R12();
    const vue = creerVueCoupe("vc1", def(), doc, src());
    expect(actualiteVueCoupe(vue, new Map([["v1", "R12"]])).actualite).toBe("a-jour");
    const r13 = avec(doc, { toolId: "studio.solide.deplacer", params: { id: "b1", dx: 0.5, dy: 0, dz: 0 } });
    const perimee = actualiteVueCoupe(vue, new Map([["v1", "R13"]]));
    expect(perimee).toEqual({ actualite: "perimee", ecarts: [{ variantId: "v1", revisionSource: "R12", revisionCourante: "R13" }] });
    const nouvelle = rebaserVueCoupe(vue, r13, src("R13"));
    expect(nouvelle.definition).toEqual(vue.definition);
    expect(nouvelle.empreinteSection).not.toBe(vue.empreinteSection);
    expect(actualiteVueCoupe(nouvelle, new Map([["v1", "R13"]])).actualite).toBe("a-jour");
  });

  it("EX-075 [−] annotation de coupe modifiée : ne devient pas un paramètre de l'objet source, le document et la section ne changent pas", () => {
    const doc = R12();
    const avant = JSON.stringify(doc);
    const vue = creerVueCoupe("vc1", def(), doc, src());
    const modifiee = annoterVueCoupe(vue.definition, { op: "modifier", annotation: { id: "a1", type: "texte", position: { x: 2, y: 2.5 }, texte: "largeur 9 m" } });
    const vue2 = creerVueCoupe("vc1", modifiee, doc, src());
    expect(JSON.stringify(doc)).toBe(avant);
    expect(doc.solides?.find((s) => s.id === "b1")).toMatchObject({ width: 2, depth: 1, height: 3 });
    expect(vue2.empreinteSection).toBe(vue.empreinteSection);
    expect(vue2.empreinte).not.toBe(vue.empreinte);
    expect(vue2.definition.annotations[0]!.texte).toBe("largeur 9 m");
    expect(() => annoterVueCoupe(vue.definition, { op: "retirer", id: "absente" })).toThrow(StudioValidationError);
    expect(() => annoterVueCoupe(vue.definition, { op: "ajouter", annotation: vue.definition.annotations[0]! })).toThrow(StudioValidationError);
  });

  it("EX-075 [−] définition incomplète refusée : cadrage vide, échelle libre, repère non déclaré, style inconnu", () => {
    expect(() => validerVueCoupe(def({ cadrage: { xMin: 1, yMin: 0, xMax: 1, yMax: 5 } }))).toThrow(StudioValidationError);
    expect(() => validerVueCoupe(def({ echelle: 75 as never }))).toThrow(StudioValidationError);
    expect(() => validerVueCoupe(def({ niveau: { repere: "local-2d" as never, z: 1 } }))).toThrow(StudioValidationError);
    expect(() => validerVueCoupe(def({ styles: { trait: "epais" as never, hachure: "aucune" } }))).toThrow(StudioValidationError);
  });
});
