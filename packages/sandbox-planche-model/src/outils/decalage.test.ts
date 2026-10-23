import { describe, expect, it } from "vitest";
import { aire, ajouterRectangle, ajouterSegment, contexte, modeleVide } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { distanceAuContour, machineDecalage } from "./decalage.js";
import { TOLERANCE, aireTotale, aretes, clicVers, contientPoint, faces, partie, saisie, sommets, survolVers } from "./essais-modification.js";

const sol = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
const aires = (m: ReturnType<typeof sol>) => faces(m).map((f) => aire(m, f.id)).sort((a, b) => a - b);

describe("Décalage (§4.19)", () => {
  it("distance signée au contour : intérieur positif, extérieur négatif", () => {
    const c = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)];
    expect(distanceAuContour(c, v3(0, 0, 1), v3(2, 1.5, 0))).toBeCloseTo(1.5, 9);
    expect(distanceAuContour(c, v3(0, 0, 1), v3(5, 1, 0))).toBeCloseTo(-1, 9);
  });

  it("consignes et Mesures du catalogue", () => {
    const p = partie(machineDecalage, sol());
    expect(p.vue().consigne).toBe(etape("decalage", 0).consigne);
    expect(p.vue().mesures?.libelle).toBe("Distance");
    p.jouer(clicVers(v3(1, 1, 0)));
    expect(p.vue().consigne).toBe(etape("decalage", 2).consigne);
  });

  it("aperçu vivant : le contour décalé réel est tracé pendant le choix de la distance (face et arêtes)", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), survolVers(v3(0.5, 1.5, 0)));
    const boucle = p.vue().apercu.lignes.find((l) => l.length === 5);
    expect(boucle).toBeDefined();
    const xs = (boucle ?? []).map((q) => q.x);
    expect(Math.min(...xs)).toBeCloseTo(0.5, 6);
    expect(Math.max(...xs)).toBeCloseTo(3.5, 6);
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    m = ajouterSegment(m, v3(4, 0, 0), v3(4, 3, 0)).modele;
    const q = partie(machineDecalage, m, Object.keys(contexte(m).aretes)).jouer(clicVers(v3(2, 1, 0)), survolVers(v3(2, 0.5, 0)));
    expect(q.vue().apercu.lignes.length).toBeGreaterThanOrEqual(3);
  });

  it("CA-DEC-1 : face 4 × 3, 0,3 vers l'intérieur → 2 faces : 3,4 × 2,4 et l'anneau (12 − 8,16)", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), survolVers(v3(1, 1, 0)), saisie("0.3"));
    expect(faces(p.modele)).toHaveLength(2);
    const a = aires(p.modele);
    expect(a[0]).toBeCloseTo(12 - 3.4 * 2.4, 9); // l'anneau (3,84 m²)
    expect(a[1]).toBeCloseTo(3.4 * 2.4, 9); // la face intérieure (8,16 m²)
    expect(aireTotale(p.modele)).toBeCloseTo(12, 9);
    expect(p.operations).toEqual(["Décalage"]);
  });

  it("CA-DEC-2 : double-clic sur la face intérieure → second anneau de 0,3", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("0.3"));
    p.jouer(clicVers(v3(2, 1.5, 0), undefined, true));
    expect(faces(p.modele)).toHaveLength(3);
    const a = aires(p.modele);
    expect(a[0]).toBeCloseTo(3.4 * 2.4 - 2.8 * 1.8, 9); // second anneau (3,12 m²)
    expect(a[1]).toBeCloseTo(12 - 3.4 * 2.4, 9); // premier anneau (3,84 m²)
    expect(a[2]).toBeCloseTo(2.8 * 1.8, 9); // face intérieure (5,04 m²)
  });

  it("curseur à l'extérieur : le décalage tapé va vers l'extérieur", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), survolVers(v3(5, 1.5, 0)), saisie("0.5"));
    expect(aireTotale(p.modele)).toBeCloseTo(5 * 4, 9);
  });

  it("CA-DEC-3 : deux arêtes en L présélectionnées, 0,5 → 2 arêtes nouvelles, 0 face nouvelle", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    m = ajouterSegment(m, v3(4, 0, 0), v3(4, 3, 0)).modele;
    const ids = Object.keys(contexte(m).aretes);
    const p = partie(machineDecalage, m, ids);
    expect(p.vue().consigne).toBe(etape("decalage", 1).consigne);
    p.jouer(clicVers(v3(2, 1, 0)), saisie("0.5"));
    expect(aretes(p.modele)).toHaveLength(4);
    expect(faces(p.modele)).toHaveLength(0);
  });

  it("correction : une distance tapée après coup remplace le décalage (un pas)", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("0.3"), saisie("0.5"));
    expect(p.historique).toHaveLength(2);
    expect(aires(p.modele)).toContainEqual(expect.closeTo(3 * 2, 9));
  });

  it("distance nulle ou saisie sans face : messages ; Échap retourne à l'étape 1", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("0"));
    expect(p.historique).toHaveLength(1);
    expect(p.vue().erreur).toMatch(/nulle/);
    const q = partie(machineDecalage, sol()).jouer(saisie("0.3"));
    expect(q.vue().erreur).toMatch(/Choisissez/);
    const r = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), { genre: "echap" });
    expect(r.vue().consigne).toBe(etape("decalage", 0).consigne);
  });

  it("décalage trop grand : refusé sans rien casser", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("5"));
    expect(p.historique.length).toBeLessThanOrEqual(2);
    expect(Object.keys(contexte(p.modele).faces).length).toBeGreaterThan(0);
  });
});

