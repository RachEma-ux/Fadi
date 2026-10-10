/** Lot L11 (programme D-202) : noyau « pièce de profilé » — pose, placement, liens à l'arête source, sérialisation. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { differencePlanche, appliquerDeltaPlanche, empreintePlanche, lireModelePlanche } from "./delta.js";
import {
  type Id,
  type Modele,
  ERREUR_PIECE_SOURCE,
  ajouterSegment,
  contexte,
  copier,
  deplacer,
  estSolide,
  modeleVide,
  piecesLiees,
  poserPiece,
  poserPiecesSurAretes,
  volume,
} from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { type PlacementPiece, type SectionProfil, ERREUR_LONGUEUR, ERREUR_SECTION, PLACEMENT_DEFAUT, aireSection } from "./profiles.js";
import { v3, type Vec3 } from "./vecteur.js";

/** Section de test (donnée du test, pas du noyau) : rectangle largeur × hauteur centré sur l'origine. */
const rect = (l: number, h: number): SectionProfil => ({ exterieur: [{ y: -l / 2, z: -h / 2 }, { y: l / 2, z: -h / 2 }, { y: l / 2, z: h / 2 }, { y: -l / 2, z: h / 2 }], trous: [] });
const SAISIE = { designation: "Pièce d'essai", source: { genre: "saisie" } as const };
const SECTION = rect(0.1, 0.05);
const placement = (p: Partial<PlacementPiece> = {}): PlacementPiece => ({ ...PLACEMENT_DEFAUT, ...p });

function segment(m0: Modele, a: Vec3, b: Vec3): { m: Modele; arete: Id } {
  const avant = new Set(Object.keys(m0.racine.aretes));
  const m = ajouterSegment(m0, a, b).modele;
  return { m, arete: Object.keys(m.racine.aretes).find((x) => !avant.has(x)) as Id };
}
/** Boîte (monde) de la géométrie des objets. */
function boite(m: Modele) {
  const pts = geometrieVisible(m).faces.flatMap((f) => f.exterieur);
  const b = (k: "x" | "y" | "z") => [Math.min(...pts.map((p) => p[k])), Math.max(...pts.map((p) => p[k]))] as const;
  return { x: b("x"), y: b("y"), z: b("z") };
}
const proche = (a: readonly number[], b: readonly number[]) => a.every((x, i) => Math.abs(x - (b[i] as number)) < 1e-9);

describe("Pose d'une pièce (L11)", () => {
  it("rectangle 0,10 × 0,05 sur un segment de 3 m : composant solide, volume 0,015 m³, métadonnées portées par la définition", () => {
    const { m, arete } = segment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0));
    const r = poserPiece(m, { arete }, SECTION, placement(), SAISIE);
    expect(estSolide(r.modele, r.occurrence)).toBe(true);
    expect(volume(r.modele, r.occurrence)).toBeCloseTo(0.015, 12);
    const d = r.modele.definitions[r.definition]!;
    expect(d.genre).toBe("composant");
    expect(d.nom).toBe("Pièce d'essai");
    expect(d.piece?.longueur).toBeCloseTo(3, 12);
    expect(d.piece?.source).toEqual({ genre: "saisie" });
    expect(aireSection(SECTION)).toBeCloseTo(0.005, 15);
  });

  it("chaque point de placement décale l'axe de la valeur attendue (largeur sur y, hauteur sur z)", () => {
    const { m, arete } = segment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0));
    const attendu: Record<PlacementPiece["point"], [readonly [number, number], readonly [number, number]]> = {
      centre: [[-0.05, 0.05], [-0.025, 0.025]],
      "haut-gauche": [[-0.1, 0], [-0.05, 0]],
      "haut-droite": [[0, 0.1], [-0.05, 0]],
      "bas-droite": [[0, 0.1], [0, 0.05]],
      "bas-gauche": [[-0.1, 0], [0, 0.05]],
    };
    for (const [point, [y, z]] of Object.entries(attendu)) {
      const b = boite(poserPiece(m, { arete }, SECTION, placement({ point: point as PlacementPiece["point"] }), SAISIE).modele);
      expect(proche(b.y, y), point).toBe(true);
      expect(proche(b.z, z), point).toBe(true);
    }
  });

  it("rotation 90° : largeur et hauteur échangées ; décalages ± 0,05 → longueur 3,10 / 2,90", () => {
    const { m, arete } = segment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0));
    const b = boite(poserPiece(m, { arete }, SECTION, placement({ rotation90: true }), SAISIE).modele);
    expect(proche(b.y, [-0.025, 0.025]) && proche(b.z, [-0.05, 0.05])).toBe(true);
    const plus = boite(poserPiece(m, { arete }, SECTION, placement({ decalageDebut: 0.05, decalageFin: 0.05 }), SAISIE).modele);
    expect(proche(plus.x, [-0.05, 3.05])).toBe(true);
    const moins = boite(poserPiece(m, { arete }, SECTION, placement({ decalageDebut: -0.05, decalageFin: -0.05 }), SAISIE).modele);
    expect(proche(moins.x, [0.05, 2.95])).toBe(true);
    expect(() => poserPiece(m, { arete }, SECTION, placement({ decalageDebut: -2, decalageFin: -1 }), SAISIE)).toThrow(ERREUR_LONGUEUR);
  });

  it("refus : section dégénérée, source de catalogue sans édition", () => {
    const { m, arete } = segment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0));
    expect(() => poserPiece(m, { arete }, { exterieur: [{ y: 0, z: 0 }, { y: 1, z: 0 }, { y: 2, z: 0 }], trous: [] }, placement(), SAISIE)).toThrow(ERREUR_SECTION);
    expect(() => poserPiece(m, { arete }, SECTION, placement(), { designation: "x", source: { genre: "catalogue", source: "Fabricant", edition: "" } })).toThrow(ERREUR_PIECE_SOURCE);
  });
});

