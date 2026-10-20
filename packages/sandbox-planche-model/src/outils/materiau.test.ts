import { describe, expect, it } from "vitest";
import {
  ajouterRectangle,
  contexte,
  deplacer,
  copier,
  estSolide,
  grouper,
  modeleVide,
  modifierAnnotations,
  pousserTirer,
  volume,
  type Modele,
} from "../geometrie-libre.js";
import { contoursDuGlyphe, geometrieDuTexte, glypheDe } from "../police-geometrique.js";
import { v3 } from "../vecteur.js";
import { machineBalise } from "./balise.js";
import { clicVers, partie, survolVers, touche } from "./essais-modification.js";
import type { ContexteOutil } from "./machine.js";
import { machineEchantillon, machinePeinture } from "./peinture.js";
import { configurerTexte3D, facesDuTexte3D, machineTexte3D } from "./texte-3d.js";
import { creerMachineSolide, opererSolides } from "./solides.js";
import { maillageDuSolide } from "../maillage.js";

const DEPUIS = v3(0, 0, 1);
const sol = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
const boite = (m0: Modele = sol()) => {
  const f = Object.keys(m0.racine.faces)[0] as string;
  return pousserTirer(m0, f, 2).modele;
};
const avecMateriau = (m: Modele, nom: string, couleur: string) => modifierAnnotations(m, (a, id) => { const k = id("m"); a.materiaux[k] = { id: k, nom, couleur }; return k; });
const faceAvant = (m: Modele) => Object.values(m.racine.faces).find((f) => f.normale.y < -0.9)!.id; // y = 0
const materiaux = (m: Modele) => Object.values(m.racine.faces).map((f) => f.materiauRecto);

