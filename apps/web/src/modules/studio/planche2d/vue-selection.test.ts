/** Logique pure de la vue (zoom, panoramique, pincement, grille) et de la sélection multiple de la planche 2D. */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { CADRE_INITIAL, nouvelleCote, type Cadre } from "./geometrie-2d";
import {
  ajouter, basculer, commandesDeplacement, modeRectangle, retenu, segmentTouche, selectionParRectangle, selectionValide, toutSelectionnable,
} from "./selection";
import { ecranVersPlanche, facteurMolette, glisserVue, LARGEUR_VUE, pasGrille, pincer, surGrille, zoomer, zoomerAuCentre } from "./vue";

const proche = (a: Cadre, b: Cadre) => { for (const k of ["x", "y", "w", "h"] as const) expect(a[k]).toBeCloseTo(b[k], 9); };
const ligne = (id: string, x1: number, y1: number, x2: number, y2: number, layerId?: string): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", ...(layerId ? { layerId } : {}), start: { x: x1, y: y1 }, end: { x: x2, y: y2 } } });
const rect = (id: string, x: number, y: number, w: number, h: number, layerId?: string): StudioCommand => ({ toolId: "studio.dessin.rectangle", params: { id, type: "rectangle", ...(layerId ? { layerId } : {}), origin: { x, y }, width: w, height: h } });

