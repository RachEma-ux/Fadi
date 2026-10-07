import { describe, expect, it } from "vitest";
import { contexte } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { machinePivoter } from "./faire-pivoter.js";
import { boite, clicVers, contientPoint, emprise, partie, saisie, sommets, survolVers, toutSelectionner, touche } from "./essais-modification.js";

const O = v3(0, 0, 0);
const DEPUIS = v3(-1, -1, 4);

describe("Faire pivoter (§4.17)", () => {
  it("consignes du catalogue : sans sélection, avec sélection, départ, angle, copie", () => {
    const m = boite(1, 1, 1);
    expect(partie(machinePivoter, m).vue().consigne).toBe(etape("faire-pivoter", 0).consigne);
    const p = partie(machinePivoter, m, toutSelectionner(m));
    expect(p.vue().consigne).toBe(etape("faire-pivoter", 1).consigne);
    p.jouer(clicVers(O, DEPUIS));
    expect(p.vue().consigne).toBe(etape("faire-pivoter", 2).consigne);
    p.jouer(clicVers(v3(1, 0, 0), DEPUIS));
    expect(p.vue().consigne).toBe(etape("faire-pivoter", 3).consigne);
    p.jouer(touche("Ctrl"));
    expect(p.vue().consigne).toBe(etape("faire-pivoter", 4).consigne);
    expect(p.vue().mesures?.libelle).toBe("Angle");
  });

  it("CA-ROT-1 : boîte, centre (0;0;0), départ +x, 30 → rotation de 30° autour de z", () => {
    const m = boite(4, 3, 2.7);
    const p = partie(machinePivoter, m, toutSelectionner(m)).jouer(clicVers(O, DEPUIS), clicVers(v3(1, 0, 0), DEPUIS), saisie("30"));
    const a = (30 * Math.PI) / 180;
    // Le coin (4;3;0) devient (4cos − 3sin ; 4sin + 3cos ; 0), la hauteur est inchangée.
    expect(contientPoint(sommets(p.modele), v3(4 * Math.cos(a) - 3 * Math.sin(a), 4 * Math.sin(a) + 3 * Math.cos(a), 0), 1e-9)).toBe(true);
    expect(contientPoint(sommets(p.modele), v3(4 * Math.cos(a), 4 * Math.sin(a), 2.7), 1e-9)).toBe(true);
    expect(emprise(p.modele).max.z).toBeCloseTo(2.7, 9);
    expect(p.operations).toEqual(["Rotation"]);
  });

  it("CA-ROT-2 : « 1:2 » → atan(0,5) à 1e-12 rad", () => {
    const m = boite(4, 3, 2.7);
    const p = partie(machinePivoter, m, toutSelectionner(m)).jouer(clicVers(O, DEPUIS), clicVers(v3(1, 0, 0), DEPUIS), saisie("1:2"));
    const a = Math.atan(0.5);
    const coin = sommets(p.modele).find((q) => Math.abs(q.z) < 1e-12 && Math.abs(Math.hypot(q.x, q.y) - 4) < 1e-9);
    expect(coin).toBeDefined();
    expect(Math.abs(Math.atan2((coin as { y: number }).y, (coin as { x: number }).x) - a)).toBeLessThan(1e-12);
  });

  it("CA-ROT-3 : Ctrl, départ sur rouge, 60 puis x5 → 6 objets à 60°, un seul pas d'annulation", () => {
    const m = boite(1, 1, 1);
    const p = partie(machinePivoter, m, toutSelectionner(m)).jouer(touche("Ctrl"), clicVers(O, DEPUIS), clicVers(v3(1, 0, 0), DEPUIS), saisie("60"));
    expect(p.operations).toEqual(["Rotation et copie"]);
    p.jouer(saisie("x5"));
    expect(p.historique).toHaveLength(2);
    expect(p.operations).toEqual(["Rotation et copie (corrigé)"]);
    // 6 objets : le coin (1;0;0) est répété aux 6 multiples de 60°.
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      expect(contientPoint(sommets(p.modele), v3(Math.cos(a), Math.sin(a), 0), 1e-9)).toBe(true);
    }
    // Les boîtes de 1 m tournées de 60° autour d'un coin se chevauchent : la géométrie collante les découpe, le décompte
    // de faces n'est donc pas 6 × 6. On vérifie les arêtes du dessus (z = 1) de chacune des six positions.
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      expect(contientPoint(sommets(p.modele), v3(Math.cos(a), Math.sin(a), 1), 1e-9)).toBe(true);
    }
    expect(Object.keys(contexte(p.modele).faces).length).toBeGreaterThanOrEqual(36);
  });

  it("CA-ROT-4 : ← avant le clic → axe de rotation = y", () => {
    const m = boite(1, 1, 1);
    const p = partie(machinePivoter, m, toutSelectionner(m)).jouer(touche("FlecheGauche"), clicVers(O, v3(-1, 4, -1)), clicVers(v3(1, 0, 0), v3(-1, 4, -1)), saisie("90"));
    // Rotation de +90° autour de y : (x;z) → (z;−x), la boîte [0;1]³ passe à x ∈ [0;1], z ∈ [−1;0], y inchangé.
    const e = emprise(p.modele);
    expect([e.min.x, e.max.x, e.min.y, e.max.y, e.min.z, e.max.z].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 1, 0, 1, -1, 0]);
    expect(contientPoint(sommets(p.modele), v3(1, 0, -1), 1e-9)).toBe(true);
    // Un 2ᵉ appui libère le verrou.
    const q = partie(machinePivoter, m, toutSelectionner(m)).jouer(touche("FlecheGauche"), touche("FlecheGauche"), clicVers(O, DEPUIS), clicVers(v3(1, 0, 0), DEPUIS), saisie("90"));
    expect(emprise(q.modele).max.z).toBeCloseTo(1, 9);
  });

  it("correction après coup : un angle tapé à l'étape 1 remplace la dernière rotation", () => {
    const m = boite(1, 1, 1);
    const p = partie(machinePivoter, m, toutSelectionner(m)).jouer(clicVers(O, DEPUIS), clicVers(v3(1, 0, 0), DEPUIS), saisie("30"), saisie("45"));
    expect(p.historique).toHaveLength(2);
    const a = Math.PI / 4;
    expect(contientPoint(sommets(p.modele), v3(Math.cos(a), Math.sin(a), 0), 1e-9)).toBe(true);
  });

  it("curseur : angle accroché aux multiples de 15° (affiché sans « ~ »), sinon approché", () => {
    const m = boite(1, 1, 1);
    const p = partie(machinePivoter, m, toutSelectionner(m)).jouer(clicVers(O, DEPUIS), clicVers(v3(1, 0, 0), DEPUIS));
    p.jouer(survolVers(v3(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0), DEPUIS));
    expect(p.vue().mesures?.valeur).toBe("30.0");
    p.jouer(survolVers(v3(Math.cos(0.4), Math.sin(0.4), 0), DEPUIS));
    expect(p.vue().mesures?.valeur.startsWith("~")).toBe(true);
  });

  it("sans sélection, le clic choisit l'objet ; angle nul et saisie prématurée : messages", () => {
    const m = boite(1, 1, 1);
    const p = partie(machinePivoter, m).jouer(clicVers(v3(0.5, 0.5, 1)));
    expect(p.selection.length).toBeGreaterThan(0);
    const q = partie(machinePivoter, m, toutSelectionner(m)).jouer(saisie("30"));
    expect(q.vue().erreur).toMatch(/Placez d'abord/);
    const r = partie(machinePivoter, m, toutSelectionner(m)).jouer(clicVers(O, DEPUIS), clicVers(O, DEPUIS));
    expect(r.vue().erreur).toMatch(/distinct/);
  });
});
