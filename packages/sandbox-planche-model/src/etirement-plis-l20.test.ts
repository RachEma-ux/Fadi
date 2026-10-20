/**
 * Lot L20 (cahier V1 EX-PT-03 complet ; cas P-05, P-06, P-07) : Étirement à plis — triangulation contrainte des
 * faces voisines qui ne restent pas planes (concavités et trous gardés), arêtes de pli, refus atomique.
 */
import { describe, expect, it } from "vitest";
import {
  type Id,
  type Modele,
  ERREUR_PLI_TRIANGULATION,
  ajouterRectangle,
  ajouterSegment,
  aire,
  contexte,
  copier,
  etirerFace,
  grouper,
  instancesEditees,
  modeleVide,
  mettreAEchelle,
  nombreInstances,
  nombreOccurrences,
  pousserTirer,
  segmentCoupeTriangle,
} from "./geometrie-libre.js";
import { codeDe } from "./diagnostics.js";
import { triangulerFace } from "./maillage.js";
import { type Vec3, dot, v3 } from "./vecteur.js";

const faces = (m: Modele) => Object.values(contexte(m).faces);
/** Aire projetée sur le sol (|n·z| × aire) : une face pliée garde l'emprise de la face d'origine. */
const emprise = (m: Modele, ids: readonly Id[]) => ids.reduce((s, f) => s + aire(m, f) * Math.abs(contexte(m).faces[f]!.normale.z), 0);
const plane = (m: Modele, f: Id): boolean => {
  const c = contexte(m);
  const F = c.faces[f]!;
  const pts = [F.exterieur, ...F.trous].flat().map((s) => c.sommets[s]!.position);
  const d = dot(F.normale, pts[0] as Vec3);
  return pts.every((p) => Math.abs(dot(F.normale, p) - d) < 1e-9);
};