describe("Peinture — CA-PEI", () => {
  it("CA-PEI-1 : clic sur une face → seule cette face change ; CA-PEI-6 : un pas par clic", () => {
    const b = boite();
    const r = avecMateriau(b, "Brun", "#8b5a2b");
    const p = partie(machinePeinture, r.modele);
    const ctx = (): ContexteOutil => ({ ...p.ctx(), materiauCourant: r.extra });
    const t = machinePeinture.traiter(p.etat, clicVers(v3(2, 0, 1), v3(0, -1, 0)), ctx());
    expect(t.modele).toBeDefined();
    expect(t.operation).toBe("Peindre");
    const faces = Object.values(t.modele!.racine.faces);
    expect(faces.filter((f) => f.materiauRecto === r.extra)).toHaveLength(1);
    expect(faces.find((f) => f.materiauRecto === r.extra)!.id).toBe(faceAvant(b));
  });
  it("CA-PEI-2 : Ctrl + clic sur le dessus d'une boîte dont l'avant est brun → 5 faces peintes, l'avant inchangé", () => {
    const b = boite();
    const brun = avecMateriau(b, "Brun", "#8b5a2b");
    const gris = avecMateriau(brun.modele, "Gris", "#888888");
    const m1 = machinePeinture.traiter(machinePeinture.initial(), clicVers(v3(2, 0, 1), v3(0, -1, 0)), { modele: gris.modele, selection: [], separateurDecimal: ".", materiauCourant: brun.extra }).modele!;
    const e = machinePeinture.traiter(machinePeinture.initial(), touche("Ctrl"), { modele: m1, selection: [], separateurDecimal: "." }).etat;
    const t = machinePeinture.traiter(e, clicVers(v3(2, 1.5, 2), DEPUIS), { modele: m1, selection: [], separateurDecimal: ".", materiauCourant: gris.extra });
    const faces = Object.values(t.modele!.racine.faces);
    expect(faces.filter((f) => f.materiauRecto === gris.extra)).toHaveLength(5);
    expect(t.modele!.racine.faces[faceAvant(b)]!.materiauRecto).toBe(brun.extra);
  });
  it("CA-PEI-3 : Maj + clic → toutes les faces de la matière visée, même non connectées ; CA-PEI-4 : Maj + Ctrl → le même objet seulement", () => {
    const b = boite();
    const loin = ajouterRectangle(b, v3(10, 0, 0), v3(12, 0, 0), v3(0, 2, 0)).modele;
    const rouge = avecMateriau(loin, "Rouge", "#ff0000");
    const base: ContexteOutil = { modele: rouge.modele, selection: [], separateurDecimal: ".", materiauCourant: rouge.extra };
    const e = machinePeinture.traiter(machinePeinture.initial(), touche("Maj"), base).etat;
    const t = machinePeinture.traiter(e, clicVers(v3(2, 1.5, 2), DEPUIS), base); // dessus (matière par défaut)
    expect(materiaux(t.modele!).every((x) => x === rouge.extra)).toBe(true); // 6 + 1 faces par défaut → rouges
    const e2 = machinePeinture.traiter(machinePeinture.traiter(machinePeinture.initial(), touche("Maj"), base).etat, touche("Ctrl"), base).etat;
    const vert = avecMateriau(rouge.modele, "Vert", "#00ff00");
    const t2 = machinePeinture.traiter(e2, clicVers(v3(2, 1.5, 2), DEPUIS), { ...base, modele: vert.modele, materiauCourant: vert.extra });
    const faces = Object.values(t2.modele!.racine.faces);
    expect(faces.filter((f) => f.materiauRecto === vert.extra)).toHaveLength(6);
    expect(faces.filter((f) => f.materiauRecto === undefined)).toHaveLength(1); // le rectangle lointain
  });
  it("CA-PEI-5 : groupe peint en vert de l'extérieur → matière sur l'occurrence, aucune face ne reçoit d'attribut ; une face rouge garde la sienne", () => {
    const b = boite();
    const rouge = avecMateriau(b, "Rouge", "#ff0000");
    const m1 = machinePeinture.traiter(machinePeinture.initial(), clicVers(v3(2, 0, 1), v3(0, -1, 0)), { modele: rouge.modele, selection: [], separateurDecimal: ".", materiauCourant: rouge.extra }).modele!;
    const g = grouper(m1, [...Object.keys(m1.racine.faces), ...Object.keys(m1.racine.aretes)]);
    const vert = avecMateriau(g.modele, "Vert", "#00ff00");
    const t = machinePeinture.traiter(machinePeinture.initial(), clicVers(v3(2, 1.5, 2), DEPUIS), { modele: vert.modele, selection: [], separateurDecimal: ".", materiauCourant: vert.extra });
    expect(t.modele!.racine.occurrences[g.occurrence]!.materiau).toBe(vert.extra);
    const faces = Object.values(contexte(t.modele!, g.occurrence).faces);
    expect(faces.filter((f) => f.materiauRecto === vert.extra)).toHaveLength(0);
    expect(faces.filter((f) => f.materiauRecto === rouge.extra)).toHaveLength(1);
  });
  it("Alt + clic prélève la matière (l'outil reste) ; CA-PRE-1 : Prélever bascule vers la Peinture", () => {
    const b = boite();
    const rouge = avecMateriau(b, "Rouge", "#ff0000");
    const base: ContexteOutil = { modele: rouge.modele, selection: [], separateurDecimal: ".", materiauCourant: rouge.extra };
    const m1 = machinePeinture.traiter(machinePeinture.initial(), clicVers(v3(2, 0, 1), v3(0, -1, 0)), base).modele!;
    const e = machinePeinture.traiter(machinePeinture.initial(), touche("Alt"), base).etat;
    const { materiauCourant: _mc, ...sansMateriau } = base;
    const t = machinePeinture.traiter(e, clicVers(v3(2, 0, 1), v3(0, -1, 0)), { ...sansMateriau, modele: m1 });
    expect(t.materiauCourant).toBe(rouge.extra);
    expect(t.modele).toBeUndefined();
    const s = machineEchantillon.traiter(machineEchantillon.initial(), clicVers(v3(2, 0, 1), v3(0, -1, 0)), { modele: m1, selection: [], separateurDecimal: "." });
    expect(s.materiauCourant).toBe(rouge.extra);
    expect(s.outil).toBe("peinture");
    const d = machineEchantillon.traiter(machineEchantillon.initial(), clicVers(v3(2, 1.5, 2), DEPUIS), { modele: m1, selection: [], separateurDecimal: "." });
    expect(d.materiauCourant).toBeNull(); // dessus : matière par défaut
  });
});

describe("Balise — CA-BAL", () => {
  it("CA-BAL-1 : balise choisie, clic sur un groupe → le groupe porte la balise ; Ctrl = toutes les occurrences du composant ; Alt prélève", () => {
    const b = boite();
    const g = grouper(b, [...Object.keys(b.racine.faces), ...Object.keys(b.racine.aretes)], { genre: "composant", nom: "C" });
    const c = copier(g.modele, [g.occurrence], v3(10, 0, 0)).modele;
    const bal = modifierAnnotations(c, (a, id) => { const k = id("b"); a.balises[k] = { id: k, nom: "Murs", couleur: "#123456", visible: true }; return k; });
    const base: ContexteOutil = { modele: bal.modele, selection: [], separateurDecimal: ".", baliseCourante: bal.extra };
    const { baliseCourante: _bc, ...sansBalise } = base;
    const sans = machineBalise.traiter(machineBalise.initial(), clicVers(v3(2, 1.5, 2), DEPUIS), sansBalise);
    expect(sans.modele).toBeUndefined();
    expect(sans.etat.erreur).toMatch(/Choisissez/);
    const t = machineBalise.traiter(machineBalise.initial(), clicVers(v3(2, 1.5, 2), DEPUIS), base);
    const occs = Object.values(t.modele!.racine.occurrences);
    expect(occs.filter((o) => o.balise === bal.extra)).toHaveLength(1);
    const e = machineBalise.traiter(machineBalise.initial(), touche("Ctrl"), base).etat;
    const t2 = machineBalise.traiter(e, clicVers(v3(2, 1.5, 2), DEPUIS), base);
    expect(Object.values(t2.modele!.racine.occurrences).filter((o) => o.balise === bal.extra)).toHaveLength(2);
    const alt = machineBalise.traiter(machineBalise.traiter(machineBalise.initial(), touche("Alt"), base).etat, clicVers(v3(2, 1.5, 2), DEPUIS), { ...sansBalise, modele: t.modele! });
    expect(alt.baliseCourante).toBe(bal.extra);
  });
});

