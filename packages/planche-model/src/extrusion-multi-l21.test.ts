/** Lot L21 (hors V1, D-202) : extrusion de plusieurs faces en une opération ; épaississement d'une surface ouverte. */
import { describe, expect, it } from "vitest";
import { codeDe } from "./diagnostics.js";
import { type Id, type Modele, ERREUR_EPAISSIR_SOMMET, ajouterRectangle, contexte, epaissir, estSolide, grouper, modeleVide, pousserTirerFaces, tuberFace, volume } from "./geometrie-libre.js";
import { v3 } from "./vecteur.js";

const tout = (m: Modele): Id[] => [...Object.keys(contexte(m).faces), ...Object.keys(contexte(m).aretes)];
const solideEtVolume = (m: Modele) => {
  const g = grouper(m, tout(m));
  return { solide: estSolide(g.modele, g.occurrence), volume: volume(g.modele, g.occurrence) };
};

describe("L21 — extrusion multi-faces", () => {
  it("deux rectangles distincts poussés de 1 m en une opération : deux boîtes, chacune suivant sa normale", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    m = ajouterRectangle(m, v3(3, 0, 0), v3(2, 0, 0), v3(0, 1, 0)).modele;
    const faces = Object.keys(m.racine.faces) as Id[];
    const r = pousserTirerFaces(m, faces, 1).modele;
    expect(Object.keys(contexte(r).faces)).toHaveLength(12);
    const zs = Object.values(contexte(r).sommets).map((s) => Math.abs(s.position.z));
    expect(Math.max(...zs)).toBeCloseTo(1, 9);
  });

  it("aucune face : refus codé EX_SOURCE_INVALID", () => {
    try {
      pousserTirerFaces(modeleVide(), [], 1);
      expect.unreachable();
    } catch (e) {
      expect(codeDe(e)).toBe("EX_SOURCE_INVALID");
    }
  });
});

describe("L21 — épaissir une surface", () => {
  it("une face 1 × 1 épaissie de 0,2 : volume fermé de 0,2 m³", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const r = epaissir(m, Object.keys(m.racine.faces) as Id[], 0.2).modele;
    const s = solideEtVolume(r);
    expect(s.solide).toBe(true);
    expect(s.volume).toBeCloseTo(0.2, 9);
  });

  it("surface ouverte (tube carré sans fond, 1 × 1 × 1) épaissie de 0,1 : coque fermée, coins en onglet, 0,44 m³", () => {
    const base = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const f = Object.keys(base.racine.faces)[0] as Id;
    const tube = tuberFace(base, f, base.racine.faces[f]!.normale.z > 0 ? 1 : -1).modele;
    const parois = Object.keys(contexte(tube).faces) as Id[];
    expect(parois).toHaveLength(4);
    // Les normales des parois regardent dehors ou dedans selon le sens du contour : l'épaisseur suit les normales.
    const dehors = contexte(tube).faces[parois[0] as Id]!;
    const c0 = contexte(tube).sommets[dehors.exterieur[0] as Id]!.position;
    const versDehors = (c0.x - 0.5) * dehors.normale.x + (c0.y - 0.5) * dehors.normale.y > 0;
    const r = epaissir(tube, parois, versDehors ? 0.1 : -0.1).modele;
    const s = solideEtVolume(r);
    expect(s.solide).toBe(true);
    expect(s.volume).toBeCloseTo(1.2 * 1.2 - 1, 9);
  });

  it("refus : deux faces opposées en un sommet — l'épaisseur n'y est pas tenable", () => {
    // Deux faces confondues de normales opposées : un sommet partagé reçoit deux normales opposées.
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const f = Object.keys(m.racine.faces)[0] as Id;
    const F = m.racine.faces[f]!;
    const m2: Modele = { ...m, racine: { ...m.racine, faces: { ...m.racine.faces, fX: { ...F, id: "fX", exterieur: [...F.exterieur].reverse(), normale: v3(-F.normale.x, -F.normale.y, -F.normale.z) } } } };
    expect(() => epaissir(m2, [f, "fX"], 0.1)).toThrow();
    try {
      epaissir(m2, [f, "fX"], 0.1);
    } catch (e) {
      expect([ERREUR_EPAISSIR_SOMMET, "Épaissir : une arête est partagée par plus de deux des faces choisies (surface non variété)."]).toContain((e as Error).message);
    }
  });
});

describe("L21 — outils", () => {
  it("Pousser/Tirer : clic sur une face d'une présélection de deux faces, « 1 » → les deux poussées, un seul pas", async () => {
    const { machinePousserTirer } = await import("./outils/pousser-tirer.js");
    const { partie, clicVers, saisie } = await import("./outils/essais-modification.js");
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    m = ajouterRectangle(m, v3(3, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const faces = Object.keys(m.racine.faces) as Id[];
    const p = partie(machinePousserTirer, m, faces).jouer(clicVers(v3(0.5, 0.5, 0)), saisie("1"));
    expect(p.operations).toEqual(["Pousser/Tirer"]);
    expect(Object.keys(contexte(p.modele).faces)).toHaveLength(12);
    // Correction tapée juste après : les deux faces, toujours un seul pas.
    p.jouer(saisie("2"));
    expect(p.historique).toHaveLength(2);
    expect(Math.max(...Object.values(contexte(p.modele).sommets).map((s) => Math.abs(s.position.z)))).toBeCloseTo(2, 9);
  });

  it("Épaissir : clic sur la face, « 0,2 » → volume fermé de 0,2 m³, un pas « Épaissir »", async () => {
    const { machineEpaissir } = await import("./outils/epaissir.js");
    const { partie, clicVers, saisie } = await import("./outils/essais-modification.js");
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const p = partie(machineEpaissir, m, [], ",").jouer(clicVers(v3(0.5, 0.5, 0)), saisie("0,2"));
    expect(p.operations).toEqual(["Épaissir"]);
    const s = solideEtVolume(p.modele);
    expect(s.solide).toBe(true);
    expect(s.volume).toBeCloseTo(0.2, 9);
  });
});
