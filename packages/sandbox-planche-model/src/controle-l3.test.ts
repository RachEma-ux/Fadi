import { describe, expect, it } from "vitest";
import {
  REGLAGES_CONTROLE_DEFAUT,
  changerReglagesControle,
  compterDefauts,
  constaterCritere,
  controlerSite,
  corrigerDefaut,
  evaluerPieces,
  facesInterieures,
  fusionnerVolumes,
  indiceDefaut,
  lireReglesPieces,
  poserReglesPieces,
  preparerFondDao,
  releverDefauts,
  reglagesControle,
  supprimerFacesInterieures,
} from "./controle-l3.js";
import { type Modele, ajouterSegments, estSolide, grouper, modeleVide } from "./geometrie-libre.js";
import { type Vec3, v3 } from "./vecteur.js";

const boucle = (ps: Vec3[]) => ps.map((p, i) => [p, ps[(i + 1) % ps.length]!] as const);
const face = (m: Modele, ps: Vec3[]) => ajouterSegments(m, boucle(ps)).modele;
const boite = (m: Modele, x0: number, x1: number, avecGauche = true, avecDroite = true): Modele => {
  const v = (x: number, y: number, z: number) => v3(x, y, z);
  let r = m;
  for (const ps of [
    [v(x0, 0, 0), v(x1, 0, 0), v(x1, 3, 0), v(x0, 3, 0)],
    [v(x0, 0, 2.5), v(x1, 0, 2.5), v(x1, 3, 2.5), v(x0, 3, 2.5)],
    [v(x0, 0, 0), v(x1, 0, 0), v(x1, 0, 2.5), v(x0, 0, 2.5)],
    [v(x0, 3, 0), v(x1, 3, 0), v(x1, 3, 2.5), v(x0, 3, 2.5)],
    ...(avecGauche ? [[v(x0, 0, 0), v(x0, 3, 0), v(x0, 3, 2.5), v(x0, 0, 2.5)]] : []),
    ...(avecDroite ? [[v(x1, 0, 0), v(x1, 3, 0), v(x1, 3, 2.5), v(x1, 0, 2.5)]] : []),
  ])
    r = face(r, ps);
  return r;
};

