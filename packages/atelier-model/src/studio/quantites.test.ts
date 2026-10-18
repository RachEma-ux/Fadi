import { describe, expect, it } from "vitest";
import { newStudioDocument, type StudioDocument } from "./document-2d.js";
import { appliquerAjustementsQuantites, controlerAjustementQuantite, quantitesStudio, type AjustementQuantite } from "./quantites.js";

const doc = (patch: Partial<StudioDocument>): StudioDocument => ({ ...newStudioDocument("d"), ...patch });
const v = (q: ReturnType<typeof quantitesStudio>, id: string) => Object.fromEntries(q.objets.find((o) => o.objetId === id)!.valeurs.map((x) => [x.grandeur, x.valeur]));
const total = (t: { grandeur: string; valeur: number | null }[], g: string) => t.find((x) => x.grandeur === g)?.valeur;

describe("métré Studio (quantités brutes)", () => {
  const d = doc({
    layers: [{ id: "murs", name: "Murs", visible: true, locked: false }, { id: "cache", name: "Caché", visible: false, locked: false }],
    objects: [
      { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 3, y: 4 } },
      { id: "r", type: "rectangle", origin: { x: 0, y: 0 }, width: 2, height: 3 },
      { id: "mur", type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, extrusion: { base: 0, height: 2.5, thickness: 0.2 } },
      { id: "voile", type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 0, y: 4 }, extrusion: { base: 0, height: 3 } },
      { id: "prisme", type: "rectangle", layerId: "cache", origin: { x: 1, y: -0.1 }, width: 1, height: 0.2, extrusion: { base: 0, height: 2 } },
    ],
    dimensions: [{ id: "c", type: "dimension", start: { x: 0, y: 0 }, end: { x: 3, y: 4 }, offset: 1, links: { start: null, end: null }, toResolve: false }],
  });
  const q = quantitesStudio(d);

  it("ligne, rectangle : longueur, périmètre, surface ; volume non évalué faute d'extrusion", () => {
    expect(v(q, "l")).toEqual({ longueur: 5, volume: null });
    expect(v(q, "r")).toEqual({ perimetre: 10, surface: 6, volume: null });
    expect(q.objets.find((o) => o.objetId === "r")!.valeurs.find((x) => x.grandeur === "volume")!.motif).toBe("non-extrude");
  });

  it("mur (ligne + épaisseur), ligne extrudée sans épaisseur, prisme", () => {
    expect(v(q, "mur")).toEqual({ longueur: 10, hauteur: 2.5, "surface-laterale": 50, volume: 10 * 0.2 * 2.5 });
    expect(v(q, "voile")).toEqual({ longueur: 4, hauteur: 3, "surface-verticale": 12, volume: null });
    expect(q.objets.find((o) => o.objetId === "voile")!.valeurs.find((x) => x.grandeur === "volume")!.motif).toBe("epaisseur-non-declaree");
    expect(v(q, "prisme")).toEqual({ perimetre: 2.4, surface: 0.2, hauteur: 2, volume: 0.4 });
  });

  it("aucune déduction devinée d'un recouvrement ; cotes exclues ; calque masqué compté et signalé", () => {
    expect(q.deductions).toBe("non-declarees");
    expect(v(q, "mur").volume).toBe(5); // le prisme qui le traverse ne retranche rien
    expect(q.cotesExclues).toBe(1);
    expect(q.objets.some((o) => o.objetId === "c")).toBe(false);
    const cache = q.calques.find((c) => c.calqueId === "cache")!;
    expect(cache.masque).toBe(true);
    expect(cache.objets[0]!.calqueMasque).toBe(true);
    expect(q.calques.map((c) => c.calqueId)).toEqual(["default", "murs", "cache"]);
  });

  it("totaux par calque et généraux, hauteurs exclues, non évalués comptés", () => {
    const murs = q.calques.find((c) => c.calqueId === "murs")!;
    expect(total(murs.totaux, "longueur")).toBe(14);
    expect(total(murs.totaux, "hauteur")).toBeUndefined();
    expect(murs.totaux.find((t) => t.grandeur === "volume")).toMatchObject({ valeur: 5, evalues: 1, nonEvalues: 1, unite: "m3" });
    expect(total(q.totaux, "surface")).toBeCloseTo(6.2, 12);
    expect(q.totaux.find((t) => t.grandeur === "volume")).toMatchObject({ valeur: 5.4, evalues: 2, nonEvalues: 3 });
  });

  it("type inconnu : rapporté non évalué par son type, et chaque total devient partiel", () => {
    const inconnu = { ...d, objects: [...d.objects, { id: "cercle", type: "circle", center: { x: 0, y: 0 }, radius: 1 }] } as unknown as StudioDocument;
    const qi = quantitesStudio(inconnu);
    expect(qi.objets.at(-1)).toMatchObject({ objetId: "cercle", type: "circle", nature: "non-pris-en-charge", motif: "type-non-pris-en-charge", valeurs: [] });
    expect(qi.nonPrisEnCharge).toBe(1);
    expect(qi.totaux.find((t) => t.grandeur === "longueur")!.nonEvalues).toBe(1);
  });

  it("document vide : aucun calque, aucun total", () => {
    expect(quantitesStudio(doc({}))).toMatchObject({ calques: [], objets: [], totaux: [], cotesExclues: 0 });
  });

  describe("ajustements manuels", () => {
    const a = (p: Partial<AjustementQuantite>): AjustementQuantite => ({ objetId: "mur", grandeur: "volume", valeur: 4.5, motif: "Relevé sur site", auteur: "Fadi B.", date: "2026-10-18T10:00:00.000Z", ...p });

    it("contrôle : objet, grandeur applicable, valeur, motif, auteur, date", () => {
      expect(controlerAjustementQuantite(q, a({}))).toBeNull();
      expect(controlerAjustementQuantite(q, a({ objetId: "x" }))).toBe("objet-inconnu");
      expect(controlerAjustementQuantite(q, a({ grandeur: "surface" }))).toBe("grandeur-non-applicable");
      expect(controlerAjustementQuantite(q, a({ valeur: -1 }))).toBe("valeur-invalide");
      expect(controlerAjustementQuantite(q, a({ valeur: Number.NaN }))).toBe("valeur-invalide");
      expect(controlerAjustementQuantite(q, a({ motif: "  " }))).toBe("motif-obligatoire");
      expect(controlerAjustementQuantite(q, a({ auteur: "" }))).toBe("auteur-obligatoire");
      expect(controlerAjustementQuantite(q, a({ date: "hier" }))).toBe("date-invalide");
    });

    it("dérivée conservée, ajustée affichée, dernier ajustement en vigueur, refusés journalisés", () => {
      const r = appliquerAjustementsQuantites(q, [a({ valeur: 4 }), a({}), a({ objetId: "voile", valeur: 1.2 }), a({ motif: "" })]);
      const mur = r.objets.find((o) => o.objetId === "mur")!.valeurs.find((x) => x.grandeur === "volume")!;
      expect(mur).toMatchObject({ derivee: 5, valeur: 5, ajustee: 4.5, retenue: 4.5 });
      expect(mur.ajustement!.motif).toBe("Relevé sur site");
      const voile = r.objets.find((o) => o.objetId === "voile")!.valeurs.find((x) => x.grandeur === "volume")!;
      expect(voile).toMatchObject({ derivee: null, ajustee: 1.2, retenue: 1.2 });
      expect(r.journal.map((j) => [j.enVigueur, j.refus])).toEqual([[false, null], [true, null], [true, null], [false, "motif-obligatoire"]]);
      const vol = r.totaux.find((t) => t.grandeur === "volume")!;
      expect(vol).toMatchObject({ valeur: 5.4, ajustes: 2 });
      expect(vol.retenue).toBeCloseTo(4.5 + 1.2 + 0.4, 12);
      expect(r.calques.find((c) => c.calqueId === "murs")!.totaux.find((t) => t.grandeur === "volume")!.retenue).toBeCloseTo(5.7, 12);
    });

    it("retour explicite à la dérivée (valeur null), tracé", () => {
      const r = appliquerAjustementsQuantites(q, [a({}), a({ valeur: null, motif: "Erreur de saisie" })]);
      const mur = r.objets.find((o) => o.objetId === "mur")!.valeurs.find((x) => x.grandeur === "volume")!;
      expect(mur.ajustee).toBeUndefined();
      expect(mur.retenue).toBe(5);
      expect(mur.ajustement!.motif).toBe("Erreur de saisie");
    });
  });
});
