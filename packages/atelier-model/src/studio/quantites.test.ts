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
    const inconnu = { ...d, objects: [...d.objects, { id: "ell", type: "ellipse", center: { x: 0, y: 0 }, rx: 2, ry: 1 }] } as unknown as StudioDocument;
    const qi = quantitesStudio(inconnu);
    expect(qi.objets.at(-1)).toMatchObject({ objetId: "ell", type: "ellipse", nature: "non-pris-en-charge", motif: "type-non-pris-en-charge", valeurs: [] });
    expect(qi.nonPrisEnCharge).toBe(1);
    expect(qi.totaux.find((t) => t.grandeur === "longueur")!.nonEvalues).toBe(1);
  });

  describe("courbes : valeurs analytiques exactes", () => {
    const PI = Math.PI;
    const qc = quantitesStudio(doc({
      objects: [
        { id: "c", type: "circle", center: { x: 1, y: 1 }, radius: 2 },
        { id: "cyl", type: "circle", center: { x: 0, y: 0 }, radius: 2, extrusion: { base: 0, height: 3 } },
        { id: "a", type: "arc", center: { x: 0, y: 0 }, radius: 2, startAngle: 0, endAngle: PI / 2 },
        { id: "a-tour", type: "arc", center: { x: 0, y: 0 }, radius: 1, startAngle: (3 * PI) / 2, endAngle: PI / 2 },
        { id: "a-voile", type: "arc", center: { x: 0, y: 0 }, radius: 2, startAngle: 0, endAngle: PI / 2, extrusion: { base: 0, height: 3 } },
        { id: "a-mur", type: "arc", center: { x: 0, y: 0 }, radius: 2, startAngle: 0, endAngle: PI / 2, extrusion: { base: 0, height: 3, thickness: 0.4 } },
        { id: "po", type: "polyline", points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }], closed: false },
        { id: "po-b", type: "polyline", points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }], closed: false, bulges: [1, 0], extrusion: { base: 0, height: 2 } },
        { id: "carre", type: "polyline", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], closed: true },
        { id: "bosse", type: "polyline", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], closed: true, bulges: [1, 0, 0, 0] },
        { id: "creux", type: "polyline", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], closed: true, bulges: [-1, 0, 0, 0] },
        { id: "disque", type: "polyline", points: [{ x: -1, y: 0 }, { x: 1, y: 0 }], closed: true, bulges: [1, 1] },
        { id: "secteur", type: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], closed: true, bulges: [0, Math.tan(PI / 8), 0], extrusion: { base: 0, height: 2 } },
        { id: "noeud", type: "polyline", points: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }], closed: true },
      ] as StudioDocument["objects"],
    }));
    const o = (id: string) => qc.objets.find((x) => x.objetId === id)!;
    const proche = (id: string, attendu: Record<string, number | null>) => {
      const lu = v(qc, id);
      expect(Object.keys(lu).sort()).toEqual(Object.keys(attendu).sort());
      for (const [g, x] of Object.entries(attendu)) {
        if (x === null) expect(lu[g]).toBeNull();
        else expect(lu[g]).toBeCloseTo(x, 12);
      }
    };

    it("cercle : périmètre 2πr, surface πr² ; cylindre : volume πr²h", () => {
      proche("c", { perimetre: 4 * PI, surface: 4 * PI, volume: null });
      expect(o("c")).toMatchObject({ nature: "cercle" });
      expect(o("c").valeurs.find((x) => x.grandeur === "volume")!.motif).toBe("non-extrude");
      proche("cyl", { perimetre: 4 * PI, surface: 4 * PI, hauteur: 3, volume: 12 * PI });
      expect(o("cyl").nature).toBe("cylindre");
    });

    it("arc : longueur rθ, y compris un arc qui passe par l'angle 0", () => {
      proche("a", { longueur: PI, volume: null });
      proche("a-tour", { longueur: PI, volume: null });
      expect(o("a").nature).toBe("arc");
    });

    it("arc extrudé sans épaisseur : surface verticale rθh, volume non évalué", () => {
      proche("a-voile", { longueur: PI, hauteur: 3, "surface-verticale": 3 * PI, volume: null });
      expect(o("a-voile")).toMatchObject({ nature: "arc-extrude" });
      expect(o("a-voile").valeurs.find((x) => x.grandeur === "volume")!.motif).toBe("epaisseur-non-declaree");
    });

    it("mur courbe : faces (r ± e/2)θh, volume = secteur annulaire × hauteur", () => {
      proche("a-mur", { longueur: PI, hauteur: 3, "surface-laterale": 6 * PI, volume: 1.2 * PI });
      expect(o("a-mur").nature).toBe("mur-courbe");
      const lat = o("a-mur").valeurs.find((x) => x.grandeur === "surface-laterale")!;
      expect(lat.faces!.interieure).toBeCloseTo(1.8 * (PI / 2) * 3, 12);
      expect(lat.faces!.exterieure).toBeCloseTo(2.2 * (PI / 2) * 3, 12);
      // θ/2 · (rₑ² − rᵢ²) · h
      expect(v(qc, "a-mur").volume).toBeCloseTo((PI / 4) * (2.2 ** 2 - 1.8 ** 2) * 3, 12);
    });

    it("polyligne ouverte : longueur (arc de renflement compris), surface verticale extrudée, aucun volume", () => {
      proche("po", { longueur: 7 });
      expect(o("po").nature).toBe("polyligne-ouverte");
      // bulge 1 : demi-cercle sur une corde de 3.
      proche("po-b", { longueur: 1.5 * PI + 4, hauteur: 2, "surface-verticale": 2 * (1.5 * PI + 4) });
      expect(o("po-b").nature).toBe("polyligne-ouverte-extrudee");
    });

    it("polyligne fermée : périmètre et surface, renflements vers l'extérieur ou l'intérieur", () => {
      proche("carre", { perimetre: 8, surface: 4, volume: null });
      expect(o("carre").nature).toBe("polyligne-fermee");
      proche("bosse", { perimetre: 6 + PI, surface: 4 + PI / 2, volume: null });
      proche("creux", { perimetre: 6 + PI, surface: 4 - PI / 2, volume: null });
      proche("disque", { perimetre: 2 * PI, surface: PI, volume: null });
    });

    it("prisme sur polyligne fermée : quart de disque (renflement tan(π/8)), volume aire × h", () => {
      proche("secteur", { perimetre: 2 + PI / 2, surface: PI / 4, hauteur: 2, volume: PI / 2 });
      expect(o("secteur").nature).toBe("prisme-polyligne");
    });

    it("polyligne fermée qui se croise : surface non évaluée, périmètre évalué", () => {
      proche("noeud", { perimetre: 4 + 4 * Math.SQRT2, surface: null, volume: null });
      expect(o("noeud").valeurs.find((x) => x.grandeur === "surface")!.motif).toBe("contour-non-simple");
    });

    it("rien n'est hors métré : aucun objet non pris en charge", () => {
      expect(qc.nonPrisEnCharge).toBe(0);
      expect(total(qc.totaux, "surface-verticale")).toBeCloseTo(3 * PI + 2 * (1.5 * PI + 4), 12);
    });
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
