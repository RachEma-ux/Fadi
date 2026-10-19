/**
 * Index spatial de la planche 2D (C.1) : propriété « indexé = linéaire » sur des documents aléatoires (grille seule,
 * sélection par rectangle, candidats d'accrochage), seuil mesuré, et repli linéaire sous le seuil.
 */
import { describe, expect, it } from "vitest";
import type { StudioAnnotation, StudioDimension, StudioDocument, StudioLayer, StudioShape } from "@parcours/atelier-model";
import { candidatsObjets, indexAccrochage, indexLineaire, MODES_ACCROCHAGE, type ReglagesAccrochage } from "./accrochage";
import { indexGrille, indexLineaireBoites, indexSpatial, SEUIL_INDEX_SPATIAL, type Boite2D } from "./index-spatial";
import { selectionParRectangle, selectionParRectangleLineaire } from "./selection";

/** Générateur pseudo-aléatoire déterministe (reproductible). */
function alea(graine: number) {
  let s = graine >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function boites(rnd: () => number, n: number): Boite2D[] {
  return Array.from({ length: n }, (_, i) => {
    const x = Math.round(rnd() * 100), y = Math.round(rnd() * 100);
    if (i % 37 === 0) return { min: { x: -Infinity, y: -Infinity }, max: { x: Infinity, y: Infinity } };
    if (i % 23 === 0) return { min: { x: -500, y: -5 }, max: { x: 500, y: 5 } };
    const w = i % 5 === 0 ? 0 : Math.round(rnd() * 8), h = i % 7 === 0 ? 0 : Math.round(rnd() * 8);
    return { min: { x, y }, max: { x: x + w, y: y + h } };
  });
}

function zone(rnd: () => number): Boite2D {
  const k = rnd();
  if (k < 0.05) return { min: { x: 200, y: 200 }, max: { x: 300, y: 300 } };
  if (k < 0.1) return { min: { x: -1e6, y: -1e6 }, max: { x: 1e6, y: 1e6 } };
  const x = Math.round(rnd() * 110) - 5, y = Math.round(rnd() * 110) - 5;
  return { min: { x, y }, max: { x: x + Math.round(rnd() * 15), y: y + Math.round(rnd() * 15) } };
}

describe("Grille : même résultat que le parcours linéaire", () => {
  it("boîtes aléatoires (ponctuelles, plates, très grandes, infinies), zones aléatoires (bords exacts, hors emprise)", () => {
    for (const graine of [1, 2, 3, 4, 5]) {
      const rnd = alea(graine);
      const items = boites(rnd, 400 + graine * 300).map((b, i) => ({ i, b }));
      const grille = indexGrille(items, (t) => t.b);
      const lin = indexLineaireBoites(items, (t) => t.b);
      for (let k = 0; k < 300; k++) {
        const z = zone(rnd);
        expect(grille.chercher(z).map((t) => t.i), JSON.stringify(z)).toEqual(lin.chercher(z).map((t) => t.i));
      }
    }
  });
  it("ensembles dégénérés : vide, un seul point, tous confondus", () => {
    const z = { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } };
    expect(indexGrille([], (b: Boite2D) => b).chercher(z)).toEqual([]);
    const p = { min: { x: 1, y: 1 }, max: { x: 1, y: 1 } };
    expect(indexGrille([p, p, p], (b) => b).chercher(z)).toHaveLength(3);
    expect(indexGrille([p], (b) => b).chercher({ min: { x: 1.5, y: 0 }, max: { x: 2, y: 2 } })).toEqual([]);
  });
  it("seuil mesuré : linéaire en dessous, grille au-dessus, même contrat", () => {
    expect(SEUIL_INDEX_SPATIAL).toBe(1000);
    const items = boites(alea(9), 50);
    const z = { min: { x: 10, y: 10 }, max: { x: 40, y: 40 } };
    expect(indexSpatial(items, (b) => b).chercher(z)).toEqual(indexSpatial(items, (b) => b, 0).chercher(z));
  });
});

