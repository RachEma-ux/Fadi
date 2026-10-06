import { describe, expect, it } from "vitest";
import {
  type Contexte,
  type Id,
  type Modele,
  aire,
  ajouterPolygone,
  ajouterRectangle,
  ajouterSegment,
  compter,
  contexte,
  copier,
  decaler,
  deplacer,
  eclater,
  effacerArete,
  estSolide,
  grouper,
  inverserFace,
  mettreAEchelle,
  modeleVide,
  nombreOccurrences,
  positionsFace,
  pousserTirer,
  rendreUnique,
  retourner,
  tourner,
  volume,
} from "./geometrie-libre.js";
import { type Vec3, egal, v3 } from "./vecteur.js";

const faces = (c: Contexte) => Object.values(c.faces);
const aretes = (c: Contexte) => Object.values(c.aretes);
const toutes = (c: Contexte): Id[] => [...Object.keys(c.faces), ...Object.keys(c.aretes)];
const aires = (m: Modele, dans?: Id) =>
  faces(contexte(m, dans))
    .map((f) => aire(m, f.id, dans === undefined ? {} : { dans }))
    .sort((a, b) => a - b);

function areteEntre(c: Contexte, p: Vec3, q: Vec3): Id {
  const a = aretes(c).find((e) => {
    const A = (c.sommets[e.a] as { position: Vec3 }).position;
    const B = (c.sommets[e.b] as { position: Vec3 }).position;
    return (egal(A, p) && egal(B, q)) || (egal(A, q) && egal(B, p));
  });
  if (!a) throw new Error("arête absente");
  return a.id;
}

function sommetEn(c: Contexte, p: Vec3): Id {
  const s = Object.values(c.sommets).find((x) => egal(x.position, p));
  if (!s) throw new Error("sommet absent");
  return s.id;
}

function faceDeNormale(c: Contexte, n: Vec3, ou?: (pts: Vec3[]) => boolean): Id {
  const f = faces(c).find((x) => egal(x.normale, n, 1e-9) && (!ou || ou(positionsFace(c, x).exterieur)));
  if (!f) throw new Error("face absente");
  return f.id;
}

/** Rectangle 4×3 au sol, tiré de h. */
function boite(h = 2.7, m: Modele = modeleVide(), coin = v3(0, 0, 0), dx = 4, dy = 3): Modele {
  const r = ajouterRectangle(m, coin, v3(dx, 0, 0), v3(0, dy, 0));
  const f = r.rapport.crees.find((id) => id.startsWith("f") && r.modele.racine.faces[id]) as Id;
  return pousserTirer(r.modele, f, h).modele;
}

function boiteGroupee(h = 2.7): { m: Modele; occ: Id } {
  const m = boite(h);
  const g = grouper(m, toutes(m.racine));
  return { m: g.modele, occ: g.occurrence };
}

