/**
 * Index spatial incrémental de la planche 2D (C.1-05) : insertions, suppressions et mises à jour testées par propriétés.
 * Des suites aléatoires de mutations (graine fixe, reproductibles) sont appliquées à l'index incrémental et, en
 * parallèle, à une liste de référence ; après chaque mutation, des requêtes aléatoires (bords exacts, hors emprise,
 * boîtes infinies ou très grandes) doivent rendre exactement le parcours linéaire. Puis les deux usages branchés sur
 * l'incrémental (sélection par rectangle, candidats d'accrochage) sont comparés au parcours linéaire au fil de
 * révisions successives du document — et le bilan prouve que l'index n'a pas été reconstruit.
 */
import { describe, expect, it, vi } from "vitest";
import type { StudioDocument, StudioLayer, StudioShape } from "@parcours/atelier-model";
import { candidatsObjets, indexLineaire, MODES_ACCROCHAGE, suiviAccrochage, type ReglagesAccrochage } from "./accrochage";
import { coteGrille, indexIncremental, suiviIncremental, type Boite2D } from "./index-spatial";
import { bilanIndexSelection, selectionParRectangle, selectionParRectangleLineaire } from "./selection";

vi.setConfig({ testTimeout: 60_000 });

/** Générateur pseudo-aléatoire déterministe (reproductible). */
function alea(graine: number) {
  let s = graine >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function boiteAleatoire(rnd: () => number): Boite2D {
  const k = rnd();
  if (k < 0.03) return { min: { x: -Infinity, y: -Infinity }, max: { x: Infinity, y: Infinity } };
  if (k < 0.06) return { min: { x: -500, y: -5 }, max: { x: 500, y: 5 } };
  if (k < 0.08) return { min: { x: 1e9, y: 1e9 }, max: { x: 1e9 + 1, y: 1e9 + 1 } };
  const x = Math.round(rnd() * 100), y = Math.round(rnd() * 100);
  const w = k < 0.2 ? 0 : Math.round(rnd() * 8), h = k < 0.3 ? 0 : Math.round(rnd() * 8);
  return { min: { x, y }, max: { x: x + w, y: y + h } };
}

function zoneAleatoire(rnd: () => number): Boite2D {
  const k = rnd();
  if (k < 0.05) return { min: { x: 200, y: 200 }, max: { x: 300, y: 300 } };
  if (k < 0.1) return { min: { x: -1e6, y: -1e6 }, max: { x: 1e6, y: 1e6 } };
  if (k < 0.12) return { min: { x: 1e9, y: 1e9 }, max: { x: 1e9 + 2, y: 1e9 + 2 } };
  const x = Math.round(rnd() * 110) - 5, y = Math.round(rnd() * 110) - 5;
  return { min: { x, y }, max: { x: x + Math.round(rnd() * 15), y: y + Math.round(rnd() * 15) } };
}

const recoupe = (a: Boite2D, b: Boite2D) => a.min.x <= b.max.x && b.min.x <= a.max.x && a.min.y <= b.max.y && b.min.y <= a.max.y;

interface Item { n: number }

describe("C.1-05 — index incrémental : suites aléatoires de mutations = parcours linéaire", () => {
  it("insertions, suppressions, mises à jour, remplacements et synchronisations (graines 1 à 6, 600 mutations chacune)", () => {
    let requetes = 0, nonVides = 0;
    for (const graine of [1, 2, 3, 4, 5, 6]) {
      const rnd = alea(graine);
      // Référence : liste ordonnée par rang, filtrée à chaque requête.
      let reference: { item: Item; boite: Boite2D; rang: number }[] = [];
      let compteur = 0, prochainRang = 0;
      const depart = Array.from({ length: 200 + graine * 50 }, () => ({ item: { n: compteur++ }, boite: boiteAleatoire(rnd) }));
      const index = indexIncremental<Item>(coteGrille(depart.map((d) => d.boite)));
      depart.forEach((d, i) => { index.inserer(d.item, d.boite); reference.push({ ...d, rang: i }); });
      prochainRang = depart.length;
      for (let m = 0; m < 600; m++) {
        const k = rnd(), cible = reference[Math.floor(rnd() * reference.length)];
        if (k < 0.3 || !cible) {
          const item = { n: compteur++ }, boite = boiteAleatoire(rnd);
          // Une insertion sur deux prend un rang au milieu de la suite (insertion dans le document, pas seulement en fin).
          const rang = rnd() < 0.5 ? prochainRang++ : Math.floor(rnd() * prochainRang) - 0.5 + item.n * 1e-9;
          index.inserer(item, boite, rang);
          reference.push({ item, boite, rang });
        } else if (k < 0.55) {
          expect(index.supprimer(cible.item)).toBe(true);
          reference = reference.filter((r) => r !== cible);
          expect(index.supprimer(cible.item)).toBe(false);
        } else if (k < 0.75) {
          const boite = boiteAleatoire(rnd);
          index.mettreAJour(cible.item, boite);
          cible.boite = boite;
        } else if (k < 0.93) {
          const nouveau = { n: compteur++ }, boite = boiteAleatoire(rnd);
          index.remplacer(cible.item, nouveau, boite);
          cible.item = nouveau; cible.boite = boite;
        } else {
          // Révision complète : la suite est réordonnée, une part retirée, une part ajoutée, le reste gardé.
          const garde = reference.filter(() => rnd() > 0.1);
          const ajouts = Array.from({ length: Math.floor(rnd() * 20) }, () => ({ item: { n: compteur++ }, boite: boiteAleatoire(rnd), rang: 0 }));
          const suite = [...garde, ...ajouts].sort(() => rnd() - 0.5);
          const boites = new Map(suite.map((s) => [s.item, s.boite]));
          const bilan = index.synchroniser(suite.map((s) => s.item), (t) => boites.get(t)!);
          expect(bilan).toEqual({ inseres: ajouts.length, supprimes: reference.length - garde.length, conserves: garde.length });
          reference = suite.map((s, i) => ({ ...s, rang: i }));
          prochainRang = suite.length;
        }
        expect(index.taille).toBe(reference.length);
        for (let q = 0; q < 6; q++) {
          const z = zoneAleatoire(rnd);
          const attendu = reference.filter((r) => recoupe(r.boite, z)).sort((a, b) => a.rang - b.rang).map((r) => r.item.n);
          if (attendu.length) nonVides++;
          requetes++;
          expect(index.chercher(z).map((t) => t.n), `graine ${graine}, mutation ${m}, zone ${JSON.stringify(z)}`).toEqual(attendu);
        }
      }
    }
    expect(requetes).toBe(6 * 600 * 6);
    // Le test porte : une bonne part des requêtes rend des éléments.
    expect(nonVides).toBeGreaterThan(requetes / 3);
  });

  it("contrat : doublon refusé, élément absent signalé, côté de cellule non fini refusé", () => {
    const index = indexIncremental<Item>(1);
    const a = { n: 1 };
    index.inserer(a, { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } });
    expect(() => index.inserer(a, { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } })).toThrow(/déjà présent/);
    expect(() => index.mettreAJour({ n: 2 }, { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } })).toThrow(/absent/);
    expect(() => indexIncremental<Item>(0)).toThrow(RangeError);
    expect(() => indexIncremental<Item>(Number.NaN)).toThrow(RangeError);
    expect(index.contient(a)).toBe(true);
    expect(index.rangDe(a)).toBe(0);
  });

  it("suivi : même suite → rien n'est refait ; suite à doublon → null (l'appelant garde l'index non incrémental)", () => {
    const suivi = suiviIncremental<Item>(() => ({ min: { x: 0, y: 0 }, max: { x: 1, y: 1 } }));
    const items = [{ n: 1 }, { n: 2 }];
    const i1 = suivi.suivre(items);
    expect(suivi.dernierBilan).toEqual({ inseres: 2, supprimes: 0, conserves: 0 });
    expect(suivi.suivre(items)).toBe(i1);
    const i2 = suivi.suivre([items[1]!, { n: 3 }]);
    expect(i2).toBe(i1);
    expect(suivi.dernierBilan).toEqual({ inseres: 1, supprimes: 1, conserves: 1 });
    expect(suivi.suivre([items[0]!, items[0]!])).toBeNull();
  });
});