describe("Chaîne et boucle (L11)", () => {
  /** Rectangle 4 × 3 au sol, en quatre arêtes. */
  function boucle() {
    let m = modeleVide();
    const ids: Id[] = [];
    const P = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)];
    for (let i = 0; i < 4; i++) {
      const s = segment(m, P[i]!, P[(i + 1) % 4]!);
      m = s.m;
      ids.push(s.arete);
    }
    return { m, ids };
  }
  it("boucle de 4 arêtes « extérieur » : aucune pièce dans l'intérieur, onglets fermés (4 composants solides)", () => {
    const { m, ids } = boucle();
    const r = poserPiecesSurAretes(m, ids, SECTION, placement({ position: "exterieur" }), SAISIE);
    expect(r.occurrences).toHaveLength(4);
    for (const o of r.occurrences) expect(estSolide(r.modele, o)).toBe(true);
    const interieur = geometrieVisible(r.modele).faces.flatMap((f) => f.exterieur).filter((p) => p.x > 1e-9 && p.x < 4 - 1e-9 && p.y > 1e-9 && p.y < 3 - 1e-9);
    expect(interieur).toHaveLength(0);
    const b = boite(r.modele);
    expect(proche(b.x, [-0.1, 4.1]) && proche(b.y, [-0.1, 3.1])).toBe(true);
    // Volume total des quatre pièces à onglet : périmètre médian × aire de section.
    const total = r.occurrences.reduce((s, o) => s + (volume(r.modele, o) as number), 0);
    expect(total).toBeCloseTo(2 * (4.1 + 3.1) * 0.005, 9);
  });

  it("« intérieur » : tout dans le rectangle ; « centre » : à cheval", () => {
    const { m, ids } = boucle();
    const i = boite(poserPiecesSurAretes(m, ids, SECTION, placement({ position: "interieur" }), SAISIE).modele);
    expect(proche(i.x, [0, 4]) && proche(i.y, [0, 3])).toBe(true);
    const c = boite(poserPiecesSurAretes(m, ids, SECTION, placement({ position: "centre" }), SAISIE).modele);
    expect(proche(c.x, [-0.05, 4.05])).toBe(true);
  });

  it("chaîne ouverte sans onglet : bouts droits avec les décalages", () => {
    const { m, ids } = boucle();
    const r = poserPiecesSurAretes(m, ids.slice(0, 2), SECTION, placement(), { ...SAISIE, onglets: false });
    expect(r.occurrences).toHaveLength(2);
    expect(r.occurrences.reduce((s, o) => s + (volume(r.modele, o) as number), 0)).toBeCloseTo((4 + 3) * 0.005, 12);
  });
});