describe("dessin et faces automatiques", () => {
  it("rectangle 4×3 → 1 face de 12 m², 4 arêtes, 4 sommets", () => {
    const { modele, rapport } = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0));
    expect(compter(modele.racine)).toEqual({ sommets: 4, aretes: 4, faces: 1, occurrences: 0 });
    expect(aires(modele)).toEqual([12]);
    expect(rapport.crees.length).toBe(9);
    expect(rapport.supprimes).toEqual([]);
  });

  it("face au sol orientée +Z (choix Planche documenté)", () => {
    const { modele } = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0));
    expect(faces(modele.racine)[0]?.normale).toEqual(v3(0, 0, 1));
  });

  it("4 segments successifs qui se referment → face créée à la fermeture seulement", () => {
    let m = modeleVide();
    const p = [v3(0, 0, 0), v3(2, 0, 0), v3(2, 2, 0), v3(0, 2, 0)];
    for (let i = 0; i < 3; i++) m = ajouterSegment(m, p[i] as Vec3, p[i + 1] as Vec3).modele;
    expect(compter(m.racine).faces).toBe(0);
    m = ajouterSegment(m, p[3] as Vec3, p[0] as Vec3).modele;
    expect(compter(m.racine).faces).toBe(1);
    expect(aires(m)).toEqual([4]);
  });

  it("boucle non plane → aucune face", () => {
    let m = modeleVide();
    const p = [v3(0, 0, 0), v3(2, 0, 0), v3(2, 2, 1), v3(0, 2, 0)];
    for (let i = 0; i < 4; i++) m = ajouterSegment(m, p[i] as Vec3, p[(i + 1) % 4] as Vec3).modele;
    expect(compter(m.racine)).toMatchObject({ aretes: 4, faces: 0 });
  });

  it("fusion des sommets à TOL", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(1, 0, 0)).modele;
    m = ajouterSegment(m, v3(1 + 1e-8, 0, 0), v3(1, 1, 0)).modele;
    expect(compter(m.racine).sommets).toBe(3);
  });

  it("deux segments qui se croisent → découpés en 4 arêtes au point d'intersection", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(2, 2, 0)).modele;
    const r = ajouterSegment(m, v3(0, 2, 0), v3(2, 0, 0));
    m = r.modele;
    expect(compter(m.racine)).toMatchObject({ sommets: 5, aretes: 4 });
    sommetEn(m.racine, v3(1, 1, 0));
    expect(r.rapport.modifies.length).toBe(1); // l'arête coupée garde son id pour le premier tronçon
  });

  it("segment dont l'extrémité touche une arête → l'arête est découpée", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    m = ajouterSegment(m, v3(1, 0, 0), v3(1, 3, 0)).modele;
    expect(compter(m.racine).aretes).toBe(3);
  });

  it("segments colinéaires superposés → portion commune fusionnée", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(2, 0, 0)).modele;
    m = ajouterSegment(m, v3(1, 0, 0), v3(3, 0, 0)).modele;
    expect(compter(m.racine)).toMatchObject({ sommets: 4, aretes: 3 });
    const r = ajouterSegment(m, v3(0, 0, 0), v3(3, 0, 0));
    expect(r.rapport.crees).toEqual([]);
  });

  it("ligne en travers d'une face (milieu à milieu) → 2 faces de 6 m²", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const id0 = Object.keys(m.racine.faces)[0];
    m = ajouterSegment(m, v3(2, 0, 0), v3(2, 3, 0)).modele;
    expect(compter(m.racine)).toMatchObject({ faces: 2, aretes: 7 });
    expect(aires(m)).toEqual([6, 6]);
    expect(Object.keys(m.racine.faces)).toContain(id0);
  });

  it("boucle intérieure → trou + face intérieure", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    m = ajouterRectangle(m, v3(1, 1, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    expect(compter(m.racine).faces).toBe(2);
    expect(aires(m)).toEqual([1, 11]);
    const anneau = faces(m.racine).find((f) => f.trous.length === 1);
    expect(anneau?.trous[0]?.length).toBe(4);
  });

  it("rectangle tracé autour d'une face existante → grande face trouée, petite face conservée", () => {
    let m = ajouterRectangle(modeleVide(), v3(1, 1, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const petite = Object.values(m.racine.faces)[0];
    m = ajouterRectangle(m, v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    expect(aires(m)).toEqual([1, 11]);
    expect(m.racine.faces[petite?.id as Id]).toBe(petite);
  });

  it("cercle de 24 segments → 1 courbe, 1 face ≈ πr²", () => {
    const { modele } = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 24);
    expect(compter(modele.racine)).toMatchObject({ aretes: 24, faces: 1 });
    const k = Object.values(modele.racine.courbes);
    expect(k.length).toBe(1);
    expect(k[0]?.aretes.length).toBe(24);
    expect(aires(modele)[0]).toBeCloseTo(12 * Math.sin(Math.PI / 12), 9);
  });

  it("segments de courbe hors bornes 3..999 → erreur (alerte observée)", () => {
    expect(() => ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 1000)).toThrow(/3 to 999/);
    expect(() => ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 2)).toThrow(RangeError);
  });

  it("immuabilité : le modèle d'entrée n'est jamais modifié", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const avant = JSON.stringify(m0);
    ajouterSegment(m0, v3(2, 0, 0), v3(2, 3, 0));
    pousserTirer(m0, Object.keys(m0.racine.faces)[0] as Id, 1);
    expect(JSON.stringify(m0)).toBe(avant);
    expect(Object.isFrozen(m0.racine.faces)).toBe(true);
  });
});

