/**
 * Fixtures de régression de la famille d'extrusion (suite du lot Planche 8, D-202 ; cahier « Extrusion Implementation
 * Specification V1 », lot B0.2). Elles épinglent le comportement LIVRÉ, avec les cotes exactes des cas d'acceptation de la
 * V1 (P-01, P-02, P-03, P-10, P-11, P-12, P-14, P-15, L-06), avant que les lots suivants ne touchent au noyau.
 * F-01 (Suivez-moi sur chemin présélectionné) est couvert par « CA-SUI-1 » de `modification-noyau.test.ts`.
 * Mètres partout ; les volumes sont convertis en mm³ pour garder les nombres de la V1 lisibles.
 */
import { describe, expect, it } from "vitest";
import {
  type Id,
  type Modele,
  aire,
  ajouterPolygone,
  ajouterRectangle,
  ajouterSegment,
  allongerArete,
  contexte,
  couronne,
  etirerAretes,
  grouper,
  modeleVide,
  pousserTirer,
  volume,
} from "./geometrie-libre.js";
import { lireModelePlanche } from "./delta.js";
import { analyserSaisie } from "./saisie-vcb.js";
import { v3 } from "./vecteur.js";

const MM3 = 1e9;
const faces = (m: Modele) => Object.values(contexte(m).faces);
const aretes = (m: Modele) => Object.values(contexte(m).aretes);
const toutes = (m: Modele): Id[] => [...Object.keys(contexte(m).faces), ...Object.keys(contexte(m).aretes)];
const premiereFace = (m: Modele) => Object.keys(contexte(m).faces)[0] as Id;
const volumeMm3 = (m: Modele): number => {
  const g = grouper(m, toutes(m));
  return (volume(g.modele, g.occurrence) as number) * MM3;
};
const longueurs = (m: Modele) => {
  const c = contexte(m);
  return aretes(m).map((a) => {
    const p = c.sommets[a.a]!.position;
    const q = c.sommets[a.b]!.position;
    return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
  });
};

describe("P-01 — extrusion d'une face isolée et unités (EX-PT-01, EX-NUM-01)", () => {
  it("rectangle isolé 200 × 100 mm extrudé de 50 mm : volume fermé 1 000 000 mm³", () => {
    const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(0.2, 0, 0), v3(0, 0.1, 0));
    const m = pousserTirer(r.modele, premiereFace(r.modele), 0.05).modele;
    expect(volumeMm3(m)).toBeCloseTo(1_000_000, 3);
  });
  it("« 50mm » et « 0.05m » donnent la même distance", () => {
    const a = analyserSaisie("50mm", { attendu: "longueur" });
    const b = analyserSaisie("0.05m", { attendu: "longueur" });
    expect(a).toEqual(b);
    expect(a.genre).toBe("longueur");
  });
});

describe("P-02 — Conserver la face de départ (EX-PT-01, EX-UI-05)", () => {
  /** Boîte 4 × 3 × 2 posée au sol ; renvoie le modèle et la face du dessus. */
  const boite = () => {
    const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0));
    const m = pousserTirer(r.modele, premiereFace(r.modele), 2).modele;
    const dessus = faces(m).find((f) => f.normale.z > 0.99) as { id: Id };
    return { m, dessus: dessus.id };
  };
  it("sans l'option : les flancs s'allongent (6 faces) ; avec : la face de départ reste, 4 flancs nouveaux", () => {
    const a = boite();
    const sans = pousserTirer(a.m, a.dessus, 1).modele;
    expect(faces(sans)).toHaveLength(6);
    const b = boite();
    const avec = pousserTirer(b.m, b.dessus, 1, { nouvelleFace: true }).modele;
    expect(faces(avec).length).toBeGreaterThan(6);
    expect(faces(avec).filter((f) => f.normale.z > 0.99 && Math.abs(aire(avec, f.id) - 12) < 1e-9)).toHaveLength(2);
  });
});

describe("P-03 — opération traversante (EX-PT-01)", () => {
  it("bloc 100 × 100 × 50 mm, région 20 × 20 mm poussée à travers : volume matériel 480 000 mm³", () => {
    const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(0.1, 0, 0), v3(0, 0.1, 0));
    let m = pousserTirer(r.modele, premiereFace(r.modele), 0.05).modele;
    m = ajouterRectangle(m, v3(0.04, 0.04, 0.05), v3(0.02, 0, 0), v3(0, 0.02, 0)).modele;
    const region = faces(m).find((f) => f.normale.z > 0.99 && Math.abs(aire(m, f.id) - 0.0004) < 1e-12) as { id: Id };
    m = pousserTirer(m, region.id, -0.05).modele;
    expect(faces(m).filter((f) => f.trous.length === 1)).toHaveLength(2);
    expect(volumeMm3(m)).toBeCloseTo(480_000, 3);
  });
});

