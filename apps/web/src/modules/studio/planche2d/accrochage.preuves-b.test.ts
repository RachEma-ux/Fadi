/**
 * Preuves du groupe B sur l'index et l'accrochage de la planche 2D :
 * - C.1-06 : objets **transformés** (rotation, symétrie avec copie superposée, échelle, composition des trois) par les
 *   commandes du modèle, calques masqués et verrouillés compris : sélection par rectangle, candidats et repère résolu
 *   identiques par l'index (grille) et par le parcours linéaire, y compris par l'index incrémental après transformation ;
 * - TR-EX-025 (cas négatif) : permuter l'ordre des candidats (ordre des objets du document) ne fait choisir aucun autre
 *   point hors contrat — même point, même genre ; seul un départage à égalité exacte de distance et de mode peut
 *   changer l'objet porteur, et alors le point retenu est l'un des candidats ex aequo du calcul de référence ;
 * - AC-004 : trace des cas ambigus (plusieurs repères à égale distance du pointeur) relevée sur un corpus superposé et
 *   dense, avec le même ordre départagé par l'index et par le parcours linéaire ; cas explicite extrémité / intersection
 *   confondues comparé avant / après index (point, cible, priorité).
 */
import { describe, expect, it, vi } from "vitest";
import { applyStudioCommands, validateStudioDocument, type StudioCommand, type StudioDocument, type StudioLayer, type StudioShape } from "@parcours/atelier-model";
import { candidatsObjets, indexAccrochage, indexLineaire, MODES_ACCROCHAGE, rangRepere, resoudre, suiviAccrochage, type ReglagesAccrochage, type Repere, type RequeteAccrochage } from "./accrochage";
import { selectionParRectangle, selectionParRectangleLineaire } from "./selection";

vi.setConfig({ testTimeout: 60_000 });

function alea(graine: number) {
  let s = graine >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

const LAYERS: StudioLayer[] = [
  { id: "visible", name: "Visible", visible: true, locked: false },
  { id: "masque", name: "Masqué", visible: false, locked: false },
  { id: "verrou", name: "Verrouillé", visible: true, locked: true },
];

/** Document aléatoire sur une trame entière (bords exacts, objets confondus fréquents), au-dessus du seuil de l'index. */
function documentAleatoire(graine: number, n: number): StudioDocument {
  const rnd = alea(graine);
  const pt = () => ({ x: Math.round(rnd() * 40), y: Math.round(rnd() * 40) });
  const calque = (i: number) => (i % 11 === 0 ? { layerId: "masque" } : i % 13 === 0 ? { layerId: "verrou" } : i % 3 === 0 ? { layerId: "visible" } : {});
  const objects: StudioShape[] = [];
  for (let i = 0; i < n; i++) {
    const id = `e${i}`, c = pt(), k = i % 6;
    // Un objet sur dix est la copie exacte du précédent (objets superposés).
    if (i % 10 === 9 && objects.length) { const prec = objects[objects.length - 1]!; objects.push({ ...structuredClone(prec), id, ...calque(i) }); continue; }
    if (k === 0) objects.push({ id, type: "line", ...calque(i), start: c, end: pt() });
    else if (k === 1) objects.push({ id, type: "rectangle", ...calque(i), origin: c, width: 1 + Math.round(rnd() * 5), height: 1 + Math.round(rnd() * 5) });
    else if (k === 2) objects.push({ id, type: "circle", ...calque(i), center: c, radius: 0.5 + Math.round(rnd() * 4) });
    else if (k === 3) objects.push({ id, type: "arc", ...calque(i), center: c, radius: 1 + Math.round(rnd() * 3), startAngle: rnd() * 6, endAngle: rnd() * 6 });
    else if (k === 4) { const closed = rnd() < 0.5; objects.push({ id, type: "polyline", ...calque(i), closed, points: [c, { x: c.x + 2, y: c.y }, { x: c.x + 2, y: c.y + 3 }], bulges: closed ? [0, rnd() - 0.5, 0] : [0, rnd() - 0.5] }); }
    else objects.push({ id, type: "line", ...calque(i), start: c, end: { x: c.x, y: c.y + 4 } });
  }
  return { id: "doc", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects, layers: LAYERS };
}

/** Objets transformables (hors calque verrouillé : le modèle refuse de les transformer). */
const libres = (d: StudioDocument) => d.objects.filter((o) => o.layerId !== "verrou").map((o) => o.id);

const TRANSFORMATIONS: Record<string, (d: StudioDocument) => StudioCommand[]> = {
  rotation: (d) => [{ toolId: "studio.dessin.rotation", params: { ids: libres(d), center: { x: 20, y: 20 }, angle: 0.7 } }],
  "symétrie (copie superposée)": (d) => [{ toolId: "studio.dessin.symetrie", params: { ids: libres(d).slice(0, 600), axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 2 }, keepSource: true, prefix: "sym-" } }],
  échelle: (d) => [{ toolId: "studio.dessin.echelle", params: { ids: libres(d), center: { x: 5, y: 5 }, factor: 1.7, includeVolumes: false } }],
  composition: (d) => [
    { toolId: "studio.dessin.rotation", params: { ids: libres(d), center: { x: 0, y: 0 }, angle: -1.1 } },
    { toolId: "studio.dessin.symetrie", params: { ids: libres(d), axisStart: { x: 0, y: 0 }, axisEnd: { x: 3, y: 1 }, keepSource: false } },
    { toolId: "studio.dessin.echelle", params: { ids: libres(d), center: { x: 2, y: 3 }, factor: 0.6, includeVolumes: false } },
  ],
};