describe("Police géométrique et Texte 3D — CA-T3D", () => {
  it("les glyphes connus ont un contour ; « O » a un trou ; « I » un seul polygone ; minuscules et accents ramenés", () => {
    expect(glypheDe("é")).toEqual(glypheDe("E"));
    const o = contoursDuGlyphe(glypheDe("O")!);
    expect(o).toHaveLength(1);
    expect(o[0]).toHaveLength(2);
    const i = contoursDuGlyphe(glypheDe("I")!);
    expect(i).toHaveLength(1);
    expect(i[0]).toHaveLength(1);
    expect(i[0]![0]!.length).toBeGreaterThanOrEqual(8);
    const g = geometrieDuTexte("Fadi", 0.3);
    expect(g.polygones.length).toBeGreaterThanOrEqual(4);
    expect(g.ignores).toEqual([]);
    expect(g.largeur).toBeCloseTo((4 * 5 + 3) * (0.3 / 7), 9);
  });
  it("CA-T3D-1 : OK refusé avec un texte vide ; CA-T3D-2 : « Fadi » 0,30 / 0,15 → un composant solide de 0,15 m de haut, posé au clic, sélectionné, outil Déplacer", () => {
    const e0 = machineTexte3D.initial();
    expect(configurerTexte3D(e0, { texte: "  ", hauteur: 0.3, plein: true, extrusion: 0.15 }).erreur).toMatch(/vide/);
    const e1 = configurerTexte3D(e0, { texte: "Fadi", hauteur: 0.3, plein: true, extrusion: 0.15 });
    expect(e1.boite).toBe(false);
    const p = partie(machineTexte3D, sol());
    p.etat = e1;
    p.jouer(survolVers(v3(0, 5, 0)), clicVers(v3(0, 5, 0)));
    expect(p.operations).toEqual(["Texte 3D"]);
    expect(p.outilDemande).toBe("deplacer");
    const occ = p.selection[0]!;
    expect(occ.startsWith("o")).toBe(true);
    const def = p.modele.definitions[p.modele.racine.occurrences[occ]!.definition]!;
    expect(def.genre).toBe("composant");
    expect(def.nom).toBe("Texte 3D « Fadi »");
    const zs = Object.values(def.contenu.sommets).map((s) => s.position.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.15, 9);
    expect(Math.min(...Object.values(def.contenu.sommets).map((s) => s.position.y))).toBeCloseTo(5, 9);
  });
  it("un texte extrudé est un solide (chaque arête borde deux faces) : « I » et « O »", () => {
    for (const texte of ["I", "O", "A8"]) {
      const { faces } = facesDuTexte3D({ texte, hauteur: 0.3, plein: true, extrusion: 0.1 }, v3(0, 0, 0));
      const m = sol();
      const e1 = configurerTexte3D(machineTexte3D.initial(), { texte, hauteur: 0.3, plein: true, extrusion: 0.1 });
      const p = partie(machineTexte3D, m);
      p.etat = e1;
      p.jouer(survolVers(v3(0, 5, 0)), clicVers(v3(0, 5, 0)));
      expect(faces.length).toBeGreaterThan(2);
      expect(estSolide(p.modele, p.selection[0]!)).toBe(true);
      expect(maillageDuSolide(p.modele, p.selection[0]!).triangles.length).toBeGreaterThan(0);
    }
  });
});

