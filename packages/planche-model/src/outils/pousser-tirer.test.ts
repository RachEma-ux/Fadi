import { describe, expect, it } from "vitest";
import { type Id, aire, ajouterPolygone, ajouterRectangle, ajouterSegment, modeleVide, pousserTirer } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { aretes, boite, clicVers, contientPoint, emprise, faces, partie, saisie, sommets, survolVers, touche, volumeAbsolu, echap } from "./essais-modification.js";
import { CONSIGNE_ARETE_SURVOL, CONSIGNE_ARETE_TIRAGE, machinePousserTirer } from "./pousser-tirer.js";

const sol = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;

describe("Pousser/Tirer (§4.15)", () => {
  it("consignes et champ Mesures viennent du catalogue", () => {
    const p = partie(machinePousserTirer, sol());
    expect(p.vue().consigne).toBe(etape("pousser-tirer", 0).consigne);
    expect(p.vue().mesures?.libelle).toBe("Distance");
    expect(p.vue().mesures?.valeur).toBe("0,00 m".replace(",", "."));
    p.jouer(clicVers(v3(1, 1, 0)));
    expect(p.vue().consigne).toBe(etape("pousser-tirer", 1).consigne);
  });

  it("CA-PPT-1 : rectangle 4 × 3, 2,7 → boîte fermée de 6 faces, 12 arêtes, volume 32,4 m³", () => {
    const p = partie(machinePousserTirer, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("2.7"));
    expect(faces(p.modele)).toHaveLength(6);
    expect(aretes(p.modele)).toHaveLength(12);
    expect(volumeAbsolu(p.modele)).toBeCloseTo(32.4, 9);
    expect(p.operations).toEqual(["Pousser/Tirer"]);
    expect(p.vue().consigne).toBe(etape("pousser-tirer", 0).consigne); // outil gardé à l'étape 1
  });

  it("CA-PPT-2 : −3 sur une face de normale +y → déplacement de 3 m vers −y", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 0, 3)).modele;
    const face = Object.values(m.racine.faces)[0];
    expect(face?.normale.y).toBeCloseTo(1, 9);
    const p = partie(machinePousserTirer, m).jouer(clicVers(v3(1, 0, 1), v3(0, 1, 0)), saisie("-3"));
    const e = emprise(p.modele);
    expect(e.min.y).toBeCloseTo(-3, 9);
    expect(e.max.y).toBeCloseTo(0, 9);
  });

  it("CA-PPT-3 : 1 × 1 sur la face avant d'une boîte de 3 m de profondeur, −3 → trou traversant", () => {
    const base = boite(4, 3, 3);
    const m = ajouterRectangle(base, v3(1, 0, 1), v3(1, 0, 0), v3(0, 0, 1)).modele;
    expect(faces(m)).toHaveLength(7); // 6 faces de la boîte + la face intérieure découpée (la face avant devient un anneau)
    const p = partie(machinePousserTirer, m).jouer(clicVers(v3(1.5, 0, 1.5), v3(0, -1, 0)), saisie("-3"));
    const arriere = faces(p.modele).filter((f) => f.trous.length === 1 && f.exterieur.every((s) => Math.abs((p.modele.racine.sommets[s]?.position.y ?? 0) - 3) < 1e-9));
    expect(arriere).toHaveLength(1);
  });

  it("CA-PPT-4 : Ctrl puis 1 sur le dessus → une arête horizontale par face latérale à l'ancienne hauteur", () => {
    const p = partie(machinePousserTirer, boite(4, 3, 2.7)).jouer(touche("Ctrl"), clicVers(v3(1, 1, 2.7)), saisie("1"));
    const horizontales = aretes(p.modele).filter((a) => {
      const A = p.modele.racine.sommets[a.a]?.position;
      const B = p.modele.racine.sommets[a.b]?.position;
      return A && B && Math.abs(A.z - 2.7) < 1e-9 && Math.abs(B.z - 2.7) < 1e-9;
    });
    expect(horizontales).toHaveLength(4);
    expect(emprise(p.modele).max.z).toBeCloseTo(3.7, 9);
    expect(contientPoint(sommets(p.modele), v3(0, 0, 3.7))).toBe(true);
  });

  it("CA-PPT-5 : double-clic sur une face latérale après un tirage de 0,5 → tirage de 0,5 de cette face", () => {
    const p = partie(machinePousserTirer, boite(4, 3, 2.7)).jouer(clicVers(v3(1, 1, 2.7)), saisie("0.5"));
    expect(emprise(p.modele).max.z).toBeCloseTo(3.2, 9);
    p.jouer(clicVers(v3(4, 1.5, 1), v3(1, 0, 0), true));
    expect(emprise(p.modele).max.x).toBeCloseTo(4.5, 9);
    expect(p.historique).toHaveLength(3);
  });

  it("CA-PPT-6 : tirage au curseur puis 2,7 → une seule opération (un pas d'annulation)", () => {
    const p = partie(machinePousserTirer, sol()).jouer(clicVers(v3(1, 1, 0)), survolVers(v3(1, 1, 1.5), v3(1, 0, 0)), clicVers(v3(1, 1, 1.5), v3(1, 0, 0)));
    expect(p.historique).toHaveLength(2);
    expect(emprise(p.modele).max.z).toBeCloseTo(1.5, 6);
    p.jouer(saisie("2.7"));
    expect(p.historique).toHaveLength(2);
    expect(p.operations).toEqual(["Pousser/Tirer (corrigé)"]);
    expect(emprise(p.modele).max.z).toBeCloseTo(2.7, 9);
    expect(volumeAbsolu(p.modele)).toBeCloseTo(32.4, 9);
  });

  it("Échap pendant le tirage : face remise en place, étape 1, rien d'appliqué", () => {
    const p = partie(machinePousserTirer, sol()).jouer(clicVers(v3(1, 1, 0)), survolVers(v3(1, 1, 1), v3(1, 0, 0)), echap);
    expect(p.historique).toHaveLength(1);
    expect(p.selection).toEqual([]);
    expect(p.vue().consigne).toBe(etape("pousser-tirer", 0).consigne);
  });

  it("distance nulle ou saisie invalide : message, rien d'appliqué", () => {
    const p = partie(machinePousserTirer, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("0"));
    expect(p.historique).toHaveLength(1);
    expect(p.vue().erreur).toMatch(/nulle/);
    const q = partie(machinePousserTirer, sol()).jouer(saisie("2"));
    expect(q.vue().erreur).toMatch(/Cliquez d'abord/);
    const r = partie(machinePousserTirer, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("abc"));
    expect(r.vue().erreur).not.toBeNull();
  });

  it("pousser jusqu'à une face opposée atteinte exactement perce (cohérence avec le noyau)", () => {
    const m = pousserTirer(sol(), Object.keys(sol().racine.faces)[0] as Id, 1).modele;
    expect(faces(m)).toHaveLength(6);
  });
});