describe("gomme", () => {
  it("arête commune à deux faces coplanaires → fusion en une face, arêtes recollées", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    m = ajouterSegment(m, v3(2, 0, 0), v3(2, 3, 0)).modele;
    m = effacerArete(m, areteEntre(m.racine, v3(2, 0, 0), v3(2, 3, 0))).modele;
    expect(compter(m.racine)).toMatchObject({ faces: 1, aretes: 4, sommets: 4 });
    expect(aires(m)).toEqual([12]);
  });

  it("arête de bord → la face qui en dépend disparaît", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    m = effacerArete(m, areteEntre(m.racine, v3(0, 0, 0), v3(4, 0, 0))).modele;
    expect(compter(m.racine)).toMatchObject({ faces: 0, aretes: 3 });
  });

  it("cercle de 24 segments effacé en un seul coup (courbe entière)", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 24).modele;
    const r = effacerArete(m, Object.keys(m.racine.aretes)[5] as Id);
    expect(compter(r.modele.racine)).toEqual({ sommets: 0, aretes: 0, faces: 0, occurrences: 0 });
    expect(Object.keys(r.modele.racine.courbes)).toEqual([]);
  });

  it("polygone (6 côtés) effacé en entier, le rectangle porteur retrouve sa face pleine", () => {
    let m = ajouterRectangle(modeleVide(), v3(-3, -3, 0), v3(6, 0, 0), v3(0, 6, 0)).modele;
    m = ajouterPolygone(m, v3(0, 0, 0), v3(0, 0, 1), 1, 6, { genre: "polygone" }).modele;
    expect(compter(m.racine).faces).toBe(2);
    const k = Object.values(m.racine.courbes)[0];
    expect(k?.genre).toBe("polygone");
    m = effacerArete(m, k?.aretes[0] as Id).modele;
    expect(compter(m.racine)).toMatchObject({ faces: 1, aretes: 4 });
    expect(aires(m)).toEqual([36]);
  });

  it("arête d'une boîte → les deux faces voisines (non coplanaires) disparaissent", () => {
    let m = boite();
    m = effacerArete(m, areteEntre(m.racine, v3(0, 0, 2.7), v3(4, 0, 2.7))).modele;
    expect(compter(m.racine)).toMatchObject({ faces: 4, aretes: 11 });
  });
});