describe("Décalage — arête seule : le côté du curseur est respecté", () => {
  const bas = (m: ReturnType<typeof sol>) => aretes(m).find((a) => m.racine.sommets[a.a]!.position.y === 0 && m.racine.sommets[a.b]!.position.y === 0)!.id;
  const ys = (m: ReturnType<typeof sol>) => Object.values(m.racine.sommets).map((s) => Math.round(s.position.y * 1e6) / 1e6);
  it("arête basse présélectionnée, point de mesure à l'extérieur (2;-1), « 1 » → arête à y = -1, aucune face nouvelle", () => {
    const m = sol();
    const p = partie(machineDecalage, m, [bas(m)]).jouer(survolVers(v3(2, -1, 0)), clicVers(v3(2, -1, 0)), saisie("1"));
    expect(ys(p.modele)).toContain(-1);
    expect(faces(p.modele)).toHaveLength(1);
  });
  it("arête basse présélectionnée, point de mesure à l'intérieur (2;1), « 1 » → arête à y = 1 (la face est divisée)", () => {
    const m = sol();
    const p = partie(machineDecalage, m, [bas(m)]).jouer(clicVers(v3(2, 1, 0)), saisie("1"));
    expect(ys(p.modele)).toContain(1);
    expect(faces(p.modele)).toHaveLength(2);
  });
  it("arête cliquée sans présélection, puis curseur à l'extérieur et clic → arête du côté du curseur, distance du curseur", () => {
    const m = sol();
    const p = partie(machineDecalage, m).jouer(survolVers(v3(2, 0, 0)), clicVers(v3(2, 0, 0)), survolVers(v3(2, -0.7, 0)));
    expect(p.vue().mesures?.valeur).toMatch(/0[.,]70/);
    p.jouer(clicVers(v3(2, -0.7, 0)));
    expect(ys(p.modele)).toContain(-0.7);
    expect(faces(p.modele)).toHaveLength(1);
  });

  describe("inférences : la distance s'accroche à la géométrie existante", () => {
    const avecRepere = () => ajouterSegment(sol(), v3(1, 0.7, 0), v3(3, 0.7, 0)).modele;

    it("curseur près d'une arête du plan : distance exacte jusqu'à elle, inférence « sur l'arête »", () => {
      const p = partie(machineDecalage, avecRepere()).jouer(clicVers(v3(1, 2, 0)), survolVers(v3(1.5, 0.7 + TOLERANCE / 2, 0)));
      expect(p.etat.distance).toBeCloseTo(0.7, 9);
      const inf = p.vue().inference;
      expect(inf?.type).toBe("sur-arete");
      expect(inf?.libelle.en).toBe("On Edge");
    });

    it("sur une extrémité : « Endpoint », distance jusqu'à l'extrémité", () => {
      const p = partie(machineDecalage, avecRepere()).jouer(clicVers(v3(1, 2, 0)), survolVers(v3(1, 0.7, 0)));
      expect(p.vue().inference?.type).toBe("extremite");
      expect(p.etat.distance).toBeCloseTo(0.7, 9);
    });

    it("loin de toute géométrie : pas d'inférence, la distance suit le curseur", () => {
      const p = partie(machineDecalage, avecRepere()).jouer(clicVers(v3(1, 2, 0)), survolVers(v3(2, 1.2, 0)));
      expect(p.vue().inference).toBeNull();
      expect(p.etat.distance).toBeCloseTo(1.2, 9);
    });

    it("les arêtes décalées elles-mêmes ne sont jamais accrochées (distance nulle)", () => {
      const p = partie(machineDecalage, avecRepere()).jouer(clicVers(v3(1, 2, 0)), survolVers(v3(2, TOLERANCE / 2, 0)));
      expect(p.vue().inference).toBeNull();
    });

    it("le clic applique la distance accrochée", () => {
      const p = partie(machineDecalage, avecRepere()).jouer(clicVers(v3(1, 2, 0)), clicVers(v3(1.5, 0.7 + TOLERANCE / 2, 0)));
      expect(p.operations).toEqual(["Décalage"]);
      expect(aires(p.modele).length).toBeGreaterThan(1);
    });
  });

  describe("décaler une droite par rapport à une autre ligne (plan libre)", () => {
    const monde = () => {
      let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
      m = ajouterSegment(m, v3(2, 3, 4), v3(3, 3, 4)).modele;
      return { m, depart: Object.keys(contexte(m).aretes)[0] as string };
    };

    it("le curseur s'accroche à l'extrémité d'une ligne hors du plan de visée : distance = écart à la droite", () => {
      const { m, depart } = monde();
      const p = partie(machineDecalage, m, [depart]).jouer(clicVers(v3(2, 1, 0)), survolVers(v3(2, 3 + 0.004, 4)));
      expect(p.vue().inference?.type).toBe("extremite");
      expect(p.etat.distance).toBeCloseTo(5, 9);
    });

    it("le clic crée la droite décalée de cette distance, dans le plan arête + point accroché", () => {
      const { m, depart } = monde();
      const p = partie(machineDecalage, m, [depart]).jouer(clicVers(v3(2, 1, 0)), clicVers(v3(2, 3 + 0.004, 4)));
      expect(p.operations).toEqual(["Décalage"]);
      const s = sommets(p.modele);
      expect(contientPoint(s, v3(0, 3, 4))).toBe(true);
      expect(contientPoint(s, v3(4, 3, 4))).toBe(true);
    });

    it("avant le choix de l'arête, le curseur montre déjà les inférences de la géométrie visée", () => {
      const { m } = monde();
      const p = partie(machineDecalage, m).jouer(survolVers(v3(4 + 0.004, 0.004, 0)));
      expect(p.vue().inference?.type).toBe("extremite");
    });
  });
});
