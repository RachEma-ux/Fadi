/**
 * Chantier Axes, lot AX-4 (concept Axes 1.0, § 7 ; scénarios AX10 à AX12 ; décision AX-D8) : origine et axes d'un
 * composant — aucun sommet ne bouge dans le monde, portée exacte, refus explicites et atomiques, lot en un pas.
 */
import { describe, expect, it } from "vitest";
import { type Contexte, type Matrice4, type Modele, IDENTITE, ajouterRectangle, appliquer, composer, grouper, modeleVide, pousserTirer } from "./geometrie-libre.js";
import { ANCRAGES, ANCRAGE_CENTRE_BASE, apercuOrigine, boiteLocale, changerOrigine, changerOrigineLot, natureTransformation, pointAncrage } from "./origine-composant.js";
import { REPERE_DU_MODELE, pivoterRepere } from "./reperes.js";
import { type Vec3, len, sub, v3 } from "./vecteur.js";

/** Bloc 2 × 1 × 0,5 m en composant, coin à (1 ; 1 ; 0). */
function composant(): { m: Modele; occ: string; def: string } {
  const r = ajouterRectangle(modeleVide(), v3(1, 1, 0), v3(2, 0, 0), v3(0, 1, 0));
  const face = Object.keys(r.modele.racine.faces)[0]!;
  const p = pousserTirer(r.modele, face, 0.5).modele;
  const g = grouper(p, [...Object.keys(p.racine.faces), ...Object.keys(p.racine.aretes)], { genre: "composant", nom: "Bloc" });
  const occ = Object.keys(g.modele.racine.occurrences)[0]!;
  return { m: g.modele, occ, def: g.modele.racine.occurrences[occ]!.definition };
}

/** Ajoute à la racine une occurrence de `def` avec la transformation donnée. */
function avecOccurrence(m: Modele, id: string, def: string, T: Matrice4, extra: Record<string, unknown> = {}): Modele {
  const racine: Contexte = { ...m.racine, occurrences: { ...m.racine.occurrences, [id]: { id, definition: def, transformation: T, ...extra } } };
  return { ...m, racine };
}
const translation = (x: number, y: number, z: number): Matrice4 => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
const rotationZ = (a: number, t: Vec3 = v3(0, 0, 0)): Matrice4 => [Math.cos(a), -Math.sin(a), 0, t.x, Math.sin(a), Math.cos(a), 0, t.y, 0, 0, 1, t.z, 0, 0, 0, 1];

/** Tous les sommets dans le monde, par occurrence (clé = chemin), triés. */
function monde(m: Modele): Map<string, Vec3[]> {
  const r = new Map<string, Vec3[]>();
  const parcourir = (c: Contexte, M: Matrice4, chemin: string) => {
    r.set(chemin, Object.values(c.sommets).map((s) => appliquer(M, s.position)).sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z));
    for (const o of Object.values(c.occurrences)) {
      const d = m.definitions[o.definition];
      if (d) parcourir(d.contenu, composer(M, o.transformation), `${chemin}/${o.id}`);
    }
  };
  parcourir(m.racine, IDENTITE, "");
  return r;
}
function memeMonde(a: Modele, b: Modele, tol = 1e-9): void {
  const A = monde(a);
  const B = monde(b);
  expect([...B.keys()].sort()).toEqual([...A.keys()].sort());
  for (const [k, pts] of A) {
    const q = B.get(k)!;
    expect(q.length, k).toBe(pts.length);
    pts.forEach((p, i) => expect(len(sub(p, q[i]!)), `${k} #${i}`).toBeLessThanOrEqual(tol));
  }
}

describe("AX-4 — ancrages de la boîte locale", () => {
  it("27 ancrages distincts ; centre de la base et centre de la boîte (jamais « centre de masse »)", () => {
    expect(ANCRAGES).toHaveLength(27);
    expect(new Set(ANCRAGES.map((a) => `${a.x}${a.y}${a.z}`)).size).toBe(27);
    const { m, def } = composant();
    const b = boiteLocale(m, def)!;
    expect(pointAncrage(b, ANCRAGE_CENTRE_BASE)).toEqual(v3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.min.z));
  });
});

