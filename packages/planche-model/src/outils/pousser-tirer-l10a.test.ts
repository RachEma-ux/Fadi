/** Lot 10a (EX-STATE-01, EX-NUM-02, EX-NUM-04 ; cas A-10, P-16, P-17 de la V1) : Pousser/Tirer complet, état et nombres. */
import { describe, expect, it } from "vitest";
import { type Id, ERREUR_DISTANCE_NON_FINIE, ERREUR_SOUS_TOLERANCE, ajouterRectangle, ajouterSegment, couronne, recoupementContour, etirerAretes, modeleVide, pousserTirer, tuberFace } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { clicVers, echap, emprise, faces, partie, saisie, survolVers } from "./essais-modification.js";
import { ERREUR_SENS_SANS_SOURCE, actionExtrusion, machinePousserTirer } from "./pousser-tirer.js";
import { ERREUR_CIBLE_NON_PARALLELE, distanceJusquAFace } from "../geometrie-libre.js";

const sol = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
const face = (m: ReturnType<typeof sol>) => Object.keys(m.racine.faces)[0] as Id;

describe("P-17 — nombres non finis et sous la tolérance (EX-NUM-04)", () => {
  it("NaN et ±∞ sont refusés par le noyau au lieu d'entrer dans la géométrie", () => {
    const m = sol();
    for (const d of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => pousserTirer(m, face(m), d)).toThrow(ERREUR_DISTANCE_NON_FINIE);
      expect(() => tuberFace(m, face(m), d)).toThrow(ERREUR_DISTANCE_NON_FINIE);
      expect(() => couronne(m, Object.keys(m.racine.aretes), d)).toThrow(ERREUR_DISTANCE_NON_FINIE);
    }
    expect(() => etirerAretes(m, [Object.keys(m.racine.aretes)[0]!], v3(0, 0, Number.NaN))).toThrow(ERREUR_DISTANCE_NON_FINIE);
  });
  it("une distance non nulle sous la tolérance de modélisation est refusée avec son motif", () => {
    const m = sol();
    expect(() => pousserTirer(m, face(m), 5e-7)).toThrow(ERREUR_SOUS_TOLERANCE);
    expect(() => tuberFace(m, face(m), -5e-7)).toThrow(ERREUR_SOUS_TOLERANCE);
  });
});

describe("A-10 — opération refusée et Échap (EX-STATE-01)", () => {
  it("valeur refusée puis valeur valide : la face reste acquise, une seule opération dans l'historique", () => {
    const p = partie(machinePousserTirer, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("0"));
    expect(p.vue().erreur).toMatch(/nulle/);
    expect(p.etat.etape).toBe(2);
    p.jouer(saisie("2"));
    expect(p.historique).toHaveLength(2);
    expect(emprise(p.modele).max.z - emprise(p.modele).min.z).toBeCloseTo(2, 9);
  });
  it("Échap pendant l'aperçu : aucun pas d'historique, la sélection d'avant l'opération revient", () => {
    const m = sol();
    const p = partie(machinePousserTirer, m, ["x-avant"]).jouer(clicVers(v3(1, 1, 0)));
    expect(p.selection).toEqual([face(m)]);
    p.jouer(echap);
    expect(p.selection).toEqual(["x-avant"]);
    expect(p.historique).toHaveLength(1);
  });
});

describe("P-16 — distance signée et Inverser le sens (EX-NUM-02)", () => {
  it("le champ affiche la distance signée ; Inverser applique la valeur tapée de l'autre côté, une seule fois", () => {
    const p = partie(machinePousserTirer, sol()).jouer(clicVers(v3(1, 1, 0)));
    p.etat = actionExtrusion(p.etat, { type: "reverse-direction" }).etat;
    expect(p.vue().options?.find((o) => o.id === "sens")?.valeur).toBe("inverse");
    p.jouer(saisie("1"));
    expect(p.historique).toHaveLength(2);
    const z = emprise(p.modele);
    expect(z.min.z).toBeCloseTo(-1, 9);
    expect(faces(p.modele).length).toBeGreaterThan(1);
    // Le sens revient à « direct » après l'opération (appliqué une seule fois).
    expect(p.vue().options?.find((o) => o.id === "sens")?.valeur).toBe("direct");
  });
  it("Inverser sans face ni arête acquise : refus nommé", () => {
    const p = partie(machinePousserTirer, sol());
    expect(actionExtrusion(p.etat, { type: "reverse-direction" }).etat.erreur).toBe(ERREUR_SENS_SANS_SOURCE);
  });
});