describe("Cas 2, lot 3 : relevé du Contrôle", () => {
  it("modèle vide : aucun défaut ; tolérances d'origine, changées et refusées si négatives", () => {
    const m = modeleVide();
    expect(releverDefauts(m)).toEqual([]);
    expect(reglagesControle(m)).toEqual(REGLAGES_CONTROLE_DEFAUT);
    const m2 = changerReglagesControle(m, { planeite: 1 }).modele;
    expect(reglagesControle(m2).planeite).toBe(1);
    expect(() => changerReglagesControle(m, { confondus: -1 })).toThrow(RangeError);
  });

  it("sommets presque confondus : relevés sous le seuil, soudés en un geste", () => {
    const m = ajouterSegments(modeleVide(), [[v3(0, 0, 0), v3(4, 0, 0)], [v3(4.0006, 0, 0), v3(4, 3, 0)]]).modele;
    const d = releverDefauts(m).filter((x) => x.genre === "confondus");
    expect(d).toHaveLength(1);
    expect(d[0]!.valeur).toBeCloseTo(0.0006, 9);
    const r = corrigerDefaut(m, d[0]!).modele;
    expect(Object.keys(r.racine.sommets)).toHaveLength(3);
    expect(releverDefauts(r).filter((x) => x.genre === "confondus")).toHaveLength(0);
    // Au-delà du seuil : rien.
    const loin = ajouterSegments(modeleVide(), [[v3(0, 0, 0), v3(4, 0, 0)], [v3(4.01, 0, 0), v3(4, 3, 0)]]).modele;
    expect(releverDefauts(loin).filter((x) => x.genre === "confondus")).toHaveLength(0);
  });

  it("angle presque droit : relevé (89,7°), redressé à 90° en gardant la longueur ; un angle droit exact n'est pas relevé", () => {
    const a = (89.7 * Math.PI) / 180;
    const m = face(modeleVide(), [v3(0, 0, 0), v3(4, 0, 0), v3(4 + 3 * Math.cos(a), 3 * Math.sin(a), 0), v3(3 * Math.cos(a), 3 * Math.sin(a), 0)]);
    const d = releverDefauts(m).filter((x) => x.genre === "angle-droit");
    expect(d.length).toBeGreaterThan(0);
    expect(Math.abs(d[0]!.valeur - 90)).toBeCloseTo(0.3, 6);
    const r = corrigerDefaut(m, d[0]!).modele;
    expect(releverDefauts(r).filter((x) => x.genre === "angle-droit").length).toBeLessThan(d.length);
    expect(releverDefauts(face(modeleVide(), [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)])).filter((x) => x.genre === "angle-droit")).toHaveLength(0);
  });

  it("face presque verticale (1,2°) relevée et redressée ; presque horizontale aplanie", () => {
    const e = 3 * Math.tan((1.2 * Math.PI) / 180);
    const m = face(modeleVide(), [v3(0, 0, 0), v3(4, 0, 0), v3(4, e, 3), v3(0, e, 3)]);
    const d = releverDefauts(m).find((x) => x.genre === "presque-verticale")!;
    expect(d.valeur).toBeCloseTo(1.2, 6);
    const r = corrigerDefaut(m, d).modele;
    expect(releverDefauts(r).filter((x) => x.genre === "presque-verticale")).toHaveLength(0);
    const h = face(modeleVide(), [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0.05), v3(0, 3, 0.05)]);
    const dh = releverDefauts(h).find((x) => x.genre === "presque-horizontale")!;
    expect(dh).toBeDefined();
    const rh = corrigerDefaut(h, dh).modele;
    expect(Object.values(rh.racine.sommets).every((s) => Math.abs(s.position.z - 0.025) < 1e-9)).toBe(true);
  });

  it("faces superposées en double sous le seuil ; une est retirée", () => {
    let m = face(modeleVide(), [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)]);
    m = face(m, [v3(0, 0, 0.0004), v3(4, 0, 0.0004), v3(4, 3, 0.0004), v3(0, 3, 0.0004)]);
    const d = releverDefauts(m).filter((x) => x.genre === "face-double");
    expect(d).toHaveLength(1);
    expect(compterDefauts(releverDefauts(m)).superposition).toBe(1);
    const r = corrigerDefaut(m, d[0]!).modele;
    expect(Object.keys(r.racine.faces)).toHaveLength(1);
  });

  it("objets : sans balise, hors objet groupé, éloigné de l'origine", () => {
    let m = face(modeleVide(), [v3(0, 0, 0), v3(1, 0, 0), v3(1, 1, 0), v3(0, 1, 0)]);
    const hors = releverDefauts(m).find((x) => x.genre === "hors-objet")!;
    expect(hors.valeur).toBe(4);
    m = corrigerDefaut(m, hors).modele;
    expect(Object.keys(m.racine.aretes)).toHaveLength(0);
    expect(compterDefauts(releverDefauts(m))).toMatchObject({ sansBalise: 1, horsObjet: 0, eloignee: 0 });
    m = ajouterSegments(m, [[v3(2000, 0, 0), v3(2001, 0, 0)]]).modele;
    const loin = releverDefauts(m).find((x) => x.genre === "eloignee")!;
    expect(loin.valeur).toBeCloseTo(2001, 6);
  });

  it("parcours des défauts en boucle", () => {
    expect(indiceDefaut(0, -1, 1)).toBe(-1);
    expect(indiceDefaut(3, -1, 1)).toBe(0);
    expect(indiceDefaut(3, -1, -1)).toBe(2);
    expect(indiceDefaut(3, 2, 1)).toBe(0);
    expect(indiceDefaut(3, 0, -1)).toBe(2);
  });
});