/** Document aléatoire sur une trame entière (bords exacts fréquents), calques masqués et verrouillés compris. */
function documentAleatoire(rnd: () => number, n: number): StudioDocument {
  const layers: StudioLayer[] = [
    { id: "visible", name: "Visible", visible: true, locked: false },
    { id: "masque", name: "Masqué", visible: false, locked: false },
    { id: "verrou", name: "Verrouillé", visible: true, locked: true },
  ];
  return { id: "doc", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: Array.from({ length: n }, (_, i) => forme(rnd, `e${i}`)), layers, dimensions: [], annotations: [] };
}

function forme(rnd: () => number, id: string): StudioShape {
  const pt = () => ({ x: Math.round(rnd() * 60), y: Math.round(rnd() * 60) });
  const c = pt(), k = Math.floor(rnd() * 5), r = rnd();
  const calque = r < 0.1 ? { layerId: "masque" } : r < 0.2 ? { layerId: "verrou" } : r < 0.5 ? { layerId: "visible" } : {};
  if (k === 0) return { id, type: "line", ...calque, start: c, end: pt() };
  if (k === 1) return { id, type: "rectangle", ...calque, origin: c, width: 1 + Math.round(rnd() * 5), height: 1 + Math.round(rnd() * 5) };
  if (k === 2) return { id, type: "circle", ...calque, center: c, radius: 0.5 + Math.round(rnd() * 4) };
  if (k === 3) return { id, type: "arc", ...calque, center: c, radius: 1 + Math.round(rnd() * 3), startAngle: rnd() * 6, endAngle: rnd() * 6 };
  return { id, type: "polyline", ...calque, closed: rnd() < 0.5, points: [c, { x: c.x + 2, y: c.y }, { x: c.x + 2, y: c.y + 3 }], bulges: [0, rnd() - 0.5, 0] };
}