const REGLAGES: ReglagesAccrochage = { objets: true, modes: new Set(MODES_ACCROCHAGE), orthogonal: false, polaire: false, pasPolaire: 45 };
const resume = (x: Repere | null) => x && { point: x.point, genre: x.genre, objets: x.objets, ancre: x.ancre, priorite: rangRepere(x.genre) };

/** Requêtes reproductibles près des sommets des objets (accrochage effectif), avec et sans dernier point, avec et sans vue. */
function requetes(d: StudioDocument, graine: number, n: number): RequeteAccrochage[] {
  const rnd = alea(graine);
  const sommets = d.objects.flatMap((o) => (o.type === "line" ? [o.start, o.end] : o.type === "rectangle" ? [o.origin] : o.type === "polyline" ? o.points : o.type === "circle" || o.type === "arc" ? [o.center] : []));
  return Array.from({ length: n }, (_, k) => {
    const s = sommets[Math.floor(rnd() * sommets.length)]!;
    const curseur = { x: s.x + (rnd() - 0.5) * 0.3, y: s.y + (rnd() - 0.5) * 0.3 };
    return {
      curseur, tolerance: [0.1, 0.3, 1][k % 3]!, base: k % 2 ? { x: curseur.x + 2, y: curseur.y - 1 } : null,
      vue: k % 4 === 0 ? undefined : { min: { x: curseur.x - 6, y: curseur.y - 4 }, max: { x: curseur.x + 6, y: curseur.y + 4 } },
    };
  });
}

describe("C.1-06 — objets transformés (rotation, symétrie, échelle) : indexé = linéaire", () => {
  // Document relu par le modèle (forme canonique), base de comparaison des objets transformés.
  const source = validateStudioDocument(documentAleatoire(31, 1400));
  for (const [nom, commandes] of Object.entries(TRANSFORMATIONS)) {
    it(`${nom} : sélection par rectangle, candidats et repère résolu identiques ; index incrémental = parcours linéaire`, () => {
      const d = applyStudioCommands(source, commandes(source));
      // La transformation a réellement changé la géométrie des objets libres, pas celle des objets verrouillés.
      // (Symétrie avec copie : les sources restent, les copies transformées s'ajoutent.)
      const change = d.objects.filter((o) => { const s = source.objects.find((x) => x.id === o.id); return !s || JSON.stringify(s) !== JSON.stringify(o); });
      expect(change.length, nom).toBeGreaterThan(500);
      expect(change.every((o) => o.layerId !== "verrou")).toBe(true);
      expect(d.objects.length).toBeGreaterThanOrEqual(1000);

      const rnd = alea(7);
      let nonVides = 0;
      for (let k = 0; k < 120; k++) {
        const a = { x: Math.round(rnd() * 90) - 45, y: Math.round(rnd() * 90) - 45 };
        const b = { x: Math.round(rnd() * 90) - 45, y: Math.round(rnd() * 90) - 45 };
        const attendu = selectionParRectangleLineaire(d, a, b);
        if (attendu.length) nonVides++;
        expect(selectionParRectangle(d, a, b, 0), `${nom} ${JSON.stringify([a, b])}`).toEqual(attendu);
      }
      expect(nonVides, `${nom} sélections non vides`).toBeGreaterThan(40);

      const lin = indexLineaire(d.objects), idx = indexAccrochage(d.objects, 0);
      const suivi = suiviAccrochage(0);
      suivi.indexer(source.objects);
      const incr = suivi.indexer(d.objects);
      let trouves = 0;
      for (const q of requetes(d, 5, 150)) {
        const attendu = candidatsObjets(lin, q, REGLAGES);
        expect(candidatsObjets(idx, q, REGLAGES)).toEqual(attendu);
        expect(candidatsObjets(incr, q, REGLAGES)).toEqual(attendu);
        const r = resoudre(lin, q, REGLAGES);
        expect(resume(resoudre(idx, q, REGLAGES))).toEqual(resume(r));
        if (r) trouves++;
      }
      expect(trouves, `${nom} repères trouvés`).toBeGreaterThan(60);
    });
  }
});

/** Candidats ex aequo du vainqueur (même rang, même genre, même distance à 1e-12 près). */
const exAequo = (liste: readonly Repere[], v: Repere) =>
  liste.filter((c) => rangRepere(c.genre) === rangRepere(v.genre) && c.genre === v.genre && Math.abs(c.distance - v.distance) <= 1e-12);