describe("Solides — CA-COQ / CA-BOO (flux des machines avec un moteur de substitution)", () => {
  const boiteGroupe = (m: Modele, dx: number) => {
    const b = boite(ajouterRectangle(m, v3(dx, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele);
    // Ne grouper que la boîte qui vient d'être créée : faces dont tous les sommets ont x ≥ dx.
    const faces = Object.values(b.racine.faces).filter((f) => f.exterieur.every((s) => b.racine.sommets[s]!.position.x >= dx - 1e-9 && b.racine.sommets[s]!.position.x <= dx + 2 + 1e-9)).map((f) => f.id);
    const aretes = Object.values(b.racine.aretes).filter((a) => [a.a, a.b].every((s) => b.racine.sommets[s]!.position.x >= dx - 1e-9 && b.racine.sommets[s]!.position.x <= dx + 2 + 1e-9)).map((a) => a.id);
    return grouper(b, [...faces, ...aretes]);
  };
  const boiteMesh = (x0: number, x1: number, y1: number, z1: number) => {
    const P = [v3(x0, 0, 0), v3(x1, 0, 0), v3(x1, y1, 0), v3(x0, y1, 0), v3(x0, 0, z1), v3(x1, 0, z1), v3(x1, y1, z1), v3(x0, y1, z1)];
    const positions = P.flatMap((p) => [p.x, p.y, p.z]);
    const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    const triangles = quads.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!]);
    return { positions, triangles, facesParTriangle: quads.flatMap((_, i) => [i, i]) };
  };
  // Moteur de substitution : deux boîtes 2 × 2 × 2 chevauchées de 1 m sur x (A : 0..2, B : 1..3).
  const moteur = {
    union: () => boiteMesh(0, 3, 2, 2),
    difference: (a: { positions: readonly number[] }) => (a.positions[0] === 0 ? boiteMesh(0, 1, 2, 2) : boiteMesh(2, 3, 2, 2)),
    intersection: () => boiteMesh(1, 2, 2, 2),
  };
  it("CA-COQ-1 : coque de deux boîtes chevauchées → un seul groupe solide, volume 12 (8 + 8 − 4), les deux solides d'origine disparaissent", () => {
    const g1 = boiteGroupe(modeleVide(), 0);
    const g2 = boiteGroupe(g1.modele, 1);
    expect(volume(g2.modele, g1.occurrence)).toBeCloseTo(8, 9);
    const m = creerMachineSolide("enveloppe-exterieure");
    const ctx: ContexteOutil = { modele: g2.modele, selection: [], separateurDecimal: ".", booleens: moteur };
    const t1 = m.traiter(m.initial(), clicVers(v3(0.5, 1, 2), DEPUIS), ctx);
    expect(t1.etat.premier).toBe(g1.occurrence);
    const t2 = m.traiter(t1.etat, clicVers(v3(2.5, 1, 2), DEPUIS), ctx);
    expect(t2.etat.erreur).toBeNull();
    expect(t2.operation).toBe("Coque extérieure");
    const occs = Object.keys(t2.modele!.racine.occurrences);
    expect(occs).toHaveLength(1);
    expect(estSolide(t2.modele!, occs[0]!)).toBe(true);
    expect(volume(t2.modele!, occs[0]!)).toBeCloseTo(12, 9);
    expect(t2.selection).toEqual(occs);
    expect(t2.modele!.definitions[t2.modele!.racine.occurrences[occs[0]!]!.definition]!.nom).toBe("Coque extérieure");
  });
  it("CA-COQ-2 : une géométrie libre non fermée → refus nommé, rien n'est modifié ; sans moteur : message", () => {
    const m0 = sol();
    const g = grouper(m0, [...Object.keys(m0.racine.faces), ...Object.keys(m0.racine.aretes)]);
    const m = creerMachineSolide("union");
    const t = m.traiter(m.initial(), clicVers(v3(2, 1.5, 0), DEPUIS), { modele: g.modele, selection: [], separateurDecimal: ".", booleens: moteur });
    expect(t.modele).toBeUndefined();
    expect(t.etat.erreur).toMatch(/pas un solide/);
    expect(m.vue(m.initial(), { modele: g.modele, selection: [], separateurDecimal: "." }).erreur).toMatch(/booléen/);
  });
  it("CA-BOO-2/3/5 : Soustraction (A supprimé, B creusé), Découpe (A conservé), Scission (3 groupes)", () => {
    const g1 = boiteGroupe(modeleVide(), 0);
    const g2 = boiteGroupe(g1.modele, 1);
    const ctx: ContexteOutil = { modele: g2.modele, selection: [], separateurDecimal: ".", booleens: moteur };
    const sous = opererSolides(ctx, "soustraction", g1.occurrence, g2.occurrence);
    expect(Object.keys(sous.modele.racine.occurrences)).toHaveLength(1);
    expect(volume(sous.modele, sous.crees[0]!)).toBeCloseTo(4, 9);
    const trim = opererSolides(ctx, "ajuster", g1.occurrence, g2.occurrence);
    expect(Object.keys(trim.modele.racine.occurrences).sort()).toEqual([g1.occurrence, trim.crees[0]!].sort());
    const split = opererSolides(ctx, "scinder", g1.occurrence, g2.occurrence);
    expect(split.crees).toHaveLength(3);
    expect(split.crees.reduce((s, id) => s + (volume(split.modele, id) ?? 0), 0)).toBeCloseTo(12, 9);
  });
});

export { deplacer as _d };