describe("pousser/tirer", () => {
  it("rectangle 4×3 tiré de 2,7 m → boîte de 6 faces, 12 arêtes, 8 sommets", () => {
    const m = boite(2.7);
    expect(compter(m.racine)).toEqual({ sommets: 8, aretes: 12, faces: 6, occurrences: 0 });
    expect(aires(m)).toEqual([8.1, 8.1, 10.8, 10.8, 12, 12].map((x) => expect.closeTo(x, 9)));
  });

  it("normales sortantes : dessous −Z, dessus +Z", () => {
    const m = boite(2.7);
    const zs = faces(m.racine).map((f) => f.normale.z + 0).sort();
    expect(zs).toEqual([-1, 0, 0, 0, 0, 1]);
  });

  it("boîte groupée : volume 32,4 m³ et solide", () => {
    const { m, occ } = boiteGroupee(2.7);
    expect(estSolide(m, occ)).toBe(true);
    expect(volume(m, occ)).toBeCloseTo(32.4, 9);
  });

  it("tirer le dessus d'une boîte → faces latérales prolongées sans arête intermédiaire", () => {
    let m = boite(2);
    const dessus = faceDeNormale(m.racine, v3(0, 0, 1));
    m = pousserTirer(m, dessus, 1).modele;
    expect(compter(m.racine)).toMatchObject({ faces: 6, aretes: 12, sommets: 8 });
    expect(m.racine.faces[dessus]).toBeDefined();
    const g = grouper(m, toutes(m.racine));
    expect(volume(g.modele, g.occurrence)).toBeCloseTo(36, 9);
  });

  it("Ctrl (nouvelle face de départ) → arête conservée à l'ancien niveau", () => {
    let m = boite(2);
    const dessus = faceDeNormale(m.racine, v3(0, 0, 1));
    m = pousserTirer(m, dessus, 1, { nouvelleFace: true }).modele;
    expect(compter(m.racine)).toMatchObject({ faces: 11, aretes: 20 });
    expect(m.racine.faces[dessus]).toBeDefined();
  });

  it("creuser (distance négative) un rectangle dessiné sur une face → poche", () => {
    let m = boite(3);
    m = ajouterRectangle(m, v3(1, 0, 1), v3(1, 0, 0), v3(0, 0, 1)).modele;
    const porte = faces(m.racine).find((f) => f.trous.length === 0 && Math.abs(aire(m, f.id) - 1) < 1e-9) as {
      id: Id;
      normale: Vec3;
    };
    expect(porte.normale).toEqual(v3(0, -1, 0));
    m = pousserTirer(m, porte.id, -1).modele;
    const g = grouper(m, toutes(m.racine));
    expect(estSolide(g.modele, g.occurrence)).toBe(true);
    expect(volume(g.modele, g.occurrence)).toBeCloseTo(36 - 1, 9);
  });

  it("creuser jusqu'à la face opposée parallèle → trou traversant", () => {
    let m = boite(3);
    m = ajouterRectangle(m, v3(1, 0, 1), v3(1, 0, 0), v3(0, 0, 1)).modele;
    const porte = faces(m.racine).find((f) => f.trous.length === 0 && Math.abs(aire(m, f.id) - 1) < 1e-9) as { id: Id };
    m = pousserTirer(m, porte.id, -3).modele;
    const percees = faces(m.racine).filter((f) => f.trous.length === 1);
    expect(percees.length).toBe(2); // faces avant et arrière trouées
    expect(compter(m.racine).faces).toBe(6 + 4);
    const g = grouper(m, toutes(m.racine));
    expect(estSolide(g.modele, g.occurrence)).toBe(true);
    expect(volume(g.modele, g.occurrence)).toBeCloseTo(36 - 3, 9);
  });

  it("face isolée poussée en négatif → boîte sous la face", () => {
    const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0));
    const m = pousserTirer(r.modele, Object.keys(r.modele.racine.faces)[0] as Id, -1).modele;
    const g = grouper(m, toutes(m.racine));
    expect(volume(g.modele, g.occurrence)).toBeCloseTo(4, 9);
    const pts = Object.values(m.racine.sommets).map((s) => s.position.z);
    expect(Math.min(...pts)).toBeCloseTo(-1, 12);
  });

  it("protubérance : rectangle intérieur tiré vers le haut → face porteuse trouée conservée", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    m = ajouterRectangle(m, v3(1, 1, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const interieure = faces(m.racine).find((f) => f.trous.length === 0) as { id: Id };
    m = pousserTirer(m, interieure.id, 1).modele;
    expect(compter(m.racine).faces).toBe(1 + 4 + 1);
    expect(faces(m.racine).filter((f) => f.trous.length === 1).length).toBe(1);
  });
});