describe("Pousser/Tirer d'arêtes (écart Fadi, D-196)", () => {
  const segment = () => ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
  const aireDe = (m: ReturnType<typeof segment>) => faces(m).reduce((s, f) => s + aire(m, f.id), 0);

  it("survol puis clic sur une arête : consignes du mode arêtes", () => {
    const p = partie(machinePousserTirer, segment()).jouer(survolVers(v3(2, 0, 0)));
    expect(p.vue().consigne).toBe(CONSIGNE_ARETE_SURVOL);
    p.jouer(clicVers(v3(2, 0, 0)));
    expect(p.vue().consigne).toBe(CONSIGNE_ARETE_TIRAGE);
    expect(p.vue().mesures?.libelle).toBe("Distance");
  });

  it("segment, ↑ puis 2,7 → face verticale de 10,8 m², un pas d'annulation", () => {
    const p = partie(machinePousserTirer, segment()).jouer(clicVers(v3(2, 0, 0)), touche("FlecheHaut"), saisie("2.7"));
    expect(faces(p.modele)).toHaveLength(1);
    expect(aireDe(p.modele)).toBeCloseTo(10.8, 9);
    expect(emprise(p.modele).max.z).toBeCloseTo(2.7, 9);
    expect(p.operations).toEqual(["Pousser/Tirer"]);
    expect(p.historique).toHaveLength(2);
    expect(p.vue().consigne).toBe(etape("pousser-tirer", 0).consigne);
  });

  it("segment tiré au curseur dans le plan → rectangle plein", () => {
    const p = partie(machinePousserTirer, segment()).jouer(clicVers(v3(2, 0, 0)), survolVers(v3(2, 3, 0)), clicVers(v3(2, 3, 0)));
    expect(faces(p.modele)).toHaveLength(1);
    expect(aireDe(p.modele)).toBeCloseTo(12, 6);
  });

  it("Alt = des deux côtés ; une distance tapée juste après corrige la surface (même pas d'annulation)", () => {
    const p = partie(machinePousserTirer, segment()).jouer(clicVers(v3(2, 0, 0)), touche("Alt"), touche("FlecheGauche"), saisie("1"));
    expect(aireDe(p.modele)).toBeCloseTo(8, 9);
    expect(emprise(p.modele).min.y).toBeCloseTo(-1, 9);
    p.jouer(saisie("2"));
    expect(aireDe(p.modele)).toBeCloseTo(16, 9);
    expect(p.historique).toHaveLength(2);
    expect(p.operations).toEqual(["Pousser/Tirer (corrigé)"]);
  });

  it("double-clic sur une autre arête : même déplacement répété", () => {
    let m = segment();
    m = ajouterSegment(m, v3(0, 5, 0), v3(4, 5, 0)).modele;
    const p = partie(machinePousserTirer, m).jouer(clicVers(v3(2, 0, 0)), touche("FlecheHaut"), saisie("1"));
    p.jouer(clicVers(v3(2, 5, 0), undefined, true));
    expect(faces(p.modele)).toHaveLength(2);
    expect(aireDe(p.modele)).toBeCloseTo(8, 9);
  });

  it("arête d'un cercle : tout le cercle devient un tube", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 24).modele;
    const a = Math.PI / 24;
    const milieu = v3(Math.cos(a) * Math.cos(a), Math.cos(a) * Math.sin(a), 0);
    const p = partie(machinePousserTirer, m).jouer(clicVers(milieu), touche("FlecheHaut"), saisie("2"));
    expect(faces(p.modele)).toHaveLength(25);
    expect(emprise(p.modele).max.z).toBeCloseTo(2, 9);
  });

  it("sans direction : message ; Échap : rien d'appliqué", () => {
    const p = partie(machinePousserTirer, segment()).jouer(clicVers(v3(2, 0, 0)), saisie("2"));
    expect(p.vue().erreur).toMatch(/Orientez le curseur/);
    expect(p.historique).toHaveLength(1);
    p.jouer(echap);
    expect(p.selection).toEqual([]);
    expect(p.vue().consigne).toBe(etape("pousser-tirer", 0).consigne);
  });

  it("cercle tiré dans son plan → couronne vers l'extérieur (distance tapée, signe du curseur)", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 24).modele;
    const a = Math.PI / 24;
    const milieu = v3(Math.cos(a) * Math.cos(a), Math.cos(a) * Math.sin(a), 0);
    const p = partie(machinePousserTirer, m).jouer(clicVers(milieu), survolVers(v3(1.6, 0.1, 0)), saisie("0.5"));
    expect(faces(p.modele)).toHaveLength(2);
    // Distance tapée exacte même avec un curseur oblique : disque + couronne = polygone d'apothème cos(π/24) + 0,5.
    const ap = Math.cos(Math.PI / 24) + 0.5;
    expect(faces(p.modele).reduce((s, f) => s + aire(p.modele, f.id), 0)).toBeCloseTo(24 * ap * ap * Math.tan(Math.PI / 24), 9);
    // Vers l'intérieur : le curseur rentre dans le disque.
    const q = partie(machinePousserTirer, m).jouer(clicVers(milieu), survolVers(v3(0.4, 0.05, 0)), saisie("0.5"));
    expect(faces(q.modele)).toHaveLength(2);
    expect(emprise(q.modele).max.x).toBeCloseTo(1, 9);
  });

  it("↓ = le long de l'arête : la ligne s'allonge de la distance tapée", () => {
    const p = partie(machinePousserTirer, segment()).jouer(clicVers(v3(3.5, 0, 0)), touche("FlecheBas"), survolVers(v3(5, 0, 0)), saisie("1"));
    expect(faces(p.modele)).toHaveLength(0);
    expect(aretes(p.modele)).toHaveLength(1);
    expect(emprise(p.modele).max.x).toBeCloseTo(5, 9);
    p.jouer(saisie("2"));
    expect(emprise(p.modele).max.x).toBeCloseTo(6, 9);
    expect(p.historique).toHaveLength(2);
  });
});