describe("AX10 — origine d'un composant avec des occurrences sœurs non sélectionnées", () => {
  it("portée « toutes » : aperçu exact (3 occurrences), chaque ancrage laisse tout le monde immobile, un seul pas", () => {
    const c = composant();
    let m = avecOccurrence(c.m, "o2", c.def, translation(10, 0, 0));
    m = avecOccurrence(m, "o3", c.def, rotationZ(0.7, v3(-5, 4, 2)));
    for (const ancrage of ANCRAGES) {
      const a = apercuOrigine(m, c.occ, { origine: { genre: "ancrage", ancrage }, orientation: { genre: "garder" }, portee: "toutes" });
      expect(a.ok).toBe(true);
      if (!a.ok) continue;
      expect(a.apercu).toMatchObject({ occurrences: 3, touchees: 3, rendreUnique: false });
      const r = changerOrigine(m, c.occ, { origine: { genre: "ancrage", ancrage }, orientation: { genre: "garder" }, portee: "toutes" });
      expect(r.ok).toBe(true);
      if (r.ok) memeMonde(m, r.modele);
    }
  });

  it("l'origine monde annoncée est bien l'ancrage, et devient la translation de l'occurrence", () => {
    const c = composant();
    const r = changerOrigine(c.m, c.occ, { origine: { genre: "ancrage", ancrage: ANCRAGE_CENTRE_BASE }, orientation: { genre: "garder" }, portee: "toutes" });
    if (!r.ok) throw new Error(r.motif);
    const T = r.modele.racine.occurrences[c.occ]!.transformation;
    expect(v3(T[3]!, T[7]!, T[11]!)).toEqual(r.apercus[0]!.origineMonde);
    expect(r.apercus[0]!.origineMonde).toEqual(v3(2, 1.5, 0));
    // La boîte locale part désormais de l'origine : z min = 0, centrée en x et y.
    const b = boiteLocale(r.modele, c.def)!;
    expect(b.min.z).toBeCloseTo(0, 12);
    expect(b.min.x + b.max.x).toBeCloseTo(0, 12);
  });

  it("portée « cette occurrence » : rendue unique d'abord, les sœurs gardent leur définition et leur transformation", () => {
    const c = composant();
    const m = avecOccurrence(c.m, "o2", c.def, translation(10, 0, 0));
    const r = changerOrigine(m, c.occ, { origine: { genre: "local", point: v3(2, 1, 0) }, orientation: { genre: "garder" }, portee: "occurrence" });
    if (!r.ok) throw new Error(r.motif);
    expect(r.apercus[0]!.rendreUnique).toBe(true);
    expect(r.modele.racine.occurrences[c.occ]!.definition).not.toBe(c.def);
    expect(r.modele.racine.occurrences["o2"]).toEqual(m.racine.occurrences["o2"]);
    expect(r.modele.definitions[c.def]).toEqual(m.definitions[c.def]);
    memeMonde(m, r.modele);
  });

  it("orientation alignée sur le repère de travail (pivoté de 30°) : axes monde = ceux du repère, monde immobile", () => {
    const c = composant();
    const rep = pivoterRepere(REPERE_DU_MODELE, "z", "local", Math.PI / 6);
    if (!rep.ok) throw new Error();
    const opts = { origine: { genre: "monde" as const, point: v3(1, 1, 0) }, orientation: { genre: "repere" as const, repere: rep.repere }, portee: "toutes" as const };
    const a = apercuOrigine(c.m, c.occ, opts);
    if (!a.ok) throw new Error(a.motif);
    expect(len(sub(a.apercu.axesMonde.x, rep.repere.x))).toBeLessThan(1e-9);
    const r = changerOrigine(c.m, c.occ, opts);
    if (!r.ok) throw new Error(r.motif);
    memeMonde(c.m, r.modele);
  });
});