describe("géométrie collante, déplacer, copier", () => {
  it("deux boîtes libres accolées → 31 entités (11 faces, 20 arêtes) : face de contact partagée", () => {
    const m = boite(2);
    const r = copier(m, toutes(m.racine), v3(4, 0, 0));
    const c = r.modele.racine;
    expect(compter(c)).toMatchObject({ faces: 11, aretes: 20, sommets: 12 });
    expect(faces(c).filter((f) => Math.abs(positionsFace(c, f).exterieur.every((p) => Math.abs(p.x - 4) < 1e-9) ? 1 : 0) === 1).length).toBe(1);
  });

  it("réseau x3 → 4 objets au pas de 5 m", () => {
    const m = boite(1, modeleVide(), v3(0, 0, 0), 1, 1);
    const r = copier(m, toutes(m.racine), v3(5, 0, 0), { copies: 3 });
    expect(compter(r.modele.racine)).toMatchObject({ faces: 24, aretes: 48 });
    const xs = Object.values(r.modele.racine.sommets).map((s) => s.position.x);
    expect(Math.max(...xs)).toBeCloseTo(16, 12);
  });

  it("réseau /3 sur 15 m → 3 intervalles de 5 m (4 objets)", () => {
    const m = boite(1, modeleVide(), v3(0, 0, 0), 1, 1);
    const r = copier(m, toutes(m.racine), v3(15, 0, 0), { divisions: 3 });
    expect(compter(r.modele.racine).faces).toBe(24);
    const xs = [...new Set(Object.values(r.modele.racine.sommets).map((s) => Math.round(s.position.x * 1e6) / 1e6))].sort(
      (a, b) => a - b,
    );
    expect(xs).toEqual([0, 1, 5, 6, 10, 11, 15, 16]);
  });

  it("copie d'un cercle → nouvelle courbe distincte, effaçable seule", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 12).modele;
    const r = copier(m, toutes(m.racine), v3(5, 0, 0)).modele;
    expect(Object.keys(r.racine.courbes).length).toBe(2);
    const k = Object.values(r.racine.courbes).find((x) => x.centre.x === 5);
    const e = effacerArete(r, k?.aretes[0] as Id).modele;
    expect(compter(e.racine)).toMatchObject({ aretes: 12, faces: 1 });
  });

  it("déplacer une boîte entière → aucune déformation", () => {
    const m = boite(2);
    const r = deplacer(m, toutes(m.racine), v3(10, 0, 0));
    const g = grouper(r.modele, toutes(r.modele.racine));
    expect(volume(g.modele, g.occurrence)).toBeCloseTo(24, 9);
    expect(r.rapport.crees).toEqual([]);
  });

  it("déplacer l'arête avant du dessus de 1 m en Z → dessus incliné, faces latérales trapèzes", () => {
    let m = boite(2);
    const a = areteEntre(m.racine, v3(0, 0, 2), v3(4, 0, 2));
    m = deplacer(m, [a], v3(0, 0, 1)).modele;
    expect(compter(m.racine).faces).toBe(6);
    const dessus = faces(m.racine).find((f) => f.normale.z > 0.1) as { normale: Vec3 };
    expect(dessus.normale.y).toBeGreaterThan(0); // le dessus descend vers l'arrière
    const g = grouper(m, toutes(m.racine));
    expect(estSolide(g.modele, g.occurrence)).toBe(true);
    expect(volume(g.modele, g.occurrence)).toBeCloseTo(4 * 3 * 2 + (4 * 3 * 1) / 2, 9);
  });

  it("déplacer un sommet de 0,8 m en Z → dessus plié (autofold) en 2 triangles", () => {
    let m = boite(2);
    m = deplacer(m, [sommetEn(m.racine, v3(4, 3, 2))], v3(0, 0, 0.8)).modele;
    expect(compter(m.racine)).toMatchObject({ faces: 7, aretes: 13 });
    const g = grouper(m, toutes(m.racine));
    expect(estSolide(g.modele, g.occurrence)).toBe(true);
  });

  it("tourner une boîte de 90° autour de Z → volume conservé ; copie polaire x5 → 6 boîtes", () => {
    const m = boite(1, modeleVide(), v3(2, 0, 0), 1, 1);
    const r = tourner(m, toutes(m.racine), v3(0, 0, 0), v3(0, 0, 1), Math.PI / 2);
    const xs = Object.values(r.modele.racine.sommets).map((s) => s.position.x);
    expect(Math.max(...xs)).toBeCloseTo(0, 9);
    const p = tourner(m, toutes(m.racine), v3(0, 0, 0), v3(0, 0, 1), Math.PI / 3, { copies: 5 });
    expect(compter(p.modele.racine).faces).toBe(36);
  });

  it("mettre à l'échelle ×2 → volume ×8 ; miroir (facteur −1) garde des normales sortantes", () => {
    const m = boite(2.7);
    const e = mettreAEchelle(m, toutes(m.racine), v3(0, 0, 0), 2).modele;
    const g = grouper(e, toutes(e.racine));
    expect(volume(g.modele, g.occurrence)).toBeCloseTo(32.4 * 8, 9);
    const mi = mettreAEchelle(m, toutes(m.racine), v3(0, 0, 0), v3(-1, 1, 1)).modele;
    const droite = faceDeNormale(mi.racine, v3(-1, 0, 0), (pts) => pts.every((p) => Math.abs(p.x + 4) < 1e-9));
    expect(droite).toBeDefined();
  });

  it("retourner (Flip) en copie → copie miroir collée à l'original", () => {
    const m = boite(2);
    const r = retourner(m, toutes(m.racine), { origine: v3(4, 0, 0), normale: v3(1, 0, 0) }, { copie: true });
    expect(compter(r.modele.racine)).toMatchObject({ faces: 11, aretes: 20 });
  });

  it("décaler une face de 0,3 m vers l'intérieur → anneau + face intérieure, puis encore", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const r = decaler(m, Object.keys(m.racine.faces)[0] as Id, 0.3);
    m = r.modele;
    expect(aires(m)).toEqual([12 - 3.4 * 2.4, 3.4 * 2.4].map((x) => expect.closeTo(x, 9)));
    expect(aire(m, r.face as Id)).toBeCloseTo(3.4 * 2.4, 9);
    const r2 = decaler(m, r.face as Id, 0.3);
    expect(compter(r2.modele.racine).faces).toBe(3);
    expect(aire(r2.modele, r2.face as Id)).toBeCloseTo(2.8 * 1.8, 9);
  });

  it("décaler vers l'extérieur → anneau extérieur", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const r = decaler(m, Object.keys(m.racine.faces)[0] as Id, -0.5);
    expect(aires(r.modele)).toEqual([8, 12].map((x) => expect.closeTo(x, 9)));
  });

  it("inverser une face : normale opposée, matériaux échangés", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const id = Object.keys(m.racine.faces)[0] as Id;
    const r = inverserFace(m, id);
    expect(r.modele.racine.faces[id]?.normale).toEqual(v3(-0, -0, -1));
    expect(r.rapport.modifies).toEqual([id]);
  });
});