/** Document aléatoire sur une trame entière (bords exacts fréquents), calques masqués et verrouillés compris. */
function documentAleatoire(graine: number, n: number): StudioDocument {
  const rnd = alea(graine);
  const pt = () => ({ x: Math.round(rnd() * 60), y: Math.round(rnd() * 60) });
  const layers: StudioLayer[] = [
    { id: "visible", name: "Visible", visible: true, locked: false },
    { id: "masque", name: "Masqué", visible: false, locked: false },
    { id: "verrou", name: "Verrouillé", visible: true, locked: true },
  ];
  const calque = (i: number) => (i % 11 === 0 ? { layerId: "masque" } : i % 13 === 0 ? { layerId: "verrou" } : i % 3 === 0 ? { layerId: "visible" } : {});
  const objects: StudioShape[] = [];
  const dimensions: StudioDimension[] = [];
  const annotations: StudioAnnotation[] = [];
  for (let i = 0; i < n; i++) {
    const id = `e${i}`, c = pt(), k = i % 9;
    if (k === 0) objects.push({ id, type: "line", ...calque(i), start: c, end: pt() });
    else if (k === 1) objects.push({ id, type: "rectangle", ...calque(i), origin: c, width: 1 + Math.round(rnd() * 5), height: 1 + Math.round(rnd() * 5) });
    else if (k === 2) objects.push({ id, type: "circle", ...calque(i), center: c, radius: 0.5 + Math.round(rnd() * 4) });
    else if (k === 3) objects.push({ id, type: "arc", ...calque(i), center: c, radius: 1 + Math.round(rnd() * 3), startAngle: rnd() * 6, endAngle: rnd() * 6 });
    else if (k === 4) objects.push({ id, type: "polyline", ...calque(i), closed: rnd() < 0.5, points: [c, { x: c.x + 2, y: c.y }, { x: c.x + 2, y: c.y + 3 }], bulges: [0, rnd() - 0.5, 0] });
    else if (k === 5) dimensions.push({ id, type: "dimension", ...calque(i), start: c, end: { x: c.x + 3, y: c.y + 1 }, offset: 0.5, links: { start: null, end: null }, toResolve: false });
    else if (k === 6) annotations.push({ id, type: "text", ...calque(i), position: c, height: 0.3, rotation: rnd() * 6, content: "Séjour", justification: "center" });
    else if (k === 7) annotations.push({ id, type: "angular-dimension", ...calque(i), vertex: c, first: { x: c.x + 2, y: c.y }, second: { x: c.x, y: c.y + 2 }, radius: 1, links: { first: null, second: null }, toResolve: false });
    else objects.push({ id, type: "line", ...calque(i), start: c, end: { x: c.x, y: c.y + 4 } });
  }
  return { id: "doc", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects, layers, dimensions, annotations };
}

describe("Sélection par rectangle : indexée = linéaire", () => {
  it("documents aléatoires, fenêtre et capture, rectangles aux bords exacts", () => {
    let nonVides = 0;
    for (const graine of [11, 12, 13]) {
      const doc = documentAleatoire(graine, 900);
      const rnd = alea(graine * 7);
      for (let k = 0; k < 150; k++) {
        const a = { x: Math.round(rnd() * 70) - 5, y: Math.round(rnd() * 70) - 5 };
        const b = { x: Math.round(rnd() * 70) - 5, y: Math.round(rnd() * 70) - 5 };
        const attendu = selectionParRectangleLineaire(doc, a, b);
        if (attendu.length) nonVides++;
        expect(selectionParRectangle(doc, a, b, 0), `${graine} ${JSON.stringify([a, b])}`).toEqual(attendu);
      }
    }
    // Le test porte : une bonne part des rectangles retient des éléments.
    expect(nonVides).toBeGreaterThan(150);
  });
  it("sous le seuil, la sélection est le parcours linéaire", () => {
    const doc = documentAleatoire(5, 40);
    expect(selectionParRectangle(doc, { x: 0, y: 0 }, { x: 60, y: 60 })).toEqual(selectionParRectangleLineaire(doc, { x: 0, y: 0 }, { x: 60, y: 60 }));
  });
});

describe("Candidats d'accrochage : indexés = linéaires", () => {
  const reglages: ReglagesAccrochage = { objets: true, modes: new Set(MODES_ACCROCHAGE), orthogonal: false, polaire: false, pasPolaire: 45 };
  it("documents aléatoires, avec et sans vue, avec et sans dernier point", () => {
    let nonVides = 0;
    for (const graine of [21, 22]) {
      const objets = documentAleatoire(graine, 1200).objects;
      const lin = indexLineaire(objets), idx = indexAccrochage(objets, 0);
      expect(idx.taille).toBe(lin.taille);
      const rnd = alea(graine);
      for (let k = 0; k < 120; k++) {
        const curseur = { x: Math.round(rnd() * 120) / 2, y: Math.round(rnd() * 120) / 2 };
        const q = {
          curseur, tolerance: [0.1, 0.5, 2][k % 3]!, base: k % 2 ? { x: curseur.x - 1, y: curseur.y + 2 } : null,
          vue: k % 4 === 0 ? undefined : { min: { x: curseur.x - 8, y: curseur.y - 5 }, max: { x: curseur.x + 8, y: curseur.y + 5 } },
        };
        const attendu = candidatsObjets(lin, q, reglages);
        if (attendu.length) nonVides++;
        expect(candidatsObjets(idx, q, reglages)).toEqual(attendu);
      }
    }
    expect(nonVides).toBeGreaterThan(60);
  });
  it("sous le seuil, l'index d'accrochage est l'index linéaire", () => {
    const objets = documentAleatoire(3, 30).objects;
    const zoneTout = { min: { x: -1, y: -1 }, max: { x: 100, y: 100 } };
    expect(indexAccrochage(objets).formes(zoneTout)).toEqual(indexLineaire(objets).formes(zoneTout));
  });
});
