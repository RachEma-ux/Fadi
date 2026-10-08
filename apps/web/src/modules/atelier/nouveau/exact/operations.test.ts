import { describe, expect, it } from "vitest";
import { appliquerLot, CONTRAT_COMMANDES, modeleVide, type Occurrence } from "@parcours/atelier-model";
import { construireOperation, operandeDe } from "./operations";

const lot = (etat: ReturnType<typeof modeleVide>, commands: unknown[]) => appliquerLot(etat, { requestId: `r${Math.random()}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label: "t", commands: commands as never });
const P = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
const pt = (x: number, y: number) => ({ x, y, frame: "local", unit: "m" });
function modele() {
  return lot(modeleVide(), [
    { type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 2, hauteur: 3 } },
    { type: "esquisse.rectangle", params: { id: "rect", niveauId: "n1", points: [pt(1, 0), pt(2, 1)] } },
    { type: "esquisse.ligne", params: { id: "axe", niveauId: "n1", points: [pt(0, 0), pt(0, 1)] } },
    { type: "esquisse.polyligne", params: { id: "trajet", niveauId: "n1", points: [pt(0, 0), pt(3, 0), pt(3, 3)], ferme: false } },
    { type: "mur.tracer", params: { id: "mur", niveauId: "n1", a: pt(0, 5), b: pt(4, 5), epaisseur: { value: 0.2, unit: "m" }, hauteur: { value: 3, unit: "m" } } },
    { type: "solideExact.creer", params: { id: "se", niveauId: "n1", brep: "QlJFUA==", moteur: "occt-wasm", versionMoteur: "5.6.1", empreinteBrep: "0123456789abcdef", maillage: { positions: P, indices: I }, volume: 1, aire: 6, faces: 6, position: pt(2, 5), angle: { value: 30, unit: "deg" }, operation: { type: "extrusion", sources: [], libelle: "x" } } },
  ]).etat;
}

describe("outil Solide exact — construction des opérations (P2-1)", () => {
  it("révolution : profil fermé + ligne d'esquisse, angle des paramètres, z0 = 0", () => {
    const r = construireOperation(modele(), "revolution", ["rect", "axe"], { angleRevolution: 90 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.operation.entrees).toMatchObject({ type: "revolution", angleDeg: 90, axe: { a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }, z0: 0 });
    expect(r.operation.sources).toEqual(["rect", "axe"]);
    expect(r.operation.niveauId).toBe("n1");
  });

  it("révolution sans axe : message qui dit ce qui manque", () => {
    const r = construireOperation(modele(), "revolution", ["rect"], {});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/axe/);
  });

  it("balayage : profil placé perpendiculairement au premier segment, trajet à la hauteur donnée", () => {
    const r = construireOperation(modele(), "balayage", ["rect", "trajet"], { hauteurExacte: 1.5 });
    expect(r.ok).toBe(true);
    if (!r.ok || r.operation.entrees.type !== "balayage") return;
    expect(r.operation.entrees.trajet.map((p) => p.z)).toEqual([1.5, 1.5, 1.5]);
    // Premier segment le long de +x : le profil s'étend selon y (normale) et z.
    const xs = r.operation.entrees.profil.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0, 9);
  });

  it("lissage : deux esquisses fermées et une hauteur > 0", () => {
    expect(construireOperation(modele(), "lissage", ["rect", "rect"], { hauteurExacte: 0 }).ok).toBe(false);
    const etat = lot(modele(), [{ type: "esquisse.rectangle", params: { id: "rect2", niveauId: "n1", points: [pt(1.2, 0.2), pt(1.8, 0.8)] } }]).etat;
    const r = construireOperation(etat, "lissage", ["rect", "rect2"], { hauteurExacte: 2, lissageRegle: true });
    expect(r.ok).toBe(true);
    if (!r.ok || r.operation.entrees.type !== "lissage") return;
    expect(r.operation.entrees.profils[1]!.every((p) => p.z === 2)).toBe(true);
    expect(r.operation.entrees.regle).toBe(true);
  });

  it("booléen : un solide exact posé et un mur extrudé (z relatif au niveau), même niveau exigé", () => {
    const etat = modele();
    const r = construireOperation(etat, "booleen", ["se", "mur"], { booleenExact: "soustraction" });
    expect(r.ok).toBe(true);
    if (!r.ok || r.operation.entrees.type !== "booleen") return;
    expect(r.operation.entrees.a).toEqual({ brep: "QlJFUA==", pose: { x: 2, y: 5, angleDeg: 30 } });
    const b = r.operation.entrees.b;
    expect("extrusion" in b && b.extrusion.hauteur).toBe(3);
    expect("extrusion" in b && b.extrusion.z0).toBe(0);
    expect("extrusion" in b && b.extrusion.profil.length).toBe(4);
    expect(construireOperation(etat, "booleen", ["se"], {}).ok).toBe(false);
  });

  it("opérande d'un mur sans hauteur : null ; d'une esquisse : null", () => {
    const etat = modele();
    const mur = etat.objets["mur"] as Occurrence<"mur">;
    expect(operandeDe(etat, { ...mur, params: { ...mur.params, hauteur: null } })).toBeNull();
    expect(operandeDe(etat, etat.objets["rect"]!)).toBeNull();
  });

  it("trou et coque sur un solide exact : centre par défaut au centre de l'emprise, en haut du maillage ; refus sans valeur", () => {
    const etat = modele();
    expect(construireOperation(etat, "trou", ["se"], {}).ok).toBe(false);
    const r = construireOperation(etat, "trou", ["se"], { diametreExacte: 0.1, profondeurExacte: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok || r.operation.entrees.type !== "trou") return;
    expect(r.operation.entrees.centre.z).toBe(1);
    expect(r.operation.entrees.profondeur).toBeNull();
    const c = construireOperation(etat, "coque", ["se"], { epaisseurExacte: 0.02, ouvrirDessusExacte: true });
    expect(c.ok && c.operation.entrees.type === "coque" && c.operation.entrees.ouvrirDessus).toBe(true);
    expect(construireOperation(etat, "coque", ["mur"], { epaisseurExacte: 0.02 }).ok).toBe(false);
  });
});