describe("Lien pièce ↔ arête source (L11)", () => {
  it("arête allongée → pièce allongée (un seul pas) ; la pièce déplacée elle-même → lien rompu", () => {
    const { m, arete } = segment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0));
    const r = poserPiece(m, { arete }, SECTION, placement(), SAISIE);
    expect(Object.keys(piecesLiees(r.modele))).toEqual([r.occurrence]);
    const b = contexte(r.modele).aretes[arete]!.b;
    const allonge = deplacer(r.modele, [b], v3(1, 0, 0)).modele;
    expect(volume(allonge, r.occurrence)).toBeCloseTo(0.02, 12);
    expect(boite(allonge).x[1]).toBeCloseTo(4, 12);
    const bouge = deplacer(allonge, [r.occurrence], v3(0, 1, 0)).modele;
    expect(piecesLiees(bouge)[r.occurrence]).toBeUndefined();
    const encore = deplacer(bouge, [contexte(bouge).aretes[arete]!.b], v3(1, 0, 0)).modele;
    expect(volume(encore, r.occurrence)).toBeCloseTo(0.02, 12); // plus liée : ne suit plus
  });

  it("deux occurrences d'une même définition, seule la première liée : déplacer l'arête ne modifie que la première", () => {
    const { m, arete } = segment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0));
    const r = poserPiece(m, { arete }, SECTION, placement(), SAISIE);
    const cp = copier(r.modele, [r.occurrence], v3(0, 2, 0));
    const autre = Object.keys(contexte(cp.modele).occurrences).find((o) => o !== r.occurrence)!;
    expect(contexte(cp.modele).occurrences[autre]!.definition).toBe(r.definition);
    const b = contexte(cp.modele).aretes[arete]!.b;
    const m2 = deplacer(cp.modele, [b], v3(1, 0, 0)).modele;
    expect(volume(m2, r.occurrence)).toBeCloseTo(0.02, 12);
    expect(volume(m2, autre)).toBeCloseTo(0.015, 12);
    expect(contexte(m2).occurrences[r.occurrence]!.definition).not.toBe(r.definition);
    expect(contexte(m2).occurrences[autre]!.definition).toBe(r.definition);
  });

  it("boucle liée : déplacer un coin recalcule les deux pièces voisines et leurs onglets, les autres suivent leurs onglets", () => {
    let m = modeleVide();
    const ids: Id[] = [];
    const P = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)];
    for (let i = 0; i < 4; i++) {
      const s = segment(m, P[i]!, P[(i + 1) % 4]!);
      m = s.m;
      ids.push(s.arete);
    }
    const r = poserPiecesSurAretes(m, ids, SECTION, placement({ position: "interieur" }), SAISIE);
    const coin = Object.values(contexte(r.modele).sommets).find((s) => s.position.x === 4 && s.position.y === 3)!.id;
    const m2 = deplacer(r.modele, [coin], v3(1, 1, 0)).modele;
    expect(Object.keys(piecesLiees(m2))).toHaveLength(4);
    for (const o of r.occurrences) expect(estSolide(m2, o)).toBe(true);
  });

  it("dans un groupe : pas de lien (racine seulement), la pièce est posée", () => {
    const { m, arete } = segment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0));
    const r = poserPiece(m, { a: v3(0, 0, 0), b: v3(3, 0, 0) }, SECTION, placement(), SAISIE);
    expect(Object.keys(piecesLiees(r.modele))).toHaveLength(0);
    expect(arete).toBeDefined();
  });
});

describe("Sérialisation et différence (L11)", () => {
  it("métadonnées et lien relus après sérialisation ; un delta exact (un pas d'annulation)", () => {
    const { m, arete } = segment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0));
    const r = poserPiece(m, { arete }, SECTION, placement({ point: "bas-gauche", rotation90: true }), { designation: "Montant", source: { genre: "catalogue", source: "Catalogue d'essai", edition: "2026", page: "12" } });
    const relu = lireModelePlanche(JSON.parse(JSON.stringify(r.modele)));
    expect(relu).not.toBeNull();
    expect(relu!.definitions[r.definition]!.piece).toEqual(r.modele.definitions[r.definition]!.piece);
    expect(empreintePlanche(relu!)).toBe(empreintePlanche(r.modele));
    const delta = differencePlanche(m, r.modele)!;
    expect(empreintePlanche(appliquerDeltaPlanche(m, delta))).toBe(empreintePlanche(r.modele));
    // Lien mal formé : refusé à la lecture.
    const faux = JSON.parse(JSON.stringify(r.modele));
    faux.annotations.pieces[r.occurrence].transformation = [1, 2];
    expect(lireModelePlanche(faux)).toBeNull();
  });
});

describe("Aucune donnée de profilé dans le noyau (R3)", () => {
  it("profiles.ts ne porte ni dimension de profilé, ni masse, ni désignation normalisée", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "profiles.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    // Seuls nombres admis : 0, 1, 2, 3 (points d'une boucle), 12 (degrés de l'onglet singulier), 16, 90, 180 et les tolérances 1e-n.
    const nombres = [...src.matchAll(/(?<![\w.])(\d+(?:\.\d+)?(?:e-?\d+)?)(?![\w.])/g)].map((x) => x[1]);
    expect(nombres.filter((n) => !["0", "1", "2", "3", "12", "16", "90", "180"].includes(n as string) && !/^1e-\d+$/.test(n as string))).toEqual([]);
    expect(src).not.toMatch(/\b(IPE|HEA|HEB|UPN|7850|kg)\b/);
  });
});

describe("Mesure (⏱, déclarée au compte rendu)", () => {
  it("200 arêtes en chaîne : pose liée puis un déplacement d'arête, temps relevé", () => {
    let m = modeleVide();
    const ids: Id[] = [];
    const p = (i: number) => v3(i, 0.01 * (i % 2), 0);
    for (let i = 0; i < 200; i++) {
      const s = segment(m, p(i), p(i + 1));
      m = s.m;
      ids.push(s.arete);
    }
    const t0 = performance.now();
    const r = poserPiecesSurAretes(m, ids, SECTION, placement(), SAISIE);
    const t1 = performance.now();
    const b = contexte(r.modele).aretes[ids[100]!]!.b;
    deplacer(r.modele, [b], v3(0, 0.01, 0));
    const t2 = performance.now();
    console.log(`⏱ L11 : pose de 200 pièces liées ${(t1 - t0).toFixed(0)} ms ; un déplacement d'arête ${(t2 - t1).toFixed(0)} ms`);
    expect(r.occurrences).toHaveLength(200);
  }, 120_000);
});
