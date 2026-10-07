import { describe, expect, it } from "vitest";
import { ajouterSegment, contexte, modeleVide } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { appuiVers, clicVers, contientPoint, faces, glisserVers, partie, relacheVers, saisie, sommets, toutSelectionner, touche } from "./essais-modification.js";
import { machineRetourner } from "./retourner.js";

/** Triangle (0;0), (4;0), (0;3) au sol : asymétrique, bbox x ∈ [0;4], y ∈ [0;3], centre (2 ; 1,5 ; 0). */
function triangle() {
  let m = modeleVide();
  m = ajouterSegment(m, v3(0, 0, 0), v3(4, 0, 0)).modele;
  m = ajouterSegment(m, v3(4, 0, 0), v3(0, 3, 0)).modele;
  m = ajouterSegment(m, v3(0, 3, 0), v3(0, 0, 0)).modele;
  return m;
}
/** Rayon horizontal qui arrive sur le plan rouge (normale x) en (c.x ; y ; z). */
const VERS_ROUGE = v3(1, 0, 0);
const VERS_VERT = v3(0, 1, 0);

describe("Retourner (§4.21)", () => {
  it("consignes du catalogue : repos, copie, après glisser", () => {
    const m = triangle();
    const p = partie(machineRetourner, m, toutSelectionner(m));
    expect(p.vue().consigne).toBe(etape("retourner", 0).consigne);
    p.jouer(touche("Ctrl"));
    expect(p.vue().consigne).toBe(etape("retourner", 1).consigne);
    expect(p.vue().mesures?.libelle).toBe("Distance");
    // Trois plans (rouge, vert, bleu) dessinés.
    expect(p.vue().apercu.lignes).toHaveLength(3);
  });

  it("CA-RET-1 : objet asymétrique, clic sur le plan rouge → image par la symétrie x ↦ 2c − x", () => {
    const m = triangle();
    const p = partie(machineRetourner, m, toutSelectionner(m)).jouer(clicVers(v3(2, 1, 0.1), VERS_ROUGE));
    expect(p.operations).toEqual(["Retourner"]);
    const s = sommets(p.modele);
    expect(contientPoint(s, v3(4, 0, 0))).toBe(true); // (0;0;0) ↦ (4;0;0)
    expect(contientPoint(s, v3(0, 0, 0))).toBe(true); // (4;0;0) ↦ (0;0;0)
    expect(contientPoint(s, v3(4, 3, 0))).toBe(true); // (0;3;0) ↦ (4;3;0)
    expect(contientPoint(s, v3(0, 3, 0))).toBe(false);
  });

  it("CA-RET-2 : Ctrl, glisser le plan vert, 1 → original inchangé + copie miroir par un plan à 1 m ; un seul pas", () => {
    const m = triangle();
    const p = partie(machineRetourner, m, toutSelectionner(m));
    p.jouer(touche("Ctrl"), appuiVers(v3(1, 1.5, 0.1), VERS_VERT, { x: 10, y: 10 }), glisserVers(v3(1, 2.36 + 1.5, 0), VERS_ROUGE, { x: 20, y: 30 }), relacheVers(v3(1, 2.36 + 1.5, 0), VERS_ROUGE, { x: 20, y: 30 }));
    expect(p.operations).toEqual(["Retourner et copier"]);
    expect(p.vue().consigne).toBe(etape("retourner", 2).consigne);
    p.jouer(saisie("1"));
    expect(p.historique).toHaveLength(2);
    expect(p.operations).toEqual(["Retourner et copier (corrigé)"]);
    const s = sommets(p.modele);
    // Original inchangé.
    for (const q of [v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)]) expect(contientPoint(s, q)).toBe(true);
    // Plan miroir y = 1,5 + 1 = 2,5 : y ↦ 5 − y.
    for (const q of [v3(0, 5, 0), v3(4, 5, 0), v3(0, 2, 0)]) expect(contientPoint(s, q)).toBe(true);
    expect(Object.keys(contexte(p.modele).aretes).length).toBeGreaterThanOrEqual(6);
  });

  it("flèches : ← plan vert, → plan rouge, ↑ plan bleu (retournement immédiat)", () => {
    const m = triangle();
    const rouge = partie(machineRetourner, m, toutSelectionner(m)).jouer(touche("FlecheDroite"));
    expect(contientPoint(sommets(rouge.modele), v3(4, 3, 0))).toBe(true);
    const vert = partie(machineRetourner, m, toutSelectionner(m)).jouer(touche("FlecheGauche"));
    // Plan vert (y = 1,5) : y ↦ 3 − y, donc (4;0) ↦ (4;3) et (0;3) ↦ (0;0).
    expect(contientPoint(sommets(vert.modele), v3(4, 3, 0))).toBe(true);
    expect(contientPoint(sommets(vert.modele), v3(4, 0, 0))).toBe(false);
    const bleu = partie(machineRetourner, m, toutSelectionner(m)).jouer(touche("FlecheHaut"));
    expect(contientPoint(sommets(bleu.modele), v3(4, 0, 0))).toBe(true); // objet plat au sol : inchangé
  });

  it("Ctrl + clic simple : copie miroir en place ; sans sélection : le clic choisit l'objet", () => {
    const m = triangle();
    const a = partie(machineRetourner, m, toutSelectionner(m)).jouer(touche("Ctrl"), clicVers(v3(2, 1, 0.1), VERS_ROUGE));
    expect(a.operations).toEqual(["Retourner et copier"]);
    expect(Object.keys(contexte(a.modele).aretes).length).toBeGreaterThanOrEqual(5);
    const b = partie(machineRetourner, m).jouer(clicVers(v3(2, 1.5, 0)));
    expect(b.historique).toHaveLength(1);
  });

  it("saisie sans copie ou sans plan : message ; Échap annule le glisser", () => {
    const m = triangle();
    const a = partie(machineRetourner, m, toutSelectionner(m)).jouer(saisie("1"));
    expect(a.vue().erreur).toMatch(/plan/);
    const b = partie(machineRetourner, m, toutSelectionner(m)).jouer(appuiVers(v3(1, 1.5, 0.1), VERS_VERT, { x: 1, y: 1 }), saisie("1"));
    expect(b.vue().erreur).toMatch(/copie/);
    expect(b.historique).toHaveLength(1);
    expect(faces(b.modele)).toHaveLength(1); // le triangle n'a pas bougé
  });
});