/** Carré 4 × 4 au sol percé d'un carré 1 × 1 en (1,5 ; 1,5) : la face intérieure est une face à part. */
function anneau() {
  let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 4, 0)).modele;
  m = ajouterRectangle(m, v3(1.5, 1.5, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  const percee = faces(m).find((f) => f.trous.length === 1)!.id;
  const interieure = faces(m).find((f) => f.trous.length === 0)!.id;
  return { m, percee, interieure };
}

/** L au sol (concave : 4 × 4 moins le carré [2 ; 4]²) percé d'un carré 1 × 1 en (0,5 ; 0,5). */
function lPerce() {
  let m = modeleVide();
  const L = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 2, 0), v3(2, 2, 0), v3(2, 4, 0), v3(0, 4, 0)];
  for (let i = 0; i < L.length; i++) m = ajouterSegment(m, L[i] as Vec3, L[(i + 1) % L.length] as Vec3).modele;
  m = ajouterRectangle(m, v3(0.5, 0.5, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  const percee = faces(m).find((f) => f.trous.length === 1)!.id;
  const interieure = faces(m).find((f) => f.trous.length === 0)!.id;
  return { m, percee, interieure };
}

describe("L20 — Étirement à plis (EX-PT-03)", () => {
  it("P-07 : voisine percée — le trou reste, la voisine est pliée en facettes planes, emprise et ouverture gardées", () => {
    const { m, interieure } = anneau();
    const r = etirerFace(m, interieure, 0.5).modele;
    const c = contexte(r);
    // La face étirée a monté (ou descendu) de 0,5 le long de sa normale ; elle reste intacte.
    expect(c.faces[interieure]).toBeDefined();
    const autres = faces(r).filter((f) => f.id !== interieure);
    expect(autres.length).toBeGreaterThan(1);
    for (const f of autres) expect(plane(r, f.id)).toBe(true);
    // Emprise au sol de la voisine pliée : 16 − 1 = 15 m² ; rien ne bouche l'ouverture (la face étirée la couvre seule).
    expect(emprise(r, autres.map((f) => f.id))).toBeCloseTo(15, 9);
    // Des arêtes de pli ont été créées entre les facettes.
    expect(Object.keys(c.aretes).length).toBeGreaterThan(Object.keys(contexte(m).aretes).length);
  });

  it("P-06 : voisine concave (L) percée — triangulation contrainte : les facettes restent dans la région d'origine", () => {
    const { m, interieure } = lPerce();
    const r = etirerFace(m, interieure, 0.3).modele;
    const autres = faces(r).filter((f) => f.id !== interieure);
    for (const f of autres) expect(plane(r, f.id)).toBe(true);
    // L = 12 m², moins le trou de 1 m² : un éventail traverserait l'angle rentrant et changerait l'emprise.
    expect(emprise(r, autres.map((f) => f.id))).toBeCloseTo(11, 9);
  });

  it("P-05 : tronc de pyramide — le dessus étiré déforme les flancs inclinés, sans ceinture verticale ajoutée", () => {
    const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
    const bas = Object.keys(sol.racine.faces)[0] as Id;
    const boite = pousserTirer(sol, bas, sol.racine.faces[bas]!.normale.z > 0 ? 1 : -1).modele;
    const haut = faces(boite).find((f) => Math.abs(contexte(boite).sommets[f.exterieur[0] as Id]!.position.z) > 0.5 && Math.abs(f.normale.z) > 0.9)!.id;
    const z = contexte(boite).sommets[contexte(boite).faces[haut]!.exterieur[0] as Id]!.position.z;
    const tronc = mettreAEchelle(boite, [haut], v3(1, 1, z), v3(0.5, 0.5, 1)).modele;
    expect(faces(tronc)).toHaveLength(6);
    const r = etirerFace(tronc, haut, 0.5).modele;
    // Six faces encore (aucune ceinture verticale) ; les flancs sont toujours plans mais plus raides qu'avant.
    expect(faces(r)).toHaveLength(6);
    for (const f of faces(r)) expect(plane(r, f.id)).toBe(true);
    const flancAvant = faces(tronc).find((f) => f.normale.y < -0.1)!;
    const flancApres = faces(r).find((f) => f.id === flancAvant.id)!;
    expect(Math.abs(flancApres.normale.z)).toBeLessThan(Math.abs(flancAvant.normale.z));
  });

  it("triangulation stricte (revue de #133) : un contour croisé n'est pas fini en éventail — [] en strict, secours d'affichage sinon", () => {
    const pentagramme = [0, 1, 2, 3, 4].map((i) => {
      const a = Math.PI / 2 + (i * 4 * Math.PI) / 5;
      return v3(Math.cos(a), Math.sin(a), 0);
    });
    const croise = [v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0), v3(2, 2, 0)];
    const signe = (pts: readonly Vec3[], t: readonly number[], k: number) => {
      const [a, b, c] = [pts[t[k]!]!, pts[t[k + 1]!]!, pts[t[k + 2]!]!];
      return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    };
    for (const pts of [pentagramme, croise]) {
      const secours = triangulerFace(pts, [], v3(0, 0, 1));
      expect(secours.length).toBeGreaterThan(0);
      // L'affichage tolère un triangle retourné ; la somme des aires signées, elle, « télescope » et ne le voit pas.
      expect([0, 3, 6].filter((k) => k < secours.length).some((k) => signe(pts, secours, k) < 0)).toBe(true);
      expect(triangulerFace(pts, [], v3(0, 0, 1), { strict: true })).toEqual([]);
    }
    // Un vrai polygone (L concave percé) se triangule pareil dans les deux modes.
    const L = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 2, 0), v3(2, 2, 0), v3(2, 4, 0), v3(0, 4, 0)];
    const trou = [v3(0.5, 0.5, 0), v3(0.5, 1.5, 0), v3(1.5, 1.5, 0), v3(1.5, 0.5, 0)];
    expect(triangulerFace(L, [trou], v3(0, 0, 1), { strict: true })).toEqual(triangulerFace(L, [trou], v3(0, 0, 1)));
  });

  it("voisine au contour croisé : le pli est refusé (EX_PROFILE_INVALID) au lieu de produire des facettes hors de la face (revue de #133)", () => {
    // Carré f90 (normale +z) et voisine f91 au contour croisé (0,0)(3,0)(3,1)(0,3)(0,2)(3,2), d'aire signée non nulle.
    const S = (id: string, x: number, y: number) => [id, { id, position: v3(x, y, 0) }] as const;
    const A = (id: string, a: string, b: string) => [id, { id, a, b }] as const;
    const m0 = modeleVide();
    const m: Modele = {
      ...m0,
      racine: {
        ...m0.racine,
        sommets: Object.fromEntries([S("s90", 0, 0), S("s91", 3, 0), S("s92", 3, -3), S("s93", 0, -3), S("s94", 3, 1), S("s95", 0, 3), S("s96", 0, 2), S("s97", 3, 2)]),
        aretes: Object.fromEntries([A("a90", "s90", "s93"), A("a91", "s93", "s92"), A("a92", "s92", "s91"), A("a93", "s91", "s90"), A("a94", "s91", "s94"), A("a95", "s94", "s95"), A("a96", "s95", "s96"), A("a97", "s96", "s97"), A("a98", "s97", "s90")]),
        faces: {
          f90: { id: "f90", exterieur: ["s90", "s93", "s92", "s91"], trous: [], normale: v3(0, 0, 1) },
          f91: { id: "f91", exterieur: ["s90", "s91", "s94", "s95", "s96", "s97"], trous: [], normale: v3(0, 0, 1) },
        },
      },
    };
    let erreur: unknown = null;
    try {
      etirerFace(m, "f90", 0.5);
    } catch (e) {
      erreur = e;
    }
    expect((erreur as Error)?.message).toBe(ERREUR_PLI_TRIANGULATION);
    expect(codeDe(erreur)).toBe("EX_PROFILE_INVALID");
  });

  it("refus atomique : un recoupement de pli est détecté (segment qui traverse un triangle) ; extrémités et contact exclus", () => {
    const a = v3(0, 0, 0), b = v3(1, 0, 0), c = v3(0, 1, 0);
    expect(segmentCoupeTriangle(v3(0.2, 0.2, -1), v3(0.2, 0.2, 1), a, b, c)).toBe(true);
    expect(segmentCoupeTriangle(v3(0.2, 0.2, 0), v3(0.2, 0.2, 1), a, b, c)).toBe(false);
    expect(segmentCoupeTriangle(v3(2, 2, -1), v3(2, 2, 1), a, b, c)).toBe(false);
  });
});

