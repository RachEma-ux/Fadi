import { describe, expect, it } from "vitest";
import { type Id, aire, ajouterRectangle, ajouterSegment, contexte, modeleVide, positionsFace } from "../geometrie-libre.js";
import { dot, normalize, sub, v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { clicVers, faces, partie } from "./essais-modification.js";
import { machineSuivezMoi } from "./suivez-moi.js";

function scenario() {
  let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
  const sol = Object.keys(m.racine.faces)[0] as Id;
  m = ajouterRectangle(m, v3(0, 0, 0), v3(0, 0.4, 0), v3(0, 0, 0.6)).modele;
  const profil = Object.values(m.racine.faces).find((f) => Math.abs(f.normale.x) > 0.99) as { id: Id };
  return { m, sol, profil: profil.id };
}

describe("Suivez-moi (§4.20)", () => {
  it("consigne du catalogue ; champ Mesures inactif", () => {
    const { m, sol } = scenario();
    const p = partie(machineSuivezMoi, m, [sol]);
    expect(p.vue().consigne).toBe(etape("suivez-moi", 0).consigne);
    expect(p.vue().mesures).toBeNull();
  });

  it("CA-SUI-1 : face 4 × 3 présélectionnée, profil 0,4 × 0,6 vertical à un coin → muret fermé de 4 tronçons à onglet, planes, étanche", () => {
    const { m, sol } = scenario();
    const p = partie(machineSuivezMoi, m, [sol]).jouer(clicVers(v3(0, 0.2, 0.3), v3(-1, 0, 0)));
    expect(p.operations).toEqual(["Suivez-moi"]);
    const c = contexte(p.modele);
    const toutes = Object.values(c.faces);
    const interieur = toutes.filter((f) => Math.abs(aire(p.modele, f.id) - 3.2 * 2.2) < 1e-9);
    expect(interieur).toHaveLength(1);
    const muret = toutes.filter((f) => f.id !== (interieur[0] as { id: Id }).id);
    expect(muret).toHaveLength(16);
    for (const f of toutes) {
      const P = positionsFace(c, f).exterieur;
      for (const q of P) expect(Math.abs(dot(normalize(f.normale), sub(q, P[0] as ReturnType<typeof v3>)))).toBeLessThan(1e-9);
    }
    const nb = new Map<string, number>();
    for (const f of muret) for (let i = 0; i < f.exterieur.length; i++) {
      const k = [f.exterieur[i], f.exterieur[(i + 1) % f.exterieur.length]].sort().join("|");
      nb.set(k, (nb.get(k) ?? 0) + 1);
    }
    for (const n of nb.values()) expect(n).toBe(2); // surface fermée
    expect(p.selection).toEqual([]);
    expect(p.vue().consigne).toBe(etape("suivez-moi", 0).consigne); // outil gardé
  });

  it("chemin en arêtes continues (L) : extrusion ouverte avec capuchons, étanche", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0)).modele;
    m = ajouterSegment(m, v3(3, 0, 0), v3(3, 2, 0)).modele;
    const aretes = Object.keys(m.racine.aretes);
    m = ajouterRectangle(m, v3(0, -0.1, 0), v3(0, 0.2, 0), v3(0, 0, 0.3)).modele;
    const profil = Object.values(m.racine.faces).find((f) => Math.abs(f.normale.x) > 0.99) as { id: Id };
    const p = partie(machineSuivezMoi, m, aretes).jouer(clicVers(v3(0, 0, 0.15), v3(-1, 0, 0)));
    expect(p.vue().erreur).toBeNull();
    expect(p.operations).toEqual(["Suivez-moi"]);
    // 2 tronçons × 4 côtés + 2 capuchons, et l'arête du chemin (au milieu du dessous) divise chaque dessous en deux.
    expect(faces(p.modele).length).toBe(2 * 4 + 2 + 2);
    expect(p.modele.racine.faces[profil.id]).toBeUndefined();
  });

  it("sans présélection ou profil invalide : messages, rien d'appliqué", () => {
    const { m, sol } = scenario();
    const a = partie(machineSuivezMoi, m).jouer(clicVers(v3(0, 0.2, 0.3), v3(-1, 0, 0)));
    expect(a.vue().erreur).toMatch(/Présélectionnez/);
    const b = partie(machineSuivezMoi, m, [sol]).jouer(clicVers(v3(2, 1.5, 0)));
    expect(b.vue().erreur).toMatch(/autre face/);
    const c = partie(machineSuivezMoi, m, [sol]).jouer(clicVers(v3(50, 50, 50)));
    expect(c.vue().erreur).toMatch(/profil/);
    expect(c.historique).toHaveLength(1);
  });
});