describe("groupes et composants", () => {
  it("grouper une boîte : la racine ne contient plus qu'une occurrence", () => {
    const { m, occ } = boiteGroupee();
    expect(compter(m.racine)).toEqual({ sommets: 0, aretes: 0, faces: 0, occurrences: 1 });
    expect(compter(contexte(m, occ))).toMatchObject({ faces: 6, aretes: 12 });
  });

  it("groupe isolé du collage : une boîte libre accolée ne fusionne pas avec lui", () => {
    const { m, occ } = boiteGroupee(2);
    const def = contexte(m, occ);
    const m2 = boite(2, m, v3(4, 0, 0));
    expect(compter(m2.racine)).toMatchObject({ faces: 6, aretes: 12 });
    expect(contexte(m2, occ)).toBe(def);
    // la même boîte libre, après éclatement du groupe, colle : 11 faces
    const e = eclater(m2, occ).modele;
    expect(compter(e.racine)).toMatchObject({ faces: 11, aretes: 20, occurrences: 0 });
    expect(Object.keys(e.definitions)).toEqual([]);
  });

  it("estSolide : faux dès qu'une face manque ou qu'une arête pend", () => {
    const { m, occ } = boiteGroupee();
    const c = contexte(m, occ);
    const a = areteEntre(c, v3(0, 0, 2.7), v3(4, 0, 2.7));
    const sans = effacerArete(m, a, { dans: occ }).modele;
    expect(estSolide(sans, occ)).toBe(false);
    expect(volume(sans, occ)).toBeNull();
    const pend = ajouterSegment(m, v3(0, 0, 2.7), v3(0, 0, 4), { dans: occ }).modele;
    expect(estSolide(pend, occ)).toBe(false);
  });

  it("copie d'un composant : définition partagée, éditer l'un modifie l'autre", () => {
    const m0 = boite(3);
    const g = grouper(m0, toutes(m0.racine), { genre: "composant" });
    const cp = copier(g.modele, [g.occurrence], v3(10, 0, 0));
    const autre = Object.keys(cp.modele.racine.occurrences).find((x) => x !== g.occurrence) as Id;
    expect(nombreOccurrences(cp.modele, g.definition)).toBe(2);
    const dessus = faceDeNormale(contexte(cp.modele, g.occurrence), v3(0, 0, 1));
    const e = pousserTirer(cp.modele, dessus, 1, { dans: g.occurrence }).modele;
    expect(volume(e, autre)).toBeCloseTo(48, 9);
  });

  it("rendre unique : seule l'occurrence rendue unique change", () => {
    const m0 = boite(3);
    const g = grouper(m0, toutes(m0.racine), { genre: "composant", nom: "Component" });
    const cp = copier(g.modele, [g.occurrence], v3(10, 0, 0)).modele;
    const autre = Object.keys(cp.racine.occurrences).find((x) => x !== g.occurrence) as Id;
    const u = rendreUnique(cp, autre).modele;
    expect(u.definitions[u.racine.occurrences[autre]?.definition as Id]?.nom).toBe("Component#1");
    const dessus = faceDeNormale(contexte(u, autre), v3(0, 0, 1));
    const e = pousserTirer(u, dessus, -1.5, { dans: autre }).modele;
    expect(volume(e, autre)).toBeCloseTo(18, 9);
    expect(volume(e, g.occurrence)).toBeCloseTo(36, 9);
  });

  it("groupe partagé par 2 occurrences : l'éditer le rend d'abord unique", () => {
    const { m, occ } = boiteGroupee(3);
    const cp = copier(m, [occ], v3(10, 0, 0)).modele;
    const autre = Object.keys(cp.racine.occurrences).find((x) => x !== occ) as Id;
    const dessus = faceDeNormale(contexte(cp, occ), v3(0, 0, 1));
    const e = pousserTirer(cp, dessus, 1, { dans: occ }).modele;
    expect(volume(e, occ)).toBeCloseTo(48, 9);
    expect(volume(e, autre)).toBeCloseTo(36, 9);
  });

  it("transformation d'occurrence : déplacer et mettre à l'échelle un groupe", () => {
    const { m, occ } = boiteGroupee(2.7);
    const d = deplacer(m, [occ], v3(1, 2, 3)).modele;
    expect(d.racine.occurrences[occ]?.transformation[3]).toBe(1);
    const e = mettreAEchelle(d, [occ], v3(0, 0, 0), 2).modele;
    expect(volume(e, occ)).toBeCloseTo(32.4 * 8, 9);
  });

  it("rapport : grouper crée une définition et une occurrence, supprime la géométrie libre déplacée ailleurs", () => {
    const m = boite();
    const g = grouper(m, toutes(m.racine));
    expect(g.rapport.crees).toContain(g.occurrence);
    expect(g.rapport.crees).toContain(g.definition);
    expect(g.rapport.supprimes).toEqual([]); // mêmes identifiants, désormais dans la définition
  });
});