describe("TR-EX-025 (cas négatif) — permuter les candidats ne fait choisir aucun point hors contrat", () => {
  it("ordre des objets inversé puis mélangé : même point et même genre ; à égalité exacte, l'un des candidats ex aequo de la référence", () => {
    const d = documentAleatoire(41, 1200);
    const rnd = alea(99);
    const melange = [...d.objects].map((o) => ({ o, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.o);
    const ordres = { inverse: [...d.objects].reverse(), melange };
    const ref = indexAccrochage(d.objects, 0);
    let compares = 0, departages = 0;
    for (const [nom, objets] of Object.entries(ordres)) {
      for (const idx of [indexAccrochage(objets, 0), indexLineaire(objets)]) {
        for (const q of requetes(d, 13, 200)) {
          const r0 = resoudre(ref, q, REGLAGES), r1 = resoudre(idx, q, REGLAGES);
          expect(r1 === null, nom).toBe(r0 === null);
          if (!r0 || !r1) continue;
          compares++;
          expect(r1.genre, nom).toBe(r0.genre);
          expect(r1.distance, nom).toBeCloseTo(r0.distance, 12);
          if (JSON.stringify(r1.point) !== JSON.stringify(r0.point)) {
            departages++;
            // Seul cas admis par le contrat : égalité exacte de mode et de distance, départagée par l'ordre des objets.
            const candidats0 = candidatsObjets(ref, q, REGLAGES);
            expect(exAequo(candidats0, r0).some((c) => JSON.stringify(c.point) === JSON.stringify(r1.point)), `${nom} ${JSON.stringify(q.curseur)}`).toBe(true);
          }
        }
      }
    }
    expect(compares).toBeGreaterThan(400);
    console.log(`TR-EX-025 : ${compares} repères comparés après permutation, ${departages} départage(s) à égalité exacte`);
  });
});

describe("AC-004 — mêmes cibles et points par l'index, trace des cas ambigus", () => {
  it("extrémité et intersection confondues : même point, même cible, même priorité avant et après index (au-dessus du seuil)", () => {
    const fond = documentAleatoire(51, 1100).objects.map((o) => ({ ...o, id: `f-${o.id}`, layerId: "masque" as const }));
    const objets: StudioShape[] = [
      { id: "a", type: "line", start: { x: 100, y: 100 }, end: { x: 104, y: 100 } },
      { id: "b", type: "line", start: { x: 104, y: 100 }, end: { x: 104, y: 103 } },
      { id: "c", type: "line", start: { x: 102, y: 98 }, end: { x: 102, y: 102 } },
      ...fond.filter((o) => o.type !== "polyline"),
    ];
    const visibles = objets.filter((o) => o.layerId !== "masque");
    const lin = indexLineaire(visibles), idx = indexAccrochage([...visibles, ...Array.from({ length: 1000 }, (_, i): StudioShape => ({ id: `z${i}`, type: "line", start: { x: -500 - i, y: -500 }, end: { x: -499 - i, y: -500 } }))], 0);
    for (const q of [
      { curseur: { x: 104.05, y: 100.05 }, tolerance: 0.2, base: null },
      { curseur: { x: 102.02, y: 100.01 }, tolerance: 0.2, base: null },
      { curseur: { x: 101.98, y: 100.03 }, tolerance: 0.5, base: { x: 99, y: 99 } },
    ]) {
      const attendu = resoudre(lin, q, REGLAGES);
      expect(attendu).not.toBeNull();
      expect(resume(resoudre(idx, q, REGLAGES))).toEqual(resume(attendu));
    }
    expect(resoudre(idx, { curseur: { x: 104.05, y: 100.05 }, tolerance: 0.2, base: null }, REGLAGES)).toMatchObject({ genre: "extremite", point: { x: 104, y: 100 }, ancre: { objectId: "a", anchor: "end" } });
  });

  it("trace des cas ambigus (plusieurs repères à égale distance) : relevée, non vide, même ordre départagé par l'index et le linéaire", () => {
    const d = documentAleatoire(61, 1300);
    const visibles = d.objects.filter((o) => o.layerId !== "masque");
    const lin = indexLineaire(visibles), idx = indexAccrochage(visibles, 0);
    const trace: { curseur: { x: number; y: number }; exAequo: { genre: string; point: { x: number; y: number }; objets: readonly string[] }[] }[] = [];
    for (const q of requetes(d, 17, 400)) {
      const l = candidatsObjets(lin, q, REGLAGES), i = candidatsObjets(idx, q, REGLAGES);
      expect(i).toEqual(l);
      if (l.length < 2) continue;
      const egaux = l.filter((c) => Math.abs(c.distance - l[0]!.distance) <= 1e-12 && rangRepere(c.genre) === rangRepere(l[0]!.genre));
      if (egaux.length >= 2) trace.push({ curseur: q.curseur, exAequo: egaux.map((c) => ({ genre: c.genre, point: c.point, objets: c.objets })) });
    }
    // Le corpus a des objets confondus : des cas ambigus existent réellement et sont tracés.
    expect(trace.length).toBeGreaterThan(5);
    console.log(`AC-004 : ${trace.length} cas ambigus tracés, premier : ${JSON.stringify(trace[0])}`);
  });
});
