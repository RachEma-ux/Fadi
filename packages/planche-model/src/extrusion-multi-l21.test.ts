/** Lot L21 (hors V1, D-202) : extrusion de plusieurs faces en une opération ; épaississement d'une surface ouverte. */
import { describe, expect, it } from "vitest";
import { codeDe } from "./diagnostics.js";
import {
  type Id,
  type Matrice4,
  type Modele,
  ERREUR_EPAISSIR_SENS,
  ERREUR_EPAISSIR_SOMMET,
  ERREUR_VALEURS_PAR_FACE,
  ajouterRectangle,
  contexte,
  epaissir,
  estSolide,
  grouper,
  modeleVide,
  pousserTirerFaces,
  tuberFace,
  volume,
} from "./geometrie-libre.js";
import { pointsDe } from "./outils/commun-modif.js";
import type { ContexteOutil, EvenementOutil, MachineOutil } from "./outils/machine.js";
import { type Vec3, v3 } from "./vecteur.js";

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

describe("L21 — revue de #134 : contexte transformé, correction tapée, matières", () => {
  const ctxDe = (modele: Modele, selection: readonly Id[], dans?: Id): ContexteOutil => ({ modele, selection, separateurDecimal: ",", ...(dans !== undefined ? { dans } : {}) });
  /** Joue des événements dans le contexte `dans`, avec une présélection. */
  function jouer<E>(machine: MachineOutil<E>, m: Modele, selection: readonly Id[], dans: Id | undefined, evs: readonly EvenementOutil[]): { modele: Modele; etat: E } {
    let etat = machine.initial();
    let modele = m;
    for (const ev of evs) {
      const t = machine.traiter(etat, ev, ctxDe(modele, selection, dans));
      etat = t.etat;
      if (t.modele) modele = t.modele;
    }
    return { modele, etat };
  }
  const X2: Matrice4 = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const DEUX: Matrice4 = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
  const transforme = (m: Modele, occ: Id, M: Matrice4): Modele => {
    const o = m.racine.occurrences[occ]!;
    return { ...m, racine: { ...m.racine, occurrences: { ...m.racine.occurrences, [occ]: { ...o, transformation: M } } } };
  };
  /** Groupe à l'échelle (2 ; 1 ; 1) : face A dans le plan x = 0 (y ∈ [2 ; 3]), face B dans le plan y = 0 (x local ∈ [2 ; 3], monde [4 ; 6]). */
  function deuxFaces() {
    let m = ajouterRectangle(modeleVide(), v3(0, 2, 0), v3(0, 1, 0), v3(0, 0, 1)).modele;
    m = ajouterRectangle(m, v3(2, 0, 0), v3(1, 0, 0), v3(0, 0, 1)).modele;
    const g = grouper(m, tout(m));
    const modele = transforme(g.modele, g.occurrence, X2);
    const c = contexte(modele, g.occurrence);
    const A = Object.values(c.faces).find((f) => Math.abs(f.normale.x) > 0.9)!.id;
    const B = Object.values(c.faces).find((f) => Math.abs(f.normale.y) > 0.9)!.id;
    return { modele, occ: g.occurrence, A, B };
  }
  const etendue = (pts: readonly Vec3[], axe: "x" | "y" | "z") => Math.max(...pts.map((p) => p[axe])) - Math.min(...pts.map((p) => p[axe]));
  const partieA = (m: Modele, occ: Id) => pointsDe(m, [occ]).filter((p) => p.x < 3);
  const partieB = (m: Modele, occ: Id) => pointsDe(m, [occ]).filter((p) => p.x > 3);
  const clicA = async () => (await import("./outils/essais-modification.js")).clicVers(v3(0, 2.5, 0.5), v3(1, 0, 0));

  it("Pousser/Tirer multi-faces dans un groupe à l'échelle (2 ; 1 ; 1) : chaque face avance de la distance monde tapée, correction comprise", async () => {
    const { machinePousserTirer } = await import("./outils/pousser-tirer.js");
    const { saisie } = await import("./outils/essais-modification.js");
    const { modele: m, occ, A, B } = deuxFaces();
    const r = jouer(machinePousserTirer, m, [A, B], occ, [await clicA(), saisie("1")]);
    expect(r.etat.erreur).toBeNull();
    expect(etendue(partieA(r.modele, occ), "x")).toBeCloseTo(1, 9);
    expect(etendue(partieB(r.modele, occ), "y")).toBeCloseTo(1, 9);
    // Correction tapée : la normale monde de la face cliquée est gardée dans les paramètres.
    const c = jouer(machinePousserTirer, m, [A, B], occ, [await clicA(), saisie("1"), saisie("2")]);
    expect(c.etat.erreur).toBeNull();
    expect(etendue(partieA(c.modele, occ), "x")).toBeCloseTo(2, 9);
    expect(etendue(partieB(c.modele, occ), "y")).toBeCloseTo(2, 9);
  });

  it("Épaissir multi-faces dans un groupe à l'échelle (2 ; 1 ; 1) : même épaisseur monde pour chaque face, correction comprise", async () => {
    const { machineEpaissir } = await import("./outils/epaissir.js");
    const { saisie } = await import("./outils/essais-modification.js");
    const { modele: m, occ, A, B } = deuxFaces();
    const r = jouer(machineEpaissir, m, [A, B], occ, [await clicA(), saisie("0,2")]);
    expect(r.etat.erreur).toBeNull();
    expect(etendue(partieA(r.modele, occ), "x")).toBeCloseTo(0.2, 9);
    expect(etendue(partieB(r.modele, occ), "y")).toBeCloseTo(0.2, 9);
    const c = jouer(machineEpaissir, m, [A, B], occ, [await clicA(), saisie("0,2"), saisie("0,4")]);
    expect(c.etat.erreur).toBeNull();
    expect(etendue(partieA(c.modele, occ), "x")).toBeCloseTo(0.4, 9);
    expect(etendue(partieB(c.modele, occ), "y")).toBeCloseTo(0.4, 9);
  });

  it("Épaissir dans un groupe × 2 : « 0,2 » puis « 0,4 » donnent 0,2 puis 0,4 m monde (la correction prenait la valeur monde pour une valeur locale)", async () => {
    const { machineEpaissir } = await import("./outils/epaissir.js");
    const { clicVers, saisie } = await import("./outils/essais-modification.js");
    const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const g = grouper(sol, tout(sol));
    const m = transforme(g.modele, g.occurrence, DEUX);
    const une = jouer(machineEpaissir, m, [], g.occurrence, [clicVers(v3(1, 1, 0), v3(0, 0, 1)), saisie("0,2")]);
    expect(etendue(pointsDe(une.modele, [g.occurrence]), "z")).toBeCloseTo(0.2, 9);
    const deux = jouer(machineEpaissir, m, [], g.occurrence, [clicVers(v3(1, 1, 0), v3(0, 0, 1)), saisie("0,2"), saisie("0,4")]);
    expect(deux.etat.erreur).toBeNull();
    expect(etendue(pointsDe(deux.modele, [g.occurrence]), "z")).toBeCloseTo(0.4, 9);
  });

  it("Pousser/Tirer : « -1 » puis « 2 » garde le côté (2 m du même côté) ; « -2 » repasse de l'autre côté", async () => {
    const { machinePousserTirer } = await import("./outils/pousser-tirer.js");
    const { partie, clicVers, saisie } = await import("./outils/essais-modification.js");
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const p = partie(machinePousserTirer, m).jouer(clicVers(v3(0.5, 0.5, 0)), saisie("-1"));
    const zs = () => Object.values(contexte(p.modele).sommets).map((s) => s.position.z);
    const cote = () => Math.sign(Math.max(...zs()) + Math.min(...zs()));
    const hauteur = () => Math.max(...zs()) - Math.min(...zs());
    expect(hauteur()).toBeCloseTo(1, 9);
    const premier = cote();
    p.jouer(saisie("2"));
    expect(hauteur()).toBeCloseTo(2, 9);
    expect(cote()).toBe(premier);
    p.jouer(saisie("-2"));
    expect(hauteur()).toBeCloseTo(2, 9);
    expect(cote()).toBe(-premier);
    expect(p.historique).toHaveLength(2);
  });

  it("Épaissir : « 0,2 » puis « -0,3 » passe la coque de l'autre côté, dans le même pas", async () => {
    const { machineEpaissir } = await import("./outils/epaissir.js");
    const { partie, clicVers, saisie } = await import("./outils/essais-modification.js");
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const p = partie(machineEpaissir, m, [], ",").jouer(clicVers(v3(0.5, 0.5, 0)), saisie("0,2"));
    const zs = () => Object.values(contexte(p.modele).sommets).map((s) => s.position.z);
    const cote = () => Math.sign(Math.max(...zs()) + Math.min(...zs()));
    expect(Math.max(...zs()) - Math.min(...zs())).toBeCloseTo(0.2, 9);
    const premier = cote();
    p.jouer(saisie("-0,3"));
    expect(Math.max(...zs()) - Math.min(...zs())).toBeCloseTo(0.3, 9);
    expect(cote()).toBe(-premier);
    expect(p.historique).toHaveLength(2);
  });

  it("Épaissir : la nappe retournée échange recto et verso (comme Inverser les faces) ; rien n'est inventé", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const f = Object.keys(m0.racine.faces)[0] as Id;
    const F = m0.racine.faces[f]!;
    const m: Modele = { ...m0, racine: { ...m0.racine, faces: { [f]: { ...F, materiauRecto: "A", materiauVerso: "B" } } } };
    const nappes = (r: Modele) => Object.values(contexte(r).faces).filter((g) => Math.abs(g.normale.z) > 0.9);
    const plus = epaissir(m, [f], 0.2).modele;
    const origine = contexte(plus).faces[f]!;
    expect([origine.materiauRecto, origine.materiauVerso]).toEqual(["B", "A"]);
    const copiePlus = nappes(plus).find((g) => g.id !== f)!;
    expect([copiePlus.materiauRecto, copiePlus.materiauVerso]).toEqual(["A", "B"]);
    const moins = epaissir(m, [f], -0.2).modele;
    const origine2 = contexte(moins).faces[f]!;
    expect([origine2.materiauRecto, origine2.materiauVerso]).toEqual(["A", "B"]);
    const copieMoins = nappes(moins).find((g) => g.id !== f)!;
    expect([copieMoins.materiauRecto, copieMoins.materiauVerso]).toEqual(["B", "A"]);
    const m1: Modele = { ...m0, racine: { ...m0.racine, faces: { [f]: { ...F, materiauRecto: "A" } } } };
    const o1 = contexte(epaissir(m1, [f], 0.2).modele).faces[f]!;
    expect(o1.materiauRecto).toBeUndefined();
    expect(o1.materiauVerso).toBe("A");
  });

  it("épaissir : une épaisseur par face — tube carré dans un groupe à l'échelle (2 ; 1 ; 1), 0,1 m monde sur chaque paroi, coins en onglet", () => {
    const base = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const f = Object.keys(base.racine.faces)[0] as Id;
    const tube = tuberFace(base, f, base.racine.faces[f]!.normale.z > 0 ? 1 : -1).modele;
    const g = grouper(tube, tout(tube));
    const m = transforme(g.modele, g.occurrence, X2);
    const c = contexte(m, g.occurrence);
    const parois = Object.keys(c.faces) as Id[];
    expect(parois).toHaveLength(4);
    const dehors = c.faces[parois[0] as Id]!;
    const c0 = c.sommets[dehors.exterieur[0] as Id]!.position;
    const s = (c0.x - 0.5) * dehors.normale.x + (c0.y - 0.5) * dehors.normale.y > 0 ? 1 : -1;
    // 0,1 m monde : 0,05 local pour les parois de normale x (échelle × 2), 0,1 pour celles de normale y.
    const E = parois.map((id) => s * (Math.abs(c.faces[id]!.normale.x) > 0.5 ? 0.05 : 0.1));
    const r = epaissir(m, parois, E, { dans: g.occurrence }).modele;
    const pts = pointsDe(r, [g.occurrence]);
    expect(etendue(pts, "x")).toBeCloseTo(2.2, 9);
    expect(etendue(pts, "y")).toBeCloseTo(1.2, 9);
    expect(() => epaissir(m, parois, [0.1], { dans: g.occurrence })).toThrow(ERREUR_VALEURS_PAR_FACE);
    expect(() => epaissir(m, parois, [0.1, -0.1, 0.1, 0.1], { dans: g.occurrence })).toThrow(ERREUR_EPAISSIR_SENS);
    expect(() => pousserTirerFaces(m, parois, [1, 1], { dans: g.occurrence })).toThrow(ERREUR_VALEURS_PAR_FACE);
  });
});