describe("vue : zoom, panoramique, pincement", () => {
  const c: Cadre = { x: 0, y: 0, w: 20, h: 15 };
  const ecran = { left: 100, top: 50, width: 800, height: 600 };

  it("le zoom garde le point visé à sa place et le rapport de la vue", () => {
    const p = { x: 5, y: 3 };
    const z = zoomer(c, p, 0.5);
    expect(z.w).toBe(10);
    expect(z.w / z.h).toBeCloseTo(c.w / c.h);
    // Même fraction de la vue avant et après : le point reste sous le pointeur.
    expect((p.x - z.x) / z.w).toBeCloseTo((p.x - c.x) / c.w);
    expect((p.y - z.y) / z.h).toBeCloseTo((p.y - c.y) / c.h);
    proche(zoomer(z, p, 2), c);
    expect(zoomer(c, p, 0)).toBe(c);
    expect(zoomer(c, p, Number.NaN)).toBe(c);
  });

  it("zoom borné, boutons centrés, molette bornée", () => {
    expect(zoomer(c, { x: 0, y: 0 }, 1e-9).w).toBe(LARGEUR_VUE.min);
    expect(zoomer(c, { x: 0, y: 0 }, 1e9).w).toBe(LARGEUR_VUE.max);
    const avant = zoomerAuCentre(c, true);
    expect(avant.w).toBeCloseTo(16);
    expect(avant.x + avant.w / 2).toBeCloseTo(10);
    proche(zoomerAuCentre(avant, false), c);
    expect(facteurMolette(-100)).toBeLessThan(1);
    expect(facteurMolette(100)).toBeGreaterThan(1);
    expect(facteurMolette(1e6)).toBe(2);
    expect(facteurMolette(-1e6)).toBe(0.5);
    expect(facteurMolette(3, 1)).toBeCloseTo(facteurMolette(48, 0));
  });

  it("écran → planche (xMidYMid meet) ; panoramique : le point saisi suit le pointeur", () => {
    expect(ecranVersPlanche(c, ecran, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
    expect(ecranVersPlanche(c, ecran, { x: 900, y: 650 })).toEqual({ x: 20, y: 15 });
    // Écran plus large que la vue : bandes latérales.
    expect(ecranVersPlanche(c, { left: 0, top: 0, width: 1000, height: 600 }, { x: 100, y: 0 })).toEqual({ x: 0, y: 0 });
    const depart = ecranVersPlanche(c, ecran, { x: 300, y: 200 });
    const courant = ecranVersPlanche(c, ecran, { x: 340, y: 180 });
    const g = glisserVue(c, depart, courant);
    expect(g.w).toBe(c.w);
    // Le point saisi est maintenant sous le pointeur.
    const relu = ecranVersPlanche(g, ecran, { x: 340, y: 180 });
    expect(relu.x).toBeCloseTo(depart.x);
    expect(relu.y).toBeCloseTo(depart.y);
  });

  it("pincement : chaque point saisi reste sous son doigt", () => {
    const s0 = [{ x: 300, y: 300 }, { x: 500, y: 300 }] as const, s1 = [{ x: 250, y: 320 }, { x: 650, y: 320 }] as const;
    const p0 = [ecranVersPlanche(c, ecran, s0[0]), ecranVersPlanche(c, ecran, s0[1])] as const;
    const q = [ecranVersPlanche(c, ecran, s1[0]), ecranVersPlanche(c, ecran, s1[1])] as const;
    const r = pincer(c, p0, q);
    expect(r.w).toBeCloseTo(c.w / 2);
    for (const i of [0, 1]) {
      const relu = ecranVersPlanche(r, ecran, s1[i]!);
      expect(relu.x).toBeCloseTo(p0[i]!.x);
      expect(relu.y).toBeCloseTo(p0[i]!.y);
    }
    // Doigts confondus : panoramique seul.
    expect(pincer(c, [p0[0], p0[0]], [q[0], q[0]]).w).toBe(c.w);
  });

  it("grille : 1 m au cadre initial, puissance de dix selon la vue ; accrochage sans bruit flottant", () => {
    expect(pasGrille(CADRE_INITIAL)).toBe(1);
    expect(pasGrille({ ...c, w: 240 })).toBe(10);
    expect(pasGrille({ ...c, w: 2.4 })).toBe(0.1);
    expect(surGrille({ x: 1.26, y: -0.74 }, 0.5)).toEqual({ x: 1.5, y: -0.5 });
    expect(surGrille({ x: 0.3, y: 0.7 }, 0.1)).toEqual({ x: 0.3, y: 0.7 });
    expect(Object.is(surGrille({ x: -0.2, y: 0 }, 1).x, 0)).toBe(true);
  });
});

describe("sélection multiple", () => {
  const doc: StudioDocument = applyStudioCommands(newStudioDocument("d"), [
    ligne("l1", 0, 0, 4, 0), rect("r1", 5, 5, 2, 1),
    { toolId: "studio.calque.creer", params: { id: "verrou", name: "V", visible: true, locked: false } },
    { toolId: "studio.calque.creer", params: { id: "cache", name: "C", visible: false, locked: false } },
    ligne("l2", 1, 1, 2, 1, "verrou"), ligne("l3", 1, 2, 2, 2, "cache"),
    { toolId: "studio.calque.modifier", params: { id: "verrou", name: "V", visible: true, locked: true } },
  ]);

  it("tout sélectionner : affiché et déverrouillé seulement ; bascule, union, nettoyage", () => {
    expect(toutSelectionnable(doc)).toEqual(["l1", "r1"]);
    expect(basculer(["l1"], "r1")).toEqual(["l1", "r1"]);
    expect(basculer(["l1", "r1"], "l1")).toEqual(["r1"]);
    expect(ajouter(["l1"], ["r1", "l1"])).toEqual(["l1", "r1"]);
    expect(selectionValide(doc, ["l1", "l2", "l3", "absent", "l1"])).toEqual(["l1"]);
  });

  it("de gauche à droite : fenêtre (entièrement dedans) ; de droite à gauche : capture (touché)", () => {
    expect(modeRectangle({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe("fenetre");
    expect(modeRectangle({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe("capture");
    // Fenêtre autour de tout : les deux objets sélectionnables, jamais le verrouillé ni le masqué.
    expect(selectionParRectangle(doc, { x: -1, y: -1 }, { x: 8, y: 7 })).toEqual(["l1", "r1"]);
    // Fenêtre qui coupe la ligne : rien ; la même zone en capture prend la ligne.
    expect(selectionParRectangle(doc, { x: 1, y: -1 }, { x: 3, y: 1 })).toEqual([]);
    expect(selectionParRectangle(doc, { x: 3, y: -1 }, { x: 1, y: 1 })).toEqual(["l1"]);
    // Capture à l'intérieur du rectangle sans toucher ses côtés : non retenu (contour seulement).
    expect(selectionParRectangle(doc, { x: 6.5, y: 5.2 }, { x: 5.5, y: 5.8 })).toEqual([]);
    expect(selectionParRectangle(doc, { x: 7.5, y: 5.2 }, { x: 6.5, y: 5.8 })).toEqual(["r1"]);
  });

  it("segments : intersection sans extrémité dedans, parallèle extérieur, cote", () => {
    const r = { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } };
    expect(segmentTouche(r, [{ x: -1, y: 0.5 }, { x: 2, y: 0.5 }])).toBe(true);
    expect(segmentTouche(r, [{ x: -1, y: 2 }, { x: 2, y: 2 }])).toBe(false);
    expect(segmentTouche(r, [{ x: -1, y: 1.5 }, { x: 1.5, y: -1 }])).toBe(true);
    expect(segmentTouche(r, [{ x: 2, y: -1 }, { x: 2, y: 3 }])).toBe(false);
    const cote = nouvelleCote("c", { point: { x: 0, y: 0 }, accroche: null }, { point: { x: 1, y: 0 }, accroche: null }, 0.5);
    expect(retenu(cote, { min: { x: -0.1, y: -0.1 }, max: { x: 1.1, y: 0.6 } }, "fenetre")).toBe(true);
    expect(retenu(cote, { min: { x: -0.1, y: -0.1 }, max: { x: 1.1, y: 0.4 } }, "fenetre")).toBe(false);
  });

  it("déplacement : une commande par objet, rien pour un déplacement nul, verrouillé ou cote liée", () => {
    expect(commandesDeplacement(doc, ["l1", "r1"], 1, -2)).toEqual({
      commandes: [{ toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 1, dy: -2 } }, { toolId: "studio.dessin.deplacer", params: { id: "r1", dx: 1, dy: -2 } }],
      cotesLiees: [],
    });
    expect(commandesDeplacement(doc, ["l1"], 0, 0).commandes).toEqual([]);
    expect(commandesDeplacement(doc, ["l2", "l3"], 1, 1).commandes).toEqual([]);
    const liee = nouvelleCote("c1", { point: { x: 0, y: 0 }, accroche: { point: { x: 0, y: 0 }, objectId: "l1", anchor: "start" } }, { point: { x: 4, y: 0 }, accroche: { point: { x: 4, y: 0 }, objectId: "l1", anchor: "end" } }, 0.5);
    const avecCote = applyStudioCommands(doc, [{ toolId: "studio.dessin.cote", params: liee }]);
    const d = commandesDeplacement(avecCote, ["l1", "c1"], 1, 0);
    expect(d.cotesLiees).toEqual(["c1"]);
    expect(d.commandes).toHaveLength(1);
    // Le modèle accepte le lot ; la cote liée suit la ligne.
    const apres = applyStudioCommands(avecCote, d.commandes);
    expect(apres.dimensions![0]).toMatchObject({ start: { x: 1, y: 0 }, end: { x: 5, y: 0 } });
  });
});