describe("L20 — le pli ne franchit pas le contexte ; composant partagé annoncé", () => {
  it("étirement dans un composant à deux occurrences : opération faite dans sa définition, avertissement affiché", async () => {
    const { copier, grouper } = await import("./geometrie-libre.js");
    const { machinePousserTirer } = await import("./outils/pousser-tirer.js");
    const { clicVers, saisie } = await import("./outils/essais-modification.js");
    const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const bas = Object.keys(sol.racine.faces)[0] as Id;
    const boite = pousserTirer(sol, bas, sol.racine.faces[bas]!.normale.z > 0 ? 1 : -1).modele;
    const g = grouper(boite, [...Object.keys(boite.racine.faces), ...Object.keys(boite.racine.aretes)], { genre: "composant" });
    const m = copier(g.modele, [g.occurrence], v3(3, 0, 0), { copies: 1 }).modele;
    const dans = g.occurrence;
    let etat = machinePousserTirer.configurer!(machinePousserTirer.initial(), "face", "etirement", { modele: m, selection: [], separateurDecimal: "," }).etat;
    let modele = m;
    for (const ev of [clicVers(v3(0.5, 0.5, 1), v3(0, 0, 1)), saisie("0,5")]) {
      const t = machinePousserTirer.traiter(etat, ev, { modele, selection: [], separateurDecimal: ",", dans });
      etat = t.etat;
      if (t.modele) modele = t.modele;
    }
    expect(modele).not.toBe(m);
    expect(etat.erreur).toBe("Composant partagé : l'étirement s'applique à ses 2 occurrences.");
    // La racine n'a pas reçu de géométrie : tout est resté dans la définition partagée.
    expect(Object.keys(modele.racine.faces)).toHaveLength(0);
  });

  /** Boîte 1 × 1 × 1 à la racine. */
  const boite = () => {
    const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const bas = Object.keys(sol.racine.faces)[0] as Id;
    return pousserTirer(sol, bas, sol.racine.faces[bas]!.normale.z > 0 ? 1 : -1).modele;
  };
  const tout = (m: Modele) => [...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)];
  const nouvelleOccurrence = (crees: readonly Id[]) => crees.find((id) => id.startsWith("o")) as Id;

  it("instances effectives (revue de #133) : composant posé deux fois dans un composant posé trois fois → 6, pas 2", () => {
    const c = grouper(boite(), tout(boite()), { genre: "composant" });
    const copie = copier(c.modele, [c.occurrence], v3(3, 0, 0), { copies: 1 });
    const c2 = nouvelleOccurrence(copie.rapport.crees);
    const p = grouper(copie.modele, [c.occurrence, c2], { genre: "composant" });
    const m = copier(p.modele, [p.occurrence], v3(0, 10, 0), { copies: 2 }).modele;
    expect(nombreOccurrences(m, c.definition)).toBe(2);
    expect(nombreInstances(m, c.definition)).toBe(6);
    expect(nombreInstances(m, p.definition)).toBe(3);
    const cDans = Object.keys(contexte(m, p.occurrence).occurrences)[0] as Id;
    expect(instancesEditees(m, cDans)).toBe(6);
    expect(instancesEditees(m, p.occurrence)).toBe(3);
    expect(instancesEditees(m, undefined)).toBe(0);
  });

  it("instances effectives : un groupe partagé est rendu unique par l'édition (1 à la racine) ; dans un composant posé trois fois, 3", () => {
    const g = grouper(boite(), tout(boite()));
    const copie = copier(g.modele, [g.occurrence], v3(3, 0, 0), { copies: 1 });
    const g2 = nouvelleOccurrence(copie.rapport.crees);
    expect(nombreOccurrences(copie.modele, g.definition)).toBe(2);
    expect(instancesEditees(copie.modele, g.occurrence)).toBe(1);
    const p = grouper(copie.modele, [g.occurrence, g2], { genre: "composant" });
    const m = copier(p.modele, [p.occurrence], v3(0, 10, 0), { copies: 2 }).modele;
    const gDans = Object.keys(contexte(m, p.occurrence).occurrences)[0] as Id;
    expect(instancesEditees(m, gDans)).toBe(3);
  });

  it("étirement dans un groupe partagé : aucun avertissement, l'autre copie reste intacte (rendue unique par l'opération)", async () => {
    const { machinePousserTirer } = await import("./outils/pousser-tirer.js");
    const { clicVers, saisie } = await import("./outils/essais-modification.js");
    const g = grouper(boite(), tout(boite()));
    const copie = copier(g.modele, [g.occurrence], v3(3, 0, 0), { copies: 1 });
    const g2 = nouvelleOccurrence(copie.rapport.crees);
    const m = copie.modele;
    const dans = g.occurrence;
    let etat = machinePousserTirer.configurer!(machinePousserTirer.initial(), "face", "etirement", { modele: m, selection: [], separateurDecimal: "," }).etat;
    let modele = m;
    for (const ev of [clicVers(v3(0.5, 0.5, 1), v3(0, 0, 1)), saisie("0,5")]) {
      const t = machinePousserTirer.traiter(etat, ev, { modele, selection: [], separateurDecimal: ",", dans });
      etat = t.etat;
      if (t.modele) modele = t.modele;
    }
    expect(modele).not.toBe(m);
    expect(etat.erreur).toBeNull();
    const hauteur = (occ: Id) => Math.max(...Object.values(contexte(modele, occ).sommets).map((s) => s.position.z));
    expect(modele.racine.occurrences[dans]!.definition).not.toBe(modele.racine.occurrences[g2]!.definition);
    expect(hauteur(dans)).toBeCloseTo(1.5, 9);
    expect(hauteur(g2)).toBeCloseTo(1, 9);
  });
});