describe("P-10, P-11 — balayage d'arête (EX-PT-05, EX-NUM-03)", () => {
  const ligne = () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    return { m, a: aretes(m)[0]!.id };
  };
  it("P-10 : arête de 4 m balayée de 2,7 m perpendiculairement : 10,8 m², arête d'origine conservée", () => {
    const { m, a } = ligne();
    const r = etirerAretes(m, [a], v3(0, 0, 2.7)).modele;
    expect(faces(r).reduce((s, f) => s + aire(r, f.id), 0)).toBeCloseTo(10.8, 9);
    expect(contexte(r).aretes[a]).toBeDefined();
  });
  it("P-11 : même arête, 1 m par côté en symétrique : portée 2 m, 8 m²", () => {
    const { m, a } = ligne();
    const r = etirerAretes(m, [a], v3(0, 0, 1), { symetrique: true }).modele;
    expect(faces(r).reduce((s, f) => s + aire(r, f.id), 0)).toBeCloseTo(8, 9);
    const z = Object.values(contexte(r).sommets).map((s) => s.position.z);
    expect(Math.max(...z) - Math.min(...z)).toBeCloseTo(2, 9);
  });
});

describe("P-12 — bande annulaire (EX-PT-06)", () => {
  /** Aire d'un polygone régulier de n côtés inscrit dans le rayon R. */
  const airePolygone = (n: number, R: number) => (n / 2) * R * R * Math.sin((2 * Math.PI) / n);
  it("polygone régulier 24 côtés, rayon 1 m, bande de 0,5 m : largeur exacte (décalage d'apothème) ; effondrement refusé", () => {
    const n = 24;
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, n).modele;
    const ids = aretes(m).map((a) => a.id);
    const r = couronne(m, ids, 0.5).modele;
    const apotheme = Math.cos(Math.PI / n);
    const R2 = (apotheme + 0.5) / apotheme;
    const disque = faces(m)[0]!.id;
    const bande = faces(r).filter((f) => f.id !== disque);
    expect(bande.reduce((s, f) => s + aire(r, f.id), 0)).toBeCloseTo(airePolygone(n, R2) - airePolygone(n, 1), 9);
    expect(() => couronne(m, ids, -2)).toThrow(RangeError);
  });
});

describe("P-14, P-15 — allonger une arête droite (EX-PT-07)", () => {
  it("P-14 : ligne libre de 4 m : +1 m → 5 m ; −1 m → 3 m ; −4 m refusé", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const a = aretes(m)[0]!;
    const fin = contexte(m).sommets[a.a]!.position.x > 1 ? a.a : a.b;
    expect(longueurs(allongerArete(m, a.id, fin, 1).modele).reduce((s, l) => s + l, 0)).toBeCloseTo(5, 9);
    expect(longueurs(allongerArete(m, a.id, fin, -1).modele).reduce((s, l) => s + l, 0)).toBeCloseTo(3, 9);
    expect(() => allongerArete(m, a.id, fin, -4)).toThrow(RangeError);
  });
  it("P-15 : extrémité reliée à une autre arête : l'allongement ajoute un segment colinéaire ; le raccourcissement est refusé", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    m = ajouterSegment(m, v3(4, 0, 0), v3(4, 3, 0)).modele;
    const c = contexte(m);
    const a = aretes(m).find((e) => Math.abs(c.sommets[e.a]!.position.y) < 1e-12 && Math.abs(c.sommets[e.b]!.position.y) < 1e-12)!;
    const coin = c.sommets[a.a]!.position.x > 1 ? a.a : a.b;
    const r = allongerArete(m, a.id, coin, 1).modele;
    expect(aretes(r)).toHaveLength(3);
    expect(Math.max(...Object.values(contexte(r).sommets).map((s) => s.position.x))).toBeCloseTo(5, 9);
    expect(() => allongerArete(m, a.id, coin, -1)).toThrow(RangeError);
  });
});

describe("L-06 — fichiers anciens (EX-LINK-01, EX-SAVE-03)", () => {
  it("un modèle sans table de liens se relit à l'identique et n'invente aucun lien", () => {
    const ligne = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const m = etirerAretes(ligne, [aretes(ligne)[0]!.id], v3(0, 0, 1)).modele;
    const brut = JSON.parse(JSON.stringify(m)) as { annotations?: Record<string, unknown> };
    if (brut.annotations) delete brut.annotations["extrusions"];
    const relu = lireModelePlanche(brut);
    expect(relu).not.toBeNull();
    expect(relu!.annotations?.extrusions ?? {}).toEqual({});
    expect(Object.keys(contexte(relu!).faces)).toEqual(Object.keys(contexte(m).faces));
  });
});