describe("P-09 — aperçu d'une face trouée (EX-PREV-02)", () => {
  /** Carré 4 × 4 percé d'un carré 2 × 2 au centre. */
  const anneau = () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 4, 0)).modele;
    return ajouterRectangle(m, v3(1, 1, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
  };
  it("Normal : la face d'arrivée porte son trou ; Surface ouverte : parois des deux boucles (deux tubes)", () => {
    const p = partie(machinePousserTirer, anneau()).jouer(clicVers(v3(0.5, 0.5, 0)), survolVers(v3(0.5, 0.5, 1), v3(0.5, -10, 1)));
    const a = p.vue().apercu;
    expect(a.faces).toHaveLength(1);
    expect(a.trous?.[0]).toHaveLength(1);
    const q = partie(machinePousserTirer, anneau()).configurer("face", "tube").jouer(clicVers(v3(0.5, 0.5, 0)), survolVers(v3(0.5, 0.5, 1), v3(0.5, -10, 1)));
    expect(q.vue().apercu.faces).toHaveLength(8);
  });
});

describe("P-04 — Jusqu'à une face (EX-PT-02)", () => {
  /** Sol 4 × 3 en z = 0, plateau parallèle à 75 mm à côté, mur vertical (non parallèle). */
  const scene = () => {
    let m = sol();
    m = ajouterRectangle(m, v3(10, 0, 0.075), v3(2, 0, 0), v3(0, 2, 0)).modele;
    return ajouterRectangle(m, v3(20, 0, 0), v3(2, 0, 0), v3(0, 0, 2)).modele;
  };
  it("cible parallèle à 75 mm : distance affichée puis validée de 75 mm ; cible non parallèle refusée", () => {
    const m = scene();
    const p = partie(machinePousserTirer, m).configurer("etendue", "face").jouer(clicVers(v3(1, 1, 0)));
    p.jouer(survolVers(v3(11, 1, 0.075)));
    expect(p.etat.distance).toBeCloseTo(0.075, 12);
    expect(p.vue().mesures?.valeur ?? "").toMatch(/0[.,]08|0[.,]075/);
    p.jouer(clicVers(v3(11, 1, 0.075)));
    expect(p.historique).toHaveLength(2);
    const zs = Object.values(p.modele.racine.sommets).filter((x) => x.position.x < 5).map((x) => x.position.z);
    expect(Math.max(...zs)).toBeCloseTo(0.075, 12);
    const q = partie(machinePousserTirer, m).configurer("etendue", "face").jouer(clicVers(v3(1, 1, 0)), clicVers(v3(21, 0, 1), v3(21, -10, 1)));
    expect(q.vue().erreur).toContain(ERREUR_CIBLE_NON_PARALLELE);
    expect(q.historique).toHaveLength(1);
    expect(q.etat.etape).toBe(2);
  });
  it("noyau : distance signée vers une face parallèle, refus d'une face non parallèle", () => {
    const m = scene();
    const f = Object.values(m.racine.faces);
    const source = f.find((x) => Math.abs(x.normale.z) > 0.99 && m.racine.sommets[x.exterieur[0]!]!.position.x < 5)!;
    const plateau = f.find((x) => Math.abs(x.normale.z) > 0.99 && m.racine.sommets[x.exterieur[0]!]!.position.x > 9 && m.racine.sommets[x.exterieur[0]!]!.position.x < 13)!;
    const mur = f.find((x) => Math.abs(x.normale.z) < 0.01)!;
    expect(Math.abs(distanceJusquAFace(m, source.id, plateau.id))).toBeCloseTo(0.075, 12);
    expect(() => distanceJusquAFace(m, source.id, mur.id)).toThrow(ERREUR_CIBLE_NON_PARALLELE);
  });
});

describe("P-13 — bande annulaire sur une boucle concave (EX-PT-06)", () => {
  /** Carré 4 × 4 entaillé d'un V très aigu (sommet en (2, 1)). */
  const entaille = () => {
    const pts = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 4, 0), v3(2.1, 4, 0), v3(2, 1, 0), v3(1.9, 4, 0), v3(0, 4, 0)];
    let m = modeleVide();
    for (let i = 0; i < pts.length; i++) m = ajouterSegment(m, pts[i]!, pts[(i + 1) % pts.length]!).modele;
    return m;
  };
  it("petit décalage valide accepté ; décalage qui se recoupe refusé en nommant les segments", () => {
    const m = entaille();
    const ids = Object.keys(m.racine.aretes);
    expect(() => couronne(m, ids, 0.01)).not.toThrow();
    // Vers l'intérieur, l'onglet du V très aigu traverse le bord du bas : refus, segments nommés, modèle inchangé.
    expect(() => couronne(m, ids, -0.05)).toThrow(/se recoupe \(segments \d+ et \d+/);
  });
  it("détecteur pur : boucle simple sans recoupement, nœud papillon détecté", () => {
    const n = v3(0, 0, 1);
    expect(recoupementContour([v3(0, 0, 0), v3(1, 0, 0), v3(1, 1, 0), v3(0, 1, 0)], n)).toBeNull();
    expect(recoupementContour([v3(0, 0, 0), v3(1, 1, 0), v3(1, 0, 0), v3(0, 1, 0)], n)).toEqual([0, 2]);
  });
});
