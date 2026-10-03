import { describe, expect, it } from "vitest";
import type { ObjetModele } from "../ontologie/classes.js";
import { allerRetour, cmd, deg, m, ok, P, projetDeBase, refus } from "./__tests__/aides.js";

const t = { niveauId: "rdc", calqueId: "C1" };
const base = ok(
  projetDeBase(),
  cmd("esquisse.ligne", { id: "L1", ...t, a: P(0, 1), b: P(2, 1) }),
  cmd("esquisse.ligne", { id: "LIM", ...t, a: P(3, -1), b: P(3, 3) }),
  cmd("esquisse.rectangle", { id: "R1", ...t, origine: P(10, 0), largeur: m(4), profondeur: m(3), angle: deg(0) }),
  cmd("esquisse.polyligne", { id: "PL", ...t, points: [P(0, 10), P(4, 10), P(4, 14)], ferme: false }),
  cmd("esquisse.arc", { id: "A1", ...t, centre: P(20, 0), rayon: m(2), angleDebut: deg(0), angleFin: deg(90), sens: "trigo" }),
  cmd("poteau.creer", { id: "PO", ...t, point: P(5, 5), formeId: "basic-square", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3), angle: deg(10) }),
).etat;
const o = (e: { objets: Readonly<Record<string, ObjetModele>> }, id: string) => e.objets[id] as ObjetModele;