describe("AX11 — imbriqués, miroirs, échelles", () => {
  it("composant imbriqué dans un groupe tourné : supporté, monde immobile", () => {
    const c = composant();
    const g = grouper(c.m, [c.occ], { nom: "Groupe" });
    const gid = Object.keys(g.modele.racine.occurrences)[0]!;
    const tourne = { ...g.modele, racine: { ...g.modele.racine, occurrences: { [gid]: { ...g.modele.racine.occurrences[gid]!, transformation: rotationZ(1.1, v3(3, -2, 1)) } } } };
    const r = changerOrigine(tourne, c.occ, { origine: { genre: "ancrage", ancrage: ANCRAGE_CENTRE_BASE }, orientation: { genre: "garder" }, portee: "toutes" });
    if (!r.ok) throw new Error(r.motif);
    memeMonde(tourne, r.modele);
  });

  it("échelle uniforme : supportée ; miroir et échelle non uniforme : refus expliqué, modèle inchangé", () => {
    const c = composant();
    const uniforme = avecOccurrence(c.m, "u", c.def, [2, 0, 0, 1, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]);
    const ru = changerOrigine(uniforme, "u", { origine: { genre: "ancrage", ancrage: ANCRAGE_CENTRE_BASE }, orientation: { genre: "garder" }, portee: "occurrence" });
    if (!ru.ok) throw new Error(ru.motif);
    memeMonde(uniforme, ru.modele);
    const miroir = avecOccurrence(c.m, "mi", c.def, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(natureTransformation(miroir.racine.occurrences["mi"]!.transformation)).toBe("miroir");
    expect(changerOrigine(miroir, "mi", { origine: { genre: "ancrage", ancrage: ANCRAGE_CENTRE_BASE }, orientation: { genre: "garder" }, portee: "occurrence" })).toMatchObject({ ok: false, motif: expect.stringMatching(/réfléchie/) });
    const biais = avecOccurrence(c.m, "bi", c.def, [1, 0.5, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(changerOrigine(biais, "bi", { origine: { genre: "ancrage", ancrage: ANCRAGE_CENTRE_BASE }, orientation: { genre: "garder" }, portee: "occurrence" })).toMatchObject({ ok: false, motif: expect.stringMatching(/déformée/) });
    const etire = avecOccurrence(c.m, "et", c.def, [1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(natureTransformation(etire.racine.occurrences["et"]!.transformation)).toBe("biais");
  });

  it("une occurrence sœur verrouillée bloque la portée « toutes » ; « cette occurrence » reste possible", () => {
    const c = composant();
    const m = avecOccurrence(c.m, "v", c.def, translation(5, 0, 0), { verrouille: true });
    expect(changerOrigine(m, c.occ, { origine: { genre: "ancrage", ancrage: ANCRAGE_CENTRE_BASE }, orientation: { genre: "garder" }, portee: "toutes" })).toMatchObject({ ok: false, motif: expect.stringMatching(/verrouillée/) });
    expect(changerOrigine(m, c.occ, { origine: { genre: "ancrage", ancrage: ANCRAGE_CENTRE_BASE }, orientation: { genre: "garder" }, portee: "occurrence" }).ok).toBe(true);
  });
});

describe("AX12 — lot : aperçu, écartés, un seul pas", () => {
  it("éligibles et écartés avec motif ; définition partagée traitée une fois ; aucun éligible → rien de modifié", () => {
    const c = composant();
    let m = avecOccurrence(c.m, "o2", c.def, translation(10, 0, 0));
    m = avecOccurrence(m, "mi", c.def, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const { apercu, resultat } = changerOrigineLot(m, [c.occ, "o2", "mi"], { origine: { genre: "ancrage", ancrage: ANCRAGE_CENTRE_BASE }, orientation: { genre: "garder" }, portee: "toutes" });
    expect(apercu.eligibles.map((e) => e.occurrence)).toEqual([c.occ]);
    expect(apercu.ecartes).toEqual([{ occurrence: "mi", motif: expect.stringMatching(/réfléchie/) }]);
    expect(apercu.definitions).toEqual([c.def]);
    if (!resultat.ok) throw new Error(resultat.motif);
    memeMonde(m, resultat.modele);
    const rien = changerOrigineLot(m, ["mi"], { origine: { genre: "ancrage", ancrage: ANCRAGE_CENTRE_BASE }, orientation: { genre: "garder" }, portee: "toutes" });
    expect(rien.resultat.ok).toBe(false);
  });
});