/** Révision suivante : objets ajoutés (au milieu compris), retirés, modifiés (nouvel objet) ; calques parfois basculés. */
function reviser(rnd: () => number, doc: StudioDocument, numero: number): StudioDocument {
  const objects = [...doc.objects];
  const mutations = 1 + Math.floor(rnd() * 12);
  for (let m = 0; m < mutations; m++) {
    const k = rnd(), i = Math.floor(rnd() * objects.length);
    if (k < 0.35) objects.splice(Math.floor(rnd() * (objects.length + 1)), 0, forme(rnd, `r${numero}-${m}`));
    else if (k < 0.6) objects.splice(i, 1);
    else {
      const o = objects[i]!;
      objects[i] = o.type === "line" ? { ...o, end: { x: o.end.x + 1, y: o.end.y - 2 } } : { ...forme(rnd, o.id), ...(o.layerId ? { layerId: o.layerId } : {}) };
    }
  }
  const layers = rnd() < 0.15 ? (doc.layers ?? []).map((l) => (l.id === "masque" ? { ...l, visible: !l.visible } : l.id === "verrou" ? { ...l, locked: !l.locked } : l)) : doc.layers;
  return { ...doc, objects, ...(layers ? { layers } : {}) };
}

describe("C.1-05 — révisions successives du document : l'incrémental branché rend le parcours linéaire", () => {
  it("sélection par rectangle (fenêtre et capture) sur 60 révisions : mêmes identifiants, index synchronisé sans reconstruction", () => {
    const rnd = alea(77);
    let doc = documentAleatoire(rnd, 1500);
    let conserves = 0, nonVides = 0;
    for (let rev = 0; rev < 60; rev++) {
      for (let q = 0; q < 12; q++) {
        const a = { x: Math.round(rnd() * 70) - 5, y: Math.round(rnd() * 70) - 5 };
        const b = { x: Math.round(rnd() * 70) - 5, y: Math.round(rnd() * 70) - 5 };
        const attendu = selectionParRectangleLineaire(doc, a, b);
        if (attendu.length) nonVides++;
        expect(selectionParRectangle(doc, a, b, 0), `révision ${rev} ${JSON.stringify([a, b])}`).toEqual(attendu);
      }
      const bilan = bilanIndexSelection();
      if (rev > 0) {
        // Révision suivante : la plupart des éléments sont gardés tels quels (aucune reconstruction).
        expect(bilan!.conserves).toBeGreaterThan(doc.objects.length - 30);
        expect(bilan!.inseres).toBeLessThan(30);
        conserves += bilan!.conserves;
      }
      doc = reviser(rnd, doc, rev);
    }
    expect(conserves).toBeGreaterThan(59 * 1400);
    expect(nonVides).toBeGreaterThan(300);
  });

  it("candidats d'accrochage sur 60 révisions : mêmes candidats que l'index linéaire, formes changées seules réindexées", () => {
    const reglages: ReglagesAccrochage = { objets: true, modes: new Set(MODES_ACCROCHAGE), orthogonal: false, polaire: false, pasPolaire: 45 };
    const rnd = alea(91);
    let doc = documentAleatoire(rnd, 1300);
    const suivi = suiviAccrochage(0);
    let nonVides = 0;
    for (let rev = 0; rev < 60; rev++) {
      const lin = indexLineaire(doc.objects), idx = suivi.indexer(doc.objects);
      expect(idx.taille).toBe(lin.taille);
      if (rev > 0) expect(suivi.dernierBilan!.inseres).toBeLessThan(30);
      for (let q = 0; q < 10; q++) {
        const curseur = { x: Math.round(rnd() * 120) / 2, y: Math.round(rnd() * 120) / 2 };
        const requete = {
          curseur, tolerance: [0.1, 0.5, 2][q % 3]!, base: q % 2 ? { x: curseur.x - 1, y: curseur.y + 2 } : null,
          vue: q % 4 === 0 ? undefined : { min: { x: curseur.x - 8, y: curseur.y - 5 }, max: { x: curseur.x + 8, y: curseur.y + 5 } },
        };
        const attendu = candidatsObjets(lin, requete, reglages);
        if (attendu.length) nonVides++;
        expect(candidatsObjets(idx, requete, reglages), `révision ${rev}`).toEqual(attendu);
        const zone = { min: { x: curseur.x - 3, y: curseur.y - 3 }, max: { x: curseur.x + 3, y: curseur.y + 3 } };
        expect(idx.formes(zone)).toEqual(lin.formes(zone));
      }
      doc = reviser(rnd, doc, rev);
    }
    expect(nonVides).toBeGreaterThan(150);
  });
});