describe("transformations : application puis inverse = état initial", () => {
  it("déplacer un mur avec sa porte (la porte suit, t inchangé)", () => {
    const r = allerRetour(base, cmd("transformer.deplacer", { vecteur: { dx: 0.1, dy: 0.2, unit: "m" } }, ["M1", "P1", "L1"]));
    const mur = o(r.etat, "M1");
    expect(mur.classe === "mur" && mur.params.axe.a).toEqual(P(0.1, 0.2));
    expect(mur).toMatchObject({ provenance: "saisie" });
    expect(r.etat.objets.P1).toEqual(base.objets.P1);
  });

  it("copier : nouveaux objets, la porte copiée suit la copie du mur", () => {
    const r = allerRetour(base, cmd("transformer.copier", { vecteur: { dx: 0, dy: 10, unit: "m" }, nouveauxIds: ["M1c", "P1c"] }, ["M1", "P1"]));
    const p = o(r.etat, "P1c");
    expect(p.classe === "porte" && p.params.murHoteId).toBe("M1c");
    expect(r.etat.relations).toContainEqual({ type: "heberge-par", sourceId: "P1c", cibleId: "M1c", derivee: true });
  });

  it("tourner de 90° : angles des objets ajoutés, positions tournées", () => {
    const r = allerRetour(base, cmd("transformer.tourner", { centre: P(5, 5), angle: deg(90) }, ["PO", "R1", "A1"]));
    const po = o(r.etat, "PO");
    expect(po.classe === "poteau" && po.params.angle.value).toBe(100);
    const a = o(r.etat, "A1");
    expect(a.classe === "esquisse.arc" && a.params.centre.x).toBeCloseTo(10, 9);
  });

  it("miroir en place (alignement et sens d'arc inversés) et avec copie", () => {
    const e = ok(base, cmd("mur.modifier", { modifications: { alignement: "gauche" } }, ["M1"])).etat;
    const r = allerRetour(e, cmd("transformer.miroir", { axe: { a: P(0, -5), b: P(1, -5) }, conserverOriginal: false }, ["M1", "A1", "R1"]));
    const mur = o(r.etat, "M1");
    expect(mur.classe === "mur" && mur.params.alignement).toBe("droite");
    const a = o(r.etat, "A1");
    expect(a.classe === "esquisse.arc" && a.params.sens).toBe("horaire");
    const rect = o(r.etat, "R1");
    expect(rect.classe === "esquisse.rectangle" && rect.params.origine).toEqual(P(10, -13));
    allerRetour(e, cmd("transformer.miroir", { axe: { a: P(0, -5), b: P(1, -5) }, conserverOriginal: true, nouveauxIds: ["L1m"] }, ["L1"]));
  });

  it("échelle : épaisseur et largeur de porte inchangées (D-014), taille d'esquisse mise à l'échelle", () => {
    const r = allerRetour(base, cmd("transformer.echelle", { centre: P(0, 0), facteur: 1.5 }, ["M1", "R1"]));
    const mur = o(r.etat, "M1");
    expect(mur.classe === "mur" && [mur.params.axe.b.x, mur.params.epaisseur.value]).toEqual([9, 0.2]);
    expect(r.etat.objets.P1).toEqual(base.objets.P1);
    const rect = o(r.etat, "R1");
    expect(rect.classe === "esquisse.rectangle" && rect.params.largeur.value).toBe(6);
    expect(refus(base, cmd("transformer.echelle", { centre: P(0, 0), facteur: -1 }, ["R1"]))[0]?.message).toMatch(/miroir/);
  });

  it("étirer : seuls les sommets capturés bougent ; la porte garde sa position dans le plan", () => {
    const fenetre = [P(5, -1), P(7, -1), P(7, 1), P(5, 1)];
    const r = allerRetour(base, cmd("transformer.etirer", { fenetre, vecteur: { dx: 2, dy: 0, unit: "m" } }, ["M1", "P1"]));
    const mur = o(r.etat, "M1");
    expect(mur.classe === "mur" && mur.params.axe).toEqual({ a: P(0, 0), b: P(8, 0) });
    const p = o(r.etat, "P1");
    expect(p.classe === "porte" && p.params.position.t).toBeCloseTo(1.5 / 8, 12);
    expect(refus(base, cmd("transformer.etirer", { fenetre: [P(50, 50), P(51, 50), P(51, 51)], vecteur: { dx: 1, dy: 0, unit: "m" } }, ["L1"]))[0]?.message).toMatch(/aucun sommet/);
  });

  it("ajuster et prolonger jusqu'à une limite", () => {
    const p = allerRetour(base, cmd("transformer.prolonger", { limiteIds: ["LIM"], pointChoix: P(1.9, 1) }, ["L1"]));
    const l = o(p.etat, "L1");
    expect(l.classe === "esquisse.ligne" && l.params.b).toEqual(P(3, 1));
    const e = ok(base, cmd("esquisse.ligne", { id: "L2", ...t, a: P(0, 2), b: P(5, 2) })).etat;
    const a = allerRetour(e, cmd("transformer.ajuster", { limiteIds: ["LIM"], pointChoix: P(4.5, 2) }, ["L2"]));
    const l2 = o(a.etat, "L2");
    expect(l2.classe === "esquisse.ligne" && l2.params.b).toEqual(P(3, 2));
    expect(refus(base, cmd("transformer.prolonger", { limiteIds: ["LIM"], pointChoix: P(0.1, 1) }, ["L1"]))[0]?.message).toMatch(/aucune limite/);
  });

  it("décaler : ligne, cercle effondré refusé, polyligne", () => {
    const r = allerRetour(base, cmd("transformer.decaler", { distance: m(0.5), cote: P(1, 2), nouveauxIds: ["L1d"] }, ["L1"]));
    const l = o(r.etat, "L1d");
    expect(l.classe === "esquisse.ligne" && l.params.a).toEqual(P(0, 1.5));
    const pl = allerRetour(base, cmd("transformer.decaler", { distance: m(1), cote: P(3, 11), nouveauxIds: ["PLd"] }, ["PL"]));
    const q = o(pl.etat, "PLd");
    expect(q.classe === "esquisse.polyligne" && q.params.points).toEqual([P(0, 11), P(3, 11), P(3, 14)]);
    expect(refus(base, cmd("transformer.decaler", { distance: m(3), cote: P(20.5, 0.5), nouveauxIds: ["Ad"] }, ["A1"]))[0]?.message).toMatch(/s'effondre/);
  });

  it("répéter : nombre × sélection, plafond copiesMax", () => {
    const r = allerRetour(base, cmd("transformer.repeter", { nombre: 3, vecteur: { dx: 0, dy: 1, unit: "m" }, nouveauxIds: ["r1", "r2", "r3"].map((x) => `L1-${x}`) }, ["L1"]));
    expect(r.effets.objetsCrees).toHaveLength(3);
    expect(refus(base, cmd("transformer.repeter", { nombre: 501, vecteur: { dx: 0, dy: 1, unit: "m" }, nouveauxIds: [] }, ["L1"]))[0]?.message).toMatch(/maximum 500/);
  });

  it("décomposer un rectangle et une polyligne en lignes", () => {
    const r = allerRetour(base, cmd("transformer.decomposer", { nouveauxIds: ["d1", "d2", "d3", "d4", "d5", "d6"] }, ["R1", "PL"]));
    const l = o(r.etat, "d2");
    expect(l.classe === "esquisse.ligne" && l.params).toEqual({ a: P(14, 0), b: P(14, 3) });
    expect(refus(base, cmd("transformer.decomposer", { nouveauxIds: ["x"] }, ["R1"]))[0]?.message).toMatch(/4 attendu/);
  });

  it("points de contrôle : sommet de dalle, extrémité de mur", () => {
    allerRetour(base, cmd("transformer.pointsDeControle", { deplacements: [{ indice: 2, point: P(7, 5) }] }, ["D1"]));
    allerRetour(base, cmd("transformer.pointsDeControle", { deplacements: [{ indice: 1, point: P(5, 0) }] }, ["M1"]));
    expect(refus(base, cmd("transformer.pointsDeControle", { deplacements: [{ indice: 9, point: P(7, 5) }] }, ["D1"]))[0]?.message).toMatch(/indice/);
  });

  it("refus communs : baie seule, classe exclue, vecteur nul, rotation sans effet, calque verrouillé", () => {
    expect(refus(base, cmd("transformer.deplacer", { vecteur: { dx: 1, dy: 0, unit: "m" } }, ["P1"]))[0]?.message).toMatch(/baie seule/);
    expect(refus(base, cmd("transformer.deplacer", { vecteur: { dx: 1, dy: 0, unit: "m" } }, ["rdc"]))[0]?.code).toBe("precondition");
    expect(refus(base, cmd("transformer.deplacer", { vecteur: { dx: 0, dy: 0, unit: "m" } }, ["L1"]))[0]?.message).toMatch(/nul/);
    expect(refus(base, cmd("transformer.tourner", { centre: P(0, 0), angle: deg(360) }, ["L1"]))[0]?.message).toMatch(/sans effet/);
    expect(refus(base, cmd("transformer.deplacer", { vecteur: { dx: 1, dy: 0, unit: "m" } }, ["L1", "MV"]))[0]?.code).toBe("calque-verrouille");
  });
});