describe("Cas 2, lot 3 : fond DAO, faces intérieures", () => {
  it("fond DAO : aplati, extrémités soudées, contour fermé en une face", () => {
    const m = ajouterSegments(modeleVide(), [
      [v3(0, 0, 0), v3(4, 0, 0)],
      [v3(4.002, 0, 0), v3(4, 3, 0.35)],
      [v3(4, 3, 0.35), v3(0, 3, 0)],
      [v3(0, 3, 0), v3(0, 0.001, 0)],
    ]).modele;
    expect(Object.keys(m.racine.faces)).toHaveLength(0);
    const r = preparerFondDao(m, { aplatir: true, souder: 0.005, faces: true });
    expect(r.bilan).toEqual({ aplatis: 2, soudures: 2, faces: 1 });
    expect(Object.values(r.modele.racine.sommets).every((s) => s.position.z === 0)).toBe(true);
    const sansFaces = preparerFondDao(m, { aplatir: true, souder: 0.005, faces: false });
    expect(sansFaces.bilan.faces).toBe(0);
    expect(Object.keys(sansFaces.modele.racine.aretes)).toHaveLength(4);
  });

  it("faces intérieures retirées : deux boîtes accolées deviennent une seule boîte", () => {
    let m = boite(modeleVide(), 0, 4, true, true);
    m = boite(m, 4, 8, false, true);
    expect(facesInterieures(m)).toHaveLength(1);
    const r = supprimerFacesInterieures(m);
    expect(r.faces).toBe(1);
    expect(Object.keys(r.modele.racine.faces)).toHaveLength(6);
    expect(Object.keys(r.modele.racine.aretes)).toHaveLength(12);
  });

  it("volumes adjacents fusionnés en un solide fermé ; un seul volume refusé", () => {
    let m = boite(modeleVide(), 0, 4);
    const ga = grouper(m, [...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)]);
    m = boite(ga.modele, 4, 8);
    const libres = [...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)];
    const gb = grouper(m, libres);
    m = gb.modele;
    const r = fusionnerVolumes(m, [ga.occurrence, gb.occurrence]);
    expect(estSolide(r.modele, r.occurrence)).toBe(true);
    expect(Object.keys(r.modele.racine.occurrences)).toEqual([r.occurrence]);
    expect(() => fusionnerVolumes(m, [ga.occurrence])).toThrow(RangeError);
  });
});

describe("Cas 2, lot 3 : pièces du permis et site", () => {
  const fichier = JSON.stringify({
    source: "Fichier d'essai, non contractuel",
    pieces: [
      { code: "PC1", libelle: "Plan de situation", attendus: [{ libelle: "Nord", critere: "nord" }, { libelle: "Repère", critere: "point-de-base" }] },
      { code: "PC2", libelle: "Plan de masse", attendus: [{ libelle: "Cotes", critere: "cotes" }, { libelle: "Inconnu", critere: "critere-inconnu" }] },
    ],
  });

  it("sans fichier : complétude non évaluée ; fichier sans source refusé", () => {
    expect(evaluerPieces(modeleVide(), null)).toBeNull();
    expect(lireReglesPieces("{}", "r.json")).toHaveProperty("erreur");
    expect(lireReglesPieces(JSON.stringify({ pieces: [] }), "r.json")).toHaveProperty("erreur");
    expect(lireReglesPieces("pas du json", "r.json")).toHaveProperty("erreur");
  });

  it("fichier archivé avec le modèle ; critère inconnu « non évaluable »", () => {
    const lu = lireReglesPieces(fichier, "regles.json");
    if (!("regles" in lu)) throw new Error(lu.erreur);
    const m = poserReglesPieces(modeleVide(), lu.regles).modele;
    expect(m.annotations?.reglages?.reglesPieces?.texte).toBe(fichier);
    const b = evaluerPieces(m, null)!;
    expect(b.map((x) => [x.code, x.presents, x.evaluables])).toEqual([["PC1", 0, 2], ["PC2", 0, 1]]);
    expect(b[1]!.attendus[1]!.etat).toBe("non-evaluable");
    expect(evaluerPieces(poserReglesPieces(m, null).modele, null)).toBeNull();
  });

  it("site avant émission : sans site lu, rattachement absent et parcelle non évaluée", () => {
    const lignes = controlerSite(modeleVide(), null);
    expect(lignes.find((l) => l.ligne === "rattache")!.etat).toBe("absent");
    expect(lignes.find((l) => l.ligne === "parcelle")!.etat).toBe("non-evaluable");
    const avec = controlerSite(modeleVide(), { rattache: true, parcelle: true, nord: true, altitude: false });
    expect(avec.map((l) => l.etat)).toEqual(["present", "present", "present", "absent", "absent"]);
    expect(constaterCritere(modeleVide(), "parcelle", null)).toBe("non-evaluable");
  });
});
